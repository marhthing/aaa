/**
 * MatDev Command Class
 * Command registration and execution system
 */

const logger = require('../utils/logger');
const BotError = require('./BotError');

class Command {
    constructor(bot) {
        this.bot = bot;
        this.commands = new Map();
        this.aliases = new Map();
        this.categories = new Set();
        this.middleware = [];
        
        logger.info('🎮 Command system initialized');
    }
    
    /**
     * Register a command
     */
    register(commandData) {
        try {
            // Validate command data
            this.validateCommand(commandData);
            
            const {
                command,
                aliases = [],
                category = 'general',
                description = 'No description',
                usage = '',
                fromMe = false,
                type = 'whatsapp',
                cooldown = 0,
                adminOnly = false,
                groupOnly = false,
                privateOnly = false,
                sudoOnly = false,
                execute
            } = commandData;
            
            // Normalize command names
            const commands = Array.isArray(command) ? command : [command];
            const primaryCommand = commands[0].toLowerCase();
            
            // Create command object
            const cmd = {
                name: primaryCommand,
                commands: commands.map(c => c.toLowerCase()),
                aliases: aliases.map(a => a.toLowerCase()),
                category,
                description,
                usage,
                fromMe,
                type,
                cooldown,
                adminOnly,
                groupOnly,
                privateOnly,
                sudoOnly,
                execute,
                plugin: commandData.plugin || 'unknown',
                registeredAt: new Date()
            };
            
            // Register primary command and aliases
            [...commands, ...aliases].forEach(cmdName => {
                const normalizedName = cmdName.toLowerCase();
                this.commands.set(normalizedName, cmd);
                
                if (cmdName !== primaryCommand) {
                    this.aliases.set(normalizedName, primaryCommand);
                }
            });
            
            // Add category
            this.categories.add(category);
            
            logger.debug(`📝 Registered command: ${primaryCommand} (${commands.length + aliases.length} variants)`);
            
            return true;
        } catch (error) {
            logger.error('Failed to register command:', error);
            throw new BotError(`Command registration failed: ${error.message}`, 'COMMAND_REGISTER_ERROR');
        }
    }
    
    /**
     * Validate command data
     */
    validateCommand(commandData) {
        const required = ['command', 'execute'];
        const missing = required.filter(field => !commandData[field]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }
        
        if (typeof commandData.execute !== 'function') {
            throw new Error('execute must be a function');
        }
        
        const commands = Array.isArray(commandData.command) ? commandData.command : [commandData.command];
        if (commands.some(cmd => typeof cmd !== 'string' || cmd.length === 0)) {
            throw new Error('All commands must be non-empty strings');
        }
    }
    
    /**
     * Execute a command
     */
    async execute(message, commandName, args) {
        try {
            const command = this.get(commandName);
            if (!command) {
                return false; // Command not found
            }
            
            // Check permissions
            const permissionCheck = await this.checkPermissions(message, command);
            if (!permissionCheck.allowed) {
                await message.reply(permissionCheck.reason);
                return true;
            }
            
            // Check cooldown
            const cooldownCheck = this.checkCooldown(message.sender, command);
            if (!cooldownCheck.allowed) {
                await message.reply(`⏰ Please wait ${cooldownCheck.remaining}s before using this command again.`);
                return true;
            }
            
            // Run middleware
            for (const middleware of this.middleware) {
                const result = await middleware(message, command, args);
                if (result === false) {
                    return true; // Middleware blocked execution
                }
            }
            
            // Execute command
            logger.info(`🎮 Executing command: ${command.name} by ${message.sender}`);
            
            const startTime = Date.now();
            await command.execute(this.bot, message, args);
            const executionTime = Date.now() - startTime;
            
            // Log execution
            logger.debug(`✅ Command ${command.name} executed in ${executionTime}ms`);
            
            // Set cooldown
            if (command.cooldown > 0) {
                this.setCooldown(message.sender, command.name, command.cooldown);
            }
            
            return true;
        } catch (error) {
            logger.error(`❌ Command execution failed for ${commandName}:`, error);
            
            // Send error message to user
            try {
                await message.reply(`❌ Command failed: ${error.message}`);
            } catch (replyError) {
                logger.error('Failed to send error message:', replyError);
            }
            
            throw new BotError(`Command execution failed: ${error.message}`, 'COMMAND_EXECUTION_ERROR', true);
        }
    }
    
