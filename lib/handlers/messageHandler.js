/**
 * MatDev Message Handler
 * Process incoming WhatsApp messages and route to appropriate handlers
 */

const Message = require('../class/Message');
const Command = require('../class/Command');
const logger = require('../utils/logger');

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
        
        // Save message data to database (simple logging)
        await saveMessageData(bot, message);
        
        // Log received message for debugging
        logger.info(`📥 Received message: "${message.text}" from ${message.sender} - isCommand: ${message.isCommand}`);
        
        // Handle commands only
        if (message.isCommand) {
            logger.info(`🎯 Processing command: ${message.command} with args: [${message.args.join(', ')}]`);
            await handleCommand(bot, message);
        }
        
    } catch (error) {
        logger.error('Process message error:', error);
    }
}

/**
 * Check if user is allowed to use commands
 */
async function isUserAllowed(bot, userJid) {
    try {
        // Owner/Sudo is always allowed
        if (bot.isSudo(userJid)) {
            console.log(`👑 User ${userJid} is SUDO - automatically allowed`);
            return true;
        }
        
        // Check if user is in allowed list
        const allowedUsers = await bot.database.getSetting('allowedUsers') || [];
        const isInList = allowedUsers.includes(userJid);
        
        console.log(`📋 Allowed users list: [${allowedUsers.join(', ')}]`);
        console.log(`🔍 User ${userJid} in allowed list: ${isInList}`);
        
        return isInList;
        
    } catch (error) {
        logger.error('Permission check error:', error);
        console.error('Permission check error:', error);
        return false;
    }
}

/**
 * Save message data to database
 */
async function saveMessageData(bot, message) {
    try {
        const messageData = {
            messageId: message.key.id,
            remoteJid: message.from,
            fromMe: false,
            participant: message.sender,
            messageType: message.type,
            content: message.text || '',
            mediaType: message.media ? message.type : null,
            mediaSize: message.media ? message.media.fileLength || 0 : null,
            isGroup: message.isGroup,
            timestamp: new Date(message.messageTimestamp * 1000),
            direction: 'incoming'
        };

        // Save to logs table
        await bot.database.getModel('Log').create({
            level: 'info',
            message: `Message: ${message.type}`,
            category: 'message',
            metadata: messageData
        });

    } catch (error) {
        logger.error('Failed to save message data:', error);
    }
}

/**
 * Handle command messages
 */
async function handleCommand(bot, message) {
    try {
        console.log(`🎯 Handling command: ${message.command} from ${message.sender}`);
        
        // Special handling for .allow command (owner only)
        if (message.command === 'allow' && bot.isSudo(message.sender)) {
            await handleAllowCommand(bot, message);
            return;
        }
        
        // Check if user is allowed to use commands
        const isAllowed = await isUserAllowed(bot, message.sender);
        console.log(`🔐 User ${message.sender} allowed: ${isAllowed}, isSudo: ${bot.isSudo(message.sender)}`);
        
        if (!isAllowed) {
            console.log(`❌ User ${message.sender} not allowed to use commands`);
            // Send a response to unauthorized users for debugging
            if (bot.isSudo(message.sender)) {
                await message.reply(`🔒 You are SUDO but not in allowed list. Use ${bot.config.PREFIX}allow ${message.sender} to allow yourself.`);
            }
            return;
        }
        
        // Initialize command manager if not exists
        if (!bot.commandManager) {
            bot.commandManager = new Command(bot);
        }
        
        console.log(`⚡ Executing command: ${message.command}`);
        
        // Execute command
        const executed = await bot.commandManager.execute(message, message.command, message.args);
        
        console.log(`✅ Command executed: ${executed}`);
        
        if (!executed && bot.config.AUTO_HELP !== false) {
            await message.reply(`❓ Command "${message.command}" not found. Use ${bot.config.PREFIX}help for available commands.`);
        }
        
    } catch (error) {
        logger.error('Command handler error:', error);
        console.error('Command handler error:', error);
        await message.reply('❌ An error occurred while executing the command.');
    }
}

/**
 * Handle .allow command to permit JIDs
 */
async function handleAllowCommand(bot, message) {
    try {
        const jid = message.args[0];
        
        if (!jid) {
            // Show current allowed users
            const allowedUsers = await bot.database.getSetting('allowedUsers') || [];
            const list = allowedUsers.length > 0 ? allowedUsers.join('\n') : 'No users allowed';
            await message.reply(`📋 *Allowed Users:*\n\n${list}\n\nUse: ${bot.config.PREFIX}allow <jid> to add user`);
            return;
        }
        
        // Add user to allowed list
        const allowedUsers = await bot.database.getSetting('allowedUsers') || [];
        
        if (allowedUsers.includes(jid)) {
            await message.reply(`✅ User ${jid} is already allowed.`);
            return;
        }
        
        allowedUsers.push(jid);
        await bot.database.setSetting('allowedUsers', allowedUsers);
        
        await message.reply(`✅ User ${jid} has been allowed to use commands.`);
        
    } catch (error) {
        logger.error('Allow command error:', error);
        await message.reply('❌ Failed to update allowed users.');
    }
}



module.exports = messageHandler;
