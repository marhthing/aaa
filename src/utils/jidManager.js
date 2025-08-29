/**
 * JID (Jabber ID) Manager
 * Handles WhatsApp JID validation, formatting, and owner detection
 */

const { PATTERNS } = require('./constants');

class JidManager {
    constructor() {
        this.ownerJid = null;
        this.validatedJids = new Map(); // Cache for validated JIDs
        this.jidCache = new Map(); // Cache for normalized JIDs
    }

    /**
     * Initialize with owner JID
     */
    initialize(ownerJid) {
        if (ownerJid && this.validateJid(ownerJid)) {
            this.ownerJid = this.normalizeJid(ownerJid);
            console.log(`✅ Owner JID set: ${this.ownerJid}`);
            return true;
        }
        console.error('❌ Invalid owner JID provided');
        return false;
    }

    /**
     * Set owner JID
     */
    setOwner(jid) {
        return this.initialize(jid);
    }

    /**
     * Get owner JID
     */
    getOwner() {
        return this.ownerJid;
    }

    /**
     * Check if JID is the bot owner
     */
    isOwner(jid) {
        if (!this.ownerJid || !jid) return false;
        
        const normalizedJid = this.normalizeJid(jid);
        const normalizedOwner = this.normalizeJid(this.ownerJid);
        
        // Extract base JID (without device ID suffix like :79)
        const baseJid = normalizedJid ? normalizedJid.split(':')[0] : null;
        const baseOwner = normalizedOwner ? normalizedOwner.split(':')[0] : null;
        
        return baseJid === baseOwner;
    }

    /**
     * Validate JID format
     */
    validateJid(jid) {
        if (!jid || typeof jid !== 'string') return false;

        // Check cache first
        if (this.validatedJids.has(jid)) {
            return this.validatedJids.get(jid);
        }

        const isValid = PATTERNS.JID.test(jid);
        this.validatedJids.set(jid, isValid);
        
        return isValid;
    }

    /**
     * Normalize JID format
     */
    normalizeJid(jid) {
        if (!jid) return null;

        // Check cache first
        if (this.jidCache.has(jid)) {
            return this.jidCache.get(jid);
        }

        let normalized = jid.toLowerCase().trim();
        
        // Handle phone numbers without @s.whatsapp.net
        if (PATTERNS.PHONE_NUMBER.test(normalized)) {
            normalized = `${normalized}@s.whatsapp.net`;
        }

        // Remove any extra characters except colon for device ID
        normalized = normalized.replace(/[^\d@\.a-z:]/g, '');

        // Validate the normalized JID
        if (!this.validateJid(normalized)) {
            this.jidCache.set(jid, null);
            return null;
        }

        this.jidCache.set(jid, normalized);
        return normalized;
    }

    /**
     * Extract phone number from JID
     */
    getPhoneNumber(jid) {
        const normalized = this.normalizeJid(jid);
        if (!normalized) return null;

        const match = normalized.match(/^(\d+)@/);
        return match ? match[1] : null;
    }

    /**
     * Check if JID is a group
     */
    isGroup(jid) {
        const normalized = this.normalizeJid(jid);
        return normalized ? normalized.endsWith('@g.us') : false;
    }

    /**
     * Check if JID is an individual chat
     */
    isIndividual(jid) {
        const normalized = this.normalizeJid(jid);
        return normalized ? normalized.endsWith('@s.whatsapp.net') : false;
    }

    /**
     * Format JID for display
     */
    formatForDisplay(jid) {
        const phoneNumber = this.getPhoneNumber(jid);
        if (!phoneNumber) return jid;

        // Add country code formatting for common formats
        if (phoneNumber.length === 11 && phoneNumber.startsWith('1')) {
            // US/Canada format
            return `+${phoneNumber.slice(0, 1)} (${phoneNumber.slice(1, 4)}) ${phoneNumber.slice(4, 7)}-${phoneNumber.slice(7)}`;
        } else if (phoneNumber.length >= 10) {
            // International format
            return `+${phoneNumber}`;
        }

        return phoneNumber;
    }

    /**
     * Create JID from phone number
     */
    createJid(phoneNumber, isGroup = false) {
        if (!phoneNumber) return null;

        // Clean phone number
        const cleaned = phoneNumber.replace(/[^\d]/g, '');
        
        if (!PATTERNS.PHONE_NUMBER.test(cleaned)) {
            return null;
        }

        const suffix = isGroup ? '@g.us' : '@s.whatsapp.net';
        return this.normalizeJid(`${cleaned}${suffix}`);
    }

    /**
     * Batch validate JIDs
     */
    validateJids(jids) {
        if (!Array.isArray(jids)) return [];

        return jids.filter(jid => this.validateJid(jid));
    }

    /**
     * Batch normalize JIDs
     */
    normalizeJids(jids) {
        if (!Array.isArray(jids)) return [];

        return jids
            .map(jid => this.normalizeJid(jid))
            .filter(jid => jid !== null);
    }

    /**
     * Get JID type
     */
    getJidType(jid) {
        const normalized = this.normalizeJid(jid);
        if (!normalized) return 'invalid';

        if (normalized.endsWith('@g.us')) return 'group';
        if (normalized.endsWith('@s.whatsapp.net')) return 'individual';
        if (normalized.endsWith('@broadcast')) return 'broadcast';
        
        return 'unknown';
    }

    /**
     * Compare JIDs for equality
     */
    areEqual(jid1, jid2) {
        if (!jid1 || !jid2) return false;
        
        const normalized1 = this.normalizeJid(jid1);
        const normalized2 = this.normalizeJid(jid2);
        
        return normalized1 === normalized2;
    }

    /**
     * Clear caches
     */
    clearCache() {
        this.validatedJids.clear();
        this.jidCache.clear();
        console.log('JID Manager cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            validatedJids: this.validatedJids.size,
            normalizedJids: this.jidCache.size,
            ownerJid: this.ownerJid
        };
    }
}

// Create singleton instance
const jidManager = new JidManager();

module.exports = {
    JidManager,
    jidManager
};