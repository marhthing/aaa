const { jidManager } = require('../../utils/jidManager');

class UserManager {
    constructor(botClient, eventBus) {
        this.botClient = botClient;
        this.eventBus = eventBus;
        this.userCache = new Map(); // JID -> user info
    }

    async users(context) {
        try {
            const { args, reply } = context;
            
            if (args.length === 0) {
                await this.listUsers(context);
                return;
            }
            
            const subCommand = args[0].toLowerCase();
            
            switch (subCommand) {
                case 'list':
                    await this.listUsers(context);
                    break;
                    
                case 'info':
                    await this.userInfo(context);
                    break;
                    
                case 'search':
                    await this.searchUsers(context);
                    break;
                    
                case 'active':
                    await this.activeUsers(context);
                    break;
                    
                default:
                    await reply('❌ Invalid users command\nUsage: .users <list|info|search|active> [args]');
            }
            
        } catch (error) {
            console.error('Error in users command:', error);
            await context.reply('❌ Error managing users');
        }
    }

    async listUsers(context) {
        try {
            const { reply } = context;
            
            const accessController = this.botClient.getAccessController();
            const summary = accessController.getAccessSummary();
            
            let usersText = `👥 **User Management**\n\n`;
            
            // Owner information
            usersText += `👤 **Bot Owner:**\n`;
            if (summary.ownerJid) {
                const ownerInfo = await this.getUserInfo(summary.ownerJid);
                usersText += `• ${ownerInfo.displayName} (${ownerInfo.phone})\n`;
                usersText += `• Status: ${ownerInfo.status}\n`;
            } else {
                usersText += `• Not configured\n`;
            }
            
            usersText += `\n📊 **Statistics:**\n`;
            usersText += `• Users with permissions: ${summary.allowedUsers.length}\n`;
            usersText += `• Active game chats: ${summary.activeGameChats.length}\n\n`;
            
            // Users with permissions
            if (summary.allowedUsers.length > 0) {
                usersText += `🔐 **Users with Command Permissions:**\n`;
                
                for (const userJid of summary.allowedUsers.slice(0, 10)) {
                    const userInfo = await this.getUserInfo(userJid);
                    const commands = accessController.getAllowedCommands(userJid);
                    
                    usersText += `• ${userInfo.displayName} (${userInfo.phone})\n`;
                    usersText += `  Commands: ${commands.join(', ')}\n`;
                }
                
                if (summary.allowedUsers.length > 10) {
                    usersText += `  ... and ${summary.allowedUsers.length - 10} more\n`;
                }
            }
            
            usersText += `\n💡 **Commands:**\n`;
            usersText += `• .users info <phone> - Get user details\n`;
            usersText += `• .users search <query> - Search users\n`;
            usersText += `• .users active - Show recently active users`;
            
            await reply(usersText);
            
        } catch (error) {
            console.error('Error listing users:', error);
            await context.reply('❌ Error listing users');
        }
    }

    async userInfo(context) {
        try {
            const { args, reply } = context;
            
            if (args.length < 2) {
                await reply('❌ Usage: .users info <phone>\nExample: .users info 1234567890');
                return;
            }
            
            const userId = args[1];
            const userJid = userId.includes('@') ? userId : `${userId}@s.whatsapp.net`;
            
            const userInfo = await this.getUserInfo(userJid);
            const accessController = this.botClient.getAccessController();
            
            const isOwner = await accessController.isOwner(userJid);
            const allowedCommands = accessController.getAllowedCommands(userJid);
            
            let infoText = `👤 **User Information**\n\n`;
            infoText += `**Name:** ${userInfo.displayName}\n`;
            infoText += `**Phone:** ${userInfo.phone}\n`;
            infoText += `**JID:** ${userJid}\n`;
            infoText += `**Status:** ${userInfo.status}\n`;
            infoText += `**Is Owner:** ${isOwner ? '✅ Yes' : '❌ No'}\n\n`;
            
            infoText += `🔐 **Permissions:**\n`;
            if (isOwner) {
                infoText += `• Full admin access (Owner)\n`;
            } else if (allowedCommands.length > 0) {
                infoText += `• Allowed commands: ${allowedCommands.join(', ')}\n`;
            } else {
                infoText += `• No special permissions\n`;
            }
            
            // Check if user is in any active games
            const activeGames = accessController.getAllActiveGames();
            const userGames = [];
            
            for (const [chatId, gameInfo] of Object.entries(activeGames)) {
                if (gameInfo.players && gameInfo.players.includes(userJid)) {
                    userGames.push(`${gameInfo.type} in ${chatId}`);
                }
            }
            
            if (userGames.length > 0) {
                infoText += `\n🎮 **Active Games:**\n`;
                userGames.forEach(game => {
                    infoText += `• ${game}\n`;
                });
            }
            
            await reply(infoText);
            
        } catch (error) {
            console.error('Error getting user info:', error);
            await context.reply('❌ Error retrieving user information');
        }
    }

