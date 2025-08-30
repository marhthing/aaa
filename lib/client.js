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

// Simple logger
const logger = {
    info: console.log,
    error: console.error,
    warn: console.warn
}

// Plugin storage
const plugins = []

// Bot function like Levanter's approach
function bot(commandConfig, handler) {
    plugins.push({
        pattern: commandConfig.pattern,
        desc: commandConfig.desc || 'No description',
        type: commandConfig.type || 'misc',
        handler: handler
    })
}

class Client extends EventEmitter {
    constructor() {
        super()
        
        this.socket = null
        this.isReady = false
        this.qrCode = null
        this.ownerJid = null
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
                logger.info('📱 QR Code generated - Please scan with WhatsApp')
                console.log('\n' + '='.repeat(50))
                console.log('QR CODE GENERATED')
                console.log('Please scan this QR code with WhatsApp:')
                console.log('1. Open WhatsApp on your phone')
                console.log('2. Tap Menu or Settings > Linked Devices')
                console.log('3. Tap "Link a Device"')
                console.log('4. Scan the QR code below')
                console.log('='.repeat(50))
                
                // Display QR in terminal
                const QRCode = require('qrcode')
                const qrString = await QRCode.toString(qr, { type: 'terminal', small: true })
                console.log(qrString)
                
                this.qrCode = qr
                this.emit('qr', qr)
                
                // Generate pairing code if phone number is provided
                if (config.PHONE_NUMBER && config.AUTH_METHOD === '2') {
                    try {
                        const code = await this.socket.requestPairingCode(config.PHONE_NUMBER)
                        logger.info(`📱 Pairing Code: ${code}`)
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
            
            // Log incoming message for debugging
            if (config.DEBUG_MODE) {
                logger.info(`📨 Message from ${jid}: ${text}`)
            }
            
            // Archive message if enabled
            if (config.ENABLE_MESSAGE_ARCHIVE) {
                await this.archiveMessage(message)
            }

            // Check if it's a command
            if (text?.startsWith(config.PREFIX)) {
                logger.info(`🔧 Command detected: ${text}`)
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
            const plugin = this.findPluginForCommand(text)
            if (plugin) {
                // Extract match from pattern
                const regex = new RegExp(plugin.pattern.replace(/\?\.\*/g, '(.*)'), 'i')
                const match = text.match(regex)
                
                const messageObj = {
                    jid,
                    text,
                    key: message.key,
                    message: message.message,
                    send: (text, options) => utils.sendMessage(this.socket, jid, text, options),
                    reply: (text) => utils.sendMessage(this.socket, jid, text, { quoted: message }),
                    react: (emoji) => utils.addReaction(this.socket, message.key, emoji)
                }
                
                await plugin.handler(messageObj, match ? match[1] : '')
                
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
        // Clean JID for comparison
        const cleanJid = jid.split('@')[0]
        const cleanOwner = this.ownerJid?.split('@')[0]
        
        // Owner always has access
        if (cleanJid === cleanOwner || jid === this.ownerJid) {
            return true
        }
        
        // If owner only mode is disabled, allow all
        if (!config.OWNER_ONLY) {
            return true
        }
        
        // Check if user is in sudo list
        if (config.SUDO) {
            const sudoUsers = config.SUDO.split(',').map(u => u.trim())
            if (sudoUsers.includes(cleanJid) || sudoUsers.includes(jid)) {
                return true
            }
        }
        
        // Check if user is allowed for this command
        const allowedCommands = this.allowedUsers.get(jid) || []
        return allowedCommands.includes(command) || allowedCommands.includes('*')
    }

    findPluginForCommand(text) {
        for (const plugin of plugins) {
            // Check if text matches pattern
            const regex = new RegExp(plugin.pattern.replace(/\?\.\*/g, '(.*)'), 'i')
            if (regex.test(text)) {
                return plugin
            }
        }
        return null
    }

    async loadPlugins() {
        try {
            logger.info('🔧 Loading plugins...')
            
            // Clear plugins array
            plugins.length = 0
            
            const pluginsDir = config.PLUGINS_DIR
            if (!await fs.pathExists(pluginsDir)) {
                logger.warn('Plugins directory not found')
                return
            }

            const pluginFiles = await fs.readdir(pluginsDir)
            
            for (const file of pluginFiles) {
                if (!file.endsWith('.js') || file.startsWith('_')) continue
                
                try {
                    const pluginPath = path.join(pluginsDir, file)
                    
                    // Clear require cache for hot reload
                    delete require.cache[require.resolve(pluginPath)]
                    
                    // Load plugin file (will register itself via bot() function)
                    require(pluginPath)
                    
                } catch (error) {
                    logger.error(`Failed to load plugin ${file}:`, error)
                }
            }
            
            logger.info(`✅ Loaded ${plugins.length} plugins`)
            
        } catch (error) {
            logger.error('Failed to load plugins:', error)
        }
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
            pluginsLoaded: plugins.length,
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

module.exports = { Client, bot, logger }