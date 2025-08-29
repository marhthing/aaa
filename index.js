#!/usr/bin/env node

/**
 * MATDEV Bot - Unified Entry Point
 * Streamlined startup process with stage-by-stage execution
 */

const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

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

class MatdevBotLauncher {
    constructor() {
        this.packageJsonPath = path.join(process.cwd(), 'package.json');
        this.nodeModulesPath = path.join(process.cwd(), 'node_modules');
        this.sessionsDir = path.join(__dirname, 'sessions');
        this.dataDir = path.join(__dirname, 'data');
        this.configDir = path.join(__dirname, 'config');
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async launch() {
        try {
            console.log(`${colors.cyan}${colors.bright}`);
            console.log('╔══════════════════════════════════════════════╗');
            console.log('║                 MATDEV Bot                   ║');
            console.log('║           Unified Launcher v2.0              ║');
            console.log('╚══════════════════════════════════════════════╝');
            console.log(`${colors.reset}\n`);

            // Stage 1: Package Management
            await this.stage1_PackageManagement();
            
            // Stage 2: Directory Setup
            await this.stage2_DirectorySetup();
            
            // Stage 3: Session Management
            await this.stage3_SessionManagement();

        } catch (error) {
            console.error(`${colors.red}Launch failed:${colors.reset}`, error.message);
            process.exit(1);
        }
    }

    async stage1_PackageManagement() {
        console.log(`${colors.blue}${colors.bright}Stage 1: Package Management${colors.reset}`);
        console.log('─'.repeat(50));
        
        try {
            // Check if package.json exists
            const packageExists = await this.fileExists(this.packageJsonPath);
            if (!packageExists) {
                console.log(`${colors.red}❌ package.json not found${colors.reset}`);
                throw new Error('package.json is required');
            }

            // Check if node_modules exists
            const nodeModulesExists = await this.fileExists(this.nodeModulesPath);
            
            if (!nodeModulesExists) {
                console.log(`${colors.yellow}📦 Installing packages...${colors.reset}`);
                await this.runCommand('npm', ['install']);
                console.log(`${colors.green}✅ Packages installed successfully${colors.reset}`);
            } else {
                console.log(`${colors.yellow}🔍 Checking package dependencies...${colors.reset}`);
                const outdated = await this.checkOutdatedPackages();
                if (outdated.length > 0) {
                    console.log(`${colors.yellow}📦 Updating outdated packages...${colors.reset}`);
                    await this.runCommand('npm', ['update']);
                    console.log(`${colors.green}✅ Packages updated successfully${colors.reset}`);
                } else {
                    console.log(`${colors.green}✅ All packages are up to date${colors.reset}`);
                }
            }
        } catch (error) {
            console.error(`${colors.red}❌ Package management failed:${colors.reset}`, error.message);
            throw error;
        }
        
        console.log();
    }

    async stage2_DirectorySetup() {
        console.log(`${colors.blue}${colors.bright}Stage 2: Directory Setup${colors.reset}`);
        console.log('─'.repeat(50));
        
        const dirs = [
            this.sessionsDir,
            this.dataDir,
            this.configDir,
            path.join(this.dataDir, 'messages'),
            path.join(this.dataDir, 'media'),
            path.join(this.dataDir, 'plugins'),
            path.join(this.dataDir, 'system')
        ];

        for (const dir of dirs) {
            try {
                await fs.access(dir);
                console.log(`${colors.green}✅ Directory exists: ${path.relative(process.cwd(), dir)}${colors.reset}`);
            } catch {
                await fs.mkdir(dir, { recursive: true });
                console.log(`${colors.cyan}📁 Created directory: ${path.relative(process.cwd(), dir)}${colors.reset}`);
            }
        }
        
        console.log();
    }

    async stage3_SessionManagement() {
        console.log(`${colors.blue}${colors.bright}Stage 3: WhatsApp Session Management${colors.reset}`);
        console.log('─'.repeat(50));
        
        // Check for existing sessions
        const sessions = await this.getAvailableSessions();
        
        if (sessions.length === 0) {
            console.log(`${colors.yellow}No existing sessions found. Creating new session...${colors.reset}`);
            await this.createNewSession();
        } else if (sessions.length === 1) {
            // Auto-select the only available session for seamless restarts
            console.log(`${colors.green}Found existing session: ${sessions[0].id}${colors.reset}`);
            console.log(`${colors.cyan}🚀 Auto-selecting session for seamless restart...${colors.reset}`);
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
                const registryData = await fs.readFile(registryPath, 'utf8');
                const registry = JSON.parse(registryData);
                return registry.sessions || [];
            } catch {
                return [];
            }
        } catch (error) {
            console.warn(`${colors.yellow}Warning: Could not read session registry${colors.reset}`);
            return [];
        }
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
        console.log(`${colors.blue}${colors.bright}Stage 4: Session Initialization${colors.reset}`);
        console.log('─'.repeat(50));
        
        const sessionDir = path.join(this.sessionsDir, sessionId);
        
        try {
            await fs.mkdir(sessionDir, { recursive: true });
            await fs.mkdir(path.join(sessionDir, 'auth'), { recursive: true });

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

            await fs.writeFile(
                path.join(sessionDir, 'config.json'),
                JSON.stringify(sessionConfig, null, 2)
            );

            // Create metadata
            const metadata = {
                SESSION_ID: sessionId,
                PHONE_NUMBER: phoneNumber,
                OWNER_JID: null,
                AUTH_METHOD: authMethod,
                version: '1.0.0'
            };

            await fs.writeFile(
                path.join(sessionDir, 'metadata.json'),
                JSON.stringify(metadata, null, 2)
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
            const registryData = await fs.readFile(registryPath, 'utf8');
            registry = JSON.parse(registryData);
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

        await fs.writeFile(registryPath, JSON.stringify(registry, null, 2));
    }

    async startSession(sessionConfig) {
        console.log(`${colors.blue}${colors.bright}Stage 5: Bot Launch${colors.reset}`);
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
        process.env.SESSION_DIR = path.join(this.sessionsDir, sessionConfig.id);

        console.log(`${colors.cyan}🔧 Environment variables configured${colors.reset}`);
        console.log(`${colors.cyan}📂 Session directory: ${path.relative(process.cwd(), process.env.SESSION_DIR)}${colors.reset}\n`);

        // Check if src/index.js exists and start the bot
        const mainFile = path.join(process.cwd(), 'src', 'index.js');
        
        try {
            await fs.access(mainFile);
            console.log(`${colors.green}✅ Found main bot application at src/index.js${colors.reset}`);
            console.log(`${colors.cyan}🚀 Launching MATDEV bot...${colors.reset}`);
            console.log(`${colors.yellow}📱 The bot will authenticate and connect to WhatsApp${colors.reset}\n`);
            
            // Close readline interface before requiring the main app
            this.rl.close();
            
            // Require and start the main bot application
            require(mainFile);
            
        } catch (error) {
            console.log(`${colors.red}❌ Main bot application not found at src/index.js${colors.reset}`);
            console.log(`${colors.blue}ℹ️  Session initialized successfully. Ready for bot implementation.${colors.reset}\n`);
            
            // Show session info
            console.log(`${colors.bright}Session Information:${colors.reset}`);
            console.log(`- Session ID: ${sessionConfig.id}`);
            console.log(`- Phone Number: ${sessionConfig.phoneNumber || 'Not set'}`);
            console.log(`- Auth Method: ${sessionConfig.authMethod === '1' ? 'QR Code' : '8-digit Pairing Code'}`);
            console.log(`- Session Directory: ${path.relative(process.cwd(), path.join(this.sessionsDir, sessionConfig.id))}`);
            console.log(`- Environment variables configured for bot initialization\n`);
            
            console.log(`${colors.cyan}${colors.bright}Next Steps:${colors.reset}`);
            console.log(`1. Implement WhatsApp authentication in src/index.js`);
            console.log(`2. Use the configured auth method: ${sessionConfig.authMethod === '1' ? 'QR Code' : '8-digit Pairing Code'}`);
            console.log(`3. After successful auth, the actual JID will be auto-detected`);
            console.log(`4. Bot will then operate using your WhatsApp account\n`);
            
            this.rl.close();
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

    // Utility methods from setup.js
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async checkOutdatedPackages() {
        try {
            const result = await this.runCommand('npm', ['outdated', '--json'], { capture: true });
            const outdated = JSON.parse(result.stdout || '{}');
            return Object.keys(outdated);
        } catch {
            return [];
        }
    }

    async runCommand(command, args, options = {}) {
        return new Promise((resolve, reject) => {
            const process = spawn(command, args, {
                stdio: options.capture ? 'pipe' : 'inherit',
                shell: true
            });

            let stdout = '';
            let stderr = '';

            if (options.capture) {
                process.stdout.on('data', (data) => {
                    stdout += data.toString();
                });

                process.stderr.on('data', (data) => {
                    stderr += data.toString();
                });
            }

            process.on('close', (code) => {
                if (code === 0) {
                    resolve({ stdout, stderr });
                } else {
                    reject(new Error(`Command failed with exit code ${code}`));
                }
            });

            process.on('error', reject);
        });
    }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log(`\n${colors.yellow}MATDEV bot launcher interrupted${colors.reset}`);
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log(`\n${colors.yellow}MATDEV bot launcher terminated${colors.reset}`);
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
    const launcher = new MatdevBotLauncher();
    launcher.launch().catch((error) => {
        console.error(`${colors.red}Failed to launch MATDEV bot:${colors.reset}`, error);
        process.exit(1);
    });
}

module.exports = MatdevBotLauncher;