const fs = require('fs-extra');
const path = require('path');

// Try to load optional dependencies gracefully
let sharp, ffmpeg;

try {
    sharp = require('sharp');
} catch (e) {
    console.warn('⚠️ Sharp not installed - image processing will be limited');
}

try {
    ffmpeg = require('fluent-ffmpeg');
} catch (e) {
    console.warn('⚠️ FFmpeg not installed - video processing will be limited');
}

class StickerPlugin {
    constructor(options = {}) {
        this.name = 'sticker';
        this.botClient = options.botClient;
        this.eventBus = options.eventBus;
        this.config = options.config || {};
        this.pluginPath = options.pluginPath;
        
        this.isInitialized = false;
        this.stickerPackName = process.env.STICKER_NAME || 'MatDev';
        
        // Set data directory to root/data/sticker/
        this.dataDir = path.join(process.cwd(), 'data', 'sticker');
    }

    /**
     * Add metadata to sticker WebP buffer using exif data
     */
    async addStickerMetadata(buffer, packname, author) {
        try {
            // Try to use node-webpmux for adding metadata
            let webpmux;
            try {
                webpmux = require('node-webpmux');
            } catch (e) {
                console.log('📦 node-webpmux not available for metadata embedding');
                return buffer; // Return original buffer if webpmux not available
            }

            // Create EXIF data for sticker metadata
            const exifData = {
                'sticker-pack-id': `com.${packname.toLowerCase().replace(/[^a-z0-9]/g, '')}.stickerpack`,
                'sticker-pack-name': packname,
                'sticker-pack-publisher': author,
                'android-app-store-link': '',
                'ios-app-store-link': ''
            };

            // Convert exif data to buffer
            const exifBuffer = Buffer.from(JSON.stringify(exifData), 'utf8');

            // Add exif data to WebP
            const img = new webpmux.Image();
            await img.load(buffer);
            img.exif = exifBuffer;
            
            return await img.save(null);
            
        } catch (error) {
            console.error('❌ Error adding sticker metadata:', error);
            return buffer; // Return original buffer on error
        }
    }

    /**
     * Initialize the plugin
     */
    async initialize() {
        try {
            console.log(`🔧 Initializing ${this.config.displayName || 'Sticker'} plugin...`);
            
            // Check dependencies
            if (!sharp) {
                console.warn('⚠️ Sharp not available - install with: npm install sharp');
            }
            if (!ffmpeg) {
                console.warn('⚠️ FFmpeg not available - install with: npm install fluent-ffmpeg');
            }
            
            // Create data directory for storing temp files
            await fs.ensureDir(this.dataDir);
            
            // Clean up any old files (older than 5 minutes)
            await this.cleanupOldFiles();
            
            this.isInitialized = true;
            console.log(`✅ ${this.config.displayName || 'Sticker'} plugin initialized`);
            console.log(`📦 Sticker pack name: ${this.stickerPackName}`);
            
        } catch (error) {
            console.error(`❌ Failed to initialize ${this.config.displayName || 'Sticker'} plugin:`, error);
            throw error;
        }
    }

    /**
     * Get plugin information
     */
    getInfo() {
        return {
            name: this.name,
            version: this.config.version,
            description: this.config.description,
            commands: this.getCommands(),
            isInitialized: this.isInitialized
        };
    }

    /**
     * Get available commands
     */
    getCommands() {
        return this.config.commands || [];
    }

    /**
     * Main command execution handler
     */
    async executeCommand(commandName, context) {
        if (!this.isInitialized) {
            throw new Error(`${this.config.displayName || 'Sticker'} plugin not initialized`);
        }

        const { message, args, reply } = context;

        switch (commandName.toLowerCase()) {
            case 'sticker':
            case 's':
                return await this.handleStickerCommand(context);
            
            default:
                throw new Error(`Unknown command: ${commandName}`);
        }
    }

