const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    generateWAMessageFromContent,
    downloadMediaMessage,
    Browsers
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const EventEmitter = require('events')
const path = require('path')
const fs = require('fs-extra')
const chokidar = require('chokidar')

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
        this.ownerGroupJids = new Set() // Store owner's group participant JIDs
        this.messageCache = new Map()
        this.pairingCodeRequested = false
        this.isConnecting = false  // Flag to prevent multiple simultaneous connections
        this.wasConnectedBefore = false
        this.justCompletedPairing = false
        this.pluginWatcher = null // To hold the chokidar watcher instance

        // Auto-detected owner LIDs will be stored here

        // Directory initialization will be done in connect()
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
        // Prevent multiple simultaneous connection attempts
        if (this.isConnecting) {
            logger.info('⚠️ Connection already in progress, skipping duplicate attempt')
            return
        }

        // Prevent connecting if already connected
        if (this.isReady && this.socket) {
            logger.info('⚠️ Bot already connected and ready, skipping duplicate attempt')
            return
        }

        this.isConnecting = true

        try {
            console.log('🔧 CONNECT FUNCTION CALLED - Starting WhatsApp client initialization...')
            logger.info('🔧 Initializing WhatsApp client...')

            // Initialize required directories first
            await this.initializeDirectories()

            // Initialize authentication first - before plugin loading
            const authPath = path.join(config.SESSION_DIR, config.SESSION_ID || 'main', 'auth')
            logger.info(`📂 Auth path: ${authPath}`)
            await fs.ensureDir(authPath)

            // Always try to load existing auth state first
            const { state, saveCreds } = await useMultiFileAuthState(authPath)

            // Check if we have a valid session ID in the state
            const hasValidCreds = state.creds?.me?.id
            logger.info(`🔍 Session check result: ${hasValidCreds ? 'valid credentials found' : 'no valid credentials'}`)

            if (hasValidCreds) {
                logger.info('📱 Found existing session, attempting to restore...')
            } else {
                logger.info('📱 No valid session found, will need to authenticate...')
                await this.selectAuthenticationMethod()
                logger.info(`🔧 Authentication method selected: ${this.authMethod}`)
            }

            // Create WhatsApp socket with optimized settings
            this.socket = makeWASocket({
                auth: state,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: this.authMethod === 'qr',
                browser: this.authMethod === 'pairing' ? Browsers.macOS('Chrome') : ['MATDEV Bot', 'Desktop', '1.0.0'],
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                markOnlineOnConnect: config.ALWAYS_ONLINE,
                syncFullHistory: false,
                fireInitQueries: true, // Enable for better connection handling
                generateHighQualityLinkPreview: false,
                shouldSyncHistoryMessage: () => false,
                shouldIgnoreJid: () => false,
                retryRequestDelayMs: 2000,
                maxMsgRetryCount: 3,
                qrTimeout: 60000,
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

            // Wait for authentication to complete before loading plugins
            await this.waitForAuthentication()

            // Load plugins only after successful authentication
            await this.loadPlugins()
            // Setup hot reload for plugins
            this.setupPluginWatcher()

        } catch (error) {
            logger.error('❌ Failed to initialize client:', error)
            this.isConnecting = false  // Reset flag on error
            throw error
        } finally {
            // Ensure flag is always reset
            this.isConnecting = false
        }
    }

    setupEventHandlers(saveCreds) {
        // Credentials update
        this.socket.ev.on('creds.update', saveCreds)

        // Connection updates
        this.socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update

            if (qr) {
                // Only show QR if we explicitly chose QR method
                if (this.authMethod === 'qr') {
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
                }
            }

            // Handle pairing code generation for non-registered devices
            // Only generate pairing codes if we don't have valid credentials (new authentication)
            const hasValidCreds = this.socket?.authState?.creds?.me?.id
            if (this.authMethod === 'pairing' && this.phoneNumber && !this.pairingCodeRequested && !hasValidCreds) {
                // Only generate pairing code on initial connection, not when already connected
                if (connection === 'connecting') {
                    this.pairingCodeRequested = true

                    // Wait a moment for connection to stabilize
                    setTimeout(async () => {
                        try {
                            logger.info('📱 Generating 8-digit pairing code...')
                            const code = await this.socket.requestPairingCode(this.phoneNumber)
                            const formattedCode = code.match(/.{1,4}/g)?.join('-') || code

                            console.log('\n' + '='.repeat(50))
                            console.log('8-DIGIT PAIRING CODE GENERATED')
                            console.log(`Your pairing code: ${formattedCode}`)
                            console.log('1. Open WhatsApp on your phone')
                            console.log('2. Tap Menu or Settings > Linked Devices')
                            console.log('3. Tap "Link with Phone Number" instead of scan')
                            console.log(`4. Enter the code: ${formattedCode}`)
                            console.log('⏰ Code expires in 20 seconds')
                            console.log('='.repeat(50))

                            logger.info(`📱 Pairing Code: ${formattedCode}`)
                            this.justCompletedPairing = true // Mark that pairing was requested
                            this.emit('pairing_code', code)

                        } catch (error) {
                            logger.error('Failed to generate pairing code:', error)
                            this.pairingCodeRequested = false
                            // If pairing code fails, restart connection
                            setTimeout(() => this.connect(), 3000)
                        }
                    }, 1000)
                }
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode

                logger.info(`📱 Connection closed. Status: ${statusCode}`)

                // Track consecutive failures for session cleanup
                this.failureCount = (this.failureCount || 0) + 1

                // Handle different disconnect reasons more carefully
                if (statusCode === DisconnectReason.badSession) {
                    logger.error('❌ Bad session detected - need to re-authenticate')
                    await this.clearAndReauthenticate()
                } else if (statusCode === DisconnectReason.loggedOut) {
                    logger.error('❌ Logged out from WhatsApp - session expired')
                    await this.clearAndReauthenticate()
                } else if (statusCode === 401) {
                    // Handle 401 - authentication failed
                    logger.error(`🔐 Authentication failed (401) - attempt ${this.failureCount}`)

                    if (this.failureCount >= 3) {
                        logger.error('❌ Multiple auth failures, clearing session and re-authenticating...')
                        await this.clearAndReauthenticate()
                    } else {
                        logger.info('🔄 Retrying connection with existing session...')
                        setTimeout(() => {
                            if (!this.isConnecting) this.connect()
                        }, 3000)
                    }
                } else if (statusCode === DisconnectReason.connectionClosed) {
                    logger.info('🔄 Connection closed by server, reconnecting...')
                    setTimeout(() => {
                        if (!this.isConnecting) this.connect()
                    }, 2000)
                } else if (statusCode === DisconnectReason.connectionLost) {
                    logger.info('🔄 Connection lost, attempting to reconnect...')
                    setTimeout(() => {
                        if (!this.isConnecting) this.connect()
                    }, 1000)
                } else if (statusCode === DisconnectReason.connectionReplaced || statusCode === 440) {
                    logger.warn('⚠️ Another device/instance took over this session')
                    // Don't clear session immediately - just mark as disconnected
                    this.isReady = false
                    this.socket = null
                    logger.info('🔄 Session taken over by another instance. Stopping this instance to prevent conflicts.')
                    // Exit gracefully instead of clearing session
                    process.exit(0)
                } else if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
                    logger.info('🔄 WhatsApp requires restart, reconnecting in 10 seconds...')
                    // Reset pairing code flag on restart
                    this.pairingCodeRequested = false
                    // Clean up current socket before reconnecting
                    this.isReady = false
                    this.socket = null

                    // If we're in pairing mode (during authentication), use special exit code
                    if (this.authMethod === 'pairing' && !this.ownerJid) {
                        logger.info('📱 Pairing mode restart detected - signaling manager with exit code 2')
                        process.exit(2) // Special exit code for pairing mode restart
                    } else {
                        setTimeout(() => {
                            if (!this.isConnecting && !this.isReady) this.connect()
                        }, 10000)
                    }
                } else if (statusCode === DisconnectReason.timedOut) {
                    logger.info('⏰ Connection timed out, trying again...')
                    setTimeout(() => {
                        if (!this.isConnecting) this.connect()
                    }, 2000)
                } else {
                    logger.warn(`🔄 Unknown disconnect reason (${statusCode}), reconnecting...`)
                    setTimeout(() => {
                        if (!this.isConnecting) this.connect()
                    }, 3000)
                }

                this.emit('disconnected', lastDisconnect?.error)

            } else if (connection === 'open') {
                logger.info('✅ WhatsApp connected successfully!')

                // Reset failure count on successful connection
                this.failureCount = 0
                this.isReady = true
                this.ownerJid = this.socket.user.id

                // Ensure connecting flag is reset
                this.isConnecting = false

                // Save owner JID to config and mark session as active
                if (config.SESSION_ID) {
                    await this.updateSessionJid(this.ownerJid)
                    await this.markSessionActive()
                }

                logger.info(`🔐 Bot ready! Operating as: ${this.ownerJid}`)
                logger.info(`📱 Session: ${config.SESSION_ID || 'main'}`)

                // Send startup notification to owner
                setTimeout(async () => {
                    try {
                        const utils = require('./utils')
                        const isFirstConnection = !this.wasConnectedBefore
                        const notificationType = isFirstConnection ? 'startup' : 'restart'

                        await utils.sendOwnerNotification(this.socket, this.ownerJid, notificationType)
                        this.wasConnectedBefore = true

                        // If this was after pairing, send pairing completion notification
                        if (this.justCompletedPairing) {
                            await utils.sendOwnerNotification(this.socket, this.ownerJid, 'pairing_completed')
                            this.justCompletedPairing = false
                        }
                    } catch (error) {
                        logger.error('Failed to send startup notification:', error)
                    }
                }, 2000) // Wait 2 seconds to ensure connection is stable

                this.emit('ready')
            }
        })

        // Messages - PRIORITY: Handle view once messages FIRST before any other processing
        this.socket.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return

            for (const message of messages) {
                // IMMEDIATE: Check for view once messages with content BEFORE any other processing
                if (message.message?.viewOnceMessage || message.message?.viewOnceMessageV2 || message.message?.viewOnceMessageV2Extension) {
                    logger.info(`👁️ INTERCEPTED view once message with content from ${(message.key?.remoteJid || 'unknown').split('@')[0]} - downloading now`)
                    await this.handleViewOnceMessage(message)
                    continue // Skip normal message processing for view once
                }
                
                // Normal message processing for non-view-once messages
                await this.handleMessage(message)
            }
        })

        // Message deletion detection
        this.socket.ev.on('messages.update', async (updates) => {
            for (const update of updates) {
                // Check if message was deleted for everyone
                // More specific WhatsApp deletion detection to reduce false positives
                const isDeleted = (update.update?.messageStubType === 68) || // REVOKE message type 
                                 (update.update?.message?.protocolMessage?.type === 0 && update.update?.message?.protocolMessage?.key) // REVOKE protocol with key

                if (isDeleted) {
                    try {
                        const antiDeleteModule = require('../plugins/anti-delete')
                        if (antiDeleteModule && antiDeleteModule.handleDeletedMessage) {
                            const deletedMessageId = update.key.id
                            const chatJid = update.key.remoteJid

                            // Removed excessive deletion logs

                            await antiDeleteModule.handleDeletedMessage(this.socket, deletedMessageId, chatJid)
                        }
                    } catch (error) {
                        logger.error('Anti-delete handler error:', error)
                    }
                }
            }
        })

        // Also listen for message deletions via protocol messages
        this.socket.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return

            for (const message of messages) {
                // Check if this is a delete protocol message
                if (message.message?.protocolMessage?.type === 0) { // REVOKE
                    const deletedMessageKey = message.message.protocolMessage.key
                    if (deletedMessageKey) {
                        try {
                            const antiDeleteModule = require('../plugins/anti-delete')
                            if (antiDeleteModule && antiDeleteModule.handleDeletedMessage) {
                                logger.info(`🗑️ Protocol delete detected: ${deletedMessageKey.id}`)
                                await antiDeleteModule.handleDeletedMessage(this.socket, deletedMessageKey.id, deletedMessageKey.remoteJid)
                            }
                        } catch (error) {
                            logger.error('Anti-delete protocol handler error:', error)
                        }
                    }
                }
            }
        })
    }

    async handleMessage(message) {
        try {
            // 2025 Filter: Skip @lid system messages completely (no logging)
            if (message.key?.remoteJid?.includes('@lid')) {
                return // Silently skip WhatsApp system notifications
            }

            // Skip broadcast messages 
            if (message.key?.remoteJid?.includes('@broadcast')) {
                return // Silently skip broadcast messages
            }

            // DEBUG: Let's see what we're getting for problematic messages
            if (!message.message && config.DEBUG_MODE) {
                const jid = message.key?.remoteJid || 'unknown'
                logger.info(`🔍 DEBUG - Empty message structure from: ${jid}`)
                logger.info(`🔍 DEBUG - Message keys: ${Object.keys(message)}`)
                logger.info(`🔍 DEBUG - Full message: ${JSON.stringify(message, null, 2)}`)
            }

            // Skip view once stub messages - they're already handled above
            if (message.messageStubType === 2) {
                return
            }

            // Skip invalid messages but allow most message types
            if (!message.message) {
                // Only log if it's not a system message
                const skipJid = message.key?.remoteJid || 'unknown'
                if (!skipJid.includes('@lid') && !skipJid.includes('@broadcast')) {
                    logger.info(`⚠️ Skipping message without content from: ${skipJid.split('@')[0]}`)
                }
                return
            }

            // DEBUG: Log message types for debugging
            if (config.DEBUG_MODE && !message.key?.remoteJid?.includes('@lid')) {
                const messageTypes = Object.keys(message.message || {})
                const debugJid = message.key?.remoteJid || 'unknown'
                logger.info(`🔍 DEBUG - Message types from ${debugJid.split('@')[0]}: ${messageTypes.join(', ')}`)
            }

            // Check for various message types to handle properly
            const hasTextContent = message.message.conversation || 
                                 message.message.extendedTextMessage ||
                                 message.message.imageMessage ||
                                 message.message.videoMessage ||
                                 message.message.audioMessage ||
                                 message.message.documentMessage ||
                                 message.message.stickerMessage ||
                                 message.message.locationMessage ||
                                 message.message.contactMessage ||
                                 message.message.viewOnceMessage ||
                                 message.message.viewOnceMessageV2

            if (!hasTextContent) {
                // Silently skip protocol messages and other system messages
                const messageTypes = Object.keys(message.message || {})
                const isProtocolMessage = messageTypes.includes('protocolMessage')
                
                // Only log warning for truly unexpected message types, skip protocol messages silently
                if (!isProtocolMessage) {
                    logger.info(`⚠️ Skipping unsupported message type - MessageType: ${messageTypes.join(', ')}`)
                }
                return
            }

            const messageJid = message.key.remoteJid
            const text = utils.getMessageText(message)
            const senderJid = message.key.participant || messageJid

            // Log incoming message for debugging
            // if (config.DEBUG_MODE) {
            //     logger.info(`📨 Message from ${senderJid}: "${text || '[Media/System]'}"`)
            // }

            // Track message for anti-delete (before archiving)
            try {
                const antiDeleteModule = require('../plugins/anti-delete')
                if (antiDeleteModule && antiDeleteModule.trackMessage) {
                    await antiDeleteModule.trackMessage(message, text, this.socket)
                }
            } catch (error) {
                // Anti-delete module not loaded or error
                if (config.DEBUG_MODE) {
                    logger.info('Anti-delete module not available:', error.message)
                }
            }

            // Archive message if enabled (archive all messages)
            if (config.ENABLE_MESSAGE_ARCHIVE) {
                await this.archiveMessage(message, text)
            }

            // Auto-register owner's group participant JID when they send messages
            const isGroup = messageJid.endsWith('@g.us')
            if (isGroup && message.key.participant) {
                // Enhanced owner detection for group messages
                let isFromOwner = false
                
                // Method 1: Direct fromMe check
                if (message.key.fromMe) {
                    isFromOwner = true
                    logger.info(`🔐 Owner detected via fromMe=true: ${message.key.participant}`)
                }
                
                // Method 2: Check if already identified as owner
                if (!isFromOwner && this.isOwnerJid(senderJid)) {
                    isFromOwner = true
                    logger.info(`🔐 Owner detected via isOwnerJid: ${message.key.participant}`)
                }
                
                // Method 3: For LID messages, check phone number match
                if (!isFromOwner && message.key.participant.endsWith('@lid')) {
                    const participantNumber = message.key.participant.split('@')[0]
                    const ownerNumber = this.ownerJid ? this.ownerJid.split('@')[0].split(':')[0] : ''
                    
                    logger.info(`🔍 LID Check - Participant: ${participantNumber}, Owner: ${ownerNumber}`)
                    
                    if (participantNumber && ownerNumber && participantNumber === ownerNumber) {
                        isFromOwner = true
                        logger.info(`🔐 Owner detected via phone number match: ${message.key.participant}`)
                    }
                }
                
                // Method 4: Check if this participant JID belongs to the same device/session
                if (!isFromOwner && this.socket?.user?.id) {
                    const socketUserNumber = this.socket.user.id.split('@')[0].split(':')[0]
                    const participantNumber = message.key.participant.split('@')[0]
                    
                    if (socketUserNumber === participantNumber) {
                        isFromOwner = true
                        logger.info(`🔐 Owner detected via socket user match: ${message.key.participant}`)
                    }
                }
                
                // Method 5: Special handling for your specific LID - based on your logs
                // Register specific LIDs that belong to the owner based on observed patterns
                if (!isFromOwner && message.key.participant.endsWith('@lid')) {
                    // Check if this LID's message content suggests it's from the owner
                    // (e.g., trying to use commands like .jid)
                    if (text && text.startsWith(config.PREFIX)) {
                        // This is a command attempt from a LID - likely the owner
                        logger.info(`🔐 Command from LID detected - auto-registering as owner: ${message.key.participant}`)
                        isFromOwner = true
                    }
                }
                
                // Register owner's participant JID
                if (isFromOwner) {
                    this.registerOwnerGroupJid(message.key.participant)
                }
            }

            // Media is already saved during archiving process - no need for duplicate download

            // Check if it's a command
            if (text?.startsWith(config.PREFIX)) {
                // logger.info(`🔧 Command detected: ${text}`)
                const command = text.slice(config.PREFIX.length).trim().split(' ')[0]
                const actualSender = message.key.participant || message.key.remoteJid

                // Enhanced owner detection for commands
                let isOwnerMessage = false
                
                // Method 1: fromMe check (most reliable)
                if (message.key.fromMe) {
                    isOwnerMessage = true
                    // Auto-register LID if in group
                    if (isGroup && message.key.participant && message.key.participant.endsWith('@lid')) {
                        this.registerOwnerGroupJid(message.key.participant)
                        logger.info(`🔐 Auto-registered owner LID from fromMe command: ${message.key.participant}`)
                    }
                }
                
                // Method 2: Check if sender is already identified as owner
                if (!isOwnerMessage) {
                    isOwnerMessage = this.isOwnerJid(actualSender)
                }
                
                // Method 3: For LID messages, check if phone number matches owner
                if (!isOwnerMessage && actualSender.endsWith('@lid')) {
                    const senderNumber = actualSender.split('@')[0]
                    const ownerNumber = this.ownerJid ? this.ownerJid.split('@')[0].split(':')[0] : ''
                    
                    if (senderNumber && ownerNumber && senderNumber === ownerNumber) {
                        isOwnerMessage = true
                        // Auto-register this LID as belonging to owner
                        if (isGroup && message.key.participant) {
                            this.registerOwnerGroupJid(message.key.participant)
                            logger.info(`🔐 Auto-registered owner LID from phone match: ${message.key.participant}`)
                        }
                    }
                }

                // Execute command if owner or has access
                if (isOwnerMessage) {
                    await this.handleCommand(message, text)
                } else if (this.hasAccess(actualSender, command)) {
                    await this.handleCommand(message, text)
                } else {
                    // Access denied - no action needed, permissions plugin will handle the message
                }
            }

        } catch (error) {
            logger.error('Error handling message:', error)
        }
    }

    async handleCommand(message, text) {
        const jid = message.key.remoteJid
        const actualSender = message.key.participant || message.key.remoteJid
        const args = text.slice(config.PREFIX.length).trim().split(' ')
        const command = args.shift()?.toLowerCase()

        if (!command) return

        // logger.info(`🔍 Processing command: "${command}" from ${actualSender}`)

        // Check access permissions - bot messages always have access
        if (!message.key.fromMe && !this.hasAccess(actualSender, command)) {
            // logger.warn(`🚫 Access denied for ${actualSender} to command: ${command}`)
            return
        }

        // Add loading reaction if enabled
        if (config.LOADING_EMOJI && this.socket && this.shouldReact()) {
            await utils.addReaction(this.socket, message.key, config.LOADING_EMOJI)
        }

        try {
            // Execute plugin command
            const plugin = this.findPluginForCommand(text)
            if (plugin) {
                // logger.info(`🎯 Executing plugin: ${plugin.desc}`)

                // Extract match from pattern
                const commandText = text.slice(config.PREFIX.length)
                const regex = new RegExp(plugin.pattern.replace(/\?\.\*/g, '(.*)'), 'i')
                const match = commandText.match(regex)

                const messageObj = {
                    jid,
                    text,
                    key: message.key,
                    message: message.message,
                    sender: actualSender,
                    isGroup: jid.endsWith('@g.us'),
                    args: args,
                    command: command,
                    send: (text, options) => utils.sendMessage(this.socket, jid, text, options),
                    reply: (text) => utils.sendMessage(this.socket, jid, text, { quoted: message }),
                    react: (emoji) => utils.addReaction(this.socket, message.key, emoji),
                    client: this // Allow plugins to access client methods
                }

                await plugin.handler(messageObj, match ? match[1] || '' : '')

                // Success reaction if enabled
                if (config.SUCCESS_EMOJI && this.shouldReact()) {
                    await utils.addReaction(this.socket, message.key, config.SUCCESS_EMOJI)
                }
            } else {
                // logger.warn(`❓ No plugin found for command: ${command}`)
            }

        } catch (error) {
            logger.error(`Error executing command ${command}:`, error)

            // Error reaction if enabled
            if (config.ERROR_EMOJI && this.shouldReact()) {
                await utils.addReaction(this.socket, message.key, config.ERROR_EMOJI)
            }
        }
    }

    isOwnerJid(jid) {
        if (!jid || !this.ownerJid) return false

        // Direct match with owner JID
        if (jid === this.ownerJid) return true

        // Check if this is the socket user's JID
        if (this.socket?.user?.id && jid === this.socket.user.id) {
            return true
        }

        // Check if this LID is registered as belonging to the owner
        if (jid.endsWith('@lid') && this.ownerGroupJids.has(jid)) {
            return true
        }

        // Normalize JIDs - remove device suffix and compare base numbers
        const normalizeJid = (jid) => {
            if (!jid) return ''
            return jid.split(':')[0]
        }

        const normalizedJid = normalizeJid(jid)
        const normalizedOwnerJid = normalizeJid(this.ownerJid)

        // Extract base phone number from JID
        const extractPhoneNumber = (jid) => {
            if (!jid) return ''
            const userPart = jid.split('@')[0]
            return userPart.split(':')[0]
        }

        const baseJidNumber = extractPhoneNumber(jid)
        const baseOwnerNumber = extractPhoneNumber(this.ownerJid)

        // Compare normalized JIDs and base phone numbers
        if (normalizedJid === normalizedOwnerJid || baseJidNumber === baseOwnerNumber) {
            return true
        }

        return false
    }

    registerOwnerGroupJid(participantJid) {
        if (participantJid && !this.ownerGroupJids.has(participantJid)) {
            this.ownerGroupJids.add(participantJid)
            logger.info(`🔐 Registered owner group JID: ${participantJid}`)
            logger.info(`🔐 Current registered owner JIDs: [${Array.from(this.ownerGroupJids).join(', ')}]`)
        }
    }

    // Method to clear all registered group JIDs (for testing)
    clearRegisteredGroupJids() {
        this.ownerGroupJids.clear()
        logger.info(`🧹 Cleared all registered group JIDs`)
    }

    hasAccess(jid, command) {
        if (config.DEBUG_MODE) {
            logger.info(`🔍 Access check: ${jid} vs owner ${this.ownerJid} for command: ${command}`)
        }

        // Owner always has access - use improved JID comparison
        if (this.isOwnerJid(jid)) {
            logger.info(`✅ Access granted: Owner match`)
            return true
        }

        // Check if this JID is a registered owner group participant JID
        if (this.ownerGroupJids.has(jid)) {
            logger.info(`✅ Access granted: Registered owner group JID`)
            return true
        }

        // Debug: Show what we're checking against
        if (config.DEBUG_MODE || this.ownerGroupJids.size > 0) {
            logger.info(`🔍 JID check details:`)
            logger.info(`   Checking JID: ${jid}`)
            logger.info(`   Owner JID: ${this.ownerJid}`)
            logger.info(`   Registered group JIDs: [${Array.from(this.ownerGroupJids).join(', ')}]`)
        }

        // If owner only mode is disabled, allow all
        if (!config.OWNER_ONLY) {
            logger.info(`✅ Access granted: OWNER_ONLY disabled`)
            return true
        }

        // Extract base phone number for permission checks
        const extractPhoneNumber = (jid) => {
            if (!jid) return ''
            const userPart = jid.split('@')[0]
            return userPart.split(':')[0]
        }

        const basePhoneNumber = extractPhoneNumber(jid)
        const baseJid = basePhoneNumber + '@s.whatsapp.net'

        // Check if user is in sudo list (check both full JID and base JID)
        if (config.SUDO) {
            const sudoUsers = config.SUDO.split(',').map(u => u.trim())
            if (sudoUsers.includes(baseJid) || sudoUsers.includes(jid)) {
                logger.info(`✅ Access granted: SUDO user`)
                return true
            }
        }

        // Check if user is explicitly allowed for this command via .allow
        // Check multiple JID variations for group compatibility
        const jidVariations = [
            jid,                    // Original JID
            baseJid,               // Base JID (phone@s.whatsapp.net)
            basePhoneNumber        // Just the phone number
        ]

        let allowedCommands = []
        for (const variation of jidVariations) {
            const commands = this.allowedUsers.get(variation) || []
            allowedCommands = allowedCommands.concat(commands)
        }

        const hasPermission = allowedCommands.includes(command) || allowedCommands.includes('*')

        if (hasPermission) {
            logger.info(`✅ Access granted: Explicit permission`)
        } else {
            logger.info(`❌ Access denied: No permission for ${jid}`)
            logger.info(`   OWNER_ONLY: ${config.OWNER_ONLY}`)
            logger.info(`   SUDO: ${config.SUDO}`)
            logger.info(`   Allowed commands for ${jid}: [${allowedCommands.join(', ')}]`)
        }

        return hasPermission
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

    setupPluginWatcher() {
        try {
            logger.info('🔥 Setting up hot reload for plugins...')

            this.pluginWatcher = chokidar.watch(config.PLUGINS_DIR, {
                ignored: /node_modules/, // ignore node_modules
                persistent: true,
                ignoreInitial: true // Don't trigger on initial scan
            })

            this.pluginWatcher
                .on('add', async (filePath) => {
                    if (filePath.endsWith('.js')) {
                        const fileName = path.basename(filePath)
                        logger.info(`🆕 New plugin added: ${fileName}`)
                        await this.loadPlugins()
                        logger.info(`🎯 Hot reload complete - ${plugins.length} plugins loaded`)
                    }
                })
                .on('change', async (filePath) => {
                    if (filePath.endsWith('.js')) {
                        const fileName = path.basename(filePath)
                        logger.info(`🔥 Plugin modified: ${fileName}`)
                        await this.loadPlugins()
                        logger.info(`🎯 Hot reload complete - ${plugins.length} plugins loaded`)
                    }
                })
                .on('unlink', async (filePath) => {
                    if (filePath.endsWith('.js')) {
                        const fileName = path.basename(filePath)
                        logger.info(`🗑️ Plugin removed: ${fileName}`)
                        await this.loadPlugins()
                        logger.info(`🎯 Hot reload complete - ${plugins.length} plugins loaded`)
                    }
                })
                .on('error', error => logger.error('Plugin watcher error:', error))

            logger.info('🔥 Plugin hot reload watcher initialized')

        } catch (error) {
            logger.warn('Hot reload not available - chokidar not installed or failed to initialize:', error.message)
        }
    }

    async archiveMessage(message, text) {
        try {
            const jid = message.key.remoteJid
            const senderJid = message.key.participant || jid
            const isGroup = jid.endsWith('@g.us')

            // Download and save media if present (only once)
            let mediaPath = null
            if (this.hasMedia(message.message) && config.ENABLE_MEDIA_DOWNLOAD) {
                mediaPath = await this.downloadAndSaveMedia(message)
            }

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
                mediaPath: mediaPath,
                mediaMetadata: null,
                archived: new Date().toISOString(),
                category: isGroup ? 'group' : 'individual',
                expiresAt: new Date(Date.now() + (3 * 24 * 60 * 60 * 1000)).toISOString() // 3 days from now
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

            // Clean up expired messages (older than 3 days)
            const now = new Date()
            messages = messages.filter(msg => {
                if (msg.expiresAt) {
                    return new Date(msg.expiresAt) > now
                }
                // For old messages without expiresAt, check archived date
                const archivedDate = new Date(msg.archived)
                return (now - archivedDate) < (3 * 24 * 60 * 60 * 1000)
            })

            messages.push(messageData)
            await fs.writeJson(archivePath, messages)

            // if (config.DEBUG_MODE) {
            //     logger.info(`📁 Message archived: ${messages.length} total messages`)
            // }

            // Clean up old archive files periodically (every 100 messages)
            if (messages.length % 100 === 0) {
                await this.cleanupOldArchives()
            }

        } catch (error) {
            logger.error('Failed to archive message:', error)
        }
    }

    async handleViewOnceMessage(message) {
        try {
            logger.info('👁️ View once message detected - capturing media...')
            
            // Extract the actual message from view once wrapper (Updated 2024)
            const viewOnceMsg = message.message.viewOnceMessage || 
                              message.message.viewOnceMessageV2 || 
                              message.message.viewOnceMessageV2Extension
            const actualMessage = viewOnceMsg?.message || viewOnceMsg

            logger.info(`🔍 View once message structure: ${JSON.stringify(Object.keys(actualMessage || {}), null, 2)}`)

            // Create a modified message object for media download
            const mediaMessage = {
                ...message,
                message: actualMessage
            }

            // Check if it has media
            if (this.hasMedia(actualMessage)) {
                logger.info('📥 Attempting to download view once media...')
                const buffer = await utils.downloadMedia(mediaMessage, this.socket)
                if (buffer && buffer.length > 0) {
                    logger.info(`📥 View once media downloaded successfully (${buffer.length} bytes)`)
                    const messageType = this.getMessageType(actualMessage)
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
                    const senderJid = message.key.participant || message.key.remoteJid
                    const senderNumber = senderJid.split('@')[0]

                    // Get file extension
                    let extension = ''
                    if (messageType === 'image') {
                        const imgMsg = actualMessage.imageMessage
                        const mimetype = imgMsg.mimetype || 'image/jpeg'
                        extension = mimetype.includes('png') ? '.png' : '.jpg'
                    } else if (messageType === 'video') {
                        extension = '.mp4'
                    } else if (messageType === 'audio') {
                        extension = '.ogg'
                    }

                    // Save to view-once directory
                    const fileName = `${senderNumber}_${message.key.id}_${timestamp}${extension}`
                    const viewOnceDir = path.join(__dirname, '..', 'data', 'view-once')
                    const filePath = path.join(viewOnceDir, fileName)
                    
                    await fs.ensureDir(viewOnceDir)
                    await fs.writeFile(filePath, buffer)

                    // Save metadata
                    const metadata = {
                        id: message.key.id,
                        sender: senderJid,
                        timestamp: new Date().toISOString(),
                        fileName: fileName,
                        mediaType: messageType,
                        filePath: filePath
                    }

                    const metadataPath = path.join(viewOnceDir, 'metadata.json')
                    let allMetadata = []
                    if (await fs.pathExists(metadataPath)) {
                        allMetadata = await fs.readJson(metadataPath)
                    }
                    allMetadata.push(metadata)
                    await fs.writeJson(metadataPath, allMetadata)

                    logger.info(`👁️ View once media saved: ${fileName}`)
                } else {
                    logger.warn('❌ Failed to download view once media - buffer was empty or null')
                }
            } else {
                logger.warn('❌ View once message detected but no media found')
                logger.info(`🔍 Message content keys: ${JSON.stringify(Object.keys(actualMessage || {}), null, 2)}`)
            }

        } catch (error) {
            logger.error('Failed to handle view once message:', error)
            logger.error('Error details:', error.stack)
        }
    }

    async logViewOnceEvent(message) {
        try {
            const senderJid = message.key.participant || message.key.remoteJid
            const senderNumber = senderJid.split('@')[0]
            const timestamp = new Date().toISOString()
            
            logger.info(`👁️ View once event logged from ${senderNumber} at ${timestamp}`)
            
            // Log the event to view once metadata for tracking
            const viewOnceDir = path.join(__dirname, '..', 'data', 'view-once')
            const eventsPath = path.join(viewOnceDir, 'events.json')
            
            await fs.ensureDir(viewOnceDir)
            
            let events = []
            if (await fs.pathExists(eventsPath)) {
                events = await fs.readJson(eventsPath)
            }
            
            events.push({
                id: message.key.id,
                sender: senderJid,
                timestamp: timestamp,
                type: 'view_once_stub',
                note: 'View once message detected but content was not available'
            })
            
            await fs.writeJson(eventsPath, events)
            
        } catch (error) {
            logger.error('Failed to log view once event:', error)
        }
    }

    async cleanupOldArchives() {
        try {
            const now = new Date()
            const threeDaysAgo = new Date(now - (3 * 24 * 60 * 60 * 1000))

            // Clean up old message archive files
            const messagesDir = config.MESSAGES_DIR
            if (await fs.pathExists(messagesDir)) {
                const years = await fs.readdir(messagesDir)

                for (const year of years) {
                    const yearPath = path.join(messagesDir, year)
                    if (!(await fs.stat(yearPath)).isDirectory()) continue

                    const months = await fs.readdir(yearPath)
                    for (const month of months) {
                        const monthPath = path.join(yearPath, month)
                        if (!(await fs.stat(monthPath)).isDirectory()) continue

                        const categories = await fs.readdir(monthPath)
                        for (const category of categories) {
                            const categoryPath = path.join(monthPath, category)
                            if (!(await fs.stat(categoryPath)).isDirectory()) continue

                            const dayFiles = await fs.readdir(categoryPath)
                            for (const dayFile of dayFiles) {
                                if (!dayFile.endsWith('.json')) continue

                                const filePath = path.join(categoryPath, dayFile)
                                const stats = await fs.stat(filePath)

                                // If file is older than 3 days, delete it
                                if (stats.mtime < threeDaysAgo) {
                                    await fs.remove(filePath)
                                    logger.info(`🗑️ Cleaned up old archive: ${filePath}`)
                                }
                            }
                        }
                    }
                }
            }

            // Clean up old media files
            const mediaDir = config.MEDIA_DIR
            if (await fs.pathExists(mediaDir)) {
                const mediaTypes = await fs.readdir(mediaDir)

                for (const mediaType of mediaTypes) {
                    const mediaTypePath = path.join(mediaDir, mediaType)
                    if (!(await fs.stat(mediaTypePath)).isDirectory()) continue

                    const mediaFiles = await fs.readdir(mediaTypePath)
                    for (const mediaFile of mediaFiles) {
                        const filePath = path.join(mediaTypePath, mediaFile)
                        const stats = await fs.stat(filePath)

                        // If file is older than 3 days, delete it
                        if (stats.mtime < threeDaysAgo) {
                            await fs.remove(filePath)
                            logger.info(`🗑️ Cleaned up old media: ${filePath}`)
                        }
                    }
                }
            }

        } catch (error) {
            logger.error('Failed to cleanup old archives:', error)
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
            const senderJid = message.key.participant || message.key.remoteJid
            const senderNumber = senderJid.split('@')[0]

            // Get proper file extension and mimetype
            let extension = ''
            let mimetype = ''

            if (messageType === 'image') {
                const imgMsg = message.message.imageMessage
                mimetype = imgMsg.mimetype || 'image/jpeg'
                extension = mimetype.includes('png') ? '.png' : '.jpg'
            } else if (messageType === 'video') {
                const vidMsg = message.message.videoMessage
                mimetype = vidMsg.mimetype || 'video/mp4'
                extension = '.mp4'
            } else if (messageType === 'audio') {
                const audMsg = message.message.audioMessage
                mimetype = audMsg.mimetype || 'audio/ogg'
                extension = mimetype.includes('mp3') ? '.mp3' : '.ogg'
            } else if (messageType === 'sticker') {
                const stickerMsg = message.message.stickerMessage
                mimetype = stickerMsg.mimetype || 'image/webp'
                extension = '.webp'
            } else if (messageType === 'document') {
                const docMsg = message.message.documentMessage
                mimetype = docMsg.mimetype || 'application/octet-stream'
                extension = docMsg.fileName ? path.extname(docMsg.fileName) : '.bin'
            }

            // Create descriptive filename: sender_messageId_timestamp.ext
            const fileName = `${senderNumber}_${message.key.id}_${timestamp}${extension}`
            const mediaPath = path.join(config.MEDIA_DIR, messageType, fileName)
            await fs.ensureDir(path.dirname(mediaPath))
            await fs.writeFile(mediaPath, buffer)

            // logger.info(`💾 Media saved: ${mediaPath}`)
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

            // Check if credentials file exists
            if (!await fs.pathExists(credFile)) {
                logger.info('📂 No creds.json file found')
                return false
            }

            // Check if credentials file has valid content
            const credData = await fs.readJson(credFile).catch(() => null)
            if (!credData || !credData.me || !credData.me.id) {
                logger.info('📂 Invalid or empty creds.json')
                return false
            }

            // Check for key files
            const keyFiles = await fs.readdir(authPath).catch(() => [])
            const hasKeyFiles = keyFiles.filter(f => 
                f.startsWith('app-state-sync-key-') || 
                f.startsWith('session-') ||
                f.includes('key')
            ).length > 0

            logger.info(`📂 Session validation: creds=${!!credData.me?.id}, keys=${hasKeyFiles}`)
            return hasKeyFiles

        } catch (error) {
            logger.info(`📂 Session validation error: ${error.message}`)
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

    async restart() {
        try {
            logger.info('🔄 Restarting bot connection...')

            // Clear heartbeat interval
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval)
            }

            // Close current connection without logging out
            if (this.socket) {
                this.socket.end()
                this.socket = null
            }

            this.isReady = false

            // Wait a moment before reconnecting
            await new Promise(resolve => setTimeout(resolve, 2000))

            // Reconnect
            await this.connect()
            logger.info('✅ Bot restarted successfully')

        } catch (error) {
            logger.error('❌ Error during restart:', error)
            // If restart fails, try to reconnect after a delay
            setTimeout(() => this.connect(), 5000)
        }
    }

    async destroy() {
        try {
            logger.info('🛑 Destroying client connection...')

            // Clear heartbeat interval
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval)
            }

            // Close plugin watcher
            if (this.pluginWatcher) {
                await this.pluginWatcher.close()
                this.pluginWatcher = null
                logger.info('🔥 Plugin watcher closed')
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
            logger.error('❌ Error during client destruction:', error)
        }
    }

    async selectAuthenticationMethod() {
        // Always use pairing code when phone number is provided in config
        if (config.PHONE_NUMBER && config.PHONE_NUMBER.trim()) {
            this.authMethod = 'pairing'
            this.phoneNumber = config.PHONE_NUMBER.replace(/\D/g, '')
            logger.info('🔧 Using 8-digit pairing code authentication (configured)')
            console.log(`📱 Phone number set: ${this.phoneNumber}`)
            return
        }

        // Interactive selection when no phone number is configured
        const readline = require('readline')
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })

        return new Promise((resolve) => {
            console.log('\n' + '='.repeat(50))
            console.log('WHATSAPP AUTHENTICATION METHOD')
            console.log('Choose your authentication method:')
            console.log('1. 8-Digit Pairing Code - Use phone number [RECOMMENDED]')
            console.log('2. QR Code - Scan with your phone')
            console.log('='.repeat(50))

            const askChoice = () => {
                rl.question('Enter your choice (1 or 2, press Enter for pairing code): ', async (choice) => {
                    if (choice.trim() === '2') {
                        // QR code option
                        this.authMethod = 'qr'
                        logger.info('🔧 Using QR code authentication')
                        rl.close()
                        resolve()
                    } else {
                        // Default to pairing code (choice 1 or just Enter)
                        const askPhone = () => {
                            rl.question('Enter your WhatsApp phone number (with country code, example: 2347018091555): ', (phoneNumber) => {
                                // Validate phone number format - clean it first
                                const cleanNumber = phoneNumber.replace(/\D/g, '')
                                console.log(`📞 Cleaned number: ${cleanNumber} (length: ${cleanNumber.length})`)

                                if (cleanNumber.length >= 10 && cleanNumber.length <= 15) {
                                    this.authMethod = 'pairing'
                                    this.phoneNumber = cleanNumber
                                    logger.info('🔧 Using 8-digit pairing code authentication')
                                    console.log(`📱 Phone number set: ${cleanNumber}`)
                                    rl.close()
                                    resolve()
                                } else {
                                    console.log('❌ Invalid phone number format. Please enter 10-15 digits with country code.')
                                    console.log('Example: 2347018091555 (Nigeria), 1234567890 (US), etc.')
                                    console.log('Note: Do not include + symbol or spaces')
                                    askPhone() // Ask again
                                }
                            })
                        }
                        askPhone()
                    }
                })
            }
            askChoice()
        })
    }

    async clearAndReauthenticate() {
        try {
            logger.info('🗑️ Clearing corrupted session data...')
            const authPath = path.join(config.SESSION_DIR, config.SESSION_ID || 'main', 'auth')

            // Remove auth directory completely
            await fs.remove(authPath)

            // Reset failure count and auth method
            this.failureCount = 0
            this.authMethod = null
            this.phoneNumber = null
            this.pairingCodeRequested = false

            logger.info('✅ Session cleared, will re-authenticate...')
            logger.info('📱 Please restart the bot to begin fresh authentication...')

            // Exit instead of restarting to prevent infinite loops
            process.exit(0)

        } catch (error) {
            logger.error('❌ Error clearing session:', error)
            setTimeout(async () => {
                try {
                    await this.connect()
                } catch (error) {
                    logger.error('❌ Reconnection failed, retrying in 10 seconds...', error)
                    setTimeout(() => this.clearAndReauthenticate(), 10000)
                }
            }, 5000)
        }
    }

    shouldReact() {
        try {
            const botReactionModule = require('../plugins/bot-reactions')
            if (botReactionModule && botReactionModule.getBotReactionConfig) {
                const config = botReactionModule.getBotReactionConfig()
                return config.enabled
            }
        } catch (error) {
            // Module not loaded or error
        }
        return true // Default to enabled if module not available
    }

    async waitForAuthentication() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Authentication timeout'))
            }, 300000) // 5 minutes timeout

            const checkAuth = () => {
                if (this.isReady) {
                    clearTimeout(timeout)
                    resolve()
                } else {
                    setTimeout(checkAuth, 1000)
                }
            }

            // Start checking after socket is ready
            this.once('ready', () => {
                clearTimeout(timeout)
                resolve()
            })

            // Handle disconnection during auth
            this.once('disconnected', (error) => {
                clearTimeout(timeout)
                reject(error || new Error('Disconnected during authentication'))
            })
        })
    }
}

module.exports = { Client, bot, logger }