const { AllowCommands } = require('./allowCommands');
const { UserManager } = require('./userManager');
const { SystemInfo } = require('./systemInfo');

class AdminToolsPlugin {
    constructor(options) {
        this.options = options;
        this.botClient = options.botClient;
        this.eventBus = options.eventBus;
        this.metadata = options.metadata;
        this.config = options.config;
        
        this.commands = {};
        this.allowCommands = null;
        this.userManager = null;
        this.systemInfo = null;
        
        this.isInitialized = false;
    }

    async initialize() {
        try {
            console.log('🔧 Initializing Admin Tools plugin...');
            
            // Initialize components
            this.allowCommands = new AllowCommands(this.botClient, this.eventBus);
            this.userManager = new UserManager(this.botClient, this.eventBus);
            this.systemInfo = new SystemInfo(this.botClient, this.eventBus);
            
            // Initialize commands
            this.initializeCommands();
            
            this.isInitialized = true;
            console.log('✅ Admin Tools plugin initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize Admin Tools plugin:', error);
            throw error;
        }
    }

    initializeCommands() {
        this.commands = {
            systeminfo: this.systemInfo.systeminfo.bind(this.systemInfo),
            plugins: this.systemInfo.plugins.bind(this.systemInfo),
            users: this.userManager.users.bind(this.userManager),
            permissions: this.allowCommands.permissions.bind(this.allowCommands),
            logs: this.systemInfo.logs.bind(this.systemInfo),
            cleanup: this.systemInfo.cleanup.bind(this.systemInfo),
            backup: this.systemInfo.backup.bind(this.systemInfo)
        };
    }

    async shutdown() {
        try {
            console.log('🛑 Shutting down Admin Tools plugin...');
            
            this.isInitialized = false;
            
            console.log('✅ Admin Tools plugin shutdown complete');
            
        } catch (error) {
            console.error('Error during Admin Tools plugin shutdown:', error);
        }
    }
}

module.exports = AdminToolsPlugin;
