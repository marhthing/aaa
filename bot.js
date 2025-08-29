/**
 * MatDev WhatsApp Bot - Main Entry Point
 * Terminal-based WhatsApp bot with session management
 */

require('dotenv').config();

const Bot = require('./lib/class/Bot');
const config = require('./config');
const logger = require('./lib/utils/logger');

/**
 * Main function to start the bot
 */
async function main() {
    try {
        logger.info('🚀 Starting MatDev WhatsApp Bot...');
        logger.info('📱 Checking for existing session...');
        
        // Create bot instance - it will handle session detection and linking
        const bot = new Bot(config);
        
        // Handle process termination
        process.on('SIGINT', async () => {
            logger.info('🔌 Shutting down bot...');
            await bot.stop();
            process.exit(0);
        });
        
        process.on('SIGTERM', async () => {
            logger.info('🔌 Shutting down bot...');
            await bot.stop();
            process.exit(0);
        });
        
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', error);
            process.exit(1);
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
            process.exit(1);
        });
        
        // Start the bot with automatic session handling
        await bot.start();
        
        logger.info('✅ MatDev WhatsApp Bot is running!');
        
    } catch (error) {
        logger.error('Failed to start MatDev Bot:', error);
        process.exit(1);
    }
}

// Start the application
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});

module.exports = main;