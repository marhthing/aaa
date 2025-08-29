const fs = require('fs-extra');
const path = require('path');

class LoadingReaction {
    constructor(client) {
        this.client = client;
        this.activeReactions = new Map(); // messageId -> reaction info
        this.loadingEmoji = '⏳';
        this.successEmoji = '✅';
        this.errorEmoji = '❌';
        this.reactionsPath = path.join(process.cwd(), 'data', 'system', 'loading_reactions.json');
    }

    async initialize() {
        try {
            console.log('🔧 Initializing loading reaction system...');

            // Ensure data directory exists
            await fs.ensureDir(path.dirname(this.reactionsPath));

            // Load existing reactions (for recovery after restart)
            await this.loadActiveReactions();

            // Clean up any stale reactions
            await this.cleanupStaleReactions();

            console.log('✅ Loading reaction system initialized');

        } catch (error) {
            console.error('❌ Failed to initialize loading reaction system:', error);
        }
    }

    async loadActiveReactions() {
        try {
            if (await fs.pathExists(this.reactionsPath)) {
                const data = await fs.readJson(this.reactionsPath);
                
                // Convert array back to Map
                if (data.activeReactions) {
                    this.activeReactions = new Map(data.activeReactions);
                }
            }
        } catch (error) {
            console.error('⚠️ Failed to load active reactions, starting fresh:', error);
        }
    }

    async saveActiveReactions() {
        try {
            const data = {
                activeReactions: Array.from(this.activeReactions.entries()),
                lastUpdated: new Date().toISOString()
            };

            await fs.writeJson(this.reactionsPath, data, { spaces: 2 });
        } catch (error) {
            console.error('❌ Failed to save active reactions:', error);
        }
    }

    async cleanupStaleReactions() {
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutes

        for (const [messageId, reactionInfo] of this.activeReactions) {
            if (now - reactionInfo.timestamp > maxAge) {
                await this.removeLoadingReaction(messageId);
            }
        }
    }

    async showLoadingReaction(message) {
        try {
            // Extract message ID safely from different message structures
            let messageId;
            if (message.key?.id) {
                messageId = message.key.id;
            } else if (message.id) {
                messageId = message.id.id || message.id;
            } else {
                messageId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            }
            
            // Skip loading reaction for now due to Baileys compatibility issues
            // await message.react(this.loadingEmoji);
            
            // Store reaction info
            this.activeReactions.set(messageId, {
                messageId: messageId,
                chatId: message.from,
                timestamp: Date.now(),
                emoji: this.loadingEmoji,
                status: 'loading'
            });

            await this.saveActiveReactions();
            
            return true;

        } catch (error) {
            console.error('❌ Failed to show loading reaction:', error);
            return false;
        }
    }

    async updateReaction(message, emoji, status = 'completed') {
        try {
            // Extract message ID safely
            let messageId;
            if (message.key?.id) {
                messageId = message.key.id;
            } else if (message.id) {
                messageId = message.id.id || message.id;
            } else {
                return false;
            }
            
            // Skip reaction updates for now due to Baileys compatibility issues
            // await message.react(emoji);
            
            // Update stored info
            if (this.activeReactions.has(messageId)) {
                const reactionInfo = this.activeReactions.get(messageId);
                reactionInfo.emoji = emoji;
                reactionInfo.status = status;
                reactionInfo.updatedAt = Date.now();
                
                await this.saveActiveReactions();
            }

            return true;

        } catch (error) {
            console.error('❌ Failed to update reaction:', error);
            return false;
        }
    }

    async removeLoadingReaction(messageOrId) {
        try {
            let messageId;
            let message = null;

            if (typeof messageOrId === 'string') {
                messageId = messageOrId;
            } else if (messageOrId && messageOrId.id) {
                message = messageOrId;
                messageId = messageOrId.id._serialized || messageOrId.id.id || messageOrId.id;
            } else {
                console.warn('⚠️ Invalid message object passed to removeLoadingReaction:', messageOrId);
                return false;
            }

            // Remove reaction if we have the message object
            if (message) {
                try {
                    await message.react('');
                } catch (error) {
                    // Ignore reaction removal errors
                }
            }

            // Remove from active reactions
            this.activeReactions.delete(messageId);
            await this.saveActiveReactions();

            return true;

        } catch (error) {
            console.error('❌ Failed to remove loading reaction:', error);
            return false;
        }
    }

    async showSuccessReaction(message) {
        return await this.updateReaction(message, this.successEmoji, 'success');
    }

    async showErrorReaction(message) {
        return await this.updateReaction(message, this.errorEmoji, 'error');
    }

    async processCommandWithReaction(message, commandProcessor) {
        let reactionShown = false;
        
        try {
            // Show loading reaction for owner messages
            reactionShown = await this.showLoadingReaction(message);
            
            // Process the command
            const result = await commandProcessor();
            
            // Show success reaction
            if (reactionShown) {
                await this.showSuccessReaction(message);
            }

            return result;

        } catch (error) {
            // Show error reaction
            if (reactionShown) {
                await this.showErrorReaction(message);
            }
            
            throw error;

        } finally {
            // Auto-remove reaction after delay
            if (reactionShown) {
                // Extract messageId for cleanup
                let messageId;
                if (message.key?.id) {
                    messageId = message.key.id;
                } else if (message.id) {
                    messageId = message.id.id || message.id;
                }
                
                if (messageId) {
                    setTimeout(async () => {
                        await this.removeLoadingReaction(messageId);
                    }, 3000); // Remove after 3 seconds
                }
            }
        }
    }

    getActiveReactions() {
        return Array.from(this.activeReactions.entries()).map(([messageId, info]) => ({
            messageId,
            ...info
        }));
    }

    isReactionActive(messageId) {
        return this.activeReactions.has(messageId);
    }

    getReactionInfo(messageId) {
        return this.activeReactions.get(messageId) || null;
    }

    async clearAllReactions() {
        this.activeReactions.clear();
        await this.saveActiveReactions();
        console.log('🧹 Cleared all active reactions');
    }

    getStats() {
        const reactions = Array.from(this.activeReactions.values());
        
        return {
            totalActive: reactions.length,
            byStatus: {
                loading: reactions.filter(r => r.status === 'loading').length,
                success: reactions.filter(r => r.status === 'success').length,
                error: reactions.filter(r => r.status === 'error').length,
                completed: reactions.filter(r => r.status === 'completed').length
            },
            oldestReaction: reactions.length > 0 ? 
                Math.min(...reactions.map(r => r.timestamp)) : null,
            newestReaction: reactions.length > 0 ? 
                Math.max(...reactions.map(r => r.timestamp)) : null
        };
    }
}

module.exports = LoadingReaction;
