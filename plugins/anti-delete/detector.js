const fs = require('fs-extra');
const path = require('path');
const EnvironmentManager = require('../../core/EnvironmentManager');

class Detector {
    constructor(botClient, eventBus) {
        this.botClient = botClient;
        this.eventBus = eventBus;
        this.envManager = new EnvironmentManager();
        
        this.deletionLog = [];
        this.maxLogSize = 1000;
        this.dataPath = null;
        
        this.isInitialized = false;
    }

    async initialize() {
        try {
            await this.envManager.initialize();
            
            this.dataPath = path.join(
                this.envManager.get('DATA_DIR', './data'),
                'plugins',
                'anti-delete'
            );
            
            await fs.ensureDir(this.dataPath);
            
            // Load existing deletion log
            await this.loadDeletionLog();
            
            this.isInitialized = true;
            
        } catch (error) {
            console.error('Error initializing Anti-Delete Detector:', error);
            throw error;
        }
    }

    setPlugin(plugin) {
        this.plugin = plugin;
    }

    async loadDeletionLog() {
        try {
            const logPath = path.join(this.dataPath, 'deletion_log.json');
            
            if (await fs.pathExists(logPath)) {
                this.deletionLog = await fs.readJson(logPath);
            }
            
        } catch (error) {
            console.error('Error loading deletion log:', error);
        }
    }

    async saveDeletionLog() {
        try {
            const logPath = path.join(this.dataPath, 'deletion_log.json');
            
            // Keep only the most recent entries
            if (this.deletionLog.length > this.maxLogSize) {
                this.deletionLog = this.deletionLog.slice(-this.maxLogSize);
            }
            
            await fs.writeJson(logPath, this.deletionLog, { spaces: 2 });
            
        } catch (error) {
            console.error('Error saving deletion log:', error);
        }
    }

    async handleDeletion(data) {
        try {
            console.log('🔍 Anti-delete handling deletion data:', JSON.stringify(data, null, 2));
            
            const { after, before } = data;
            
            if (!before) {
                console.log('🔍 Message deletion detected but no original message available');
                return;
            }
            
            // Check if this is a view-once message and skip it
            if (this.isViewOnceMessage(before)) {
                console.log('🔐 Skipping view-once message deletion - handled by anti-view-once plugin');
                return;
            }
            
            // Extract proper data from Baileys message structure
            const messageText = this.extractMessageText(before);
            const senderJid = this.extractSenderJid(before);
            const chatId = this.extractChatId(before);
            const messageId = this.extractMessageId(before);
            
            console.log(`🔍 Processing deletion - Chat: ${chatId}, Sender: ${senderJid}, MessageID: ${messageId}`);
            
            // Handle different timestamp formats
            let originalTimestamp;
            if (before.messageTimestamp) {
                // Baileys format (Unix timestamp)
                originalTimestamp = new Date(before.messageTimestamp * 1000).toISOString();
            } else if (before.timestamp) {
                // Archived message format - check if it's already ISO string or Date object
                if (typeof before.timestamp === 'string') {
                    originalTimestamp = before.timestamp;
                } else if (before.timestamp instanceof Date) {
                    originalTimestamp = before.timestamp.toISOString();
                } else {
                    // Assume it's a Unix timestamp
                    originalTimestamp = new Date(before.timestamp).toISOString();
                }
            } else {
                // Fallback to current time
                originalTimestamp = new Date().toISOString();
            }

            const deletionEntry = {
                id: this.generateId(),
                originalMessageId: messageId,
                deletedMessageId: after ? this.extractMessageId(after) : null,
                chatId: chatId,
                sender: senderJid,
                originalTimestamp: originalTimestamp,
                deletedTimestamp: new Date().toISOString(),
                messageType: this.getMessageType(before),
                messageBody: messageText,
                hasMedia: this.hasMedia(before),
                mediaType: this.hasMedia(before) ? this.getMediaType(before) : null,
                notifiedOwner: false
            };
            
            this.deletionLog.push(deletionEntry);
            await this.saveDeletionLog();
            
            // Emit deletion detected event
            this.eventBus.emit('deletion_detected', deletionEntry);
            
            // Notify and forward deleted message (always enabled for now)
            await this.forwardDeletedMessage(deletionEntry);
            
            console.log(`🔍 Logged message deletion: ${deletionEntry.originalMessageId}`);
            
        } catch (error) {
            console.error('Error handling message deletion:', error);
        }
    }

