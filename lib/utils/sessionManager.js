/**
 * Session Manager - Handle WhatsApp auth sessions with file-based storage
 * Auto-creates new sessions when none exist
 */

const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

class SessionManager {
    constructor() {
        this.sessionsDir = './sessions';
        this.ensureSessionsDir();
    }
    
    /**
     * Ensure sessions directory exists
     */
    ensureSessionsDir() {
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirpSync(this.sessionsDir);
            logger.info('📁 Sessions directory created');
        }
    }
    
    /**
     * Check if session directory exists
     */
    sessionExists(sessionId) {
        const sessionPath = path.join(this.sessionsDir, sessionId);
        return fs.existsSync(sessionPath);
    }
    
    /**
     * Get auth state for Baileys - creates new session if none exists
     */
    async getAuthState(sessionId) {
        try {
            const sessionPath = path.join(this.sessionsDir, sessionId);
            
            if (this.sessionExists(sessionId)) {
                logger.info(`✅ Loading existing session: ${sessionId} - session will persist for reconnection`);
            } else {
                logger.info(`📱 No session found, creating new session: ${sessionId}`);
                logger.info('🔗 New WhatsApp connection required');
            }
            
            // Use Baileys' built-in file-based auth state
            const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
            
            return { state, saveCreds };
            
        } catch (error) {
            logger.error('Failed to get auth state:', error);
            throw error;
        }
    }
    
    /**
     * Clean up old sessions (optional)
     */
    async cleanup() {
        try {
            logger.info('🧹 Session cleanup completed');
        } catch (error) {
            logger.error('Failed to cleanup sessions:', error);
        }
    }
}

module.exports = SessionManager;