    /**
     * Handle sticker conversion command - uses stored media from MediaVault
     */
    async handleStickerCommand(context) {
        try {
            const { message, reply } = context;
            
            let targetMessageId = null;
            let sourceMedia = null;
            
            // Debug: Log full message structure
            console.log(`🔍 Sticker command debug - Message keys:`, Object.keys(message)); 
            console.log(`🔍 Message key exists:`, !!message.key);
            console.log(`🔍 Message id:`, message.key?.id || 'No key.id');
            console.log(`🔍 Message type:`, message.message ? Object.keys(message.message)[0] : 'No message type');
            
            // Check for media in Baileys format
            const hasImageMessage = message.message?.imageMessage;
            const hasVideoMessage = message.message?.videoMessage;
            const hasDocumentMessage = message.message?.documentMessage;
            const hasAudioMessage = message.message?.audioMessage;
            const hasExtendedTextMessage = message.message?.extendedTextMessage;
            
            const hasMedia = hasImageMessage || hasVideoMessage || hasDocumentMessage || hasAudioMessage;
            
            console.log(`🔍 Baileys media check - Image: ${!!hasImageMessage}, Video: ${!!hasVideoMessage}, Document: ${!!hasDocumentMessage}, Audio: ${!!hasAudioMessage}`);
            console.log(`🔍 Extended text message:`, !!hasExtendedTextMessage);
            
            // Check if message has media directly (image with caption .sticker/.s)
            if (hasMedia) {
                targetMessageId = message.key?.id;
                console.log(`🎯 Found direct media message ID: ${targetMessageId}`);
            }
            // Check if it's a quoted message with media (reply to image/video)
            else if (hasExtendedTextMessage?.contextInfo?.quotedMessage) {
                const quotedMessage = hasExtendedTextMessage.contextInfo.quotedMessage;
                const quotedHasMedia = quotedMessage.imageMessage || quotedMessage.videoMessage || quotedMessage.documentMessage || quotedMessage.audioMessage;
                
                if (quotedHasMedia) {
                    // Use the quoted message's ID if available, otherwise construct it
                    targetMessageId = hasExtendedTextMessage.contextInfo.stanzaId || message.key?.id;
                    console.log(`🎯 Found quoted media message ID: ${targetMessageId}`);
                }
            }
            
            // If no media found, show usage
            if (!targetMessageId) {
                console.log(`❌ No target message ID found - hasMedia: ${hasMedia}, hasQuoted: ${!!hasExtendedTextMessage?.contextInfo?.quotedMessage}`);
                await reply('❌ Please reply to an image/video/GIF to convert it to a sticker!\n\n📝 Usage: Reply to media with `.sticker` or `.s`');
                return;
            }

            // Send initial processing message
            // await reply('🔄 Processing... Looking up stored media...');

            // Look up stored media from MediaVault
            sourceMedia = await this.findStoredMedia(targetMessageId);
            
            if (!sourceMedia) {
                await reply('❌ Could not find stored media for this message. The media may not have been archived yet.');
                return;
            }

            // Check if it's supported media (image or video)
            if (!sourceMedia.mimetype || (!sourceMedia.mimetype.startsWith('image/') && !sourceMedia.mimetype.startsWith('video/'))) {
                await reply('❌ Please provide an image or video file for sticker conversion.');
                return;
            }

            console.log(`🔍 Found stored media: ${sourceMedia.filePath}`);

            // Verify the stored file exists
            if (!await fs.pathExists(sourceMedia.filePath)) {
                await reply('❌ The stored media file is missing. Please try uploading the media again.');
                return;
            }

            const timestamp = Date.now();
            
            // Convert media to sticker based on type
            let stickerPath;
            if (sourceMedia.mimetype.startsWith('image/')) {
                if (!sharp) {
                    await reply('❌ Image processing requires sharp package. Please install it.');
                    return;
                }
                stickerPath = await this.convertImageToSticker(sourceMedia.filePath, timestamp);
            } else if (sourceMedia.mimetype.startsWith('video/')) {
                if (!ffmpeg) {
                    await reply('❌ Video processing requires fluent-ffmpeg package. Please install it.');
                    return;
                }
                stickerPath = await this.convertVideoToSticker(sourceMedia.filePath, timestamp);
            }
            
            if (!stickerPath) {
                await reply('❌ Failed to convert media to sticker. Please try again.');
                return;
            }

            // Read sticker and send it using proper format
            const stickerBuffer = await fs.readFile(stickerPath);

            // Send sticker using direct Baileys sock connection with proper metadata
            try {
                // Try accessing the underlying Baileys socket directly
                const sock = this.botClient.sock || this.botClient.client || this.botClient.socket;
                
                if (sock && sock.sendMessage) {
                    // Send directly through Baileys socket with proper metadata format
                    const stickerMessage = {
                        sticker: stickerBuffer,
                        packname: this.stickerPackName,
                        author: this.stickerPackName,
                        categories: ['😀', '😂'],
                        type: 'default'
                    };
                    
                    await sock.sendMessage(message.key.remoteJid, stickerMessage);
                    console.log(`✅ Sticker sent successfully via direct Baileys socket with metadata`);
                } else {
                    console.log(`⚠️ Direct socket access failed, trying alternative formats`);
                    
                    // Alternative 1: Try adding metadata to WebP buffer using exif
                    try {
                        const stickerWithMetadata = await this.addStickerMetadata(stickerBuffer, this.stickerPackName, this.stickerPackName);
                        
                        await this.botClient.sendMessage(message.key.remoteJid, {
                            sticker: stickerWithMetadata,
                            packname: this.stickerPackName,
                            author: this.stickerPackName
                        });
                        console.log(`✅ Sticker sent with embedded metadata`);
                    } catch (metadataError) {
                        console.log(`⚠️ Metadata embedding failed:`, metadataError.message);
                        
                        // Alternative 2: Try basic format with explicit metadata fields
                        try {
                            await this.botClient.sendMessage(message.key.remoteJid, {
                                sticker: stickerBuffer,
                                packname: this.stickerPackName,
                                author: this.stickerPackName,
                                mimetype: 'image/webp',
                                ptt: false,
                                contextInfo: {
                                    externalAdReply: {
                                        title: this.stickerPackName,
                                        body: this.stickerPackName,
                                        sourceUrl: '',
                                        mediaUrl: '',
                                        mediaType: 1,
                                        showAdAttribution: false,
                                        renderLargerThumbnail: false,
                                        thumbnailUrl: ''
                                    }
                                }
                            });
                            console.log(`✅ Sticker sent with context metadata`);
                        } catch (contextError) {
                            console.log(`⚠️ Context metadata failed:`, contextError.message);
                            
                            // Final fallback: Send basic sticker and warn about metadata
                            await this.botClient.sendMessage(message.key.remoteJid, {
                                sticker: stickerBuffer
                            });
                            console.log(`✅ Sticker sent without metadata (basic format)`);
                            await reply('⚠️ Sticker sent but metadata (pack name) could not be applied. This is a known limitation with some WhatsApp configurations.');
                            return;
                        }
                    }
                }

            } catch (sendError) {
                console.error(`❌ All sticker sending methods failed:`, sendError);
                await reply('❌ Sticker created but failed to send. Your bot may need sticker support added to BotClient.');
                return;
            }

            // Schedule automatic deletion of the sticker file after 5 minutes
            setTimeout(async () => {
                try {
                    await this.cleanupFile(stickerPath);
                    console.log(`🗑️ Auto-deleted sticker file after 5 minutes`);
                } catch (deleteError) {
                    console.error('❌ Error auto-deleting sticker file:', deleteError);
                }
            }, 5 * 60 * 1000); // 5 minutes in milliseconds

            console.log(`✅ Sticker conversion completed for ${timestamp} - auto-delete scheduled in 5 minutes`);

        } catch (error) {
            console.error('❌ Error in sticker command:', error);
            await context.reply('❌ Failed to create sticker. Please try again with a different image/video.');
        }
    }

