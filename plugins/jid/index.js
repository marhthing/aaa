class JidPlugin {
    constructor(options = {}) {
        this.name = 'jid'; // Must match plugin.json name
        this.botClient = options.botClient;
        this.eventBus = options.eventBus;
        this.config = options.config || {};
        this.pluginPath = options.pluginPath;
        
        this.isInitialized = false;
    }

    /**
     * REQUIRED: Initialize the plugin
     */
    async initialize() {
        try {
            console.log(`🔧 Initializing ${this.config.displayName} plugin...`);
            
            // Plugin is simple, no special initialization needed
            
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
            case 'jid':
                return await this.handleJidCommand(context);
            
            default:
                throw new Error(`Unknown command: ${commandName}`);
        }
    }

    /**
     * Handle the jid command
     */
    async handleJidCommand(context) {
        try {
            const { message, reply } = context;
            
            // Get the chat JID from the message
            const chatJid = message.key.remoteJid || message.from;
            
            if (chatJid) {
                await reply(`${chatJid}`);
            } else {
                await reply('❌ Could not retrieve chat JID');
            }
            
        } catch (error) {
            console.error('JID command error:', error);
            await context.reply('❌ Failed to get chat JID');
        }
    }

    /**
     * OPTIONAL: Cleanup when plugin is unloaded
     */
    async shutdown() {
        try {
            // No special cleanup needed for this plugin
            this.isInitialized = false;
            console.log(`✅ ${this.config.displayName} plugin shutdown complete`);
        } catch (error) {
            console.error(`❌ Error during ${this.config.displayName} plugin shutdown:`, error);
        }
    }
}

module.exports = JidPlugin;