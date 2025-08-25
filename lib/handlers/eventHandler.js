/**
 * MatDev Event Handler
 * Handle WhatsApp events like group updates, user joins/leaves, etc.
 */

const logger = require('../utils/logger');

const eventHandler = {
    /**
     * Handle group metadata updates
     */
    async handleGroupsUpsert(bot, groups) {
        try {
            for (const group of groups) {
                await this.processGroupUpdate(bot, group);
            }
        } catch (error) {
            logger.error('Groups upsert handler error:', error);
        }
    },
    
    /**
     * Handle group participant updates (joins/leaves)
     */
    async handleGroupParticipantsUpdate(bot, update) {
        try {
            const { id: groupJid, participants, action } = update;
            
            logger.info(`👥 Group ${action}: ${participants.join(', ')} in ${groupJid}`);
            
            // Get group settings
            const group = await bot.database.getGroup(groupJid);
            if (!group || !group.settings) return;
            
            switch (action) {
                case 'add':
                    await this.handleMemberJoin(bot, groupJid, participants, group);
                    break;
                    
                case 'remove':
                case 'leave':
                    await this.handleMemberLeave(bot, groupJid, participants, group);
                    break;
                    
                case 'promote':
                    await this.handleMemberPromote(bot, groupJid, participants, group);
                    break;
                    
                case 'demote':
                    await this.handleMemberDemote(bot, groupJid, participants, group);
                    break;
            }
            
        } catch (error) {
            logger.error('Group participants update error:', error);
        }
    },
    
    /**
     * Process group update
     */
    async processGroupUpdate(bot, group) {
        try {
            const groupData = {
                jid: group.id,
                name: group.subject || 'Unknown Group',
                description: group.desc || '',
                participantCount: group.participants?.length || 0,
                isActive: true
            };
            
            const { group: dbGroup, created } = await bot.database.createGroup(groupData);
            
            if (!created) {
                // Update existing group
                await bot.database.getModel('Group').update(groupData, {
                    where: { jid: group.id }
                });
            }
            
            logger.debug(`📊 Group ${created ? 'created' : 'updated'}: ${group.subject}`);
            
        } catch (error) {
            logger.error('Process group update error:', error);
        }
    },
    
    /**
     * Handle member join
     */
    async handleMemberJoin(bot, groupJid, participants, group) {
        try {
            if (!group.settings.welcome) return;
            
            // Update group stats
            await bot.database.getModel('Group').increment('stats.membersJoined', {
                where: { jid: groupJid },
                by: participants.length
            });
            
            // Send welcome message
            for (const participant of participants) {
                // Create user record
                await bot.database.createUser({
                    jid: participant,
                    lastActive: new Date()
                });
                
                // Get group metadata for welcome message
                const groupMeta = await bot.getInfo(groupJid);
                const welcomeMessage = await this.generateWelcomeMessage(bot, participant, groupMeta);
                
                await bot.sendMessage(groupJid, welcomeMessage);
                
                // Add delay between messages to avoid spam
                if (participants.length > 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
        } catch (error) {
            logger.error('Handle member join error:', error);
        }
    },
    
    /**
     * Handle member leave
     */
    async handleMemberLeave(bot, groupJid, participants, group) {
        try {
            if (!group.settings.goodbye) return;
            
            // Update group stats
            await bot.database.getModel('Group').increment('stats.membersLeft', {
                where: { jid: groupJid },
                by: participants.length
            });
            
            // Send goodbye message
            for (const participant of participants) {
                const goodbyeMessage = await this.generateGoodbyeMessage(bot, participant);
                await bot.sendMessage(groupJid, goodbyeMessage);
                
                // Add delay between messages
                if (participants.length > 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
        } catch (error) {
            logger.error('Handle member leave error:', error);
        }
    },
    
    /**
     * Handle member promotion
     */
    async handleMemberPromote(bot, groupJid, participants, group) {
        try {
            for (const participant of participants) {
                const message = {
                    text: `👑 *Admin Promotion*\n\n@${participant.split('@')[0]} has been promoted to admin!`,
                    mentions: [participant]
                };
                
                await bot.sendMessage(groupJid, message);
                
                logger.info(`👑 User ${participant} promoted to admin in ${groupJid}`);
            }
            
        } catch (error) {
            logger.error('Handle member promote error:', error);
        }
    },
    
    /**
     * Handle member demotion
     */
    async handleMemberDemote(bot, groupJid, participants, group) {
        try {
            for (const participant of participants) {
                const message = {
                    text: `📉 *Admin Demotion*\n\n@${participant.split('@')[0]} has been demoted from admin.`,
                    mentions: [participant]
                };
                
                await bot.sendMessage(groupJid, message);
                
                logger.info(`📉 User ${participant} demoted from admin in ${groupJid}`);
            }
            
        } catch (error) {
            logger.error('Handle member demote error:', error);
        }
    },
    
    /**
     * Generate welcome message
     */
    async generateWelcomeMessage(bot, userJid, groupMeta) {
        try {
            const user = await bot.database.getUser(userJid);
            const userName = user?.name || user?.pushName || userJid.split('@')[0];
            const groupName = groupMeta?.subject || 'this group';
            
            const welcomeMessages = [
                `🎉 *Welcome to ${groupName}!*\n\nHello @${userJid.split('@')[0]}! We're glad to have you here.\n\nFeel free to introduce yourself and read the group rules.`,
                
                `👋 *Hey there!*\n\nWelcome @${userJid.split('@')[0]} to ${groupName}!\n\nEnjoy your stay and don't hesitate to participate in discussions.`,
                
                `🌟 *New Member Alert!*\n\n@${userJid.split('@')[0]} has joined ${groupName}!\n\nWelcome and have fun!`
            ];
            
            const randomMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
            
            return {
                text: randomMessage,
                mentions: [userJid]
            };
            
        } catch (error) {
            logger.error('Generate welcome message error:', error);
            return {
                text: `Welcome @${userJid.split('@')[0]}! 🎉`,
                mentions: [userJid]
            };
        }
    },
    
    /**
     * Generate goodbye message
     */
    async generateGoodbyeMessage(bot, userJid) {
        try {
            const goodbyeMessages = [
                `👋 *Goodbye!*\n\n@${userJid.split('@')[0]} has left the group.\n\nWe'll miss you! Feel free to come back anytime.`,
                
                `💔 *Farewell*\n\n@${userJid.split('@')[0]} has departed.\n\nThanks for being part of our community!`,
                
                `🚪 *See you later!*\n\n@${userJid.split('@')[0]} has left us.\n\nHope to see you again soon!`
            ];
            
            const randomMessage = goodbyeMessages[Math.floor(Math.random() * goodbyeMessages.length)];
            
            return {
                text: randomMessage,
                mentions: [userJid]
            };
            
        } catch (error) {
            logger.error('Generate goodbye message error:', error);
            return {
                text: `Goodbye @${userJid.split('@')[0]}! 👋`,
                mentions: [userJid]
            };
        }
    },
    
    /**
     * Handle group settings update
     */
    async handleGroupSettingsUpdate(bot, groupJid, setting, value) {
        try {
            const group = await bot.database.getGroup(groupJid);
            if (!group) return;
            
            const newSettings = { ...group.settings, [setting]: value };
            
            await bot.database.getModel('Group').update(
                { settings: newSettings },
                { where: { jid: groupJid } }
            );
            
            logger.info(`⚙️ Group setting updated: ${setting} = ${value} in ${groupJid}`);
            
        } catch (error) {
            logger.error('Handle group settings update error:', error);
        }
    },
    
    /**
     * Handle bot removal from group
     */
    async handleBotRemoved(bot, groupJid) {
        try {
            // Mark group as inactive
            await bot.database.getModel('Group').update(
                { isActive: false },
                { where: { jid: groupJid } }
            );
            
            logger.info(`🚫 Bot removed from group: ${groupJid}`);
            
        } catch (error) {
            logger.error('Handle bot removed error:', error);
        }
    },
    
    /**
     * Handle group subject change
     */
    async handleGroupSubjectChange(bot, groupJid, newSubject, oldSubject, author) {
        try {
            // Update group name in database
            await bot.database.getModel('Group').update(
                { name: newSubject },
                { where: { jid: groupJid } }
            );
            
            // Notify group
            const message = {
                text: `📝 *Group Name Changed*\n\nGroup name changed from "${oldSubject}" to "${newSubject}"\n\nChanged by: @${author.split('@')[0]}`,
                mentions: [author]
            };
            
            await bot.sendMessage(groupJid, message);
            
            logger.info(`📝 Group name changed: ${oldSubject} → ${newSubject} in ${groupJid}`);
            
        } catch (error) {
            logger.error('Handle group subject change error:', error);
        }
    },
    
    /**
     * Handle group description change
     */
    async handleGroupDescChange(bot, groupJid, newDesc, oldDesc, author) {
        try {
            // Update group description in database
            await bot.database.getModel('Group').update(
                { description: newDesc },
                { where: { jid: groupJid } }
            );
            
            // Notify group
            const message = {
                text: `📄 *Group Description Updated*\n\nGroup description has been updated by @${author.split('@')[0]}`,
                mentions: [author]
            };
            
            await bot.sendMessage(groupJid, message);
            
            logger.info(`📄 Group description changed in ${groupJid}`);
            
        } catch (error) {
            logger.error('Handle group description change error:', error);
        }
    }
};

module.exports = eventHandler;