    /**
     * Find stored media by message ID using MediaVault (same as enhance plugin)
     */
    async findStoredMedia(messageId) {
        try {
            console.log(`🔍 Searching for stored media with message ID: ${messageId}`);
            
            // Access MediaVault from the bot client
            const mediaVault = this.botClient?.mediaVault;
            if (!mediaVault) {
                console.log(`❌ MediaVault not available`);
                return null;
            }
            
            console.log(`🔍 Searching through ${mediaVault.metadataCache.size} cached media items`);
            
            // Search through MediaVault metadata cache for matching message ID
            for (const [storedId, metadata] of mediaVault.metadataCache.entries()) {
                console.log(`🔍 Checking stored media: ${storedId}, messageId: ${metadata.messageId}`);
                
                // Direct match on original message ID
                if (metadata.messageId === messageId) {
                    console.log(`🎯 Found media by message ID: ${storedId}`);
                    // Return metadata with correct path structure for sticker plugin
                    return {
                        messageId: metadata.messageId,
                        filePath: metadata.path,
                        mimetype: metadata.mimetype,
                        size: metadata.size,
                        filename: metadata.filename,
                        originalName: metadata.originalName
                    };
                }
                
                // Also check if the message ID is part of the stored ID (first 10 chars)
                if (messageId.startsWith(metadata.messageId.substring(0, 10))) {
                    console.log(`🎯 Found media by partial message ID match: ${storedId}`);
                    return {
                        messageId: metadata.messageId,
                        filePath: metadata.path,
                        mimetype: metadata.mimetype,
                        size: metadata.size,
                        filename: metadata.filename,
                        originalName: metadata.originalName
                    };
                }
            }
            
            console.log(`❌ No stored media found for message ID: ${messageId}`);
            return null;
            
        } catch (error) {
            console.error('❌ Error finding stored media:', error);
            return null;
        }
    }

