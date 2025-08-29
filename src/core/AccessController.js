const fs = require('fs-extra');
const path = require('path');

class AccessController {
    constructor() {
        this.ownerJid = null;
        this.allowedCommands = new Map(); // userJid -> Set of allowed commands
        this.activeGames = new Map(); // chatId -> game info
        this.accessControlPath = path.join(process.cwd(), 'data', 'system', 'access_control.json');
        this.isInitialized = false;
    }

    async initialize() {
        try {
            console.log('🔧 Initializing access controller...');

            // Ensure data directory exists
            await fs.ensureDir(path.dirname(this.accessControlPath));

            // Load existing access control data
            await this.loadAccessControlData();

            this.isInitialized = true;
            console.log('✅ Access controller initialized');

        } catch (error) {
            console.error('❌ Failed to initialize access controller:', error);
            throw error;
        }
    }

    async loadAccessControlData() {
        try {
            if (await fs.pathExists(this.accessControlPath)) {
                const data = await fs.readJson(this.accessControlPath);
                
                this.ownerJid = data.ownerJid || null;
                
                // Load allowed commands
                if (data.allowedCommands) {
                    this.allowedCommands.clear(); // Clear existing data first
                    for (const [userJid, commands] of Object.entries(data.allowedCommands)) {
                        this.allowedCommands.set(userJid, new Set(commands));
                        console.log(`🔄 Loaded allowed commands for ${userJid}: ${commands.join(', ')}`);
                    }
                }

                // Load active games
                if (data.activeGames) {
                    for (const [chatId, gameInfo] of Object.entries(data.activeGames)) {
                        this.activeGames.set(chatId, gameInfo);
                    }
                }
            }
        } catch (error) {
            console.error('⚠️ Failed to load access control data, starting fresh:', error);
        }
    }

    async saveAccessControlData() {
        try {
            const data = {
                ownerJid: this.ownerJid,
                allowedCommands: {},
                activeGames: {},
                lastUpdated: new Date().toISOString()
            };

            // Convert allowed commands map to object
            for (const [userJid, commands] of this.allowedCommands) {
                data.allowedCommands[userJid] = Array.from(commands);
            }

            // Convert active games map to object
            for (const [chatId, gameInfo] of this.activeGames) {
                data.activeGames[chatId] = gameInfo;
            }

            await fs.writeJson(this.accessControlPath, data, { spaces: 2 });
        } catch (error) {
            console.error('❌ Failed to save access control data:', error);
        }
    }

    async setOwnerJid(jid) {
        this.ownerJid = jid;
        await this.saveAccessControlData();
        console.log(`🔐 Owner JID set: ${jid}`);
    }

    isOwner(jid) {
        if (!this.ownerJid || !jid) return false;
        
        // Extract phone number from both JIDs for comparison
        const getPhoneNumber = (jidStr) => {
            // Extract the phone number part before @ symbol
            const match = jidStr.match(/^(\d+)/);
            return match ? match[1] : null;
        };
        
        const phoneFromInput = getPhoneNumber(jid);
        const phoneFromOwner = getPhoneNumber(this.ownerJid);
        
        // Standard phone number comparison
        if (phoneFromInput === phoneFromOwner && phoneFromInput !== null) {
            console.log(`✅ Owner access granted for: ${jid}`);
            return true;
        }
        
        // Special handling for @lid format in groups - SECURITY FIX
        // @lid format should NOT automatically grant owner access
        // Only grant access if we can verify the phone number matches
        if (jid.includes('@lid')) {
            console.log(`🔍 Detected @lid format: ${jid} - checking for phone number match`);
            // Extract potential phone number from @lid format
            const lidMatch = jid.match(/^(\d+)@lid/);
            if (lidMatch && phoneFromOwner) {
                const lidPhoneNumber = lidMatch[1];
                console.log(`🔍 Comparing @lid phone: ${lidPhoneNumber} with owner phone: ${phoneFromOwner}`);
                
                // Direct match
                if (lidPhoneNumber === phoneFromOwner) {
                    console.log(`✅ @lid phone number matches owner: ${lidPhoneNumber}`);
                    return true;
                }
                
                // Check if the @lid number contains the owner's number (WhatsApp sometimes adds prefixes/suffixes)
                if (lidPhoneNumber.includes(phoneFromOwner)) {
                    console.log(`✅ @lid phone number contains owner number (WhatsApp format variation): ${lidPhoneNumber} contains ${phoneFromOwner}`);
                    return true;
                }
                
                // Check if owner's number contains the @lid number (for shorter versions)
                if (phoneFromOwner.includes(lidPhoneNumber) && lidPhoneNumber.length >= 10) {
                    console.log(`✅ Owner phone contains @lid number (WhatsApp format variation): ${phoneFromOwner} contains ${lidPhoneNumber}`);
                    return true;
                }
                
                // Known owner @lid formats - your specific @lid JIDs
                const knownOwnerLidFormats = [
                    '185534701924401@lid', // Current owner @lid JID
                    // Add other variations as they appear
                ];
                
                if (knownOwnerLidFormats.includes(jid)) {
                    console.log(`✅ Known owner @lid format: ${jid}`);
                    return true;
                }
            }
            console.log(`🚫 @lid format does not match owner phone number - ${lidMatch ? lidMatch[1] : 'no number'} vs ${phoneFromOwner}`);
            return false;
        }
        
        return false;
    }

