const fs = require('fs-extra');
const path = require('path');
const axios = require('axios'); // Use axios as in your working file

// APIs and logic from your working tiktok.js file
const TIKTOK_APIS = [
    'https://api.douyin.pro/api/douyin',
    'https://api.tiklydown.eu.org/api/download',
    'https://www.tikwm.com/api/?url=',
];

class TikTokDownloaderPlugin {
    constructor(options = {}) {
        this.name = 'tiktok-downloader';
        this.botClient = options.botClient;
        this.eventBus = options.eventBus;
        this.config = options.config || {};
        this.pluginPath = options.pluginPath;
        
        this.isInitialized = false;
        this.downloadPath = path.join(process.cwd(), 'data', 'downloads', 'video');
        this.deleteTimeout = 5 * 60 * 1000;
    }

    async initialize() {
        try {
            console.log(`🔧 Initializing ${this.config.displayName} plugin...`);
            await fs.ensureDir(this.downloadPath);
            console.log(`📁 Download directory ensured: ${this.downloadPath}`);
            this.isInitialized = true;
            console.log(`✅ ${this.config.displayName} plugin initialized`);
        } catch (error) {
            console.error(`❌ Failed to initialize ${this.config.displayName} plugin:`, error);
            throw error;
        }
    }

    getInfo() {
        return {
            name: this.name,
            version: this.config.version,
            description: this.config.description,
            commands: this.getCommands(),
            isInitialized: this.isInitialized
        };
    }

    getCommands() {
        return this.config.commands || [];
    }

    async executeCommand(commandName, context) {
        if (!this.isInitialized) {
            throw new Error(`${this.config.displayName} plugin not initialized`);
        }
        if (commandName.toLowerCase() === 'tiktok') {
            return await this.handleTikTokDownload(context);
        }
        throw new Error(`Unknown command: ${commandName}`);
    }

    async shutdown() {
        try {
            this.isInitialized = false;
            console.log(`✅ ${this.config.displayName} plugin shutdown complete`);
        } catch (error) {
            console.error(`❌ Error during ${this.config.displayName} plugin shutdown:`, error);
        }
    }

    async handleTikTokDownload(context) {
        const { args, reply } = context;

        if (args.length === 0) {
            await reply('❌ Please provide a TikTok video URL.');
            return;
        }

        const videoUrl = args[0];
        await reply('⏳ Downloading video, please wait...');

        if (!this.isValidTikTokUrl(videoUrl)) {
            await reply('❌ Invalid TikTok URL. Please provide a valid TikTok link.');
            return;
        }

        // Use the logic from your working tiktok.js to handle APIs
        let downloadInfo = await this.downloadTiktok(videoUrl);

        if (downloadInfo.success) {
            await this.saveAndSendVideo(downloadInfo.data, context);
        } else {
            await reply('❌ Failed to download the video. It might be private, an invalid link, or all download services are temporarily unavailable.');
        }
    }
    
    /**
     * Downloads a TikTok video by trying multiple free external APIs.
     * @param {string} url - The URL of the TikTok video.
     * @returns {Promise<object>} A promise that resolves to a result object.
     */
    async downloadTiktok(url) {
        for (const apiUrl of TIKTOK_APIS) {
            try {
                const response = await axios.get(`${apiUrl}${encodeURIComponent(url)}`, { timeout: 15000 });
                let downloadUrl;
                let title = 'TikTok Video';

                if (apiUrl.includes('douyin.pro')) {
                    downloadUrl = response.data?.aweme_details?.video?.play_addr?.url_list?.[0];
                    title = response.data?.aweme_details?.desc || title;
                } else if (apiUrl.includes('tiklydown')) {
                    downloadUrl = response.data?.videos?.hd?.url || response.data?.videos?.no_watermark?.url;
                    title = response.data?.description || title;
                } else if (apiUrl.includes('tikwm')) {
                    downloadUrl = response.data?.data?.hdplay || response.data?.data?.play;
                    title = response.data?.data?.title || title;
                }

                if (downloadUrl) {
                    return {
                        success: true,
                        data: {
                            title: title,
                            downloadUrl: downloadUrl
                        }
                    };
                }
            } catch (error) {
                console.error(`API ${apiUrl} for TikTok failed: ${error.message}`);
                continue;
            }
        }

        return {
            success: false,
            error: 'All TikTok downloader APIs failed.',
            platform: 'tiktok'
        };
    }

    async saveAndSendVideo(videoInfo, context) {
        const { downloadUrl, title } = videoInfo;
        const filename = `${this.sanitizeFilename(title)}.mp4`;
        const filePath = path.join(this.downloadPath, filename);

        try {
            const response = await axios({
                method: 'get',
                url: downloadUrl,
                responseType: 'stream'
            });

            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            
            // await context.reply('✅ Video downloaded successfully!');
            await this.sendVideoToChat(filePath, context, title);
        } catch (error) {
            console.error('Error saving or sending video:', error);
            await context.reply('❌ An error occurred while saving or sending the video.');
            this.scheduleFileDeletion(filePath, title);
        }
    }

    isValidTikTokUrl(url) {
        const tiktokRegex = /^(https?:\/\/)?(www\.|vt\.)?(tiktok\.com\/|vm\.tiktok\.com\/)[\w-]+/i;
        return tiktokRegex.test(url);
    }
    
    scheduleFileDeletion(filePath, videoTitle) {
        setTimeout(async () => {
            try {
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

    sanitizeFilename(filename) {
        return filename
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 50);
    }
    
    async sendVideoToChat(filePath, context, videoTitle) {
        try {
            const { message, reply } = context;
            const stats = await fs.stat(filePath);
            
            if (stats.size > 16 * 1024 * 1024) {
                await reply(`⚠️ Video downloaded successfully but is too large for WhatsApp.\n📁 File saved locally and will be auto-deleted in 5 minutes.`);
                return;
            }

            const caption = `🎥 *${videoTitle}*`;
            const videoBuffer = await fs.readFile(filePath);
            await this.botClient.sendMessage(message.key.remoteJid, {
                video: videoBuffer,
                caption: caption,
                fileName: path.basename(filePath),
                mimetype: 'video/mp4'
            });

            console.log(`✅ Video sent to chat: ${videoTitle}`);
            this.scheduleFileDeletion(filePath, videoTitle);
            
        } catch (error) {
            console.error('Error sending video:', error);
            console.log(`📁 Video saved to: ${filePath} but could not be sent to chat`);
            this.scheduleFileDeletion(filePath, videoTitle);
        }
    }
}

module.exports = TikTokDownloaderPlugin;