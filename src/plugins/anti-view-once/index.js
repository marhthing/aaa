const path = require('path');
const fs = require('fs-extra');

class AntiViewOncePlugin {
    constructor() {
        this.name = 'anti-view-once';
        this.version = '1.0.0';
        this.description = 'Automatically captures view-once messages for recovery';
        
        this.viewOnceStorage = new Map(); // Store view-once messages temporarily
        this.settingsPath = path.join(process.cwd(), 'data', 'plugins', 'anti-view-once', 'settings.json');
        this.defaultForwardJid = null; // Where to forward recovered view-once messages
        
        this.initializeStorage();
    }

    async initializeStorage() {
        try {
            const storageDir = path.dirname(this.settingsPath);
            await fs.ensureDir(storageDir);
            
            // Load settings if they exist
            if (await fs.pathExists(this.settingsPath)) {
                const settings = await fs.readJson(this.settingsPath);
                this.defaultForwardJid = settings.defaultForwardJid;
                console.log(`🔐 Anti-View-Once loaded with forward JID: ${this.defaultForwardJid || 'owner'}`);
            }
        } catch (error) {
            console.error('❌ Error initializing anti-view-once storage:', error);
        }
    }

    async saveSettings() {
        try {
            await fs.writeJson(this.settingsPath, {
                defaultForwardJid: this.defaultForwardJid,
                lastUpdated: new Date().toISOString()
            }, { spaces: 2 });
        } catch (error) {
            console.error('❌ Error saving anti-view-once settings:', error);
        }
    }

    async initialize(dependencies) {
        this.client = dependencies?.client;
        this.mediaVault = dependencies?.mediaVault;
        this.accessController = dependencies?.accessController;
        
        if (!this.client) {
            console.warn('⚠️ Anti-View-Once: Client not available, will retry on message processing');
        }
        
        console.log('🔐 Anti-View-Once plugin initialized');
        return true;
    }

    getCommands() {
        return [
            {
                name: 'vv',
                description: 'Recover view-once message or set forward destination',
                usage: '.vv [jid] - Send last view-once to jid, or set default forward destination',
                category: 'media'
            }
        ];
    }