    async forwardDeletedMessage(deletionEntry) {
        try {
            // Get target JID from plugin
            let targetJid;
            
            if (this.plugin) {
                targetJid = this.plugin.getTargetJid();
            } else {
                // Fallback to owner JID
                const accessController = this.botClient.getAccessController();
                targetJid = accessController.ownerJid;
            }
            
            if (!targetJid) {
                console.warn('⚠️ Target JID not available for anti-delete forwarding');
                return;
            }
            
            // Attempt to get the original message from storage
            let originalMessage = null;
            try {
                originalMessage = await this.botClient.messageArchiver.getMessageById(deletionEntry.originalMessageId);
            } catch (error) {
                console.warn('Could not retrieve original message from storage:', error);
                return; // Skip if we can't get the original message
            }
            
            if (!originalMessage) {
                console.warn('No original message found in storage, skipping anti-delete forward');
                return; // Skip if no original message available
            }
            
            // Create proper contextInfo for tagging with actual sender JID
            const contextInfo = {
                quotedMessage: {
                    conversation: "" // Empty as requested
                },
                participant: deletionEntry.sender, // Use actual sender JID
                remoteJid: deletionEntry.chatId
            };
            
            // Forward based on message type with better type preservation
            console.log(`🔍 Original message type: ${originalMessage.type}, Media type: ${deletionEntry.mediaType}`);
            
            // Use the preserved type from archived message for accurate forwarding
            const isMediaMessage = this.hasMedia(originalMessage) || this.isMediaType(deletionEntry.mediaType);
            
            if (isMediaMessage) {
                console.log(`📸 Forwarding deleted ${deletionEntry.mediaType} as tagged message...`);
                await this.forwardDeletedMediaAsTagged(originalMessage, targetJid, contextInfo, deletionEntry);
            } else if (deletionEntry.messageBody && deletionEntry.messageBody !== '[Sticker]') {
                // Forward text as tagged message - just the plain text, no emojis
                await this.botClient.sendMessage(targetJid, deletionEntry.messageBody, { 
                    contextInfo: contextInfo
                });
                console.log(`✅ Deleted text message forwarded as tagged message`);
            } else {
                console.log(`⚠️ Skipping deletion forward - no recoverable content for ${deletionEntry.mediaType}`);
            }
            // If it's not text or media, don't send anything (no placeholders)
            
            // Mark as notified
            deletionEntry.notifiedOwner = true;
            await this.saveDeletionLog();
            
            console.log(`📤 Forwarded deleted message to: ${targetJid}`);
            
        } catch (error) {
            console.error('Error forwarding deleted message:', error);
        }
    }