    /**
     * Check command permissions
     */
    async checkPermissions(message, command) {
        // Sudo only commands
        if (command.sudoOnly && !message.isSudo) {
            return {
                allowed: false,
                reason: '🔒 This command is restricted to bot owners only.'
            };
        }
        
        // Group only commands
        if (command.groupOnly && !message.isGroup) {
            return {
                allowed: false,
                reason: '👥 This command can only be used in groups.'
            };
        }
        
        // Private only commands
        if (command.privateOnly && message.isGroup) {
            return {
                allowed: false,
                reason: '💬 This command can only be used in private chats.'
            };
        }
        
        // Admin only commands (in groups)
        if (command.adminOnly && message.isGroup) {
            await message.setAdminStatus(); // Ensure admin status is set
            if (!message.isAdmin && !message.isSudo) {
                return {
                    allowed: false,
                    reason: '👑 This command requires admin privileges.'
                };
            }
        }
        
        // From me only commands
        if (command.fromMe && !message.isSudo) {
            return {
                allowed: false,
                reason: '🤖 This command is for bot owners only.'
            };
        }
        
        return { allowed: true };
    }
    
    /**
     * Check command cooldown
     */
    checkCooldown(userId, command) {
        if (command.cooldown <= 0) {
            return { allowed: true };
        }
        
        const key = `${userId}:${command.name}`;
        const lastUsed = this.bot.cache.get(`cooldown:${key}`);
        
        if (!lastUsed) {
            return { allowed: true };
        }
        
        const remaining = Math.ceil((lastUsed + (command.cooldown * 1000) - Date.now()) / 1000);
        
        if (remaining > 0) {
            return {
                allowed: false,
                remaining
            };
        }
        
        return { allowed: true };
    }
    
    /**
     * Set command cooldown
     */
    setCooldown(userId, commandName, cooldown) {
        const key = `${userId}:${commandName}`;
        this.bot.cache.set(`cooldown:${key}`, Date.now(), cooldown * 1000);
    }
    
    /**
     * Get a command
     */
    get(commandName) {
        const normalizedName = commandName.toLowerCase();
        return this.commands.get(normalizedName);
    }
    
    /**
     * Check if command exists
     */
    has(commandName) {
        return this.commands.has(commandName.toLowerCase());
    }
    
    /**
     * Get all commands
     */
    getAll() {
        const commands = new Map();
        
        for (const [name, command] of this.commands) {
            if (!this.aliases.has(name)) {
                commands.set(name, command);
            }
        }
        
        return commands;
    }
    
    /**
     * Get commands by category
     */
    getByCategory(category) {
        const commands = [];
        
        for (const command of this.getAll().values()) {
            if (command.category === category) {
                commands.push(command);
            }
        }
        
        return commands;
    }
    
    /**
     * Get all categories
     */
    getCategories() {
        return Array.from(this.categories).sort();
    }
    
    /**
     * Unregister a command
     */
    unregister(commandName) {
        const command = this.get(commandName);
        if (!command) {
            return false;
        }
        
        // Remove all variants
        [...command.commands, ...command.aliases].forEach(cmdName => {
            this.commands.delete(cmdName.toLowerCase());
            this.aliases.delete(cmdName.toLowerCase());
        });
        
        logger.debug(`🗑️ Unregistered command: ${command.name}`);
        return true;
    }
    
    /**
     * Add middleware
     */
    use(middleware) {
        if (typeof middleware !== 'function') {
            throw new Error('Middleware must be a function');
        }
        
        this.middleware.push(middleware);
        logger.debug('🔧 Added command middleware');
    }
    
    /**
     * Get command statistics
     */
    getStats() {
        const allCommands = this.getAll();
        const categories = {};
        
        for (const command of allCommands.values()) {
            if (!categories[command.category]) {
                categories[command.category] = 0;
            }
            categories[command.category]++;
        }
        
        return {
            totalCommands: allCommands.size,
            totalAliases: this.aliases.size,
            categories: categories,
            middleware: this.middleware.length
        };
    }
}

module.exports = Command;
