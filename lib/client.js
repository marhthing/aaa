const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    generateWAMessageFromContent,
    downloadMediaMessage,
    jidNormalizeUser,
    extractMessageContent
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs-extra');
const qrcode = require('qrcode-terminal');

const config = require('../config');

// Import your existing core functionality
const MessageProcessor = require('../src/core/MessageProcessor');
const AccessController = require('../src/core/AccessController');
const LoadingReaction = require('../src/core/LoadingReaction');
const MessageArchiver = require('../src/core/MessageArchiver');
const MediaVault = require('../src/core/MediaVault');
const StateEngine = require('../src/core/StateEngine');
const EventBus = require('../src/core/EventBus');

// Plugin system
const { getPlugins, loadPlugin, reloadPlugins } = require('./plugins');
const { parseGistUrls, installPlugin } = require('./utils');

// Global plugins registry
const plugins = new Map();
const pluginCommands = new Map();

class Client extends EventEmitter {
    constructor() {
        super();
        
        this.sock = null;
        this.isConnected = false;
        this.qrGenerated = false;
        
        // Core components (your existing functionality)
        this.messageProcessor = null;
        this.accessController = null;
        this.loadingReaction = null;
        this.messageArchiver = null;
        this.mediaVault = null;
        this.stateEngine = null;
        this.eventBus = null;
        
        // Session info
        this.sessionDir = config.SESSION_DIR;
        this.authDir = path.join(this.sessionDir, config.WHATSAPP_SESSION_ID, 'auth');
        this.ownerJid = config.OWNER_JID;
        
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
            this.logger.info('🚀 Starting MATDEV Bot...');
            
            // Initialize core components
            await this.initializeComponents();
            
            // Setup authentication
            const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
            
            // Create WhatsApp socket
            this.sock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: config.BAILEYS_LOG_LVL }),
                browser: ['MATDEV Bot', 'Chrome', '1.0.0'],
                generateHighQualityLinkPreview: true,
                getMessage: async (key) => {
                    if (this.messageArchiver) {
                        return await this.messageArchiver.getMessage(key);
                    }
                    return { conversation: 'Message not found' };
                }
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

            // Handle message deletions (anti-delete feature)
            this.sock.ev.on('messages.delete', async (deletions) => {
                if (this.messageProcessor) {
                    await this.messageProcessor.handleMessageDeletion(deletions);
                }
            });

            // Load plugins
            await this.loadPlugins();
            
            this.logger.info('✅ MATDEV Bot initialized successfully');
            
        } catch (error) {
            this.logger.error('❌ Failed to connect:', error);
            throw error;
        }
    }

    async initializeComponents() {
        try {
            this.logger.info('🔧 Initializing core components...');
            
            // Initialize event bus first
            this.eventBus = new EventBus();
            
            // Initialize access controller
            this.accessController = new AccessController();
            await this.accessController.initialize();
            
            // Initialize other components
            this.loadingReaction = new LoadingReaction();
            this.messageArchiver = new MessageArchiver();
            this.mediaVault = new MediaVault();
            this.stateEngine = new StateEngine();
            
            // Initialize message processor with all dependencies
            this.messageProcessor = new MessageProcessor({
                client: this.sock,
                accessController: this.accessController,
                loadingReaction: this.loadingReaction,
                messageArchiver: this.messageArchiver,
                mediaVault: this.mediaVault,
                stateEngine: this.stateEngine,
                eventBus: this.eventBus
            });
            
            this.logger.info('✅ Core components initialized');
            
        } catch (error) {
            this.logger.error('❌ Failed to initialize components:', error);
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
                this.ownerJid = jidNormalizeUser(this.sock.user.id);
                this.accessController.setOwnerJid(this.ownerJid);
                this.logger.info(`👑 Owner JID detected: ${this.ownerJid}`);
            }
        }
    }

    async handleMessage(message) {
        try {
            if (!message.message) return;
            
            // Process through your existing message processor
            if (this.messageProcessor) {
                await this.messageProcessor.processMessage(message);
            }
            
            // Also process through levanter-style plugins
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
            const pluginHandler = pluginCommands.get(command.toLowerCase());
            if (pluginHandler) {
                const messageContext = this.createMessageContext(message);
                await pluginHandler(messageContext, match);
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
            isOwner: this.accessController ? this.accessController.isOwner(message.key.participant || message.key.remoteJid) : false,
            send: async (content, options = {}) => {
                return await this.sock.sendMessage(message.key.remoteJid, { text: content }, { quoted: options.quoted ? message : undefined });
            },
            reply: async (content) => {
                return await this.sock.sendMessage(message.key.remoteJid, { text: content }, { quoted: message });
            }
        };
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
            
            this.logger.info(`✅ Loaded ${pluginCommands.size} plugin commands`);
            
        } catch (error) {
            this.logger.error('❌ Error loading plugins:', error);
        }
    }

    async loadPlugin(pluginPath) {
        try {
            // Clear require cache for hot reload
            delete require.cache[require.resolve(pluginPath)];
            
            const pluginCode = await fs.readFile(pluginPath, 'utf8');
            
            // Create a safe context for plugin execution
            const pluginContext = {
                bot: this.registerPluginCommand.bind(this),
                config,
                require,
                console,
                Buffer,
                process: { env: process.env }
            };
            
            // Execute plugin code
            const pluginFunction = new Function('bot', 'config', 'require', 'console', 'Buffer', 'process', pluginCode);
            pluginFunction.call(pluginContext, pluginContext.bot, config, require, console, Buffer, pluginContext.process);
            
            this.logger.info(`✅ Loaded plugin: ${path.basename(pluginPath)}`);
            
        } catch (error) {
            this.logger.error(`❌ Error loading plugin ${pluginPath}:`, error);
            throw error;
        }
    }

    registerPluginCommand(commandConfig, handler) {
        const patterns = Array.isArray(commandConfig.pattern) ? commandConfig.pattern : [commandConfig.pattern];
        
        for (const pattern of patterns) {
            // Extract command from pattern (handle regex patterns)
            const command = pattern.replace(/[^\w]/g, '').split(' ')[0].toLowerCase();
            if (command) {
                pluginCommands.set(command, handler);
            }
        }
    }

    // Plugin installation (levanter-style)
    async installExternalPlugin(url) {
        try {
            const axios = require('axios');
            const response = await axios.get(url);
            
            if (response.status === 200) {
                // Extract plugin name from pattern
                let pluginName = /pattern: ["'](.*)["'],/g.exec(response.data);
                if (pluginName) {
                    pluginName = pluginName[1].split(' ')[0];
                    const pluginPath = path.join(config.EPLUGIN_DIR, `${pluginName}.js`);
                    
                    await fs.ensureDir(config.EPLUGIN_DIR);
                    await fs.writeFile(pluginPath, response.data);
                    
                    // Load the plugin
                    await this.loadPlugin(pluginPath);
                    
                    return { success: true, name: pluginName, path: pluginPath };
                }
            }
            
            throw new Error('Invalid plugin format');
            
        } catch (error) {
            this.logger.error('❌ Failed to install external plugin:', error);
            throw error;
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