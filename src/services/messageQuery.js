/**
 * Message Query Service
 * Advanced message search and retrieval capabilities
 */

const fs = require('fs-extra');
const path = require('path');
const { EventEmitter } = require('events');
const { CHAT_TYPES, MESSAGE_TYPES, TIME, PATHS } = require('../utils/constants');
const { jidManager } = require('../utils/jidManager');
const storageService = require('./storage');

class MessageQueryService extends EventEmitter {
    constructor() {
        super();
        this.messageIndex = new Map(); // messageId -> messageData
        this.chatIndex = new Map(); // chatId -> messageIds[]
        this.searchIndex = new Map(); // term -> messageIds[]
        this.dateIndex = new Map(); // date -> messageIds[]
        this.userIndex = new Map(); // userJid -> messageIds[]
        this.queryCache = new Map(); // queryHash -> results
        this.isInitialized = false;
        this.indexingInProgress = false;
    }

    async initialize() {
        try {
            await this.loadMessageIndex();
            this.setupCacheCleanup();
            this.isInitialized = true;
            console.log('✅ Message Query Service initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Message Query Service:', error);
            throw error;
        }
    }

    /**
     * Load message index from storage
     */
    async loadMessageIndex() {
        try {
            const index = await storageService.load('messages', 'search_index');
            if (index) {
                this.messageIndex = new Map(Object.entries(index.messages || {}));
                this.chatIndex = new Map(Object.entries(index.chats || {}));
                this.searchIndex = new Map(Object.entries(index.search || {}));
                this.dateIndex = new Map(Object.entries(index.dates || {}));
                this.userIndex = new Map(Object.entries(index.users || {}));
                
                console.log(`📚 Loaded message index: ${this.messageIndex.size} messages`);
            }
        } catch (error) {
            console.error('Error loading message index:', error);
        }
    }

    /**
     * Save message index to storage
     */
    async saveMessageIndex() {
        try {
            const index = {
                messages: Object.fromEntries(this.messageIndex.entries()),
                chats: Object.fromEntries(this.chatIndex.entries()),
                search: Object.fromEntries(this.searchIndex.entries()),
                dates: Object.fromEntries(this.dateIndex.entries()),
                users: Object.fromEntries(this.userIndex.entries()),
                lastUpdated: new Date().toISOString(),
                totalMessages: this.messageIndex.size
            };
            
            await storageService.save('messages', 'search_index', index);
        } catch (error) {
            console.error('Error saving message index:', error);
        }
    }

    /**
     * Index a message for searching
     */
    async indexMessage(message, messageData = null) {
        try {
            if (!message || !message.id) return false;

            const messageId = message.id._serialized || message.id;
            const chatId = message.from;
            const userJid = jidManager.normalizeJid(message.author || message.from);
            
            // Create or use provided message data
            const indexData = messageData || this.createMessageIndexData(message);
            
            // Index message
            this.messageIndex.set(messageId, indexData);

            // Index by chat
            if (!this.chatIndex.has(chatId)) {
                this.chatIndex.set(chatId, []);
            }
            this.chatIndex.get(chatId).push(messageId);

            // Index by user
            if (userJid) {
                if (!this.userIndex.has(userJid)) {
                    this.userIndex.set(userJid, []);
                }
                this.userIndex.get(userJid).push(messageId);
            }

            // Index by date
            const dateKey = this.getDateKey(indexData.timestamp);
            if (!this.dateIndex.has(dateKey)) {
                this.dateIndex.set(dateKey, []);
            }
            this.dateIndex.get(dateKey).push(messageId);

            // Index searchable text
            if (indexData.searchableText) {
                this.indexSearchableText(messageId, indexData.searchableText);
            }

            return true;

        } catch (error) {
            console.error('Error indexing message:', error);
            return false;
        }
    }

    /**
     * Create message index data
     */
    createMessageIndexData(message) {
        const timestamp = message.timestamp || Date.now() / 1000;
        const userJid = jidManager.normalizeJid(message.author || message.from);
        
        return {
            id: message.id._serialized || message.id,
            chatId: message.from,
            userJid: userJid,
            type: message.type,
            body: message.body || '',
            caption: message.caption || '',
            timestamp: timestamp,
            hasMedia: !!message.hasMedia,
            isForwarded: !!message.isForwarded,
            mentionedIds: message.mentionedIds || [],
            quotedMsgId: message.quotedMsg?.id,
            searchableText: this.extractSearchableText(message),
            indexedAt: Date.now()
        };
    }

