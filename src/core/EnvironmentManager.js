const fs = require('fs-extra');
const path = require('path');

class EnvironmentManager {
    constructor() {
        this.envPath = path.join(process.cwd(), '.env');
        this.systemEnvPath = path.join(process.cwd(), '.env.system');
        this.userConfig = new Map();
        this.systemConfig = new Map();
        this.isInitialized = false;
    }

    async initialize() {
        try {
            console.log('🔧 Initializing environment manager...');

            // Ensure environment files exist
            await this.ensureEnvironmentFiles();

            // Load configurations
            await this.loadEnvironments();

            // Apply to process.env
            this.applyToProcessEnv();

            this.isInitialized = true;
            console.log('✅ Environment manager initialized');

        } catch (error) {
            console.error('❌ Failed to initialize environment manager:', error);
            throw error;
        }
    }

    async ensureEnvironmentFiles() {
        // Create user .env if it doesn't exist
        if (!await fs.pathExists(this.envPath)) {
            const defaultUserEnv = `# MATDEV Bot - User Configuration
# This file is automatically created and managed by the bot
NODE_ENV=development
ENABLE_WEB_INTERFACE=false
AUTO_RELOAD_PLUGINS=true
ENABLE_MEDIA_DOWNLOAD=true
ENABLE_MESSAGE_ARCHIVE=true
MAX_MEDIA_SIZE=52428800
MAX_MESSAGE_CACHE=1000
PLUGIN_TIMEOUT=10000
WEB_PORT=5000
WEB_HOST=0.0.0.0
`;
            await fs.writeFile(this.envPath, defaultUserEnv);
            console.log('📝 Created default .env file');
        }

        // Create system .env if it doesn't exist
        if (!await fs.pathExists(this.systemEnvPath)) {
            const defaultSystemEnv = `# MATDEV Bot - System Configuration
# Session-specific variables (automatically managed)
WHATSAPP_SESSION_ID=
OWNER_JID=
AUTH_METHOD=
PHONE_NUMBER=
SESSION_DIR=
`;
            await fs.writeFile(this.systemEnvPath, defaultSystemEnv);
            console.log('📝 Created default .env.system file');
        }
    }

    async loadEnvironments() {
        // Load user configuration
        const userEnvContent = await fs.readFile(this.envPath, 'utf8');
        this.parseEnvContent(userEnvContent, this.userConfig);

        // Load system configuration
        const systemEnvContent = await fs.readFile(this.systemEnvPath, 'utf8');
        this.parseEnvContent(systemEnvContent, this.systemConfig);
    }

    parseEnvContent(content, configMap) {
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            const equalIndex = trimmed.indexOf('=');
            if (equalIndex > 0) {
                const key = trimmed.substring(0, equalIndex).trim();
                const value = trimmed.substring(equalIndex + 1).trim();
                
                // Remove quotes if present
                const unquotedValue = value.replace(/^["']|["']$/g, '');
                configMap.set(key, unquotedValue);
            }
        }
    }

    applyToProcessEnv() {
        // Apply system config first (lower priority)
        for (const [key, value] of this.systemConfig) {
            if (!process.env[key]) {
                process.env[key] = value;
            }
        }

        // Apply user config second (higher priority)
        for (const [key, value] of this.userConfig) {
            process.env[key] = value;
        }
    }

    async setUserConfig(key, value) {
        this.userConfig.set(key, value);
        process.env[key] = value;
        await this.saveUserConfig();
    }

    async setSystemConfig(key, value) {
        this.systemConfig.set(key, value);
        process.env[key] = value;
        await this.saveSystemConfig();
    }

    getUserConfig(key, defaultValue = null) {
        return this.userConfig.get(key) || defaultValue;
    }

    getSystemConfig(key, defaultValue = null) {
        return this.systemConfig.get(key) || defaultValue;
    }

    get(key, defaultValue = null) {
        // Try user config first, then system config, then process.env
        return this.userConfig.get(key) || 
               this.systemConfig.get(key) || 
               process.env[key] || 
               defaultValue;
    }

    getAllUserConfig() {
        return Object.fromEntries(this.userConfig);
    }

    getAllSystemConfig() {
        return Object.fromEntries(this.systemConfig);
    }

    async removeUserConfig(key) {
        this.userConfig.delete(key);
        delete process.env[key];
        await this.saveUserConfig();
    }

    async saveUserConfig() {
        const content = this.generateEnvContent(this.userConfig);
        await fs.writeFile(this.envPath, content, 'utf8');
    }

    async saveSystemConfig() {
        const content = this.generateEnvContent(this.systemConfig);
        await fs.writeFile(this.systemEnvPath, content, 'utf8');
    }

    generateEnvContent(configMap) {
        let content = '';
        
        for (const [key, value] of configMap) {
            // Add quotes if value contains spaces or special characters
            const needsQuotes = /[\s"'=]/.test(value);
            const quotedValue = needsQuotes ? `"${value}"` : value;
            content += `${key}=${quotedValue}\n`;
        }

        return content;
    }

    async addUserConfigWithComment(key, value, comment) {
        // Read current file content
        const currentContent = await fs.readFile(this.envPath, 'utf8');
        const lines = currentContent.split('\n');

        // Find if key already exists
        let keyLineIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith(`${key}=`)) {
                keyLineIndex = i;
                break;
            }
        }

        const needsQuotes = /[\s"'=]/.test(value);
        const quotedValue = needsQuotes ? `"${value}"` : value;
        const newLine = `${key}=${quotedValue}`;
        const commentLine = `# ${comment}`;

        if (keyLineIndex >= 0) {
            // Update existing key
            lines[keyLineIndex] = newLine;
            
            // Add comment above if not present
            if (keyLineIndex === 0 || !lines[keyLineIndex - 1].startsWith('#')) {
                lines.splice(keyLineIndex, 0, commentLine);
            }
        } else {
            // Add new key at the end
            if (lines[lines.length - 1] !== '') {
                lines.push('');
            }
            lines.push(commentLine);
            lines.push(newLine);
        }

        // Write back to file
        await fs.writeFile(this.envPath, lines.join('\n'), 'utf8');
        
        // Update in-memory config
        this.userConfig.set(key, value);
        process.env[key] = value;
    }

    listUserConfigKeys() {
        return Array.from(this.userConfig.keys());
    }

    listSystemConfigKeys() {
        return Array.from(this.systemConfig.keys());
    }

    async reload() {
        await this.loadEnvironments();
        this.applyToProcessEnv();
    }
}

module.exports = EnvironmentManager;
