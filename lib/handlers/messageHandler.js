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
        console.log('📨 MESSAGE HANDLER CALLED:', { type: messageUpdate.type, messageCount: messageUpdate.messages?.length });
        const { messages, type } = messageUpdate;
        
        if (type !== 'notify') {
            console.log('⚠️ Skipping non-notify message type:', type);
            return;
        }
        
        for (const rawMessage of messages) {
            console.log('🔍 PROCESSING RAW MESSAGE:', rawMessage.key);
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
        if (rawMessage.key.fromMe) {
            console.log('🤖 SKIPPING MESSAGE FROM SELF:', rawMessage.key);
            return;
        }
        
        // Skip if no message content
        if (!rawMessage.message) return;
        
        // Create message instance
        const message = new Message(bot, rawMessage);
        
        // Save message data to database and JSON file
        await saveMessageData(bot, message);
        await saveMessageToJSON(bot, message);
        
        // Handle media download and saving
        if (message.media) {
            await saveMediaFile(bot, message);
        }
        
        // Log received message for debugging
        logger.info(`📥 Received message: "${message.text}" from ${message.sender} - isCommand: ${message.isCommand}`);
        console.log(`📥 DEBUG: Text="${message.text}", Prefix="${bot.config.PREFIX}", Starts with prefix: ${message.text && message.text.startsWith(bot.config.PREFIX)}`);
        
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
        // Owner/Sudo is ALWAYS allowed - no need to check allowed list
        if (bot.isSudo(userJid)) {
            console.log(`👑 User ${userJid} is SUDO - automatically allowed`);
            return true;
        }
        
        // Check if user is in allowed list (for non-sudo users)
        const allowedUsers = await bot.database.getSetting('allowedUsers') || [];
        const isInList = allowedUsers.includes(userJid);
        
        console.log(`📋 Allowed users list: [${allowedUsers.join(', ')}]`);
        console.log(`🔍 User ${userJid} in allowed list: ${isInList}`);
        
        return isInList;
        
    } catch (error) {
        logger.error('Permission check error:', error);
        console.error('Permission check error:', error);
        // If there's an error checking permissions and user is SUDO, allow them
        if (bot.isSudo(userJid)) {
            return true;
        }
        return false;
    }
}

/**
 * Save message data to database or JSON
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

        // Save to database (works with both SQL and JSON modes)
        const Log = bot.database.getModel('Log');
        if (Log) {
            await Log.create({
                level: 'info',
                message: `Message: ${message.type}`,
                category: 'message',
                metadata: messageData
            });
        }

    } catch (error) {
        logger.error('Failed to save message data:', error);
    }
}

/**
 * Save message to JSON file
 */
async function saveMessageToJSON(bot, message) {
    try {
        const fs = require('fs-extra');
        const path = require('path');
        
        // Create messages directory if it doesn't exist
        const messagesDir = path.join(process.cwd(), 'data', 'messages');
        await fs.ensureDir(messagesDir);
        
        // Create JSON data
        const messageJSON = {
            messageId: message.key.id,
            from: message.from,
            sender: message.sender,
            type: message.type,
            text: message.text,
            timestamp: new Date(message.messageTimestamp * 1000).toISOString(),
            isGroup: message.isGroup,
            isCommand: message.isCommand || false,
            command: message.command || null,
            args: message.args || [],
            media: message.media ? {
                type: message.type,
                size: message.media.fileLength || 0,
                mimetype: message.media.mimetype || 'unknown'
            } : null,
            raw: message.raw // Include raw message for debugging
        };
        
        // Save to daily JSON file
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        const jsonFile = path.join(messagesDir, `messages-${today}.json`);
        
        // Read existing data or create new array
        let messages = [];
        if (await fs.pathExists(jsonFile)) {
            try {
                const existingData = await fs.readFile(jsonFile, 'utf8');
                messages = JSON.parse(existingData);
            } catch (parseError) {
                logger.warn('Failed to parse existing JSON file, starting fresh:', parseError);
            }
        }
        
        // Add new message
        messages.push(messageJSON);
        
        // Write back to file
        await fs.writeFile(jsonFile, JSON.stringify(messages, null, 2));
        
        logger.debug(`💾 Message saved to JSON: ${jsonFile}`);
        
    } catch (error) {
        logger.error('Failed to save message to JSON:', error);
    }
}

/**
 * Save media file to disk
 */
async function saveMediaFile(bot, message) {
    try {
        if (!message.media) return;
        
        const fs = require('fs-extra');
        const path = require('path');
        
        // Create media directory
        const mediaDir = path.join(process.cwd(), 'data', 'media');
        await fs.ensureDir(mediaDir);
        
        // Download media
        const mediaBuffer = await message.downloadMedia();
        
        if (!mediaBuffer) {
            logger.warn('Failed to download media - buffer is empty');
            return;
        }
        
        // Generate filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const extension = getFileExtension(message.media.mimetype || 'unknown');
        const filename = `${message.type}_${timestamp}_${message.key.id}${extension}`;
        const filepath = path.join(mediaDir, filename);
        
        // Save file
        await fs.writeFile(filepath, mediaBuffer);
        
        logger.info(`📁 Media saved: ${filename} (${mediaBuffer.length} bytes)`);
        
        // Update message object with local file path
        message.localFilePath = filepath;
        
    } catch (error) {
        logger.error('Failed to save media file:', error);
    }
}

/**
 * Get file extension from mimetype
 */
function getFileExtension(mimetype) {
    const extensions = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'video/mp4': '.mp4',
        'video/3gpp': '.3gp',
        'audio/ogg': '.ogg',
        'audio/mpeg': '.mp3',
        'audio/mp4': '.mp4',
        'application/pdf': '.pdf',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx'
    };
    
    return extensions[mimetype] || '.bin';
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
            // Don't send response for unauthorized users to avoid spam
            // SUDO users are automatically allowed above, so this should only affect non-sudo users
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