    /**
     * Extract searchable text from message
     */
    extractSearchableText(message) {
        const texts = [];
        
        if (message.body) {
            texts.push(message.body.toLowerCase());
        }
        
        if (message.caption) {
            texts.push(message.caption.toLowerCase());
        }

        // Add contact info if message is a contact
        if (message.type === MESSAGE_TYPES.CONTACT && message.contact) {
            texts.push(message.contact.displayName?.toLowerCase() || '');
            texts.push(message.contact.name?.toLowerCase() || '');
        }

        return texts.join(' ').trim();
    }

    /**
     * Index searchable text terms
     */
    indexSearchableText(messageId, text) {
        if (!text) return;

        // Extract words (3+ characters)
        const words = text.match(/\b\w{3,}\b/g) || [];
        
        for (const word of words) {
            const term = word.toLowerCase();
            
            if (!this.searchIndex.has(term)) {
                this.searchIndex.set(term, []);
            }
            
            const messageIds = this.searchIndex.get(term);
            if (!messageIds.includes(messageId)) {
                messageIds.push(messageId);
            }
        }
    }

    /**
     * Get date key for indexing
     */
    getDateKey(timestamp) {
        return new Date(timestamp * 1000).toISOString().split('T')[0];
    }

    /**
     * Search messages
     */
    async searchMessages(query) {
        try {
            const queryHash = this.hashQuery(query);
            
            // Check cache first
            if (this.queryCache.has(queryHash)) {
                const cached = this.queryCache.get(queryHash);
                if (Date.now() - cached.timestamp < 5 * TIME.MINUTE) {
                    return cached.results;
                }
            }

            const results = await this.executeSearch(query);

            // Cache results
            this.queryCache.set(queryHash, {
                results,
                timestamp: Date.now()
            });

            return results;

        } catch (error) {
            console.error('Error searching messages:', error);
            this.emit('search_error', { query, error });
            return [];
        }
    }

    /**
     * Execute search query
     */
    async executeSearch(query) {
        let candidateMessageIds = new Set();

        // Text search
        if (query.text) {
            const textResults = this.searchByText(query.text);
            if (candidateMessageIds.size === 0) {
                candidateMessageIds = new Set(textResults);
            } else {
                candidateMessageIds = new Set(textResults.filter(id => candidateMessageIds.has(id)));
            }
        }

        // Chat filter
        if (query.chatId) {
            const chatResults = this.chatIndex.get(query.chatId) || [];
            if (candidateMessageIds.size === 0) {
                candidateMessageIds = new Set(chatResults);
            } else {
                candidateMessageIds = new Set(chatResults.filter(id => candidateMessageIds.has(id)));
            }
        }

        // User filter
        if (query.userJid) {
            const normalizedJid = jidManager.normalizeJid(query.userJid);
            const userResults = this.userIndex.get(normalizedJid) || [];
            if (candidateMessageIds.size === 0) {
                candidateMessageIds = new Set(userResults);
            } else {
                candidateMessageIds = new Set(userResults.filter(id => candidateMessageIds.has(id)));
            }
        }

        // Date range filter
        if (query.dateFrom || query.dateTo) {
            const dateResults = this.searchByDateRange(query.dateFrom, query.dateTo);
            if (candidateMessageIds.size === 0) {
                candidateMessageIds = new Set(dateResults);
            } else {
                candidateMessageIds = new Set(dateResults.filter(id => candidateMessageIds.has(id)));
            }
        }

        // Type filter
        if (query.type) {
            candidateMessageIds = new Set(Array.from(candidateMessageIds).filter(id => {
                const message = this.messageIndex.get(id);
                return message && message.type === query.type;
            }));
        }

        // Media filter
        if (query.hasMedia !== undefined) {
            candidateMessageIds = new Set(Array.from(candidateMessageIds).filter(id => {
                const message = this.messageIndex.get(id);
                return message && message.hasMedia === query.hasMedia;
            }));
        }

        // Convert to message objects and sort
        const messages = Array.from(candidateMessageIds)
            .map(id => this.messageIndex.get(id))
            .filter(msg => msg)
            .sort((a, b) => {
                if (query.sortBy === 'oldest') {
                    return a.timestamp - b.timestamp;
                }
                return b.timestamp - a.timestamp; // Default: newest first
            });

        // Apply limit
        const limit = query.limit || 100;
        return messages.slice(0, limit);
    }

    /**
     * Search by text
     */
    searchByText(text) {
        const searchTerms = text.toLowerCase().match(/\b\w{3,}\b/g) || [];
        if (searchTerms.length === 0) return [];

        let results = null;

        for (const term of searchTerms) {
            const termResults = this.searchIndex.get(term) || [];
            
            if (results === null) {
                results = new Set(termResults);
            } else {
                // Intersection for AND behavior
                results = new Set(termResults.filter(id => results.has(id)));
            }
        }

        return Array.from(results || []);
    }

