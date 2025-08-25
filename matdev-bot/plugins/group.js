/**
 * Group Plugin - Group management and administration
 */

module.exports = {
    name: 'group',
    description: 'Group management and administration tools',
    version: '1.0.0',
    command: ['group', 'grp', 'manage'],
    category: 'group',
    usage: '<action> [parameters]',
    fromMe: false,
    type: 'whatsapp',
    groupOnly: true,
    cooldown: 5,
    
    async function(message, match, bot) {
        try {
            const args = match ? match.trim().split(' ') : [];
            const action = args[0]?.toLowerCase();
            
            if (!action) {
                await this.showGroupMenu(message, bot);
                return;
            }
            
            // Check admin permissions for admin actions
            const adminActions = ['add', 'remove', 'kick', 'promote', 'demote', 'mute', 'unmute', 'close', 'open', 'setname', 'setdesc'];
            
            if (adminActions.includes(action) && !message.isAdmin && !message.isSudo) {
                await message.reply('👑 You need admin privileges to perform this action.');
                return;
            }
            
            switch (action) {
                case 'info':
                    await this.getGroupInfo(message, bot);
                    break;
                    
                case 'members':
                case 'list':
                    await this.listMembers(message, bot);
                    break;
                    
                case 'admins':
                    await this.listAdmins(message, bot);
                    break;
                    
                case 'add':
                    await this.addMember(message, args.slice(1), bot);
                    break;
                    
                case 'remove':
                case 'kick':
                    await this.removeMember(message, args.slice(1), bot);
                    break;
                    
                case 'promote':
                    await this.promoteUser(message, args.slice(1), bot);
                    break;
                    
                case 'demote':
                    await this.demoteUser(message, args.slice(1), bot);
                    break;
                    
                case 'mute':
                    await this.muteGroup(message, args.slice(1), bot);
                    break;
                    
                case 'unmute':
                    await this.unmuteGroup(message, bot);
                    break;
                    
                case 'close':
                    await this.closeGroup(message, bot);
                    break;
                    
                case 'open':
                    await this.openGroup(message, bot);
                    break;
                    
                case 'setname':
                    await this.setGroupName(message, args.slice(1), bot);
                    break;
                    
                case 'setdesc':
                    await this.setGroupDescription(message, args.slice(1), bot);
                    break;
                    
                case 'invite':
                case 'link':
                    await this.getInviteLink(message, bot);
                    break;
                    
                case 'revoke':
                    await this.revokeInviteLink(message, bot);
                    break;
                    
                case 'tag':
                case 'tagall':
                    await this.tagAll(message, args.slice(1), bot);
                    break;
                    
                case 'stats':
                    await this.getGroupStats(message, bot);
                    break;
                    
                default:
                    await message.reply(`❓ Unknown group action: ${action}\n\nUse ${bot.config.PREFIX}group for available actions.`);
            }
            
        } catch (error) {
            await message.reply('❌ Group command failed.');
            throw error;
        }
    },
    
    /**
     * Show group management menu
     */
    async showGroupMenu(message, bot) {
        const prefix = bot.config.PREFIX;
        const isAdmin = message.isAdmin || message.isSudo;
        
        let groupText = `👥 *Group Management*\n\n`;
        
        // Information commands (available to all)
        groupText += `ℹ️ *Information:*\n`;
        groupText += `• ${prefix}group info - Group information\n`;
        groupText += `• ${prefix}group members - List all members\n`;
        groupText += `• ${prefix}group admins - List administrators\n`;
        groupText += `• ${prefix}group stats - Group statistics\n\n`;
        
        // Admin commands
        if (isAdmin) {
            groupText += `👑 *Administration:*\n`;
            groupText += `• ${prefix}group add <number> - Add member\n`;
            groupText += `• ${prefix}group remove @user - Remove member\n`;
            groupText += `• ${prefix}group promote @user - Promote to admin\n`;
            groupText += `• ${prefix}group demote @user - Demote from admin\n\n`;
            
            groupText += `🔒 *Group Control:*\n`;
            groupText += `• ${prefix}group close - Close group (admins only)\n`;
            groupText += `• ${prefix}group open - Open group (all can send)\n`;
            groupText += `• ${prefix}group mute [duration] - Mute group\n`;
            groupText += `• ${prefix}group unmute - Unmute group\n\n`;
            
            groupText += `⚙️ *Settings:*\n`;
            groupText += `• ${prefix}group setname <name> - Change group name\n`;
            groupText += `• ${prefix}group setdesc <desc> - Change description\n`;
            groupText += `• ${prefix}group link - Get invite link\n`;
            groupText += `• ${prefix}group revoke - Revoke invite link\n\n`;
        }
        
        // Utility commands
        groupText += `🛠️ *Utilities:*\n`;
        groupText += `• ${prefix}group tag [message] - Tag all members\n\n`;
        
        if (!isAdmin) {
            groupText += `💡 *Note:* Some commands require admin privileges.`;
        }
        
        await message.reply(groupText);
    },
    
    /**
     * Get group information
     */
    async getGroupInfo(message, bot) {
        try {
            const groupMeta = await bot.sock.groupMetadata(message.from);
            const groupData = await bot.database.getGroup(message.from);
            
            let infoText = `ℹ️ *Group Information*\n\n`;
            infoText += `📝 **Name:** ${groupMeta.subject}\n`;
            infoText += `🆔 **ID:** ${groupMeta.id.split('@')[0]}\n`;
            infoText += `👥 **Members:** ${groupMeta.participants.length}\n`;
            
            // Count admins
            const adminCount = groupMeta.participants.filter(p => p.admin).length;
            infoText += `👑 **Admins:** ${adminCount}\n`;
            
            if (groupMeta.desc) {
                infoText += `📄 **Description:** ${groupMeta.desc}\n`;
            }
            
            infoText += `📅 **Created:** ${new Date(groupMeta.creation * 1000).toLocaleDateString()}\n`;
            
            // Bot-specific data
            if (groupData) {
                infoText += `🤖 **Bot Joined:** ${new Date(groupData.botJoinedAt).toLocaleDateString()}\n`;
                
                if (groupData.settings) {
                    infoText += `\n⚙️ **Bot Settings:**\n`;
                    infoText += `• Welcome: ${groupData.settings.welcome ? '✅' : '❌'}\n`;
                    infoText += `• Goodbye: ${groupData.settings.goodbye ? '✅' : '❌'}\n`;
                    infoText += `• Anti-link: ${groupData.settings.antiLink ? '✅' : '❌'}\n`;
                    infoText += `• Commands: ${groupData.settings.commandsAllowed ? '✅' : '❌'}\n`;
                    infoText += `• Games: ${groupData.settings.gamesAllowed ? '✅' : '❌'}\n`;
                }
            }
            
            // Group restrictions
            infoText += `\n🔒 **Restrictions:**\n`;
            infoText += `• Send Messages: ${groupMeta.announce ? 'Admins Only' : 'All Members'}\n`;
            infoText += `• Edit Info: ${groupMeta.restrict ? 'Admins Only' : 'All Members'}\n`;
            
            await message.reply(infoText);
            
        } catch (error) {
            await message.reply('❌ Failed to get group information.');
            throw error;
        }
    },
    
    /**
     * List all group members
     */
    async listMembers(message, bot) {
        try {
            const groupMeta = await bot.sock.groupMetadata(message.from);
            const participants = groupMeta.participants;
            
            if (participants.length === 0) {
                await message.reply('📭 No members found.');
                return;
            }
            
            let memberText = `👥 *Group Members (${participants.length})*\n\n`;
            
            // Sort by admin status
            const sortedMembers = participants.sort((a, b) => {
                if (a.admin && !b.admin) return -1;
                if (!a.admin && b.admin) return 1;
                return 0;
            });
            
            let adminCount = 0;
            let memberCount = 0;
            
            sortedMembers.forEach((participant, index) => {
                const number = participant.id.split('@')[0];
                const isAdmin = participant.admin;
                const adminType = participant.admin;
                
                let emoji = '👤';
                if (adminType === 'superadmin') {
                    emoji = '👑';
                    adminCount++;
                } else if (adminType === 'admin') {
                    emoji = '👑';
                    adminCount++;
                } else {
                    memberCount++;
                }
                
                memberText += `${emoji} ${number}`;
                if (isAdmin) {
                    memberText += ` (${adminType})`;
                }
                memberText += '\n';
                
                // Limit display to avoid message being too long
                if (index >= 50) {
                    memberText += `... and ${participants.length - 51} more members\n`;
                    return;
                }
            });
            
            memberText += `\n📊 **Summary:**\n`;
            memberText += `👑 Admins: ${adminCount}\n`;
            memberText += `👤 Members: ${memberCount}`;
            
            await message.reply(memberText);
            
        } catch (error) {
            await message.reply('❌ Failed to list members.');
            throw error;
        }
    },
    
    /**
     * List group administrators
     */
    async listAdmins(message, bot) {
        try {
            const groupMeta = await bot.sock.groupMetadata(message.from);
            const admins = groupMeta.participants.filter(p => p.admin);
            
            if (admins.length === 0) {
                await message.reply('👑 No administrators found.');
                return;
            }
            
            let adminText = `👑 *Group Administrators (${admins.length})*\n\n`;
            
            admins.forEach(admin => {
                const number = admin.id.split('@')[0];
                const type = admin.admin === 'superadmin' ? '👑 Super Admin' : '👑 Admin';
                
                adminText += `${type}: @${number}\n`;
            });
            
            await message.reply({
                text: adminText,
                mentions: admins.map(a => a.id)
            });
            
        } catch (error) {
            await message.reply('❌ Failed to list administrators.');
            throw error;
        }
    },
    
    /**
     * Add member to group
     */
    async addMember(message, args, bot) {
        const phoneNumber = args[0];
        
        if (!phoneNumber) {
            await message.reply('❓ Please provide a phone number.\n\nUsage: `group add <number>`');
            return;
        }
        
        try {
            const jid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;
            
            await bot.sock.groupParticipantsUpdate(message.from, [jid], 'add');
            await message.reply(`✅ Added @${jid.split('@')[0]} to the group.`);
            
        } catch (error) {
            await message.reply(`❌ Failed to add member: ${error.message}`);
        }
    },
    
    /**
     * Remove member from group
     */
    async removeMember(message, args, bot) {
        const userJid = this.extractJid(args[0]);
        
        if (!userJid) {
            await message.reply('❓ Please mention a user to remove.\n\nUsage: `group remove @user`');
            return;
        }
        
        try {
            await bot.sock.groupParticipantsUpdate(message.from, [userJid], 'remove');
            await message.reply(`✅ Removed @${userJid.split('@')[0]} from the group.`);
            
        } catch (error) {
            await message.reply(`❌ Failed to remove member: ${error.message}`);
        }
    },
    
    /**
     * Promote user to admin
     */
    async promoteUser(message, args, bot) {
        const userJid = this.extractJid(args[0]);
        
        if (!userJid) {
            await message.reply('❓ Please mention a user to promote.\n\nUsage: `group promote @user`');
            return;
        }
        
        try {
            await bot.sock.groupParticipantsUpdate(message.from, [userJid], 'promote');
            await message.reply(`👑 Promoted @${userJid.split('@')[0]} to admin.`);
            
        } catch (error) {
            await message.reply(`❌ Failed to promote user: ${error.message}`);
        }
    },
    
    /**
     * Demote user from admin
     */
    async demoteUser(message, args, bot) {
        const userJid = this.extractJid(args[0]);
        
        if (!userJid) {
            await message.reply('❓ Please mention a user to demote.\n\nUsage: `group demote @user`');
            return;
        }
        
        try {
            await bot.sock.groupParticipantsUpdate(message.from, [userJid], 'demote');
            await message.reply(`📉 Demoted @${userJid.split('@')[0]} from admin.`);
            
        } catch (error) {
            await message.reply(`❌ Failed to demote user: ${error.message}`);
        }
    },
    
    /**
     * Mute group
     */
    async muteGroup(message, args, bot) {
        try {
            await bot.sock.groupSettingUpdate(message.from, 'announcement');
            
            const duration = args[0];
            let muteText = '🔇 Group has been muted. Only admins can send messages.';
            
            if (duration) {
                muteText += `\n⏰ Duration: ${duration}`;
                // In a real implementation, you'd set a timer to unmute after duration
            }
            
            await message.reply(muteText);
            
        } catch (error) {
            await message.reply(`❌ Failed to mute group: ${error.message}`);
        }
    },
    
    /**
     * Unmute group
     */
    async unmuteGroup(message, bot) {
        try {
            await bot.sock.groupSettingUpdate(message.from, 'not_announcement');
            await message.reply('🔊 Group has been unmuted. All members can send messages.');
            
        } catch (error) {
            await message.reply(`❌ Failed to unmute group: ${error.message}`);
        }
    },
    
    /**
     * Close group (admins only)
     */
    async closeGroup(message, bot) {
        try {
            await bot.sock.groupSettingUpdate(message.from, 'announcement');
            await message.reply('🔒 Group closed. Only admins can send messages.');
            
        } catch (error) {
            await message.reply(`❌ Failed to close group: ${error.message}`);
        }
    },
    
    /**
     * Open group (all can send)
     */
    async openGroup(message, bot) {
        try {
            await bot.sock.groupSettingUpdate(message.from, 'not_announcement');
            await message.reply('🔓 Group opened. All members can send messages.');
            
        } catch (error) {
            await message.reply(`❌ Failed to open group: ${error.message}`);
        }
    },
    
    /**
     * Set group name
     */
    async setGroupName(message, args, bot) {
        const newName = args.join(' ');
        
        if (!newName) {
            await message.reply('❓ Please provide a new group name.\n\nUsage: `group setname <name>`');
            return;
        }
        
        try {
            await bot.sock.groupUpdateSubject(message.from, newName);
            await message.reply(`✅ Group name changed to: "${newName}"`);
            
        } catch (error) {
            await message.reply(`❌ Failed to change group name: ${error.message}`);
        }
    },
    
    /**
     * Set group description
     */
    async setGroupDescription(message, args, bot) {
        const newDesc = args.join(' ');
        
        if (!newDesc) {
            await message.reply('❓ Please provide a new group description.\n\nUsage: `group setdesc <description>`');
            return;
        }
        
        try {
            await bot.sock.groupUpdateDescription(message.from, newDesc);
            await message.reply(`✅ Group description updated.`);
            
        } catch (error) {
            await message.reply(`❌ Failed to update description: ${error.message}`);
        }
    },
    
    /**
     * Get group invite link
     */
    async getInviteLink(message, bot) {
        try {
            const code = await bot.sock.groupInviteCode(message.from);
            const link = `https://chat.whatsapp.com/${code}`;
            
            await message.reply(`🔗 *Group Invite Link*\n\n${link}\n\n⚠️ Share responsibly!`);
            
        } catch (error) {
            await message.reply(`❌ Failed to get invite link: ${error.message}`);
        }
    },
    
    /**
     * Revoke group invite link
     */
    async revokeInviteLink(message, bot) {
        try {
            await bot.sock.groupRevokeInvite(message.from);
            await message.reply('✅ Group invite link has been revoked. Old links will no longer work.');
            
        } catch (error) {
            await message.reply(`❌ Failed to revoke invite link: ${error.message}`);
        }
    },
    
    /**
     * Tag all members
     */
    async tagAll(message, args, bot) {
        try {
            const groupMeta = await bot.sock.groupMetadata(message.from);
            const participants = groupMeta.participants;
            
            if (participants.length === 0) {
                await message.reply('📭 No members to tag.');
                return;
            }
            
            const customMessage = args.join(' ');
            let tagText = `📢 *Group Announcement*\n\n`;
            
            if (customMessage) {
                tagText += `${customMessage}\n\n`;
            }
            
            tagText += `👥 *Tagging all members:*\n`;
            
            const mentions = [];
            participants.forEach(participant => {
                const number = participant.id.split('@')[0];
                tagText += `@${number} `;
                mentions.push(participant.id);
            });
            
            await message.reply({
                text: tagText,
                mentions
            });
            
        } catch (error) {
            await message.reply('❌ Failed to tag members.');
            throw error;
        }
    },
    
    /**
     * Get group statistics
     */
    async getGroupStats(message, bot) {
        try {
            const groupMeta = await bot.sock.groupMetadata(message.from);
            const groupData = await bot.database.getGroup(message.from);
            
            let statsText = `📊 *Group Statistics*\n\n`;
            
            // Basic stats
            const totalMembers = groupMeta.participants.length;
            const adminCount = groupMeta.participants.filter(p => p.admin).length;
            const memberCount = totalMembers - adminCount;
            
            statsText += `👥 **Total Members:** ${totalMembers}\n`;
            statsText += `👑 **Administrators:** ${adminCount}\n`;
            statsText += `👤 **Regular Members:** ${memberCount}\n\n`;
            
            // Bot-specific stats
            if (groupData && groupData.stats) {
                statsText += `🤖 **Bot Statistics:**\n`;
                statsText += `💬 **Messages:** ${groupData.stats.messagesCount || 0}\n`;
                statsText += `🎮 **Commands Used:** ${groupData.stats.commandsUsed || 0}\n`;
                statsText += `📁 **Media Shared:** ${groupData.stats.mediaShared || 0}\n`;
                statsText += `➕ **Members Joined:** ${groupData.stats.membersJoined || 0}\n`;
                statsText += `➖ **Members Left:** ${groupData.stats.membersLeft || 0}\n\n`;
            }
            
            // Group creation info
            statsText += `📅 **Created:** ${new Date(groupMeta.creation * 1000).toLocaleDateString()}\n`;
            
            if (groupData) {
                statsText += `🤖 **Bot Joined:** ${new Date(groupData.createdAt).toLocaleDateString()}`;
            }
            
            await message.reply(statsText);
            
        } catch (error) {
            await message.reply('❌ Failed to get group statistics.');
            throw error;
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
        if (text.includes('@s.whatsapp.net')) {
            return text;
        }
        
        // Phone number
        if (/^\d+$/.test(text)) {
            return text + '@s.whatsapp.net';
        }
        
        return null;
    }
};
