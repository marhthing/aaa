const { EventEmitter } = require('events');
const storageService = require('./storage');
const { jidManager } = require('../utils/jidManager');

class AllowedCommandsService extends EventEmitter {
    constructor() {
        super();
        this.allowedCommands = new Map(); // userJid -> Set of commands
        this.commandHistory = []; // History of command grants/revokes
        this.isInitialized = false;
    }

    async initialize() {
        try {
            await this.loadAllowedCommands();
            this.isInitialized = true;
            console.log('✅ Allowed Commands Service initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Allowed Commands Service:', error);
            throw error;
        }
    }

    async loadAllowedCommands() {
        try {
            const data = await storageService.load('system', 'allowed_commands');
            
            if (data) {
                // Restore allowed commands
                if (data.allowedCommands) {
                    for (const [userJid, commands] of Object.entries(data.allowedCommands)) {
                        this.allowedCommands.set(userJid, new Set(commands));
                    }
                }
                
                // Restore history
                if (data.commandHistory) {
                    this.commandHistory = data.commandHistory;
                }
            }
        } catch (error) {
            console.error('Error loading allowed commands:', error);
        }
    }

    async saveAllowedCommands() {
        try {
            const data = {
                allowedCommands: Object.fromEntries(
                    Array.from(this.allowedCommands.entries()).map(([k, v]) => [k, Array.from(v)])
                ),
                commandHistory: this.commandHistory,
                lastUpdated: new Date().toISOString()
            };
            
            await storageService.save('system', 'allowed_commands', data);
        } catch (error) {
            console.error('Error saving allowed commands:', error);
        }
    }

    allowCommand(userJid, command, grantedBy = null) {
        const normalizedJid = jidManager.normalize(userJid);
        
        if (!this.allowedCommands.has(normalizedJid)) {
            this.allowedCommands.set(normalizedJid, new Set());
        }
        
        const userCommands = this.allowedCommands.get(normalizedJid);
        
        if (userCommands.has(command)) {
            return { success: false, reason: 'Command already allowed' };
        }
        
        userCommands.add(command);
        
        // Record in history
        this.recordCommandAction('allow', normalizedJid, command, grantedBy);
        
        this.emit('command_allowed', { userJid: normalizedJid, command, grantedBy });
        this.saveAllowedCommands();
        
        return { success: true, reason: 'Command allowed successfully' };
    }

    disallowCommand(userJid, command, revokedBy = null) {
        const normalizedJid = jidManager.normalize(userJid);
        const userCommands = this.allowedCommands.get(normalizedJid);
        
        if (!userCommands || !userCommands.has(command)) {
            return { success: false, reason: 'Command not currently allowed' };
        }
        
        userCommands.delete(command);
        
        // Remove user entry if no commands left
        if (userCommands.size === 0) {
            this.allowedCommands.delete(normalizedJid);
        }
        
        // Record in history
        this.recordCommandAction('disallow', normalizedJid, command, revokedBy);
        
        this.emit('command_disallowed', { userJid: normalizedJid, command, revokedBy });
        this.saveAllowedCommands();
        
        return { success: true, reason: 'Command disallowed successfully' };
    }

    isCommandAllowed(userJid, command) {
        const normalizedJid = jidManager.normalize(userJid);
        const userCommands = this.allowedCommands.get(normalizedJid);
        
        return userCommands ? userCommands.has(command) : false;
    }

    getAllowedCommands(userJid) {
        const normalizedJid = jidManager.normalize(userJid);
        const userCommands = this.allowedCommands.get(normalizedJid);
        
        return userCommands ? Array.from(userCommands) : [];
    }

    getAllUsers() {
        return Array.from(this.allowedCommands.keys());
    }

    getUsersWithCommand(command) {
        const users = [];
        
        for (const [userJid, commands] of this.allowedCommands.entries()) {
            if (commands.has(command)) {
                users.push(userJid);
            }
        }
        
        return users;
    }

    getAllCommandPermissions() {
        const permissions = {};
        
        for (const [userJid, commands] of this.allowedCommands.entries()) {
            permissions[userJid] = Array.from(commands);
        }
        
        return permissions;
    }

    getCommandStats() {
        const stats = {
            totalUsers: this.allowedCommands.size,
            totalPermissions: 0,
            commandDistribution: {},
            userDistribution: {}
        };
        
        for (const [userJid, commands] of this.allowedCommands.entries()) {
            const commandCount = commands.size;
            stats.totalPermissions += commandCount;
            
            // Command distribution
            for (const command of commands) {
                stats.commandDistribution[command] = (stats.commandDistribution[command] || 0) + 1;
            }
            
            // User distribution by command count
            const bucket = this.getCommandCountBucket(commandCount);
            stats.userDistribution[bucket] = (stats.userDistribution[bucket] || 0) + 1;
        }
        
        return stats;
    }

