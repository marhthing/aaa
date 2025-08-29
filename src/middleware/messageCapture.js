class MessageCaptureMiddleware {
    constructor() {
        this.messageArchiver = null;
        this.eventBus = null;
        this.processedCount = 0;
        this.errorCount = 0;
    }

    async initialize(dependencies) {
        this.messageArchiver = dependencies.messageArchiver;
        this.eventBus = dependencies.eventBus;
        
        console.log('📝 Message capture middleware initialized');
    }

    async process(message, context) {
        try {
            // Always capture and archive the message first
            await this.messageArchiver.archiveMessage(message);
            
            // Emit message received event
            this.eventBus?.emitMessageReceived(message);
            
            this.processedCount++;
            
            // Add message info to context
            return {
                messageArchived: true,
                messageId: message.id._serialized || message.id.id,
                chatId: message.from,
                timestamp: message.timestamp
            };

        } catch (error) {
            this.errorCount++;
            console.error('❌ Error in message capture middleware:', error);
            
            // Don't stop processing for archival errors
            return {
                messageArchived: false,
                archiveError: error.message
            };
        }
    }

    getStats() {
        return {
            processedCount: this.processedCount,
            errorCount: this.errorCount,
            successRate: this.processedCount > 0 ? 
                ((this.processedCount - this.errorCount) / this.processedCount * 100).toFixed(2) + '%' : '0%'
        };
    }
}

module.exports = new MessageCaptureMiddleware();
