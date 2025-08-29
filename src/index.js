const { default: makeWASocket } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const BotClient = require('./core/BotClient');
const EnvironmentManager = require('./core/EnvironmentManager');
const SessionManager = require('./core/SessionManager');
const HotReloader = require('./core/HotReloader');
const PerformanceMonitor = require('./core/PerformanceMonitor');

class WhatsAppBot {
    constructor() {
        this.envManager = new EnvironmentManager();
        this.sessionManager = new SessionManager();
        this.botClient = null;
        this.hotReloader = null;
        this.performanceMonitor = null;
        this.app = null;
        this.server = null;
        this.io = null;
    }

    async initialize() {
        try {
            console.log('🔧 Initializing MATDEV Bot...');

            // Initialize environment
            await this.envManager.initialize();
            
            // Initialize performance monitoring
            this.performanceMonitor = new PerformanceMonitor();
            await this.performanceMonitor.initialize();

            // Setup web interface
            if (process.env.ENABLE_WEB_INTERFACE === 'true') {
                await this.setupWebInterface();
            }

            // Initialize bot client
            this.botClient = new BotClient();
            await this.botClient.initialize();

            // Setup hot reloader
            if (process.env.AUTO_RELOAD_PLUGINS === 'true') {
                this.hotReloader = new HotReloader(this.botClient);
                await this.hotReloader.initialize();
            }

            // Setup event handlers
            this.setupEventHandlers();

            console.log('✅ Bot initialization complete!');
            return true;

        } catch (error) {
            console.error('❌ Failed to initialize bot:', error);
            throw error;
        }
    }

    async handleReconnection() {
        console.log('🔄 Handling reconnection...');
        
        // Try to recover missed messages
        if (this.botClient?.messageArchiver) {
            await this.botClient.messageArchiver.recoverMissedMessages(this.botClient.client);
        }
        
        console.log('✅ Reconnection handling complete');
    }

    async setupWebInterface() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIO(this.server);

        // Serve static files
        this.app.use(express.static(path.join(__dirname, '../web')));

        // API routes
        this.app.get('/api/status', (req, res) => {
            res.json({
                status: this.botClient ? this.botClient.getStatus() : 'initializing',
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                performance: this.performanceMonitor.getMetrics()
            });
        });

        this.app.get('/api/sessions', async (req, res) => {
            try {
                const sessions = await this.sessionManager.listSessions();
                res.json(sessions);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Socket.IO for real-time updates
        this.io.on('connection', (socket) => {
            console.log('🔌 Web client connected');
            
            socket.emit('status', {
                connected: this.botClient?.isReady() || false,
                qr: this.botClient?.qrCode || null
            });

            socket.on('disconnect', () => {
                console.log('🔌 Web client disconnected');
            });
        });

        const port = process.env.WEB_PORT || 5000;
        this.server.listen(port, '0.0.0.0', () => {
            console.log(`🌐 Web interface available at http://0.0.0.0:${port}`);
        });
    }

    setupEventHandlers() {
        // Bot events
        if (this.botClient) {
            this.botClient.on('qr', (qr) => {
                console.log('📱 QR Code generated. Scan with WhatsApp:');
                qrcode.generate(qr, { small: true });
                
                if (this.io) {
                    this.io.emit('qr', qr);
                }
            });

            this.botClient.on('ready', () => {
                console.log('✅ WhatsApp client is ready!');
                
                if (this.io) {
                    this.io.emit('status', { connected: true, qr: null });
                }
            });

            this.botClient.on('authenticated', () => {
                console.log('🔐 Client authenticated successfully');
            });

            this.botClient.on('pairing_code', (code) => {
                console.log('🔐 Pairing Code generated:');
                console.log(`📱 Enter this code in WhatsApp: ${code}`);
                console.log('📲 Go to WhatsApp Settings > Linked Devices > Link a Device');
            });

            this.botClient.on('auth_failure', (msg) => {
                console.error('❌ Authentication failed:', msg);
            });

            this.botClient.on('disconnected', (reason) => {
                console.log('🔌 Client disconnected:', reason);
                
                if (this.io) {
                    this.io.emit('status', { connected: false, qr: null });
                }
            });

            // Archive outgoing messages
            this.botClient.on('message_sent', async (message) => {
                if (this.botClient.messageArchiver) {
                    await this.botClient.messageArchiver.archiveMessage(message, true);
                }
            });
            
            // Handle reconnection
            this.botClient.on('reconnected', async () => {
                await this.handleReconnection();
            });
        }

        // Process handlers
        process.on('SIGINT', async () => {
            console.log('\n🛑 Shutting down gracefully...');
            await this.shutdown();
            process.exit(0);
        });

        process.on('uncaughtException', (error) => {
            console.error('💥 Uncaught Exception:', error);
            this.performanceMonitor?.recordError(error);
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
            this.performanceMonitor?.recordError(new Error(reason));
        });
    }

    async shutdown() {
        try {
            console.log('🔄 Shutting down components...');

            if (this.hotReloader) {
                await this.hotReloader.stop();
            }

            if (this.botClient) {
                await this.botClient.destroy();
            }

            if (this.server) {
                this.server.close();
            }

            if (this.performanceMonitor) {
                await this.performanceMonitor.shutdown();
            }

            console.log('✅ Shutdown complete');
        } catch (error) {
            console.error('❌ Error during shutdown:', error);
        }
    }

    async start() {
        try {
            await this.initialize();
            console.log('🚀 WhatsApp Personal Assistant Bot is running!');
        } catch (error) {
            console.error('💥 Failed to start bot:', error);
            process.exit(1);
        }
    }
}

// Start the bot
const bot = new WhatsAppBot();
bot.start();

module.exports = WhatsAppBot;