    getCommandCountBucket(count) {
        if (count === 1) return '1 command';
        if (count <= 3) return '2-3 commands';
        if (count <= 5) return '4-5 commands';
        if (count <= 10) return '6-10 commands';
        return '10+ commands';
    }

    recordCommandAction(action, userJid, command, performedBy) {
        const record = {
            id: this.generateActionId(),
            action, // 'allow' or 'disallow'
            userJid,
            command,
            performedBy,
            timestamp: new Date().toISOString()
        };
        
        this.commandHistory.push(record);
        
        // Keep only last 1000 history entries
        if (this.commandHistory.length > 1000) {
            this.commandHistory = this.commandHistory.slice(-1000);
        }
    }

    getCommandHistory(userJid = null, limit = 50) {
        let history = this.commandHistory;
        
        if (userJid) {
            const normalizedJid = jidManager.normalize(userJid);
            history = history.filter(record => record.userJid === normalizedJid);
        }
        
        return history.slice(-limit).reverse();
    }

    getRecentActivity(hours = 24) {
        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
        
        return this.commandHistory.filter(record => 
            new Date(record.timestamp) > cutoff
        );
    }

    // Bulk operations
    allowMultipleCommands(userJid, commands, grantedBy = null) {
        const results = [];
        
        for (const command of commands) {
            const result = this.allowCommand(userJid, command, grantedBy);
            results.push({ command, ...result });
        }
        
        return results;
    }

    disallowMultipleCommands(userJid, commands, revokedBy = null) {
        const results = [];
        
        for (const command of commands) {
            const result = this.disallowCommand(userJid, command, revokedBy);
            results.push({ command, ...result });
        }
        
        return results;
    }

    disallowAllCommands(userJid, revokedBy = null) {
        const normalizedJid = jidManager.normalize(userJid);
        const userCommands = this.allowedCommands.get(normalizedJid);
        
        if (!userCommands || userCommands.size === 0) {
            return { success: false, reason: 'No commands to disallow' };
        }
        
        const commands = Array.from(userCommands);
        const results = this.disallowMultipleCommands(userJid, commands, revokedBy);
        
        return {
            success: true,
            reason: `Disallowed ${commands.length} commands`,
            results
        };
    }

    // Validation and utilities
    validateCommand(command) {
        // Basic command validation
        if (!command || typeof command !== 'string') {
            return { valid: false, reason: 'Command must be a non-empty string' };
        }
        
        if (command.length > 50) {
            return { valid: false, reason: 'Command name too long' };
        }
        
        if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(command)) {
            return { valid: false, reason: 'Invalid command format' };
        }
        
        return { valid: true };
    }

    validateUserJid(userJid) {
        try {
            const normalized = jidManager.normalize(userJid);
            return { valid: true, normalizedJid: normalized };
        } catch (error) {
            return { valid: false, reason: 'Invalid user JID format' };
        }
    }

    // Export/Import functionality
    exportPermissions() {
        return {
            allowedCommands: this.getAllCommandPermissions(),
            commandHistory: this.commandHistory,
            exportedAt: new Date().toISOString(),
            version: '1.0.0'
        };
    }

    async importPermissions(data, importedBy = null) {
        try {
            if (data.allowedCommands) {
                for (const [userJid, commands] of Object.entries(data.allowedCommands)) {
                    for (const command of commands) {
                        this.allowCommand(userJid, command, importedBy);
                    }
                }
            }
            
            if (data.commandHistory) {
                // Merge history (avoiding duplicates)
                const existingIds = new Set(this.commandHistory.map(r => r.id));
                const newRecords = data.commandHistory.filter(r => !existingIds.has(r.id));
                this.commandHistory.push(...newRecords);
                
                // Sort by timestamp
                this.commandHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            }
            
            await this.saveAllowedCommands();
            this.emit('permissions_imported', { importedBy });
            
            return { success: true };
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Cleanup methods
    cleanupOldHistory(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 days
        const cutoff = new Date(Date.now() - maxAge);
        const originalCount = this.commandHistory.length;
        
        this.commandHistory = this.commandHistory.filter(record => 
            new Date(record.timestamp) > cutoff
        );
        
        const removedCount = originalCount - this.commandHistory.length;
        
        if (removedCount > 0) {
            this.saveAllowedCommands();
            console.log(`🧹 Cleaned up ${removedCount} old command history records`);
        }
        
        return removedCount;
    }

    generateActionId() {
        return `action_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    reset() {
        this.allowedCommands.clear();
        this.commandHistory = [];
        this.saveAllowedCommands();
        this.emit('service_reset');
    }
}

// Export singleton instance
module.exports = new AllowedCommandsService();
