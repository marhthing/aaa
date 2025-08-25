/**
 * Session Manager - Handle WhatsApp sessions with database storage
 */

const { Pool } = require('pg');
const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

class SessionManager {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
        
        this.initializeDatabase();
    }
    
    /**
     * Initialize database tables for sessions
     */
    async initializeDatabase() {
        try {
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS whatsapp_sessions (
                    session_id VARCHAR(255) PRIMARY KEY,
                    session_data JSONB NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_active BOOLEAN DEFAULT true
                )
            `);
            
            await this.pool.query(`
                CREATE INDEX IF NOT EXISTS idx_sessions_active ON whatsapp_sessions(is_active);
                CREATE INDEX IF NOT EXISTS idx_sessions_last_used ON whatsapp_sessions(last_used);
            `);
            
            logger.info('📊 Session database initialized');
        } catch (error) {
            logger.error('Failed to initialize session database:', error);
            throw error;
        }
    }
    
    /**
     * Save session data to database
     */
    async saveSession(sessionId, sessionData) {
        try {
            const query = `
                INSERT INTO whatsapp_sessions (session_id, session_data, updated_at, last_used)
                VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (session_id) 
                DO UPDATE SET 
                    session_data = $2,
                    updated_at = CURRENT_TIMESTAMP,
                    last_used = CURRENT_TIMESTAMP,
                    is_active = true
            `;
            
            await this.pool.query(query, [sessionId, JSON.stringify(sessionData)]);
            logger.debug(`💾 Session saved: ${sessionId}`);
            
            return true;
        } catch (error) {
            logger.error('Failed to save session:', error);
            return false;
        }
    }
    
    /**
     * Load session data from database
     */
    async loadSession(sessionId) {
        try {
            const query = `
                SELECT session_data, last_used, is_active 
                FROM whatsapp_sessions 
                WHERE session_id = $1 AND is_active = true
            `;
            
            const result = await this.pool.query(query, [sessionId]);
            
            if (result.rows.length === 0) {
                logger.warn(`Session not found: ${sessionId}`);
                return null;
            }
            
            const sessionData = result.rows[0].session_data;
            
            // Update last used
            await this.pool.query(
                'UPDATE whatsapp_sessions SET last_used = CURRENT_TIMESTAMP WHERE session_id = $1',
                [sessionId]
            );
            
            logger.debug(`📂 Session loaded: ${sessionId}`);
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
     * Delete session
     */
    async deleteSession(sessionId) {
        try {
            const query = `
                UPDATE whatsapp_sessions 
                SET is_active = false, updated_at = CURRENT_TIMESTAMP 
                WHERE session_id = $1
            `;
            
            await this.pool.query(query, [sessionId]);
            logger.info(`🗑️ Session deleted: ${sessionId}`);
            
            return true;
        } catch (error) {
            logger.error('Failed to delete session:', error);
            return false;
        }
    }
    
    /**
     * Get session info
     */
    async getSessionInfo(sessionId) {
        try {
            const query = `
                SELECT session_id, created_at, updated_at, last_used, is_active
                FROM whatsapp_sessions 
                WHERE session_id = $1
            `;
            
            const result = await this.pool.query(query, [sessionId]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            return result.rows[0];
            
        } catch (error) {
            logger.error('Failed to get session info:', error);
            return null;
        }
    }
    
    /**
     * List all active sessions
     */
    async listActiveSessions() {
        try {
            const query = `
                SELECT session_id, created_at, last_used
                FROM whatsapp_sessions 
                WHERE is_active = true
                ORDER BY last_used DESC
            `;
            
            const result = await this.pool.query(query);
            return result.rows;
            
        } catch (error) {
            logger.error('Failed to list sessions:', error);
            return [];
        }
    }
    
    /**
     * Cleanup old sessions
     */
    async cleanupOldSessions(daysOld = 30) {
        try {
            const query = `
                UPDATE whatsapp_sessions 
                SET is_active = false 
                WHERE last_used < NOW() - INTERVAL '${daysOld} days'
                AND is_active = true
            `;
            
            const result = await this.pool.query(query);
            
            if (result.rowCount > 0) {
                logger.info(`🧹 Cleaned up ${result.rowCount} old sessions`);
            }
            
            return result.rowCount;
            
        } catch (error) {
            logger.error('Failed to cleanup old sessions:', error);
            return 0;
        }
    }
    
    /**
     * Get auth state for Baileys
     */
    async getAuthState(sessionId) {
        try {
            const sessionData = await this.loadSession(sessionId);
            
            if (!sessionData) {
                // Create new session structure
                return {
                    state: { creds: null, keys: {} },
                    saveCreds: async (creds) => {
                        await this.saveSession(sessionId, {
                            creds,
                            keys: sessionData?.keys || {},
                            timestamp: Date.now()
                        });
                    }
                };
            }
            
            // Return existing session
            return {
                state: {
                    creds: sessionData.creds,
                    keys: sessionData.keys || {}
                },
                saveCreds: async (creds) => {
                    await this.saveSession(sessionId, {
                        creds,
                        keys: sessionData.keys || {},
                        timestamp: Date.now()
                    });
                }
            };
            
        } catch (error) {
            logger.error('Failed to get auth state:', error);
            throw error;
        }
    }
    
    /**
     * Save auth credentials
     */
    async saveAuthState(sessionId, authState) {
        try {
            return await this.saveSession(sessionId, {
                creds: authState.creds,
                keys: authState.keys,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Failed to save auth state:', error);
            return false;
        }
    }
    
    /**
     * Create QR linking session (for web scanner)
     */
    async createQRSession(sessionId) {
        try {
            const query = `
                INSERT INTO whatsapp_sessions (session_id, session_data, is_active)
                VALUES ($1, $2, false)
                ON CONFLICT (session_id) 
                DO UPDATE SET 
                    session_data = $2,
                    updated_at = CURRENT_TIMESTAMP,
                    is_active = false
            `;
            
            const initialData = {
                status: 'qr_pending',
                created_at: Date.now(),
                qr_scanned: false
            };
            
            await this.pool.query(query, [sessionId, JSON.stringify(initialData)]);
            logger.info(`📱 QR session created: ${sessionId}`);
            
            return true;
        } catch (error) {
            logger.error('Failed to create QR session:', error);
            return false;
        }
    }
    
    /**
     * Mark session as QR scanned
     */
    async markQRScanned(sessionId, authData) {
        try {
            const sessionData = {
                status: 'connected',
                creds: authData.creds,
                keys: authData.keys,
                qr_scanned: true,
                connected_at: Date.now()
            };
            
            const query = `
                UPDATE whatsapp_sessions 
                SET session_data = $2, is_active = true, updated_at = CURRENT_TIMESTAMP
                WHERE session_id = $1
            `;
            
            await this.pool.query(query, [sessionId, JSON.stringify(sessionData)]);
            logger.info(`✅ QR scanned for session: ${sessionId}`);
            
            return true;
        } catch (error) {
            logger.error('Failed to mark QR as scanned:', error);
            return false;
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