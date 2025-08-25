/**
 * MatDev Security Utilities
 * Anti-spam, rate limiting, and protection systems
 */

const logger = require('./logger');
const config = require('../../config');

/**
 * Anti-Spam Protection System
 */
class AntiSpam {
    constructor() {
        this.messageTracker = new Map();
        this.spamThreshold = 5; // messages
        this.timeWindow = 10000; // 10 seconds
        this.blockDuration = 60000; // 1 minute
        this.blockedUsers = new Map();
        
        // Cleanup blocked users periodically
        setInterval(() => this.cleanupBlocked(), 60000);
    }
    
    /**
     * Check if user is spamming
     */
    isSpamming(userId) {
        // Check if user is currently blocked
        if (this.blockedUsers.has(userId)) {
            const blockExpiry = this.blockedUsers.get(userId);
            if (Date.now() < blockExpiry) {
                return true;
            } else {
                this.blockedUsers.delete(userId);
            }
        }
        
        const now = Date.now();
        const userMessages = this.messageTracker.get(userId) || [];
        
        // Remove old messages outside time window
        const recentMessages = userMessages.filter(timestamp => 
            now - timestamp < this.timeWindow
        );
        
        // Add current message
        recentMessages.push(now);
        
        // Update tracker
        this.messageTracker.set(userId, recentMessages);
        
        // Check if exceeds threshold
        if (recentMessages.length > this.spamThreshold) {
            this.blockUser(userId);
            logger.logSecurity('spam_detected', userId, {
                messageCount: recentMessages.length,
                timeWindow: this.timeWindow
            });
            return true;
        }
        
        return false;
    }
    
    /**
     * Block user for spam
     */
    blockUser(userId) {
        const blockExpiry = Date.now() + this.blockDuration;
        this.blockedUsers.set(userId, blockExpiry);
        this.messageTracker.delete(userId);
    }
    
    /**
     * Manually unblock user
     */
    unblockUser(userId) {
        this.blockedUsers.delete(userId);
        this.messageTracker.delete(userId);
    }
    
    /**
     * Check if user is blocked
     */
    isBlocked(userId) {
        return this.blockedUsers.has(userId);
    }
    
    /**
     * Get remaining block time
     */
    getBlockTimeRemaining(userId) {
        const blockExpiry = this.blockedUsers.get(userId);
        if (!blockExpiry) return 0;
        
        const remaining = blockExpiry - Date.now();
        return Math.max(0, Math.ceil(remaining / 1000));
    }
    
    /**
     * Cleanup expired blocks
     */
    cleanupBlocked() {
        const now = Date.now();
        for (const [userId, expiry] of this.blockedUsers) {
            if (now >= expiry) {
                this.blockedUsers.delete(userId);
            }
        }
    }
    
    /**
     * Get statistics
     */
    getStats() {
        return {
            activeUsers: this.messageTracker.size,
            blockedUsers: this.blockedUsers.size,
            settings: {
                threshold: this.spamThreshold,
                timeWindow: this.timeWindow,
                blockDuration: this.blockDuration
            }
        };
    }
}

/**
 * Rate Limiting System
 */
class RateLimit {
    constructor() {
        this.commandLimits = new Map();
        this.globalLimit = config.MAX_COMMANDS_PER_MINUTE || 20;
        this.userLimits = new Map();
        
        // Cleanup old entries periodically
        setInterval(() => this.cleanup(), 60000);
    }
    
    /**
     * Check if user can execute command
     */
    canExecute(userId, command = null) {
        const now = Date.now();
        const minute = Math.floor(now / 60000);
        
        // Check global limit
        const globalKey = `global:${minute}`;
        const globalCount = this.commandLimits.get(globalKey) || 0;
        
        if (globalCount >= this.globalLimit) {
            logger.logSecurity('global_rate_limit', 'system', {
                limit: this.globalLimit,
                current: globalCount
            });
            return false;
        }
        
        // Check user limit
        const userKey = `${userId}:${minute}`;
        const userCount = this.userLimits.get(userKey) || 0;
        const userLimit = this.getUserLimit(userId);
        
        if (userCount >= userLimit) {
            logger.logSecurity('user_rate_limit', userId, {
                limit: userLimit,
                current: userCount
            });
            return false;
        }
        
        return true;
    }
    
