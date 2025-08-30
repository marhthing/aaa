const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    generateWAMessageFromContent,
    downloadMediaMessage
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const EventEmitter = require('events')
const path = require('path')
const fs = require('fs-extra')

const config = require('../config')
const utils = require('./utils')

// Simple logger without complex transport for now
const logger = {
    info: console.log,
    error: console.error,
    warn: console.warn
}

class Client extends EventEmitter {
    constructor() {
        super()
        
        this.socket = null
        this.isReady = false
        this.qrCode = null
        this.ownerJid = null
        this.plugins = new Map()
        this.allowedUsers = new Map()
        this.messageCache = new Map()
        
        // Initialize required directories
        this.initializeDirectories()
    }

    async initializeDirectories() {
        for (const dir of config.REQUIRED_DIRS) {
            await fs.ensureDir(path.join(__dirname, '..', dir))
        }
    }

    async connect() {
        try {
            logger.info('🔧 Initializing WhatsApp client...')
            
            // Initialize authentication
            const authPath = path.join(config.SESSION_DIR, config.SESSION_ID || 'main', 'auth')
            const { state, saveCreds } = await useMultiFileAuthState(authPath)

            // Create WhatsApp socket
            this.socket = makeWASocket({
                auth: state,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                browser: ['MATDEV', 'Chrome', '1.0.0'],
                defaultQueryTimeoutMs: 60000
            })

            // Setup event handlers
            this.setupEventHandlers(saveCreds)
            
            // Load plugins
            await this.loadPlugins()

        } catch (error) {
            logger.error('❌ Failed to initialize client:', error)
            throw error
        }
    }

