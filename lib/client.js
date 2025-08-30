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
        logger.info('📁 Creating required directories...')
        for (const dir of config.REQUIRED_DIRS) {
            const fullPath = path.join(__dirname, '..', dir)
            await fs.ensureDir(fullPath)
            logger.info(`✅ Directory ready: ${dir}`)
        }
    }

    async connect() {
        try {
            logger.info('🔧 Initializing WhatsApp client...')
            
            // Initialize authentication
            const authPath = path.join(config.SESSION_DIR, config.SESSION_ID || 'main', 'auth')
            await fs.ensureDir(authPath)
            
            // Check if we have existing session files
            const sessionExists = await this.hasValidSession(authPath)
            if (sessionExists) {
                logger.info('📱 Found existing session, attempting to restore...')
            } else {
                logger.info('📱 No valid session found, will need to authenticate...')
            }
            
            const { state, saveCreds } = await useMultiFileAuthState(authPath)

            // Create WhatsApp socket with improved session handling
            this.socket = makeWASocket({
                auth: state,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                browser: ['MATDEV Bot', 'Desktop', '1.0.0'],
                defaultQueryTimeoutMs: 30000,
                connectTimeoutMs: 30000,
                keepAliveIntervalMs: 30000,
                markOnlineOnConnect: config.ALWAYS_ONLINE,
                syncFullHistory: false,
                fireInitQueries: false,
                generateHighQualityLinkPreview: false,
                shouldSyncHistoryMessage: () => false,
                shouldIgnoreJid: () => false,
                retryRequestDelayMs: 250,
                maxMsgRetryCount: 3,
                getMessage: async (key) => {
                    return { conversation: 'Message not found' }
                },
                patchMessageBeforeSending: (message) => {
                    const requiresPatch = !!(
                        message.buttonsMessage ||
                        message.templateMessage ||
                        message.listMessage
                    )
                    if (requiresPatch) {
                        message = {
                            viewOnceMessage: {
                                message: {
                                    messageContextInfo: {
                                        deviceListMetadataVersion: 2,
                                        deviceListMetadata: {},
                                    },
                                    ...message,
                                }
                            }
                        }
                    }
                    return message
                }
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
                const statusCode = lastDisconnect?.error?.output?.statusCode
                
                logger.info(`📱 Connection closed. Status: ${statusCode}`)
                
                // Handle different disconnect reasons more carefully
                if (statusCode === DisconnectReason.badSession) {
                    logger.error('❌ Bad session detected - need to re-authenticate')
                    const authPath = path.join(config.SESSION_DIR, config.SESSION_ID || 'main', 'auth')
                    await fs.remove(authPath)
                    setTimeout(() => this.connect(), 2000)
                } else if (statusCode === DisconnectReason.connectionClosed) {
                    logger.info('🔄 Connection closed by server, reconnecting...')
                    setTimeout(() => this.connect(), 2000)
                } else if (statusCode === DisconnectReason.connectionLost) {
                    logger.info('🔄 Connection lost, attempting to reconnect...')
                    setTimeout(() => this.connect(), 1000)
                } else if (statusCode === DisconnectReason.connectionReplaced) {
                    logger.warn('⚠️ Another device took over this session')
                    setTimeout(() => this.connect(), 5000)
                } else if (statusCode === DisconnectReason.loggedOut) {
                    logger.error('❌ Logged out from WhatsApp - session expired')
                    const authPath = path.join(config.SESSION_DIR, config.SESSION_ID || 'main', 'auth')
                    await fs.remove(authPath)
                    setTimeout(() => this.connect(), 3000)
                } else if (statusCode === DisconnectReason.restartRequired) {
                    logger.info('🔄 WhatsApp requires restart, reconnecting...')
                    setTimeout(() => this.connect(), 1000)
                } else if (statusCode === DisconnectReason.timedOut) {
                    logger.info('⏰ Connection timed out, trying again...')
                    setTimeout(() => this.connect(), 2000)
                } else if (statusCode === 401) {
                    // Handle 401 specifically - session authentication failed
                    logger.error('🔐 Authentication failed (401) - session may be corrupted')
                    logger.info('🔄 Keeping session and trying to reconnect...')
                    setTimeout(() => this.connect(), 5000)
                } else {
                    logger.warn(`🔄 Unknown disconnect reason (${statusCode}), reconnecting...`)
                    setTimeout(() => this.connect(), 3000)
                }
                
                this.emit('disconnected', lastDisconnect?.error)
                
            } else if (connection === 'open') {
                logger.info('✅ WhatsApp connected successfully!')
                
                this.isReady = true
                this.ownerJid = this.socket.user.id
                
                // Save owner JID to config and mark session as active
                if (config.SESSION_ID) {
                    await this.updateSessionJid(this.ownerJid)
                    await this.markSessionActive()
                }
                
                logger.info(`🔐 Bot ready! Operating as: ${this.ownerJid}`)
                logger.info(`📱 Session: ${config.SESSION_ID || 'main'}`)
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
            // Skip invalid messages but allow own messages for testing
            if (!message.message) return

            const jid = message.key.remoteJid
            const text = utils.getMessageText(message)
            const senderJid = message.key.participant || jid
            
            // Log incoming message for debugging
            if (config.DEBUG_MODE) {
                logger.info(`📨 Message from ${senderJid} in ${jid}: "${text}"`)
            }
            
            // Archive message if enabled (archive all messages)
            if (config.ENABLE_MESSAGE_ARCHIVE) {
                await this.archiveMessage(message, text)
            }

            // Download and save media if enabled
            if (config.ENABLE_MEDIA_DOWNLOAD && this.hasMedia(message.message)) {
                await this.downloadAndSaveMedia(message)
            }

            // Check if it's a command
            if (text?.startsWith(config.PREFIX)) {
                logger.info(`🔧 Command detected: ${text}`)
                
                // If it's from owner (fromMe = true), always process
                // If it's from others, check permissions
                if (message.key.fromMe || this.hasAccess(senderJid, text.slice(config.PREFIX.length).trim().split(' ')[0])) {
                    await this.handleCommand(message, text)
                } else {
                    logger.warn(`🚫 Access denied for ${senderJid}`)
                }
            }
            
        } catch (error) {
            logger.error('Error handling message:', error)
        }
    }

    async handleCommand(message, text) {
        const jid = message.key.remoteJid
        const senderJid = message.key.participant || jid
        const args = text.slice(config.PREFIX.length).trim().split(' ')
        const command = args.shift()?.toLowerCase()
        
        if (!command) return

        logger.info(`🔍 Processing command: "${command}" from ${senderJid}`)

        // Check access permissions
        if (!this.hasAccess(senderJid, command)) {
            logger.warn(`🚫 Access denied for ${senderJid} to command: ${command}`)
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
                logger.info(`🎯 Executing plugin: ${plugin.desc}`)
                
                // Extract match from pattern
                const commandText = text.slice(config.PREFIX.length)
                const regex = new RegExp(plugin.pattern.replace(/\?\.\*/g, '(.*)'), 'i')
                const match = commandText.match(regex)
                
                const messageObj = {
                    jid,
                    text,
                    key: message.key,
                    message: message.message,
                    sender: senderJid,
                    isGroup: jid.endsWith('@g.us'),
                    args: args,
                    command: command,
                    send: (text, options) => utils.sendMessage(this.socket, jid, text, options),
                    reply: (text) => utils.sendMessage(this.socket, jid, text, { quoted: message }),
                    react: (emoji) => utils.addReaction(this.socket, message.key, emoji),
                    client: this // Allow plugins to access client methods
                }
                
                await plugin.handler(messageObj, match ? match[1] || '' : '')
                
                // Success reaction
                if (config.SUCCESS_EMOJI) {
                    await utils.addReaction(this.socket, message.key, config.SUCCESS_EMOJI)
                }
            } else {
                logger.warn(`❓ No plugin found for command: ${command}`)
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
        
        // Owner always has access (this covers messages from the bot owner)
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
        
        // Check if user is explicitly allowed for this command via .allow
        const allowedCommands = this.allowedUsers.get(jid) || []
        return allowedCommands.includes(command) || allowedCommands.includes('*')
    }

    findPluginForCommand(text) {
        const commandText = text.slice(config.PREFIX.length).trim()
        
        for (const plugin of plugins) {
            try {
                // Check if text matches pattern
                const pattern = plugin.pattern.replace(/\?\.\*/g, '(.*)')
                const regex = new RegExp(`^${pattern}$`, 'i')
                
                if (regex.test(commandText)) {
                    logger.info(`✅ Pattern matched: "${pattern}" for "${commandText}"`)
                    return plugin
                }
            } catch (error) {
                logger.error(`Invalid regex pattern in plugin: ${plugin.pattern}`, error)
            }
        }
        
        logger.warn(`❌ No pattern matched for command: "${commandText}"`)
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

    async archiveMessage(message, text) {
        try {
            const jid = message.key.remoteJid
            const senderJid = message.key.participant || jid
            const isGroup = jid.endsWith('@g.us')
            
            const messageData = {
                id: message.key.id,
                from: senderJid,
                to: jid,
                body: text || '[Media/System Message]',
                type: this.getMessageType(message.message),
                timestamp: new Date(message.messageTimestamp * 1000).toISOString(),
                isOutgoing: message.key.fromMe,
                hasMedia: this.hasMedia(message.message),
                quotedMessage: message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null,
                mentions: message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [],
                isGroup,
                mediaPath: null,
                mediaMetadata: null,
                archived: new Date().toISOString(),
                category: isGroup ? 'group' : 'individual'
            }
            
            const date = new Date()
            const year = date.getFullYear()
            const month = String(date.getMonth() + 1).padStart(2, '0')
            const day = String(date.getDate()).padStart(2, '0')
            
            const category = isGroup ? 'groups' : 'individual'
            const archivePath = path.join(
                config.MESSAGES_DIR,
                year.toString(),
                month,
                category,
                `${day}.json`
            )
            
            await fs.ensureDir(path.dirname(archivePath))
            
            let messages = []
            if (await fs.pathExists(archivePath)) {
                messages = await fs.readJson(archivePath)
            }
            
            messages.push(messageData)
            await fs.writeJson(archivePath, messages)
            
            if (config.DEBUG_MODE) {
                logger.info(`📝 Message archived: ${archivePath}`)
            }
            
        } catch (error) {
            logger.error('Failed to archive message:', error)
        }
    }

    getMessageType(messageContent) {
        if (messageContent.conversation || messageContent.extendedTextMessage) return 'text'
        if (messageContent.imageMessage) return 'image'
        if (messageContent.videoMessage) return 'video'
        if (messageContent.audioMessage) return 'audio'
        if (messageContent.documentMessage) return 'document'
        if (messageContent.stickerMessage) return 'sticker'
        if (messageContent.locationMessage) return 'location'
        return 'system'
    }

    hasMedia(messageContent) {
        return !!(messageContent.imageMessage || 
                 messageContent.videoMessage || 
                 messageContent.audioMessage || 
                 messageContent.documentMessage || 
                 messageContent.stickerMessage)
    }

    async downloadAndSaveMedia(message) {
        try {
            if (!this.hasMedia(message.message)) return

            const buffer = await utils.downloadMedia(message, this.socket)
            if (!buffer) return

            const messageType = this.getMessageType(message.message)
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
            const fileName = `${message.key.id}_${timestamp}`
            
            let extension = ''
            if (messageType === 'image') extension = '.jpg'
            else if (messageType === 'video') extension = '.mp4'
            else if (messageType === 'audio') extension = '.ogg'
            else if (messageType === 'document') {
                const docMessage = message.message.documentMessage
                extension = docMessage.fileName ? path.extname(docMessage.fileName) : '.bin'
            }

            const mediaPath = path.join(config.MEDIA_DIR, messageType, `${fileName}${extension}`)
            await fs.ensureDir(path.dirname(mediaPath))
            await fs.writeFile(mediaPath, buffer)

            logger.info(`💾 Media saved: ${mediaPath}`)
            return mediaPath

        } catch (error) {
            logger.error('Failed to download and save media:', error)
            return null
        }
    }

    async updateSessionJid(jid) {
        try {
            const sessionConfigPath = path.join(config.SESSION_DIR, config.SESSION_ID || 'main', 'config.json')
            
            let sessionConfig = {}
            if (await fs.pathExists(sessionConfigPath)) {
                sessionConfig = await fs.readJson(sessionConfigPath)
            }
            
            sessionConfig.ownerJid = jid
            sessionConfig.lastActive = new Date().toISOString()
            sessionConfig.sessionId = config.SESSION_ID || 'main'
            
            await fs.ensureDir(path.dirname(sessionConfigPath))
            await fs.writeJson(sessionConfigPath, sessionConfig)
            
        } catch (error) {
            logger.error('Failed to update session JID:', error)
        }
    }

    async markSessionActive() {
        try {
            const sessionStatusPath = path.join(config.SESSION_DIR, config.SESSION_ID || 'main', 'status.json')
            const statusData = {
                active: true,
                connectedAt: new Date().toISOString(),
                lastHeartbeat: new Date().toISOString(),
                pid: process.pid,
                version: config.VERSION
            }
            
            await fs.ensureDir(path.dirname(sessionStatusPath))
            await fs.writeJson(sessionStatusPath, statusData)
            
            // Set up periodic heartbeat to keep session marked as active
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval)
            }
            
            this.heartbeatInterval = setInterval(async () => {
                if (this.isReady) {
                    statusData.lastHeartbeat = new Date().toISOString()
                    await fs.writeJson(sessionStatusPath, statusData).catch(() => {})
                }
            }, 30000) // Update every 30 seconds
            
        } catch (error) {
            logger.error('Failed to mark session as active:', error)
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

    async hasValidSession(authPath) {
        try {
            const credFile = path.join(authPath, 'creds.json')
            const keyFiles = await fs.readdir(authPath).catch(() => [])
            
            // Check if we have credentials and at least some key files
            return await fs.pathExists(credFile) && keyFiles.length > 1
        } catch (error) {
            return false
        }
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
        try {
            logger.info('🛑 Destroying client connection...')
            
            // Clear heartbeat interval
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval)
            }
            
            // Mark session as inactive
            const sessionStatusPath = path.join(config.SESSION_DIR, config.SESSION_ID || 'main', 'status.json')
            if (await fs.pathExists(sessionStatusPath)) {
                const statusData = await fs.readJson(sessionStatusPath)
                statusData.active = false
                statusData.disconnectedAt = new Date().toISOString()
                await fs.writeJson(sessionStatusPath, statusData)
            }
            
            // Close socket connection gracefully without logging out
            if (this.socket) {
                this.socket.end()
                this.socket = null
            }
            
            this.isReady = false
            logger.info('✅ Client destroyed gracefully')
            
        } catch (error) {
            logger.error('Error during client destruction:', error)
        }
    }
}

module.exports = { Client, bot, logger }