/**
 * Session Manager - Fetch WhatsApp sessions from database
 * Note: Sessions are created by the web scanner, this only fetches them
 */

const { Pool } = require('pg');
const logger = require('./logger');

class SessionManager {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
    }
    
    /**
     * Load session data from database (read-only)
     */
    async loadSession(sessionId) {
        try {
            const query = `
                SELECT session_data 
                FROM whatsapp_sessions 
                WHERE session_id = $1 AND is_active = true
            `;
            
            const result = await this.pool.query(query, [sessionId]);
            
            if (result.rows.length === 0) {
                logger.warn(`❌ Session not found: ${sessionId}`);
                logger.info('💡 Create a session using the web scanner first');
                return null;
            }
            
            const sessionData = result.rows[0].session_data;
            logger.info(`✅ Session loaded: ${sessionId}`);
            
            return sessionData;
            
        } catch (error) {
            logger.error('Failed to load session:', error);
            return null;
        }
    }
    
    /**
     * Check if session exists
     */
    async sessionExists(sessionId) {
        try {
            const query = `
                SELECT 1 FROM whatsapp_sessions 
                WHERE session_id = $1 AND is_active = true
            `;
            
            const result = await this.pool.query(query, [sessionId]);
            return result.rows.length > 0;
            
        } catch (error) {
            logger.error('Failed to check session existence:', error);
            return false;
        }
    }
    
    /**
     * Get auth state for Baileys (read-only)
     */
    async getAuthState(sessionId) {
        try {
            const sessionData = await this.loadSession(sessionId);
            
            if (!sessionData) {
                logger.error(`❌ No session found for: ${sessionId}`);
                logger.info('💡 Create a session using the web scanner first');
                throw new Error(`Session ${sessionId} not found. Use web scanner to create it.`);
            }
            
            // Return existing session (read-only)
            return {
                state: {
                    creds: sessionData.creds,
                    keys: sessionData.keys || {}
                },
                saveCreds: () => {
                    // Bot only reads sessions, doesn't save them
                    logger.debug('Session updates ignored (read-only mode)');
                }
            };
            
        } catch (error) {
            logger.error('Failed to get auth state:', error);
            throw error;
        }
    }
    
    /**
     * Close database connection
     */
    async close() {
        try {
            await this.pool.end();
            logger.info('📊 Session database connection closed');
        } catch (error) {
            logger.error('Failed to close session database:', error);
        }
    }
}

module.exports = SessionManager;