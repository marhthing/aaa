const fs = require('fs-extra');
const path = require('path');
const { EventEmitter } = require('events');

class EnvironmentService extends EventEmitter {
    constructor() {
        super();
        this.userEnv = {};
        this.systemEnv = {};
        this.defaults = {};
        this.userEnvPath = '.env';
        this.systemEnvPath = '.env.system';
        this.isInitialized = false;
    }

    async initialize() {
        try {
            await this.loadEnvironments();
            this.setupDefaults();
            this.isInitialized = true;
            console.log('✅ Environment Service initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Environment Service:', error);
            throw error;
        }
    }

    async loadEnvironments() {
        // Load system environment
        if (await fs.pathExists(this.systemEnvPath)) {
            const systemContent = await fs.readFile(this.systemEnvPath, 'utf8');
            this.systemEnv = this.parseEnvContent(systemContent);
        }

        // Load user environment
        if (await fs.pathExists(this.userEnvPath)) {
            const userContent = await fs.readFile(this.userEnvPath, 'utf8');
            this.userEnv = this.parseEnvContent(userContent);
        }
    }

    parseEnvContent(content) {
        const env = {};
        const lines = content.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
                env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
            }
        }

        return env;
    }

    setupDefaults() {
        this.defaults = {
            BOT_NAME: 'Personal Assistant Bot',
            BOT_PREFIX: '.',
            BOT_DESCRIPTION: 'Your personal WhatsApp assistant',
            SESSION_NAME: 'default',
            AUTO_RESTART: 'true',
            SAVE_SESSION: 'true',
            ENABLE_MESSAGE_ARCHIVAL: 'true',
            ENABLE_MEDIA_DOWNLOAD: 'true',
            ENABLE_ANTI_DELETE: 'true',
            ENABLE_GAMES: 'true',
            ENABLE_HOT_RELOAD: 'true',
            MAX_CONCURRENT_DOWNLOADS: '5',
            MESSAGE_BATCH_SIZE: '100',
            PLUGIN_SCAN_INTERVAL: '5000',
            LOG_LEVEL: 'info',
            LOG_TO_FILE: 'true',
            WEB_INTERFACE_ENABLED: 'true',
            WEB_PORT: '5000',
            BACKEND_PORT: '8000',
            WEBSOCKET_PATH: '/ws',
            DATA_DIR: './data',
            SESSIONS_DIR: './sessions',
            PLUGINS_DIR: './src/plugins',
            CONFIG_DIR: './config'
        };
    }

    get(key, defaultValue = null) {
        return this.userEnv[key] || 
               this.systemEnv[key] || 
               this.defaults[key] || 
               process.env[key] || 
               defaultValue;
    }

    set(key, value, isSystem = false) {
        if (isSystem) {
            this.systemEnv[key] = value;
        } else {
            this.userEnv[key] = value;
        }

        this.emit('env_changed', { key, value, isSystem });
        return true;
    }

    async save(isSystem = false) {
        try {
            if (isSystem) {
                await this.saveSystemEnv();
            } else {
                await this.saveUserEnv();
            }
            return true;
        } catch (error) {
            console.error(`Error saving ${isSystem ? 'system' : 'user'} environment:`, error);
            return false;
        }
    }

    async saveUserEnv() {
        const content = this.formatEnvContent(this.userEnv, 'WhatsApp Bot Configuration');
        await fs.writeFile(this.userEnvPath, content);
    }

    async saveSystemEnv() {
        const content = this.formatEnvContent(this.systemEnv, 'System Configuration (Hidden from user)');
        await fs.writeFile(this.systemEnvPath, content);
    }

    formatEnvContent(envObj, header) {
        let content = `# ${header}\n`;
        content += `# Generated on ${new Date().toISOString()}\n\n`;

        for (const [key, value] of Object.entries(envObj)) {
            content += `${key}=${value}\n`;
        }

        return content;
    }

    has(key) {
        return !!(this.userEnv[key] || this.systemEnv[key] || this.defaults[key] || process.env[key]);
    }

    delete(key, isSystem = false) {
        if (isSystem) {
            if (this.systemEnv[key]) {
                delete this.systemEnv[key];
                this.emit('env_deleted', { key, isSystem });
                return true;
            }
        } else {
            if (this.userEnv[key]) {
                delete this.userEnv[key];
                this.emit('env_deleted', { key, isSystem });
                return true;
            }
        }
        return false;
    }

    getAll() {
        return {
            user: { ...this.userEnv },
            system: { ...this.systemEnv },
            defaults: { ...this.defaults }
        };
    }

    getUserVars() {
        return { ...this.userEnv };
    }

    getSystemVars() {
        return { ...this.systemEnv };
    }

    getDefaults() {
        return { ...this.defaults };
    }

    validate(key, value) {
        const validations = {
            BOT_PREFIX: (val) => val && val.length === 1,
            WEB_PORT: (val) => /^\d+$/.test(val) && parseInt(val) > 0 && parseInt(val) < 65536,
            BACKEND_PORT: (val) => /^\d+$/.test(val) && parseInt(val) > 0 && parseInt(val) < 65536,
            MAX_CONCURRENT_DOWNLOADS: (val) => /^\d+$/.test(val) && parseInt(val) > 0,
            MESSAGE_BATCH_SIZE: (val) => /^\d+$/.test(val) && parseInt(val) > 0,
            PLUGIN_SCAN_INTERVAL: (val) => /^\d+$/.test(val) && parseInt(val) >= 1000,
            LOG_LEVEL: (val) => ['error', 'warn', 'info', 'debug'].includes(val),
            ENABLE_MESSAGE_ARCHIVAL: (val) => ['true', 'false'].includes(val),
            ENABLE_MEDIA_DOWNLOAD: (val) => ['true', 'false'].includes(val),
            ENABLE_ANTI_DELETE: (val) => ['true', 'false'].includes(val),
            ENABLE_GAMES: (val) => ['true', 'false'].includes(val),
            ENABLE_HOT_RELOAD: (val) => ['true', 'false'].includes(val),
            AUTO_RESTART: (val) => ['true', 'false'].includes(val),
            WEB_INTERFACE_ENABLED: (val) => ['true', 'false'].includes(val)
        };

        const validator = validations[key];
        return validator ? validator(value) : true;
    }

    getBoolean(key, defaultValue = false) {
        const value = this.get(key, defaultValue.toString());
        return value === 'true' || value === true;
    }

    getNumber(key, defaultValue = 0) {
        const value = this.get(key, defaultValue.toString());
        const parsed = parseInt(value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    getArray(key, separator = ',', defaultValue = []) {
        const value = this.get(key);
        if (!value) return defaultValue;
        
        return value.split(separator).map(item => item.trim()).filter(item => item.length > 0);
    }

    async reset() {
        this.userEnv = {};
        this.systemEnv = {};
        await this.saveUserEnv();
        await this.saveSystemEnv();
        this.emit('env_reset');
    }

    async reload() {
        await this.loadEnvironments();
        this.emit('env_reloaded');
    }

    export() {
        return {
            user: this.userEnv,
            system: this.systemEnv,
            exportedAt: new Date().toISOString()
        };
    }

    async import(data) {
        if (data.user) {
            this.userEnv = { ...data.user };
            await this.saveUserEnv();
        }
        
        if (data.system) {
            this.systemEnv = { ...data.system };
            await this.saveSystemEnv();
        }
        
        this.emit('env_imported');
    }
}

// Export singleton instance
module.exports = new EnvironmentService();
