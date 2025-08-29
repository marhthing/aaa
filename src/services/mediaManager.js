/**
 * Media Manager Service
 * Handles media download, storage, and processing
 */

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { MESSAGE_TYPES, PATTERNS, PATHS, TIME } = require('../utils/constants');
const storageService = require('./storage');

class MediaManager extends EventEmitter {
    constructor() {
        super();
        this.mediaDir = path.join(PATHS.DATA_DIR, 'media');
        this.tempDir = path.join(PATHS.TEMP_DIR);
        this.downloadQueue = new Map(); // messageId -> downloadData
        this.processingQueue = new Map(); // mediaId -> processingData
        this.mediaCache = new Map(); // mediaId -> metadata
        this.downloadLimits = {
            maxFileSize: 50 * 1024 * 1024, // 50MB
            maxDownloadsPerHour: 100,
            allowedTypes: new Set([
                MESSAGE_TYPES.IMAGE,
                MESSAGE_TYPES.VIDEO,
                MESSAGE_TYPES.AUDIO,
                MESSAGE_TYPES.DOCUMENT,
                MESSAGE_TYPES.STICKER,
                MESSAGE_TYPES.VOICE
            ])
        };
        this.isInitialized = false;
    }

    async initialize() {
        try {
            await this.setupDirectories();
            await this.loadMediaIndex();
            this.setupCleanupTimer();
            this.isInitialized = true;
            console.log('✅ Media Manager initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Media Manager:', error);
            throw error;
        }
    }

    /**
     * Setup media directories
     */
    async setupDirectories() {
        const dirs = [
            this.mediaDir,
            this.tempDir,
            path.join(this.mediaDir, 'images'),
            path.join(this.mediaDir, 'videos'),
            path.join(this.mediaDir, 'audio'),
            path.join(this.mediaDir, 'documents'),
            path.join(this.mediaDir, 'stickers'),
            path.join(this.mediaDir, 'voice'),
            path.join(this.mediaDir, 'thumbnails')
        ];

        for (const dir of dirs) {
            await fs.ensureDir(dir);
        }
    }

    /**
     * Load media index from storage
     */
    async loadMediaIndex() {
        try {
            const index = await storageService.load('media', 'index');
            if (index && index.files) {
                for (const [mediaId, metadata] of Object.entries(index.files)) {
                    this.mediaCache.set(mediaId, metadata);
                }
                console.log(`📁 Loaded ${this.mediaCache.size} media files from index`);
            }
        } catch (error) {
            console.error('Error loading media index:', error);
        }
    }

    /**
     * Save media index to storage
     */
    async saveMediaIndex() {
        try {
            const index = {
                files: Object.fromEntries(this.mediaCache.entries()),
                lastUpdated: new Date().toISOString(),
                totalFiles: this.mediaCache.size
            };
            await storageService.save('media', 'index', index);
        } catch (error) {
            console.error('Error saving media index:', error);
        }
    }

    /**
     * Download media from message
     */
    async downloadMedia(message, options = {}) {
        try {
            if (!message || !message.hasMedia) {
                return { success: false, reason: 'No media in message' };
            }

            const messageId = message.id._serialized || message.id;

            // Check if already downloading
            if (this.downloadQueue.has(messageId)) {
                return { success: false, reason: 'Already downloading' };
            }

            // Check file type
            if (!this.downloadLimits.allowedTypes.has(message.type)) {
                return { success: false, reason: 'File type not allowed' };
            }

            // Check download limits
            if (!this.checkDownloadLimits()) {
                return { success: false, reason: 'Download limit reached' };
            }

            // Get media data
            const media = await message.downloadMedia();
            if (!media) {
                return { success: false, reason: 'Failed to download media' };
            }

            // Check file size
            if (media.data.length > this.downloadLimits.maxFileSize) {
                return { success: false, reason: 'File too large' };
            }

            // Generate media ID
            const mediaId = this.generateMediaId(media, message);

            // Check if already exists
            if (this.mediaCache.has(mediaId)) {
                const existing = this.mediaCache.get(mediaId);
                return { 
                    success: true, 
                    mediaId, 
                    filePath: existing.filePath,
                    cached: true 
                };
            }

            // Add to download queue
            const downloadData = {
                messageId,
                mediaId,
                startTime: Date.now(),
                status: 'downloading'
            };
            this.downloadQueue.set(messageId, downloadData);

            // Save media file
            const result = await this.saveMediaFile(media, message, mediaId, options);

            // Remove from queue
            this.downloadQueue.delete(messageId);

            if (result.success) {
                this.emit('media_downloaded', {
                    messageId,
                    mediaId,
                    filePath: result.filePath,
                    metadata: result.metadata
                });
            }

            return result;

        } catch (error) {
            console.error('Error downloading media:', error);
            this.downloadQueue.delete(message?.id);
            this.emit('download_error', { messageId: message?.id, error });
            return { success: false, reason: error.message };
        }
    }

