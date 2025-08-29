/**
 * MatDev Bot Core Class
 * Main bot initialization and connection management
 */

const { EventEmitter } = require('events');
const { default: makeWASocket, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');
const path = require('path');

const Plugin = require('./Plugin');
const Command = require('./Command');
const Database = require('./Database');
const SessionManager = require('../utils/sessionManager');
const messageHandler = require('../handlers/messageHandler');
const eventHandler = require('../handlers/eventHandler');
const logger = require('../utils/logger');
const { AntiSpam, RateLimit } = require('../utils/security');
const Cache = require('../utils/cache');

class Bot extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.sock = null;
        this.qr = null;
        this.isConnected = false;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.connectionMethod = null; // 'qr' or 'pairing'
        this.waitingForUserChoice = false;

        // Initialize components
        this.database = new Database();
        this.sessionManager = new SessionManager();
        this.commandManager = new Command(this);
        this.pluginManager = new Plugin(this);
        this.cache = new Cache();
        this.antiSpam = new AntiSpam();
        this.rateLimit = new RateLimit();

        logger.info('🤖 MatDev Bot initialized');
    }

    /**
     * Start the bot connection
     */
    async start() {
        try {
            logger.info('🔌 Starting WhatsApp connection...');

            // Check for existing session or create new one
            const sessionId = 'matdev_session';
            logger.info('📱 Checking for existing session...');

            // Get authentication state from database (auto-creates if needed)
            const { state, saveCreds } = await this.sessionManager.getAuthState(sessionId);

            // Create WhatsApp socket with minimal logging
            this.sock = makeWASocket({
                auth: state,
                logger: logger.child({ module: 'baileys', level: 'warn' }), // Only show warnings and errors
                generateHighQualityLinkPreview: true,
                markOnlineOnConnect: this.config.AUTO_ONLINE,
                defaultQueryTimeoutMs: 60000
            });

            // Set up event handlers
            this.setupEventHandlers(saveCreds);

            logger.info('✅ Bot started successfully');

        } catch (error) {
            logger.error('Failed to start bot:', error);
            throw error;
        }
    }

    /**
     * Set up WhatsApp event handlers
     */
    setupEventHandlers(saveCreds) {
        // Connection events
        this.sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr, receivedPendingNotifications } = update;

            if (qr) {
                this.qr = qr;
                // Only show QR if user hasn't made a choice yet
                if (!this.connectionMethod) {
                    await this.askConnectionMethod(qr);
                } else if (this.connectionMethod === 'qr') {
                    this.displayQRCode(qr);
                }
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                const statusCode = lastDisconnect?.error?.output?.statusCode;

                console.log('❌ WhatsApp connection closed');
                logger.warn('Connection closed:', lastDisconnect?.error);
                this.isConnected = false;
                this.emit('disconnected');

                // Handle different disconnect reasons - only clear session on actual auth failures
                if (statusCode === DisconnectReason.badSession || statusCode === DisconnectReason.loggedOut) {
                    console.log('🔄 Session expired or logged out - clearing session');
                    console.log('📱 Need to reconnect WhatsApp');

                    // Clear the session and restart
                    await this.clearSession();
                    setTimeout(() => this.start(), 2000);
                } else if (statusCode === DisconnectReason.restartRequired) {
                    console.log('🔄 Restart required - reconnecting without clearing session');
                    setTimeout(() => this.start(), 2000);
                } else if (shouldReconnect && this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    console.log(`🔄 Reconnecting... (${this.retryCount}/${this.maxRetries})`);
                    logger.info(`🔄 Reconnecting... (${this.retryCount}/${this.maxRetries})`);
                    setTimeout(() => this.start(), 5000);
                } else if (this.retryCount >= this.maxRetries) {
                    console.log('❌ Max reconnection attempts reached');
                    console.log('🔄 Clearing session and restarting...');
                    logger.error('❌ Max reconnection attempts reached, clearing session');

                    // Clear session and restart fresh
                    await this.clearSession();
                    setTimeout(() => this.start(), 2000);
                }
            } else if (connection === 'open') {
                this.isConnected = true;
                this.retryCount = 0;
                this.qr = null;
                this.connectionMethod = null; // Reset for future connections

                logger.info('🟢 WhatsApp connected successfully');
                console.log('\n' + '='.repeat(50));
                console.log('✅ WHATSAPP CONNECTION SUCCESSFUL!');
                console.log('='.repeat(50));
                console.log('🎉 Bot is now active and ready to use');
                console.log('🤖 All plugins loaded and commands available');
                console.log('📱 You will receive a confirmation message in WhatsApp');
                console.log('💾 Session saved for future automatic reconnection');
                console.log('='.repeat(50) + '\n');

                // Load plugins after successful connection
                await this.pluginManager.loadAll();
                logger.info('🔌 All plugins loaded successfully');

                this.emit('ready');

                // Send confirmation message to user
                const userJid = this.sock.user?.id;
                if (userJid) {
                    try {
                        await this.sock.sendMessage(userJid, {
                            text: `🎉 *MatDev Bot Connected Successfully!*\n\n✅ Your WhatsApp is now linked to MatDev Bot\n🤖 Bot Name: ${this.config.BOT_NAME}\n⏰ Connected at: ${new Date().toLocaleString()}\n\n*MatDev Bot is now active and ready to use!*\n\nType \`${this.config.PREFIX}help\` to see available commands.\n\n_Thank you for using MatDev Bot! 🚀_`
                        });
                        logger.info('📧 Confirmation message sent to user');
                    } catch (error) {
                        logger.error('Failed to send confirmation message:', error);
                    }
                }

                // Set status
                if (this.config.AUTO_ONLINE) {
                    await this.updatePresence('available');
                }
            }
        });

        


        // Save credentials
        this.sock.ev.on('creds.update', saveCreds);

        // Message events
        this.sock.ev.on('messages.upsert', async (m) => {
            try {
                await messageHandler(this, m);
            } catch (error) {
                logger.error('Message handler error:', error);
            }
        });

        // Group events
        this.sock.ev.on('groups.upsert', async (groups) => {
            try {
                await eventHandler.handleGroupsUpsert(this, groups);
            } catch (error) {
                logger.error('Group upsert handler error:', error);
            }
        });

        // Call events
        this.sock.ev.on('call', async (calls) => {
            try {
                if (this.config.REJECT_CALLS) {
                    for (const call of calls) {
                        await this.sock.rejectCall(call.id, call.from);
                        logger.info(`📞 Rejected call from ${call.from}`);
                    }
                }
            } catch (error) {
                logger.error('Call handler error:', error);
            }
        });
    }

    /**
     * Send a message
     */
    async sendMessage(jid, content, options = {}) {
        try {
            if (!this.isConnected) {
                throw new Error('Bot is not connected');
            }

            // Auto-read messages if enabled
            if (this.config.AUTO_READ && !options.skipRead) {
                await this.sock.readMessages([{ remoteJid: jid, id: options.messageId }]);
            }

            return await this.sock.sendMessage(jid, content, options);
        } catch (error) {
            logger.error('Failed to send message:', error);
            throw error;
        }
    }

    /**
     * Update presence status
     */
    async updatePresence(status, jid = null) {
        try {
            if (!this.isConnected) return;

            if (jid) {
                await this.sock.sendPresenceUpdate(status, jid);
            } else {
                await this.sock.sendPresenceUpdate(status);
            }
        } catch (error) {
            logger.error('Failed to update presence:', error);
        }
    }

    /**
     * Get user/group info
     */
    async getInfo(jid) {
        try {
            if (jid.endsWith('@g.us')) {
                return await this.sock.groupMetadata(jid);
            } else {
                return await this.sock.onWhatsApp(jid);
            }
        } catch (error) {
            logger.error('Failed to get info:', error);
            return null;
        }
    }

    /**
     * Check if user is admin
     */
    async isAdmin(jid, userJid) {
        try {
            if (!jid.endsWith('@g.us')) return false;

            const groupMeta = await this.sock.groupMetadata(jid);
            const participant = groupMeta.participants.find(p => p.id === userJid);
            return participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
        } catch (error) {
            logger.error('Failed to check admin status:', error);
            return false;
        }
    }

    /**
     * Check if user is sudo
     */
    isSudo(userJid) {
        return this.config.SUDO_USERS.includes(userJid);
    }

    /**
     * Ask user to choose connection method
     */
    async askConnectionMethod(qr) {
        if (this.waitingForUserChoice) return;

        this.waitingForUserChoice = true;
        const readline = require('readline');

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log('\n' + '='.repeat(60));
        console.log('🔗 WHATSAPP CONNECTION SETUP');
        console.log('='.repeat(60));
        console.log('📱 Choose your preferred connection method:');
        console.log('');
        console.log('   1️⃣  QR Code - Scan with your phone camera');
        console.log('   2️⃣  8-Digit Pairing Code - Enter code manually');
        console.log('');
        console.log('='.repeat(60));

        rl.question('👉 Enter your choice (1 for QR Code, 2 for Pairing Code): ', async (answer) => {
            rl.close();
            this.waitingForUserChoice = false;

            if (answer.trim() === '1') {
                this.connectionMethod = 'qr';
                this.displayQRCode(qr);
            } else if (answer.trim() === '2') {
                this.connectionMethod = 'pairing';
                await this.setupPairingCode();
            } else {
                console.log('❌ Invalid choice! Please restart and choose 1 or 2');
                process.exit(1);
            }
        });
    }

    /**
     * Display QR Code for scanning
     */
    displayQRCode(qr) {
        console.log('\n' + '='.repeat(50));
        console.log('📱 QR CODE FOR WHATSAPP CONNECTION');
        console.log('='.repeat(50));
        console.log('📲 Instructions:');
        console.log('   1. Open WhatsApp on your phone');
        console.log('   2. Go to Settings → Linked Devices');
        console.log('   3. Tap "Link a Device"');
        console.log('   4. Scan the QR code below');
        console.log('   5. Wait for connection confirmation');
        console.log('='.repeat(50));
        console.log('\n📱 QR CODE:\n');

        qrcode.generate(qr, { small: true });

        console.log('\n' + '='.repeat(50));
        console.log('⏳ Waiting for WhatsApp connection...');
        console.log('='.repeat(50) + '\n');

        logger.info('📱 QR Code displayed for scanning');
    }

    /**
     * Setup 8-digit pairing code
     */
    async setupPairingCode() {
        const readline = require('readline');

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log('\n' + '='.repeat(50));
        console.log('🔢 8-DIGIT PAIRING CODE SETUP');
        console.log('='.repeat(50));
        console.log('📱 Instructions:');
        console.log('   1. Open WhatsApp on your phone');
        console.log('   2. Go to Settings → Linked Devices');
        console.log('   3. Tap "Link a Device"');
        console.log('   4. Select "Link with phone number instead"');
        console.log('   5. Enter the 8-digit code shown below');
        console.log('='.repeat(50));

        rl.question('📞 Enter your phone number (with country code, e.g. +1234567890): ', async (phoneNumber) => {
            rl.close();

            if (!phoneNumber.startsWith('+')) {
                console.log('❌ Phone number must include country code (e.g., +1234567890)');
                process.exit(1);
            }

            try {
                // Generate pairing code
                const code = await this.sock.requestPairingCode(phoneNumber.replace(/\D/g, ''));

                console.log('\n' + '='.repeat(50));
                console.log('🔢 YOUR 8-DIGIT PAIRING CODE:');
                console.log('='.repeat(50));
                console.log(`📱 Code: ${code}`);
                console.log('='.repeat(50));
                console.log('⏳ Enter this code in WhatsApp and wait for connection...');
                console.log('='.repeat(50) + '\n');

                logger.info(`📱 Pairing code generated: ${code}`);

            } catch (error) {
                console.error('❌ Failed to generate pairing code:', error.message);
                logger.error('Failed to generate pairing code:', error);
                process.exit(1);
            }
        });
    }

    /**
     * Clear session data and restart fresh
     */
    async clearSession() {
        try {
            const fs = require('fs-extra');
            const sessionPath = './sessions/matdev_session';

            console.log('🧹 Clearing WhatsApp session...');

            if (fs.existsSync(sessionPath)) {
                await fs.remove(sessionPath);
                console.log('✅ Session cleared successfully');
                logger.info('🧹 Session data cleared');
            }

            this.retryCount = 0; // Reset retry count
            this.isConnected = false;
            this.connectionMethod = null; // Reset connection method
            this.waitingForUserChoice = false;

            console.log('📱 Ready for new WhatsApp connection');

        } catch (error) {
            console.error('❌ Failed to clear session:', error.message);
            logger.error('Failed to clear session:', error);
        }
    }

    /**
     * Disconnect the bot
     */
    async disconnect() {
        try {
            if (this.sock) {
                await this.sock.logout();
                this.sock = null;
            }
            this.isConnected = false;
            logger.info('🔌 Bot disconnected');
        } catch (error) {
            logger.error('Error during disconnect:', error);
        }
    }

    /**
     * Restart the bot
     */
    async restart() {
        logger.info('🔄 Restarting bot...');
        await this.disconnect();
        setTimeout(() => this.start(), 2000);
    }

    /**
     * Get bot statistics
     */
    getStats() {
        return {
            isConnected: this.isConnected,
            uptime: process.uptime(),
            retryCount: this.retryCount,
            pluginCount: this.pluginManager.getPluginCount(),
            memoryUsage: process.memoryUsage(),
            platform: this.config.PLATFORM
        };
    }
}

module.exports = Bot;