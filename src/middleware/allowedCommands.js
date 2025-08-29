const EnvironmentManager = require('../core/EnvironmentManager');

class AllowedCommandsMiddleware {
    constructor() {
        this.envManager = new EnvironmentManager();
        this.botClient = null;
        this.eventBus = null;
        this.allowedCommands = null;
        this.isInitialized = false;
    }

    async initialize(dependencies) {
        try {
            this.botClient = dependencies.client;
            this.eventBus = dependencies.eventBus;
            this.allowedCommands = dependencies.allowedCommands;
            await this.envManager.initialize();
            
            this.isInitialized = true;
            console.log('✅ Allowed commands middleware initialized');
            return this;
            
        } catch (error) {
            console.error('Error initializing Allowed Commands middleware:', error);
            throw error;
        }
    }

    async process(context) {
        try {
            if (!this.isInitialized) return;
            
            const { message } = context;
            
            // Only process if this is a limited command
            if (!context.metadata.isLimitedCommand) {
                return;
            }
            
            const allowedCommand = context.metadata.allowedCommand;
            
            // Validate that the user still has permission for this command
            const accessController = this.botClient.getAccessController();
            const canExecute = await accessController.canExecuteCommand(message.from, allowedCommand);
            
            if (!canExecute) {
                // Permission was revoked
                context.stopped = true;
                context.metadata.permissionRevoked = true;
                
                this.eventBus.emit('permission_revoked', {
                    from: message.from,
                    command: allowedCommand,
                    messageId: message.id._serialized
                });
                
                return;
            }
            
            // Log allowed command usage
            this.eventBus.emit('allowed_command_used', {
                from: message.from,
                command: allowedCommand,
                messageId: message.id._serialized,
                timestamp: new Date().toISOString()
            });
            
            context.metadata.allowedCommandValidated = true;
            
        } catch (error) {
            console.error('Error in Allowed Commands middleware:', error);
            this.eventBus.emit('middleware_error', { 
                middleware: 'AllowedCommands', 
                error, 
                message: context.message 
            });
        }
    }

    async shutdown() {
        this.isInitialized = false;
    }
}

module.exports = new AllowedCommandsMiddleware();
