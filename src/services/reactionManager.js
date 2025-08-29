/**
 * Reaction Manager Service
 * Handles loading emoji reactions and reaction management
 */

const { EventEmitter } = require('events');
const { BOT_CONFIG, TIME } = require('../utils/constants');
const storageService = require('./storage');

class ReactionManager extends EventEmitter {
    constructor() {
        super();
        this.activeReactions = new Map(); // messageId -> reactionData
        this.reactionQueue = new Map(); // messageId -> timeout
        this.isInitialized = false;
        this.loadingEmoji = BOT_CONFIG.LOADING_EMOJI;
        this.successEmoji = BOT_CONFIG.SUCCESS_EMOJI;
        this.errorEmoji = BOT_CONFIG.ERROR_EMOJI;
    }

    async initialize() {
        try {
            await this.loadReactionData();
            this.setupCleanupTimer();
            this.isInitialized = true;
            console.log('✅ Reaction Manager initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Reaction Manager:', error);
            throw error;
        }
    }

    /**
     * Load reaction data from storage
     */
    async loadReactionData() {
        try {
            const data = await storageService.load('system', 'loading_reactions');
            if (data && data.activeReactions) {
                // Restore active reactions (if any were saved)
                for (const [messageId, reactionData] of Object.entries(data.activeReactions)) {
                    this.activeReactions.set(messageId, {
                        ...reactionData,
                        startTime: Date.now() // Reset start time
                    });
                }
            }
        } catch (error) {
            console.error('Error loading reaction data:', error);
        }
    }

    /**
     * Save reaction data to storage
     */
    async saveReactionData() {
        try {
            const data = {
                activeReactions: Object.fromEntries(this.activeReactions.entries()),
                lastUpdated: new Date().toISOString()
            };
            await storageService.save('system', 'loading_reactions', data);
        } catch (error) {
            console.error('Error saving reaction data:', error);
        }
    }

    /**
     * Add loading reaction to message
     */
    async addLoadingReaction(message, context = {}) {
        try {
            if (!message || !message.id) return false;

            const messageId = message.id._serialized || message.id;
            
            // Check if reaction already exists
            if (this.activeReactions.has(messageId)) {
                return true; // Already has loading reaction
            }

            // Add loading emoji reaction
            await message.react(this.loadingEmoji);

            // Store reaction data
            const reactionData = {
                messageId,
                chatId: message.from,
                emoji: this.loadingEmoji,
                startTime: Date.now(),
                context: context.command || 'unknown',
                type: 'loading'
            };

            this.activeReactions.set(messageId, reactionData);

            // Set auto-removal timeout (30 seconds default)
            const timeout = setTimeout(() => {
                this.removeReaction(messageId, 'timeout');
            }, context.timeout || 30000);

            this.reactionQueue.set(messageId, timeout);

            this.emit('reaction_added', reactionData);
            return true;

        } catch (error) {
            console.error('Error adding loading reaction:', error);
            this.emit('reaction_error', { messageId: message?.id, error });
            return false;
        }
    }

    /**
     * Remove reaction from message
     */
    async removeReaction(messageId, reason = 'completed') {
        try {
            if (!messageId) return false;

            const reactionData = this.activeReactions.get(messageId);
            if (!reactionData) return false;

            // Clear timeout if exists
            const timeout = this.reactionQueue.get(messageId);
            if (timeout) {
                clearTimeout(timeout);
                this.reactionQueue.delete(messageId);
            }

            // Remove from active reactions
            this.activeReactions.delete(messageId);

            // Emit event
            this.emit('reaction_removed', {
                ...reactionData,
                removedAt: Date.now(),
                reason,
                duration: Date.now() - reactionData.startTime
            });

            return true;

        } catch (error) {
            console.error('Error removing reaction:', error);
            this.emit('reaction_error', { messageId, error });
            return false;
        }
    }

    /**
     * Update reaction to success
     */
    async markSuccess(message, duration = 2000) {
        try {
            if (!message || !message.id) return false;

            const messageId = message.id._serialized || message.id;
            
            // Remove loading reaction first
            await this.removeReaction(messageId, 'success');

            // Add success reaction temporarily
            await message.react(this.successEmoji);

            // Remove success reaction after duration
            setTimeout(async () => {
                try {
                    await message.unreact(this.successEmoji);
                } catch (error) {
                    // Ignore errors when removing reaction
                }
            }, duration);

            return true;

        } catch (error) {
            console.error('Error marking success:', error);
            return false;
        }
    }

