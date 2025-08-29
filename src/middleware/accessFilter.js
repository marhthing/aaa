class AccessFilterMiddleware {
    constructor() {
        this.accessController = null;
        this.eventBus = null;
        this.blockedCount = 0;
        this.allowedCount = 0;
    }

    async initialize(dependencies) {
        this.accessController = dependencies.accessController;
        this.eventBus = dependencies.eventBus;
        
        console.log('🔐 Access filter middleware initialized');
    }

    async process(message, context) {
        try {
            // Extract command if present
            const command = this.extractCommand(message);
            
            // Check access control
            const accessResult = this.accessController.canProcessMessage(message, command?.name);
            
            if (!accessResult.allowed) {
                this.blockedCount++;
                
                // Log access denied
                const senderJid = message.author || message.from;
                console.log(`🚫 Access denied for ${senderJid}: ${accessResult.reason}`);
                
                // Emit access denied event
                this.eventBus?.emitAccessDenied(message, accessResult.reason);
                
                // Stop processing
                return {
                    stopPropagation: true,
                    accessDenied: true,
                    accessReason: accessResult.reason,
                    command: command
                };
            }

            this.allowedCount++;
            
            // Add access info to context
            return {
                accessGranted: true,
                accessReason: accessResult.reason,
                command: command,
                gameType: accessResult.gameType || null
            };

        } catch (error) {
            console.error('❌ Error in access filter middleware:', error);
            throw error;
        }
    }

    extractCommand(message) {
        const text = message.body.trim();
        const prefix = process.env.COMMAND_PREFIX || '.';
        
        if (!text.startsWith(prefix)) {
            return null;
        }

        const parts = text.substring(prefix.length).split(' ');
        return {
            name: parts[0].toLowerCase(),
            args: parts.slice(1),
            raw: text,
            prefix: prefix
        };
    }

    getStats() {
        const total = this.blockedCount + this.allowedCount;
        
        return {
            blockedCount: this.blockedCount,
            allowedCount: this.allowedCount,
            total: total,
            blockRate: total > 0 ? (this.blockedCount / total * 100).toFixed(2) + '%' : '0%'
        };
    }
}

module.exports = new AccessFilterMiddleware();
