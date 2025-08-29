const fs = require('fs-extra');
const path = require('path');

class SessionManager {
    constructor() {
        this.sessionsPath = path.join(process.cwd(), 'sessions');
        this.registryPath = path.join(this.sessionsPath, 'session_registry.json');
        this.sessions = new Map();
    }

    async initialize() {
        try {
            console.log('🔧 Initializing session manager...');

            // Ensure sessions directory exists
            await fs.ensureDir(this.sessionsPath);

            // Load session registry
            await this.loadSessionRegistry();

            console.log('✅ Session manager initialized');

        } catch (error) {
            console.error('❌ Failed to initialize session manager:', error);
            throw error;
        }
    }

    async loadSessionRegistry() {
        try {
            if (await fs.pathExists(this.registryPath)) {
                const registry = await fs.readJson(this.registryPath);
                
                for (const sessionData of registry.sessions || []) {
                    this.sessions.set(sessionData.name, sessionData);
                }
            }
        } catch (error) {
            console.error('⚠️ Failed to load session registry, starting fresh:', error);
        }
    }

    async saveSessionRegistry() {
        try {
            const registry = {
                sessions: Array.from(this.sessions.values()),
                lastUpdated: new Date().toISOString(),
                version: '1.0.0'
            };

            await fs.writeJson(this.registryPath, registry, { spaces: 2 });
        } catch (error) {
            console.error('❌ Failed to save session registry:', error);
        }
    }

    async createSession(sessionName) {
        if (this.sessions.has(sessionName)) {
            throw new Error(`Session '${sessionName}' already exists`);
        }

        const sessionPath = path.join(this.sessionsPath, `session_${sessionName}`);
        
        // Create session directory structure
        await fs.ensureDir(sessionPath);
        await fs.ensureDir(path.join(sessionPath, 'auth'));

        // Create session metadata
        const metadata = {
            name: sessionName,
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString(),
            status: 'created',
            ownerJid: null,
            path: sessionPath
        };

        const configPath = path.join(sessionPath, 'config.json');
        const metadataPath = path.join(sessionPath, 'metadata.json');

        // Create default config
        const config = {
            sessionName: sessionName,
            autoReconnect: true,
            puppeteerOptions: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage'
                ]
            }
        };

        await fs.writeJson(configPath, config, { spaces: 2 });
        await fs.writeJson(metadataPath, metadata, { spaces: 2 });

        // Add to sessions map
        this.sessions.set(sessionName, metadata);
        
        // Save registry
        await this.saveSessionRegistry();

        console.log(`✅ Created session: ${sessionName}`);
        return metadata;
    }

    async deleteSession(sessionName) {
        if (!this.sessions.has(sessionName)) {
            throw new Error(`Session '${sessionName}' does not exist`);
        }

        const sessionPath = path.join(this.sessionsPath, `session_${sessionName}`);
        
        // Remove session directory
        await fs.remove(sessionPath);

        // Remove from sessions map
        this.sessions.delete(sessionName);

        // Save registry
        await this.saveSessionRegistry();

        console.log(`🗑️ Deleted session: ${sessionName}`);
    }

    async getSession(sessionName) {
        return this.sessions.get(sessionName) || null;
    }

    async listSessions() {
        const sessions = Array.from(this.sessions.values());
        
        // Update status for each session
        for (const session of sessions) {
            session.status = await this.getSessionStatus(session.name);
        }

        return sessions;
    }

    async getSessionStatus(sessionName) {
        const sessionPath = path.join(this.sessionsPath, `session_${sessionName}`);
        const authPath = path.join(sessionPath, 'auth');
        
        try {
            // Check if session directory exists
            if (!await fs.pathExists(sessionPath)) {
                return 'missing';
            }

            // Check if authenticated (has auth files)
            const authFiles = await fs.readdir(authPath).catch(() => []);
            if (authFiles.length > 0) {
                return 'authenticated';
            }

            return 'created';

        } catch (error) {
            return 'error';
        }
    }

    async updateSessionMetadata(sessionName, updates) {
        if (!this.sessions.has(sessionName)) {
            throw new Error(`Session '${sessionName}' does not exist`);
        }

        const session = this.sessions.get(sessionName);
        const sessionPath = path.join(this.sessionsPath, `session_${sessionName}`);
        const metadataPath = path.join(sessionPath, 'metadata.json');

        // Update session data
        Object.assign(session, updates, { lastUpdated: new Date().toISOString() });

        // Save to file
        await fs.writeJson(metadataPath, session, { spaces: 2 });

        // Save registry
        await this.saveSessionRegistry();

        return session;
    }

    async setSessionOwner(sessionName, ownerJid) {
        return await this.updateSessionMetadata(sessionName, { 
            ownerJid: ownerJid,
            status: 'active'
        });
    }

    async getSessionPath(sessionName) {
        const session = this.sessions.get(sessionName);
        return session ? session.path : null;
    }

    async cleanupSessions() {
        console.log('🧹 Cleaning up sessions...');
        
        const sessionDirs = await fs.readdir(this.sessionsPath);
        const validSessions = new Set(Array.from(this.sessions.keys()).map(name => `session_${name}`));

        for (const dir of sessionDirs) {
            if (dir.startsWith('session_') && !validSessions.has(dir)) {
                const dirPath = path.join(this.sessionsPath, dir);
                await fs.remove(dirPath);
                console.log(`🗑️ Removed orphaned session directory: ${dir}`);
            }
        }

        console.log('✅ Session cleanup complete');
    }

    getSessionStats() {
        const sessions = Array.from(this.sessions.values());
        
        return {
            total: sessions.length,
            byStatus: sessions.reduce((acc, session) => {
                acc[session.status] = (acc[session.status] || 0) + 1;
                return acc;
            }, {}),
            oldestSession: sessions.length > 0 ? 
                sessions.reduce((oldest, current) => 
                    new Date(current.createdAt) < new Date(oldest.createdAt) ? current : oldest
                ).createdAt : null,
            newestSession: sessions.length > 0 ? 
                sessions.reduce((newest, current) => 
                    new Date(current.createdAt) > new Date(newest.createdAt) ? current : newest
                ).createdAt : null
        };
    }
}

module.exports = SessionManager;