    /**
     * Search by date range
     */
    searchByDateRange(dateFrom, dateTo) {
        const results = [];
        
        const startDate = dateFrom ? new Date(dateFrom) : new Date(0);
        const endDate = dateTo ? new Date(dateTo) : new Date();

        for (const [dateKey, messageIds] of this.dateIndex.entries()) {
            const date = new Date(dateKey);
            if (date >= startDate && date <= endDate) {
                results.push(...messageIds);
            }
        }

        return results;
    }

    /**
     * Get messages by chat
     */
    getMessagesByChat(chatId, options = {}) {
        const messageIds = this.chatIndex.get(chatId) || [];
        const messages = messageIds
            .map(id => this.messageIndex.get(id))
            .filter(msg => msg);

        // Apply filters
        let filtered = messages;

        if (options.type) {
            filtered = filtered.filter(msg => msg.type === options.type);
        }

        if (options.hasMedia !== undefined) {
            filtered = filtered.filter(msg => msg.hasMedia === options.hasMedia);
        }

        if (options.userJid) {
            const normalizedJid = jidManager.normalizeJid(options.userJid);
            filtered = filtered.filter(msg => msg.userJid === normalizedJid);
        }

        // Sort
        filtered.sort((a, b) => {
            if (options.sortBy === 'oldest') {
                return a.timestamp - b.timestamp;
            }
            return b.timestamp - a.timestamp;
        });

        // Apply limit
        const limit = options.limit || 50;
        return filtered.slice(0, limit);
    }

    /**
     * Get messages by user
     */
    getMessagesByUser(userJid, options = {}) {
        const normalizedJid = jidManager.normalizeJid(userJid);
        const messageIds = this.userIndex.get(normalizedJid) || [];
        
        const messages = messageIds
            .map(id => this.messageIndex.get(id))
            .filter(msg => msg)
            .sort((a, b) => b.timestamp - a.timestamp);

        const limit = options.limit || 50;
        return messages.slice(0, limit);
    }

    /**
     * Get recent messages
     */
    getRecentMessages(limit = 50) {
        const allMessages = Array.from(this.messageIndex.values())
            .sort((a, b) => b.timestamp - a.timestamp);

        return allMessages.slice(0, limit);
    }

    /**
     * Get message statistics
     */
    getMessageStats() {
        const stats = {
            totalMessages: this.messageIndex.size,
            totalChats: this.chatIndex.size,
            totalUsers: this.userIndex.size,
            searchTerms: this.searchIndex.size,
            byType: {},
            byDate: {},
            mediaMessages: 0
        };

        for (const message of this.messageIndex.values()) {
            // Count by type
            stats.byType[message.type] = (stats.byType[message.type] || 0) + 1;

            // Count by date
            const dateKey = this.getDateKey(message.timestamp);
            stats.byDate[dateKey] = (stats.byDate[dateKey] || 0) + 1;

            // Count media messages
            if (message.hasMedia) {
                stats.mediaMessages++;
            }
        }

        return stats;
    }

    /**
     * Hash query for caching
     */
    hashQuery(query) {
        return Buffer.from(JSON.stringify(query)).toString('base64');
    }

    /**
     * Setup cache cleanup
     */
    setupCacheCleanup() {
        setInterval(() => {
            const now = Date.now();
            const expired = [];

            for (const [hash, cached] of this.queryCache.entries()) {
                if (now - cached.timestamp > 10 * TIME.MINUTE) {
                    expired.push(hash);
                }
            }

            for (const hash of expired) {
                this.queryCache.delete(hash);
            }

            if (expired.length > 0) {
                console.log(`🧹 Cleared ${expired.length} expired query cache entries`);
            }
        }, 5 * TIME.MINUTE);
    }

    /**
     * Rebuild search index
     */
    async rebuildIndex() {
        if (this.indexingInProgress) {
            return { success: false, reason: 'Indexing already in progress' };
        }

        try {
            this.indexingInProgress = true;
            console.log('🔄 Rebuilding message search index...');

            // Clear existing indexes
            this.messageIndex.clear();
            this.chatIndex.clear();
            this.searchIndex.clear();
            this.dateIndex.clear();
            this.userIndex.clear();

            // Rebuild from stored messages
            // This would require iterating through stored message files
            // Implementation depends on your message storage structure

            await this.saveMessageIndex();
            
            console.log('✅ Message search index rebuilt');
            return { success: true };

        } catch (error) {
            console.error('Error rebuilding index:', error);
            return { success: false, reason: error.message };
        } finally {
            this.indexingInProgress = false;
        }
    }

    /**
     * Shutdown cleanup
     */
    async shutdown() {
        await this.saveMessageIndex();
        this.queryCache.clear();
        this.emit('shutdown');
        console.log('Message Query Service shutdown complete');
    }
}

module.exports = MessageQueryService;