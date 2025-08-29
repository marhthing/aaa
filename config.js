const { existsSync } = require('fs')
const path = require('path')

// Environment configuration
const configPath = path.join(__dirname, './config.env')
if (existsSync(configPath)) require('dotenv').config({ path: configPath })

const toBool = (x) => x == 'true'

module.exports = {
  // Core bot config
  VERSION: require('./package.json').version,
  BOT_NAME: process.env.BOT_NAME || 'MATDEV',
  
  // Session management (unique to MATDEV)
  SESSION_DIR: process.env.SESSION_DIR || './sessions',
  WHATSAPP_SESSION_ID: process.env.WHATSAPP_SESSION_ID || '',
  PHONE_NUMBER: process.env.PHONE_NUMBER || '',
  OWNER_JID: process.env.OWNER_JID || '',
  AUTH_METHOD: process.env.AUTH_METHOD || '1',
  
  // Command configuration
  PREFIX: (process.env.PREFIX || '.').trim(),
  SUDO: process.env.SUDO || '',
  
  // Features
  ANTI_DELETE: toBool(process.env.ANTI_DELETE || 'true'),
  ANTI_VIEW_ONCE: toBool(process.env.ANTI_VIEW_ONCE || 'true'),
  AUTO_RELOAD_PLUGINS: toBool(process.env.AUTO_RELOAD_PLUGINS || 'true'),
  ENABLE_GAMES: toBool(process.env.ENABLE_GAMES || 'true'),
  ENABLE_MEDIA_TOOLS: toBool(process.env.ENABLE_MEDIA_TOOLS || 'true'),
  
  // Plugin system
  PLUGIN_DIR: './plugins_new',
  EPLUGIN_DIR: './eplugins', // External plugins directory
  ALLOW_EXTERNAL_PLUGINS: toBool(process.env.ALLOW_EXTERNAL_PLUGINS || 'true'),
  
  // Performance
  MAX_UPLOAD: process.env.MAX_UPLOAD || 50,
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  BAILEYS_LOG_LVL: process.env.BAILEYS_LOG_LVL || 'silent',
  
  // Access control
  OWNER_ONLY: toBool(process.env.OWNER_ONLY || 'true'),
  ALLOWED_COMMANDS: process.env.ALLOWED_COMMANDS || '',
  
  // Media settings
  MAX_MEDIA_SIZE: parseInt(process.env.MAX_MEDIA_SIZE || '52428800'),
  DOWNLOAD_DIR: './data/media',
  TEMP_DIR: './temp',
  
  // Web interface (inherited from original)
  WEB_PORT: process.env.WEB_PORT || 5000,
  WEB_HOST: process.env.WEB_HOST || '0.0.0.0',
  ENABLE_WEB: toBool(process.env.ENABLE_WEB || 'false'),
  
  // Database (for plugin data)
  DATABASE_URL: process.env.DATABASE_URL || path.join(__dirname, './database.db'),
  
  // Timeouts
  COMMAND_TIMEOUT: parseInt(process.env.COMMAND_TIMEOUT || '10000'),
  PLUGIN_TIMEOUT: parseInt(process.env.PLUGIN_TIMEOUT || '10000'),
  
  // Reactions and feedback
  LOADING_EMOJI: process.env.LOADING_EMOJI || '⏳',
  SUCCESS_EMOJI: process.env.SUCCESS_EMOJI || '✅',
  ERROR_EMOJI: process.env.ERROR_EMOJI || '❌',
  WARNING_EMOJI: process.env.WARNING_EMOJI || '⚠️',
  
  // External API keys (for plugins)
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
  WEATHER_API_KEY: process.env.WEATHER_API_KEY || '',
  
  // Advanced features
  HOT_RELOAD: toBool(process.env.HOT_RELOAD || 'true'),
  ENABLE_PERFORMANCE_MONITORING: toBool(process.env.ENABLE_PERFORMANCE_MONITORING || 'true'),
  AUTO_SAVE_INTERVAL: parseInt(process.env.AUTO_SAVE_INTERVAL || '60000'),
}