/**
 * MatDev Message Handler
 * Process incoming WhatsApp messages and route to appropriate handlers
 */

const Message = require('../class/Message');
const Command = require('../class/Command');
const logger = require('../utils/logger');
const { InputValidator } = require('../utils/security');

/**
 * Main message handler
 */
async function messageHandler(bot, messageUpdate) {
    try {
        const { messages, type } = messageUpdate;
        
        if (type !== 'notify') return;
        
        for (const rawMessage of messages) {
            await processMessage(bot, rawMessage);
        }
        
    } catch (error) {
        logger.error('Message handler error:', error);
    }
}

/**
 * Process individual message
 */
async function processMessage(bot, rawMessage) {
    try {
        // Skip if message is from bot itself
        if (rawMessage.key.fromMe) return;
        
        // Skip if no message content
        if (!rawMessage.message) return;
        
        // Create message instance
        const message = new Message(bot, rawMessage);
        
        // Log message for debugging
        logger.debug('📨 Message received:', message.getSummary());
        
        // Validate input
        if (message.text) {
            const validation = InputValidator.validateInput(message.text, {
                maxLength: 4000,
                allowLinks: true
            });
            
            if (!validation.valid) {
                logger.logSecurity('invalid_input', message.sender, {
                    error: validation.error,
                    text: message.text.substring(0, 100)
                });
                
                await message.reply('❌ Invalid input detected. Please check your message.');
                return;
            }
        }
        
        // Security checks
        if (await performSecurityChecks(bot, message)) {
            return; // Message blocked by security
        }
        
        // Log all incoming messages to database
        await logMessageToDatabase(bot, message, 'incoming');
        
        // Update user activity
        await updateUserActivity(bot, message);
        
        // Handle commands
        if (message.isCommand) {
            await handleCommand(bot, message);
        } else {
            // Handle non-command messages
            await handleRegularMessage(bot, message);
        }
        
    } catch (error) {
        logger.error('Process message error:', error);
    }
}

/**
 * Perform security checks on message
 */
async function performSecurityChecks(bot, message) {
    try {
        // Check if user is banned
        const user = await bot.database.getUser(message.sender);
        if (user && user.isBanned) {
            if (!user.banExpiry || new Date() < user.banExpiry) {
                logger.logSecurity('banned_user_message', message.sender, {
                    reason: user.banReason
                });
                return true; // Block message
            } else {
                // Unban expired user
                await bot.database.updateUser(message.sender, {
                    isBanned: false,
                    banReason: null,
                    banExpiry: null
                });
            }
        }
        
        // Anti-spam check
        if (bot.antiSpam.isSpamming(message.sender)) {
            const remaining = bot.antiSpam.getBlockTimeRemaining(message.sender);
            await message.reply(`⚠️ You're sending messages too quickly. Please wait ${remaining} seconds.`);
            return true;
        }
        
        // Flood protection
        if (bot.floodProtection && bot.floodProtection.isFlooding(message.sender)) {
            logger.logSecurity('flood_detected', message.sender);
            return true;
        }
        
        // Group-specific checks
        if (message.isGroup) {
            const group = await bot.database.getGroup(message.from);
            if (group && group.protection) {
                // Anti-link check
                if (group.protection.antiLink && bot.antiLink) {
                    if (bot.antiLink.hasLinks(message.text)) {
                        await message.react('❌');
                        await message.delete();
                        
                        if (!message.isAdmin && !message.isSudo) {
                            await message.reply('🔗 Links are not allowed in this group.');
                            logger.logSecurity('link_detected', message.sender, {
                                group: message.from,
                                links: bot.antiLink.extractLinks(message.text)
                            });
                        }
                        return true;
                    }
                }
            }
        }
        
        return false; // No security issues
        
    } catch (error) {
        logger.error('Security check error:', error);
        return false;
    }
}

/**
 * Update user activity in database
 */
async function updateUserActivity(bot, message) {
    try {
        const userData = {
            jid: message.sender,
            name: message.raw.pushName || '',
            pushName: message.raw.pushName || '',
            lastActive: new Date()
        };
        
        const { user, created } = await bot.database.createUser(userData);
        
        if (!created) {
            // Update existing user stats
            const updates = {
                lastActive: new Date(),
                'stats.messagesReceived': user.stats.messagesReceived + 1
            };
            
            if (message.raw.pushName && message.raw.pushName !== user.pushName) {
                updates.pushName = message.raw.pushName;
            }
            
            await bot.database.updateUser(message.sender, updates);
        }
        
        // Update group stats if in group
        if (message.isGroup) {
            const groupData = {
                jid: message.from,
                name: message.raw.key.remoteJid || '',
                isActive: true
            };
            
            const { group, created: groupCreated } = await bot.database.createGroup(groupData);
            
            if (!groupCreated) {
                await bot.database.getModel('Group').increment('stats.messagesCount', {
                    where: { jid: message.from }
                });
            }
        }
        
    } catch (error) {
        logger.error('Update user activity error:', error);
    }
}

/**
 * Handle command messages
 */
