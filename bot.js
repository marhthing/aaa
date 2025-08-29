/**
 * MatDev WhatsApp Bot - Main Entry Point
 * Terminal-based WhatsApp bot with session management
 */

require('dotenv').config();

const Bot = require('./lib/class/Bot');
const config = require('./config');
const logger = require('./lib/utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * Create .env file with default configuration if it doesn't exist
 */
function createEnvFile() {
    const envPath = path.join(process.cwd(), '.env');

    if (fs.existsSync(envPath)) {
        logger.info('✅ .env file already exists - skipping creation');
        return;
    }

    const envContent = `# MatDev Bot Configuration
SESSION_ID=matdev_session
PREFIX=.
BOT_NAME=MatDev Bot
AUTO_READ=true
AUTO_ONLINE=true
REJECT_CALLS=true
AUTO_HELP=true
NODE_ENV=development

# Database Configuration
DATABASE_URL=

# Security Configuration
SUDO_USERS=

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100

# Cache Configuration
CACHE_TTL=300

# Logging
LOG_LEVEL=info
`;

    try {
        fs.writeFileSync(envPath, envContent);
        logger.info('📝 Created .env file with default configuration');
        console.log('📝 Created .env file with default configuration');
    } catch (error) {
        logger.error('Failed to create .env file:', error);
        console.error('❌ Failed to create .env file:', error.message);
    }
}

/**
 * Main function to start the bot
 */
async function main() {
    try {
        // Create .env file if it doesn't exist
        createEnvFile();

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
            console.error('❌ Uncaught Exception:', error.message);
            logger.error('Uncaught Exception:', error);
            // Don't exit immediately, let the bot try to recover
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('❌ Unhandled Promise Rejection:', reason);
            logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
            // Don't exit immediately, let the bot try to recover
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