const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const mime = require('mime-types');

class MediaVault {
    constructor() {
        this.mediaPath = path.join(process.cwd(), 'data', 'media');
        this.metadataCache = new Map();
        this.isInitialized = false;
        
        // Get max file size from config or environment
        const configSize = require('../../config/default.json').media?.maxFileSize;
        const envSize = process.env.MAX_MEDIA_SIZE;
        
        if (configSize && typeof configSize === 'number') {
            this.maxFileSize = configSize;
        } else if (envSize) {
            this.maxFileSize = this.parseSize(envSize);
        } else {
            this.maxFileSize = this.parseSize('50MB');
        }
    }

    async initialize() {
        try {
            console.log('🔧 Initializing media vault...');

            // Ensure main media directory exists
            await fs.ensureDir(this.mediaPath);
            
            // Create category-based media directories
            const categories = ['images', 'videos', 'audio', 'documents', 'stickers', 'view-once'];
            const messageTypes = ['individual', 'groups', 'status', 'newsletter', 'broadcast', 'channels'];
            
            // Create all category directories
            for (const category of categories) {
                await fs.ensureDir(path.join(this.mediaPath, category));
                
                // Create organized subdirectories for each category by message type
                for (const messageType of messageTypes) {
                    await fs.ensureDir(path.join(this.mediaPath, category, messageType));
                }
            }

            // Load metadata cache
            await this.loadMetadataCache();

            // Start cleanup scheduler (daily cleanup)
            this.startCleanupScheduler();

            this.isInitialized = true;
            console.log('✅ Media vault initialized with organized storage structure');

        } catch (error) {
            console.error('❌ Failed to initialize media vault:', error);
            throw error;
        }
    }

    async loadMetadataCache() {
        const metadataPath = path.join(this.mediaPath, 'metadata.json');
        
        try {
            if (await fs.pathExists(metadataPath)) {
                const metadata = await fs.readJson(metadataPath);
                
                for (const [key, value] of Object.entries(metadata)) {
                    this.metadataCache.set(key, value);
                }
            }
        } catch (error) {
            console.error('⚠️ Failed to load media metadata, starting fresh:', error);
        }
    }

    async saveMetadataCache() {
        const metadataPath = path.join(this.mediaPath, 'metadata.json');
        
        try {
            const metadata = Object.fromEntries(this.metadataCache);
            await fs.writeJson(metadataPath, metadata, { spaces: 2 });
        } catch (error) {
            console.error('❌ Failed to save media metadata:', error);
        }
    }

    startCleanupScheduler() {
        // Run cleanup every 24 hours
        setInterval(async () => {
            await this.cleanupOldMedia();
        }, 24 * 60 * 60 * 1000);

        // Run initial cleanup after 10 minutes to allow full startup
        setTimeout(async () => {
            await this.cleanupOldMedia();
        }, 10 * 60 * 1000);
    }

    async cleanupOldMedia() {
        try {
            console.log('🧹 Starting media cleanup (3-day retention)...');
            
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
            
            const mediaTypes = ['images', 'videos', 'audio', 'documents', 'stickers', 'view-once'];
            let deletedCount = 0;
            
            for (const type of mediaTypes) {
                const typePath = path.join(this.mediaPath, type);
                
                if (await fs.pathExists(typePath)) {
                    const files = await fs.readdir(typePath);
                    
                    for (const file of files) {
                        const filePath = path.join(typePath, file);
                        const stats = await fs.stat(filePath);
                        
                        if (stats.mtime < threeDaysAgo) {
                            await fs.remove(filePath);
                            
                            // Remove from metadata cache
                            this.metadataCache.delete(file);
                            
                            deletedCount++;
                            console.log(`🗑️ Deleted old media: ${type}/${file}`);
                        }
                    }
                }
            }
            
            // Save updated metadata cache
            if (deletedCount > 0) {
                await this.saveMetadataCache();
                console.log(`✅ Media cleanup complete: removed ${deletedCount} old files`);
            } else {
                console.log('✅ Media cleanup complete: no old files to remove');
            }
            
        } catch (error) {
            console.error('❌ Error during media cleanup:', error);
        }
    }

