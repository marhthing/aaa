
const { Detector } = require('./detector');

class AntiDeletePlugin {
    constructor(options) {
        this.options = options;
        this.botClient = options.botClient;
        this.eventBus = options.eventBus;
        this.metadata = options.metadata;
        this.config = options.config;
        
        this.commands = {};
        this.detector = null;
        
        this.isEnabled = true; // Default enabled
        this.targetJid = null; // If not set, use owner's personal chat
        
        this.isInitialized = false;
    }

    async initialize() {
        try {
            console.log('🔍 Initializing Anti-Delete plugin...');
            
            // Initialize detector
            this.detector = new Detector(this.botClient, this.eventBus);
            await this.detector.initialize();
            
            // Set detector reference for simplified functionality
            this.detector.setPlugin(this);
            
            // Initialize commands
            this.initializeCommands();
            
            // Set up event handlers
            this.setupEventHandlers();
            
            this.isInitialized = true;
            console.log('✅ Anti-Delete plugin initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize Anti-Delete plugin:', error);
            throw error;
        }
    }

    initializeCommands() {
        this.commands = {
            delete: this.handleDeleteCommand.bind(this)
        };
    }

    setupEventHandlers() {
        // Listen for message deletion events
        this.eventBus.on('message_deleted', async (data) => {
            if (this.detector && this.isEnabled) {
                await this.detector.handleDeletion(data);
            }
        });
        
        // Listen for deletion detection events
        this.eventBus.on('deletion_detected', async (data) => {
            if (this.isEnabled) {
                console.log(`🔍 Message deletion detected: ${data.id}`);
            }
        });
    }

    async handleDeleteCommand(context) {
        try {
            const { args, reply } = context;
            
            if (args.length === 0) {
                // Show current status
                const status = this.isEnabled ? '🟢 ON' : '🔴 OFF';
                const targetInfo = this.targetJid ? 
                    `📤 Target: ${this.targetJid.split('@')[0]}` : 
                    '📤 Target: Owner personal chat';
                
                await reply(`🗑️ **Anti-Delete Status**\n\n${status}\n${targetInfo}\n\n💡 **Commands:**\n• \`.delete on\` - Enable\n• \`.delete off\` - Disable\n• \`.delete <jid>\` - Set target JID`);
                return;
            }
            
            const command = args[0].toLowerCase();
            
            switch (command) {
                case 'on':
                    this.isEnabled = true;
                    await reply('🟢 Anti-Delete enabled');
                    break;
                    
                case 'off':
                    this.isEnabled = false;
                    await reply('🔴 Anti-Delete disabled');
                    break;
                    
                default:
                    // Treat as JID
                    const jid = args[0];
                    if (this.isValidJid(jid)) {
                        this.targetJid = jid;
                        await reply(`📤 Anti-Delete target set to: ${jid.split('@')[0]}`);
                    } else {
                        await reply('❌ Invalid JID format\n\nUsage:\n• `.delete on` - Enable\n• `.delete off` - Disable\n• `.delete <jid>` - Set target JID');
                    }
                    break;
            }
            
        } catch (error) {
            console.error('Error in delete command:', error);
            await context.reply('❌ Error processing delete command');
        }
    }

    isValidJid(jid) {
        // Basic JID validation
        return jid && (jid.includes('@s.whatsapp.net') || jid.includes('@g.us'));
    }

    getTargetJid() {
        if (this.targetJid) {
            return this.targetJid;
        }
        
        // Use owner's personal chat
        const accessController = this.botClient.getAccessController();
        return accessController.ownerJid;
    }

    async handleDeletedMessage(after, before, archivedMessage) {
        try {
            if (!this.isEnabled) {
                return; // Anti-delete is disabled
            }
            
            console.log('🗑️ Anti-delete plugin handling deleted message');
            
            if (this.detector) {
                const deletionData = {
                    after: after,
                    before: archivedMessage || before
                };
                await this.detector.handleDeletion(deletionData);
            }
            
        } catch (error) {
            console.error('❌ Error in anti-delete plugin handling deletion:', error);
        }
    }

    async executeCommand(commandName, context) {
        if (!this.isInitialized) {
            throw new Error('Anti-Delete plugin not initialized');
        }

        if (!this.commands[commandName]) {
            throw new Error(`Command '${commandName}' not found in anti-delete plugin`);
        }

        try {
            return await this.commands[commandName](context);
        } catch (error) {
            console.error(`❌ Error executing anti-delete command '${commandName}':`, error);
            throw error;
        }
    }

    async shutdown() {
        try {
            console.log('🛑 Shutting down Anti-Delete plugin...');
            
            if (this.detector) {
                await this.detector.shutdown();
            }
            
            this.isInitialized = false;
            
            console.log('✅ Anti-Delete plugin shutdown complete');
            
        } catch (error) {
            console.error('Error during Anti-Delete plugin shutdown:', error);
        }
    }
}

module.exports = AntiDeletePlugin;
