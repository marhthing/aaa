/**
 * Broadcast Plugin - Send messages to multiple chats
 */

module.exports = {
    name: 'broadcast',
    description: 'Send messages to multiple groups and users',
    version: '1.0.0',
    command: ['broadcast', 'bc', 'announce'],
    category: 'admin',
    usage: '<type> <message>',
    fromMe: false,
    type: 'whatsapp',
    sudoOnly: true,
    cooldown: 10,
    
    async function(message, match, bot) {
        try {
            const args = match ? match.trim().split(' ') : [];
            const type = args[0]?.toLowerCase();
            const broadcastMessage = args.slice(1).join(' ');
            
            if (!type) {
                await this.showBroadcastMenu(message, bot);
                return;
            }
            
            if (!broadcastMessage) {
                await message.reply('❓ Please provide a message to broadcast.\n\nUsage: `broadcast <type> <message>`');
                return;
            }
            
            switch (type) {
                case 'groups':
                case 'group':
                    await this.broadcastToGroups(message, broadcastMessage, bot);
                    break;
                    
                case 'users':
                case 'user':
                    await this.broadcastToUsers(message, broadcastMessage, bot);
                    break;
                    
                case 'all':
                    await this.broadcastToAll(message, broadcastMessage, bot);
                    break;
                    
                case 'test':
                    await this.testBroadcast(message, broadcastMessage, bot);
                    break;
                    
                default:
                    await message.reply(`❓ Unknown broadcast type: ${type}\n\nAvailable types: groups, users, all, test`);
            }
            
        } catch (error) {
            await message.reply('❌ Broadcast failed.');
            throw error;
        }
    },
    
    /**
     * Show broadcast menu
     */
    async showBroadcastMenu(message, bot) {
        const prefix = bot.config.PREFIX;
        
        let broadcastText = `📡 *Broadcast Control Panel*\n\n`;
        broadcastText += `📢 *Broadcast Types:*\n`;
        broadcastText += `• ${prefix}broadcast groups <message> - Send to all groups\n`;
        broadcastText += `• ${prefix}broadcast users <message> - Send to all users\n`;
        broadcastText += `• ${prefix}broadcast all <message> - Send to groups and users\n`;
        broadcastText += `• ${prefix}broadcast test <message> - Test broadcast (owner only)\n\n`;
        
        // Get statistics
        const stats = await this.getBroadcastStats(bot);
        
        broadcastText += `📊 *Statistics:*\n`;
        broadcastText += `• Active Groups: ${stats.groups}\n`;
        broadcastText += `• Total Users: ${stats.users}\n`;
        broadcastText += `• Estimated Reach: ${stats.total}\n\n`;
        
        broadcastText += `⚠️ *Important:*\n`;
        broadcastText += `• Use broadcasts responsibly\n`;
        broadcastText += `• Add delays to avoid rate limiting\n`;
        broadcastText += `• Test with small groups first\n`;
        broadcastText += `• Monitor delivery status\n\n`;
        
        broadcastText += `💡 *Tips:*\n`;
        broadcastText += `• Use markdown formatting (*bold*, _italic_)\n`;
        broadcastText += `• Keep messages concise and relevant\n`;
        broadcastText += `• Include contact info for replies`;
        
        await message.reply(broadcastText);
    },
    
    /**
     * Broadcast to all groups
     */
    async broadcastToGroups(message, broadcastMessage, bot) {
        try {
            const Group = bot.database.getModel('Group');
            const groups = await Group.findAll({
                where: { isActive: true }
            });
            
            if (groups.length === 0) {
                await message.reply('📭 No active groups found.');
                return;
            }
            
            const confirmMessage = `📡 *Group Broadcast*\n\nMessage: "${broadcastMessage}"\nTarget: ${groups.length} groups\n\nSend broadcast? Reply with 'yes' to confirm.`;
            await message.reply(confirmMessage);
            
            // Wait for confirmation
            const confirmed = await this.waitForConfirmation(message, bot);
            if (!confirmed) {
                await message.reply('❌ Broadcast cancelled.');
                return;
            }
            
            // Start broadcasting
            await message.reply(`📡 Starting broadcast to ${groups.length} groups...`);
            
            const results = await this.sendBroadcast(groups, broadcastMessage, 'group', bot, message);
            
            // Send results
            const resultText = this.formatBroadcastResults(results, 'groups');
            await message.reply(resultText);
            
        } catch (error) {
            await message.reply('❌ Group broadcast failed.');
            throw error;
        }
    },
    
    /**
     * Broadcast to all users
     */
    async broadcastToUsers(message, broadcastMessage, bot) {
        try {
            const User = bot.database.getModel('User');
            const users = await User.findAll({
                where: { 
                    isBanned: false,
                    lastActive: {
                        [bot.database.sequelize.Sequelize.Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Active in last 30 days
                    }
                }
            });
            
            if (users.length === 0) {
                await message.reply('📭 No active users found.');
                return;
            }
            
            const confirmMessage = `📡 *User Broadcast*\n\nMessage: "${broadcastMessage}"\nTarget: ${users.length} users\n\nSend broadcast? Reply with 'yes' to confirm.`;
            await message.reply(confirmMessage);
            
            // Wait for confirmation
            const confirmed = await this.waitForConfirmation(message, bot);
            if (!confirmed) {
                await message.reply('❌ Broadcast cancelled.');
                return;
            }
            
            // Start broadcasting
            await message.reply(`📡 Starting broadcast to ${users.length} users...`);
            
            const results = await this.sendBroadcast(users, broadcastMessage, 'user', bot, message);
            
            // Send results
            const resultText = this.formatBroadcastResults(results, 'users');
            await message.reply(resultText);
            
        } catch (error) {
            await message.reply('❌ User broadcast failed.');
            throw error;
        }
    },
    
    /**
     * Broadcast to all (groups and users)
     */
    async broadcastToAll(message, broadcastMessage, bot) {
        try {
            const stats = await this.getBroadcastStats(bot);
            
            const confirmMessage = `📡 *Full Broadcast*\n\nMessage: "${broadcastMessage}"\nTarget: ${stats.total} recipients (${stats.groups} groups + ${stats.users} users)\n\nThis is a FULL broadcast. Send? Reply with 'yes' to confirm.`;
            await message.reply(confirmMessage);
            
            // Wait for confirmation
            const confirmed = await this.waitForConfirmation(message, bot);
            if (!confirmed) {
                await message.reply('❌ Broadcast cancelled.');
                return;
            }
            
            // Broadcast to groups first
            await message.reply('📡 Broadcasting to groups...');
            await this.broadcastToGroups(message, broadcastMessage, bot);
            
            // Wait between broadcasts
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Broadcast to users
            await message.reply('📡 Broadcasting to users...');
            await this.broadcastToUsers(message, broadcastMessage, bot);
            
        } catch (error) {
            await message.reply('❌ Full broadcast failed.');
            throw error;
        }
    },
    
    /**
     * Test broadcast
     */
    async testBroadcast(message, broadcastMessage, bot) {
        try {
            // Send test broadcast only to the sender
            const testMessage = `🧪 *Test Broadcast*\n\n${broadcastMessage}\n\n_This is a test broadcast. Only you received this message._`;
            
            await bot.sendMessage(message.sender, { text: testMessage });
            await message.reply('✅ Test broadcast sent to your private chat.');
            
        } catch (error) {
            await message.reply('❌ Test broadcast failed.');
        }
    },
    
    /**
     * Send broadcast to targets
     */
    async sendBroadcast(targets, broadcastMessage, type, bot, originalMessage) {
        const results = {
            total: targets.length,
            success: 0,
            failed: 0,
            errors: []
        };
        
        const formattedMessage = {
            text: `📢 *MatDev Broadcast*\n\n${broadcastMessage}\n\n_This is an automated broadcast message._`
        };
        
        for (let i = 0; i < targets.length; i++) {
            try {
                const target = targets[i];
                const jid = target.jid;
                
                await bot.sendMessage(jid, formattedMessage);
                results.success++;
                
                // Progress update every 10 messages
                if ((i + 1) % 10 === 0 || i === targets.length - 1) {
                    const progress = `📡 Progress: ${i + 1}/${targets.length} (${results.success} success, ${results.failed} failed)`;
                    await originalMessage.reply(progress);
                }
                
                // Add delay to avoid rate limiting
                await this.delay(1000 + Math.random() * 1000); // 1-2 seconds
                
            } catch (error) {
                results.failed++;
                results.errors.push({
                    target: targets[i].jid,
                    error: error.message
                });
                
                // Continue with next target
                continue;
            }
        }
        
        return results;
    },
    
    /**
     * Wait for user confirmation
     */
    async waitForConfirmation(message, bot, timeout = 30000) {
        return new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
                resolve(false);
            }, timeout);
            
            const messageHandler = async (m) => {
                try {
                    const msgs = m.messages;
                    if (!msgs || msgs.length === 0) return;
                    
                    const msg = msgs[0];
                    if (!msg.message || msg.key.fromMe) return;
                    
                    // Check if it's from the same user and chat
                    if (msg.key.remoteJid === message.from && 
                        (msg.key.participant || msg.key.remoteJid) === message.sender) {
                        
                        const text = msg.message.conversation || 
                                   msg.message.extendedTextMessage?.text || '';
                        
                        if (text.toLowerCase() === 'yes') {
                            clearTimeout(timeoutId);
                            bot.sock.ev.off('messages.upsert', messageHandler);
                            resolve(true);
                        } else if (text.toLowerCase() === 'no') {
                            clearTimeout(timeoutId);
                            bot.sock.ev.off('messages.upsert', messageHandler);
                            resolve(false);
                        }
                    }
                } catch (error) {
                    // Ignore errors in confirmation handler
                }
            };
            
            bot.sock.ev.on('messages.upsert', messageHandler);
        });
    },
    
    /**
     * Get broadcast statistics
     */
    async getBroadcastStats(bot) {
        try {
            const Group = bot.database.getModel('Group');
            const User = bot.database.getModel('User');
            
            const groupCount = await Group.count({
                where: { isActive: true }
            });
            
            const userCount = await User.count({
                where: { 
                    isBanned: false,
                    lastActive: {
                        [bot.database.sequelize.Sequelize.Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                    }
                }
            });
            
            return {
                groups: groupCount,
                users: userCount,
                total: groupCount + userCount
            };
        } catch (error) {
            return { groups: 0, users: 0, total: 0 };
        }
    },
    
    /**
     * Format broadcast results
     */
    formatBroadcastResults(results, type) {
        const successRate = results.total > 0 ? (results.success / results.total * 100).toFixed(1) : 0;
        
        let resultText = `📊 *Broadcast Results*\n\n`;
        resultText += `📡 Type: ${type}\n`;
        resultText += `📈 Total: ${results.total}\n`;
        resultText += `✅ Success: ${results.success}\n`;
        resultText += `❌ Failed: ${results.failed}\n`;
        resultText += `📊 Success Rate: ${successRate}%\n\n`;
        
        if (results.errors.length > 0) {
            resultText += `⚠️ *Errors (showing first 5):*\n`;
            const errorSample = results.errors.slice(0, 5);
            
            errorSample.forEach((error, index) => {
                resultText += `${index + 1}. ${error.target.split('@')[0]}: ${error.error.substring(0, 50)}\n`;
            });
            
            if (results.errors.length > 5) {
                resultText += `... and ${results.errors.length - 5} more errors\n`;
            }
        }
        
        resultText += `\n🕐 Completed: ${new Date().toLocaleString()}`;
        
        return resultText;
    },
    
    /**
     * Delay utility
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};
