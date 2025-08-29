const { EventEmitter } = require('events');
const storageService = require('./storage');
const { jidManager } = require('../utils/jidManager');

class AccessControlService extends EventEmitter {
    constructor() {
        super();
        this.ownerJid = null;
        this.allowedCommands = new Map(); // userJid -> Set of commands
        this.activeGames = new Map(); // chatId -> gameInfo
        this.accessRules = {
            ownerOnly: true,
            allowGameInputs: true,
            allowExplicitCommands: true
        };
        this.isInitialized = false;
    }

    async initialize() {
        try {
            await this.loadAccessData();
            this.isInitialized = true;
            console.log('✅ Access Control Service initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Access Control Service:', error);
            throw error;
        }
    }

    async loadAccessData() {
        try {
            const data = await storageService.load('system', 'access_control');
            
            if (data) {
                this.ownerJid = data.ownerJid || null;
                this.accessRules = { ...this.accessRules, ...data.accessRules };
                
                // Restore allowed commands
                if (data.allowedCommands) {
                    for (const [userJid, commands] of Object.entries(data.allowedCommands)) {
                        this.allowedCommands.set(userJid, new Set(commands));
                    }
                }
                
                // Restore active games
                if (data.activeGames) {
                    for (const [chatId, gameInfo] of Object.entries(data.activeGames)) {
                        this.activeGames.set(chatId, gameInfo);
                    }
                }
            }
        } catch (error) {
            console.error('Error loading access control data:', error);
        }
    }

    async saveAccessData() {
        try {
            const data = {
                ownerJid: this.ownerJid,
                accessRules: this.accessRules,
                allowedCommands: Object.fromEntries(
                    Array.from(this.allowedCommands.entries()).map(([k, v]) => [k, Array.from(v)])
                ),
                activeGames: Object.fromEntries(this.activeGames.entries()),
                lastUpdated: new Date().toISOString()
            };
            
            await storageService.save('system', 'access_control', data);
        } catch (error) {
            console.error('Error saving access control data:', error);
        }
    }

    setOwner(jid) {
        const normalizedJid = jidManager.normalizeJid(jid);
        this.ownerJid = normalizedJid;
        this.emit('owner_changed', { ownerJid: normalizedJid });
        this.saveAccessData();
        return true;
    }

    isOwner(jid) {
        if (!this.ownerJid || !jid) return false;
        
        const normalizedJid = jidManager.normalizeJid(jid);
        const normalizedOwner = jidManager.normalizeJid(this.ownerJid);
        
        // Extract base JID (without device ID suffix like :79)
        const baseJid = normalizedJid ? normalizedJid.split(':')[0] : null;
        const baseOwner = normalizedOwner ? normalizedOwner.split(':')[0] : null;
        
        // console.log(`🔍 JID Debug - Input: ${jid}, Normalized: ${normalizedJid}, Base: ${baseJid}`);
        // console.log(`🔍 Owner Debug - Stored: ${this.ownerJid}, Normalized: ${normalizedOwner}, Base: ${baseOwner}`);
        // console.log(`🔍 Match Result: ${baseJid === baseOwner}`);
        
        return baseJid === baseOwner;
    }

    canExecuteCommand(jid, command) {
        // Owner can execute any command
        if (this.isOwner(jid)) {
            return true;
        }

        // Check if command is explicitly allowed for this user
        const normalizedJid = jidManager.normalizeJid(jid);
        const userCommands = this.allowedCommands.get(normalizedJid);
        
        return userCommands && userCommands.has(command);
    }

    canProcessMessage(message, command) {
        // Extract sender JID properly from Baileys message structure
        const senderJid = message.key?.participant || message.key?.remoteJid || message.author || message.from;
        const chatId = message.key?.remoteJid || message.from;
        
        // Extract message text properly
        let messageText = '';
        if (message.message?.conversation) {
            messageText = message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
            messageText = message.message.extendedTextMessage.text;
        } else if (message.body) {
            messageText = message.body;
        }

        // Always allow owner (including outgoing messages from owner)
        if (this.isOwner(senderJid) || message.key?.fromMe) {
            return {
                allowed: true,
                reason: 'owner',
                context: 'full_access'
            };
        }

        // Check for active games
        if (this.accessRules.allowGameInputs && this.activeGames.has(chatId)) {
            const gameInfo = this.activeGames.get(chatId);
            
            if (this.isValidGameInput(messageText, gameInfo)) {
                return {
                    allowed: true,
                    reason: 'active_game',
                    context: 'game_input',
                    gameInfo
                };
            }
        }

        // Check for explicitly allowed commands
        if (this.accessRules.allowExplicitCommands && messageText.startsWith('.')) {
            const command = messageText.split(' ')[0].substring(1);
            
            if (this.canExecuteCommand(senderJid, command)) {
                return {
                    allowed: true,
                    reason: 'allowed_command',
                    context: 'limited_command',
                    command
                };
            }
        }

        return {
            allowed: false,
            reason: 'access_denied',
            context: 'no_permission'
        };
    }

