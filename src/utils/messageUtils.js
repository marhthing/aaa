/**
 * Message Utilities
 * Helper functions for message processing, formatting, and validation
 */

const { BOT_CONFIG, MESSAGE_TYPES, PATTERNS, TIME } = require('./constants');
const { jidManager } = require('./jidManager');

class MessageUtils {
    constructor() {
        this.messageCache = new Map();
        this.replyCache = new Map();
    }

    /**
     * Parse command from message text
     */
    parseCommand(text) {
        if (!text || typeof text !== 'string') return null;

        const match = text.match(PATTERNS.COMMAND);
        if (!match) return null;

        return {
            command: match[1].toLowerCase(),
            args: match[2] ? match[2].trim() : '',
            fullText: text,
            prefix: BOT_CONFIG.COMMAND_PREFIX
        };
    }

    /**
     * Check if message is a command
     */
    isCommand(text) {
        return this.parseCommand(text) !== null;
    }

    /**
     * Format message for display
     */
    formatMessage(message) {
        if (!message) return '';

        const timestamp = this.formatTimestamp(message.timestamp || Date.now());
        const sender = this.formatSender(message.from);
        const type = this.getMessageTypeDisplay(message.type);
        
        return `[${timestamp}] ${sender} (${type}): ${message.body || '[Media]'}`;
    }

