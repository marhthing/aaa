/**
 * MatDev WhatsApp QR Scanner - Web Interface
 * Hosted separately for session creation and QR scanning
 */

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

// Session management for concurrent users
const activeSessions = new Map();
const MAX_CONCURRENT_SESSIONS = 50;

// Database connection with optimized pool for concurrent users
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20, // Maximum pool size
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Initialize database
async function initDB() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS whatsapp_sessions (
            session_id VARCHAR(255) PRIMARY KEY,
            session_data JSONB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT true
        )
    `);
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Generate session ID
function generateSessionId() {
    return 'MATDEV_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Save session to database
async function saveSession(sessionId, authState) {
    try {
        const query = `
            INSERT INTO whatsapp_sessions (session_id, session_data, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (session_id) 
            DO UPDATE SET 
                session_data = $2,
                updated_at = CURRENT_TIMESTAMP,
                is_active = true
        `;
        
        await pool.query(query, [sessionId, JSON.stringify(authState)]);
        console.log(`✅ Session saved: ${sessionId}`);
        
        return true;
    } catch (error) {
        console.error('Failed to save session:', error);
        return false;
    }
}

// Load session from database
async function loadSession(sessionId) {
    try {
        const query = `SELECT session_data FROM whatsapp_sessions WHERE session_id = $1 AND is_active = true`;
        const result = await pool.query(query, [sessionId]);
        
        if (result.rows.length > 0) {
            return JSON.parse(result.rows[0].session_data);
        }
        return null;
    } catch (error) {
        console.error('Failed to load session:', error);
        return null;
    }
}

// Create database-backed auth state
async function createDatabaseAuthState(sessionId) {
    // Check if session already exists in database
    let authState = await loadSession(sessionId);
    
    if (!authState) {
        // Initialize minimal auth state - let Baileys handle the rest
        authState = {
            creds: undefined,
            keys: undefined
        };
    }
    
    return {
        state: authState,
        saveCreds: async () => {
            await saveSession(sessionId, authState);
        }
    };
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/generate-session', (req, res) => {
    const sessionId = generateSessionId();
    res.json({ sessionId });
});

// Socket handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('start-session', async (data) => {
        const { sessionId } = data;
        
        try {
            // Check concurrent session limit
            if (activeSessions.size >= MAX_CONCURRENT_SESSIONS) {
                socket.emit('session-error', {
                    sessionId,
                    message: 'Server is at capacity. Please try again later.',
                    error: 'Too many concurrent sessions'
                });
                return;
            }
            
            console.log(`🔄 Starting session: ${sessionId} (${activeSessions.size + 1}/${MAX_CONCURRENT_SESSIONS})`);
            
            // Use database-backed auth state instead of file system
            const { state, saveCreds } = await createDatabaseAuthState(sessionId);
            const { version } = await fetchLatestBaileysVersion();
            
            const sock = makeWASocket({
                version,
                auth: state,
                printQRInTerminal: false,
                browser: ['MatDev Scanner', 'Chrome', '91.0'],
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 30000
            });
            
            // Track active session
            activeSessions.set(sessionId, sock);
            
            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                
                if (qr) {
                    console.log(`📱 QR generated for: ${sessionId}`);
                    
                    // Generate QR code as data URL
                    const qrDataURL = await QRCode.toDataURL(qr);
                    
                    socket.emit('qr-code', {
                        sessionId,
                        qr: qrDataURL,
                        message: 'Scan this QR code with WhatsApp'
                    });
                }
                
                if (connection === 'open') {
                    console.log(`✅ Session connected: ${sessionId}`);
                    
                    // Save final session to database
                    const saved = await saveSession(sessionId, state);
                    
                    if (saved) {
                        socket.emit('session-connected', {
                            sessionId,
                            message: 'WhatsApp connected successfully! Copy your session ID to use in the bot.',
                            success: true
                        });
                    } else {
                        socket.emit('session-error', {
                            sessionId,
                            message: 'Failed to save session',
                            error: 'Database error'
                        });
                    }
                    
                    // Clean up
                    sock.end();
                    activeSessions.delete(sessionId);
                }
                
                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                    
                    if (!shouldReconnect) {
                        console.log(`❌ Session logged out: ${sessionId}`);
                        socket.emit('session-error', {
                            sessionId,
                            message: 'Session logged out',
                            error: 'Logged out'
                        });
                    }
                }
            });
            
            sock.ev.on('creds.update', saveCreds);
            
        } catch (error) {
            console.error(`Failed to start session ${sessionId}:`, error);
            socket.emit('session-error', {
                sessionId,
                message: 'Failed to start session',
                error: error.message
            });
            activeSessions.delete(sessionId);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        // Clean up any hanging sessions for this socket
        for (const [sessionId, sock] of activeSessions.entries()) {
            if (sock.socketId === socket.id) {
                sock.end();
                activeSessions.delete(sessionId);
                console.log(`🧹 Cleaned up session: ${sessionId}`);
            }
        }
    });
});

// Start server
const PORT = process.env.PORT || 5000;

initDB().then(() => {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`🌐 MatDev WhatsApp Scanner running on port ${PORT}`);
        console.log(`📱 Visit: http://0.0.0.0:${PORT}`);
    });
}).catch(error => {
    console.error('Failed to start scanner:', error);
    process.exit(1);
});