    isValidGameInput(messageText, gameInfo) {
        if (!gameInfo || !messageText) return false;

        const text = messageText.trim().toLowerCase();
        
        switch (gameInfo.type) {
            case 'tictactoe':
                return /^[1-9]$/.test(text) || text === 'quit';
            case 'wordguess':
                return /^[a-z]$/.test(text) || text === 'quit';
            default:
                return false;
        }
    }

    allowCommand(userJid, command) {
        const normalizedJid = jidManager.normalize(userJid);
        
        if (!this.allowedCommands.has(normalizedJid)) {
            this.allowedCommands.set(normalizedJid, new Set());
        }
        
        this.allowedCommands.get(normalizedJid).add(command);
        this.emit('command_allowed', { userJid: normalizedJid, command });
        this.saveAccessData();
        
        return true;
    }

    disallowCommand(userJid, command) {
        const normalizedJid = jidManager.normalize(userJid);
        const userCommands = this.allowedCommands.get(normalizedJid);
        
        if (userCommands && userCommands.has(command)) {
            userCommands.delete(command);
            
            if (userCommands.size === 0) {
                this.allowedCommands.delete(normalizedJid);
            }
            
            this.emit('command_disallowed', { userJid: normalizedJid, command });
            this.saveAccessData();
            return true;
        }
        
        return false;
    }

    getAllowedCommands(userJid) {
        const normalizedJid = jidManager.normalize(userJid);
        const userCommands = this.allowedCommands.get(normalizedJid);
        return userCommands ? Array.from(userCommands) : [];
    }

    startGame(chatId, gameType, gameData = {}) {
        const gameInfo = {
            type: gameType,
            startedBy: gameData.startedBy || null,
            startedAt: new Date().toISOString(),
            players: gameData.players || [],
            state: gameData.state || 'active',
            data: gameData.data || {}
        };
        
        this.activeGames.set(chatId, gameInfo);
        this.emit('game_started', { chatId, gameInfo });
        this.saveAccessData();
        
        return gameInfo;
    }

    endGame(chatId) {
        const gameInfo = this.activeGames.get(chatId);
        if (gameInfo) {
            this.activeGames.delete(chatId);
            this.emit('game_ended', { chatId, gameInfo });
            this.saveAccessData();
            return true;
        }
        return false;
    }

    getActiveGame(chatId) {
        return this.activeGames.get(chatId) || null;
    }

    getAllActiveGames() {
        return Object.fromEntries(this.activeGames.entries());
    }

    updateAccessRules(rules) {
        this.accessRules = { ...this.accessRules, ...rules };
        this.emit('access_rules_updated', { rules: this.accessRules });
        this.saveAccessData();
        return true;
    }

    getAccessSummary() {
        return {
            ownerJid: this.ownerJid,
            accessRules: this.accessRules,
            allowedCommandsCount: this.allowedCommands.size,
            activeGamesCount: this.activeGames.size,
            allowedUsers: Array.from(this.allowedCommands.keys()),
            activeGameChats: Array.from(this.activeGames.keys())
        };
    }

    // User management
    getAllUsers() {
        const users = new Set();
        
        if (this.ownerJid) {
            users.add(this.ownerJid);
        }
        
        for (const userJid of this.allowedCommands.keys()) {
            users.add(userJid);
        }
        
        for (const gameInfo of this.activeGames.values()) {
            if (gameInfo.players) {
                gameInfo.players.forEach(player => users.add(player));
            }
        }
        
        return Array.from(users);
    }

    getUserInfo(userJid) {
        const normalizedJid = jidManager.normalize(userJid);
        
        return {
            jid: normalizedJid,
            isOwner: this.isOwner(normalizedJid),
            allowedCommands: this.getAllowedCommands(normalizedJid),
            inActiveGames: Array.from(this.activeGames.entries())
                .filter(([chatId, gameInfo]) => 
                    gameInfo.players && gameInfo.players.includes(normalizedJid)
                )
                .map(([chatId, gameInfo]) => ({ chatId, gameType: gameInfo.type }))
        };
    }

    // Cleanup methods
    clearExpiredGames(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
        const now = new Date();
        const expiredGames = [];
        
        for (const [chatId, gameInfo] of this.activeGames.entries()) {
            const gameAge = now - new Date(gameInfo.startedAt);
            if (gameAge > maxAge) {
                expiredGames.push(chatId);
            }
        }
        
        expiredGames.forEach(chatId => this.endGame(chatId));
        
        if (expiredGames.length > 0) {
            console.log(`🧹 Cleaned up ${expiredGames.length} expired games`);
        }
        
        return expiredGames.length;
    }

    reset() {
        this.ownerJid = null;
        this.allowedCommands.clear();
        this.activeGames.clear();
        this.accessRules = {
            ownerOnly: true,
            allowGameInputs: true,
            allowExplicitCommands: true
        };
        
        this.saveAccessData();
        this.emit('access_control_reset');
    }
}

// Export singleton instance
module.exports = new AccessControlService();