    setupEventHandlers(saveCreds) {
        // Credentials update
        this.socket.ev.on('creds.update', saveCreds)

        // Connection updates
        this.socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update

            if (qr) {
                logger.info('📱 QR Code generated')
                this.qrCode = qr
                this.emit('qr', qr)
                
                // Generate pairing code if phone number is provided
                if (config.PHONE_NUMBER && config.AUTH_METHOD === '2') {
                    try {
                        const code = await this.socket.requestPairingCode(config.PHONE_NUMBER)
                        this.emit('pairing_code', code)
                    } catch (error) {
                        logger.error('Failed to generate pairing code:', error)
                    }
                }
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
                
                if (shouldReconnect) {
                    logger.info('🔄 Reconnecting...')
                    setTimeout(() => this.connect(), 3000)
                } else {
                    logger.error('❌ Logged out')
                    this.emit('auth_failure', 'Logged out')
                }
                
                this.emit('disconnected', lastDisconnect?.error)
                
            } else if (connection === 'open') {
                logger.info('✅ WhatsApp connected successfully!')
                
                this.isReady = true
                this.ownerJid = this.socket.user.id
                
                // Save owner JID to config
                if (config.SESSION_ID) {
                    await this.updateSessionJid(this.ownerJid)
                }
                
                logger.info(`🔐 Bot ready! Operating as: ${this.ownerJid}`)
                this.emit('ready')
            }
        })

        // Messages
        this.socket.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return
            
            for (const message of messages) {
                await this.handleMessage(message)
            }
        })
    }

    async handleMessage(message) {
        try {
            // Skip own messages and invalid messages
            if (message.key.fromMe || !message.message) return

            const jid = message.key.remoteJid
            const text = utils.getMessageText(message)
            
            // Archive message if enabled
            if (config.ENABLE_MESSAGE_ARCHIVE) {
                await this.archiveMessage(message)
            }

            // Check if it's a command
            if (text?.startsWith(config.PREFIX)) {
                await this.handleCommand(message, text)
            }
            
        } catch (error) {
            logger.error('Error handling message:', error)
        }
    }

    async handleCommand(message, text) {
        const jid = message.key.remoteJid
        const args = text.slice(config.PREFIX.length).trim().split(' ')
        const command = args.shift()?.toLowerCase()
        
        if (!command) return

        // Check access permissions
        if (!this.hasAccess(message.key.participant || jid, command)) {
            return
        }

        // Add loading reaction
        if (config.LOADING_EMOJI && this.socket) {
            await utils.addReaction(this.socket, message.key, config.LOADING_EMOJI)
        }

        try {
            // Execute plugin command
            const plugin = this.findPluginForCommand(command)
            if (plugin) {
                const context = {
                    socket: this.socket,
                    message,
                    args,
                    command,
                    jid,
                    ownerJid: this.ownerJid,
                    reply: (text, options) => utils.sendMessage(this.socket, jid, text, options),
                    react: (emoji) => utils.addReaction(this.socket, message.key, emoji)
                }
                
                await plugin.executeCommand(command, context)
                
                // Success reaction
                if (config.SUCCESS_EMOJI) {
                    await utils.addReaction(this.socket, message.key, config.SUCCESS_EMOJI)
                }
            }
            
        } catch (error) {
            logger.error(`Error executing command ${command}:`, error)
            
            // Error reaction
            if (config.ERROR_EMOJI) {
                await utils.addReaction(this.socket, message.key, config.ERROR_EMOJI)
            }
        }
    }

    hasAccess(jid, command) {
        // Owner always has access
        if (jid === this.ownerJid) return true
        
        // Check if user is allowed for this command
        if (config.OWNER_ONLY) {
            const allowedCommands = this.allowedUsers.get(jid) || []
            return allowedCommands.includes(command) || allowedCommands.includes('*')
        }
        
        return true
    }

    findPluginForCommand(command) {
        for (const plugin of this.plugins.values()) {
            if (plugin.commands && plugin.commands.includes(command)) {
                return plugin
            }
        }
        return null
    }

    async loadPlugins() {
        try {
            logger.info('🔧 Loading plugins...')
            
            const pluginsDir = config.PLUGINS_DIR
            if (!await fs.pathExists(pluginsDir)) {
                logger.warn('Plugins directory not found')
                return
            }

            const pluginFolders = await fs.readdir(pluginsDir)
            
            for (const folder of pluginFolders) {
                if (folder.startsWith('_') || folder.startsWith('.')) continue
                
                try {
                    await this.loadPlugin(folder)
                } catch (error) {
                    logger.error(`Failed to load plugin ${folder}:`, error)
                }
            }
            
            logger.info(`✅ Loaded ${this.plugins.size} plugins`)
            
        } catch (error) {
            logger.error('Failed to load plugins:', error)
        }
    }

    async loadPlugin(folderName) {
        const pluginPath = path.join(config.PLUGINS_DIR, folderName)
        const indexPath = path.join(pluginPath, 'index.js')
        const manifestPath = path.join(pluginPath, 'plugin.json')
        
        if (!await fs.pathExists(indexPath)) {
            throw new Error(`Plugin ${folderName} missing index.js`)
        }

        // Load manifest if exists
        let manifest = { ...config.PLUGIN_DEFAULTS }
        if (await fs.pathExists(manifestPath)) {
            const manifestData = await fs.readJson(manifestPath)
            manifest = { ...manifest, ...manifestData }
        }

        // Skip if disabled
        if (!manifest.enabled) {
            logger.info(`⏭️ Plugin ${folderName} is disabled`)
            return
        }

        // Clear require cache for hot reload
        delete require.cache[require.resolve(indexPath)]
        
        // Load plugin class
        const PluginClass = require(indexPath)
        const plugin = new PluginClass()
        
        // Initialize plugin
        if (typeof plugin.initialize === 'function') {
            await plugin.initialize()
        }
        
        // Get plugin commands
        plugin.commands = []
        if (typeof plugin.getCommands === 'function') {
            plugin.commands = plugin.getCommands()
        }
        
        this.plugins.set(folderName, plugin)
        logger.info(`✅ Loaded plugin: ${folderName}`)
    }

    async archiveMessage(message) {
        try {
            const messageData = {
                key: message.key,
                message: message.message,
                messageTimestamp: message.messageTimestamp,
                archived: new Date().toISOString()
            }
            
            const date = new Date()
            const year = date.getFullYear()
            const month = String(date.getMonth() + 1).padStart(2, '0')
            const day = String(date.getDate()).padStart(2, '0')
            
            const archivePath = path.join(
                config.MESSAGES_DIR,
                year.toString(),
                month,
                `${day}.json`
            )
            
            await fs.ensureDir(path.dirname(archivePath))
            
            let messages = []
            if (await fs.pathExists(archivePath)) {
                messages = await fs.readJson(archivePath)
            }
            
            messages.push(messageData)
            await fs.writeJson(archivePath, messages)
            
        } catch (error) {
            logger.error('Failed to archive message:', error)
        }
    }

    async updateSessionJid(jid) {
        try {
            const sessionConfigPath = path.join(config.SESSION_DIR, config.SESSION_ID, 'config.json')
            
            if (await fs.pathExists(sessionConfigPath)) {
                const sessionConfig = await fs.readJson(sessionConfigPath)
                sessionConfig.ownerJid = jid
                sessionConfig.lastActive = new Date().toISOString()
                await fs.writeJson(sessionConfigPath, sessionConfig)
            }
            
        } catch (error) {
            logger.error('Failed to update session JID:', error)
        }
    }

    allowCommand(jid, command) {
        const current = this.allowedUsers.get(jid) || []
        if (!current.includes(command)) {
            current.push(command)
            this.allowedUsers.set(jid, current)
        }
    }

    disallowCommand(jid, command) {
        const current = this.allowedUsers.get(jid) || []
        const filtered = current.filter(c => c !== command)
        this.allowedUsers.set(jid, filtered)
    }

    getStatus() {
        return {
            ready: this.isReady,
            ownerJid: this.ownerJid,
            pluginsLoaded: this.plugins.size,
            uptime: process.uptime()
        }
    }

    async destroy() {
        if (this.socket) {
            await this.socket.logout()
        }
        this.isReady = false
    }
}

module.exports = { Client }