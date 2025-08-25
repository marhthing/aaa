/**
 * MatDev WhatsApp Bot - Main Entry Point
 * A production-ready WhatsApp bot with advanced plugin architecture
 */

const express = require('express');
const path = require('path');
const Bot = require('./lib/class/Bot');
const Database = require('./lib/class/Database');
const logger = require('./lib/utils/logger');
const config = require('./config');

const app = express();
const PORT = process.env.PORT || 5000;

// Global bot instance
let botInstance = null;
let botStatus = 'disconnected';

// Express middleware
app.use(express.json());
app.use(express.static('web'));
app.use('/media', express.static('media'));

// Web dashboard routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'web', 'index.html'));
});

app.get('/api/status', (req, res) => {
    res.json({
        status: botStatus,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        config: {
            sessionId: config.SESSION_ID,
            prefix: config.PREFIX,
            language: config.BOT_LANG,
            autoRead: config.AUTO_READ,
            autoOnline: config.AUTO_ONLINE
        }
    });
});

app.post('/api/bot/start', async (req, res) => {
    try {
        if (botInstance && botStatus === 'connected') {
            return res.json({ success: false, message: 'Bot is already running' });
        }
        
        await startBot();
        res.json({ success: true, message: 'Bot started successfully' });
    } catch (error) {
        logger.error('Failed to start bot:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/bot/stop', async (req, res) => {
    try {
        if (botInstance) {
            await botInstance.disconnect();
            botInstance = null;
            botStatus = 'disconnected';
        }
        res.json({ success: true, message: 'Bot stopped successfully' });
    } catch (error) {
        logger.error('Failed to stop bot:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/plugins', (req, res) => {
    if (botInstance && botInstance.pluginManager) {
        const plugins = botInstance.pluginManager.getPluginList();
        res.json(plugins);
    } else {
        res.json([]);
    }
});

/**
 * Initialize and start the WhatsApp bot
 */
async function startBot() {
    try {
        logger.info('🚀 Starting MatDev WhatsApp Bot...');
        
        // Initialize database
        const database = new Database();
        await database.connect();
        await database.sync();
        
        // Create bot instance
        botInstance = new Bot(config);
        
        // Set up event listeners
        botInstance.on('ready', () => {
            botStatus = 'connected';
            logger.info('✅ Bot is ready and connected!');
        });
        
        botInstance.on('disconnected', () => {
            botStatus = 'disconnected';
            logger.warn('⚠️ Bot disconnected');
        });
        
        botInstance.on('error', (error) => {
            logger.error('Bot error:', error);
        });
        
        // Start the bot
        await botInstance.start();
        
    } catch (error) {
        logger.error('Failed to start bot:', error);
        botStatus = 'error';
        throw error;
    }
}

/**
 * Graceful shutdown handling
 */
async function gracefulShutdown() {
    logger.info('📴 Shutting down MatDev bot...');
    
    try {
        if (botInstance) {
            await botInstance.disconnect();
        }
        
        // Close database connections
        const { sequelize } = require('./lib/db/models');
        if (sequelize) {
            await sequelize.close();
        }
        
        logger.info('✅ Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
}

// Handle process signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    gracefulShutdown();
});
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start web server
app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🌐 MatDev Web Dashboard running on http://0.0.0.0:${PORT}`);
    
    // Auto-start bot if configured
    if (process.env.AUTO_START !== 'false') {
        startBot().catch(error => {
            logger.error('Failed to auto-start bot:', error);
        });
    }
});

module.exports = { app, startBot, gracefulShutdown };
