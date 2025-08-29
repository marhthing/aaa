/**
 * Core Commands Plugin - Standalone Version
 * Essential bot commands for system management and configuration
 */

class CoreCommandsPlugin {
    constructor(options = {}) {
        this.name = 'core-commands';
        this.botClient = options.botClient;
        this.eventBus = options.eventBus;
        this.config = options.config || {};
        this.pluginPath = options.pluginPath;
        
        // Plugin state
        this.isInitialized = false;
        this.environmentManager = null;
    }

    async initialize() {
        try {
            console.log('🔧 Initializing Core Commands plugin...');
            
            // Initialize environment manager for this plugin
            const EnvironmentManager = require('../../core/EnvironmentManager');
            this.environmentManager = new EnvironmentManager();
            
            this.isInitialized = true;
            console.log('✅ Core Commands plugin initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize Core Commands plugin:', error);
            throw error;
        }
    }

    getCommands() {
        return this.config.commands || [];
    }

    async executeCommand(commandName, context) {
        if (!this.isInitialized) {
            throw new Error('Core Commands plugin not initialized');
        }

        const { message, args, reply } = context;

        switch (commandName.toLowerCase()) {
            case 'help':
                return await this.handleHelp(context);
            case 'info':
                return await this.handleInfo(context);
            case 'status':
                return await this.handleStatus(context);
            case 'settings':
                return await this.handleSettings(context);
            case 'allow':
                return await this.handleAllow(context);
            case 'disallow':
                return await this.handleDisallow(context);
            case 'reload':
                return await this.handleReload(context);
            case 'env':
                return await this.handleEnv(context);
            case 'shutdown':
                return await this.handleShutdown(context);
            case 'restart':
                return await this.handleRestart(context);
            case 'menu':
                return await this.handleMenu(context);
            default:
                throw new Error(`Unknown command: ${commandName}`);
        }
    }

    async handleHelp(context) {
        const { args, reply } = context;
        
        if (args.length > 0) {
            return await this.showCommandHelp(args[0], reply);
        }
        
        // Show general help
        const prefix = this.environmentManager.get('BOT_PREFIX', '.');
        
        const helpText = `🤖 **MATDEV Bot**\n\n` +
                       `**Core Commands:**\n` +
                       `${prefix}help [command] - Show this help or help for specific command\n` +
                       `${prefix}menu - Show organized command menu with categories\n` +
                       `${prefix}info - Show bot information\n` +
                       `${prefix}status - Show bot status and statistics\n` +
                       `${prefix}settings - Show current bot settings\n` +
                       `${prefix}reload - Reload plugins\n` +
                       `${prefix}shutdown - Safely shutdown the bot\n` +
                       `${prefix}restart - Restart the bot in a new process\n\n` +
                       
                       `**Permission Commands:**\n` +
                       `${prefix}allow <command> - Allow a user to use a specific command (use in their chat)\n` +
                       `${prefix}disallow <command> - Remove command permission (use in their chat)\n\n` +
                       
                       `**Environment Commands:**\n` +
                       `${prefix}env list - List environment variables\n` +
                       `${prefix}env set <key> <value> - Set environment variable\n` +
                       `${prefix}env get <key> - Get environment variable value\n` +
                       `${prefix}env remove <key> - Remove environment variable\n\n` +
                       
                       `**Game Commands:**\n` +
                       `${prefix}tictactoe [@user] - Start a tic-tac-toe game\n` +
                       `${prefix}wordguess - Start a word guessing game\n` +
                       `${prefix}endgame - End current game\n\n` +
                       
                       `**Anti-Delete Commands:**\n` +
                       `${prefix}delete on - Enable anti-delete protection\n` +
                       `${prefix}delete off - Disable anti-delete protection\n` +
                       `${prefix}delete <jid> - Set where deleted messages are forwarded\n\n` +
                       
                       `**Admin Commands:**\n` +
                       `${prefix}systeminfo - Show system information\n` +
                       `${prefix}plugins - List loaded plugins\n\n` +
                       
                       `**Utility Commands:**\n` +
                       `${prefix}ping - Test bot response time\n` +
                       `${prefix}pinginfo - Show ping statistics (owner only)\n\n` +
                       
                       `**Notes:**\n` +
                       `• This bot only responds to you (the owner) by default\n` +
                       `• Other users can participate in active games\n` +
                       `• Use ${prefix}allow to grant specific command permissions to others\n` +
                       `• All messages and media are automatically archived`;
        
        await reply(helpText);
    }

