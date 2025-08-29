const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    jidNormalizedUser
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs-extra');
const qrcode = require('qrcode-terminal');

const config = require('../config');
const { getCommandHandler } = require('./plugins');

// Global plugins registry
const pluginCommands = new Map();

class Client extends EventEmitter {
    constructor() {
        super();
        
        this.sock = null;
        this.isConnected = false;
        this.qrGenerated = false;
        this.ownerJid = config.OWNER_JID;
        
        // Session info
        this.sessionDir = config.SESSION_DIR;
        this.authDir = path.join(this.sessionDir, 'auth');
        
        this.logger = pino({ 
            level: config.LOG_LEVEL,
            transport: {
                target: 'pino-pretty',
                options: { colorize: true }
            }
        });
    }

    async connect() {
        try {
            this.logger.info(`🚀 Starting ${config.BOT_NAME}...`);
            
            // Setup authentication
            const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
            
            // Create WhatsApp socket
            this.sock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: config.BAILEYS_LOG_LVL }),
                browser: [config.BOT_NAME, 'Chrome', '1.0.0'],
                generateHighQualityLinkPreview: true
            });

            // Handle credentials update
            this.sock.ev.on('creds.update', saveCreds);
            
            // Handle connection updates
            this.sock.ev.on('connection.update', (update) => {
                this.handleConnectionUpdate(update);
            });

            // Handle messages
            this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type === 'notify') {
                    for (const message of messages) {
                        await this.handleMessage(message);
                    }
                }
            });
            
            this.logger.info(`✅ ${config.BOT_NAME} initialized successfully`);
            
        } catch (error) {
            this.logger.error('❌ Failed to connect:', error);
            throw error;
        }
    }

    async handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr && !this.qrGenerated) {
            if (config.AUTH_METHOD === '1') {
                console.log('\n📱 Scan this QR code with WhatsApp:');
                qrcode.generate(qr, { small: true });
                this.qrGenerated = true;
            }
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            
            if (shouldReconnect) {
                this.logger.info('🔄 Reconnecting...');
                setTimeout(() => this.connect(), 3000);
            } else {
                this.logger.info('🔐 Logged out. Please restart to reconnect.');
            }
        } else if (connection === 'open') {
            this.isConnected = true;
            this.logger.info('✅ Connected to WhatsApp');
            
            // Get owner JID if not set
            if (!this.ownerJid && this.sock.user) {
                this.ownerJid = jidNormalizedUser(this.sock.user.id);
                this.logger.info(`👑 Owner JID detected: ${this.ownerJid}`);
                
                // Update session registry with owner JID
                await this.updateSessionOwner();
                
                // Load plugins only after authentication is complete
                await this.loadPlugins();
            }
        }
    }

    async handleMessage(message) {
        try {
            if (!message.message) return;
            
            // Process plugin commands
            await this.processPluginCommands(message);
            
        } catch (error) {
            this.logger.error('❌ Error handling message:', error);
        }
    }

    async processPluginCommands(message) {
        try {
            const messageText = this.getMessageText(message);
            if (!messageText) return;
            
            const prefix = config.PREFIX;
            if (!messageText.startsWith(prefix)) return;
            
            const [command, ...args] = messageText.slice(prefix.length).split(' ');
            const match = args.join(' ');
            
            // Find matching plugin
            const pluginHandler = getCommandHandler(command.toLowerCase());
            if (pluginHandler) {
                const messageContext = this.createMessageContext(message);
                await pluginHandler.handler(messageContext, match);
            }
            
        } catch (error) {
            this.logger.error('❌ Error processing plugin command:', error);
        }
    }

    createMessageContext(message) {
        return {
            message,
            sock: this.sock,
            sender: message.key.participant || message.key.remoteJid,
            isGroup: message.key.remoteJid.endsWith('@g.us'),
            isOwner: this.isOwner(message.key.participant || message.key.remoteJid),
            send: async (content, options = {}) => {
                return await this.sock.sendMessage(message.key.remoteJid, { text: content }, { quoted: options.quoted ? message : undefined });
            },
            reply: async (content) => {
                return await this.sock.sendMessage(message.key.remoteJid, { text: content }, { quoted: message });
            }
        };
    }

    isOwner(jid) {
        if (!jid || !this.ownerJid) return false;
        return jidNormalizedUser(jid) === this.ownerJid;
    }

    getMessageText(message) {
        return message.message?.conversation ||
               message.message?.extendedTextMessage?.text ||
               message.message?.imageMessage?.caption ||
               message.message?.videoMessage?.caption ||
               '';
    }

    async loadPlugins() {
        try {
            this.logger.info('📦 Loading plugins...');
            
            const pluginFiles = await fs.readdir(config.PLUGIN_DIR).catch(() => []);
            
            for (const file of pluginFiles) {
                if (file.endsWith('.js')) {
                    try {
                        await this.loadPlugin(path.join(config.PLUGIN_DIR, file));
                    } catch (error) {
                        this.logger.error(`❌ Failed to load plugin ${file}:`, error);
                    }
                }
            }
            
            this.logger.info(`✅ Loaded plugins successfully`);
            
        } catch (error) {
            this.logger.error('❌ Error loading plugins:', error);
        }
    }

    async loadPlugin(pluginPath) {
        try {
            // Clear require cache for hot reload
            delete require.cache[require.resolve(pluginPath)];
            
            // Load plugin using require instead of eval for better error handling
            const plugin = require(pluginPath);
            
            // If plugin exports a function, call it with the bot instance
            if (typeof plugin === 'function') {
                plugin(this.registerPluginCommand.bind(this));
            }
            
            this.logger.info(`✅ Loaded plugin: ${path.basename(pluginPath)}`);
            
        } catch (error) {
            this.logger.error(`❌ Error loading plugin ${path.basename(pluginPath)}:`, error.message);
        }
    }

    async updateSessionOwner() {
        try {
            const sessionsDir = path.dirname(this.sessionDir);
            const registryPath = path.join(sessionsDir, 'session_registry.json');
            const sessionConfigPath = path.join(this.sessionDir, 'config.json');
            
            if (await fs.pathExists(registryPath) && await fs.pathExists(sessionConfigPath)) {
                // Update session registry
                const registry = await fs.readJSON(registryPath);
                const sessionIndex = registry.sessions.findIndex(s => s.id === config.WHATSAPP_SESSION_ID);
                
                if (sessionIndex >= 0) {
                    registry.sessions[sessionIndex].ownerJid = this.ownerJid;
                    registry.sessions[sessionIndex].authStatus = 'authenticated';
                    registry.sessions[sessionIndex].lastActive = new Date().toISOString();
                    await fs.writeJSON(registryPath, registry, { spaces: 2 });
                }
                
                // Update session config
                const sessionConfig = await fs.readJSON(sessionConfigPath);
                sessionConfig.ownerJid = this.ownerJid;
                sessionConfig.authStatus = 'authenticated';
                sessionConfig.lastActive = new Date().toISOString();
                await fs.writeJSON(sessionConfigPath, sessionConfig, { spaces: 2 });
                
                this.logger.info('📝 Updated session registry with owner JID');
            }
        } catch (error) {
            this.logger.error('❌ Error updating session owner:', error);
        }
    }

    registerPluginCommand(commandConfig, handler) {
        const patterns = Array.isArray(commandConfig.pattern) ? commandConfig.pattern : [commandConfig.pattern];
        
        for (const pattern of patterns) {
            // Extract command from pattern
            const command = pattern.replace(/[^\w]/g, '').split(' ')[0].toLowerCase();
            if (command) {
                const { registerPluginCommand } = require('./plugins');
                registerPluginCommand(commandConfig, handler, config.WHATSAPP_SESSION_ID || 'default');
            }
        }
    }
}

// Export for levanter-style usage
const logger = pino({ 
    level: config.LOG_LEVEL,
    transport: {
        target: 'pino-pretty',
        options: { colorize: true }
    }
});

module.exports = { Client, logger };