    /**
     * Save media file to disk
     */
    async saveMediaFile(media, message, mediaId, options = {}) {
        try {
            const metadata = this.createMediaMetadata(media, message, mediaId);
            const fileName = this.generateFileName(metadata, options);
            const subDir = this.getMediaSubDirectory(metadata.type);
            const filePath = path.join(this.mediaDir, subDir, fileName);

            // Ensure directory exists
            await fs.ensureDir(path.dirname(filePath));

            // Write media data
            const buffer = Buffer.from(media.data, 'base64');
            await fs.writeFile(filePath, buffer);

            // Update metadata with file info
            const fileStats = await fs.stat(filePath);
            metadata.filePath = filePath;
            metadata.fileName = fileName;
            metadata.fileSize = fileStats.size;
            metadata.savedAt = Date.now();

            // Cache metadata
            this.mediaCache.set(mediaId, metadata);

            // Save index
            await this.saveMediaIndex();

            // Generate thumbnail if needed
            if (this.shouldGenerateThumbnail(metadata.type)) {
                await this.generateThumbnail(filePath, metadata);
            }

            return {
                success: true,
                mediaId,
                filePath,
                metadata
            };

        } catch (error) {
            console.error('Error saving media file:', error);
            return { success: false, reason: error.message };
        }
    }

    /**
     * Create media metadata
     */
    createMediaMetadata(media, message, mediaId) {
        return {
            id: mediaId,
            messageId: message.id._serialized || message.id,
            chatId: message.from,
            type: message.type,
            mimetype: media.mimetype || message.mimetype,
            filename: media.filename || message.filename,
            caption: message.caption,
            size: media.data.length,
            timestamp: message.timestamp || Date.now() / 1000,
            downloadedAt: Date.now(),
            hash: this.calculateHash(media.data)
        };
    }

    /**
     * Generate media ID
     */
    generateMediaId(media, message) {
        const hash = this.calculateHash(media.data);
        const timestamp = message.timestamp || Date.now() / 1000;
        return `${message.type}_${timestamp}_${hash.substring(0, 8)}`;
    }

    /**
     * Calculate hash of media data
     */
    calculateHash(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Generate file name
     */
    generateFileName(metadata, options = {}) {
        if (options.preserveOriginalName && metadata.filename) {
            return metadata.filename;
        }

        const extension = this.getFileExtension(metadata.mimetype, metadata.filename);
        const timestamp = new Date(metadata.timestamp * 1000).toISOString().slice(0, 19).replace(/:/g, '-');
        
        return `${metadata.type}_${timestamp}_${metadata.hash.substring(0, 8)}${extension}`;
    }

    /**
     * Get file extension from mimetype or filename
     */
    getFileExtension(mimetype, filename) {
        if (filename && path.extname(filename)) {
            return path.extname(filename);
        }

        const mimetypeMap = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'video/mp4': '.mp4',
            'video/avi': '.avi',
            'audio/mpeg': '.mp3',
            'audio/wav': '.wav',
            'audio/ogg': '.ogg',
            'application/pdf': '.pdf',
            'text/plain': '.txt'
        };

        return mimetypeMap[mimetype] || '';
    }

    /**
     * Get media subdirectory based on type
     */
    getMediaSubDirectory(type) {
        const dirMap = {
            [MESSAGE_TYPES.IMAGE]: 'images',
            [MESSAGE_TYPES.VIDEO]: 'videos',
            [MESSAGE_TYPES.AUDIO]: 'audio',
            [MESSAGE_TYPES.VOICE]: 'voice',
            [MESSAGE_TYPES.DOCUMENT]: 'documents',
            [MESSAGE_TYPES.STICKER]: 'stickers'
        };

        return dirMap[type] || 'other';
    }

    /**
     * Check if should generate thumbnail
     */
    shouldGenerateThumbnail(type) {
        return [MESSAGE_TYPES.IMAGE, MESSAGE_TYPES.VIDEO].includes(type);
    }

    /**
     * Generate thumbnail (placeholder implementation)
     */
    async generateThumbnail(filePath, metadata) {
        try {
            // This is a placeholder - implement actual thumbnail generation
            // Could use sharp for images or ffmpeg for videos
            console.log(`📷 Would generate thumbnail for ${metadata.type}: ${filePath}`);
            
            const thumbnailPath = path.join(this.mediaDir, 'thumbnails', `${metadata.id}_thumb.jpg`);
            metadata.thumbnailPath = thumbnailPath;
            
        } catch (error) {
            console.error('Error generating thumbnail:', error);
        }
    }

