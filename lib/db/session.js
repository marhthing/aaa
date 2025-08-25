/**
 * Session Database Manager
 * Handles WhatsApp session data storage and retrieval
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

class SessionManager {
    constructor() {
        // Use DATABASE_URL from environment
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
        
        this.initializeDatabase();
    }
    
    /**
     * Initialize database tables
     */
    async initializeDatabase() {
        try {
            const createSessionsTable = `
                CREATE TABLE IF NOT EXISTS whatsapp_sessions (
                    id SERIAL PRIMARY KEY,
                    session_id VARCHAR(255) UNIQUE NOT NULL,
                    creds JSONB,
                    keys JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `;
            
            const createIndexes = `
                CREATE INDEX IF NOT EXISTS idx_session_id ON whatsapp_sessions(session_id);
            `;
            
            await this.pool.query(createSessionsTable);
            await this.pool.query(createIndexes);
            
            logger.info('📊 Session database initialized');
            
        } catch (error) {
            logger.error('Failed to initialize session database:', error);
            throw error;
        }
    }
    
    /**
     * Save session credentials
     */
    async saveSession(sessionId, creds, keys = null) {
        try {
            const query = `
                INSERT INTO whatsapp_sessions (session_id, creds, keys, updated_at)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                ON CONFLICT (session_id)
                DO UPDATE SET 
                    creds = EXCLUDED.creds,
                    keys = EXCLUDED.keys,
                    updated_at = CURRENT_TIMESTAMP
            `;
            
            const values = [sessionId, JSON.stringify(creds), keys ? JSON.stringify(keys) : null];
            await this.pool.query(query, values);
            
            logger.debug(`💾 Session saved for: ${sessionId}`);
            
        } catch (error) {
            logger.error(`Failed to save session ${sessionId}:`, error);
            throw error;
        }
    }
    
    /**
     * Load session credentials
     */
    async loadSession(sessionId) {
        try {
            const query = 'SELECT creds, keys FROM whatsapp_sessions WHERE session_id = $1';
            const result = await this.pool.query(query, [sessionId]);
            
            if (result.rows.length === 0) {
                logger.info(`🔍 No session found for: ${sessionId}`);
                return null;
            }
            
            const session = result.rows[0];
            
            return {
                creds: session.creds,
                keys: session.keys
            };
            
        } catch (error) {
            logger.error(`Failed to load session ${sessionId}:`, error);
            return null;
        }
    }
    
    /**
     * Check if session exists
     */
    async sessionExists(sessionId) {
        try {
            const query = 'SELECT 1 FROM whatsapp_sessions WHERE session_id = $1';
            const result = await this.pool.query(query, [sessionId]);
            
            return result.rows.length > 0;
            
        } catch (error) {
            logger.error(`Failed to check session existence for ${sessionId}:`, error);
            return false;
        }
    }
    
    /**
     * Delete session
     */
    async deleteSession(sessionId) {
        try {
            const query = 'DELETE FROM whatsapp_sessions WHERE session_id = $1';
            await this.pool.query(query, [sessionId]);
            
            logger.info(`🗑️ Session deleted: ${sessionId}`);
            
        } catch (error) {
            logger.error(`Failed to delete session ${sessionId}:`, error);
            throw error;
        }
    }
    
    /**
     * List all sessions
     */
    async listSessions() {
        try {
            const query = 'SELECT session_id, created_at, updated_at FROM whatsapp_sessions ORDER BY updated_at DESC';
            const result = await this.pool.query(query);
            
            return result.rows;
            
        } catch (error) {
            logger.error('Failed to list sessions:', error);
            return [];
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