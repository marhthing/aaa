const { Client, logger } = require('./lib/client')
const config = require('./config')
const fs = require('fs-extra')
const path = require('path')

const start = async () => {
  logger.info(`${config.BOT_NAME} ${config.VERSION}`)
  
  try {
    // Check if session is configured
    if (!config.WHATSAPP_SESSION_ID) {
      logger.error('No session configured. Please run the old launcher first to set up a session.')
      logger.info('Run: node index_old_launcher.js')
      return process.exit(1)
    }
    
    // Ensure required directories exist
    await fs.ensureDir(config.SESSION_DIR)
    await fs.ensureDir(config.DOWNLOAD_DIR)
    await fs.ensureDir(config.PLUGIN_DIR)
    await fs.ensureDir(config.EPLUGIN_DIR)
    
    // Start the bot
    const bot = new Client()
    await bot.connect()
    
  } catch (error) {
    logger.error('Failed to start bot:', error)
    process.exit(1)
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Bot shutting down...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  logger.info('Bot terminated')
  process.exit(0)
})

start()