    /**
     * Record command execution
     */
    recordExecution(userId, command = null) {
        const now = Date.now();
        const minute = Math.floor(now / 60000);
        
        // Update global count
        const globalKey = `global:${minute}`;
        const globalCount = this.commandLimits.get(globalKey) || 0;
        this.commandLimits.set(globalKey, globalCount + 1);
        
        // Update user count
        const userKey = `${userId}:${minute}`;
        const userCount = this.userLimits.get(userKey) || 0;
        this.userLimits.set(userKey, userCount + 1);
    }
    
    /**
     * Get user rate limit (VIP users get higher limits)
     */
    getUserLimit(userId) {
        // TODO: Check if user is VIP from database
        return 10; // Default user limit per minute
    }
    
    /**
     * Get remaining commands for user
     */
    getRemainingCommands(userId) {
        const now = Date.now();
        const minute = Math.floor(now / 60000);
        const userKey = `${userId}:${minute}`;
        const userCount = this.userLimits.get(userKey) || 0;
        const userLimit = this.getUserLimit(userId);
        
        return Math.max(0, userLimit - userCount);
    }
    
    /**
     * Cleanup old entries
     */
    cleanup() {
        const now = Date.now();
        const currentMinute = Math.floor(now / 60000);
        
        // Keep only current and previous minute
        for (const [key] of this.commandLimits) {
            const [, minute] = key.split(':');
            if (parseInt(minute) < currentMinute - 1) {
                this.commandLimits.delete(key);
            }
        }
        
        for (const [key] of this.userLimits) {
            const [, minute] = key.split(':');
            if (parseInt(minute) < currentMinute - 1) {
                this.userLimits.delete(key);
            }
        }
    }
    
    /**
     * Get statistics
     */
    getStats() {
        return {
            globalCommands: this.commandLimits.size,
            userCommands: this.userLimits.size,
            globalLimit: this.globalLimit
        };
    }
}

/**
 * Link Detection and Protection
 */
