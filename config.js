const { existsSync } = require('fs')
const path = require('path')

// Load environment file if it exists
const envPath = path.join(__dirname, '.env')
if (existsSync(envPath)) {
    require('dotenv').config({ path: envPath })
}

// Utility function to convert string to boolean
const toBool = (x) => {
    if (!x || x.trim() === '') return undefined
    return x.toLowerCase() === 'true'
}

// Helper function to get number from env with default
const toNumber = (x, defaultValue) => {
    const parsed = parseInt(x)
    return isNaN(parsed) ? defaultValue : parsed
}

module.exports = {
    // Bot Information
    VERSION: require('./package.json').version,
    BOT_NAME: process.env.BOT_NAME || 'MATDEV',
    PREFIX: process.env.PREFIX || '.',
    
    // WhatsApp Session Configuration (preserved from original)
    SESSION_ID: (process.env.WHATSAPP_SESSION_ID || '').trim(),
    OWNER_JID: (process.env.OWNER_JID || '').trim(),
    PHONE_NUMBER: (process.env.PHONE_NUMBER || '').trim(),
    AUTH_METHOD: process.env.AUTH_METHOD || '1',
    SESSION_DIR: process.env.SESSION_DIR || path.join(__dirname, 'sessions'),
    
    // Core Features
    AUTO_RELOAD_PLUGINS: toBool(process.env.AUTO_RELOAD_PLUGINS) ?? true,
    ENABLE_MEDIA_DOWNLOAD: toBool(process.env.ENABLE_MEDIA_DOWNLOAD) ?? true,
    ENABLE_MESSAGE_ARCHIVE: true, // Always enabled - no override allowed
    ENABLE_WEB_INTERFACE: toBool(process.env.ENABLE_WEB_INTERFACE) ?? true,
    ENABLE_ANTI_DELETE: toBool(process.env.ENABLE_ANTI_DELETE) ?? true,
    ENABLE_GAMES: toBool(process.env.ENABLE_GAMES) ?? true,
    
    // Web Interface
    WEB_PORT: toNumber(process.env.WEB_PORT, 5000),
    WEB_HOST: process.env.WEB_HOST || '0.0.0.0',
    
    // Media Configuration
    MAX_MEDIA_SIZE: toNumber(process.env.MAX_MEDIA_SIZE, 52428800), // 50MB
    MAX_UPLOAD: toNumber(process.env.MAX_UPLOAD, 200),
    DOWNLOAD_DIR: path.join(__dirname, 'data', 'downloads'),
    
    // Message Settings
    MAX_MESSAGE_CACHE: toNumber(process.env.MAX_MESSAGE_CACHE, 1000),
    LOADING_EMOJI: process.env.LOADING_EMOJI || '⏳',
    SUCCESS_EMOJI: process.env.SUCCESS_EMOJI || '✅',
    ERROR_EMOJI: process.env.ERROR_EMOJI || '❌',
    
    // Plugin Configuration
    PLUGIN_TIMEOUT: toNumber(process.env.PLUGIN_TIMEOUT, 10000),
    PLUGINS_DIR: path.join(__dirname, 'plugins'),
    MAX_PLUGINS: toNumber(process.env.MAX_PLUGINS, 20),
    
    // Game Settings
    MAX_PLAYERS_PER_GAME: toNumber(process.env.MAX_PLAYERS_PER_GAME, 10),
    GAME_TIMEOUT: toNumber(process.env.GAME_TIMEOUT, 600000), // 10 minutes
    MAX_ACTIVE_GAMES: toNumber(process.env.MAX_ACTIVE_GAMES, 5),
    
    // Security & Access  
    OWNER_ONLY: toBool(process.env.OWNER_ONLY) ?? true, // Default: true (owner only)
    SUDO: process.env.SUDO || '',
    COMMAND_COOLDOWN: toNumber(process.env.COMMAND_COOLDOWN, 1000),
    RATE_LIMIT: toBool(process.env.RATE_LIMIT) ?? true,
    MAX_COMMANDS_PER_MINUTE: toNumber(process.env.MAX_COMMANDS_PER_MINUTE, 10),
    
    // Data Storage
    DATA_DIR: path.join(__dirname, 'data'),
    MESSAGES_DIR: path.join(__dirname, 'data', 'messages'),
    MEDIA_DIR: path.join(__dirname, 'data', 'media'),
    PLUGINS_DATA_DIR: path.join(__dirname, 'data', 'plugins'),
    SYSTEM_DATA_DIR: path.join(__dirname, 'data', 'system'),
    
    // Performance & Monitoring
    ENABLE_PERFORMANCE_MONITORING: toBool(process.env.ENABLE_PERFORMANCE_MONITORING) ?? true,
    MEMORY_THRESHOLD: toNumber(process.env.MEMORY_THRESHOLD, 512), // MB
    CPU_THRESHOLD: toNumber(process.env.CPU_THRESHOLD, 80), // %
    
    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    ENABLE_ERROR_REPORTING: toBool(process.env.ENABLE_ERROR_REPORTING) ?? true,
    LOG_MSG: toBool(process.env.LOG_MSG) ?? false,
    
    // Cleanup & Maintenance
    AUTO_CLEANUP: toBool(process.env.AUTO_CLEANUP) ?? true,
    CLEANUP_INTERVAL: toNumber(process.env.CLEANUP_INTERVAL, 3600000), // 1 hour
    MAX_CACHE_AGE: toNumber(process.env.MAX_CACHE_AGE, 1800000), // 30 minutes
    
    // Development & Debug
    NODE_ENV: process.env.NODE_ENV || 'development',
    DEBUG_MODE: true, // Force debug mode always on
    VERBOSE_LOGGING: toBool(process.env.VERBOSE_LOGGING) ?? true,
    
    // External Services (preserved for backward compatibility)
    BRAINSHOP: process.env.BRAINSHOP || '159501,6pq8dPiYt7PdqHz3',
    RMBG_KEY: process.env.RMBG_KEY || null,
    TRUECALLER: process.env.TRUECALLER || null,
    
    // WhatsApp Specific
    STICKER_PACKNAME: process.env.STICKER_PACKNAME || '❤️,MatDev',
    ALWAYS_ONLINE: toBool(process.env.ALWAYS_ONLINE) ?? false,
    AUTO_STATUS_VIEW: toBool(process.env.AUTO_STATUS_VIEW) ?? false,
    SEND_READ: toBool(process.env.SEND_READ) ?? true,
    REJECT_CALL: toBool(process.env.REJECT_CALL) ?? false,
    
    // Language & Localization
    LANG: (process.env.LANG || 'en').toLowerCase(),
    BOT_LANG: (process.env.BOT_LANG || 'english').toLowerCase(),
    
    // Auto-updater
    AUTO_UPDATE: toBool(process.env.AUTO_UPDATE) ?? false,
    FORCE_LOGOUT: toBool(process.env.FORCE_LOGOUT) ?? false,
    
    // Default directories for initialization
    REQUIRED_DIRS: [
        'data',
        'data/messages', 
        'data/media',
        'data/plugins',
        'data/system',
        'data/downloads',
        'data/downloads/video',
        'sessions'
    ],
    
    // Plugin defaults (simplified from the complex plugin config)
    PLUGIN_DEFAULTS: {
        enabled: true,
        autoLoad: true,
        timeout: 10000,
        ownerOnly: true,
        hotReload: true
    },
    
    // Helper function to get all config as object
    getAll() {
        const config = { ...this }
        delete config.getAll
        return config
    }
}