    // Called by MessageProcessor when view-once message is detected
    async captureViewOnceMessage(message) {
        try {
            console.log('🔐 Capturing view-once message...');
            
            // Extract view-once content - handle different formats
            let viewOnceMessage = null;
            let isViewOnceV2 = false;
            
            // Check for standard viewOnceMessage wrapper
            if (message.message?.viewOnceMessage?.message) {
                viewOnceMessage = message.message.viewOnceMessage.message;
                console.log('🔐 Processing wrapped view-once message');
            }
            // Check for viewOnceMessageV2 wrapper
            else if (message.message?.viewOnceMessageV2?.message) {
                viewOnceMessage = message.message.viewOnceMessageV2.message;
                isViewOnceV2 = true;
                console.log('🔐 Processing view-once v2 message');
            }
            // Check for direct messages with viewOnce flag
            else if (message.message?.imageMessage?.viewOnce || message.message?.videoMessage?.viewOnce) {
                viewOnceMessage = message.message;
                console.log('🔐 Processing direct view-once message');
            }
            
            if (!viewOnceMessage) {
                console.warn('⚠️ No view-once content found in message');
                return false;
            }

            // Get sender info
            const senderJid = message.key?.participant || message.key?.remoteJid;
            const messageId = message.key?.id;
            const timestamp = new Date();

            // Download and store the media
            let storedMedia = null;
            if (viewOnceMessage.imageMessage || viewOnceMessage.videoMessage) {
                try {
                    console.log('📥 Downloading view-once media...');
                    const { downloadMediaMessage } = require('@whiskeysockets/baileys');
                    
                    // Create the proper message structure for download
                    let downloadMessage;
                    if (isViewOnceV2) {
                        // For v2, use the original message structure
                        downloadMessage = {
                            key: message.key,
                            message: message.message
                        };
                    } else {
                        // For standard view-once, create wrapper if needed
                        downloadMessage = {
                            key: message.key,
                            message: message.message?.viewOnceMessage ? message.message : { viewOnceMessage: { message: viewOnceMessage } }
                        };
                    }
                    
                    let buffer;
                    try {
                        // Download with timeout and proper error handling
                        buffer = await Promise.race([
                            downloadMediaMessage(downloadMessage, 'buffer', {}, { 
                                logger: require('pino')({ level: 'silent' })
                            }),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('Download timeout')), 15000)
                            )
                        ]);
                        
                        console.log('✅ Successfully downloaded view-once media');
                    } catch (downloadError) {
                        console.error('❌ Failed to download view-once media:', downloadError.message);
                        
                        // Try direct message download as fallback
                        try {
                            const directMessage = {
                                key: message.key,
                                message: viewOnceMessage
                            };
                            buffer = await downloadMediaMessage(directMessage, 'buffer', {}, { 
                                logger: require('pino')({ level: 'silent' })
                            });
                            console.log('✅ Successfully downloaded using fallback method');
                        } catch (fallbackError) {
                            console.error('❌ Fallback download also failed:', fallbackError.message);
                            // Log the message structure for debugging
                            console.log('🔍 Message structure debug:', JSON.stringify({
                                hasViewOnceMessage: !!message.message?.viewOnceMessage,
                                hasViewOnceV2: !!message.message?.viewOnceMessageV2,
                                hasImageMessage: !!viewOnceMessage?.imageMessage,
                                hasVideoMessage: !!viewOnceMessage?.videoMessage,
                                hasMediaKey: !!(viewOnceMessage?.imageMessage?.mediaKey || viewOnceMessage?.videoMessage?.mediaKey),
                                hasUrl: !!(viewOnceMessage?.imageMessage?.url || viewOnceMessage?.videoMessage?.url),
                                viewOnceFlag: viewOnceMessage?.imageMessage?.viewOnce || viewOnceMessage?.videoMessage?.viewOnce
                            }, null, 2));
                            throw downloadError;
                        }
                    }

                    if (buffer) {
                        // Determine media type - store all view-once in dedicated folder
                        let mediaType = 'view-once';
                        let filename = 'viewonce_file';
                        let mimetype = 'application/octet-stream';

                        if (viewOnceMessage.imageMessage) {
                            mimetype = viewOnceMessage.imageMessage.mimetype || 'image/jpeg';
                            const ext = mimetype.includes('png') ? 'png' : 'jpg';
                            filename = `viewonce_image_${messageId}_${Date.now()}.${ext}`;
                        } else if (viewOnceMessage.videoMessage) {
                            mimetype = viewOnceMessage.videoMessage.mimetype || 'video/mp4';
                            const ext = mimetype.includes('webm') ? 'webm' : 'mp4';
                            filename = `viewonce_video_${messageId}_${Date.now()}.${ext}`;
                        }

                        // Store in MediaVault
                        const mediaData = {
                            buffer: buffer,
                            mimetype: mimetype,
                            filename: filename,
                            category: mediaType,
                            caption: viewOnceMessage.imageMessage?.caption || viewOnceMessage.videoMessage?.caption || ''
                        };

                        storedMedia = await this.mediaVault.storeMedia(mediaData, message);
                        console.log(`🔐 Stored view-once media: ${storedMedia.filename} in data/media/view-once/`);
                    }
                } catch (error) {
                    console.error('❌ Error downloading view-once media:', error);
                }
            }

            // Store view-once message data
            const viewOnceData = {
                messageId: messageId,
                senderJid: senderJid,
                timestamp: timestamp,
                mediaPath: storedMedia?.relativePath || null,
                mediaMetadata: storedMedia ? {
                    filename: storedMedia.filename,
                    mimetype: storedMedia.mimetype,
                    size: storedMedia.size
                } : null,
                caption: viewOnceMessage.imageMessage?.caption || viewOnceMessage.videoMessage?.caption || '',
                type: viewOnceMessage.imageMessage ? 'image' : (viewOnceMessage.videoMessage ? 'video' : 'unknown')
            };

            // Store in memory for quick access (last 10 view-once messages)
            this.viewOnceStorage.set(messageId, viewOnceData);
            
            // Keep only last 10 view-once messages in memory
            if (this.viewOnceStorage.size > 10) {
                const firstKey = this.viewOnceStorage.keys().next().value;
                this.viewOnceStorage.delete(firstKey);
            }

            // Auto-forward to default JID if configured
            if (this.defaultForwardJid) {
                await this.forwardViewOnceMessage(viewOnceData, this.defaultForwardJid);
            }

            console.log(`🔐 Successfully captured view-once message from ${senderJid}`);
            return true;

        } catch (error) {
            console.error('❌ Error capturing view-once message:', error);
            return false;
        }
    }

    async forwardViewOnceMessage(viewOnceData, targetJid) {
        try {
            if (!this.client) {
                console.error('❌ Cannot forward view-once message: No client available');
                return false;
            }
            
            const senderName = viewOnceData.senderJid.split('@')[0];
            const timestamp = new Date(viewOnceData.timestamp).toLocaleString();
            
            let message = `🔐 *View-Once Message Captured*\n\n`;
            message += `👤 From: ${senderName}\n`;
            message += `⏰ Time: ${timestamp}\n`;
            message += `📱 Type: ${viewOnceData.type}\n`;
            
            if (viewOnceData.caption) {
                message += `💬 Caption: ${viewOnceData.caption}\n`;
            }

            console.log(`🔐 Sending view-once info to ${targetJid}`);
            // Send text info first
            await this.client.sendMessage(targetJid, { text: message });

            // Send media if available
            if (viewOnceData.mediaPath) {
                const mediaPath = path.join(process.cwd(), 'data', 'media', viewOnceData.mediaPath);
                console.log(`🔐 Looking for view-once media at: ${mediaPath}`);
                
                if (await fs.pathExists(mediaPath)) {
                    const mediaBuffer = await fs.readFile(mediaPath);
                    
                    if (viewOnceData.type === 'image') {
                        await this.client.sendMessage(targetJid, {
                            image: mediaBuffer,
                            caption: `🔐 Recovered view-once image from ${senderName}`,
                            contextInfo: {
                                externalAdReply: {
                                    title: "Anti-View-Once",
                                    body: `Captured at ${timestamp}`,
                                    sourceUrl: "",
                                    mediaUrl: "",
                                    mediaType: 1,
                                    showAdAttribution: false
                                }
                            }
                        });
                    } else if (viewOnceData.type === 'video') {
                        await this.client.sendMessage(targetJid, {
                            video: mediaBuffer,
                            caption: `🔐 Recovered view-once video from ${senderName}`,
                            contextInfo: {
                                externalAdReply: {
                                    title: "Anti-View-Once",
                                    body: `Captured at ${timestamp}`,
                                    sourceUrl: "",
                                    mediaUrl: "",
                                    mediaType: 1,
                                    showAdAttribution: false
                                }
                            }
                        });
                    }
                }
            }

            console.log(`🔐 Forwarded view-once message to ${targetJid}`);
            return true;

        } catch (error) {
            console.error('❌ Error forwarding view-once message:', error);
            return false;
        }
    }

    async executeCommand(context) {
        const { message, args, command, client } = context;
        
        // Ensure we have client access
        if (!this.client && client) {
            this.client = client;
        }
        
        try {
            if (command === 'vv') {
                // Check if setting a JID
                if (args.length > 0) {
                    const targetJid = args[0];
                    
                    // Validate JID format
                    if (targetJid.includes('@')) {
                        this.defaultForwardJid = targetJid;
                        await this.saveSettings();
                        
                        return {
                            success: true,
                            message: `🔐 *Anti-View-Once Settings Updated*\n\n✅ View-once messages will now be automatically forwarded to: ${targetJid}`
                        };
                    } else {
                        return {
                            success: false,
                            message: `❌ Invalid JID format. Use: .vv 1234567890@s.whatsapp.net`
                        };
                    }
                }

                // Debug: Log current storage state
                console.log(`🔐 Checking view-once storage... Found ${this.viewOnceStorage.size} messages`);
                
                // Get most recent view-once message
                const recentMessages = Array.from(this.viewOnceStorage.values()).sort((a, b) => b.timestamp - a.timestamp);
                
                if (recentMessages.length === 0) {
                    return {
                        success: true,
                        message: `🔐 *No View-Once Messages*\n\n❌ No captured view-once messages found yet.\n\n💡 Send a view-once message to test the capture feature!`
                    };
                }

                // Send the most recent view-once message to the sender
                const latestViewOnce = recentMessages[0];
                const senderJid = message.key?.participant || message.key?.remoteJid;
                
                console.log(`🔐 Attempting to forward view-once message to ${senderJid}`);
                const success = await this.forwardViewOnceMessage(latestViewOnce, senderJid);
                
                if (success) {
                    return {
                        success: true,
                        message: `🔐 *View-Once Message Sent*\n\n✅ Latest captured view-once message has been sent to you.`
                    };
                } else {
                    return {
                        success: false,
                        message: `❌ Failed to send view-once message. Check logs for details.`
                    };
                }
            }

        } catch (error) {
            console.error('❌ Error executing anti-view-once command:', error);
            return {
                success: false,
                message: `❌ Error executing command: ${error.message}`
            };
        }
    }
}

module.exports = AntiViewOncePlugin;