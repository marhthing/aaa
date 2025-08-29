const EventEmitter = require('events');

class MessageProcessor extends EventEmitter {
    constructor(dependencies) {
        super();

        this.client = dependencies.client;
        this.accessController = dependencies.accessController;
        this.loadingReaction = dependencies.loadingReaction;
        this.messageArchiver = dependencies.messageArchiver;
        this.mediaVault = dependencies.mediaVault;
        this.stateEngine = dependencies.stateEngine;
        this.pluginDiscovery = dependencies.pluginDiscovery;
        this.eventBus = dependencies.eventBus;

        this.processingQueue = [];
        this.isProcessing = false;
        this.maxConcurrentProcessing = parseInt(process.env.MAX_CONCURRENT_COMMANDS || '5');
        this.activeProcessing = new Set();
        
        // Add deletion queue to handle rapid bulk deletions properly
        this.deletionQueue = [];
        this.processingDeletions = false;
        
        // Start deletion queue processor
        this.startDeletionProcessor();
    }

    async processMessage(message) {
        try {
            const isOutgoing = message.key.fromMe;

            // Emit message received event
            this.eventBus?.emitMessageReceived(message);

            // Check for view-once messages and capture them - this must happen BEFORE archiving
            if (this.hasViewOnceMessage(message)) {
                console.log('🔐 View-once message detected in processor, handling immediately...');
                await this.handleViewOnceMessage(message);
            }

            // Download media first if present to get the path before archiving
            let storedMedia = null;
            if (this.hasMedia(message)) {
                storedMedia = await this.downloadAndStoreMedia(message);
            }
            
            // Archive message with media information included directly - no more two-step process!
            const archiveResult = await this.messageArchiver.archiveMessage(message, isOutgoing, storedMedia);

            // Only process messages that start with command prefix - optimize performance
            const messageText = this.getMessageText(message);
            const prefix = process.env.COMMAND_PREFIX || process.env.PREFIX || '.';

            // Skip processing if message doesn't start with prefix (for non-outgoing messages)
            // BUT allow game inputs to be processed even without prefix when a game is active
            if (!isOutgoing && (!messageText || !messageText.trim().startsWith(prefix))) {
                // Check if there's an active game in this chat that might accept this input
                const chatId = message.key.remoteJid;
                const activeGame = this.accessController.getActiveGame(chatId);
                
                if (!activeGame) {
                    return; // Don't waste resources on non-command messages when no game is active
                }
                
                // Continue processing for potential game input
            }

            // Extract command if present (for both incoming and outgoing messages)
            const command = this.extractCommand(message);

            // Skip non-command outgoing messages, but process command outgoing messages
            if (isOutgoing && !command) {
                return;
            }

            // Check access control
            const commandName = command ? command.name : null;
            const accessResult = this.accessController.canProcessMessage(message, commandName);

            if (!accessResult.allowed) {
                // Log access denied with proper JID extraction
                const senderJid = message.key?.participant || message.key?.remoteJid || message.author || message.from;
                console.log(`🚫 Access denied for ${senderJid}: ${accessResult.reason}`);
                this.eventBus?.emitAccessDenied(message, accessResult.reason);
                return;
            }

            // Process based on access reason
            switch (accessResult.reason) {
                case 'owner':
                    await this.processOwnerMessage(message, command);
                    break;

                case 'game_player':
                    await this.processGameMessage(message, accessResult.gameType);
                    break;

                case 'allowed_command':
                    await this.processAllowedCommand(message, command);
                    break;
            }

        } catch (error) {
            console.error('❌ Error processing message:', error);
            this.eventBus?.emit('error', { type: 'message_processing', error, message });
        }
    }

    hasMedia(message) {
        // Check if message has media content - comprehensive check
        if (message.message) {
            const hasMediaContent = !!(message.message.imageMessage || 
                                      message.message.videoMessage || 
                                      message.message.audioMessage || 
                                      message.message.documentMessage || 
                                      message.message.stickerMessage);
            
            // Also check for view once messages that might contain media
            if (!hasMediaContent && message.message.viewOnceMessage) {
                return !!(message.message.viewOnceMessage.message?.imageMessage ||
                         message.message.viewOnceMessage.message?.videoMessage);
            }
            
            return hasMediaContent;
        }
        
        // Additional checks for different message formats
        if (message.hasMedia) return true;
        
        // Check for raw media properties
        if (message.type === 'image' || message.type === 'video' || 
            message.type === 'audio' || message.type === 'sticker' || 
            message.type === 'document') {
            return true;
        }
        
        return false;
    }

