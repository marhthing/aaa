const EnvironmentManager = require('../core/EnvironmentManager');

class ErrorRecoveryMiddleware {
    constructor() {
        this.envManager = new EnvironmentManager();
        this.botClient = null;
        this.eventBus = null;
        this.isInitialized = false;
        this.errorCounts = new Map(); // Track error counts per chat
        this.lastErrors = new Map(); // Track last error per chat
    }

    async initialize(dependencies) {
        try {
            this.botClient = dependencies.client;
            this.eventBus = dependencies.eventBus;
            await this.envManager.initialize();
            
            this.isInitialized = true;
            console.log('🔧 Error recovery middleware initialized');
            return this;
            
        } catch (error) {
            console.error('Error initializing Error Recovery middleware:', error);
            throw error;
        }
    }

    async process(context) {
        try {
            if (!this.isInitialized) return;
            
            // Wrap the entire processing in error recovery
            const originalProcess = context.process;
            
            // Override context processing with error handling
            context.processWithRecovery = async (processingFunction) => {
                try {
                    return await processingFunction();
                } catch (error) {
                    await this.handleProcessingError(context, error);
                    throw error; // Re-throw after handling
                }
            };
            
        } catch (error) {
            console.error('Error in Error Recovery middleware setup:', error);
            this.eventBus.emit('middleware_error', { 
                middleware: 'ErrorRecovery', 
                error, 
                message: context.message 
            });
        }
    }

    async handleProcessingError(context, error) {
        try {
            const { message } = context;
            const chatId = message.from;
            
            // Increment error count for this chat
            const currentCount = this.errorCounts.get(chatId) || 0;
            this.errorCounts.set(chatId, currentCount + 1);
            this.lastErrors.set(chatId, {
                error: error.message,
                timestamp: new Date().toISOString()
            });
            
            // Log the error
            console.error(`Processing error in chat ${chatId}:`, error);
            
            // Emit error event
            this.eventBus.emit('processing_error', {
                chatId,
                messageId: message.id._serialized,
                error: error.message,
                errorCount: this.errorCounts.get(chatId),
                timestamp: new Date().toISOString()
            });
            
            // Only send error messages to owner
            const accessController = this.botClient.getAccessController();
            const isOwner = await accessController.isOwner(message.from);
            
            if (isOwner && this.envManager.get('ERROR_RECOVERY') === 'true') {
                await this.sendErrorNotification(message, error);
            }
            
            // Remove any loading reactions on error
            if (context.metadata.loadingReactionShown) {
                await this.botClient.removeLoadingReaction(message);
            }
            
        } catch (recoveryError) {
            console.error('Error in error recovery handling:', recoveryError);
        }
    }

    async sendErrorNotification(message, error) {
        try {
            const errorMessage = `❌ **Error Processing Message**\n\n` +
                               `**Error:** ${error.message}\n` +
                               `**Time:** ${new Date().toLocaleString()}\n` +
                               `**Message ID:** ${message.id._serialized}`;
            
            await this.botClient.sendMessage(message.from, errorMessage);
            
        } catch (notificationError) {
            console.error('Error sending error notification:', notificationError);
        }
    }

    getErrorStats() {
        const totalErrors = Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0);
        const chatsWithErrors = this.errorCounts.size;
        
        return {
            totalErrors,
            chatsWithErrors,
            errorsByChat: Object.fromEntries(this.errorCounts.entries()),
            lastErrors: Object.fromEntries(this.lastErrors.entries())
        };
    }

    clearErrorStats() {
        this.errorCounts.clear();
        this.lastErrors.clear();
        console.log('📊 Error statistics cleared');
    }

    async shutdown() {
        this.clearErrorStats();
        this.isInitialized = false;
    }
}

module.exports = new ErrorRecoveryMiddleware();