    async storeMedia(mediaData, message) {
        if (!this.isInitialized) {
            throw new Error('Media vault not initialized');
        }

        try {
            // Check file size
            if (mediaData.data.length > this.maxFileSize) {
                throw new Error(`File too large: ${this.formatSize(mediaData.data.length)} > ${process.env.MAX_MEDIA_SIZE}`);
            }

            // Generate file hash for metadata (but don't use for deduplication to ensure unique files per message)
            const hash = crypto.createHash('sha256').update(mediaData.data).digest('hex');
            
            // Always create unique files - no deduplication for anti-delete functionality
            // This ensures each message gets its own copy for proper deletion recovery

            // Determine media type from message for better categorization
            let messageMediaType = null;
            if (message.message?.stickerMessage) messageMediaType = 'sticker';
            else if (message.message?.imageMessage) messageMediaType = 'image';
            else if (message.message?.videoMessage) messageMediaType = 'video';
            else if (message.message?.audioMessage) messageMediaType = 'audio';
            else if (message.message?.documentMessage) messageMediaType = 'document';

            // Determine file category and extension
            // Check if this is specifically a view-once media from the category override
            const mediaCategory = mediaData.category === 'view-once' ? 'view-once' : this.getMediaCategory(mediaData.mimetype, messageMediaType);
            const extension = this.getFileExtension(mediaData.mimetype, mediaData.filename);
            
            // Determine message category for organized storage
            const messageFrom = message.key?.remoteJid || '';
            let messageCategory = 'individual'; // default
            
            if (messageFrom.includes('@newsletter')) {
                messageCategory = 'newsletter';
            } else if (messageFrom.includes('@broadcast')) {
                messageCategory = 'broadcast';
            } else if (messageFrom.includes('@status') || messageFrom.includes('status@broadcast')) {
                messageCategory = 'status';
            } else if (messageFrom.includes('@g.us')) {
                messageCategory = 'groups';
            } else if (message.broadcast) {
                messageCategory = 'broadcast';
            }
            
            // Generate truly unique filename with nanouuid to prevent collisions during bulk operations
            const messageId = message.key?.id || 'unknown';
            const nanoTimestamp = Date.now() + Math.random().toString(36).substr(2, 9); // Add randomness to prevent collisions
            const uniquePrefix = `${messageId.substring(0, 10)}_${nanoTimestamp}`;
            const filename = `${uniquePrefix}_${hash.substring(0, 8)}.${extension}`;
            
            // Store in organized directory structure: media/[category]/[messageType]/filename
            const filePath = path.join(this.mediaPath, mediaCategory, messageCategory, filename);
            await fs.ensureDir(path.dirname(filePath)); // Ensure the directory exists

            // Save file
            await fs.writeFile(filePath, mediaData.data);

            // Create metadata with truly unique ID that ties directly to the message
            const uniqueId = `${messageId}_${nanoTimestamp}_${hash.substring(0, 8)}`;
            const fileMetadata = {
                id: uniqueId,
                filename: filename,
                originalName: mediaData.filename || `file.${extension}`,
                category: mediaCategory,
                messageCategory: messageCategory,
                mimetype: mediaData.mimetype,
                size: mediaData.data.length,
                hash: hash,
                path: filePath,
                relativePath: path.join(mediaCategory, messageCategory, filename),
                createdAt: new Date().toISOString(),
                messageId: message.key?.id,
                messages: [this.extractMessageInfo(message)]
            };

            // Store metadata with unique ID
            this.metadataCache.set(uniqueId, fileMetadata);
            await this.saveMetadataCache();

            console.log(`💾 Stored ${mediaCategory} file: ${filename} in ${messageCategory}/ (${this.formatSize(mediaData.data.length)})`);
            
            return fileMetadata;

        } catch (error) {
            console.error('❌ Failed to store media:', error);
            throw error;
        }
    }

