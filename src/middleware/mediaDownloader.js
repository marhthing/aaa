const EnvironmentManager = require('../core/EnvironmentManager');

class MediaDownloaderMiddleware {
    constructor() {
        this.envManager = new EnvironmentManager();
        this.botClient = null;
        this.eventBus = null;
        this.mediaVault = null;
        this.isInitialized = false;
    }

    async initialize(dependencies) {
        try {
            this.botClient = dependencies.client;
            this.eventBus = dependencies.eventBus;
            this.mediaVault = dependencies.mediaVault;
            await this.envManager.initialize();
            
            this.isInitialized = true;
            console.log('📥 Media downloader middleware initialized');
            return this;
            
        } catch (error) {
            console.error('Error initializing Media Downloader middleware:', error);
            throw error;
        }
    }

    async process(context) {
        try {
            if (!this.isInitialized) return;
            
            const { message } = context;
            
            // Only process messages with media if media download is enabled
            if (!message.hasMedia || this.envManager.get('ENABLE_MEDIA_DOWNLOAD') !== 'true') {
                return;
            }
            
            const mediaVault = this.botClient.getMediaVault();
            if (!mediaVault) {
                return;
            }
            
            // Queue media for download (non-blocking)
            mediaVault.downloadMedia(message)
                .then(mediaPath => {
                    if (mediaPath) {
                        context.metadata.mediaDownloaded = true;
                        context.metadata.mediaPath = mediaPath;
                        
                        this.eventBus.emit('media_downloaded', {
                            messageId: message.id._serialized,
                            from: message.from,
                            mediaPath,
                            mediaType: message.type
                        });
                    }
                })
                .catch(error => {
                    console.error('Error downloading media:', error);
                    context.metadata.mediaDownloadError = error.message;
                    
                    this.eventBus.emit('media_download_error', {
                        messageId: message.id._serialized,
                        from: message.from,
                        error: error.message
                    });
                });
            
            // Mark as queued for download
            context.metadata.mediaQueuedForDownload = true;
            
        } catch (error) {
            console.error('Error in Media Downloader middleware:', error);
            this.eventBus.emit('middleware_error', { 
                middleware: 'MediaDownloader', 
                error, 
                message: context.message 
            });
        }
    }

    async shutdown() {
        this.isInitialized = false;
    }
}

module.exports = new MediaDownloaderMiddleware();
