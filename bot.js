/**
 * MatDev WhatsApp Bot - Terminal Edition
 * Simple launcher-based WhatsApp bot
 */

require('dotenv').config()
const Bot = require('./lib/class/Bot')
const config = require('./config')
const logger = require('./lib/utils/logger')

// Global bot instance
let botInstance = null

/**
 * Initialize and start the WhatsApp bot
 */
async function startBot() {
  try {
    console.log('🤖 MatDev WhatsApp Bot - Terminal Edition')
    console.log('==========================================')
    
    logger.info('🚀 Starting MatDev WhatsApp Bot...')
    
    // Create bot instance
    botInstance = new Bot(config)
    
    // Set up event listeners
    botInstance.on('ready', () => {
      console.log('✅ Bot is ready and connected!')
      console.log('📱 You can now use your WhatsApp bot')
      logger.info('✅ Bot is ready and connected!')
    })
    
    botInstance.on('disconnected', () => {
      console.log('⚠️  Bot disconnected')
      logger.warn('⚠️ Bot disconnected')
    })
    
    botInstance.on('error', (error) => {
      console.error('❌ Bot error:', error.message)
      logger.error('Bot error:', error)
    })
    
    // Start the bot
    await botInstance.start()
    
  } catch (error) {
    console.error('❌ Failed to start bot:', error.message)
    logger.error('Failed to start bot:', error)
    process.exit(1)
  }
}

/**
 * Graceful shutdown handling
 */
async function gracefulShutdown() {
  console.log('📴 Shutting down MatDev bot...')
  logger.info('📴 Shutting down MatDev bot...')
  
  try {
    if (botInstance) {
      await botInstance.disconnect()
    }
    
    // Close database connections
    const { sequelize } = require('./lib/db/models')
    if (sequelize) {
      await sequelize.close()
    }
    
    console.log('✅ Graceful shutdown completed')
    logger.info('✅ Graceful shutdown completed')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error during shutdown:', error.message)
    logger.error('Error during shutdown:', error)
    process.exit(1)
  }
}

// Handle process signals
process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message)
  logger.error('Uncaught Exception:', error)
  gracefulShutdown()
})
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason)
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

// Start the bot
startBot().catch(error => {
  console.error('❌ Failed to start bot:', error.message)
  logger.error('Failed to start bot:', error)
  process.exit(1)
})