    /**
     * Convert image to sticker format using Sharp
     */
    async convertImageToSticker(inputPath, timestamp) {
        try {
            console.log(`🎨 Converting image to sticker: ${inputPath}`);
            
            const inputBuffer = await fs.readFile(inputPath);
            const outputPath = path.join(this.dataDir, `sticker_${timestamp}.webp`);
            
            // Convert image to WebP sticker format (512x512)
            const stickerBuffer = await sharp(inputBuffer)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .webp({
                    quality: 90,
                    alphaQuality: 90
                })
                .toBuffer();

            await fs.writeFile(outputPath, stickerBuffer);
            console.log(`✅ Image converted to sticker: ${outputPath}`);
            return outputPath;

        } catch (error) {
            console.error('❌ Error converting image to sticker:', error);
            return null;
        }
    }

    /**
     * Convert video to animated sticker format using FFmpeg
     */
    async convertVideoToSticker(inputPath, timestamp) {
        return new Promise(async (resolve, reject) => {
            try {
                console.log(`🎬 Converting video to animated sticker: ${inputPath}`);
                
                const outputPath = path.join(this.dataDir, `sticker_${timestamp}.webp`);
                
                // Convert video to animated WebP sticker
                ffmpeg(inputPath)
                    .outputOptions([
                        '-vcodec libwebp',
                        '-vf scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
                        '-loop 0',
                        '-preset default',
                        '-an',
                        '-vsync 0',
                        '-s 512:512'
                    ])
                    .duration(10) // Limit to 10 seconds for stickers
                    .toFormat('webp')
                    .on('end', () => {
                        console.log(`✅ Video converted to animated sticker: ${outputPath}`);
                        resolve(outputPath);
                    })
                    .on('error', (error) => {
                        console.error('❌ FFmpeg error:', error);
                        resolve(null);
                    })
                    .save(outputPath);
                    
            } catch (error) {
                console.error('❌ Error converting video to sticker:', error);
                resolve(null);
            }
        });
    }

    /**
     * Clean up old files (older than 5 minutes)
     */
    async cleanupOldFiles() {
        try {
            if (!await fs.pathExists(this.dataDir)) {
                return;
            }

            const files = await fs.readdir(this.dataDir);
            const now = Date.now();
            const fiveMinutesAgo = now - (5 * 60 * 1000); // 5 minutes in milliseconds
            
            for (const file of files) {
                const filePath = path.join(this.dataDir, file);
                const stats = await fs.stat(filePath);
                
                // Delete files older than 5 minutes
                if (stats.mtime.getTime() < fiveMinutesAgo) {
                    await fs.unlink(filePath);
                    console.log(`🧹 Cleaned up old file: ${file}`);
                }
            }
        } catch (error) {
            console.error('❌ Error cleaning old files:', error);
        }
    }

    /**
     * Clean up a specific file
     */
    async cleanupFile(filePath) {
        try {
            if (await fs.pathExists(filePath)) {
                await fs.unlink(filePath);
                console.log(`🧹 Cleaned up: ${path.basename(filePath)}`);
            }
        } catch (error) {
            console.error(`❌ Error cleaning file ${filePath}:`, error);
        }
    }

    /**
     * Cleanup when plugin is unloaded
     */
    async shutdown() {
        try {
            console.log(`🔄 Shutting down ${this.config.displayName || 'Sticker'} plugin...`);
            
            // Clean up any remaining old files
            await this.cleanupOldFiles();
            
            this.isInitialized = false;
            console.log(`✅ ${this.config.displayName || 'Sticker'} plugin shutdown complete`);
            
        } catch (error) {
            console.error(`❌ Error during ${this.config.displayName || 'Sticker'} plugin shutdown:`, error);
        }
    }
}

module.exports = StickerPlugin;  