    /**
     * Update reaction to error
     */
    async markError(message, duration = 3000) {
        try {
            if (!message || !message.id) return false;

            const messageId = message.id._serialized || message.id;
            
            // Remove loading reaction first
            await this.removeReaction(messageId, 'error');

            // Add error reaction temporarily
            await message.react(this.errorEmoji);

            // Remove error reaction after duration
            setTimeout(async () => {
                try {
                    await message.unreact(this.errorEmoji);
                } catch (error) {
                    // Ignore errors when removing reaction
                }
            }, duration);

            return true;

        } catch (error) {
            console.error('Error marking error:', error);
            return false;
        }
    }

    /**
     * Add custom reaction
     */
    async addCustomReaction(message, emoji, duration = null) {
        try {
            if (!message || !emoji) return false;

            await message.react(emoji);

            if (duration) {
                setTimeout(async () => {
                    try {
                        await message.unreact(emoji);
                    } catch (error) {
                        // Ignore errors when removing reaction
                    }
                }, duration);
            }

            return true;

        } catch (error) {
            console.error('Error adding custom reaction:', error);
            return false;
        }
    }

    /**
     * Check if message has active loading reaction
     */
    hasActiveReaction(messageId) {
        return this.activeReactions.has(messageId);
    }

    /**
     * Get active reaction data
     */
    getActiveReaction(messageId) {
        return this.activeReactions.get(messageId) || null;
    }

    /**
     * Get all active reactions
     */
    getAllActiveReactions() {
        return Array.from(this.activeReactions.values());
    }

    /**
     * Get reactions by chat
     */
    getReactionsByChat(chatId) {
        return Array.from(this.activeReactions.values())
            .filter(reaction => reaction.chatId === chatId);
    }

    /**
     * Clear all reactions for a chat
     */
    async clearChatReactions(chatId) {
        const chatReactions = this.getReactionsByChat(chatId);
        
        for (const reaction of chatReactions) {
            await this.removeReaction(reaction.messageId, 'chat_cleared');
        }

        return chatReactions.length;
    }

    /**
     * Clear expired reactions
     */
    clearExpiredReactions(maxAge = 5 * TIME.MINUTE) {
        const now = Date.now();
        const expired = [];

        for (const [messageId, reactionData] of this.activeReactions.entries()) {
            if (now - reactionData.startTime > maxAge) {
                expired.push(messageId);
            }
        }

        for (const messageId of expired) {
            this.removeReaction(messageId, 'expired');
        }

        return expired.length;
    }

    /**
     * Setup cleanup timer
     */
    setupCleanupTimer() {
        // Clean expired reactions every 2 minutes
        setInterval(() => {
            const cleared = this.clearExpiredReactions();
            if (cleared > 0) {
                console.log(`🧹 Cleared ${cleared} expired reactions`);
            }
        }, 2 * TIME.MINUTE);
    }

    /**
     * Get reaction statistics
     */
    getStats() {
        const activeReactions = this.getAllActiveReactions();
        const now = Date.now();

        const stats = {
            total: activeReactions.length,
            byContext: {},
            averageDuration: 0,
            oldestReaction: null,
            queueSize: this.reactionQueue.size
        };

        let totalDuration = 0;
        let oldestTime = now;

        for (const reaction of activeReactions) {
            // Count by context
            const context = reaction.context || 'unknown';
            stats.byContext[context] = (stats.byContext[context] || 0) + 1;

            // Calculate duration
            const duration = now - reaction.startTime;
            totalDuration += duration;

            // Track oldest
            if (reaction.startTime < oldestTime) {
                oldestTime = reaction.startTime;
                stats.oldestReaction = {
                    messageId: reaction.messageId,
                    duration: duration,
                    context: reaction.context
                };
            }
        }

        if (activeReactions.length > 0) {
            stats.averageDuration = Math.round(totalDuration / activeReactions.length);
        }

        return stats;
    }

    /**
     * Force cleanup all reactions
     */
    async cleanup() {
        console.log('🧹 Cleaning up all active reactions...');
        
        const activeReactions = Array.from(this.activeReactions.keys());
        
        for (const messageId of activeReactions) {
            await this.removeReaction(messageId, 'cleanup');
        }

        // Clear all timeouts
        for (const timeout of this.reactionQueue.values()) {
            clearTimeout(timeout);
        }
        this.reactionQueue.clear();

        // Save cleanup event
        await this.saveReactionData();

        console.log(`🧹 Cleaned up ${activeReactions.length} reactions`);
        return activeReactions.length;
    }

    /**
     * Shutdown cleanup
     */
    async shutdown() {
        await this.cleanup();
        this.emit('shutdown');
        console.log('Reaction Manager shutdown complete');
    }
}

module.exports = ReactionManager;