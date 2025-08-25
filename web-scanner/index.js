/**
 * MatDev WhatsApp QR Scanner - Web Interface
 * Hosted separately for session creation and QR scanning
 */

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
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

// Database connection optimized for Vercel
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 5, // Reduced for serverless
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000, // Increased timeout
    allowExitOnIdle: true // Important for serverless
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

// Customizable welcome message template
const WELCOME_MESSAGE = `🎉 *MatDev Bot Connected Successfully!*

✅ Your WhatsApp has been linked to MatDev Bot
🔑 *Session ID:* {{SESSION_ID}}
🤖 *Bot Name:* MatDev Assistant

*What's Next?*
• Copy your Session ID above
• Use it in your bot configuration
• Start enjoying automated WhatsApp features!

_Thank you for using MatDev Bot! 🚀_

---
*Keep your Session ID secure and don't share it with others.*`;

// Send welcome message with session ID
async function sendWelcomeMessage(sock, sessionId, userJid) {
    try {
        const message = WELCOME_MESSAGE.replace('{{SESSION_ID}}', sessionId);
        
        await sock.sendMessage(userJid, { 
            text: message 
        });
        
        console.log(`📧 Welcome message sent to: ${userJid}`);
        return true;
    } catch (error) {
        console.error('Failed to send welcome message:', error);
        return false;
    }
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
            const rawData = JSON.parse(result.rows[0].session_data);
            // Deserialize Buffers using BufferJSON
            return {
                creds: JSON.parse(JSON.stringify(rawData.creds), BufferJSON.reviver),
                keys: JSON.parse(JSON.stringify(rawData.keys), BufferJSON.reviver)
            };
        }
        return null;
    } catch (error) {
        console.error('Failed to load session:', error);
        return null;
    }
}