    findExistingFile(hash) {
        return this.metadataCache.get(hash) || null;
    }

    async updateFileMetadata(fileId, message) {
        const fileMetadata = this.metadataCache.get(fileId);
        if (fileMetadata) {
            fileMetadata.messages.push(this.extractMessageInfo(message));
            await this.saveMetadataCache();
        }
    }

    extractMessageInfo(message) {
        return {
            messageId: message.key?.id || 'unknown',
            chatId: message.key?.remoteJid || 'unknown',
            author: message.key?.participant || message.key?.remoteJid || 'unknown',
            timestamp: message.messageTimestamp ? message.messageTimestamp * 1000 : Date.now(),
            caption: message.message?.imageMessage?.caption || 
                    message.message?.videoMessage?.caption || 
                    message.message?.documentMessage?.caption || null
        };
    }

    getMediaCategory(mimetype, messageType = null) {
        if (!mimetype) return 'documents';

        // Use message type to determine category more accurately
        if (messageType === 'sticker') {
            return 'stickers';
        }

        if (mimetype.startsWith('image/')) {
            // More specific sticker detection
            if (mimetype === 'image/webp' && messageType !== 'image') {
                return 'stickers';
            }
            return 'images';
        }
        if (mimetype.startsWith('video/')) return 'videos';
        if (mimetype.startsWith('audio/')) return 'audio';
        
        return 'documents';
    }

    getFileExtension(mimetype, filename) {
        // Try to get extension from filename first
        if (filename) {
            const extFromFilename = path.extname(filename).substring(1);
            if (extFromFilename) return extFromFilename;
        }

        // Get extension from mimetype
        const extFromMime = mime.extension(mimetype);
        return extFromMime || 'bin';
    }

    async getMediaFile(fileId) {
        const metadata = this.metadataCache.get(fileId);
        if (!metadata) {
            return null;
        }

        try {
            const data = await fs.readFile(metadata.path);
            return {
                data: data,
                metadata: metadata
            };
        } catch (error) {
            console.error(`❌ Failed to read media file ${fileId}:`, error);
            return null;
        }
    }

    // New method to get media by message ID - more reliable for anti-delete
    async getMediaByMessageId(messageId) {
        if (!messageId) return null;
        
        try {
            // Search through metadata cache for files with this message ID
            for (const [id, metadata] of this.metadataCache.entries()) {
                if (metadata.messageId === messageId) {
                    // Verify file still exists
                    if (await fs.pathExists(metadata.path)) {
                        const data = await fs.readFile(metadata.path);
                        return {
                            data: data,
                            metadata: metadata,
                            uniqueId: id
                        };
                    }
                }
            }
            
            console.warn(`⚠️ No media found for message ID: ${messageId}`);
            return null;
            
        } catch (error) {
            console.error(`❌ Error getting media for message ${messageId}:`, error);
            return null;
        }
    }

    async deleteMediaFile(fileId) {
        const metadata = this.metadataCache.get(fileId);
        if (!metadata) {
            return false;
        }

        try {
            await fs.unlink(metadata.path);
            this.metadataCache.delete(fileId);
            await this.saveMetadataCache();
            
            console.log(`🗑️ Deleted media file: ${metadata.filename}`);
            return true;

        } catch (error) {
            console.error(`❌ Failed to delete media file ${fileId}:`, error);
            return false;
        }
    }

