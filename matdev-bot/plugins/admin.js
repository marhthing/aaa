/**
 * Admin Plugin - Bot administration and management commands
 */

module.exports = {
    name: 'admin',
    description: 'Bot administration and management commands',
    version: '1.0.0',
    command: ['admin', 'sudo', 'owner'],
    category: 'admin',
    usage: '<subcommand> [parameters]',
    fromMe: false,
    type: 'whatsapp',
    sudoOnly: true,
    cooldown: 3,
    
    async function(message, match, bot) {
        try {
            const args = match ? match.trim().split(' ') : [];
            const subcommand = args[0]?.toLowerCase();
            
            if (!subcommand) {
                await this.showAdminMenu(message, bot);
                return;
            }
            
            switch (subcommand) {
                case 'restart':
                    await this.handleRestart(message, bot);
                    break;
                    
                case 'plugins':
                    await this.handlePlugins(message, args.slice(1), bot);
                    break;
                    
                case 'ban':
                    await this.handleBan(message, args.slice(1), bot);
                    break;
                    
                case 'unban':
                    await this.handleUnban(message, args.slice(1), bot);
                    break;
                    
                case 'broadcast':
                    await this.handleBroadcast(message, args.slice(1), bot);
                    break;
                    
                case 'stats':
                    await this.handleStats(message, bot);
                    break;
                    
                case 'logs':
                    await this.handleLogs(message, args.slice(1), bot);
                    break;
                    
                case 'eval':
                    await this.handleEval(message, args.slice(1), bot);
                    break;
                    
                case 'sql':
                    await this.handleSQL(message, args.slice(1), bot);
                    break;
                    
                case 'backup':
                    await this.handleBackup(message, bot);
                    break;
                    
                default:
                    await message.reply(`❓ Unknown admin command: ${subcommand}\n\nUse ${bot.config.PREFIX}admin for available commands.`);
            }
            
        } catch (error) {
            await message.reply('❌ Admin command failed.');
            throw error;
        }
    },
    
    /**
     * Show admin menu
     */
    async showAdminMenu(message, bot) {
        const prefix = bot.config.PREFIX;
        
        let adminText = `👑 *Admin Control Panel*\n\n`;
        adminText += `🔧 *System Commands:*\n`;
        adminText += `• ${prefix}admin restart - Restart the bot\n`;
        adminText += `• ${prefix}admin stats - System statistics\n`;
        adminText += `• ${prefix}admin backup - Create backup\n`;
        adminText += `• ${prefix}admin logs [count] - View recent logs\n\n`;
        
        adminText += `🔌 *Plugin Management:*\n`;
        adminText += `• ${prefix}admin plugins list - List all plugins\n`;
        adminText += `• ${prefix}admin plugins reload <name> - Reload plugin\n`;
        adminText += `• ${prefix}admin plugins disable <name> - Disable plugin\n`;
        adminText += `• ${prefix}admin plugins enable <name> - Enable plugin\n\n`;
        
        adminText += `👥 *User Management:*\n`;
        adminText += `• ${prefix}admin ban <@user> [reason] - Ban user\n`;
        adminText += `• ${prefix}admin unban <@user> - Unban user\n\n`;
        
        adminText += `📢 *Communication:*\n`;
        adminText += `• ${prefix}admin broadcast <message> - Broadcast to all groups\n\n`;
        
        adminText += `⚡ *Advanced:*\n`;
        adminText += `• ${prefix}admin eval <code> - Execute JavaScript\n`;
        adminText += `• ${prefix}admin sql <query> - Execute SQL query\n\n`;
        
        adminText += `⚠️ *Warning:* These commands have system-wide effects. Use with caution.`;
        
        await message.reply(adminText);
    },
    
    /**
     * Handle bot restart
     */
    async handleRestart(message, bot) {
        await message.reply('🔄 Restarting bot...');
        
        setTimeout(async () => {
            try {
                await bot.restart();
            } catch (error) {
                await message.reply('❌ Restart failed: ' + error.message);
            }
        }, 2000);
    },
    
    /**
     * Handle plugin management
     */
    async handlePlugins(message, args, bot) {
        const action = args[0]?.toLowerCase();
        const pluginName = args[1];
        
        if (!action) {
            await message.reply(`❓ Plugin action required.\n\nAvailable: list, reload, enable, disable`);
            return;
        }
        
        switch (action) {
            case 'list':
                await this.listPlugins(message, bot);
                break;
                
            case 'reload':
                if (!pluginName) {
                    await message.reply('❓ Plugin name required for reload.');
                    return;
                }
                await this.reloadPlugin(message, pluginName, bot);
                break;
                
            case 'enable':
                if (!pluginName) {
                    await message.reply('❓ Plugin name required for enable.');
                    return;
                }
                await this.togglePlugin(message, pluginName, true, bot);
                break;
                
            case 'disable':
                if (!pluginName) {
                    await message.reply('❓ Plugin name required for disable.');
                    return;
                }
                await this.togglePlugin(message, pluginName, false, bot);
                break;
                
            default:
                await message.reply(`❓ Unknown plugin action: ${action}`);
        }
    },
    
    /**
     * List all plugins
     */
    async listPlugins(message, bot) {
        const plugins = bot.pluginManager.getPluginList();
        
        if (plugins.length === 0) {
            await message.reply('📭 No plugins loaded.');
            return;
        }
        
        let pluginText = `🔌 *Loaded Plugins (${plugins.length})*\n\n`;
        
        const categories = {};
        plugins.forEach(plugin => {
            const category = plugin.metadata.category || 'general';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(plugin);
        });
        
        for (const [category, categoryPlugins] of Object.entries(categories)) {
            pluginText += `📂 *${category.toUpperCase()}*\n`;
            
            categoryPlugins.forEach(plugin => {
                const status = plugin.enabled ? '✅' : '❌';
                const commands = plugin.metadata.commands.join(', ');
                
                pluginText += `${status} ${plugin.name}\n`;
                pluginText += `   Commands: ${commands}\n`;
                pluginText += `   Executions: ${plugin.stats.executions}\n`;
                pluginText += `   Errors: ${plugin.stats.errors}\n\n`;
            });
        }
        
        await message.reply(pluginText);
    },
    
    /**
     * Reload a plugin
     */
    async reloadPlugin(message, pluginName, bot) {
        try {
            const result = await bot.pluginManager.reloadPlugin(pluginName);
            await message.reply(`✅ Plugin "${pluginName}" reloaded successfully.`);
        } catch (error) {
            await message.reply(`❌ Failed to reload plugin "${pluginName}": ${error.message}`);
        }
    },
    
    /**
     * Toggle plugin enabled/disabled
     */
    async togglePlugin(message, pluginName, enabled, bot) {
        try {
            const success = bot.pluginManager.togglePlugin(pluginName, enabled);
            
            if (success) {
                const action = enabled ? 'enabled' : 'disabled';
                await message.reply(`✅ Plugin "${pluginName}" ${action}.`);
            } else {
                await message.reply(`❌ Plugin "${pluginName}" not found.`);
            }
        } catch (error) {
            await message.reply(`❌ Failed to toggle plugin: ${error.message}`);
        }
    },
    
    /**
     * Handle user ban
     */
    async handleBan(message, args, bot) {
        const userJid = this.extractJid(args[0]);
        const reason = args.slice(1).join(' ') || 'No reason specified';
        
        if (!userJid) {
            await message.reply('❓ Please mention a user to ban.\n\nUsage: admin ban @user [reason]');
            return;
        }
        
        try {
            await bot.database.updateUser(userJid, {
                isBanned: true,
                banReason: reason,
                banExpiry: null // Permanent ban
            });
            
            await message.reply(`🔨 User @${userJid.split('@')[0]} has been banned.\n\nReason: ${reason}`);
            
        } catch (error) {
            await message.reply('❌ Failed to ban user.');
        }
    },
    
    /**
     * Handle user unban
     */
    async handleUnban(message, args, bot) {
        const userJid = this.extractJid(args[0]);
        
        if (!userJid) {
            await message.reply('❓ Please mention a user to unban.\n\nUsage: admin unban @user');
            return;
        }
        
        try {
            await bot.database.updateUser(userJid, {
                isBanned: false,
                banReason: null,
                banExpiry: null
            });
            
            await message.reply(`✅ User @${userJid.split('@')[0]} has been unbanned.`);
            
        } catch (error) {
            await message.reply('❌ Failed to unban user.');
        }
    },
    
    /**
     * Handle broadcast message
     */
    async handleBroadcast(message, args, bot) {
        const broadcastMessage = args.join(' ');
        
        if (!broadcastMessage) {
            await message.reply('❓ Please provide a message to broadcast.\n\nUsage: admin broadcast <message>');
            return;
        }
        
        try {
            // Get all active groups
            const Group = bot.database.getModel('Group');
            const groups = await Group.findAll({
                where: { isActive: true }
            });
            
            let successCount = 0;
            let failCount = 0;
            
            await message.reply(`📡 Broadcasting message to ${groups.length} groups...`);
            
            for (const group of groups) {
                try {
                    await bot.sendMessage(group.jid, {
                        text: `📢 *Admin Broadcast*\n\n${broadcastMessage}`
                    });
                    
                    successCount++;
                    
                    // Add delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                } catch (error) {
                    failCount++;
                }
            }
            
            await message.reply(`✅ Broadcast completed!\n\n✅ Success: ${successCount}\n❌ Failed: ${failCount}`);
            
        } catch (error) {
            await message.reply('❌ Broadcast failed.');
        }
    },
    
    /**
     * Handle system statistics
     */
    async handleStats(message, bot) {
        try {
            const botStats = bot.getStats();
            const dbStats = await bot.database.getStats();
            const pluginStats = bot.pluginManager.getStats();
            
            let statsText = `📊 *System Statistics*\n\n`;
            
            // Bot stats
            statsText += `🤖 *Bot Status:*\n`;
            statsText += `• Connection: ${botStats.isConnected ? '✅ Connected' : '❌ Disconnected'}\n`;
            statsText += `• Uptime: ${this.formatUptime(botStats.uptime)}\n`;
            statsText += `• Memory: ${(botStats.memoryUsage.rss / 1024 / 1024).toFixed(2)}MB\n`;
            statsText += `• Platform: ${botStats.platform}\n\n`;
            
            // Database stats
            statsText += `💾 *Database:*\n`;
            statsText += `• Status: ${dbStats.isConnected ? '✅ Connected' : '❌ Disconnected'}\n`;
            statsText += `• Type: ${dbStats.dbType}\n`;
            
            if (dbStats.records) {
                statsText += `• Users: ${dbStats.records.User || 0}\n`;
                statsText += `• Groups: ${dbStats.records.Group || 0}\n`;
                statsText += `• Logs: ${dbStats.records.Log || 0}\n`;
            }
            statsText += '\n';
            
            // Plugin stats
            statsText += `🔌 *Plugins:*\n`;
            statsText += `• Total: ${pluginStats.totalPlugins}\n`;
            statsText += `• Enabled: ${pluginStats.enabledPlugins}\n`;
            statsText += `• Executions: ${pluginStats.totalExecutions}\n`;
            statsText += `• Error Rate: ${pluginStats.errorRate}%\n\n`;
            
            statsText += `🕐 *Generated:* ${new Date().toLocaleString()}`;
            
            await message.reply(statsText);
            
        } catch (error) {
            await message.reply('❌ Failed to get statistics.');
        }
    },
    
    /**
     * Handle logs viewing
     */
    async handleLogs(message, args, bot) {
        const count = parseInt(args[0]) || 10;
        
        if (count > 50) {
            await message.reply('❌ Maximum 50 logs can be displayed at once.');
            return;
        }
        
        try {
            const Log = bot.database.getModel('Log');
            const logs = await Log.findAll({
                order: [['createdAt', 'DESC']],
                limit: count
            });
            
            if (logs.length === 0) {
                await message.reply('📭 No logs found.');
                return;
            }
            
            let logText = `📋 *Recent Logs (${logs.length})*\n\n`;
            
            logs.reverse().forEach(log => {
                const time = new Date(log.createdAt).toLocaleTimeString();
                const level = log.level.toUpperCase();
                const message = log.message.substring(0, 100);
                
                logText += `[${time}] ${level}: ${message}\n`;
                
                if (logText.length > 3000) {
                    logText += '... (truncated)';
                    return;
                }
            });
            
            await message.reply(logText);
            
        } catch (error) {
            await message.reply('❌ Failed to retrieve logs.');
        }
    },
    
    /**
     * Handle JavaScript evaluation
     */
    async handleEval(message, args, bot) {
        const code = args.join(' ');
        
        if (!code) {
            await message.reply('❓ Please provide JavaScript code to evaluate.\n\nUsage: admin eval <code>');
            return;
        }
        
        try {
            await message.reply('⚡ Evaluating code...');
            
            let result = eval(code);
            
            if (typeof result === 'object') {
                result = JSON.stringify(result, null, 2);
            }
            
            const output = String(result).substring(0, 2000);
            await message.reply(`✅ *Evaluation Result:*\n\`\`\`\n${output}\n\`\`\``);
            
        } catch (error) {
            await message.reply(`❌ *Evaluation Error:*\n\`\`\`\n${error.message}\n\`\`\``);
        }
    },
    
    /**
     * Handle SQL query execution
     */
    async handleSQL(message, args, bot) {
        const query = args.join(' ');
        
        if (!query) {
            await message.reply('❓ Please provide an SQL query.\n\nUsage: admin sql <query>');
            return;
        }
        
        try {
            await message.reply('🗄️ Executing query...');
            
            const results = await bot.database.query(query);
            
            let output = '';
            if (Array.isArray(results)) {
                output = JSON.stringify(results.slice(0, 10), null, 2);
                if (results.length > 10) {
                    output += `\n... and ${results.length - 10} more rows`;
                }
            } else {
                output = JSON.stringify(results, null, 2);
            }
            
            const truncated = output.substring(0, 2000);
            await message.reply(`✅ *Query Result:*\n\`\`\`\n${truncated}\n\`\`\``);
            
        } catch (error) {
            await message.reply(`❌ *Query Error:*\n\`\`\`\n${error.message}\n\`\`\``);
        }
    },
    
    /**
     * Handle backup creation
     */
    async handleBackup(message, bot) {
        try {
            await message.reply('💾 Creating backup...');
            
            // Export database data
            const backup = {
                timestamp: new Date().toISOString(),
                version: '1.0.0',
                data: {}
            };
            
            // Export each model
            for (const [modelName, model] of Object.entries(bot.database.models)) {
                try {
                    backup.data[modelName] = await model.findAll();
                } catch (error) {
                    backup.data[modelName] = [];
                }
            }
            
            // Create backup file
            const backupText = JSON.stringify(backup, null, 2);
            const backupBuffer = Buffer.from(backupText, 'utf8');
            
            const fileName = `matdev_backup_${Date.now()}.json`;
            
            await message.reply({
                document: backupBuffer,
                fileName,
                mimetype: 'application/json',
                caption: `💾 *Database Backup*\n\nTimestamp: ${backup.timestamp}\nSize: ${(backupBuffer.length / 1024).toFixed(2)} KB`
            });
            
        } catch (error) {
            await message.reply('❌ Backup creation failed.');
        }
    },
    
    /**
     * Extract JID from mention or text
     */
    extractJid(text) {
        if (!text) return null;
        
        // Extract from mention
        const mentionMatch = text.match(/@(\d+)/);
        if (mentionMatch) {
            return mentionMatch[1] + '@s.whatsapp.net';
        }
        
        // Direct JID format
        if (text.includes('@s.whatsapp.net') || text.includes('@g.us')) {
            return text;
        }
        
        // Phone number
        if (/^\d+$/.test(text)) {
            return text + '@s.whatsapp.net';
        }
        
        return null;
    },
    
    /**
     * Format uptime
     */
    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        
        return parts.join(' ') || '< 1m';
    }
};
