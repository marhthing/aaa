const EnvironmentManager = require('../core/EnvironmentManager');

class LoadingReactionMiddleware {
    constructor() {
        this.envManager = new EnvironmentManager();
        this.botClient = null;
        this.eventBus = null;
        this.isInitialized = false;
    }

    async initialize(dependencies) {
        try {
            this.botClient = dependencies.client;
            this.eventBus = dependencies.eventBus;
            this.loadingReaction = dependencies.loadingReaction;
            await this.envManager.initialize();
            
            this.isInitialized = true;
            console.log('⏳ Loading reaction middleware initialized');
            return this;
            
        } catch (error) {
            console.error('Error initializing Loading Reaction middleware:', error);
            throw error;
        }
    }

    async process(context) {
        try {
            if (!this.isInitialized) return;
            
            const { message } = context;
            const messageText = message.body || '';
            const prefix = this.envManager.get('BOT_PREFIX', '.');
            
            // Only show loading reaction for commands from owner
            if (!messageText.startsWith(prefix)) {
                return;
            }
            
            const accessController = this.botClient.getAccessController();
            const isOwner = await accessController.isOwner(message.from);
            
            if (isOwner && context.metadata.accessGranted) {
                // Show loading reaction for owner's commands
                if (this.loadingReaction) {
                    await this.loadingReaction.showLoadingReaction(message);
                    context.metadata.loadingReactionShown = true;
                }
            }
            
        } catch (error) {
            console.error('Error in Loading Reaction middleware:', error);
            this.eventBus.emit('middleware_error', { 
                middleware: 'LoadingReaction', 
                error, 
                message: context.message 
            });
        }
    }

    async shutdown() {
        this.isInitialized = false;
    }
}

module.exports = new LoadingReactionMiddleware();