// Create database-backed auth state (Vercel compatible - no filesystem)
async function createDatabaseAuthState(sessionId) {
    // Check if session already exists in database
    let savedData = await loadSession(sessionId);
    
    // Initialize auth state for Baileys
    let authState;
    
    if (savedData && savedData.creds && savedData.keys) {
        // Use existing session data
        authState = {
            creds: savedData.creds,
            keys: savedData.keys
        };
    } else {
        // Initialize fresh auth state using Baileys' initAuthCreds
        const freshCreds = initAuthCreds();
        authState = {
            creds: freshCreds,
            keys: {
                preKeys: {},
                sessions: {},
                senderKeys: {},
                appStateSyncKeys: {},
                appStateVersions: {},
                senderKeyMemory: {}
            }
        };
    }
    
    const saveCreds = async () => {
        try {
            // Use BufferJSON to properly serialize Buffers for database storage
            const serializedData = {
                creds: JSON.parse(JSON.stringify(authState.creds, BufferJSON.replacer)),
                keys: JSON.parse(JSON.stringify(authState.keys, BufferJSON.replacer))
            };
            await saveSession(sessionId, serializedData);
        } catch (error) {
            console.error(`Failed to save credentials for ${sessionId}:`, error);
        }
    };
    
    return {
        state: authState,
        saveCreds
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
            
            // Use database-only auth state (Vercel compatible - no file system)
            const { state, saveCreds } = await createDatabaseAuthState(sessionId);
            const { version } = await fetchLatestBaileysVersion();
            
            const sock = makeWASocket({
                version,
                auth: state,
                printQRInTerminal: false,
                browser: ['MatDev Scanner', 'Chrome', '91.0'],
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                markOnlineOnConnect: false
            });
            
            // Track active session
            activeSessions.set(sessionId, sock);
            
            // Set session timeout (5 minutes)
            const sessionTimeout = setTimeout(() => {
                console.log(`⏰ Session timeout: ${sessionId}`);
                
                try {
                    sock.end();
                } catch (error) {
                    console.error(`Error ending timed out session ${sessionId}:`, error);
                }
                
                activeSessions.delete(sessionId);
                
                socket.emit('session-error', {
                    sessionId,
                    message: 'Session timed out. Please try again.',
                    error: 'Timeout'
                });
            }, 5 * 60 * 1000); // 5 minutes
            
            // Clear timeout on successful connection or cleanup
            const originalEnd = sock.end;
            sock.end = function() {
                clearTimeout(sessionTimeout);
                return originalEnd.apply(this, arguments);
            };
            
            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                
                if (qr) {
                    console.log(`📱 QR generated for: ${sessionId}`);
                    
                    try {
                        // Generate QR code as data URL
                        const qrDataURL = await QRCode.toDataURL(qr);
                        
                        socket.emit('qr-code', {
                            sessionId,
                            qr: qrDataURL,
                            message: 'Scan this QR code with WhatsApp'
                        });
                    } catch (qrError) {
                        console.error(`Failed to generate QR for ${sessionId}:`, qrError);
                        socket.emit('session-error', {
                            sessionId,
                            message: 'Failed to generate QR code',
                            error: qrError.message
                        });
                    }
                }
                
                if (connection === 'open') {
                    console.log(`✅ Session connected: ${sessionId}`);
                    
                    try {
                        // Get user's WhatsApp JID
                        const userJid = state.creds?.me?.id;
                        
                        if (userJid) {
                            // Send welcome message with session ID
                            await sendWelcomeMessage(sock, sessionId, userJid);
                        }
                        
                        // Save final session to database
                        const saved = await saveSession(sessionId, state);
                        
                        if (saved) {
                            socket.emit('session-connected', {
                                sessionId,
                                message: 'WhatsApp connected successfully! Check your WhatsApp for session details.',
                                success: true,
                                userJid: userJid
                            });
                        } else {
                            socket.emit('session-error', {
                                sessionId,
                                message: 'Failed to save session',
                                error: 'Database error'
                            });
                        }
                    } catch (saveError) {
                        console.error(`Failed to save session ${sessionId}:`, saveError);
                        socket.emit('session-error', {
                            sessionId,
                            message: 'Failed to save session data',
                            error: saveError.message
                        });
                    }
                    
                    // Clean up with delay to allow message sending
                    setTimeout(() => {
                        try {
                            sock.end();
                        } catch (endError) {
                            console.error(`Error ending socket for ${sessionId}:`, endError);
                        }
                        activeSessions.delete(sessionId);
                    }, 3000); // 3 second delay
                }
                
                if (connection === 'close') {
                    console.log(`🔌 Session closed: ${sessionId}`);
                    
                    // Check if this was after successful pairing (stream restart scenario)
                    if (state.creds?.me?.id) {
                        console.log(`✅ Pairing completed successfully: ${sessionId}`);
                        
                        try {
                            // Save session data
                            const saved = await saveSession(sessionId, state);
                            
                            if (saved) {
                                socket.emit('session-connected', {
                                    sessionId,
                                    message: 'WhatsApp paired successfully! Session saved. Check your WhatsApp for session details.',
                                    success: true,
                                    userJid: state.creds.me.id
                                });
                            }
                        } catch (error) {
                            console.error(`Failed to save pairing session ${sessionId}:`, error);
                        }
                        
                        // Clean up
                        activeSessions.delete(sessionId);
                        return;
                    }
                    
                    // Clean up on close
                    activeSessions.delete(sessionId);
                    
                    const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    
                    // Handle specific error codes
                    if (statusCode === DisconnectReason.badSession) {
                        socket.emit('session-error', {
                            sessionId,
                            message: 'Bad session - please generate a new session',
                            error: 'Bad session'
                        });
                    } else if (statusCode === DisconnectReason.loggedOut) {
                        socket.emit('session-error', {
                            sessionId,
                            message: 'Session logged out',
                            error: 'Logged out'
                        });
                    } else if (lastDisconnect?.error && !shouldReconnect) {
                        // Only emit error if not a normal restart scenario
                        socket.emit('session-error', {
                            sessionId,
                            message: `Connection failed: ${lastDisconnect.error.message}`,
                            error: lastDisconnect.error.message
                        });
                    }
                }
            });
            
            sock.ev.on('creds.update', saveCreds);
            
        } catch (error) {
            console.error(`Failed to start session ${sessionId}:`, error);
            
            // Clean up on error
            activeSessions.delete(sessionId);
            
            socket.emit('session-error', {
                sessionId,
                message: 'Failed to start session',
                error: error.message
            });
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

// For Vercel deployment
if (process.env.VERCEL) {
    // Export for Vercel serverless functions
    module.exports = server;
} else {
    // Local development server
    initDB().then(() => {
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`🌐 MatDev WhatsApp Scanner running on port ${PORT}`);
            console.log(`📱 Visit: http://0.0.0.0:${PORT}`);
        });
    }).catch(error => {
        console.error('Failed to start scanner:', error);
        process.exit(1);
    });
}

// Initialize database for both environments
initDB().catch(error => {
    console.error('Failed to initialize database:', error);
});