    hasViewOnceMessage(message) {
        // Check if message contains view-once content
        if (message.message?.viewOnceMessage?.message) {
            console.log('🔐 Detected wrapped view-once message');
            return true;
        }
        
        // Check for view-once v2 format (viewOnceMessageV2)
        if (message.message?.viewOnceMessageV2?.message) {
            console.log('🔐 Detected view-once v2 message');
            return true;
        }
        
        // Check if the message has viewOnce property set to true
        if (message.message?.imageMessage?.viewOnce || message.message?.videoMessage?.viewOnce) {
            console.log('🔐 Detected view-once message with viewOnce flag');
            return true;
        }
        
        return false;
    }

    async handleViewOnceMessage(message) {
        try {
            console.log('🔐 View-once message detected, attempting to capture...');
            
            // Get the anti-view-once plugin
            const antiViewOncePlugin = this.pluginDiscovery?.getPlugin('anti-view-once');
            
            if (antiViewOncePlugin) {
                // Ensure plugin has access to dependencies
                if (!antiViewOncePlugin.client) {
                    antiViewOncePlugin.client = this.client;
                }
                if (!antiViewOncePlugin.mediaVault) {
                    antiViewOncePlugin.mediaVault = this.mediaVault;
                }
                
                await antiViewOncePlugin.captureViewOnceMessage(message);
            } else {
                console.warn('⚠️ Anti-view-once plugin not available for capturing');
            }
        } catch (error) {
            console.error('❌ Error handling view-once message:', error);
        }
    }