    /**
     * Format timestamp for display
     */
    formatTimestamp(timestamp) {
        if (!timestamp) return '';

        const date = new Date(timestamp * 1000 || timestamp);
        const now = new Date();
        const diff = now - date;

        // If less than 1 day, show time only
        if (diff < TIME.DAY) {
            return date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        }

        // If less than 1 week, show day and time
        if (diff < TIME.WEEK) {
            return date.toLocaleDateString('en-US', {
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        }

        // Otherwise show full date
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    /**
     * Format sender name/JID for display
     */
    formatSender(jid) {
        if (!jid) return 'Unknown';

        // Check if it's the owner
        if (jidManager.isOwner(jid)) {
            return 'Owner';
        }

        // Format phone number
        const phoneNumber = jidManager.getPhoneNumber(jid);
        if (phoneNumber) {
            return jidManager.formatForDisplay(jid);
        }

        return jid;
    }

    /**
     * Get display name for message type
     */
    getMessageTypeDisplay(type) {
        const typeMap = {
            [MESSAGE_TYPES.TEXT]: 'Text',
            [MESSAGE_TYPES.IMAGE]: 'Image',
            [MESSAGE_TYPES.VIDEO]: 'Video',
            [MESSAGE_TYPES.AUDIO]: 'Audio',
            [MESSAGE_TYPES.DOCUMENT]: 'Document',
            [MESSAGE_TYPES.STICKER]: 'Sticker',
            [MESSAGE_TYPES.LOCATION]: 'Location',
            [MESSAGE_TYPES.CONTACT]: 'Contact',
            [MESSAGE_TYPES.VOICE]: 'Voice'
        };

        return typeMap[type] || 'Unknown';
    }

    /**
     * Extract mentions from message
     */
    extractMentions(message) {
        if (!message || !message.mentionedIds) return [];

        return message.mentionedIds.map(jid => ({
            jid: jidManager.normalizeJid(jid),
            isOwner: jidManager.isOwner(jid),
            phoneNumber: jidManager.getPhoneNumber(jid)
        }));
    }

    /**
     * Check if message mentions owner
     */
    mentionsOwner(message) {
        const mentions = this.extractMentions(message);
        return mentions.some(mention => mention.isOwner);
    }

    /**
     * Create reply reference
     */
    createReplyReference(originalMessage) {
        if (!originalMessage) return null;

        return {
            messageId: originalMessage.id._serialized || originalMessage.id,
            from: originalMessage.from,
            timestamp: originalMessage.timestamp,
            body: originalMessage.body?.substring(0, 100) || '[Media]',
            type: originalMessage.type
        };
    }

    /**
     * Check if message is a reply
     */
    isReply(message) {
        return !!(message.hasQuotedMsg || message.quotedMsg);
    }

    /**
     * Get quoted message
     */
    async getQuotedMessage(message) {
        if (!this.isReply(message)) return null;

        try {
            if (message.quotedMsg) {
                return message.quotedMsg;
            }

            if (message.hasQuotedMsg) {
                return await message.getQuotedMessage();
            }
        } catch (error) {
            console.error('Error getting quoted message:', error);
        }

        return null;
    }

    /**
     * Sanitize message content
     */
    sanitizeMessage(text) {
        if (!text || typeof text !== 'string') return '';

        return text
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim()
            .substring(0, BOT_CONFIG.MAX_MESSAGE_LENGTH);
    }

    /**
     * Split long message into chunks
     */
    splitMessage(text, maxLength = BOT_CONFIG.MAX_MESSAGE_LENGTH) {
        if (!text || text.length <= maxLength) return [text];

        const chunks = [];
        let currentChunk = '';

        const words = text.split(' ');
        
        for (const word of words) {
            if (currentChunk.length + word.length + 1 <= maxLength) {
                currentChunk += (currentChunk ? ' ' : '') + word;
            } else {
                if (currentChunk) {
                    chunks.push(currentChunk);
                    currentChunk = word;
                } else {
                    // Word is longer than maxLength, split it
                    for (let i = 0; i < word.length; i += maxLength) {
                        chunks.push(word.substring(i, i + maxLength));
                    }
                }
            }
        }

        if (currentChunk) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    /**
     * Create message metadata
     */
    createMessageMetadata(message) {
        return {
            id: message.id._serialized || message.id,
            from: jidManager.normalizeJid(message.from),
            to: jidManager.normalizeJid(message.to),
            timestamp: message.timestamp || Date.now() / 1000,
            type: message.type,
            isOwner: jidManager.isOwner(message.from),
            isGroup: jidManager.isGroup(message.from),
            hasMedia: this.hasMedia(message),
            isCommand: this.isCommand(message.body),
            mentions: this.extractMentions(message),
            isReply: this.isReply(message),
            processedAt: Date.now()
        };
    }

    /**
     * Check if message has media
     */
    hasMedia(message) {
        return !!(message.hasMedia || [
            MESSAGE_TYPES.IMAGE,
            MESSAGE_TYPES.VIDEO,
            MESSAGE_TYPES.AUDIO,
            MESSAGE_TYPES.DOCUMENT,
            MESSAGE_TYPES.STICKER,
            MESSAGE_TYPES.VOICE
        ].includes(message.type));
    }

    /**
     * Get media info from message
     */
    getMediaInfo(message) {
        if (!this.hasMedia(message)) return null;

        return {
            type: message.type,
            mimetype: message.mimetype,
            filename: message.filename,
            size: message.size,
            caption: message.caption
        };
    }

    /**
     * Create error message
     */
    createErrorMessage(error, context = '') {
        const prefix = context ? `[${context}] ` : '';
        return `${BOT_CONFIG.ERROR_EMOJI} ${prefix}${error}`;
    }

    /**
     * Create success message
     */
    createSuccessMessage(message, context = '') {
        const prefix = context ? `[${context}] ` : '';
        return `${BOT_CONFIG.SUCCESS_EMOJI} ${prefix}${message}`;
    }

    /**
     * Create info message
     */
    createInfoMessage(message, context = '') {
        const prefix = context ? `[${context}] ` : '';
        return `${BOT_CONFIG.INFO_EMOJI} ${prefix}${message}`;
    }

    /**
     * Create warning message
     */
    createWarningMessage(message, context = '') {
        const prefix = context ? `[${context}] ` : '';
        return `${BOT_CONFIG.WARNING_EMOJI} ${prefix}${message}`;
    }

    /**
     * Cache message
     */
    cacheMessage(messageId, message) {
        this.messageCache.set(messageId, {
            message,
            timestamp: Date.now()
        });

        // Clean old cache entries
        this.cleanCache();
    }

    /**
     * Get cached message
     */
    getCachedMessage(messageId) {
        const cached = this.messageCache.get(messageId);
        if (!cached) return null;

        // Check if cache is still valid
        if (Date.now() - cached.timestamp > TIME.HOUR) {
            this.messageCache.delete(messageId);
            return null;
        }

        return cached.message;
    }

    /**
     * Clean old cache entries
     */
    cleanCache() {
        const now = Date.now();
        for (const [key, value] of this.messageCache.entries()) {
            if (now - value.timestamp > TIME.HOUR) {
                this.messageCache.delete(key);
            }
        }
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            messageCache: this.messageCache.size,
            replyCache: this.replyCache.size
        };
    }
}

// Create singleton instance
const messageUtils = new MessageUtils();

module.exports = {
    MessageUtils,
    messageUtils
};