    /**
     * Check download limits
     */
    checkDownloadLimits() {
        // Check hourly download limit
        const oneHourAgo = Date.now() - TIME.HOUR;
        const recentDownloads = Array.from(this.mediaCache.values())
            .filter(media => media.downloadedAt > oneHourAgo);

        return recentDownloads.length < this.downloadLimits.maxDownloadsPerHour;
    }

    /**
     * Get media by ID
     */
    getMedia(mediaId) {
        return this.mediaCache.get(mediaId) || null;
    }

    /**
     * Get media by message ID
     */
    getMediaByMessage(messageId) {
        return Array.from(this.mediaCache.values())
            .filter(media => media.messageId === messageId);
    }

    /**
     * Get media by chat ID
     */
    getMediaByChat(chatId, limit = 50) {
        return Array.from(this.mediaCache.values())
            .filter(media => media.chatId === chatId)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }

    /**
     * Search media
     */
    searchMedia(query = {}) {
        let results = Array.from(this.mediaCache.values());

        if (query.type) {
            results = results.filter(media => media.type === query.type);
        }

        if (query.chatId) {
            results = results.filter(media => media.chatId === query.chatId);
        }

        if (query.dateFrom) {
            results = results.filter(media => media.timestamp >= query.dateFrom);
        }

        if (query.dateTo) {
            results = results.filter(media => media.timestamp <= query.dateTo);
        }

        if (query.filename) {
            const searchTerm = query.filename.toLowerCase();
            results = results.filter(media => 
                media.filename && media.filename.toLowerCase().includes(searchTerm)
            );
        }

        return results.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Delete media file
     */
    async deleteMedia(mediaId) {
        try {
            const metadata = this.mediaCache.get(mediaId);
            if (!metadata) {
                return { success: false, reason: 'Media not found' };
            }

            // Delete file
            if (metadata.filePath && await fs.pathExists(metadata.filePath)) {
                await fs.unlink(metadata.filePath);
            }

            // Delete thumbnail
            if (metadata.thumbnailPath && await fs.pathExists(metadata.thumbnailPath)) {
                await fs.unlink(metadata.thumbnailPath);
            }

            // Remove from cache
            this.mediaCache.delete(mediaId);

            // Save index
            await this.saveMediaIndex();

            this.emit('media_deleted', { mediaId, metadata });

            return { success: true };

        } catch (error) {
            console.error('Error deleting media:', error);
            return { success: false, reason: error.message };
        }
    }

    /**
     * Cleanup old media files
     */
    async cleanupOldMedia(maxAge = 30 * 24 * TIME.HOUR) {
        const cutoffTime = Date.now() - maxAge;
        const toDelete = [];

        for (const [mediaId, metadata] of this.mediaCache.entries()) {
            if (metadata.downloadedAt < cutoffTime) {
                toDelete.push(mediaId);
            }
        }

        let deletedCount = 0;
        for (const mediaId of toDelete) {
            const result = await this.deleteMedia(mediaId);
            if (result.success) {
                deletedCount++;
            }
        }

        console.log(`🧹 Cleaned up ${deletedCount} old media files`);
        return deletedCount;
    }

    /**
     * Setup cleanup timer
     */
    setupCleanupTimer() {
        // Clean old media files daily
        setInterval(() => {
            this.cleanupOldMedia();
        }, 24 * TIME.HOUR);
    }

    /**
     * Get storage statistics
     */
    async getStorageStats() {
        const stats = {
            totalFiles: this.mediaCache.size,
            totalSize: 0,
            byType: {},
            byDate: {},
            diskUsage: await this.calculateDiskUsage()
        };

        for (const metadata of this.mediaCache.values()) {
            stats.totalSize += metadata.fileSize || 0;

            // Count by type
            stats.byType[metadata.type] = (stats.byType[metadata.type] || 0) + 1;

            // Count by date
            const date = new Date(metadata.timestamp * 1000).toISOString().split('T')[0];
            stats.byDate[date] = (stats.byDate[date] || 0) + 1;
        }

        return stats;
    }

    /**
     * Calculate disk usage
     */
    async calculateDiskUsage() {
        try {
            const stats = await fs.stat(this.mediaDir);
            return {
                directory: this.mediaDir,
                accessible: true
            };
        } catch (error) {
            return {
                directory: this.mediaDir,
                accessible: false,
                error: error.message
            };
        }
    }

    /**
     * Shutdown cleanup
     */
    async shutdown() {
        // Clear download queue
        this.downloadQueue.clear();
        this.processingQueue.clear();

        // Save final index
        await this.saveMediaIndex();

        this.emit('shutdown');
        console.log('Media Manager shutdown complete');
    }
}

module.exports = MediaManager;