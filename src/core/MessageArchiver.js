const fs = require('fs-extra');
const path = require('path');
const mime = require('mime-types');

class MessageArchiver {
    constructor() {
        this.messagesPath = path.join(process.cwd(), 'data', 'messages');
        this.isInitialized = false;
        this.archiveQueue = [];
        this.processing = false;
    }

    async initialize() {
        try {
            console.log('🔧 Initializing message archiver...');

            // Ensure messages directory exists
            await fs.ensureDir(this.messagesPath);

            // Create current year/month directories
            await this.ensureCurrentDirectories();

            // Start processing queue
            this.startQueueProcessor();

            // Start cleanup scheduler (daily cleanup)
            this.startCleanupScheduler();

            this.isInitialized = true;
            console.log('✅ Message archiver initialized');

        } catch (error) {
            console.error('❌ Failed to initialize message archiver:', error);
            throw error;
        }
    }

    async ensureCurrentDirectories() {
        const now = new Date();
        const year = now.getFullYear().toString();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');

        const yearPath = path.join(this.messagesPath, year);
        const monthPath = path.join(yearPath, month);

        await fs.ensureDir(path.join(monthPath, 'individual'));
        await fs.ensureDir(path.join(monthPath, 'groups'));
        await fs.ensureDir(path.join(monthPath, 'status'));
        await fs.ensureDir(path.join(monthPath, 'channels'));
        await fs.ensureDir(path.join(monthPath, 'broadcast'));
        await fs.ensureDir(path.join(monthPath, 'newsletter'));
    }

    async archiveMessage(message, isOutgoing = false, storedMedia = null) {
        if (!this.isInitialized) {
            console.warn('⚠️ Message archiver not initialized, skipping archive');
            return;
        }

        // Add to queue for processing
        this.archiveQueue.push({
            message,
            timestamp: Date.now(),
            isOutgoing,
            storedMedia,
            archived: false
        });
    }

    startQueueProcessor() {
        setInterval(async () => {
            if (!this.processing && this.archiveQueue.length > 0) {
                await this.processArchiveQueue();
            }
        }, 500); // Process every 500ms for faster archiving
    }

    startCleanupScheduler() {
        // Run cleanup every 24 hours
        setInterval(async () => {
            await this.cleanupOldMessages();
        }, 24 * 60 * 60 * 1000);

        // Run initial cleanup after 10 minutes to allow full startup
        setTimeout(async () => {
            await this.cleanupOldMessages();
        }, 10 * 60 * 1000);
    }

