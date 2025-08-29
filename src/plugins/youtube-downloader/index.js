const ytdl = require('@distube/ytdl-core');
const fs = require('fs-extra');
const path = require('path');

class YouTubeDownloaderPlugin {
    constructor(options = {}) {
        this.name = 'youtube-downloader';
        this.botClient = options.botClient;
        this.eventBus = options.eventBus;
        this.config = options.config || {};
        this.pluginPath = options.pluginPath;
        
        this.isInitialized = false;
        this.downloadPath = path.join(process.cwd(), 'data', 'downloads', 'video');
        this.deleteTimeout = 5 * 60 * 1000; // 5 minutes in milliseconds
    }

    /**
     * Schedule file deletion after specified timeout
     */
    scheduleFileDeletion(filePath, videoTitle) {
        setTimeout(async () => {
            try {
                // Check if file still exists before attempting deletion
                if (await fs.pathExists(filePath)) {
                    await fs.unlink(filePath);
                    console.log(`🗑️ Auto-deleted video after 5 minutes: ${videoTitle}`);
                }
            } catch (error) {
                console.error(`❌ Failed to auto-delete video file: ${filePath}`, error);
            }
        }, this.deleteTimeout);
        
        console.log(`⏰ Video will be auto-deleted in 5 minutes: ${videoTitle}`);
    }

    /**
     * REQUIRED: Initialize the plugin
     */
    async initialize() {
        try {
            console.log(`🔧 Initializing ${this.config.displayName} plugin...`);
            
            // Create download directory if it doesn't exist
            await fs.ensureDir(this.downloadPath);
            console.log(`📁 Download directory ensured: ${this.downloadPath}`);
            
            this.isInitialized = true;
            console.log(`✅ ${this.config.displayName} plugin initialized`);
            
        } catch (error) {
            console.error(`❌ Failed to initialize ${this.config.displayName} plugin:`, error);
            throw error;
        }
    }

    /**
     * REQUIRED: Get plugin information
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
     * REQUIRED: Get available commands
     */
    getCommands() {
        return this.config.commands || [];
    }

    /**
     * REQUIRED: Main command execution handler
     */
    async executeCommand(commandName, context) {
        if (!this.isInitialized) {
            throw new Error(`${this.config.displayName} plugin not initialized`);
        }

        const { message, args, reply } = context;

        switch (commandName.toLowerCase()) {
            case 'ytv':
                return await this.handleVideoDownload(context);
            
            default:
                throw new Error(`Unknown command: ${commandName}`);
        }
    }

