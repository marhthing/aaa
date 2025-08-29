const EnvironmentManager = require('../../core/EnvironmentManager');

class AllowCommands {
    constructor(botClient, eventBus) {
        this.botClient = botClient;
        this.eventBus = eventBus;
        this.envManager = new EnvironmentManager();
    }

    async permissions(context) {
        try {
            const { args, reply, message } = context;
            
            if (args.length === 0) {
                await this.showAllPermissions(context);
                return;
            }
            
            const subCommand = args[0].toLowerCase();
            
            switch (subCommand) {
                case 'list':
                    await this.listUserPermissions(context);
                    break;
                    
                case 'grant':
                    await this.grantPermission(context);
                    break;
                    
                case 'revoke':
                    await this.revokePermission(context);
                    break;
                    
                case 'check':
                    await this.checkPermission(context);
                    break;
                    
                default:
                    await reply('❌ Invalid permissions command\nUsage: .permissions <list|grant|revoke|check> [args]');
            }
            
        } catch (error) {
            console.error('Error in permissions command:', error);
            await context.reply('❌ Error managing permissions');
        }
    }

    async showAllPermissions(context) {
        try {
            const { reply } = context;
            
            const accessController = this.botClient.getAccessController();
            const summary = accessController.getAccessSummary();
            
            let permissionsText = `🔐 **Permission Summary**\n\n`;
            
            permissionsText += `👤 **Owner:** ${summary.ownerJid ? summary.ownerJid.split('@')[0] : 'Not set'}\n`;
            permissionsText += `👥 **Users with permissions:** ${summary.allowedCommandsCount}\n`;
            permissionsText += `🎮 **Active games:** ${summary.activeGamesCount}\n\n`;
            
            permissionsText += `⚙️ **Access Rules:**\n`;
            permissionsText += `• Owner only: ${summary.accessRules.ownerOnly ? '✅' : '❌'}\n`;
            permissionsText += `• Game inputs allowed: ${summary.accessRules.allowGameInputs ? '✅' : '❌'}\n`;
            permissionsText += `• Explicit commands allowed: ${summary.accessRules.allowExplicitCommands ? '✅' : '❌'}\n\n`;
            
            if (summary.allowedUsers.length > 0) {
                permissionsText += `**Users with command permissions:**\n`;
                for (const userJid of summary.allowedUsers.slice(0, 10)) {
                    const commands = accessController.getAllowedCommands(userJid);
                    permissionsText += `• ${userJid.split('@')[0]}: ${commands.join(', ')}\n`;
                }
                
                if (summary.allowedUsers.length > 10) {
                    permissionsText += `... and ${summary.allowedUsers.length - 10} more\n`;
                }
            }
            
            permissionsText += `\n💡 **Commands:**\n`;
            permissionsText += `• .permissions list - List all user permissions\n`;
            permissionsText += `• .permissions grant <user> <command> - Grant command permission\n`;
            permissionsText += `• .permissions revoke <user> <command> - Revoke command permission\n`;
            permissionsText += `• .permissions check <user> <command> - Check if user has permission`;
            
            await reply(permissionsText);
            
        } catch (error) {
            console.error('Error showing all permissions:', error);
            await context.reply('❌ Error retrieving permissions summary');
        }
    }

    async listUserPermissions(context) {
        try {
            const { args, reply } = context;
            
            const accessController = this.botClient.getAccessController();
            const summary = accessController.getAccessSummary();
            
            if (summary.allowedUsers.length === 0) {
                await reply('📝 No users have command permissions');
                return;
            }
            
            let listText = `📋 **User Permissions List**\n\n`;
            
            for (const userJid of summary.allowedUsers) {
                const commands = accessController.getAllowedCommands(userJid);
                listText += `👤 **${userJid.split('@')[0]}**\n`;
                listText += `Commands: ${commands.join(', ')}\n\n`;
            }
            
            await reply(listText);
            
        } catch (error) {
            console.error('Error listing user permissions:', error);
            await context.reply('❌ Error listing user permissions');
        }
    }

    async grantPermission(context) {
        try {
            const { args, reply } = context;
            
            if (args.length < 3) {
                await reply('❌ Usage: .permissions grant <user> <command>\nExample: .permissions grant 1234567890 ping');
                return;
            }
            
            const userId = args[1];
            const command = args[2].toLowerCase();
            
            // Normalize user JID
            const userJid = userId.includes('@') ? userId : `${userId}@s.whatsapp.net`;
            
            const accessController = this.botClient.getAccessController();
            const success = accessController.allowCommand(userJid, command);
            
            if (success) {
                await reply(`✅ Granted permission for user ${userId} to use command: ${command}`);
                
                this.eventBus.emit('permission_granted', {
                    userJid,
                    command,
                    grantedBy: context.message.from,
                    timestamp: new Date().toISOString()
                });
            } else {
                await reply('❌ Failed to grant permission');
            }
            
        } catch (error) {
            console.error('Error granting permission:', error);
            await context.reply('❌ Error granting permission');
        }
    }

    async revokePermission(context) {
        try {
            const { args, reply } = context;
            
            if (args.length < 3) {
                await reply('❌ Usage: .permissions revoke <user> <command>\nExample: .permissions revoke 1234567890 ping');
                return;
            }
            
            const userId = args[1];
            const command = args[2].toLowerCase();
            
            // Normalize user JID
            const userJid = userId.includes('@') ? userId : `${userId}@s.whatsapp.net`;
            
            const accessController = this.botClient.getAccessController();
            const success = accessController.disallowCommand(userJid, command);
            
            if (success) {
                await reply(`✅ Revoked permission for user ${userId} to use command: ${command}`);
                
                this.eventBus.emit('permission_revoked', {
                    userJid,
                    command,
                    revokedBy: context.message.from,
                    timestamp: new Date().toISOString()
                });
            } else {
                await reply('❌ Permission not found or failed to revoke');
            }
            
        } catch (error) {
            console.error('Error revoking permission:', error);
            await context.reply('❌ Error revoking permission');
        }
    }

    async checkPermission(context) {
        try {
            const { args, reply } = context;
            
            if (args.length < 3) {
                await reply('❌ Usage: .permissions check <user> <command>\nExample: .permissions check 1234567890 ping');
                return;
            }
            
            const userId = args[1];
            const command = args[2].toLowerCase();
            
            // Normalize user JID
            const userJid = userId.includes('@') ? userId : `${userId}@s.whatsapp.net`;
            
            const accessController = this.botClient.getAccessController();
            const hasPermission = accessController.canExecuteCommand(userJid, command);
            const isOwner = await accessController.isOwner(userJid);
            
            let checkText = `🔍 **Permission Check**\n\n`;
            checkText += `👤 **User:** ${userId}\n`;
            checkText += `📝 **Command:** ${command}\n`;
            checkText += `🔐 **Is Owner:** ${isOwner ? '✅ Yes' : '❌ No'}\n`;
            checkText += `✅ **Has Permission:** ${hasPermission ? '✅ Yes' : '❌ No'}\n\n`;
            
            if (isOwner) {
                checkText += `💡 Owner has access to all commands`;
            } else if (hasPermission) {
                checkText += `💡 User has explicit permission for this command`;
            } else {
                checkText += `💡 User does not have permission for this command`;
            }
            
            await reply(checkText);
            
        } catch (error) {
            console.error('Error checking permission:', error);
            await context.reply('❌ Error checking permission');
        }
    }
}

module.exports = { AllowCommands };
