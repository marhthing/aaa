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
    connectionTimeoutMs: 10000, // Increased timeout
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
👤 *Your WhatsApp ID:* {{USER_JID}}
🤖 *Bot Name:* MatDev Assistant
⏰ *Connected at:* {{TIMESTAMP}}

*What's Next?*
• Copy your Session ID above
• Use it in your bot configuration  
• Start enjoying automated WhatsApp features!

*Important Notes:*
• Keep your Session ID secure and private
• Don't share it with unauthorized users
• Your session is now saved and ready to use

_Thank you for using MatDev Bot! 🚀_

---
*This is an automated confirmation message.*`;

// Send welcome message with session ID
async function sendWelcomeMessage(sock, sessionId, userJid) {
    try {
        const timestamp = new Date().toLocaleString();
        const message = WELCOME_MESSAGE
            .replace('{{SESSION_ID}}', sessionId)
            .replace('{{USER_JID}}', userJid)
            .replace('{{TIMESTAMP}}', timestamp);
        
        // Wait a bit to ensure connection is stable before sending message
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        await sock.sendMessage(userJid, { 
            text: message 
        });
        
        console.log(`📧 Welcome message sent successfully to: ${userJid} for session: ${sessionId}`);
        return true;
    } catch (error) {
        console.error(`Failed to send welcome message to ${userJid}:`, error);
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
        
        // Ensure proper serialization - authState should already be processed by BufferJSON.replacer
        const sessionData = typeof authState === 'string' ? authState : JSON.stringify(authState);
        
        await pool.query(query, [sessionId, sessionData]);
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
            let rawData = result.rows[0].session_data;
            
            // Handle different data formats
            if (typeof rawData === 'string') {
                try {
                    rawData = JSON.parse(rawData);
                } catch (parseError) {
                    console.error(`Failed to parse session data for ${sessionId}:`, parseError);
                    return null;
                }
            }
            
            // Ensure we have the expected structure
            if (!rawData || !rawData.creds || !rawData.keys) {
                console.error(`Invalid session data structure for ${sessionId}`);
                return null;
            }
            
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
            await saveSession(sessionId, JSON.stringify(serializedData));
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
                markOnlineOnConnect: false,
                getMessage: async () => undefined, // Ignore message history
                shouldIgnoreJid: () => false,
                retryRequestDelayMs: 250,
                maxMsgRetryCount: 3,
                fireInitQueries: false, // Important: prevents unnecessary queries
                emitOwnEvents: false
            });
            
            // Track active session
            activeSessions.set(sessionId, {
                socket: sock,
                clientSocket: socket,
                isConnected: false,
                hasReceivedNotifications: false,
                sessionCompleted: false
            });
            
            // Set session timeout (20 minutes for mobile compatibility)
            const sessionTimeout = setTimeout(() => {
                console.log(`⏰ Session timeout: ${sessionId}`);
                
                const session = activeSessions.get(sessionId);
                if (session && !session.sessionCompleted) {
                    try {
                        session.socket.end();
                    } catch (error) {
                        console.error(`Error ending timed out session ${sessionId}:`, error);
                    }
                    
                    activeSessions.delete(sessionId);
                    
                    socket.emit('session-error', {
                        sessionId,
                        message: 'Session timed out. Please try again.',
                        error: 'Timeout'
                    });
                }
            }, 20 * 60 * 1000); // 20 minutes
            
            // Clear timeout on successful connection or cleanup
            const originalEnd = sock.end;
            sock.end = function() {
                clearTimeout(sessionTimeout);
                return originalEnd.apply(this, arguments);
            };
            
            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr, receivedPendingNotifications } = update;
                const session = activeSessions.get(sessionId);
                
                if (!session || session.sessionCompleted) return;
                
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
                    console.log(`✅ Connection opened for: ${sessionId}`);
                    session.isConnected = true;
                    
                    // Don't mark as complete yet - wait for receivedPendingNotifications
                    socket.emit('qr-code', {
                        sessionId,
                        message: 'WhatsApp connected! Finalizing authentication...'
                    });
                }
                
                // Wait for full authentication cycle - connection open + notifications + stable connection
                if (connection === 'open' && !session.sessionCompleted) {
                    console.log(`🔗 Connection established for: ${sessionId}, waiting for full sync...`);
                    session.isConnected = true;
                    
                    // Wait much longer for mobile WhatsApp to complete its sync (increased to 45s for mobile compatibility)
                    setTimeout(async () => {
                        const currentSession = activeSessions.get(sessionId);
                        if (currentSession && !currentSession.sessionCompleted && currentSession.isConnected) {
                            console.log(`🔐 Authentication stable, completing session: ${sessionId}`);
                            currentSession.sessionCompleted = true;
                    
                    try {
                                // Get user's WhatsApp JID
                                const userJid = state.creds?.me?.id;
                                
                                // Save final session to database
                                const serializedData = {
                                    creds: JSON.parse(JSON.stringify(state.creds, BufferJSON.replacer)),
                                    keys: JSON.parse(JSON.stringify(state.keys, BufferJSON.replacer))
                                };
                                const saved = await saveSession(sessionId, JSON.stringify(serializedData));
                                
                                if (saved) {
                                    // Send welcome message to user's WhatsApp
                                    console.log(`📧 Sending welcome message to: ${userJid}`);
                                    const messageSent = await sendWelcomeMessage(sock, sessionId, userJid);
                                    
                                    socket.emit('session-connected', {
                                        sessionId,
                                        message: `WhatsApp fully connected and authenticated! ${messageSent ? 'Welcome message sent.' : 'Session ready.'} Session saved and ready for bot use.`,
                                        success: true,
                                        userJid: userJid,
                                        welcomeMessageSent: messageSent
                                    });
                                    
                                    console.log(`✅ Session fully ready: ${sessionId} - Welcome message ${messageSent ? 'sent' : 'failed'}`);
                                    
                                    // Keep connection alive longer to ensure message is delivered and mobile WhatsApp completes
                                    setTimeout(() => {
                                        try {
                                            sock.end();
                                        } catch (endError) {
                                            console.error(`Error ending socket for ${sessionId}:`, endError);
                                        }
                                        activeSessions.delete(sessionId);
                                        console.log(`🧹 Cleaned up completed session: ${sessionId}`);
                                    }, 30000); // Wait 30 seconds for message delivery and cleanup
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
                        }
                    }, 45000); // Wait 45 seconds for mobile WhatsApp to complete pairing
                }
                
                if (connection === 'close') {
                    const lastError = lastDisconnect?.error;
                    const statusCode = lastError?.output?.statusCode;
                    
                    console.log(`🔌 Connection closed for: ${sessionId}, Status: ${statusCode}, Session completed: ${session?.sessionCompleted}`);
                    
                    // Don't handle as error if session was already completed successfully
                    if (session?.sessionCompleted) {
                        console.log(`✅ Normal close after successful completion: ${sessionId}`);
                        return;
                    }
                    
                    // Handle different disconnect scenarios
                    if (statusCode === DisconnectReason.loggedOut) {
                        socket.emit('session-error', {
                            sessionId,
                            message: 'Session logged out - please scan QR code again',
                            error: 'Logged out'
                        });
                    } else if (statusCode === DisconnectReason.badSession) {
                        socket.emit('session-error', {
                            sessionId,
                            message: 'Bad session - please generate a new session',
                            error: 'Bad session'
                        });
                    } else if (statusCode === DisconnectReason.timedOut) {
                        socket.emit('session-error', {
                            sessionId,
                            message: 'Connection timed out - please try again',
                            error: 'Timeout'
                        });
                    } else if (statusCode === 515) {
                        // Stream error - this happens during authentication, usually normal
                        if (state.creds?.me?.id && !session?.sessionCompleted) {
                            console.log(`⚠️ Stream error (515) during authentication for: ${sessionId} - checking if session was saved...`);
                            
                            // Check if we already saved the session successfully
                            const savedSession = await loadSession(sessionId);
                            if (savedSession && savedSession.creds?.me?.id) {
                                console.log(`✅ Session was saved successfully despite stream error: ${sessionId}`);
                                
                                socket.emit('session-connected', {
                                    sessionId,
                                    message: 'WhatsApp connected successfully! Session saved and ready for bot use.',
                                    success: true,
                                    userJid: state.creds.me.id,
                                    welcomeMessageSent: false
                                });
                                
                                activeSessions.delete(sessionId);
                                return;
                            }
                            
                            // Wait much longer to see if it recovers for mobile devices
                            setTimeout(() => {
                                if (session && !session.sessionCompleted) {
                                    console.log(`❌ Authentication did not complete within timeout for: ${sessionId}`);
                                    socket.emit('session-error', {
                                        sessionId,
                                        message: 'Authentication incomplete - mobile WhatsApp may need more time. Try scanning again.',
                                        error: 'Authentication timeout'
                                    });
                                    activeSessions.delete(sessionId);
                                }
                            }, 35000); // Much longer timeout for mobile devices
                            return;
                        }
                    } else if (lastError) {
                        socket.emit('session-error', {
                            sessionId,
                            message: `Connection failed: ${lastError.message}`,
                            error: lastError.message
                        });
                    }
                    
                    // Clean up session
                    activeSessions.delete(sessionId);
                }
            });
            
            sock.ev.on('creds.update', saveCreds);
            
            // Handle messages to detect successful connection
            sock.ev.on('messages.upsert', async (m) => {
                const session = activeSessions.get(sessionId);
                if (session && session.isConnected && !session.sessionCompleted) {
                    console.log(`📩 Messages received for: ${sessionId} - connection is stable`);
                }
            });
            
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
        for (const [sessionId, sessionData] of activeSessions.entries()) {
            if (sessionData.clientSocket === socket) {
                try {
                    sessionData.socket.end();
                } catch (error) {
                    console.error(`Error ending socket for disconnected client ${sessionId}:`, error);
                }
                activeSessions.delete(sessionId);
                console.log(`🧹 Cleaned up session for disconnected client: ${sessionId}`);
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