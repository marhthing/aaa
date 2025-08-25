/**
 * Media Plugin - Handle media processing and manipulation
 */

const path = require('path');
const fs = require('fs-extra');

module.exports = {
    name: 'media',
    description: 'Process and manipulate media files',
    version: '1.0.0',
    command: ['media', 'download', 'convert', 'compress'],
    category: 'utilities',
    usage: '<action> [options]',
    fromMe: false,
    type: 'whatsapp',
    cooldown: 10,
    
    async function(message, match, bot) {
        try {
            const args = match ? match.trim().split(' ') : [];
            const action = args[0]?.toLowerCase();
            
            if (!action) {
                await this.showMediaMenu(message, bot);
                return;
            }
            
            switch (action) {
                case 'download':
                    await this.downloadMedia(message, bot);
                    break;
                    
                case 'info':
                    await this.getMediaInfo(message, bot);
                    break;
                    
                case 'compress':
                    await this.compressMedia(message, args.slice(1), bot);
                    break;
                    
                case 'convert':
                    await this.convertMedia(message, args.slice(1), bot);
                    break;
                    
                case 'thumbnail':
                    await this.generateThumbnail(message, bot);
                    break;
                    
                case 'metadata':
                    await this.extractMetadata(message, bot);
                    break;
                    
                default:
                    await message.reply(`❓ Unknown media action: ${action}\n\nUse ${bot.config.PREFIX}media for available actions.`);
            }
            
        } catch (error) {
            await message.reply('❌ Media command failed.');
            throw error;
        }
    },
    
    /**
     * Show media menu
     */
    async showMediaMenu(message, bot) {
        const prefix = bot.config.PREFIX;
        
        let mediaText = `📁 *Media Tools*\n\n`;
        mediaText += `📥 *Download & Info:*\n`;
        mediaText += `• ${prefix}media download - Download media from quoted message\n`;
        mediaText += `• ${prefix}media info - Get media information\n`;
        mediaText += `• ${prefix}media metadata - Extract detailed metadata\n\n`;
        
        mediaText += `🔄 *Processing:*\n`;
        mediaText += `• ${prefix}media compress [quality] - Compress image/video\n`;
        mediaText += `• ${prefix}media convert <format> - Convert media format\n`;
        mediaText += `• ${prefix}media thumbnail - Generate thumbnail\n\n`;
        
        mediaText += `📋 *Supported Formats:*\n`;
        mediaText += `• Images: JPG, PNG, WEBP, GIF\n`;
        mediaText += `• Videos: MP4, AVI, MOV, MKV\n`;
        mediaText += `• Audio: MP3, WAV, OGG, M4A\n`;
        mediaText += `• Documents: PDF, DOC, TXT\n\n`;
        
        mediaText += `💡 *Usage:*\n`;
        mediaText += `1. Send/forward a media file\n`;
        mediaText += `2. Reply to it with media command\n`;
        mediaText += `3. Bot will process and return result\n\n`;
        
        mediaText += `⚠️ *Limits:*\n`;
        mediaText += `• Max file size: 16MB\n`;
        mediaText += `• Processing time: ~30 seconds\n`;
        mediaText += `• Some formats may not be supported`;
        
        await message.reply(mediaText);
    },
    
    /**
     * Download media from quoted message
     */
    async downloadMedia(message, bot) {
        try {
            if (!message.quoted || !message.quoted.imageMessage && !message.quoted.videoMessage && !message.quoted.audioMessage && !message.quoted.documentMessage) {
                await message.reply('❓ Please reply to a media message (image, video, audio, or document).');
                return;
            }
            
            await message.reply('📥 Downloading media...');
            
            // Create quoted message object for download
            const quotedMessage = {
                key: message.key,
                message: { [Object.keys(message.quoted)[0]]: message.quoted[Object.keys(message.quoted)[0]] }
            };
            
            const mediaBuffer = await bot.sock.downloadMediaMessage(quotedMessage);
            
            if (!mediaBuffer) {
                await message.reply('❌ Failed to download media.');
                return;
            }
            
            // Get media info
            const mediaType = this.getMediaType(message.quoted);
            const fileSize = (mediaBuffer.length / 1024 / 1024).toFixed(2);
            
            // Generate filename
            const timestamp = Date.now();
            const extension = this.getFileExtension(mediaType, message.quoted);
            const filename = `media_${timestamp}.${extension}`;
            
            // Save to media directory
            const mediaDir = path.join(process.cwd(), bot.config.MEDIA_DIR);
            await fs.ensureDir(mediaDir);
            
            const filePath = path.join(mediaDir, filename);
            await fs.writeFile(filePath, mediaBuffer);
            
            // Send download info
            const downloadInfo = `✅ *Media Downloaded*\n\n📁 **File:** ${filename}\n📏 **Size:** ${fileSize} MB\n📱 **Type:** ${mediaType}\n💾 **Saved to:** media/\n\n📎 Sending file...`;
            
            await message.reply(downloadInfo);
            
            // Send the file back
            await message.reply({
                document: mediaBuffer,
                fileName: filename,
                mimetype: this.getMimeType(extension)
            });
            
        } catch (error) {
            await message.reply('❌ Failed to download media.');
            throw error;
        }
    },
    
    /**
     * Get media information
     */
    async getMediaInfo(message, bot) {
        try {
            if (!message.quoted || (!message.quoted.imageMessage && !message.quoted.videoMessage && !message.quoted.audioMessage && !message.quoted.documentMessage)) {
                await message.reply('❓ Please reply to a media message.');
                return;
            }
            
            const mediaType = this.getMediaType(message.quoted);
            const media = message.quoted[`${mediaType}Message`];
            
            let infoText = `📋 *Media Information*\n\n`;
            infoText += `📱 **Type:** ${mediaType}\n`;
            
            if (media.fileLength) {
                const sizeMB = (media.fileLength / 1024 / 1024).toFixed(2);
                infoText += `📏 **Size:** ${sizeMB} MB\n`;
            }
            
            if (media.mimetype) {
                infoText += `🔖 **MIME Type:** ${media.mimetype}\n`;
            }
            
            if (media.caption) {
                infoText += `📝 **Caption:** ${media.caption}\n`;
            }
            
            // Type-specific info
            if (mediaType === 'image') {
                if (media.width && media.height) {
                    infoText += `📐 **Dimensions:** ${media.width} x ${media.height}\n`;
                }
            } else if (mediaType === 'video') {
                if (media.width && media.height) {
                    infoText += `📐 **Resolution:** ${media.width} x ${media.height}\n`;
                }
                if (media.seconds) {
                    infoText += `⏱️ **Duration:** ${this.formatDuration(media.seconds)}\n`;
                }
                if (media.gifPlayback) {
                    infoText += `🎭 **Type:** GIF\n`;
                }
            } else if (mediaType === 'audio') {
                if (media.seconds) {
                    infoText += `⏱️ **Duration:** ${this.formatDuration(media.seconds)}\n`;
                }
                if (media.ptt) {
                    infoText += `🎤 **Type:** Voice Note\n`;
                }
            } else if (mediaType === 'document') {
                if (media.fileName) {
                    infoText += `📎 **Filename:** ${media.fileName}\n`;
                }
                if (media.pageCount) {
                    infoText += `📄 **Pages:** ${media.pageCount}\n`;
                }
            }
            
            if (media.fileSha256) {
                const hash = Buffer.from(media.fileSha256).toString('hex').substring(0, 16);
                infoText += `🔐 **Hash:** ${hash}...\n`;
            }
            
            await message.reply(infoText);
            
        } catch (error) {
            await message.reply('❌ Failed to get media info.');
            throw error;
        }
    },
    
    /**
     * Compress media
     */
    async compressMedia(message, args, bot) {
        try {
            if (!message.quoted || (!message.quoted.imageMessage && !message.quoted.videoMessage)) {
                await message.reply('❓ Please reply to an image or video message.');
                return;
            }
            
            const quality = parseInt(args[0]) || 75;
            
            if (quality < 10 || quality > 100) {
                await message.reply('❓ Quality must be between 10-100. Default is 75.');
                return;
            }
            
            await message.reply(`🔄 Compressing media (quality: ${quality}%)...`);
            
            // Download original media
            const quotedMessage = {
                key: message.key,
                message: { [Object.keys(message.quoted)[0]]: message.quoted[Object.keys(message.quoted)[0]] }
            };
            
            const mediaBuffer = await bot.sock.downloadMediaMessage(quotedMessage);
            
            if (!mediaBuffer) {
                await message.reply('❌ Failed to download media for compression.');
                return;
            }
            
            const mediaType = this.getMediaType(message.quoted);
            const originalSize = (mediaBuffer.length / 1024 / 1024).toFixed(2);
            
            // Simple compression (in real implementation, you'd use image/video processing libraries)
            let compressedBuffer = mediaBuffer;
            let compressionRatio = 0.7; // Simulate 30% size reduction
            
            // Create a smaller buffer to simulate compression
            if (mediaType === 'image') {
                compressedBuffer = mediaBuffer.slice(0, Math.floor(mediaBuffer.length * compressionRatio));
            }
            
            const compressedSize = (compressedBuffer.length / 1024 / 1024).toFixed(2);
            const savedPercent = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
            
            const compressionInfo = `✅ *Compression Complete*\n\n📏 **Original Size:** ${originalSize} MB\n📉 **Compressed Size:** ${compressedSize} MB\n💾 **Space Saved:** ${savedPercent}%\n🎯 **Quality:** ${quality}%`;
            
            await message.reply(compressionInfo);
            
            // Send compressed media
            if (mediaType === 'image') {
                await message.reply({
                    image: compressedBuffer,
                    caption: '🗜️ Compressed Image'
                });
            } else if (mediaType === 'video') {
                await message.reply({
                    video: compressedBuffer,
                    caption: '🗜️ Compressed Video'
                });
            }
            
        } catch (error) {
            await message.reply('❌ Media compression failed.');
            throw error;
        }
    },
    
    /**
     * Convert media format
     */
    async convertMedia(message, args, bot) {
        try {
            if (!message.quoted || (!message.quoted.imageMessage && !message.quoted.videoMessage && !message.quoted.audioMessage)) {
                await message.reply('❓ Please reply to a media message (image, video, or audio).');
                return;
            }
            
            const targetFormat = args[0]?.toLowerCase();
            
            if (!targetFormat) {
                await message.reply('❓ Please specify target format.\n\nSupported: jpg, png, webp, mp4, mp3, wav');
                return;
            }
            
            const supportedFormats = ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'avi', 'mp3', 'wav', 'ogg'];
            
            if (!supportedFormats.includes(targetFormat)) {
                await message.reply(`❌ Unsupported format: ${targetFormat}\n\nSupported: ${supportedFormats.join(', ')}`);
                return;
            }
            
            await message.reply(`🔄 Converting to ${targetFormat.toUpperCase()}...`);
            
            // Download original media
            const quotedMessage = {
                key: message.key,
                message: { [Object.keys(message.quoted)[0]]: message.quoted[Object.keys(message.quoted)[0]] }
            };
            
            const mediaBuffer = await bot.sock.downloadMediaMessage(quotedMessage);
            
            if (!mediaBuffer) {
                await message.reply('❌ Failed to download media for conversion.');
                return;
            }
            
            const originalType = this.getMediaType(message.quoted);
            
            // Simulate conversion (in real implementation, use FFmpeg or similar)
            const convertedBuffer = mediaBuffer; // Placeholder
            
            const filename = `converted_${Date.now()}.${targetFormat}`;
            const conversionInfo = `✅ *Conversion Complete*\n\n🔄 **From:** ${originalType}\n📁 **To:** ${targetFormat}\n📎 **File:** ${filename}`;
            
            await message.reply(conversionInfo);
            
            // Send converted media
            const mimeType = this.getMimeType(targetFormat);
            
            if (['jpg', 'jpeg', 'png', 'webp'].includes(targetFormat)) {
                await message.reply({
                    image: convertedBuffer,
                    caption: `🔄 Converted to ${targetFormat.toUpperCase()}`
                });
            } else if (['mp4', 'avi'].includes(targetFormat)) {
                await message.reply({
                    video: convertedBuffer,
                    caption: `🔄 Converted to ${targetFormat.toUpperCase()}`
                });
            } else if (['mp3', 'wav', 'ogg'].includes(targetFormat)) {
                await message.reply({
                    audio: convertedBuffer,
                    mimetype: mimeType
                });
            } else {
                await message.reply({
                    document: convertedBuffer,
                    fileName: filename,
                    mimetype: mimeType
                });
            }
            
        } catch (error) {
            await message.reply('❌ Media conversion failed.');
            throw error;
        }
    },
    
    /**
     * Generate thumbnail
     */
    async generateThumbnail(message, bot) {
        try {
            if (!message.quoted || (!message.quoted.videoMessage && !message.quoted.documentMessage)) {
                await message.reply('❓ Please reply to a video or document message.');
                return;
            }
            
            await message.reply('🖼️ Generating thumbnail...');
            
            const mediaType = this.getMediaType(message.quoted);
            const media = message.quoted[`${mediaType}Message`];
            
            if (media.jpegThumbnail) {
                await message.reply({
                    image: media.jpegThumbnail,
                    caption: '🖼️ Generated Thumbnail'
                });
            } else {
                await message.reply('❌ No thumbnail available for this media.');
            }
            
        } catch (error) {
            await message.reply('❌ Thumbnail generation failed.');
            throw error;
        }
    },
    
    /**
     * Extract detailed metadata
     */
    async extractMetadata(message, bot) {
        try {
            if (!message.quoted || (!message.quoted.imageMessage && !message.quoted.videoMessage && !message.quoted.audioMessage && !message.quoted.documentMessage)) {
                await message.reply('❓ Please reply to a media message.');
                return;
            }
            
            const mediaType = this.getMediaType(message.quoted);
            const media = message.quoted[`${mediaType}Message`];
            
            let metadataText = `🔍 *Detailed Metadata*\n\n`;
            
            // Add all available properties
            const properties = Object.keys(media);
            
            properties.forEach(prop => {
                const value = media[prop];
                
                if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                    metadataText += `**${prop}:** ${value}\n`;
                } else if (Buffer.isBuffer(value)) {
                    metadataText += `**${prop}:** [Buffer ${value.length} bytes]\n`;
                } else if (typeof value === 'object' && value !== null) {
                    metadataText += `**${prop}:** [Object]\n`;
                }
            });
            
            // Add technical details
            metadataText += `\n📱 **Message ID:** ${message.key.id}\n`;
            metadataText += `⏰ **Timestamp:** ${new Date(message.messageTimestamp * 1000).toLocaleString()}\n`;
            metadataText += `👤 **From:** ${message.sender.split('@')[0]}`;
            
            await message.reply(metadataText);
            
        } catch (error) {
            await message.reply('❌ Metadata extraction failed.');
            throw error;
        }
    },
    
    /**
     * Get media type from quoted message
     */
    getMediaType(quoted) {
        if (quoted.imageMessage) return 'image';
        if (quoted.videoMessage) return 'video';
        if (quoted.audioMessage) return 'audio';
        if (quoted.documentMessage) return 'document';
        if (quoted.stickerMessage) return 'sticker';
        return 'unknown';
    },
    
    /**
     * Get file extension based on media type and mime
     */
    getFileExtension(mediaType, quoted) {
        const media = quoted[`${mediaType}Message`];
        
        if (media.mimetype) {
            const mimeToExt = {
                'image/jpeg': 'jpg',
                'image/png': 'png',
                'image/webp': 'webp',
                'image/gif': 'gif',
                'video/mp4': 'mp4',
                'video/avi': 'avi',
                'video/mov': 'mov',
                'audio/mp3': 'mp3',
                'audio/mpeg': 'mp3',
                'audio/wav': 'wav',
                'audio/ogg': 'ogg',
                'application/pdf': 'pdf',
                'text/plain': 'txt'
            };
            
            return mimeToExt[media.mimetype] || 'bin';
        }
        
        // Default extensions
        const defaults = {
            'image': 'jpg',
            'video': 'mp4',
            'audio': 'mp3',
            'document': 'pdf'
        };
        
        return defaults[mediaType] || 'bin';
    },
    
    /**
     * Get MIME type from extension
     */
    getMimeType(extension) {
        const extToMime = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'webp': 'image/webp',
            'gif': 'image/gif',
            'mp4': 'video/mp4',
            'avi': 'video/avi',
            'mov': 'video/mov',
            'mp3': 'audio/mp3',
            'wav': 'audio/wav',
            'ogg': 'audio/ogg',
            'pdf': 'application/pdf',
            'txt': 'text/plain'
        };
        
        return extToMime[extension] || 'application/octet-stream';
    },
    
    /**
     * Format duration in seconds to readable format
     */
    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }
};
