const fs = require('fs-extra');
const path = require('path');
const EnvironmentManager = require('../../core/EnvironmentManager');

class Recovery {
    constructor(botClient, eventBus) {
        this.botClient = botClient;
        this.eventBus = eventBus;
        this.envManager = new EnvironmentManager();
        
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
            
            this.isInitialized = true;
            
        } catch (error) {
            console.error('Error initializing Anti-Delete Recovery:', error);
            throw error;
        }
    }

    async recover(context) {
        try {
            const { args, reply, message } = context;
            
            if (args.length === 0) {
                await reply('❌ Please specify deletion ID\nUsage: .recover <deletion_id>\nExample: .recover del_1234567890_abc123');
                return;
            }
            
            const deletionId = args[0];
            
            // Get deletion entry from detector
            const detector = this.getDetector();
            if (!detector) {
                await reply('❌ Anti-delete detector not available');
                return;
            }
            
            const deletionEntry = detector.getDeletionById(deletionId);
            
            if (!deletionEntry) {
                await reply(`❌ Deletion record not found: ${deletionId}`);
                return;
            }
            
            // Attempt to recover the message
            const recoveryResult = await this.recoverMessage(deletionEntry);
            
            if (recoveryResult.success) {
                await reply(recoveryResult.message);
                
                // Send recovered content
                if (recoveryResult.content) {
                    await this.botClient.sendMessage(message.from, recoveryResult.content);
                }
                
                if (recoveryResult.media) {
                    await this.botClient.sendMedia(message.from, recoveryResult.media);
                }
            } else {
                await reply(recoveryResult.message);
            }
            
        } catch (error) {
            console.error('Error in recover command:', error);
            await context.reply('❌ Error recovering deleted message');
        }
    }

    async recoverMessage(deletionEntry) {
        try {
            let recoveryText = `🔄 **Message Recovery**\n\n`;
            recoveryText += `📋 **Deletion ID:** ${deletionEntry.id}\n`;
            recoveryText += `👤 **Sender:** ${deletionEntry.sender.split('@')[0]}\n`;
            recoveryText += `💬 **Chat:** ${deletionEntry.chatId.split('@')[0]}\n`;
            recoveryText += `📅 **Original Time:** ${new Date(deletionEntry.originalTimestamp).toLocaleString()}\n`;
            recoveryText += `🗑️ **Deleted Time:** ${new Date(deletionEntry.deletedTimestamp).toLocaleString()}\n\n`;
            
            let hasContent = false;
            let mediaPath = null;
            
            // Recover text content
            if (deletionEntry.messageBody) {
                recoveryText += `📝 **Recovered Text:**\n"${deletionEntry.messageBody}"\n\n`;
                hasContent = true;
            }
            
            // Recover media if available
            if (deletionEntry.hasMedia) {
                mediaPath = await this.recoverMedia(deletionEntry);
                if (mediaPath) {
                    recoveryText += `📎 **Recovered Media:** ${deletionEntry.mediaType}\n`;
                    hasContent = true;
                } else {
                    recoveryText += `❌ **Media Recovery Failed:** ${deletionEntry.mediaType} not found in archive\n`;
                }
            }
            
            if (!hasContent) {
                return {
                    success: false,
                    message: `❌ No recoverable content found for deletion ID: ${deletionEntry.id}`
                };
            }
            
            recoveryText += `✅ **Recovery Complete!**`;
            
            return {
                success: true,
                message: recoveryText,
                content: deletionEntry.messageBody || null,
                media: mediaPath ? fs.readFileSync(mediaPath) : null
            };
            
        } catch (error) {
            console.error('Error recovering message:', error);
            return {
                success: false,
                message: '❌ Error during message recovery process'
            };
        }
    }

    async recoverMedia(deletionEntry) {
        try {
            const mediaVault = this.botClient.getMediaVault();
            if (!mediaVault) {
                return null;
            }
            
            // Search for media by message timestamp and sender
            const searchResults = await mediaVault.searchMedia(deletionEntry.sender, {
                categories: [this.getMediaCategory(deletionEntry.mediaType)],
                limit: 10
            });
            
            // Find media that matches the timestamp (within a reasonable window)
            const originalTime = new Date(deletionEntry.originalTimestamp);
            const timeWindow = 60000; // 1 minute window
            
            for (const result of searchResults) {
                const metadata = await mediaVault.getMediaMetadata(result.path);
                if (metadata && metadata.originalMessage) {
                    const messageTime = new Date(metadata.originalMessage.timestamp * 1000);
                    const timeDiff = Math.abs(originalTime - messageTime);
                    
                    if (timeDiff <= timeWindow) {
                        return result.path;
                    }
                }
            }
            
            return null;
            
        } catch (error) {
            console.error('Error recovering media:', error);
            return null;
        }
    }

    async listDeleted(context) {
        try {
            const { args, reply } = context;
            
            const detector = this.getDetector();
            if (!detector) {
                await reply('❌ Anti-delete detector not available');
                return;
            }
            
            const limit = parseInt(args[0]) || 20;
            const filter = args[1]?.toLowerCase();
            
            const deletionLog = detector.deletionLog || [];
            
            if (deletionLog.length === 0) {
                await reply('📝 No deleted messages detected');
                return;
            }
            
            let filteredDeletions = deletionLog;
            
            // Apply filters
            if (filter === 'media') {
                filteredDeletions = deletionLog.filter(entry => entry.hasMedia);
            } else if (filter === 'text') {
                filteredDeletions = deletionLog.filter(entry => !entry.hasMedia && entry.messageBody);
            } else if (filter === 'recent') {
                const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                filteredDeletions = deletionLog.filter(entry => 
                    new Date(entry.deletedTimestamp) > oneDayAgo
                );
            }
            
            const recentDeletions = filteredDeletions.slice(-limit).reverse();
            
            let deletedText = `🗑️ **Deleted Messages**\n\n`;
            deletedText += `📊 **Total:** ${deletionLog.length} | **Filtered:** ${filteredDeletions.length}\n`;
            deletedText += `📋 **Showing:** Last ${Math.min(limit, recentDeletions.length)}\n`;
            
            if (filter) {
                deletedText += `🔍 **Filter:** ${filter}\n`;
            }
            
            deletedText += '\n';
            
            recentDeletions.forEach((entry, index) => {
                const senderPhone = entry.sender.split('@')[0];
                const timeAgo = this.getTimeAgo(entry.deletedTimestamp);
                
                deletedText += `**${index + 1}.** \`${entry.id}\`\n`;
                deletedText += `👤 ${senderPhone} • ${timeAgo}\n`;
                
                if (entry.messageBody) {
                    const preview = entry.messageBody.length > 40 
                        ? entry.messageBody.substring(0, 40) + '...'
                        : entry.messageBody;
                    deletedText += `💬 "${preview}"\n`;
                }
                
                if (entry.hasMedia) {
                    deletedText += `📎 ${entry.mediaType}\n`;
                }
                
                deletedText += '\n';
            });
            
            deletedText += `💡 **Commands:**\n`;
            deletedText += `• \`.recover <id>\` - Recover specific message\n`;
            deletedText += `• \`.deleted [limit] [filter]\` - List deleted messages\n`;
            deletedText += `• Filters: media, text, recent`;
            
            await reply(deletedText);
            
        } catch (error) {
            console.error('Error listing deleted messages:', error);
            await context.reply('❌ Error retrieving deleted messages list');
        }
    }

    getDetector() {
        // This would be injected during plugin initialization
        // For now, we'll try to get it from the parent plugin
        return this.detector || null;
    }

    setDetector(detector) {
        this.detector = detector;
    }

    getMediaCategory(mediaType) {
        if (mediaType?.startsWith('image/')) {
            return 'images';
        } else if (mediaType?.startsWith('video/')) {
            return 'videos';
        } else if (mediaType?.startsWith('audio/')) {
            return 'audio';
        } else {
            return 'documents';
        }
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
        this.isInitialized = false;
    }
}

module.exports = { Recovery };