    async cleanupOldMessages() {
        try {
            console.log('🧹 Starting message cleanup (3-day retention)...');
            
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
            
            const years = await fs.readdir(this.messagesPath);
            let deletedCount = 0;
            
            for (const year of years) {
                if (!year.match(/^\d{4}$/)) continue;
                
                const yearPath = path.join(this.messagesPath, year);
                const months = await fs.readdir(yearPath);
                
                for (const month of months) {
                    if (!month.match(/^\d{2}$/)) continue;
                    
                    const monthPath = path.join(yearPath, month);
                    const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
                    
                    if (monthDate < threeDaysAgo) {
                        await fs.remove(monthPath);
                        deletedCount++;
                        console.log(`🗑️ Deleted old messages: ${year}/${month}`);
                    } else {
                        // Clean individual day files within the month
                        const types = await fs.readdir(monthPath);
                        for (const type of types) {
                            const typePath = path.join(monthPath, type);
                            if ((await fs.stat(typePath)).isDirectory()) {
                                const dayFiles = await fs.readdir(typePath);
                                for (const dayFile of dayFiles) {
                                    const filePath = path.join(typePath, dayFile);
                                    const stats = await fs.stat(filePath);
                                    if (stats.mtime < threeDaysAgo) {
                                        await fs.remove(filePath);
                                        deletedCount++;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            if (deletedCount > 0) {
                console.log(`✅ Message cleanup complete: removed ${deletedCount} old files/folders`);
            } else {
                console.log('✅ Message cleanup complete: no old files to remove');
            }
            
        } catch (error) {
            console.error('❌ Error during message cleanup:', error);
        }
    }

    async processArchiveQueue() {
        if (this.processing || this.archiveQueue.length === 0) {
            return;
        }

        this.processing = true;
        
        try {
            const batch = this.archiveQueue.splice(0, 10); // Process in batches of 10
            
            for (const item of batch) {
                await this.saveMessage(item.message, item.isOutgoing, item.storedMedia);
                item.archived = true;
            }
            
            if (batch.length > 0) {
                console.log(`📁 Archived ${batch.length} messages`);
            }
            
        } catch (error) {
            console.error('❌ Error processing archive queue:', error);
        } finally {
            this.processing = false;
        }
    }

    async saveMessage(message, isOutgoing = false, storedMedia = null) {
        try {
            // Extract message content properly
            let messageBody = '';
            let messageType = 'text';
            
            // Handle different message types and content extraction
            if (message.message) {
                if (message.message.conversation) {
                    messageBody = message.message.conversation;
                } else if (message.message.extendedTextMessage?.text) {
                    messageBody = message.message.extendedTextMessage.text;
                } else if (message.message.imageMessage?.caption) {
                    messageBody = message.message.imageMessage.caption || '';
                    messageType = 'image';
                } else if (message.message.videoMessage?.caption) {
                    messageBody = message.message.videoMessage.caption || '';
                    messageType = 'video';
                } else if (message.message.documentMessage?.caption) {
                    messageBody = message.message.documentMessage.caption || '';
                    messageType = 'document';
                } else if (message.message.audioMessage) {
                    messageType = 'audio';
                    messageBody = '[Audio Message]';
                } else if (message.message.stickerMessage) {
                    messageType = 'sticker';
                    messageBody = '[Sticker]';
                } else if (message.message.locationMessage) {
                    messageType = 'location';
                    messageBody = `Location: ${message.message.locationMessage.degreesLatitude}, ${message.message.locationMessage.degreesLongitude}`;
                } else if (message.message.contactMessage) {
                    messageType = 'contact';
                    messageBody = message.message.contactMessage.displayName || 'Contact';
                } else if (message.message.imageMessage) {
                    messageType = 'image';
                    messageBody = '[Image]';
                } else if (message.message.videoMessage) {
                    messageType = 'video';
                    messageBody = '[Video]';
                } else if (message.message.documentMessage) {
                    messageType = 'document';
                    messageBody = message.message.documentMessage.title || message.message.documentMessage.fileName || '[Document]';
                }
            }
            
            // Fallback to direct body property
            if (!messageBody && message.body) {
                messageBody = message.body;
            }

            // If still no content, check for protocol messages or system messages
            if (!messageBody) {
                if (message.message?.protocolMessage) {
                    messageBody = '[System Message]';
                    messageType = 'system';
                } else if (message.message?.reactionMessage) {
                    messageBody = `[Reaction: ${message.message.reactionMessage.text}]`;
                    messageType = 'reaction';
                } else if (message.message?.pollCreationMessage) {
                    messageBody = `[Poll: ${message.message.pollCreationMessage.name}]`;
                    messageType = 'poll';
                } else if (message.messageStubType) {
                    // Handle WhatsApp system messages (group changes, etc.)
                    messageBody = '[System Event]';
                    messageType = 'system';
                } else if (message.broadcast || message.key?.remoteJid?.includes('@newsletter')) {
                    // Handle newsletter/broadcast messages
                    messageBody = '[Broadcast Message]';
                    messageType = 'broadcast';
                } else {
                    // Skip completely empty messages but log less verbosely
                    console.log(`⚠️ Skipping message with no extractable content: ${message.key?.id || 'unknown'}`);
                    return null;
                }
            }

            const messageData = {
                id: message.key?.id || message.id?.id || message.id?._serialized || Date.now().toString(),
                from: message.key?.remoteJid || message.from,
                to: message.to,
                body: messageBody,
                type: messageType,
                timestamp: message.messageTimestamp ? new Date(message.messageTimestamp * 1000) : new Date(),
                isOutgoing,
                hasMedia: !!message.hasMedia || !!message.message?.imageMessage || !!message.message?.videoMessage || !!message.message?.audioMessage || !!message.message?.documentMessage || !!message.message?.stickerMessage,
                quotedMessage: message.message?.extendedTextMessage?.contextInfo?.quotedMessage ? {
                    id: message.message.extendedTextMessage.contextInfo.stanzaId,
                    body: this.extractQuotedMessageBody(message.message.extendedTextMessage.contextInfo.quotedMessage),
                    from: message.message.extendedTextMessage.contextInfo.participant
                } : null,
                mentions: message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [],
                isGroup: message.key?.remoteJid?.includes('@g.us') || false,
                author: message.key?.participant || message.author, // For group messages
                mediaPath: storedMedia ? storedMedia.relativePath : null, // Set directly from stored media
                mediaMetadata: storedMedia ? {
                    uniqueId: storedMedia.id,
                    filename: storedMedia.filename,
                    category: storedMedia.category,
                    mimetype: storedMedia.mimetype,
                    size: storedMedia.size
                } : null,
                archived: new Date().toISOString()
            };

            // Determine storage path based on message type with enhanced categorization
            const messageDate = messageData.timestamp;
            const year = messageDate.getFullYear().toString();
            const month = (messageDate.getMonth() + 1).toString().padStart(2, '0');
            const day = messageDate.getDate().toString().padStart(2, '0');

            let categoryPath;
            const messageFrom = messageData.from || '';
            
            // Enhanced message categorization
            if (messageFrom.includes('@newsletter')) {
                // WhatsApp Newsletter/Channel messages
                categoryPath = path.join(this.messagesPath, year, month, 'newsletter');
                messageData.category = 'newsletter';
            } else if (messageFrom.includes('@broadcast')) {
                // Broadcast list messages
                categoryPath = path.join(this.messagesPath, year, month, 'broadcast');
                messageData.category = 'broadcast';
            } else if (messageFrom.includes('@status') || messageFrom.includes('status@broadcast')) {
                // WhatsApp Status updates
                categoryPath = path.join(this.messagesPath, year, month, 'status');
                messageData.category = 'status';
            } else if (message.broadcast || messageType === 'broadcast') {
                // General broadcast messages
                categoryPath = path.join(this.messagesPath, year, month, 'broadcast');
                messageData.category = 'broadcast';
            } else if (messageData.isGroup) {
                // Regular group messages
                categoryPath = path.join(this.messagesPath, year, month, 'groups');
                messageData.category = 'group';
            } else {
                // Individual/private messages
                categoryPath = path.join(this.messagesPath, year, month, 'individual');
                messageData.category = 'individual';
            }

            await fs.ensureDir(categoryPath);

            // Create daily file
            const fileName = `${day}.json`;
            const filePath = path.join(categoryPath, fileName);

            // Load existing messages for the day
            let dailyMessages = [];
            if (await fs.pathExists(filePath)) {
                try {
                    dailyMessages = await fs.readJson(filePath);
                } catch (error) {
                    console.warn(`⚠️ Error reading existing messages file: ${fileName}`);
                    dailyMessages = [];
                }
            }

            // Add new message
            dailyMessages.push(messageData);

            // Save back to file
            await fs.writeJson(filePath, dailyMessages, { spaces: 2 });

            // Log media storage completion (direct linking - no more two-step process!)
            if (storedMedia) {
                const sizeText = storedMedia.size ? `${Math.round(storedMedia.size / 1024)}KB` : 'unknown size';
                console.log(`✅ Media stored and linked: ${storedMedia.filename} (${sizeText})`);
            }

            return messageData;

        } catch (error) {
            console.error('❌ Error saving message:', error);
            throw error;
        }
    }

    extractQuotedMessageBody(quotedMessage) {
        if (!quotedMessage) return '';
        
        if (quotedMessage.conversation) {
            return quotedMessage.conversation;
        } else if (quotedMessage.extendedTextMessage?.text) {
            return quotedMessage.extendedTextMessage.text;
        } else if (quotedMessage.imageMessage?.caption) {
            return quotedMessage.imageMessage.caption;
        } else if (quotedMessage.videoMessage?.caption) {
            return quotedMessage.videoMessage.caption;
        }
        
        return '';
    }

    // DEPRECATED: No longer needed - media paths are set directly during archiving
    // This method is kept for compatibility but should not be used in new code
    async updateMessageMediaPath(messageId, mediaPath, mediaMetadata = null) {
        console.warn(`⚠️ DEPRECATED: updateMessageMediaPath called for ${messageId}. Media paths should be set during archiving.`);
        return true; // Return success to avoid breaking existing calls
    }

    // LEGACY METHOD - kept for backward compatibility
    async _legacyUpdateMessageMediaPath(messageId, mediaPath, mediaMetadata = null) {
        try {
            // Find the message by ID and update its mediaPath and related metadata
            const searchDays = 3; // Search last 3 days
            const now = new Date();
            
            for (let dayOffset = 0; dayOffset < searchDays; dayOffset++) {
                const searchDate = new Date(now);
                searchDate.setDate(searchDate.getDate() - dayOffset);
                
                const year = searchDate.getFullYear();
                const month = (searchDate.getMonth() + 1).toString().padStart(2, '0');
                const day = searchDate.getDate().toString().padStart(2, '0');
                
                const fileName = `${day}.json`;
                const possiblePaths = [
                    path.join(this.messagesPath, year.toString(), month, 'individual', fileName),
                    path.join(this.messagesPath, year.toString(), month, 'groups', fileName)
                ];
                
                for (const filePath of possiblePaths) {
                    if (await fs.pathExists(filePath)) {
                        try {
                            const messages = await fs.readJson(filePath);
                            
                            // Find and update the message
                            const messageIndex = messages.findIndex(msg => msg.id === messageId);
                            if (messageIndex !== -1) {
                                messages[messageIndex].mediaPath = mediaPath;
                                messages[messageIndex].hasMedia = true;
                                
                                // Add metadata if provided
                                if (mediaMetadata) {
                                    messages[messageIndex].mediaMetadata = {
                                        uniqueId: mediaMetadata.id,
                                        filename: mediaMetadata.filename,
                                        category: mediaMetadata.category,
                                        mimetype: mediaMetadata.mimetype,
                                        size: mediaMetadata.size
                                    };
                                }
                                
                                // Save updated messages
                                await fs.writeJson(filePath, messages, { spaces: 2 });
                                console.log(`📁 Updated media path for message ${messageId}: ${mediaPath}`);
                                return true;
                            }
                        } catch (error) {
                            console.warn(`⚠️ Error updating message in ${filePath}:`, error);
                        }
                    }
                }
            }
            
            // Extended search - look for the message in all archive files if not found in recent days
            console.log(`🔍 Message ${messageId} not found in recent files, performing comprehensive search...`);
            const comprehensiveResult = await this.findMessageInAllArchives(messageId);
            
            if (comprehensiveResult) {
                const { filePath, messages } = comprehensiveResult;
                const messageIndex = messages.findIndex(msg => msg.id === messageId);
                if (messageIndex !== -1) {
                    messages[messageIndex].mediaPath = mediaPath;
                    messages[messageIndex].hasMedia = true;
                    
                    if (mediaMetadata) {
                        messages[messageIndex].mediaMetadata = {
                            uniqueId: mediaMetadata.id,
                            filename: mediaMetadata.filename,
                            category: mediaMetadata.category,
                            mimetype: mediaMetadata.mimetype,
                            size: mediaMetadata.size
                        };
                    }
                    
                    await fs.writeJson(filePath, messages, { spaces: 2 });
                    console.log(`📁 Updated media path for message ${messageId}: ${mediaPath}`);
                    return true;
                }
            }
            
            console.warn(`⚠️ Could not find message ${messageId} in any archive files`);
            return false;
        } catch (error) {
            console.error('❌ Error updating message media path:', error);
            return false;
        }
    }

    async findMessageInAllArchives(messageId) {
        try {
            const yearDirs = await fs.readdir(this.messagesPath);
            
            for (const year of yearDirs) {
                const yearPath = path.join(this.messagesPath, year);
                const monthDirs = await fs.readdir(yearPath);
                
                for (const month of monthDirs) {
                    const monthPath = path.join(yearPath, month);
                    const chatTypeDirs = await fs.readdir(monthPath);
                    
                    for (const chatType of chatTypeDirs) {
                        const chatTypePath = path.join(monthPath, chatType);
                        const files = await fs.readdir(chatTypePath);
                        
                        for (const file of files) {
                            if (file.endsWith('.json')) {
                                const filePath = path.join(chatTypePath, file);
                                try {
                                    const messages = await fs.readJson(filePath);
                                    if (messages.some(msg => msg.id === messageId)) {
                                        return { filePath, messages };
                                    }
                                } catch (error) {
                                    // Skip corrupted files
                                    continue;
                                }
                            }
                        }
                    }
                }
            }
            
            return null;
        } catch (error) {
            console.error('❌ Error in comprehensive archive search:', error);
            return null;
        }
    }

    async recoverMissedMessages(client) {
        // This method can be called after reconnection to try to recover missed messages
        try {
            console.log('🔍 Checking for missed messages...');
            
            // Get recent chats and check for new messages
            // This is a placeholder - WhatsApp doesn't provide a direct way to get missed messages
            // But we can implement logic to check recent chat history
            
            const lastCheckFile = path.join(process.cwd(), 'data', 'system', 'last_message_check.json');
            let lastCheckTime = 0;
            
            try {
                if (await fs.pathExists(lastCheckFile)) {
                    const data = await fs.readJson(lastCheckFile);
                    lastCheckTime = data.timestamp || 0;
                }
            } catch (error) {
                console.warn('⚠️ Could not read last check time');
            }

            // Update last check time
            await fs.writeJson(lastCheckFile, {
                timestamp: Date.now(),
                lastCheck: new Date().toISOString()
            }, { spaces: 2 });

            console.log('✅ Message recovery check completed');

        } catch (error) {
            console.error('❌ Error during message recovery:', error);
        }

        try {
            const batch = this.archiveQueue.splice(0, 20); // Process up to 20 messages at once
            
            // Process messages in parallel for better performance
            const promises = batch.map(item => this.saveMessage(item.message, item.isOutgoing));
            await Promise.allSettled(promises); // Use allSettled to not fail on individual errors
            
            console.log(`📁 Archived ${batch.length} messages`);

        } catch (error) {
            console.error('❌ Error processing archive queue:', error);
        } finally {
            this.processing = false;
        }
    }

    async archiveMessageToFile(message) {
        try {
            const messageData = this.extractMessageData(message);
            const filePath = this.getArchiveFilePath(messageData);

            // Read existing messages for the day
            let messages = [];
            if (await fs.pathExists(filePath)) {
                try {
                    const existingData = await fs.readJson(filePath);
                    messages = existingData.messages || [];
                } catch (error) {
                    console.error('⚠️ Failed to read existing archive, creating new:', error);
                }
            }

            // Add new message
            messages.push(messageData);

            // Sort by timestamp
            messages.sort((a, b) => a.timestamp - b.timestamp);

            // Write back to file
            const archiveData = {
                date: messageData.date,
                chatId: messageData.chatId,
                chatName: messageData.chatName,
                chatType: messageData.chatType,
                messageCount: messages.length,
                lastUpdated: new Date().toISOString(),
                messages: messages
            };

            await fs.writeJson(filePath, archiveData, { spaces: 2 });

        } catch (error) {
            console.error('❌ Failed to archive message:', error);
        }
    }

    extractMessageData(message) {
        const timestamp = message.timestamp * 1000; // Convert to milliseconds
        const date = new Date(timestamp);

        return {
            id: message.id._serialized || message.id.id,
            timestamp: timestamp,
            date: date.toISOString().split('T')[0], // YYYY-MM-DD
            dateTime: date.toISOString(),
            chatId: message.from,
            chatName: message._data.notifyName || message.from,
            chatType: message.from.includes('@g.us') ? 'group' : 
                     message.from.includes('@status') ? 'status' : 'individual',
            from: message.from,
            author: message.author || message.from,
            authorName: message._data.notifyName || null,
            to: message.to,
            body: message.body || '',
            type: message.type,
            hasMedia: message.hasMedia || false,
            mediaData: message.hasMedia ? {
                mimetype: message._data.mimetype,
                filename: message._data.filename,
                caption: message._data.caption,
                size: message._data.size
            } : null,
            quotedMessage: message.hasQuotedMsg ? {
                id: message._data.quotedMsg.id,
                body: message._data.quotedMsg.body,
                author: message._data.quotedMsg.author
            } : null,
            isForwarded: message.isForwarded || false,
            forwardingScore: message.forwardingScore || 0,
            isStarred: message.isStarred || false,
            broadcast: message.broadcast || false,
            fromMe: message.fromMe || false,
            deviceType: message.deviceType || null,
            isStatus: message.isStatus || false,
            links: message.links || [],
            mentionedIds: message.mentionedIds || [],
            location: message.location || null,
            vCards: message.vCards || [],
            isGif: message.isGif || false,
            archived: new Date().toISOString()
        };
    }

    getArchiveFilePath(messageData) {
        const date = new Date(messageData.timestamp);
        const year = date.getFullYear().toString();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');

        const monthPath = path.join(this.messagesPath, year, month);
        
        let categoryPath;
        switch (messageData.chatType) {
            case 'group':
                categoryPath = path.join(monthPath, 'groups');
                break;
            case 'status':
                categoryPath = path.join(monthPath, 'status');
                break;
            default:
                categoryPath = path.join(monthPath, 'individual');
        }

        // Use chat ID as filename (sanitized)
        const sanitizedChatId = messageData.chatId.replace(/[^a-zA-Z0-9@.-]/g, '_');
        return path.join(categoryPath, `${sanitizedChatId}_${day}.json`);
    }

    async searchMessages(criteria) {
        const {
            chatId,
            dateFrom,
            dateTo,
            text,
            author,
            hasMedia,
            limit = 50
        } = criteria;

        const results = [];
        
        try {
            // Determine date range to search
            const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
            const endDate = dateTo ? new Date(dateTo) : new Date();

            // Get all archive files in date range
            const archiveFiles = await this.getArchiveFilesInRange(startDate, endDate);

            for (const filePath of archiveFiles) {
                try {
                    const fileData = await fs.readJson(filePath);
                    
                    // Handle both array format (daily files) and structured format
                    let messages = [];
                    if (Array.isArray(fileData)) {
                        messages = fileData;
                    } else if (fileData.messages && Array.isArray(fileData.messages)) {
                        messages = fileData.messages;
                    } else {
                        console.warn(`⚠️ Unexpected file format in ${filePath}`);
                        continue;
                    }
                    
                    for (const message of messages) {
                        // Apply filters
                        if (chatId && message.from !== chatId) continue;
                        if (author && message.author !== author) continue;
                        if (hasMedia !== undefined && message.hasMedia !== hasMedia) continue;
                        if (text && !message.body.toLowerCase().includes(text.toLowerCase())) continue;

                        results.push(message);

                        if (results.length >= limit) {
                            break;
                        }
                    }

                    if (results.length >= limit) {
                        break;
                    }

                } catch (error) {
                    console.error(`⚠️ Failed to read archive file ${filePath}:`, error);
                }
            }

        } catch (error) {
            console.error('❌ Error searching messages:', error);
        }

        return results.sort((a, b) => b.timestamp - a.timestamp);
    }

    async getArchiveFilesInRange(startDate, endDate) {
        const files = [];
        const currentDate = new Date(startDate);

        while (currentDate <= endDate) {
            const year = currentDate.getFullYear().toString();
            const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
            const day = currentDate.getDate().toString().padStart(2, '0');

            const monthPath = path.join(this.messagesPath, year, month);

            if (await fs.pathExists(monthPath)) {
                const categories = ['individual', 'groups', 'status'];
                
                for (const category of categories) {
                    const categoryPath = path.join(monthPath, category);
                    
                    if (await fs.pathExists(categoryPath)) {
                        const dayFiles = await fs.readdir(categoryPath);
                        
                        for (const filename of dayFiles) {
                            // Check for daily files (day.json format)
                            if (filename === `${day}.json`) {
                                files.push(path.join(categoryPath, filename));
                            }
                        }
                    }
                }
            }

            currentDate.setDate(currentDate.getDate() + 1);
        }

        return files;
    }

    async getMessageById(messageId) {
        try {
            console.log(`🔍 Searching for message ID: ${messageId}`);
            
            // Search in recent files (last 7 days)
            const now = new Date();
            const searchDays = 7;
            
            for (let i = 0; i < searchDays; i++) {
                const searchDate = new Date(now);
                searchDate.setDate(searchDate.getDate() - i);
                
                const year = searchDate.getFullYear().toString();
                const month = (searchDate.getMonth() + 1).toString().padStart(2, '0');
                const day = searchDate.getDate().toString().padStart(2, '0');
                
                // Search in all categories
                const categories = ['individual', 'groups', 'status'];
                
                for (const category of categories) {
                    const dayFilePath = path.join(this.messagesPath, year, month, category, `${day}.json`);
                    
                    if (await fs.pathExists(dayFilePath)) {
                        try {
                            const dailyMessages = await fs.readJson(dayFilePath);
                            console.log(`🔍 Searching in ${dayFilePath} - Found ${dailyMessages.length} messages`);
                            
                            for (const message of dailyMessages) {
                                if (message.id === messageId) {
                                    console.log(`✅ Found message with ID: ${messageId}`);
                                    return message;
                                }
                            }
                        } catch (fileError) {
                            console.warn(`⚠️ Error reading file ${dayFilePath}:`, fileError);
                        }
                    }
                }
            }
            
            console.log(`⚠️ Message not found with ID: ${messageId}`);
            return null;

        } catch (error) {
            console.error('❌ Error getting message by ID:', error);
            return null;
        }
    }

    async getChatHistory(chatId, limit = 100) {
        return await this.searchMessages({
            chatId: chatId,
            limit: limit
        });
    }

    async getArchiveStats() {
        try {
            const stats = {
                totalMessages: 0,
                totalChats: new Set(),
                messagesByType: {},
                messagesByDate: {},
                oldestMessage: null,
                newestMessage: null
            };

            const yearDirs = await fs.readdir(this.messagesPath);
            
            for (const year of yearDirs) {
                const yearPath = path.join(this.messagesPath, year);
                if (!(await fs.stat(yearPath)).isDirectory()) continue;

                const monthDirs = await fs.readdir(yearPath);
                
                for (const month of monthDirs) {
                    const monthPath = path.join(yearPath, month);
                    if (!(await fs.stat(monthPath)).isDirectory()) continue;

                    const categories = ['individual', 'groups', 'status'];
                    
                    for (const category of categories) {
                        const categoryPath = path.join(monthPath, category);
                        
                        if (await fs.pathExists(categoryPath)) {
                            const files = await fs.readdir(categoryPath);
                            
                            for (const filename of files) {
                                if (!filename.endsWith('.json')) continue;

                                try {
                                    const archiveData = await fs.readJson(path.join(categoryPath, filename));
                                    const messages = archiveData.messages || [];
                                    
                                    stats.totalMessages += messages.length;
                                    stats.totalChats.add(archiveData.chatId);

                                    for (const message of messages) {
                                        // Count by type
                                        stats.messagesByType[message.type] = 
                                            (stats.messagesByType[message.type] || 0) + 1;

                                        // Count by date
                                        stats.messagesByDate[message.date] = 
                                            (stats.messagesByDate[message.date] || 0) + 1;

                                        // Track oldest/newest
                                        if (!stats.oldestMessage || message.timestamp < stats.oldestMessage) {
                                            stats.oldestMessage = message.timestamp;
                                        }
                                        if (!stats.newestMessage || message.timestamp > stats.newestMessage) {
                                            stats.newestMessage = message.timestamp;
                                        }
                                    }

                                } catch (error) {
                                    console.error(`⚠️ Failed to read archive file ${filename}:`, error);
                                }
                            }
                        }
                    }
                }
            }

            stats.totalChats = stats.totalChats.size;
            return stats;

        } catch (error) {
            console.error('❌ Error getting archive stats:', error);
            return null;
        }
    }

    getQueueStats() {
        return {
            queueSize: this.archiveQueue.length,
            processing: this.processing,
            oldestInQueue: this.archiveQueue.length > 0 ? 
                this.archiveQueue[0].timestamp : null
        };
    }
}

module.exports = MessageArchiver;