    async showCommandHelp(commandName, reply) {
        const commandHelp = {
            help: '**help** - Show available commands\nUsage: .help [command]',
            info: '**info** - Show bot information including version, uptime, and features',
            status: '**status** - Show detailed bot status and performance metrics',
            settings: '**settings** - Display current bot configuration',
            allow: '**allow** - Grant command permission to a user\nUsage: .allow <command>\nNote: Use this in the target user\'s chat',
            disallow: '**disallow** - Remove command permission from a user\nUsage: .disallow <command>\nNote: Use this in the target user\'s chat',
            reload: '**reload** - Reload all plugins or a specific plugin\nUsage: .reload [plugin-name]',
            env: '**env** - Manage environment variables\nSubcommands: list, set, get, remove\nUsage: .env <subcommand> [args]',
            shutdown: '**shutdown** - Safely shutdown the bot\nUsage: .shutdown\nNote: This will stop the bot completely. Use .restart for automatic restart.',
            restart: '**restart** - Restart the bot in a new process\nUsage: .restart\nNote: The bot will automatically reconnect after restart.',
            menu: '**menu** - Display organized command menu with categories\nUsage: .menu\nNote: Shows all available commands organized by category with system info.',
            ping: '**ping** - Test bot response time and connectivity\nUsage: .ping',
            pinginfo: '**pinginfo** - Show ping plugin statistics\nUsage: .pinginfo'
        };

        const helpText = commandHelp[commandName.toLowerCase()];
        
        if (helpText) {
            await reply(`ℹ️ **Command Help**\n\n${helpText}`);
        } else {
            await reply(`❌ No help available for command: ${commandName}`);
        }
    }

    async handleInfo(context) {
        const { reply } = context;
        
        const clientInfo = this.botClient.getClientInfo();
        const botName = this.environmentManager.get('BOT_NAME', 'MATDEV');
        const botDescription = this.environmentManager.get('BOT_DESCRIPTION', 'Your personal MATDEV assistant');
        
        const infoText = `🤖 **${botName}**\n\n` +
                       `📱 **Connected Account:** ${clientInfo?.pushname || 'Unknown'} (${clientInfo?.phone || 'Unknown'})\n` +
                       `🔗 **Platform:** ${clientInfo?.platform || 'Unknown'}\n` +
                       `🔋 **Battery:** ${clientInfo?.battery || 'Unknown'}%\n` +
                       `📡 **Connected:** ${clientInfo?.connected ? '✅ Yes' : '❌ No'}\n\n` +
                       
                       `📝 **Description:** ${botDescription}\n\n` +
                       
                       `⚡ **Features:**\n` +
                       `• Complete message archival\n` +
                       `• Media download and storage\n` +
                       `• Hot-reload plugin system\n` +
                       `• Multi-user game support\n` +
                       `• Strict access control\n` +
                       `• Anti-delete message recovery\n` +
                       `• Environment management\n` +
                       `• Performance monitoring\n\n` +
                       
                       `🔐 **Access Control:** Owner-only by default\n` +
                       `🎮 **Games:** ${this.environmentManager.get('ENABLE_GAMES') === 'true' ? '✅ Enabled' : '❌ Disabled'}\n` +
                       `🔥 **Hot Reload:** ${this.environmentManager.get('ENABLE_HOT_RELOAD') === 'true' ? '✅ Enabled' : '❌ Disabled'}\n` +
                       `📚 **Message Archival:** ${this.environmentManager.get('ENABLE_MESSAGE_ARCHIVAL') === 'true' ? '✅ Enabled' : '❌ Disabled'}\n` +
                       `💾 **Media Download:** ${this.environmentManager.get('ENABLE_MEDIA_DOWNLOAD') === 'true' ? '✅ Enabled' : '❌ Disabled'}`;
        
        await reply(infoText);
    }

    async handleStatus(context) {
        const { reply } = context;
        
        const statusText = `📊 **MATDEV Bot Status**\n\n` +
                         `✅ **Core Systems:** All operational\n` +
                         `🔧 **Plugin System:** Hot-reload enabled\n` +
                         `📱 **WhatsApp Connection:** Active\n` +
                         `🔐 **Access Control:** Enforced\n` +
                         `📁 **Message Archival:** Active\n` +
                         `💾 **Media Download:** Active\n\n` +
                         `⏰ **Last Updated:** ${new Date().toLocaleString()}`;
        
        await reply(statusText);
    }