    async allowCommand(userJid, command) {
        if (!this.allowedCommands.has(userJid)) {
            this.allowedCommands.set(userJid, new Set());
        }
        
        this.allowedCommands.get(userJid).add(command);
        await this.saveAccessControlData();
        
        console.log(`✅ Allowed command '${command}' for user: ${userJid}`);
    }

    async disallowCommand(userJid, command) {
        if (this.allowedCommands.has(userJid)) {
            this.allowedCommands.get(userJid).delete(command);
            
            // Remove user entry if no commands left
            if (this.allowedCommands.get(userJid).size === 0) {
                this.allowedCommands.delete(userJid);
            }
            
            await this.saveAccessControlData();
            console.log(`❌ Disallowed command '${command}' for user: ${userJid}`);
        }
    }

    isCommandAllowed(userJid, command) {
        if (!userJid) {
            console.log(`⚠️ isCommandAllowed: No userJid provided for command '${command}'`);
            return false;
        }
        
        const hasUser = this.allowedCommands.has(userJid);
        const hasCommand = hasUser && this.allowedCommands.get(userJid).has(command);
        
        if (hasCommand) {
            console.log(`✅ Command '${command}' allowed for user: ${userJid}`);
        }
        
        return hasCommand;
    }

    getUserAllowedCommands(userJid) {
        return this.allowedCommands.has(userJid) ? 
               Array.from(this.allowedCommands.get(userJid)) : [];
    }

    getAllAllowedCommands() {
        const result = {};
        for (const [userJid, commands] of this.allowedCommands) {
            result[userJid] = Array.from(commands);
        }
        return result;
    }

    async startGame(chatId, gameType, players = [], gameData = {}) {
        const gameInfo = {
            type: gameType,
            players: players,
            startedBy: players[0] || null,
            startTime: new Date().toISOString(),
            status: 'active',
            data: gameData
        };

        this.activeGames.set(chatId, gameInfo);
        await this.saveAccessControlData();
        
        console.log(`🎮 Started game '${gameType}' in chat: ${chatId}`);
        return gameInfo;
    }

    async endGame(chatId) {
        if (this.activeGames.has(chatId)) {
            this.activeGames.delete(chatId);
            await this.saveAccessControlData();
            console.log(`🎮 Ended game in chat: ${chatId}`);
            return true;
        }
        return false;
    }

    getActiveGame(chatId) {
        return this.activeGames.get(chatId) || null;
    }

    isGameActive(chatId) {
        return this.activeGames.has(chatId);
    }

    isGamePlayer(chatId, userJid) {
        const game = this.getActiveGame(chatId);
        return game && game.players.includes(userJid);
    }

    getAllActiveGames() {
        return Object.fromEntries(this.activeGames);
    }

    async updateGameData(chatId, data) {
        if (this.activeGames.has(chatId)) {
            this.activeGames.get(chatId).data = { ...this.activeGames.get(chatId).data, ...data };
            await this.saveAccessControlData();
        }
    }