async function handleCommand(bot, message) {
    try {
        // Rate limiting check
        if (!bot.rateLimit.canExecute(message.sender, message.command)) {
            const remaining = bot.rateLimit.getRemainingCommands(message.sender);
            await message.reply(`⏰ Rate limit exceeded. You have ${remaining} commands remaining this minute.`);
            return;
        }
        
        // Initialize command manager if not exists
        if (!bot.commandManager) {
            bot.commandManager = new Command(bot);
        }
        
        // Execute command
        const executed = await bot.commandManager.execute(message, message.command, message.args);
        
        if (executed) {
            // Record command execution
            bot.rateLimit.recordExecution(message.sender, message.command);
            
            // Update user command count
            await bot.database.updateUser(message.sender, {
                commandCount: bot.database.sequelize.literal('commandCount + 1'),
                'stats.commandsUsed': bot.database.sequelize.literal('stats.commandsUsed + 1')
            });
            
            // Log command execution
            logger.logCommand(message.sender, message.command, message.args, true);
        } else {
            // Command not found - send help if enabled
            if (bot.config.AUTO_HELP !== false) {
                await message.reply(`❓ Command "${message.command}" not found. Use ${bot.config.PREFIX}help for available commands.`);
            }
        }
        
    } catch (error) {
        logger.error('Command handler error:', error);
        logger.logCommand(message.sender, message.command, message.args, false);
        
        await message.reply('❌ An error occurred while executing the command.');
    }
}

/**
 * Handle non-command messages
 */
async function handleRegularMessage(bot, message) {
    try {
        // Auto-reactions for certain keywords
        await handleAutoReactions(bot, message);
        
        // Auto-replies
        await handleAutoReplies(bot, message);
        
        // Media processing
        if (message.media) {
            await handleMediaMessage(bot, message);
        }
        
        // Game moves (if in active game)
        if (message.isGroup) {
            await bot.gameHandler?.handleGameMove(message);
        }
        
    } catch (error) {
        logger.error('Regular message handler error:', error);
    }
}

/**
 * Handle auto-reactions
 */
async function handleAutoReactions(bot, message) {
    try {
        if (!message.text) return;
        
        const text = message.text.toLowerCase();
        const reactions = {
            'good morning': '🌅',
            'good night': '🌙',
            'hello': '👋',
            'thanks': '🙏',
            'thank you': '🙏',
            'birthday': '🎂',
            'congratulations': '🎉',
            'congrats': '🎉',
            'sorry': '😔',
            'love': '❤️',
            'heart': '💖'
        };
        
        for (const [keyword, emoji] of Object.entries(reactions)) {
            if (text.includes(keyword)) {
                await message.react(emoji);
                break;
            }
        }
        
    } catch (error) {
        logger.error('Auto-reaction error:', error);
    }
}

/**
 * Handle auto-replies
 */
async function handleAutoReplies(bot, message) {
    try {
        if (!message.text || message.isGroup) return;
        
        const text = message.text.toLowerCase();
        const replies = {
            'hello': 'Hello! 👋 How can I help you today?',
            'hi': 'Hi there! 😊',
            'help': `Type ${bot.config.PREFIX}help to see available commands.`,
            'bot': 'Yes, I am MatDev bot! How can I assist you?',
            'thanks': 'You\'re welcome! 😊',
            'thank you': 'Happy to help! 🙏'
        };
        
        for (const [keyword, reply] of Object.entries(replies)) {
            if (text === keyword) {
                await message.reply(reply);
                break;
            }
        }
        
    } catch (error) {
        logger.error('Auto-reply error:', error);
    }
}

/**
 * Log message to database
 */
async function logMessageToDatabase(bot, message, direction = 'incoming') {
    try {
        const messageData = {
            messageId: message.key.id,
            remoteJid: message.from,
            fromMe: message.key.fromMe,
            participant: message.sender,
            messageType: message.type,
            content: message.text || '',
            mediaType: message.media ? message.type : null,
            mediaSize: message.media ? message.media.fileLength || 0 : null,
            mediaUrl: message.media ? message.media.url || null : null,
            isGroup: message.isGroup,
            isCommand: message.isCommand || false,
            command: message.command || null,
            timestamp: new Date(message.messageTimestamp * 1000),
            direction: direction,
            quotedMessageId: message.quoted ? 'quoted_message' : null,
            metadata: {
                pushName: message.raw.pushName || '',
                platform: 'whatsapp',
                deviceType: message.raw.deviceType || 'unknown'
            }
        };

        // Save to logs table
        await bot.database.getModel('Log').create({
            level: 'info',
            message: `${direction.toUpperCase()}: ${message.type} message from ${message.sender}`,
            category: 'message',
            metadata: messageData
        });

        logger.debug(`📩 ${direction.toUpperCase()} message logged:`, {
            type: message.type,
            from: message.sender,
            content: message.text ? message.text.substring(0, 100) : '[media]'
        });

    } catch (error) {
        logger.error('Failed to log message to database:', error);
    }
}

/**
 * Handle media messages
 */
async function handleMediaMessage(bot, message) {
    try {
        // Update media stats
        await bot.database.updateUser(message.sender, {
            'stats.mediaShared': bot.database.sequelize.literal('stats.mediaShared + 1')
        });
        
        if (message.isGroup) {
            await bot.database.getModel('Group').increment('stats.mediaShared', {
                where: { jid: message.from }
            });
        }
        
        // Log media activity with detailed info
        logger.logMedia(message.type, message.sender, message.media.fileLength || 0, true);
        
        // Log media details to database
        await bot.database.getModel('Log').create({
            level: 'info',
            message: `Media received: ${message.type}`,
            category: 'media',
            metadata: {
                mediaType: message.type,
                fileSize: message.media.fileLength || 0,
                mimeType: message.media.mimetype || '',
                fileName: message.media.fileName || '',
                from: message.sender,
                chat: message.from,
                timestamp: new Date()
            }
        });
        
    } catch (error) {
        logger.error('Media message handler error:', error);
    }
}

module.exports = messageHandler;