    hasValidMediaKey(message) {
        try {
            // Check for valid media key and URL for each message type
            const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
            
            for (const mediaType of mediaTypes) {
                let mediaObj = message.message?.[mediaType];
                
                // Check view once messages
                if (!mediaObj && message.message?.viewOnceMessage?.message) {
                    mediaObj = message.message.viewOnceMessage.message[mediaType];
                }
                
                if (mediaObj) {
                    // Check if it has both mediaKey and url (required for download)
                    if (mediaObj.mediaKey && (mediaObj.url || mediaObj.directPath)) {
                        return true;
                    }
                    // For some messages, mediaKey might be in a Buffer format
                    if (mediaObj.mediaKey && mediaObj.mediaKey.length > 0 && (mediaObj.url || mediaObj.directPath)) {
                        return true;
                    }
                    // Sometimes the media might be a quotedMessage
                    if (mediaObj.quotedMessage && this.hasValidMediaKey({ message: { [mediaType]: mediaObj.quotedMessage } })) {
                        return true;
                    }
                }
            }
            
            // Check if it's a forwarded message with media
            if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                const quotedMessage = { message: message.message.extendedTextMessage.contextInfo.quotedMessage };
                return this.hasValidMediaKey(quotedMessage);
            }
            
            return false;
        } catch (error) {
            console.warn('Error checking media key validity:', error);
            return false;
        }
    }

    async downloadAndStoreMedia(message) {
        try {
            if (!this.hasMedia(message)) {
                return null;
            }
            
            // Check if message has valid media key before attempting download
            if (!this.hasValidMediaKey(message)) {
                console.warn(`⚠️ Message ${message.key?.id} has media but no valid media key/URL, skipping download`);
                // Log the message structure for debugging
                console.debug('Message structure:', JSON.stringify({
                    id: message.key?.id,
                    hasImageMessage: !!message.message?.imageMessage,
                    hasVideoMessage: !!message.message?.videoMessage,
                    hasAudioMessage: !!message.message?.audioMessage,
                    hasDocumentMessage: !!message.message?.documentMessage,
                    hasStickerMessage: !!message.message?.stickerMessage,
                    imageMediaKey: !!message.message?.imageMessage?.mediaKey,
                    imageUrl: !!message.message?.imageMessage?.url,
                    imageDirectPath: !!message.message?.imageMessage?.directPath
                }, null, 2));
                return null;
            }

            console.log('📥 Downloading media...');

            // Use Baileys downloadMediaMessage function with better timeout and retry logic
            const { downloadMediaMessage } = require('@whiskeysockets/baileys');
            
            const downloadPromise = downloadMediaMessage(message, 'buffer', {}, { 
                logger: require('pino')({ level: 'silent' })
            });
            
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Download timeout')), 10000) // 10 second timeout
            );
            
            const buffer = await Promise.race([downloadPromise, timeoutPromise]);

            if (!buffer) {
                console.warn('⚠️ Failed to download media - no buffer received');
                return null;
            }

            // Determine media type and mimetype
            let mediaType = 'document';
            let mimetype = 'application/octet-stream';
            let filename = 'file';

            // Priority order: sticker first, then other types
            if (message.message.stickerMessage) {
                mediaType = 'sticker';
                mimetype = message.message.stickerMessage.mimetype || 'image/webp';
                filename = 'sticker.webp';
            } else if (message.message.imageMessage) {
                mediaType = 'image';
                mimetype = message.message.imageMessage.mimetype || 'image/jpeg';
                filename = message.message.imageMessage.caption ? 
                    `image_${Date.now()}.jpg` : 'image.jpg';
            } else if (message.message.videoMessage) {
                mediaType = 'video';
                mimetype = message.message.videoMessage.mimetype || 'video/mp4';
                filename = message.message.videoMessage.caption ? 
                    `video_${Date.now()}.mp4` : 'video.mp4';
            } else if (message.message.audioMessage) {
                mediaType = 'audio';
                mimetype = message.message.audioMessage.mimetype || 'audio/ogg';
                filename = message.message.audioMessage.ptt ? 'voice.ogg' : 'audio.ogg';
            } else if (message.message.documentMessage) {
                mediaType = 'document';
                mimetype = message.message.documentMessage.mimetype || 'application/octet-stream';
                filename = message.message.documentMessage.fileName || `document_${Date.now()}`;
            }

            // Store in media vault with caption
            const mediaData = {
                data: buffer,
                mimetype: mimetype,
                filename: filename,
                caption: this.extractMediaCaption(message)
            };

            const storedMedia = await this.mediaVault.storeMedia(mediaData, message);
            console.log(`✅ Media stored: ${storedMedia.filename} (${this.formatSize(buffer.length)})`);

            return storedMedia;

        } catch (error) {
            console.error('❌ Error downloading/storing media:', error);
            return null;
        }
    }

    extractMediaCaption(message) {
        if (!message || !message.message) return null;
        
        // Extract caption from different message types
        if (message.message.imageMessage?.caption) {
            return message.message.imageMessage.caption;
        }
        if (message.message.videoMessage?.caption) {
            return message.message.videoMessage.caption;
        }
        if (message.message.documentMessage?.caption) {
            return message.message.documentMessage.caption;
        }
        
        return null;
    }

    formatSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async executeCommand(message, command) {
        try {
            // Get command execution from plugin discovery
            const result = await this.pluginDiscovery.executeCommand(command.name, {
                message,
                command,
                args: command.args,
                reply: async (text, options = {}) => {
                    await this.sendMessage(message.key.remoteJid || message.from, text, options);
                }
            });

            return result;

        } catch (error) {
            console.error(`❌ Error executing command '${command.name}':`, error);
            await this.sendMessage(
                message.key.remoteJid || message.from, 
                `❌ Error executing command: ${error.message}`
            );
        }
    }

    async sendMessage(chatId, content, options = {}) {
        try {
            if (!this.client) {
                throw new Error('WhatsApp client not available');
            }

            let messageContent;
            if (typeof content === 'string') {
                messageContent = { text: content };
            } else {
                messageContent = content;
            }

            const sentMessage = await this.client.sendMessage(chatId, messageContent, options);

            // Archive the outgoing message
            if (sentMessage) {
                await this.messageArchiver.archiveMessage(sentMessage, true);
            }

            return sentMessage;

        } catch (error) {
            console.error('❌ Error sending message:', error);
            throw error;
        }
    }

    async sendErrorMessage(message, error) {
        try {
            const errorText = `❌ **Error**\n\n${error.message || 'An unknown error occurred'}`;
            await this.sendMessage(message.key.remoteJid || message.from, errorText);
        } catch (sendError) {
            console.error('❌ Failed to send error message:', sendError);
        }
    }

    extractCommand(message) {
        // Extract message text from different message types
        let text = '';

        if (message.message) {
            if (message.message.conversation) {
                text = message.message.conversation;
            } else if (message.message.extendedTextMessage?.text) {
                text = message.message.extendedTextMessage.text;
            } else if (message.message.imageMessage?.caption) {
                text = message.message.imageMessage.caption;
            } else if (message.message.videoMessage?.caption) {
                text = message.message.videoMessage.caption;
            }
        }

        // Fallback to direct body property
        if (!text && message.body) {
            text = message.body;
        }

        if (!text || typeof text !== 'string') {
            return null;
        }

        const trimmed = text.trim();
        const prefix = process.env.COMMAND_PREFIX || process.env.PREFIX || '.';

        if (!trimmed.startsWith(prefix)) {
            return null;
        }

        const parts = trimmed.substring(prefix.length).split(' ');
        return {
            name: parts[0].toLowerCase(),
            args: parts.slice(1),
            raw: trimmed,
            prefix: prefix
        };
    }

    async processOwnerMessage(message, command) {
        if (!command) {
            // Not a command, just archive and return
            return;
        }

        try {
            // Show loading reaction for owner commands
            await this.loadingReaction.processCommandWithReaction(message, async () => {
                return await this.executeCommand(message, command);
            });

        } catch (error) {
            console.error(`❌ Error processing owner command '${command.name}':`, error);
            await this.sendErrorMessage(message, error);
        }
    }

    async processGameMessage(message, gameType) {
        try {
            const chatId = message.key.remoteJid || message.from;
            const activeGame = this.accessController.getActiveGame(chatId);

            if (!activeGame) {
                return; // Game no longer active
            }

            // Check if message is a valid game input
            if (this.accessController.isValidGameInput(message, gameType)) {
                await this.executeGameMove(message, activeGame);
            }
            // Invalid game input is silently ignored

        } catch (error) {
            console.error(`❌ Error processing game message:`, error);
        }
    }

    async processAllowedCommand(message, command) {
        if (!command) {
            return; // Not a command
        }

        try {
            // Extract sender JID properly from Baileys message structure
            let userJid;
            if (message.key) {
                userJid = message.key.participant || message.key.remoteJid;
            }
            if (!userJid) {
                userJid = message.author || message.from;
            }

            console.log(`🔍 processAllowedCommand: Extracted JID: ${userJid} for command: ${command.name}`);

            if (!this.accessController.isCommandAllowed(userJid, command.name)) {
                console.log(`❌ Command '${command.name}' not allowed for user: ${userJid}`);
                return; // Command not allowed
            }

            // Execute allowed command (no loading reaction for non-owners)
            await this.executeCommand(message, command);

        } catch (error) {
            console.error(`❌ Error processing allowed command '${command.name}':`, error);
        }
    }

    async executeCommand(message, command) {
        const startTime = Date.now();

        try {
            // Find and execute command through plugin system
            const result = await this.pluginDiscovery.executeCommand(command.name, message, command);

            const duration = Date.now() - startTime;

            // Log command execution
            console.log(`⚡ Command '${command.name}' executed in ${duration}ms`);

            // Emit command executed event
            this.eventBus?.emitCommandExecuted(command.name, message, result);

            return result;

        } catch (error) {
            const duration = Date.now() - startTime;

            console.error(`❌ Command '${command.name}' failed after ${duration}ms:`, error);

            // Emit command error event
            this.eventBus?.emitCommandError(command.name, message, error);

            throw error;
        }
    }

    async executeGameMove(message, gameInfo) {
        try {
            // Extract game input text
            const inputText = this.getMessageText(message);
            
            // Extract sender JID properly
            let senderJid;
            if (message.key) {
                senderJid = message.key.participant || message.key.remoteJid;
            } else {
                senderJid = message.author || message.from;
            }
            
            // Extract chat ID
            const chatId = message.key.remoteJid || message.from;
            
            console.log(`🎮 Game move - Type: ${gameInfo.type}, Player: ${senderJid}, Input: "${inputText}", Chat: ${chatId}`);
            
            // Emit game input event for plugins to handle
            this.eventBus.emit('game_input_received', {
                chatId: chatId,
                input: inputText.trim(),
                player: senderJid,
                gameType: gameInfo.type,
                gameInfo: gameInfo,
                message: message
            });

        } catch (error) {
            console.error('❌ Error executing game move:', error);
        }
    }

    startDeletionProcessor() {
        // Process deletion queue every 300ms to handle rapid deletions calmly
        setInterval(async () => {
            if (!this.processingDeletions && this.deletionQueue.length > 0) {
                await this.processDeletionQueue();
            }
        }, 300);
    }

    async processDeletionQueue() {
        if (this.processingDeletions) return;
        
        this.processingDeletions = true;
        
        try {
            // Take up to 2 deletions at a time to prevent overwhelming and confusion
            const batch = this.deletionQueue.splice(0, 2);
            
            if (batch.length > 0) {
                console.log(`🔍 Processing ${batch.length} queued deletion(s) calmly`);
                
                // Process each deletion sequentially to avoid race conditions and media confusion
                for (const deletionData of batch) {
                    try {
                        await this.processSingleDeletion(deletionData);
                        // Mandatory delay between each deletion to prevent type confusion
                        await new Promise(resolve => setTimeout(resolve, 200));
                    } catch (error) {
                        console.error(`❌ Error processing deletion:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error processing deletion queue:', error);
        } finally {
            this.processingDeletions = false;
        }
    }

    async processSingleDeletion(deletionData) {
        // Handle different deletion data formats from Baileys
        let messageKeys = [];

        if (Array.isArray(deletionData)) {
            messageKeys = deletionData;
        } else if (deletionData.messages) {
            messageKeys = deletionData.messages;
        } else if (deletionData.key || deletionData.id) {
            messageKeys = [deletionData];
        }

        for (const messageKey of messageKeys) {
            const messageId = messageKey.id || messageKey;
            const chatId = messageKey.remoteJid || messageKey.from;

            console.log(`🔍 Looking for archived message - ID: ${messageId}, Chat: ${chatId}`);

            // Try to recover from archive
            const archivedMessage = await this.messageArchiver.getMessageById(messageId);

            if (archivedMessage) {
                console.log(`📋 Found archived message for deletion: ${messageId} (Type: ${archivedMessage.type})`);

                // Get anti-delete plugin
                const antiDeletePlugin = await this.pluginDiscovery.getPlugin('anti-delete');

                if (antiDeletePlugin && typeof antiDeletePlugin.handleDeletedMessage === 'function') {
                    console.log(`🔄 Forwarding deletion to anti-delete plugin with preserved type info`);
                    await antiDeletePlugin.handleDeletedMessage(messageKey, null, archivedMessage);
                } else {
                    console.log(`⚠️ Anti-delete plugin not available or doesn't have handleDeletedMessage method`);
                }
            } else {
                console.log(`⚠️ No archived message found for: ${messageId}`);

                // Still notify anti-delete plugin about the deletion attempt
                const antiDeletePlugin = await this.pluginDiscovery.getPlugin('anti-delete');
                if (antiDeletePlugin && typeof antiDeletePlugin.handleDeletedMessage === 'function') {
                    console.log(`🔄 Notifying anti-delete plugin of deletion without archived message`);
                    await antiDeletePlugin.handleDeletedMessage(messageKey, null, null);
                }
            }
        }
    }

    async processDeletedMessage(deletionData) {
        try {
            console.log('🗂️ Queuing deletion for calm processing');
            
            // Add deletions to queue instead of processing immediately
            // This prevents confusion during rapid bulk deletions
            this.deletionQueue.push(deletionData);
            
            console.log(`📝 Deletion queue now has ${this.deletionQueue.length} item(s)`);
            
        } catch (error) {
            console.error('❌ Error queuing deleted message:', error);
        }
    }

    async sendMessage(chatId, content, options = {}) {
        try {
            // Ensure content is properly formatted for Baileys
            let messageContent;

            if (typeof content === 'string') {
                messageContent = { text: content, ...options };
            } else if (content && typeof content === 'object') {
                messageContent = content;
            } else {
                throw new Error('Invalid message content format');
            }

            return await this.client.sendMessage(chatId, messageContent);
        } catch (error) {
            console.error('❌ Failed to send message:', error);
            throw error;
        }
    }

    async sendErrorMessage(message, error) {
        try {
            const errorText = `❌ Error: ${error.message || 'Unknown error occurred'}`;
            await this.sendMessage(message.key.remoteJid, { text: errorText });
        } catch (sendError) {
            console.error('❌ Failed to send error message:', sendError);
        }
    }

    async replyToMessage(message, content, options = {}) {
        try {
            // Quote the original message
            return await message.reply(content, options);
        } catch (error) {
            console.error('❌ Failed to reply to message:', error);
            throw error;
        }
    }

    getProcessingStats() {
        return {
            queueSize: this.processingQueue.length,
            isProcessing: this.isProcessing,
            activeProcessing: this.activeProcessing.size,
            maxConcurrent: this.maxConcurrentProcessing
        };
    }

    getMessageText(message) {
        // Extract message text from different message types
        if (message.message) {
            if (message.message.conversation) {
                return message.message.conversation;
            } else if (message.message.extendedTextMessage?.text) {
                return message.message.extendedTextMessage.text;
            } else if (message.message.imageMessage?.caption) {
                return message.message.imageMessage.caption;
            } else if (message.message.videoMessage?.caption) {
                return message.message.videoMessage.caption;
            }
        }

        // Fallback to direct body property
        return message.body || '';
    }

    async shutdown() {
        try {
            console.log('🛑 Shutting down message processor...');

            // Wait for active processing to complete
            while (this.activeProcessing.size > 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            console.log('✅ Message processor shutdown complete');

        } catch (error) {
            console.error('❌ Error during message processor shutdown:', error);
        }
    }
}

module.exports = MessageProcessor;