    /**
     * Handle YouTube video download command
     */
    async handleVideoDownload(context) {
        const { message, args, reply } = context;
        
        try {
            // Check if URL was provided
            if (!args || args.length === 0) {
                await reply('❌ Please provide a YouTube URL.\n\nUsage: `.ytv <youtube-url>`\nExample: `.ytv https://www.youtube.com/watch?v=dQw4w9WgXcQ`');
                return;
            }

            const url = args[0];
            
            // Validate YouTube URL
            if (!this.isValidYouTubeUrl(url)) {
                await reply('❌ Invalid YouTube URL. Please provide a valid YouTube link.');
                return;
            }

            await reply('⏳ Starting download... This may take a few minutes depending on video length.');

            // Get video info with better error handling
            let info;
            try {
                info = await ytdl.getInfo(url);
            } catch (error) {
                if (error.message.includes('Could not extract functions')) {
                    await reply('❌ YouTube extraction error. This is usually temporary. Please try again in a few minutes.');
                    return;
                }
                throw error;
            }
            const title = this.sanitizeFilename(info.videoDetails.title);
            const videoId = info.videoDetails.videoId;
            
            // Create filename with timestamp to avoid conflicts
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${title}_${videoId}_${timestamp}.mp4`;
            const filePath = path.join(this.downloadPath, filename);

            // Check video duration (optional safeguard)
            const duration = parseInt(info.videoDetails.lengthSeconds);
            if (duration > 3600) { // 1 hour limit
                await reply('❌ Video is too long (over 1 hour). Please choose a shorter video.');
                return;
            }

            // Download the video
            await this.downloadVideo(url, filePath, reply, info);
            
            // Send the video file to chat
            await this.sendVideoToChat(filePath, context, info);
            
        } catch (error) {
            console.error('YouTube download error:', error);
            
            if (error.message.includes('Video unavailable')) {
                await reply('❌ Video is unavailable or private. Please check the URL and try again.');
            } else if (error.message.includes('Could not extract functions')) {
                await reply('❌ YouTube extraction error. This is usually temporary - try again in a few minutes.');
            } else if (error.message.includes('No such file')) {
                await reply('❌ Download failed. The video file could not be created.');
            } else {
                await reply(`❌ Download failed: ${error.message}`);
            }
        }
    }

    /**
     * Download video using @distube/ytdl-core with enhanced options
     */
    async downloadVideo(url, filePath, reply, info) {
        return new Promise((resolve, reject) => {
            const stream = ytdl(url, { 
                quality: 'highestvideo',
                filter: 'audioandvideo',
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                }
            });
            
            const writeStream = fs.createWriteStream(filePath);
            let downloadedBytes = 0;
            let totalBytes = 0;
            
            stream.on('info', (videoInfo, format) => {
                totalBytes = parseInt(format.contentLength) || 0;
                console.log(`📥 Downloading: ${info.videoDetails.title}`);
                console.log(`📊 Size: ${this.formatBytes(totalBytes)}`);
            });

            stream.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                if (totalBytes > 0) {
                    const progress = Math.floor((downloadedBytes / totalBytes) * 100);
                    if (progress % 25 === 0) { // Update every 25%
                        console.log(`📊 Download progress: ${progress}%`);
                    }
                }
            });

            stream.on('error', (error) => {
                console.error('Stream error:', error);
                // Clean up partial file
                fs.unlink(filePath).catch(() => {});
                reject(error);
            });

            writeStream.on('error', (error) => {
                console.error('Write stream error:', error);
                reject(error);
            });

            writeStream.on('finish', () => {
                console.log('✅ Download completed');
                resolve();
            });

            stream.pipe(writeStream);
        });
    }

    /**
     * Send downloaded video to WhatsApp chat
     */
    async sendVideoToChat(filePath, context, info) {
        try {
            const { message, reply } = context;
            
            // Check if file exists and get size
            const stats = await fs.stat(filePath);
            const fileSize = this.formatBytes(stats.size);
            
            // WhatsApp has file size limits (usually 16MB for videos)
            if (stats.size > 16 * 1024 * 1024) { // 16MB
                await reply(`⚠️ Video downloaded successfully but is too large for WhatsApp (${fileSize}).\n📁 File saved locally and will be auto-deleted in 5 minutes.`);
                return;
            }

            const videoTitle = info.videoDetails.title;
            const duration = this.formatDuration(parseInt(info.videoDetails.lengthSeconds));
            
            // Send video with caption using fs.readFileSync for buffer
            const videoBuffer = await fs.readFile(filePath);
            const caption = `🎥 *${videoTitle}*`;
            
            // Try different message formats for compatibility
            try {
                // Method 1: Send as video with buffer
                await this.botClient.sendMessage(message.key.remoteJid, {
                    video: videoBuffer,
                    caption: caption,
                    fileName: path.basename(filePath),
                    mimetype: 'video/mp4'
                });
            } catch (bufferError) {
                console.log('Buffer method failed, trying file path method...');
                
                // Method 2: Send with file path
                await this.botClient.sendMessage(message.key.remoteJid, {
                    video: { url: filePath },
                    caption: caption,
                    mimetype: 'video/mp4'
                });
            }

            console.log(`✅ Video sent to chat: ${videoTitle}`);
            
            // Schedule file deletion after 5 minutes
            this.scheduleFileDeletion(filePath, videoTitle);
            
        } catch (error) {
            console.error('Error sending video:', error);
            // Don't show error message in chat, just log it
            console.log(`📁 Video saved to: ${filePath} but could not be sent to chat`);
            
            // Still schedule deletion even if sending failed
            this.scheduleFileDeletion(filePath, info.videoDetails.title);
        }
    }

    /**
     * Validate YouTube URL (supports regular videos, shorts, and various formats)
     */
    isValidYouTubeUrl(url) {
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)[\w-]+/;
        return youtubeRegex.test(url);
    }

    /**
     * Sanitize filename for file system
     */
    sanitizeFilename(filename) {
        return filename
            .replace(/[^\w\s-]/g, '') // Remove special characters
            .replace(/\s+/g, '_')     // Replace spaces with underscores
            .substring(0, 50);        // Limit length
    }

    /**
     * Format bytes to human readable string
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Format duration from seconds to readable string
     */
    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }

    /**
     * OPTIONAL: Cleanup when plugin is unloaded
     */
    async shutdown() {
        try {
            console.log(`🔄 Shutting down ${this.config.displayName} plugin...`);
            this.isInitialized = false;
            console.log(`✅ ${this.config.displayName} plugin shutdown complete`);
        } catch (error) {
            console.error(`❌ Error during ${this.config.displayName} plugin shutdown:`, error);
        }
    }
}

module.exports = YouTubeDownloaderPlugin;