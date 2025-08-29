/**
 * MatDev Message Class
 * Handle incoming messages with reply capabilities
 */

const moment = require('moment');
const logger = require('../utils/logger');

class Message {
    constructor(bot, rawMessage) {
        this.bot = bot;
        this.raw = rawMessage;
        this.key = rawMessage.key;
        this.messageTimestamp = rawMessage.messageTimestamp;
        
        // Extract message info
        this.from = this.key.remoteJid;
        this.sender = this.key.participant || this.from;
        this.isGroup = this.from.endsWith('@g.us');
        this.isPrivate = !this.isGroup;
        
        // Parse message content
        this.parseMessage();
        
        // User permissions
        this.isSudo = this.bot.isSudo(this.sender);
        this.isAdmin = false; // Will be set asynchronously
        
        // Initialize admin status for groups
        if (this.isGroup) {
            this.setAdminStatus();
        }
    }
    
    /**
     * Parse message content and type
     */
    parseMessage() {
        const msg = this.raw.message;
        
        if (!msg) {
            this.type = 'unknown';
            this.text = '';
            return;
        }
        
        // Text messages
        if (msg.conversation) {
            this.type = 'text';
            this.text = msg.conversation;
        } else if (msg.extendedTextMessage) {
            this.type = 'text';
            this.text = msg.extendedTextMessage.text;
            this.quoted = msg.extendedTextMessage.contextInfo?.quotedMessage;
        }
        // Image messages
        else if (msg.imageMessage) {
            this.type = 'image';
            this.text = msg.imageMessage.caption || '';
            this.media = msg.imageMessage;
        }
        // Video messages
        else if (msg.videoMessage) {
            this.type = 'video';
            this.text = msg.videoMessage.caption || '';
            this.media = msg.videoMessage;
        }
        // Audio messages
        else if (msg.audioMessage) {
            this.type = 'audio';
            this.text = '';
            this.media = msg.audioMessage;
        }
        // Document messages
        else if (msg.documentMessage) {
            this.type = 'document';
            this.text = msg.documentMessage.caption || '';
            this.media = msg.documentMessage;
        }
        // Sticker messages
        else if (msg.stickerMessage) {
            this.type = 'sticker';
            this.text = '';
            this.media = msg.stickerMessage;
        }
        // Location messages
        else if (msg.locationMessage) {
            this.type = 'location';
            this.text = '';
            this.location = msg.locationMessage;
        }
        // Contact messages
        else if (msg.contactMessage) {
            this.type = 'contact';
            this.text = '';
            this.contact = msg.contactMessage;
        }
        else {
            this.type = 'unknown';
            this.text = '';
        }
        
        // Parse command if text message
        if (this.text && this.text.startsWith(this.bot.config.PREFIX)) {
            this.parseCommand();
        }
    }
    
    /**
     * Parse command from text
     */
    parseCommand() {
        const text = this.text.slice(this.bot.config.PREFIX.length).trim();
        const args = text.split(' ').filter(arg => arg.length > 0); // Remove empty args
        
        this.command = args.shift()?.toLowerCase() || '';
        this.args = args;
        this.isCommand = true;
        
        // Join args as string for some use cases
        this.argsText = args.join(' ');
        
        // Debug log
        console.log(`🔍 Parsed command: "${this.command}" with args: [${this.args.join(', ')}]`);
    }
    
    /**
     * Set admin status for group messages
     */
    async setAdminStatus() {
        try {
            this.isAdmin = await this.bot.isAdmin(this.from, this.sender);
        } catch (error) {
            logger.error('Failed to check admin status:', error);
            this.isAdmin = false;
        }
    }
    
    /**
     * Reply to the message
     */
    async reply(content, options = {}) {
        try {
            const replyOptions = {
                quoted: this.raw,
                ...options
            };
            
            return await this.bot.sendMessage(this.from, content, replyOptions);
        } catch (error) {
            logger.error('Failed to reply to message:', error);
            throw error;
        }
    }
    
    /**
     * React to the message
     */
    async react(emoji) {
        try {
            const reactionMessage = {
                react: {
                    text: emoji,
                    key: this.key
                }
            };
            
            return await this.bot.sendMessage(this.from, reactionMessage);
        } catch (error) {
            logger.error('Failed to react to message:', error);
            throw error;
        }
    }
    
    /**
     * Send a message to the same chat
     */
    async send(content, options = {}) {
        try {
            return await this.bot.sendMessage(this.from, content, options);
        } catch (error) {
            logger.error('Failed to send message:', error);
            throw error;
        }
    }
    
    /**
     * Delete the message
     */
    async delete() {
        try {
            return await this.bot.sock.sendMessage(this.from, { 
                delete: this.key 
            });
        } catch (error) {
            logger.error('Failed to delete message:', error);
            throw error;
        }
    }
    
    /**
     * Forward the message
     */
    async forward(jid) {
        try {
            return await this.bot.sock.sendMessage(jid, { 
                forward: this.raw 
            });
        } catch (error) {
            logger.error('Failed to forward message:', error);
            throw error;
        }
    }
    
    /**
     * Download media if present
     */
    async downloadMedia() {
        try {
            if (!this.media) {
                throw new Error('No media in this message');
            }
            
            return await this.bot.sock.downloadMediaMessage(this.raw);
        } catch (error) {
            logger.error('Failed to download media:', error);
            throw error;
        }
    }
    
    /**
     * Get sender info
     */
    async getSenderInfo() {
        try {
            return await this.bot.getInfo(this.sender);
        } catch (error) {
            logger.error('Failed to get sender info:', error);
            return null;
        }
    }
    
    /**
     * Get chat info
     */
    async getChatInfo() {
        try {
            return await this.bot.getInfo(this.from);
        } catch (error) {
            logger.error('Failed to get chat info:', error);
            return null;
        }
    }
    
    /**
     * Check if message is from bot owner
     */
    isFromOwner() {
        return this.isSudo;
    }
    
    /**
     * Check if message is in a group
     */
    isGroupMessage() {
        return this.isGroup;
    }
    
    /**
     * Check if message is private
     */
    isPrivateMessage() {
        return this.isPrivate;
    }
    
    /**
     * Get formatted timestamp
     */
    getTimestamp() {
        return moment.unix(this.messageTimestamp).format('YYYY-MM-DD HH:mm:ss');
    }
    
    /**
     * Get message summary for logging
     */
    getSummary() {
        return {
            from: this.from,
            sender: this.sender,
            type: this.type,
            command: this.command || null,
            isGroup: this.isGroup,
            isSudo: this.isSudo,
            isAdmin: this.isAdmin,
            timestamp: this.getTimestamp(),
            textPreview: this.text ? this.text.substring(0, 50) : ''
        };
    }
    
    /**
     * Convert to JSON
     */
    toJSON() {
        return {
            key: this.key,
            from: this.from,
            sender: this.sender,
            type: this.type,
            text: this.text,
            command: this.command,
            args: this.args,
            isGroup: this.isGroup,
            isPrivate: this.isPrivate,
            isSudo: this.isSudo,
            isAdmin: this.isAdmin,
            timestamp: this.getTimestamp()
        };
    }
}

module.exports = Message;