class AntiLink {
    constructor() {
        this.linkPatterns = [
            /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g,
            /www\.[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g,
            /(telegram|discord|whatsapp)\..*\/.*join/gi,
            /chat\.whatsapp\.com\/[a-zA-Z0-9]+/gi
        ];
        
        this.whitelist = [
            'youtube.com',
            'youtu.be',
            'github.com',
            'google.com'
        ];
    }
    
    /**
     * Check if message contains malicious links
     */
    hasLinks(text) {
        if (!text) return false;
        
        for (const pattern of this.linkPatterns) {
            const matches = text.match(pattern);
            if (matches) {
                // Check if any link is not whitelisted
                for (const match of matches) {
                    if (!this.isWhitelisted(match)) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }
    
    /**
     * Check if link is whitelisted
     */
    isWhitelisted(link) {
        return this.whitelist.some(domain => link.includes(domain));
    }
    
    /**
     * Extract links from text
     */
    extractLinks(text) {
        const links = [];
        
        for (const pattern of this.linkPatterns) {
            const matches = text.match(pattern);
            if (matches) {
                links.push(...matches);
            }
        }
        
        return [...new Set(links)]; // Remove duplicates
    }
    
    /**
     * Add domain to whitelist
     */
    addToWhitelist(domain) {
        if (!this.whitelist.includes(domain)) {
            this.whitelist.push(domain);
        }
    }
    
    /**
     * Remove domain from whitelist
     */
    removeFromWhitelist(domain) {
        const index = this.whitelist.indexOf(domain);
        if (index > -1) {
            this.whitelist.splice(index, 1);
        }
    }
}

/**
 * Input Validation and Sanitization
 */
class InputValidator {
    /**
     * Sanitize user input
     */
    static sanitize(input) {
        if (typeof input !== 'string') return input;
        
        return input
            .trim()
            .replace(/[<>]/g, '') // Remove HTML brackets
            .replace(/javascript:/gi, '') // Remove javascript: protocol
            .replace(/on\w+=/gi, ''); // Remove event handlers
    }
    
    /**
     * Validate JID format
     */
    static isValidJID(jid) {
        const jidPattern = /^[0-9]+(-[0-9]+)?@(s\.whatsapp\.net|g\.us)$/;
        return jidPattern.test(jid);
    }
    
    /**
     * Validate command name
     */
    static isValidCommand(command) {
        const commandPattern = /^[a-zA-Z0-9_-]+$/;
        return commandPattern.test(command) && command.length <= 50;
    }
    
    /**
     * Validate phone number
     */
    static isValidPhoneNumber(phone) {
        const phonePattern = /^[1-9][0-9]{6,14}$/;
        return phonePattern.test(phone);
    }
    
    /**
     * Check for SQL injection patterns
     */
    static hasSQLInjection(input) {
        const sqlPatterns = [
            /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
            /(--|#|\/\*|\*\/)/g,
            /(\b(OR|AND)\b.*=.*)/gi
        ];
        
        return sqlPatterns.some(pattern => pattern.test(input));
    }
    
    /**
     * Check for XSS patterns
     */
    static hasXSS(input) {
        const xssPatterns = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            /<iframe\b/gi,
            /<object\b/gi,
            /<embed\b/gi
        ];
        
        return xssPatterns.some(pattern => pattern.test(input));
    }
    
    /**
     * Validate and sanitize user input
     */
    static validateInput(input, options = {}) {
        const {
            maxLength = 1000,
            allowHTML = false,
            allowLinks = true
        } = options;
        
        if (!input || typeof input !== 'string') {
            return { valid: false, error: 'Input must be a non-empty string' };
        }
        
        if (input.length > maxLength) {
            return { valid: false, error: `Input too long (max ${maxLength} characters)` };
        }
        
        if (this.hasSQLInjection(input)) {
            return { valid: false, error: 'SQL injection attempt detected' };
        }
        
        if (!allowHTML && this.hasXSS(input)) {
            return { valid: false, error: 'XSS attempt detected' };
        }
        
        const sanitized = this.sanitize(input);
        
        return {
            valid: true,
            sanitized
        };
    }
}

/**
 * Flood Protection System
 */
class FloodProtection {
    constructor() {
        this.messageQueue = new Map();
        this.maxMessages = 3;
        this.timeWindow = 2000; // 2 seconds
        this.penalties = new Map();
    }
    
    /**
     * Check if user is flooding
     */
    isFlooding(userId) {
        const now = Date.now();
        const userQueue = this.messageQueue.get(userId) || [];
        
        // Remove old messages
        const recentMessages = userQueue.filter(timestamp => 
            now - timestamp < this.timeWindow
        );
        
        recentMessages.push(now);
        this.messageQueue.set(userId, recentMessages);
        
        if (recentMessages.length > this.maxMessages) {
            this.applyPenalty(userId);
            return true;
        }
        
        return false;
    }
    
    /**
     * Apply penalty for flooding
     */
    applyPenalty(userId) {
        const currentPenalty = this.penalties.get(userId) || 0;
        const newPenalty = Math.min(currentPenalty + 1, 5);
        
        this.penalties.set(userId, newPenalty);
        
        // Penalty expires after some time
        setTimeout(() => {
            const penalty = this.penalties.get(userId) || 0;
            if (penalty > 0) {
                this.penalties.set(userId, penalty - 1);
            }
            if (penalty <= 1) {
                this.penalties.delete(userId);
            }
        }, 30000 * newPenalty); // Penalty duration increases with level
    }
    
    /**
     * Get user penalty level
     */
    getPenaltyLevel(userId) {
        return this.penalties.get(userId) || 0;
    }
}

module.exports = {
    AntiSpam,
    RateLimit,
    AntiLink,
    InputValidator,
    FloodProtection
};
