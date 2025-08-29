/**
 * MatDev Bot Configuration Loader
 * Handles environment variables and configuration validation
 */

require('dotenv').config();

/**
 * Default configuration values
 */
const defaultConfig = {
    // Bot Identity
    SESSION_ID: process.env.SESSION_ID || 'updateThis',
    PREFIX: process.env.PREFIX || '.',
    BOT_NAME: process.env.BOT_NAME || 'MatDev',
    BOT_LANG: process.env.BOT_LANG || 'en',
    
    // Database Configuration - Use JSON by default, only use database if explicitly configured
    DATABASE_URL: process.env.FORCE_DATABASE === 'true' ? process.env.DATABASE_URL : '',
    DB_TYPE: (process.env.FORCE_DATABASE === 'true' && process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '') ? 
             (process.env.DATABASE_URL.startsWith('postgres') ? 'postgres' : 'other') : 'json',
    
    // Bot Behavior
    AUTO_READ: process.env.AUTO_READ === 'true',
    AUTO_ONLINE: process.env.AUTO_ONLINE === 'true',
    REJECT_CALLS: process.env.REJECT_CALLS === 'true',
    
    // Security
    SUDO_USERS: process.env.SUDO_USERS ? process.env.SUDO_USERS.split(',') : [],
    MAX_COMMANDS_PER_MINUTE: parseInt(process.env.MAX_COMMANDS_PER_MINUTE) || 20,
    
    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    
    // Platform Detection
    PLATFORM: detectPlatform(),
    
    // Features
    ENABLE_GAMES: process.env.ENABLE_GAMES !== 'false',
    ENABLE_MEDIA_PROCESSING: process.env.ENABLE_MEDIA_PROCESSING !== 'false',
    ENABLE_SCHEDULER: process.env.ENABLE_SCHEDULER !== 'false',
    
    // External APIs
    WEATHER_API_KEY: process.env.WEATHER_API_KEY || '',
    TRANSLATE_API_KEY: process.env.TRANSLATE_API_KEY || '',
    
    // Paths
    PLUGIN_DIR: './plugins',
    LANG_DIR: './lang',
    MEDIA_DIR: './media',
    LOG_DIR: './logs',
    SESSION_DIR: './sessions'
};

/**
 * Detect hosting platform
 */
function detectPlatform() {
    if (process.env.REPLIT_DOMAINS) return 'replit';
    if (process.env.DYNO) return 'heroku';
    if (process.env.KOYEB_APP_NAME) return 'koyeb';
    if (process.env.RAILWAY_ENVIRONMENT) return 'railway';
    if (process.env.RENDER_SERVICE_NAME) return 'render';
    return 'vps';
}

/**
 * Validate configuration
 */
function validateConfig(config) {
    const errors = [];
    
    // Required fields
    if (!config.SESSION_ID) {
        errors.push('SESSION_ID is required');
    }
    
    // Validate sudo users format
    if (config.SUDO_USERS.length > 0) {
        config.SUDO_USERS.forEach(user => {
            if (!user.includes('@')) {
                errors.push(`Invalid sudo user format: ${user}. Use format: number@s.whatsapp.net`);
            }
        });
    }
    
    // Validate database URL for production
    if (config.DB_TYPE === 'postgres' && !config.DATABASE_URL.includes('postgres')) {
        errors.push('Valid PostgreSQL DATABASE_URL is required for production');
    }
    
    // Validate numeric values
    if (isNaN(config.MAX_COMMANDS_PER_MINUTE) || config.MAX_COMMANDS_PER_MINUTE < 1) {
        errors.push('MAX_COMMANDS_PER_MINUTE must be a positive number');
    }
    
    if (errors.length > 0) {
        console.error('Configuration validation failed:');
        errors.forEach(error => console.error(`- ${error}`));
        throw new Error('Invalid configuration');
    }
    
    return true;
}

/**
 * Load and validate configuration
 */
function loadConfig() {
    try {
        validateConfig(defaultConfig);
        
        console.log('📋 Configuration loaded successfully');
        console.log(`Platform: ${defaultConfig.PLATFORM}`);
        console.log(`Database: ${defaultConfig.DB_TYPE}`);
        console.log(`Language: ${defaultConfig.BOT_LANG}`);
        console.log(`Prefix: ${defaultConfig.PREFIX}`);
        
        return defaultConfig;
    } catch (error) {
        console.error('Failed to load configuration:', error);
        process.exit(1);
    }
}

module.exports = loadConfig();