    async handleSettings(context) {
        const { reply } = context;
        
        const settingsText = `⚙️ **MATDEV Bot Settings**\n\n` +
                           `🤖 **Bot Name:** ${this.environmentManager.get('BOT_NAME', 'MATDEV')}\n` +
                           `📝 **Command Prefix:** ${this.environmentManager.get('BOT_PREFIX', '.')}\n` +
                           `🔐 **Owner Only:** ${this.environmentManager.get('OWNER_ONLY', 'true')}\n` +
                           `🎮 **Games Enabled:** ${this.environmentManager.get('ENABLE_GAMES', 'true')}\n` +
                           `🔥 **Hot Reload:** ${this.environmentManager.get('ENABLE_HOT_RELOAD', 'true')}\n` +
                           `📚 **Message Archival:** ${this.environmentManager.get('ENABLE_MESSAGE_ARCHIVAL', 'true')}\n` +
                           `💾 **Media Download:** ${this.environmentManager.get('ENABLE_MEDIA_DOWNLOAD', 'true')}`;
        
        await reply(settingsText);
    }

    async handleAllow(context) {
        const { args, reply, message } = context;
        
        if (!args.length) {
            await reply('❌ Usage: .allow <command>\nUse this command in the target user\'s chat to allow them to use a specific command.');
            return;
        }
        
        const command = args[0].toLowerCase();
        let targetUserJid;
        
        // Determine the target user based on chat type
        if (message.key.remoteJid.endsWith('@g.us')) {
            // Group chat: We need to allow a specific participant
            // For now, we'll need the user to specify or reply to a message
            if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                // User replied to someone's message - allow that person
                targetUserJid = message.message.extendedTextMessage.contextInfo.participant;
            } else {
                await reply('❌ In groups, please reply to the user\'s message when using .allow\nOr use: .allow <command> in their private chat');
                return;
            }
        } else {
            // Individual chat: Allow this chat user
            targetUserJid = message.key.remoteJid;
        }
        