    async forwardDeletedMediaAsTagged(originalMessage, targetJid, contextInfo, deletionEntry) {
        try {
            const mediaType = deletionEntry.mediaType;
            const messageId = deletionEntry.originalMessageId;

            // Get media file using the improved MediaVault system
            let mediaData = null;
            
            try {
                // Use the new getMediaByMessageId method for more reliable retrieval
                mediaData = await this.botClient.mediaVault.getMediaByMessageId(messageId);
                
                if (mediaData) {
                    console.log(`💾 Retrieved media from MediaVault for message: ${messageId}`);
                } else {
                    console.warn(`⚠️ No media found in MediaVault for message: ${messageId}`);
                }
            } catch (error) {
                console.error(`❌ Error retrieving media from MediaVault:`, error);
            }
            
            // If MediaVault doesn't have it, try the stored path as fallback
            if (!mediaData && originalMessage.mediaPath) {
                try {
                    const fs = require('fs-extra');
                    const path = require('path');
                    const fullPath = path.join(process.cwd(), 'data', 'media', originalMessage.mediaPath);
                    
                    if (await fs.pathExists(fullPath)) {
                        const mediaBuffer = await fs.readFile(fullPath);
                        console.log(`📂 Retrieved media from archived path: ${originalMessage.mediaPath}`);
                        
                        // Create compatible structure
                        mediaData = {
                            data: mediaBuffer,
                            metadata: {
                                messageId: messageId,
                                category: mediaType,
                                mimetype: originalMessage.mimetype
                            }
                        };
                    }
                } catch (error) {
                    console.error(`❌ Error reading media file from archived path:`, error);
                }
            }
            
            if (!mediaData || !mediaData.data) {
                console.warn(`⚠️ No media data found for ${messageId}, skipping anti-delete forward`);
                return; // Don't send anything if media not available
            }
            
            const mediaBuffer = mediaData.data;

            console.log(`📤 Forwarding deleted ${mediaType} as tagged message`);

            let messageToSend = {};
            
            // Use the original message type for accurate forwarding (prevents confusion)
            const originalType = originalMessage.type || mediaType;
            console.log(`🎯 Using preserved type for forwarding: ${originalType}`);
            
            switch (originalType) {
                case 'image':
                    messageToSend = { 
                        image: mediaBuffer, 
                        caption: this.extractMediaCaption(originalMessage) || undefined,
                        contextInfo: contextInfo
                    };
                    break;
                    
                case 'video':
                    messageToSend = { 
                        video: mediaBuffer, 
                        caption: this.extractMediaCaption(originalMessage) || undefined,
                        contextInfo: contextInfo
                    };
                    break;
                    
                case 'audio':
                case 'voice':
                    messageToSend = { 
                        audio: mediaBuffer, 
                        ptt: originalMessage.ptt || false,
                        mimetype: originalMessage.mimetype || 'audio/mpeg',
                        contextInfo: contextInfo
                    };
                    break;
                    
                case 'document':
                    messageToSend = { 
                        document: mediaBuffer, 
                        fileName: originalMessage.fileName || 'deleted_document',
                        mimetype: originalMessage.mimetype || 'application/octet-stream',
                        caption: this.extractMediaCaption(originalMessage) || undefined,
                        contextInfo: contextInfo
                    };
                    break;
                    
                case 'sticker':
                    messageToSend = { 
                        sticker: mediaBuffer,
                        contextInfo: contextInfo
                    };
                    break;
                    
                default:
                    console.warn(`Unknown original type: ${originalType}, trying fallback based on media type: ${mediaType}`);
                    // Fallback to mediaType detection for backward compatibility
                    if (mediaType.includes('sticker')) {
                        messageToSend = { 
                            sticker: mediaBuffer,
                            contextInfo: contextInfo
                        };
                    } else if (mediaType.includes('image')) {
                        messageToSend = { 
                            image: mediaBuffer, 
                            caption: this.extractMediaCaption(originalMessage) || undefined,
                            contextInfo: contextInfo
                        };
                    } else {
                        console.warn(`Cannot determine message type, skipping`);
                        return;
                    }
            }
            
            // Send the media message with tag using the client directly for better control
            await this.botClient.client.sendMessage(targetJid, messageToSend);
            console.log(`✅ Successfully forwarded deleted ${originalType} as tagged message`);

        } catch (error) {
            console.error('❌ Error forwarding tagged media message:', error);
            // Just log and exit - no placeholder messages
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
        
        // Fallback to body if it's not a standard media format
        if (message.body && message.body !== '[Image]' && message.body !== '[Video]' && message.body !== '[Document]' && message.body !== '[Sticker]') {
            return message.body;
        }
        
        return null;
    }

    isMediaType(messageType) {
        return ['image', 'video', 'audio', 'document', 'sticker', 
                'imageMessage', 'videoMessage', 'audioMessage', 
                'documentMessage', 'stickerMessage'].includes(messageType);
    }

    isViewOnceMessage(message) {
        // Check if message contains view-once content
        if (message.message?.viewOnceMessage?.message) {
            return true;
        }
        
        // Check for view-once v2 format (viewOnceMessageV2)
        if (message.message?.viewOnceMessageV2?.message) {
            return true;
        }
        
        // Check if the message has viewOnce property set to true
        if (message.message?.imageMessage?.viewOnce || message.message?.videoMessage?.viewOnce) {
            return true;
        }
        
        // Check for system events that might be view-once related
        if (message.messageStubType && message.messageStubType === 'REVOKE') {
            // Additional check for view-once specific revocations
            // View-once messages often appear as system events when deleted
            const messageBody = this.extractMessageText(message);
            if (messageBody === '[System Event]' || messageBody === '[System Message]') {
                // This could be a view-once deletion, but we'll be conservative and only skip if we're sure
                // For now, let's allow these through but add logging
                console.log('🔐 Potential view-once system event detected, allowing anti-delete processing');
                return false;
            }
        }
        
        return false;
    }

    async notifyOwner(deletionEntry) {
        // This method is now replaced by forwardDeletedMessage
        // Keeping for backward compatibility if needed
        await this.forwardDeletedMessage(deletionEntry);
    }

    async getLog(context) {
        try {
            const { args, reply } = context;
            
            const limit = parseInt(args[0]) || 10;
            const recentDeletions = this.deletionLog.slice(-limit).reverse();
            
            if (recentDeletions.length === 0) {
                await reply('📝 No deleted messages detected');
                return;
            }
            
            let logText = `🔍 **Anti-Delete Log**\n\n`;
            logText += `📊 **Total Deletions:** ${this.deletionLog.length}\n`;
            logText += `📋 **Showing:** Last ${Math.min(limit, recentDeletions.length)}\n\n`;
            
            recentDeletions.forEach((entry, index) => {
                const senderPhone = entry.sender.split('@')[0];
                const timeAgo = this.getTimeAgo(entry.deletedTimestamp);
                
                logText += `**${index + 1}.** ID: \`${entry.id}\`\n`;
                logText += `👤 Sender: ${senderPhone}\n`;
                logText += `⏰ ${timeAgo}\n`;
                
                if (entry.messageBody && entry.messageBody.length > 50) {
                    logText += `💬 "${entry.messageBody.substring(0, 50)}..."\n`;
                } else if (entry.messageBody) {
                    logText += `💬 "${entry.messageBody}"\n`;
                }
                
                if (entry.hasMedia) {
                    logText += `📎 ${entry.mediaType}\n`;
                }
                
                logText += `🔄 Recover: \`.recover ${entry.id}\`\n\n`;
            });
            
            logText += `💡 **Commands:**\n`;
            logText += `• \`.antilog [limit]\` - Show deletion log\n`;
            logText += `• \`.recover <id>\` - Recover specific message\n`;
            logText += `• \`.deleted\` - List all deleted messages`;
            
            await reply(logText);
            
        } catch (error) {
            console.error('Error getting anti-delete log:', error);
            await context.reply('❌ Error retrieving deletion log');
        }
    }

    getDeletionById(id) {
        return this.deletionLog.find(entry => entry.id === id);
    }

    getDeletionsByChat(chatId, limit = 50) {
        return this.deletionLog
            .filter(entry => entry.chatId === chatId)
            .slice(-limit)
            .reverse();
    }

    getDeletionsBySender(senderId, limit = 50) {
        return this.deletionLog
            .filter(entry => entry.sender === senderId)
            .slice(-limit)
            .reverse();
    }

    getRecentDeletions(hours = 24) {
        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
        return this.deletionLog.filter(entry => 
            new Date(entry.deletedTimestamp) > cutoff
        );
    }

    getDeletionStats() {
        const stats = {
            total: this.deletionLog.length,
            byChat: {},
            bySender: {},
            byType: {},
            recent24h: this.getRecentDeletions(24).length,
            recent7d: this.getRecentDeletions(24 * 7).length
        };
        
        this.deletionLog.forEach(entry => {
            // By chat
            const chatId = entry.chatId;
            stats.byChat[chatId] = (stats.byChat[chatId] || 0) + 1;
            
            // By sender
            const senderId = entry.sender;
            stats.bySender[senderId] = (stats.bySender[senderId] || 0) + 1;
            
            // By type
            const messageType = entry.messageType;
            stats.byType[messageType] = (stats.byType[messageType] || 0) + 1;
        });
        
        return stats;
    }

    generateId() {
        return `del_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    getTimeAgo(timestamp) {
        const now = new Date();
        const then = new Date(timestamp);
        const diffMs = now - then;
        
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffMinutes < 1) {
            return 'Just now';
        } else if (diffMinutes < 60) {
            return `${diffMinutes}m ago`;
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else {
            return `${diffDays}d ago`;
        }
    }

    async shutdown() {
        try {
            await this.saveDeletionLog();
            this.isInitialized = false;
        } catch (error) {
            console.error('Error during Anti-Delete Detector shutdown:', error);
        }
    }

    // Utility methods for extracting data from Baileys message structure
    extractMessageText(message) {
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
        return message.body || '';
    }

    extractSenderJid(message) {
        if (message.key) {
            return message.key.participant || message.key.remoteJid;
        }
        return message.author || message.from;
    }

    extractChatId(message) {
        if (message.key) {
            return message.key.remoteJid;
        }
        return message.from;
    }

    extractMessageId(message) {
        if (message.key) {
            return message.key.id;
        }
        return message.id?._serialized || message.id?.id || message.id;
    }

    getMessageType(message) {
        if (message.message) {
            const messageKeys = Object.keys(message.message);
            return messageKeys[0] || 'unknown';
        }
        return message.type || 'text';
    }

    hasMedia(message) {
        if (message.message) {
            return !!(message.message.imageMessage || 
                     message.message.videoMessage || 
                     message.message.audioMessage || 
                     message.message.documentMessage || 
                     message.message.stickerMessage);
        }
        // For archived messages, also check the type
        return !!message.hasMedia || this.isMediaType(message.type);
    }

    getMediaType(message) {
        if (message.message) {
            if (message.message.imageMessage) return 'image';
            if (message.message.videoMessage) return 'video';
            if (message.message.audioMessage) return 'audio';
            if (message.message.documentMessage) return 'document';
            if (message.message.stickerMessage) return 'sticker';
        }
        return message.type || 'unknown';
    }
}

module.exports = { Detector };