    /**
     * Main access control logic - determines if a user can process a command
     */
    canProcessMessage(message, command = null) {
        // Extract sender JID properly from Baileys message structure
        let senderJid, chatId;
        
        if (message.key) {
            // Check if this is an outgoing message from the bot owner
            if (message.key.fromMe) {
                // For outgoing messages, use the owner JID
                senderJid = this.ownerJid;
                chatId = message.key.remoteJid;
            } else {
                // For incoming messages:
                // - In groups: participant is the sender
                // - In individual chats: remoteJid is the sender
                senderJid = message.key.participant || message.key.remoteJid;
                chatId = message.key.remoteJid;
                
                // Special case: If sender uses @lid format and chat is a group where owner is the only member,
                // we need to check if this might be the owner using a different WhatsApp client/format
                if (senderJid && senderJid.includes('@lid') && chatId && chatId.endsWith('@g.us')) {
                    // Check if this could be the owner by looking at the message context
                    // In single-member groups, WhatsApp sometimes assigns @lid format
                    // We'll mark this for special handling in isOwner method
                    console.log(`🔍 Detected @lid sender in group - might be owner in single-member group: ${senderJid}`);
                }
            }
        } else {
            // Fallback for other message structures
            senderJid = message.author || message.from;
            chatId = message.from;
        }

        // Debug group message handling
        const isGroup = chatId && chatId.endsWith('@g.us');
        if (isGroup) {
            console.log(`🔍 Group access check - FromMe: ${message.key?.fromMe}, Sender: ${senderJid}, Owner: ${this.ownerJid}, Chat: ${chatId}`);
        }

        // Owner can always process any message
        if (this.isOwner(senderJid)) {
            return {
                allowed: true,
                reason: 'owner'
            };
        }

        // Check if there's an active game and user is a player
        if (this.isGameActive(chatId)) {
            const game = this.getActiveGame(chatId);
            if (game.players.includes(senderJid)) {
                return {
                    allowed: true,
                    reason: 'game_player',
                    gameType: game.type
                };
            }
        }

        // Check if command is specifically allowed for this user
        if (command && this.isCommandAllowed(senderJid, command)) {
            console.log(`✅ Allowed command access granted for '${command}' to user: ${senderJid}`);
            return {
                allowed: true,
                reason: 'allowed_command',
                command: command
            };
        }

        // Default: deny access
        return {
            allowed: false,
            reason: 'access_denied'
        };
    }

    /**
     * Check if message is a valid game input
     */
    isValidGameInput(message, gameType) {
        // Extract text using the same method as MessageProcessor
        let text = '';
        if (message.message) {
            if (message.message.conversation) {
                text = message.message.conversation;
            } else if (message.message.extendedTextMessage?.text) {
                text = message.message.extendedTextMessage.text;
            } else if (message.message.imageMessage?.caption) {
                text = message.message.imageMessage.caption;
            } else if (message.message.videoMessage?.caption) {
                text = message.message.videoMessage.caption;
            }
        }
        
        // Fallback to direct body property
        if (!text && message.body) {
            text = message.body;
        }
        
        if (!text || typeof text !== 'string') {
            return false;
        }
        
        text = text.trim().toLowerCase();

        switch (gameType) {
            case 'tictactoe':
                // Valid positions: 1-9 or coordinates like a1, b2, etc.
                return /^[1-9]$/.test(text) || /^[abc][123]$/.test(text);

            case 'wordguess':
                // Single letter guess or full word
                return /^[a-z]$/.test(text) || /^[a-z]{2,}$/.test(text);

            default:
                return false;
        }
    }

    // Method that middleware calls to check command permissions
    async canExecuteCommand(userJid, command) {
        if (!userJid) {
            console.log(`⚠️ canExecuteCommand: No userJid provided for command '${command}'`);
            return false;
        }
        
        // Owner can execute any command
        if (this.isOwner(userJid)) {
            return true;
        }
        
        // Check if command is specifically allowed
        return this.isCommandAllowed(userJid, command);
    }

    getAccessStats() {
        return {
            ownerJid: this.ownerJid,
            totalAllowedUsers: this.allowedCommands.size,
            totalActiveGames: this.activeGames.size,
            allowedCommandsCount: Array.from(this.allowedCommands.values())
                .reduce((total, commands) => total + commands.size, 0)
        };
    }
}

module.exports = AccessController;
