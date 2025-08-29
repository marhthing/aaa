/**
 * Access Control Utilities
 * Helper functions for permission checking and access management
 */

const { ACCESS_LEVELS, ERROR_CODES, COMMAND_CATEGORIES } = require('./constants');
const { jidManager } = require('./jidManager');

class AccessUtils {
    constructor() {
        this.accessCache = new Map();
        this.commandPermissions = new Map();
        this.setupDefaultPermissions();
    }

    /**
     * Setup default command permissions
     */
    setupDefaultPermissions() {
        // Owner-only commands
        const ownerOnlyCommands = [
            'allow', 'disallow', 'settings', 'reload', 'status',
            'env', 'plugins', 'backup', 'restore'
        ];

        // Commands that can be allowed to others
        const allowableCommands = [
            'ping', 'help', 'info', 'time', 'weather'
        ];

        // Game commands (special handling)
        const gameCommands = [
            'tictactoe', 'wordguess', 'quiz'
        ];

        this.commandPermissions.set('owner_only', new Set(ownerOnlyCommands));
        this.commandPermissions.set('allowable', new Set(allowableCommands));
        this.commandPermissions.set('games', new Set(gameCommands));
    }

    /**
     * Check if user has access to execute command
     */
    checkCommandAccess(userJid, command, context = {}) {
        const normalizedJid = jidManager.normalizeJid(userJid);
        if (!normalizedJid) {
            return {
                allowed: false,
                reason: ERROR_CODES.INVALID_JID,
                level: null
            };
        }

        // Owner has access to everything
        if (jidManager.isOwner(normalizedJid)) {
            return {
                allowed: true,
                reason: 'Owner privileges',
                level: ACCESS_LEVELS.OWNER
            };
        }

        // Check if command is owner-only
        if (this.isOwnerOnlyCommand(command)) {
            return {
                allowed: false,
                reason: ERROR_CODES.OWNER_ONLY,
                level: ACCESS_LEVELS.BLOCKED
            };
        }

        // Check if user has explicit permission for this command
        if (context.allowedCommands && context.allowedCommands.has(normalizedJid)) {
            const userCommands = context.allowedCommands.get(normalizedJid);
            if (userCommands.has(command) || userCommands.has('*')) {
                return {
                    allowed: true,
                    reason: 'Explicitly allowed',
                    level: ACCESS_LEVELS.ALLOWED_USER
                };
            }
        }

        // Check if it's a game command and user is in an active game
        if (this.isGameCommand(command) && context.activeGames) {
            const activeGame = context.activeGames.get(context.chatId);
            if (activeGame && activeGame.players.includes(normalizedJid)) {
                return {
                    allowed: true,
                    reason: 'Active game player',
                    level: ACCESS_LEVELS.GAME_PLAYER
                };
            }
        }

        // Default: deny access
        return {
            allowed: false,
            reason: ERROR_CODES.ACCESS_DENIED,
            level: ACCESS_LEVELS.BLOCKED
        };
    }

    /**
     * Check if command is owner-only
     */
    isOwnerOnlyCommand(command) {
        return this.commandPermissions.get('owner_only').has(command);
    }

    /**
     * Check if command can be allowed to others
     */
    isAllowableCommand(command) {
        return this.commandPermissions.get('allowable').has(command);
    }

    /**
     * Check if command is a game command
     */
    isGameCommand(command) {
        return this.commandPermissions.get('games').has(command);
    }

    /**
     * Check if user can participate in games
     */
    canParticipateInGames(userJid, gameType, context = {}) {
        const normalizedJid = jidManager.normalizeJid(userJid);
        if (!normalizedJid) return false;

        // Owner can always participate
        if (jidManager.isOwner(normalizedJid)) return true;

        // Check if games are enabled for non-owners
        if (context.gameSettings && !context.gameSettings.allowNonOwners) {
            return false;
        }

        // Check if user is explicitly blocked from games
        if (context.blockedUsers && context.blockedUsers.has(normalizedJid)) {
            return false;
        }

        return true;
    }

    /**
     * Get user access level
     */
    getUserAccessLevel(userJid, context = {}) {
        const normalizedJid = jidManager.normalizeJid(userJid);
        if (!normalizedJid) return ACCESS_LEVELS.BLOCKED;

        // Check cache first
        const cacheKey = `${normalizedJid}:${Date.now().toString().slice(0, -4)}`;
        if (this.accessCache.has(cacheKey)) {
            return this.accessCache.get(cacheKey);
        }

        let level = ACCESS_LEVELS.BLOCKED;

        if (jidManager.isOwner(normalizedJid)) {
            level = ACCESS_LEVELS.OWNER;
        } else if (context.allowedCommands && context.allowedCommands.has(normalizedJid)) {
            level = ACCESS_LEVELS.ALLOWED_USER;
        } else if (this.isActiveGamePlayer(normalizedJid, context)) {
            level = ACCESS_LEVELS.GAME_PLAYER;
        }

        // Cache the result for 1 minute
        this.accessCache.set(cacheKey, level);
        
        // Clean old cache entries
        this.cleanAccessCache();

        return level;
    }