    searchMedia(criteria) {
        const {
            category,
            mimetype,
            chatId,
            author,
            dateFrom,
            dateTo,
            minSize,
            maxSize,
            limit = 50
        } = criteria || {};

        const results = [];
        const startTime = dateFrom ? new Date(dateFrom).getTime() : 0;
        const endTime = dateTo ? new Date(dateTo).getTime() : Date.now();

        for (const metadata of this.metadataCache.values()) {
            // Apply filters
            if (category && metadata.category !== category) continue;
            if (mimetype && metadata.mimetype !== mimetype) continue;
            if (minSize && metadata.size < minSize) continue;
            if (maxSize && metadata.size > maxSize) continue;

            // Check message-specific criteria
            const hasMatchingMessage = metadata.messages.some(msg => {
                if (chatId && msg.chatId !== chatId) return false;
                if (author && msg.author !== author) return false;
                if (msg.timestamp < startTime || msg.timestamp > endTime) return false;
                return true;
            });

            if ((chatId || author || dateFrom || dateTo) && !hasMatchingMessage) {
                continue;
            }

            results.push(metadata);

            if (results.length >= limit) {
                break;
            }
        }

        return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    async getVaultStats() {
        const stats = {
            totalFiles: this.metadataCache.size,
            totalSize: 0,
            byCategory: {},
            byMimetype: {},
            oldestFile: null,
            newestFile: null
        };

        for (const metadata of this.metadataCache.values()) {
            stats.totalSize += metadata.size;
            
            // Count by category
            stats.byCategory[metadata.category] = 
                (stats.byCategory[metadata.category] || 0) + 1;

            // Count by mimetype
            stats.byMimetype[metadata.mimetype] = 
                (stats.byMimetype[metadata.mimetype] || 0) + 1;

            // Track oldest/newest
            const createdAt = new Date(metadata.createdAt);
            if (!stats.oldestFile || createdAt < new Date(stats.oldestFile)) {
                stats.oldestFile = metadata.createdAt;
            }
            if (!stats.newestFile || createdAt > new Date(stats.newestFile)) {
                stats.newestFile = metadata.createdAt;
            }
        }

        return stats;
    }

    async cleanupOrphanedFiles() {
        console.log('🧹 Cleaning up orphaned media files...');
        
        const categories = ['images', 'videos', 'audio', 'documents', 'stickers'];
        let cleanedCount = 0;

        for (const category of categories) {
            const categoryPath = path.join(this.mediaPath, category);
            
            if (await fs.pathExists(categoryPath)) {
                const files = await fs.readdir(categoryPath);
                
                for (const filename of files) {
                    const filePath = path.join(categoryPath, filename);
                    
                    // Check if file is in metadata cache
                    const isTracked = Array.from(this.metadataCache.values())
                        .some(metadata => metadata.filename === filename);

                    if (!isTracked) {
                        await fs.unlink(filePath);
                        cleanedCount++;
                        console.log(`🗑️ Removed orphaned file: ${filename}`);
                    }
                }
            }
        }

        console.log(`✅ Cleaned up ${cleanedCount} orphaned files`);
        return cleanedCount;
    }

    parseSize(sizeStr) {
        // Handle numeric values (already in bytes)
        if (typeof sizeStr === 'number') {
            return sizeStr;
        }
        
        // Handle string representations
        if (typeof sizeStr === 'string') {
            // Check if it's a plain number string
            const numericValue = parseInt(sizeStr);
            if (!isNaN(numericValue) && sizeStr === numericValue.toString()) {
                return numericValue;
            }
            
            // Parse formatted size strings like "50MB"
            const units = { B: 1, KB: 1024, MB: 1024**2, GB: 1024**3 };
            const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)$/i);
            
            if (!match) {
                throw new Error(`Invalid size format: ${sizeStr}`);
            }

            const value = parseFloat(match[1]);
            const unit = match[2].toUpperCase();
            
            return value * units[unit];
        }
        
        throw new Error(`Invalid size format: ${sizeStr}`);
    }

    formatSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }

    getMetadataByPath(relativePath) {
        for (const metadata of this.metadataCache.values()) {
            if (metadata.relativePath === relativePath) {
                return metadata;
            }
        }
        return null;
    }

    async exportMetadata(outputPath) {
        const exportData = {
            exportedAt: new Date().toISOString(),
            totalFiles: this.metadataCache.size,
            files: Array.from(this.metadataCache.values())
        };

        await fs.writeJson(outputPath, exportData, { spaces: 2 });
        console.log(`📤 Exported media metadata to: ${outputPath}`);
    }
}

module.exports = MediaVault;
