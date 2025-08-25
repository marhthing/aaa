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
        // Validate SESSION_ID
        if (!process.env.SESSION_ID || process.env.SESSION_ID === 'updateThis') {
            console.error('❌ SESSION_ID not configured!');
            console.error('   Please set SESSION_ID in your environment or .env file');
            console.error('   Get your session ID from your web scanner service');
            process.exit(1);
        }
        
        logger.info('🚀 Starting MatDev WhatsApp Bot...');
        logger.info(`📱 Using SESSION_ID: ${process.env.SESSION_ID}`);
        
        // Create bot instance
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
        
        // Start the bot
        await bot.start();
        
        logger.info('✅ MatDev WhatsApp Bot is running!');
        logger.info('📱 Scan the QR code with WhatsApp to connect');
        
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