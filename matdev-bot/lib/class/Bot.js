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
            
            // Get authentication state from database
            const { state, saveCreds } = await this.sessionManager.getAuthState(this.config.SESSION_ID);
            
            // Create WhatsApp socket
            this.sock = makeWASocket({
                auth: state,
                logger: logger.child({ module: 'baileys' }),
                generateHighQualityLinkPreview: true,
                markOnlineOnConnect: this.config.AUTO_ONLINE,
                defaultQueryTimeoutMs: 60000
            });
            
            // Set up event handlers
            this.setupEventHandlers(saveCreds);
            
            // Load plugins
            await this.pluginManager.loadAll();
            
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
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                this.qr = qr;
                console.log('📱 QR Code for session:', this.config.SESSION_ID);
                qrcode.generate(qr, { small: true });
                logger.info('📱 QR Code generated. Scan with WhatsApp to connect.');
                
                // Save QR code to session
                await this.sessionManager.createQRSession(this.config.SESSION_ID);
            }
            
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                
                logger.warn('Connection closed:', lastDisconnect?.error);
                this.isConnected = false;
                this.emit('disconnected');
                
                if (shouldReconnect && this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    logger.info(`🔄 Reconnecting... (${this.retryCount}/${this.maxRetries})`);
                    setTimeout(() => this.start(), 5000);
                } else if (this.retryCount >= this.maxRetries) {
                    logger.error('❌ Max reconnection attempts reached');
                    this.emit('error', new Error('Max reconnection attempts reached'));
                }
            } else if (connection === 'open') {
                this.isConnected = true;
                this.retryCount = 0;
                this.qr = null;
                
                logger.info('🟢 WhatsApp connected successfully');
                this.emit('ready');
                
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
