const { Client, logger } = require('./lib/client')
const config = require('./config')
const fs = require('fs-extra')
const path = require('path')
const readline = require('readline')

// ANSI color codes for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

class MatdevBot {
    constructor() {
        this.sessionsDir = path.join(__dirname, 'sessions');
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async start() {
        try {
            console.log(`${colors.cyan}${colors.bright}`);
            console.log('╔══════════════════════════════════════════════╗');
            console.log('║                 MATDEV Bot                   ║');
            console.log('║           Levanter Architecture              ║');
            console.log('╚══════════════════════════════════════════════╝');
            console.log(`${colors.reset}\n`);

            // Check if session is already configured
            if (config.WHATSAPP_SESSION_ID && await this.sessionExists(config.WHATSAPP_SESSION_ID)) {
                logger.info(`Using existing session: ${config.WHATSAPP_SESSION_ID}`);
                await this.startBot();
                return;
            }

            // Setup session management
            await this.setupDirectories();
            await this.sessionManagement();

        } catch (error) {
            logger.error('Failed to start bot:', error);
            process.exit(1);
        }
    }

    async setupDirectories() {
        const dirs = [
            this.sessionsDir,
            config.DOWNLOAD_DIR,
            config.PLUGIN_DIR,
            config.EPLUGIN_DIR,
            path.join(__dirname, 'data'),
            path.join(__dirname, 'data/media'),
            path.join(__dirname, 'temp')
        ];

        for (const dir of dirs) {
            try {
                await fs.ensureDir(dir);
                console.log(`${colors.green}✅ Directory ready: ${path.relative(process.cwd(), dir)}${colors.reset}`);
            } catch (error) {
                console.log(`${colors.cyan}📁 Created directory: ${path.relative(process.cwd(), dir)}${colors.reset}`);
            }
        }
        console.log();
    }

    async sessionManagement() {
        console.log(`${colors.blue}${colors.bright}Session Management${colors.reset}`);
        console.log('─'.repeat(50));
        
        // Check for existing sessions
        const sessions = await this.getAvailableSessions();
        
        if (sessions.length === 0) {
            console.log(`${colors.yellow}No existing sessions found. Creating new session...${colors.reset}`);
            await this.createNewSession();
        } else if (sessions.length === 1) {
            // Auto-select the only available session
            console.log(`${colors.green}Found existing session: ${sessions[0].id}${colors.reset}`);
            console.log(`${colors.cyan}🚀 Auto-selecting session...${colors.reset}`);
            await this.startSession(sessions[0]);
        } else {
            // Multiple sessions - let user choose
            console.log(`${colors.green}Found ${sessions.length} existing session(s)${colors.reset}`);
            await this.selectSession(sessions);
        }
    }

    async getAvailableSessions() {
        try {
            const registryPath = path.join(this.sessionsDir, 'session_registry.json');
            
            try {
                const registryData = await fs.readJSON(registryPath);
                return registryData.sessions || [];
            } catch {
                return [];
            }
        } catch (error) {
            console.warn(`${colors.yellow}Warning: Could not read session registry${colors.reset}`);
            return [];
        }
    }

    async sessionExists(sessionId) {
        const sessionDir = path.join(this.sessionsDir, sessionId);
        const authDir = path.join(sessionDir, 'auth');
        return await fs.pathExists(authDir);
    }

    async createNewSession() {
        const sessionId = await this.promptUser('Enter session name (or press Enter for auto-generated): ');
        const finalSessionId = sessionId.trim() || `session_${Date.now()}`;
        
        // Ask for authentication method
        console.log(`\n${colors.blue}Authentication Methods:${colors.reset}`);
        console.log(`${colors.cyan}1.${colors.reset} QR Code (scan with your phone)`);
        console.log(`${colors.cyan}2.${colors.reset} 8-digit pairing code (link to existing WhatsApp)\n`);
        
        const authMethod = await this.promptUser('Select authentication method (1 or 2): ');
        
        let phoneNumber = null;
        if (authMethod === '1') {
            console.log(`${colors.green}QR Code authentication selected.${colors.reset}`);
            console.log(`${colors.yellow}A QR code will be displayed for you to scan with WhatsApp.${colors.reset}\n`);
        } else if (authMethod === '2') {
            console.log(`${colors.green}8-digit pairing code authentication selected.${colors.reset}`);
            phoneNumber = await this.promptUser('Enter your phone number (with country code, e.g., +2347046040727): ');
            
            // Clean and validate phone number
            const cleanedPhone = this.cleanPhoneNumber(phoneNumber);
            if (!cleanedPhone) {
                console.error(`${colors.red}Invalid phone number format. Please include country code.${colors.reset}`);
                process.exit(1);
            }
            phoneNumber = cleanedPhone;
            console.log(`${colors.green}Phone number: ${phoneNumber}${colors.reset}\n`);
        } else {
            console.error(`${colors.red}Invalid authentication method selected.${colors.reset}`);
            process.exit(1);
        }

        await this.initializeSession(finalSessionId, phoneNumber, authMethod);
    }

    async selectSession(sessions) {
        console.log(`${colors.blue}Available Sessions:${colors.reset}`);
        sessions.forEach((session, index) => {
            console.log(`${colors.cyan}${index + 1}.${colors.reset} ${session.id} (Owner: ${session.ownerJid || 'Not authenticated'})`);
        });
        console.log(`${colors.cyan}${sessions.length + 1}.${colors.reset} Create new session\n`);

        const choice = await this.promptUser('Select session (enter number): ');
        const sessionIndex = parseInt(choice) - 1;

        if (sessionIndex === sessions.length) {
            await this.createNewSession();
        } else if (sessionIndex >= 0 && sessionIndex < sessions.length) {
            await this.startSession(sessions[sessionIndex]);
        } else {
            console.error(`${colors.red}Invalid selection${colors.reset}`);
            process.exit(1);
        }
    }

    async initializeSession(sessionId, phoneNumber, authMethod) {
        console.log(`${colors.blue}${colors.bright}Session Initialization${colors.reset}`);
        console.log('─'.repeat(50));
        
        const sessionDir = path.join(this.sessionsDir, sessionId);
        
        try {
            await fs.ensureDir(sessionDir);
            await fs.ensureDir(path.join(sessionDir, 'auth'));

            // Create session config
            const sessionConfig = {
                id: sessionId,
                phoneNumber: phoneNumber,
                ownerJid: null,
                authMethod: authMethod,
                authStatus: 'pending',
                createdAt: new Date().toISOString(),
                lastActive: new Date().toISOString()
            };

            await fs.writeJSON(
                path.join(sessionDir, 'config.json'),
                sessionConfig,
                { spaces: 2 }
            );

            // Update session registry
            await this.updateSessionRegistry(sessionConfig);

            console.log(`${colors.green}✅ Session '${sessionId}' created successfully!${colors.reset}`);
            await this.startSession(sessionConfig);

        } catch (error) {
            console.error(`${colors.red}❌ Error creating session:${colors.reset}`, error.message);
            process.exit(1);
        }
    }

    async updateSessionRegistry(sessionConfig) {
        const registryPath = path.join(this.sessionsDir, 'session_registry.json');
        
        let registry = { sessions: [] };
        
        try {
            registry = await fs.readJSON(registryPath);
        } catch {
            // Registry doesn't exist, will create new one
        }

        // Add or update session
        const existingIndex = registry.sessions.findIndex(s => s.id === sessionConfig.id);
        if (existingIndex >= 0) {
            registry.sessions[existingIndex] = sessionConfig;
        } else {
            registry.sessions.push(sessionConfig);
        }

        await fs.writeJSON(registryPath, registry, { spaces: 2 });
    }

    async startSession(sessionConfig) {
        console.log(`${colors.blue}${colors.bright}Bot Launch${colors.reset}`);
        console.log('─'.repeat(50));
        
        console.log(`${colors.green}🚀 Starting session: ${sessionConfig.id}${colors.reset}`);
        
        if (sessionConfig.ownerJid) {
            console.log(`${colors.blue}📱 Owner JID: ${sessionConfig.ownerJid}${colors.reset}`);
        } else {
            if (sessionConfig.phoneNumber) {
                console.log(`${colors.blue}📱 Phone Number: ${sessionConfig.phoneNumber}${colors.reset}`);
            }
            console.log(`${colors.yellow}⚠️  JID will be detected after authentication${colors.reset}`);
        }
        
        console.log(`${colors.blue}🔐 Auth Method: ${sessionConfig.authMethod === '1' ? 'QR Code' : '8-digit Pairing Code'}${colors.reset}`);

        // Set environment variables for the session
        process.env.WHATSAPP_SESSION_ID = sessionConfig.id;
        process.env.PHONE_NUMBER = sessionConfig.phoneNumber || '';
        process.env.OWNER_JID = sessionConfig.ownerJid || '';
        process.env.AUTH_METHOD = sessionConfig.authMethod;
        process.env.SESSION_DIR = this.sessionsDir;

        console.log(`${colors.cyan}🔧 Environment variables configured${colors.reset}`);
        console.log(`${colors.cyan}📂 Session directory: ${path.relative(process.cwd(), path.join(this.sessionsDir, sessionConfig.id))}${colors.reset}\n`);

        // Close readline interface before starting bot
        this.rl.close();
        
        // Start the bot
        await this.startBot();
    }

    async startBot() {
        try {
            // Ensure required directories exist
            await fs.ensureDir(config.SESSION_DIR);
            await fs.ensureDir(config.DOWNLOAD_DIR);
            await fs.ensureDir(config.PLUGIN_DIR);
            await fs.ensureDir(config.EPLUGIN_DIR);
            
            // Start the bot
            const bot = new Client();
            await bot.connect();
            
        } catch (error) {
            logger.error('Failed to start bot:', error);
            process.exit(1);
        }
    }

    cleanPhoneNumber(phoneNumber) {
        if (!phoneNumber) return null;
        
        // Remove all non-digit characters except +
        let cleaned = phoneNumber.replace(/[^\d+]/g, '');
        
        // Remove leading + if present
        if (cleaned.startsWith('+')) {
            cleaned = cleaned.substring(1);
        }
        
        // Validate: should be 10-15 digits
        if (!/^\d{10,15}$/.test(cleaned)) {
            return null;
        }
        
        return cleaned;
    }

    async promptUser(question) {
        return new Promise((resolve) => {
            this.rl.question(`${colors.yellow}${question}${colors.reset}`, (answer) => {
                resolve(answer);
            });
        });
    }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log(`\n${colors.yellow}MATDEV bot shutting down...${colors.reset}`);
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log(`\n${colors.yellow}MATDEV bot terminated${colors.reset}`);
    process.exit(0);
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error(`${colors.red}Uncaught Exception:${colors.reset}`, error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`${colors.red}Unhandled Rejection:${colors.reset}`, reason);
    process.exit(1);
});

// Start the application
if (require.main === module) {
    const matdevBot = new MatdevBot();
    matdevBot.start().catch((error) => {
        console.error(`${colors.red}Failed to launch MATDEV bot:${colors.reset}`, error);
        process.exit(1);
    });
}