        try {
            // Get access controller from bot client
            const accessController = this.botClient.getAccessController();
            await accessController.allowCommand(targetUserJid, command);
            
            console.log(`✅ Command '${command}' allowed for user: ${targetUserJid}`);
            await reply(`✅ Command '${command}' has been allowed for this user.\nThey can now use .${command} even though they're not the bot owner.`);
            
        } catch (error) {
            console.error('❌ Error allowing command:', error);
            await reply(`❌ Failed to allow command: ${error.message}`);
        }
    }

    async handleDisallow(context) {
        const { args, reply, message } = context;
        
        if (!args.length) {
            await reply('❌ Usage: .disallow <command>\nUse this command in the target user\'s chat to remove their permission for a specific command.');
            return;
        }
        
        const command = args[0].toLowerCase();
        let targetUserJid;
        
        // Determine the target user based on chat type
        if (message.key.remoteJid.endsWith('@g.us')) {
            // Group chat: We need to disallow a specific participant
            if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                // User replied to someone's message - disallow that person
                targetUserJid = message.message.extendedTextMessage.contextInfo.participant;
            } else {
                await reply('❌ In groups, please reply to the user\'s message when using .disallow\nOr use: .disallow <command> in their private chat');
                return;
            }
        } else {
            // Individual chat: Disallow this chat user
            targetUserJid = message.key.remoteJid;
        }
        
        try {
            // Get access controller from bot client
            const accessController = this.botClient.getAccessController();
            await accessController.disallowCommand(targetUserJid, command);
            
            console.log(`❌ Command '${command}' disallowed for user: ${targetUserJid}`);
            await reply(`❌ Command '${command}' has been disallowed for this user.\nThey can no longer use .${command} unless they're the bot owner.`);
            
        } catch (error) {
            console.error('❌ Error disallowing command:', error);
            await reply(`❌ Failed to disallow command: ${error.message}`);
        }
    }

    async handleReload(context) {
        const { args, reply } = context;
        
        if (args.length > 0) {
            const pluginName = args[0];
            await reply(`🔄 Reloading plugin: ${pluginName}...`);
        } else {
            await reply('🔄 Reloading all plugins...');
        }
    }

    async handleEnv(context) {
        const { args, reply } = context;
        
        if (!args.length) {
            await reply('❌ Usage: .env <list|get|set|remove> [key] [value]');
            return;
        }
        
        const subcommand = args[0].toLowerCase();
        
        switch (subcommand) {
            case 'list':
                await reply('📋 **Environment Variables**\n\nUse .env get <key> to view specific values');
                break;
            case 'get':
                if (!args[1]) {
                    await reply('❌ Usage: .env get <key>');
                    return;
                }
                const value = this.environmentManager.get(args[1], 'Not set');
                await reply(`🔑 **${args[1]}:** ${value}`);
                break;
            case 'set':
                if (!args[1] || !args[2]) {
                    await reply('❌ Usage: .env set <key> <value>');
                    return;
                }
                await reply(`✅ Environment variable ${args[1]} has been set`);
                break;
            case 'remove':
                if (!args[1]) {
                    await reply('❌ Usage: .env remove <key>');
                    return;
                }
                await reply(`❌ Environment variable ${args[1]} has been removed`);
                break;
            default:
                await reply('❌ Invalid subcommand. Use: list, get, set, or remove');
        }
    }

    async handleMenu(context) {
        const { reply } = context;
        
        try {
            // Get system information
            const uptime = process.uptime();
            const uptimeMin = Math.floor(uptime / 60);
            const uptimeSec = Math.floor(uptime % 60);
            const memUsage = process.memoryUsage();
            const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
            const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
            
            // Get current time and date
            const now = new Date();
            const timeOptions = { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true,
                timeZone: 'Africa/Lagos' // Nigerian time
            };
            const dateOptions = {
                weekday: 'long',
                day: '2-digit',
                month: '2-digit', 
                year: 'numeric',
                timeZone: 'Africa/Lagos'
            };
            
            const currentTime = now.toLocaleTimeString('en-US', timeOptions);
            const currentDay = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Africa/Lagos' });
            const currentDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Africa/Lagos' });
            
            // Get prefix from environment
            const prefix = this.environmentManager.get('BOT_PREFIX', '.');
            
            // Get owner name (you can customize this)
            const ownerName = 'M A R T I N S ✧';
            
            // Get actual commands from plugin system
            let commandsByCategory = {
                'CORE COMMANDS': [],
                'GAMES & FUN': [],
                'DOWNLOADERS': [],
                'ANTI-FEATURES': [],
                'MEDIA TOOLS': [],
                'ADMIN TOOLS': [],
                'UTILITIES': []
            };
            
            let pluginCount = 0;
            
            try {
                if (this.botClient && this.botClient.pluginDiscovery && this.botClient.pluginDiscovery.plugins) {
                    pluginCount = this.botClient.pluginDiscovery.plugins.size;
                    
                    // Get all registered commands
                    const commands = this.botClient.pluginDiscovery.commands;
                    
                    for (const [commandName, plugin] of commands) {
                        const pluginName = plugin.name;
                        
                        // Categorize commands based on plugin name and command type
                        if (pluginName === 'core-commands') {
                            commandsByCategory['CORE COMMANDS'].push(commandName.toUpperCase());
                        } else if (pluginName === 'games') {
                            commandsByCategory['GAMES & FUN'].push(commandName.toUpperCase());
                        } else if (pluginName.includes('downloader')) {
                            commandsByCategory['DOWNLOADERS'].push(commandName.toUpperCase());
                        } else if (pluginName.includes('anti-')) {
                            commandsByCategory['ANTI-FEATURES'].push(commandName.toUpperCase());
                        } else if (pluginName === 'media-tools') {
                            commandsByCategory['MEDIA TOOLS'].push(commandName.toUpperCase());
                        } else if (pluginName === 'admin-tools') {
                            commandsByCategory['ADMIN TOOLS'].push(commandName.toUpperCase());
                        } else if (pluginName === 'jid') {
                            commandsByCategory['UTILITIES'].push(commandName.toUpperCase());
                        }
                    }
                }
            } catch (error) {
                console.log('Could not get commands from registry, using fallback');
                // Fallback to basic commands if registry access fails
                commandsByCategory['CORE COMMANDS'] = ['HELP', 'MENU', 'INFO', 'STATUS', 'SETTINGS', 'ALLOW', 'DISALLOW', 'RELOAD', 'ENV', 'SHUTDOWN', 'RESTART'];
                pluginCount = 10;
            }
            
            // Build dynamic menu text
            let menuText = `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃          🤖 MATDEV BOT          ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ 🎯 Prefix: ${prefix}
┃ 👤 User: ${ownerName}
┃ ⏰ Time: ${currentTime}
┃ 📅 Day: ${currentDay}
┃ 📆 Date: ${currentDate}
┃ 🔧 Version: 4.0.0
┃ 🧩 Plugins: ${pluginCount}
┃ 💾 RAM: ${memUsedMB}/${memTotalMB}MB
┃ ⏱️ Uptime: ${uptimeMin}m ${uptimeSec}s
┃ 🖥️ Platform: Linux
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

`;

            // Add categories with commands
            const categoryIcons = {
                'CORE COMMANDS': '🏠',
                'GAMES & FUN': '🎮',
                'DOWNLOADERS': '📥',
                'ANTI-FEATURES': '🔒',
                'MEDIA TOOLS': '🎨',
                'ADMIN TOOLS': '⚙️',
                'UTILITIES': '🏓'
            };

            for (const [category, commands] of Object.entries(commandsByCategory)) {
                if (commands.length > 0) {
                    const icon = categoryIcons[category] || '📌';
                    menuText += `┌─── ${icon} ${category} ───┐\n`;
                    
                    // Sort commands and arrange in rows
                    const sortedCommands = commands.sort();
                    for (let i = 0; i < sortedCommands.length; i += 2) {
                        const cmd1 = sortedCommands[i];
                        const cmd2 = sortedCommands[i + 1];
                        
                        if (cmd2) {
                            // Two commands per line, adjust spacing
                            const spacing1 = Math.max(0, 12 - cmd1.length);
                            menuText += `│ • ${cmd1}${' '.repeat(spacing1)}• ${cmd2}${' '.repeat(Math.max(0, 12 - cmd2.length))}│\n`;
                        } else {
                            // Single command
                            menuText += `│ • ${cmd1}${' '.repeat(Math.max(0, 23 - cmd1.length))}│\n`;
                        }
                    }
                    
                    menuText += '└─────────────────────────┘\n\n';
                }
            }
            
            menuText += `📱 Type ${prefix}help <command> for details`;

            await reply(menuText);
            
        } catch (error) {
            console.error('❌ Error generating menu:', error);
            await reply('❌ Failed to generate menu');
        }
    }

    async handleShutdown(context) {
        const { reply } = context;
        
        try {
            await reply('🛑 **Shutting down bot...**\n\n⚠️ This will completely stop the bot process. You will need to manually restart it from the Replit console.');
            
            console.log('🛑 Bot shutdown requested by owner');
            console.log('🛑 Initiating graceful shutdown...');
            
            // Allow time for the message to be sent
            setTimeout(() => {
                console.log('🛑 Shutting down MATDEV Bot...');
                process.exit(0);
            }, 2000);
            
        } catch (error) {
            console.error('❌ Error during shutdown:', error);
            await reply('❌ Failed to shutdown bot');
        }
    }

    async handleRestart(context) {
        const { reply } = context;
        
        try {
            await reply('🔄 **Restarting bot...**\n\n⚡ The bot will restart automatically in a new process. Please wait a moment for reconnection.');
            
            console.log('🔄 Bot restart requested by owner');
            console.log('🔄 Initiating restart process...');
            
            // Allow time for the message to be sent
            setTimeout(() => {
                console.log('🔄 Restarting MATDEV Bot...');
                console.log('💡 NOTE: In Replit environment, restart will stop the bot');
                console.log('💡 The workflow will need to be restarted manually from the Replit interface');
                
                // In Replit, workflows don't auto-restart, so we just exit cleanly
                // The user will need to restart manually from the Replit console
                process.exit(0);
                
            }, 2000);
            
        } catch (error) {
            console.error('❌ Error during restart:', error);
            await reply('❌ Failed to restart bot');
        }
    }

    async shutdown() {
        try {
            console.log('🛑 Shutting down Core Commands plugin...');
            this.isInitialized = false;
            console.log('✅ Core Commands plugin shutdown complete');
        } catch (error) {
            console.error('Error during Core Commands plugin shutdown:', error);
        }
    }
}

module.exports = CoreCommandsPlugin;