    /**
     * Check if user is an active game player
     */
    isActiveGamePlayer(userJid, context = {}) {
        if (!context.activeGames) return false;

        for (const game of context.activeGames.values()) {
            if (game.players.includes(userJid)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Validate message for processing
     */
    validateMessageAccess(message, context = {}) {
        const userJid = jidManager.normalizeJid(message.from);
        if (!userJid) {
            return {
                allowed: false,
                reason: ERROR_CODES.INVALID_JID
            };
        }

        // Always allow owner messages
        if (jidManager.isOwner(userJid)) {
            return {
                allowed: true,
                reason: 'Owner message'
            };
        }

        // Check if it's a command
        const isCommand = message.body && message.body.startsWith('.');
        if (isCommand) {
            const command = message.body.split(' ')[0].substring(1).toLowerCase();
            return this.checkCommandAccess(userJid, command, {
                ...context,
                chatId: message.from
            });
        }

        // Check if it's a game input
        if (this.isValidGameInput(message, context)) {
            return {
                allowed: true,
                reason: 'Valid game input'
            };
        }

        // Default: block non-owner messages
        return {
            allowed: false,
            reason: 'Non-owner message blocked'
        };
    }

    /**
     * Check if message is valid game input
     */
    isValidGameInput(message, context = {}) {
        if (!context.activeGames) return false;

        const chatId = message.from;
        const activeGame = context.activeGames.get(chatId);
        
        if (!activeGame) return false;

        const userJid = jidManager.normalizeJid(message.from);
        if (!activeGame.players.includes(userJid)) return false;

        // Check if input is valid for the game type
        return this.validateGameInput(message.body, activeGame.type);
    }

    /**
     * Validate game input based on game type
     */
    validateGameInput(input, gameType) {
        if (!input || typeof input !== 'string') return false;

        input = input.trim().toLowerCase();

        switch (gameType) {
            case 'tictactoe':
                // Valid positions: 1-9 or coordinates like A1, B2, etc.
                return /^[1-9]$/.test(input) || /^[abc][123]$/i.test(input);

            case 'wordguess':
                // Valid word guess (letters only, 3-20 characters)
                return /^[a-z]{3,20}$/i.test(input);

            case 'quiz':
                // Valid quiz answer (A, B, C, D or 1, 2, 3, 4)
                return /^[abcd1-4]$/i.test(input);

            default:
                return false;
        }
    }

    /**
     * Create access denied message
     */
    createAccessDeniedMessage(reason, context = {}) {
        switch (reason) {
            case ERROR_CODES.OWNER_ONLY:
                return '❌ This command is only available to the bot owner.';

            case ERROR_CODES.ACCESS_DENIED:
                return '❌ You don\'t have permission to use this command.';

            case ERROR_CODES.INVALID_JID:
                return '❌ Invalid user identifier.';

            default:
                return '❌ Access denied.';
        }
    }

    /**
     * Get available commands for user
     */
    getAvailableCommands(userJid, context = {}) {
        const normalizedJid = jidManager.normalizeJid(userJid);
        if (!normalizedJid) return [];

        const commands = [];

        if (jidManager.isOwner(normalizedJid)) {
            // Owner gets all commands
            commands.push(...this.commandPermissions.get('owner_only'));
            commands.push(...this.commandPermissions.get('allowable'));
            commands.push(...this.commandPermissions.get('games'));
        } else {
            // Non-owners get explicitly allowed commands
            if (context.allowedCommands && context.allowedCommands.has(normalizedJid)) {
                const userCommands = context.allowedCommands.get(normalizedJid);
                commands.push(...userCommands);
            }

            // Add game commands if user is in active game
            if (this.isActiveGamePlayer(normalizedJid, context)) {
                commands.push(...this.commandPermissions.get('games'));
            }
        }

        return [...new Set(commands)]; // Remove duplicates
    }

    /**
     * Clean old access cache entries
     */
    cleanAccessCache() {
        const now = Date.now();
        const currentMinute = now.toString().slice(0, -4);
        
        for (const [key, value] of this.accessCache.entries()) {
            const keyMinute = key.split(':')[1];
            if (keyMinute !== currentMinute) {
                this.accessCache.delete(key);
            }
        }
    }

    /**
     * Clear all caches
     */
    clearCache() {
        this.accessCache.clear();
        console.log('Access utilities cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            accessCache: this.accessCache.size,
            commandPermissions: {
                ownerOnly: this.commandPermissions.get('owner_only').size,
                allowable: this.commandPermissions.get('allowable').size,
                games: this.commandPermissions.get('games').size
            }
        };
    }
}

// Create singleton instance
const accessUtils = new AccessUtils();

module.exports = {
    AccessUtils,
    accessUtils
};