    async searchUsers(context) {
        try {
            const { args, reply } = context;
            
            if (args.length < 2) {
                await reply('❌ Usage: .users search <query>\nExample: .users search john');
                return;
            }
            
            const query = args.slice(1).join(' ').toLowerCase();
            const accessController = this.botClient.getAccessController();
            const summary = accessController.getAccessSummary();
            
            let searchResults = [];
            
            // Search in users with permissions
            for (const userJid of summary.allowedUsers) {
                const userInfo = await this.getUserInfo(userJid);
                
                if (userInfo.displayName.toLowerCase().includes(query) ||
                    userInfo.phone.includes(query)) {
                    searchResults.push({
                        jid: userJid,
                        info: userInfo,
                        hasPermissions: true
                    });
                }
            }
            
            let resultsText = `🔍 **User Search Results**\n\n`;
            resultsText += `**Query:** "${query}"\n`;
            resultsText += `**Results:** ${searchResults.length}\n\n`;
            
            if (searchResults.length === 0) {
                resultsText += `❌ No users found matching "${query}"`;
            } else {
                searchResults.forEach((result, index) => {
                    resultsText += `**${index + 1}.** ${result.info.displayName}\n`;
                    resultsText += `• Phone: ${result.info.phone}\n`;
                    resultsText += `• Has permissions: ${result.hasPermissions ? '✅' : '❌'}\n\n`;
                });
            }
            
            await reply(resultsText);
            
        } catch (error) {
            console.error('Error searching users:', error);
            await context.reply('❌ Error searching users');
        }
    }

    async activeUsers(context) {
        try {
            const { reply } = context;
            
            const accessController = this.botClient.getAccessController();
            const activeGames = accessController.getAllActiveGames();
            const summary = accessController.getAccessSummary();
            
            let activeText = `🎯 **Recently Active Users**\n\n`;
            
            // Users in active games
            const gameUsers = new Set();
            for (const [chatId, gameInfo] of Object.entries(activeGames)) {
                if (gameInfo.players) {
                    gameInfo.players.forEach(player => {
                        if (player && player !== 'AI') {
                            gameUsers.add(player);
                        }
                    });
                }
            }
            
            if (gameUsers.size > 0) {
                activeText += `🎮 **Users in Active Games (${gameUsers.size}):**\n`;
                for (const userJid of gameUsers) {
                    const userInfo = await this.getUserInfo(userJid);
                    activeText += `• ${userInfo.displayName} (${userInfo.phone})\n`;
                }
                activeText += '\n';
            }
            
            // Users with recent permissions
            if (summary.allowedUsers.length > 0) {
                activeText += `🔐 **Users with Permissions (${summary.allowedUsers.length}):**\n`;
                for (const userJid of summary.allowedUsers.slice(0, 5)) {
                    const userInfo = await this.getUserInfo(userJid);
                    activeText += `• ${userInfo.displayName} (${userInfo.phone})\n`;
                }
                
                if (summary.allowedUsers.length > 5) {
                    activeText += `  ... and ${summary.allowedUsers.length - 5} more\n`;
                }
            }
            
            if (gameUsers.size === 0 && summary.allowedUsers.length === 0) {
                activeText += `📭 No recently active users`;
            }
            
            await reply(activeText);
            
        } catch (error) {
            console.error('Error getting active users:', error);
            await context.reply('❌ Error retrieving active users');
        }
    }

    async getUserInfo(userJid) {
        try {
            // Check cache first
            if (this.userCache.has(userJid)) {
                const cached = this.userCache.get(userJid);
                // Return cached if less than 10 minutes old
                if (Date.now() - cached.timestamp < 10 * 60 * 1000) {
                    return cached.info;
                }
            }
            
            // Get user info from WhatsApp
            let userInfo = {
                jid: userJid,
                phone: jidManager.getPhoneNumber(userJid),
                displayName: `User ${jidManager.getPhoneNumber(userJid)}`,
                status: 'Unknown'
            };
            
            try {
                const contact = await this.botClient.getContact(userJid);
                if (contact) {
                    userInfo.displayName = contact.pushname || contact.name || userInfo.displayName;
                    userInfo.status = contact.isMe ? 'Owner (Me)' : (contact.isUser ? 'Active' : 'Inactive');
                }
            } catch (contactError) {
                // Failed to get contact info, use defaults
                userInfo.status = 'Unknown';
            }
            
            // Cache the result
            this.userCache.set(userJid, {
                info: userInfo,
                timestamp: Date.now()
            });
            
            return userInfo;
            
        } catch (error) {
            console.error('Error getting user info:', error);
            return {
                jid: userJid,
                phone: jidManager.getPhoneNumber(userJid) || 'Unknown',
                displayName: 'Unknown User',
                status: 'Error'
            };
        }
    }

    clearUserCache() {
        this.userCache.clear();
        console.log('👥 User cache cleared');
    }

    getCacheStats() {
        return {
            cachedUsers: this.userCache.size,
            cacheEntries: Array.from(this.userCache.entries()).map(([jid, data]) => ({
                jid,
                name: data.info.displayName,
                cached: new Date(data.timestamp).toISOString()
            }))
        };
    }
}

module.exports = { UserManager };
