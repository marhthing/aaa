/**
 * WhatsApp Bot Constants
 * Global constants and configuration values
 */

// Bot Configuration
const BOT_CONFIG = {
    NAME: 'MATDEV',
    VERSION: '1.0.0',
    AUTHOR: 'MATDEV Bot',
    MAX_MESSAGE_LENGTH: 4096,
    COMMAND_PREFIX: '.',
    LOADING_EMOJI: '⏳',
    SUCCESS_EMOJI: '✅',
    ERROR_EMOJI: '❌',
    WARNING_EMOJI: '⚠️',
    INFO_EMOJI: 'ℹ️'
};

// Access Control
const ACCESS_LEVELS = {
    OWNER: 'owner',
    ALLOWED_USER: 'allowed_user', 
    GAME_PLAYER: 'game_player',
    BLOCKED: 'blocked'
};

// Message Types
const MESSAGE_TYPES = {
    TEXT: 'chat',
    IMAGE: 'image',
    VIDEO: 'video',
    AUDIO: 'audio',
    DOCUMENT: 'document',
    STICKER: 'sticker',
    LOCATION: 'location',
    CONTACT: 'vcard',
    VOICE: 'ptt'
};

// Chat Types
const CHAT_TYPES = {
    INDIVIDUAL: 'individual',
    GROUP: 'group',
    STATUS: 'status'
};

// Command Categories
const COMMAND_CATEGORIES = {
    CORE: 'core',
    ADMIN: 'admin',
    GAMES: 'games',
    MEDIA: 'media',
    TOOLS: 'tools',
    FUN: 'fun'
};

// Game States
const GAME_STATES = {
    INACTIVE: 'inactive',
    WAITING: 'waiting',
    ACTIVE: 'active',
    PAUSED: 'paused',
    FINISHED: 'finished'
};

// Plugin States
const PLUGIN_STATES = {
    DISABLED: 'disabled',
    LOADING: 'loading',
    ACTIVE: 'active',
    ERROR: 'error'
};

// Storage Namespaces
const STORAGE_NAMESPACES = {
    MESSAGES: 'messages',
    MEDIA: 'media',
    GAMES: 'games',
    USERS: 'users',
    SYSTEM: 'system',
    PLUGINS: 'plugins',
    SESSIONS: 'sessions'
};

// File Paths
const PATHS = {
    DATA_DIR: './data',
    SESSIONS_DIR: './sessions',
    PLUGINS_DIR: './src/plugins',
    CONFIG_DIR: './config',
    LOGS_DIR: './logs',
    TEMP_DIR: './temp'
};

// Environment Variables
const ENV_VARS = {
    // Session
    SESSION_ID: 'WHATSAPP_SESSION_ID',
    SESSION_DIR: 'SESSION_DIR',
    OWNER_JID: 'OWNER_JID',
    
    // Features
    ENABLE_WEB_INTERFACE: 'ENABLE_WEB_INTERFACE',
    AUTO_RELOAD_PLUGINS: 'AUTO_RELOAD_PLUGINS',
    ENABLE_MEDIA_DOWNLOAD: 'ENABLE_MEDIA_DOWNLOAD',
    ENABLE_MESSAGE_ARCHIVE: 'ENABLE_MESSAGE_ARCHIVE',
    
    // Limits
    MAX_MEDIA_SIZE: 'MAX_MEDIA_SIZE',
    MAX_MESSAGE_CACHE: 'MAX_MESSAGE_CACHE',
    PLUGIN_TIMEOUT: 'PLUGIN_TIMEOUT'
};

// Error Codes
const ERROR_CODES = {
    // Access Control
    ACCESS_DENIED: 'ACCESS_DENIED',
    OWNER_ONLY: 'OWNER_ONLY',
    INVALID_JID: 'INVALID_JID',
    
    // Commands
    COMMAND_NOT_FOUND: 'COMMAND_NOT_FOUND',
    INVALID_ARGUMENTS: 'INVALID_ARGUMENTS',
    COMMAND_ERROR: 'COMMAND_ERROR',
    
    // Plugins
    PLUGIN_NOT_FOUND: 'PLUGIN_NOT_FOUND',
    PLUGIN_LOAD_ERROR: 'PLUGIN_LOAD_ERROR',
    PLUGIN_DISABLED: 'PLUGIN_DISABLED',
    
    // System
    INITIALIZATION_ERROR: 'INITIALIZATION_ERROR',
    STORAGE_ERROR: 'STORAGE_ERROR',
    NETWORK_ERROR: 'NETWORK_ERROR'
};

// Regex Patterns
const PATTERNS = {
    COMMAND: /^\.([a-zA-Z0-9_-]+)(?:\s+(.*))?$/,
    JID: /^(\d{10,15})@(s\.whatsapp\.net|g\.us)$/,
    PHONE_NUMBER: /^\+?[1-9]\d{1,14}$/,
    MEDIA_EXTENSIONS: {
        IMAGES: /\.(jpg|jpeg|png|gif|webp)$/i,
        VIDEOS: /\.(mp4|avi|mov|wmv|flv|mkv|webm)$/i,
        AUDIO: /\.(mp3|wav|flac|aac|ogg|m4a)$/i,
        DOCUMENTS: /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt)$/i
    }
};

// Time Constants
const TIME = {
    SECOND: 1000,
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000
};

// Cache Settings
const CACHE = {
    MESSAGE_TTL: 30 * TIME.MINUTE,
    MEDIA_TTL: 2 * TIME.HOUR,
    USER_TTL: TIME.HOUR,
    PLUGIN_TTL: 10 * TIME.MINUTE
};

// Rate Limits
const RATE_LIMITS = {
    COMMANDS_PER_MINUTE: 10,
    MEDIA_DOWNLOADS_PER_HOUR: 50,
    MESSAGES_PER_SECOND: 2
};

module.exports = {
    BOT_CONFIG,
    ACCESS_LEVELS,
    MESSAGE_TYPES,
    CHAT_TYPES,
    COMMAND_CATEGORIES,
    GAME_STATES,
    PLUGIN_STATES,
    STORAGE_NAMESPACES,
    PATHS,
    ENV_VARS,
    ERROR_CODES,
    PATTERNS,
    TIME,
    CACHE,
    RATE_LIMITS
};