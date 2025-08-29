/**
 * Help Plugin - Display available commands and usage
 */

module.exports = {
    name: 'help',
    description: 'Display help information and available commands',
    version: '1.0.0',
    command: ['help', 'menu', 'commands'],
    category: 'general',
    usage: '[command_name]',
    fromMe: false,
    type: 'whatsapp',
    
    async execute(bot, message, args) {
        try {
            const specificCommand = args[0];
            
            if (specificCommand) {
                // Show help for specific command
                await this.showCommandHelp(message, specificCommand, bot);
            } else {
                // Show general help menu
                await this.showGeneralHelp(message, bot);
            }
            
        } catch (error) {
            await message.reply('❌ Error displaying help information.');
            throw error;
        }
    },
    
    /**
     * Show general help menu
     */
    async showGeneralHelp(message, bot) {
        try {
            const prefix = bot.config.PREFIX;
            const botName = bot.config.BOT_NAME;
            
            // Get all commands grouped by category
            const commandsByCategory = {};
            
            if (bot.commandManager) {
                const allCommands = bot.commandManager.getAll();
                
                for (const [name, command] of allCommands) {
                    const category = command.category || 'general';
                    
                    if (!commandsByCategory[category]) {
                        commandsByCategory[category] = [];
                    }
                    
                    commandsByCategory[category].push({
                        name: command.name,
                        description: command.description,
                        usage: command.usage
                    });
                }
            }
            
            let helpText = `🤖 *${botName} Help Menu*\n\n`;
            helpText += `📋 *Prefix:* ${prefix}\n`;
            helpText += `👤 *User:* @${message.sender.split('@')[0]}\n`;
            helpText += `💬 *Chat:* ${message.isGroup ? 'Group' : 'Private'}\n\n`;
            
            // Display commands by category
            const categories = Object.keys(commandsByCategory).sort();
            
            for (const category of categories) {
                const categoryIcon = this.getCategoryIcon(category);
                helpText += `${categoryIcon} *${category.toUpperCase()}*\n`;
                
                const commands = commandsByCategory[category];
                for (const cmd of commands) {
                    helpText += `• ${prefix}${cmd.name}`;
                    if (cmd.usage) {
                        helpText += ` ${cmd.usage}`;
                    }
                    helpText += `\n`;
                }
                helpText += '\n';
            }
            
            helpText += `💡 *Tip:* Use ${prefix}help <command> for detailed information about a specific command.\n\n`;
            helpText += `📊 *Stats:* ${Object.keys(commandsByCategory).length} categories, `;
            
            const totalCommands = Object.values(commandsByCategory)
                .reduce((total, cmds) => total + cmds.length, 0);
            helpText += `${totalCommands} commands available\n\n`;
            
            helpText += `🔗 *Support:* Join our support group for help and updates\n`;
            helpText += `⚡ *Version:* MatDev Bot v1.0.0`;
            
            await message.reply({
                text: helpText,
                mentions: [message.sender]
            });
            
        } catch (error) {
            throw error;
        }
    },
    
    /**
     * Show help for specific command
     */
    async showCommandHelp(message, commandName, bot) {
        try {
            if (!bot.commandManager) {
                await message.reply('❌ Command system not initialized.');
                return;
            }
            
            const command = bot.commandManager.get(commandName);
            
            if (!command) {
                await message.reply(`❓ Command "${commandName}" not found.\n\nUse ${bot.config.PREFIX}help to see all available commands.`);
                return;
            }
            
            const prefix = bot.config.PREFIX;
            let helpText = `📖 *Command Help*\n\n`;
            
            helpText += `🔧 *Command:* ${command.name}\n`;
            helpText += `📝 *Description:* ${command.description}\n`;
            helpText += `📂 *Category:* ${command.category}\n`;
            helpText += `💻 *Usage:* ${prefix}${command.name}`;
            
            if (command.usage) {
                helpText += ` ${command.usage}`;
            }
            helpText += '\n\n';
            
            // Show aliases if any
            if (command.aliases && command.aliases.length > 0) {
                helpText += `🏷️ *Aliases:* ${command.aliases.map(alias => prefix + alias).join(', ')}\n`;
            }
            
            // Show additional commands if any
            if (command.commands && command.commands.length > 1) {
                const otherCommands = command.commands.filter(cmd => cmd !== command.name);
                if (otherCommands.length > 0) {
                    helpText += `🔄 *Alternative Commands:* ${otherCommands.map(cmd => prefix + cmd).join(', ')}\n`;
                }
            }
            
            // Show restrictions
            const restrictions = [];
            if (command.sudoOnly) restrictions.push('Owner Only');
            if (command.adminOnly) restrictions.push('Admin Only');
            if (command.groupOnly) restrictions.push('Group Only');
            if (command.privateOnly) restrictions.push('Private Only');
            
            if (restrictions.length > 0) {
                helpText += `🔒 *Restrictions:* ${restrictions.join(', ')}\n`;
            }
            
            // Show cooldown if any
            if (command.cooldown > 0) {
                helpText += `⏰ *Cooldown:* ${command.cooldown} seconds\n`;
            }
            
            helpText += `\n📋 *Examples:*\n`;
            helpText += `• ${prefix}${command.name}`;
            
            if (command.usage) {
                // Generate example based on usage
                const exampleUsage = this.generateExampleUsage(command.usage);
                helpText += ` ${exampleUsage}`;
            }
            
            helpText += `\n\n💡 *Need more help?* Contact bot administrators.`;
            
            await message.reply(helpText);
            
        } catch (error) {
            throw error;
        }
    },
    
    /**
     * Get category icon
     */
    getCategoryIcon(category) {
        const icons = {
            general: '🔧',
            admin: '👑',
            games: '🎮',
            fun: '🎭',
            utilities: '🛠️',
            media: '📁',
            group: '👥',
            owner: '🔐',
            moderation: '🛡️',
            information: 'ℹ️',
            entertainment: '🎪',
            tools: '⚙️'
        };
        
        return icons[category.toLowerCase()] || '📌';
    },
    
    /**
     * Generate example usage from usage string
     */
    generateExampleUsage(usage) {
        return usage
            .replace(/\[([^\]]+)\]/g, (match, content) => {
                // Replace optional parameters with examples
                if (content.includes('command')) return 'ping';
                if (content.includes('text')) return 'Hello World';
                if (content.includes('number')) return '5';
                if (content.includes('user')) return '@user';
                if (content.includes('time')) return '10m';
                return content;
            })
            .replace(/<([^>]+)>/g, (match, content) => {
                // Replace required parameters with examples
                if (content.includes('text')) return 'Hello';
                if (content.includes('number')) return '10';
                if (content.includes('user')) return '@user';
                return content;
            });
    }
};
