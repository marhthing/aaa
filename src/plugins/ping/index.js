/**
 * Ping Plugin - Example of Standalone Plugin Architecture
 * Everything for this plugin is contained within this folder
 */

class PingPlugin {
    constructor(options = {}) {
        this.name = 'ping';
        this.botClient = options.botClient;
        this.eventBus = options.eventBus;
        this.config = options.config || {};
        this.pluginPath = options.pluginPath;
        
        // Plugin state
        this.isInitialized = false;
        this.stats = {
            pingsReceived: 0,
            startTime: new Date()
        };
    }

    /**
     * Initialize the plugin
     */
    async initialize() {
        try {
            console.log('🔧 Initializing Ping plugin...');
            
            // Any initialization logic here
            await this.loadStats();
            
            this.isInitialized = true;
            console.log('✅ Ping plugin initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize Ping plugin:', error);
            throw error;
        }
    }

    /**
     * Get plugin information
     */
    getInfo() {
        return {
            name: this.name,
            version: this.config.version,
            description: this.config.description,
            commands: this.getCommands(),
            stats: this.stats,
            isInitialized: this.isInitialized
        };
    }

    /**
     * Get available commands
     */
    getCommands() {
        return this.config.commands || [];
    }

    /**
     * Main command execution handler
     */
    async executeCommand(commandName, context) {
        if (!this.isInitialized) {
            throw new Error('Ping plugin not initialized');
        }

        const { message, args, reply } = context;

        switch (commandName.toLowerCase()) {
            case 'ping':
                return await this.handlePing(context);
            case 'pinginfo':
                return await this.handlePingInfo(context);
            default:
                throw new Error(`Unknown command: ${commandName}`);
        }
    }

    /**
     * Handle ping command
     */
    async handlePing(context) {
        const { reply } = context;
        const startTime = Date.now();
        
        // Calculate response time
        const responseTime = Date.now() - startTime;
        this.stats.pingsReceived++;
        
        const response = `🏓 **Pong!**\n\n` +
                        `⚡ Response Time: ${responseTime}ms\n` +
                        `📊 Total Pings: ${this.stats.pingsReceived}\n` +
                        `⏰ Uptime: ${this.getUptime()}`;
        
        await reply(response);
        await this.saveStats();
    }

    /**
     * Handle pinginfo command
     */
    async handlePingInfo(context) {
        const { reply } = context;
        
        const info = `🏓 **Ping Plugin Info**\n\n` +
                    `📋 Name: ${this.config.displayName}\n` +
                    `📝 Description: ${this.config.description}\n` +
                    `🔢 Version: ${this.config.version}\n` +
                    `📊 Total Pings: ${this.stats.pingsReceived}\n` +
                    `🚀 Started: ${this.stats.startTime.toLocaleString()}\n` +
                    `⏰ Uptime: ${this.getUptime()}\n` +
                    `✅ Status: ${this.isInitialized ? 'Active' : 'Inactive'}`;
        
        await reply(info);
    }

    /**
     * Get plugin uptime
     */
    getUptime() {
        const uptime = Date.now() - this.stats.startTime.getTime();
        const hours = Math.floor(uptime / 3600000);
        const minutes = Math.floor((uptime % 3600000) / 60000);
        const seconds = Math.floor((uptime % 60000) / 1000);
        
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    /**
     * Load plugin stats from file
     */
    async loadStats() {
        try {
            const fs = require('fs-extra');
            const path = require('path');
            const statsFile = path.join(this.pluginPath || __dirname, 'stats.json');
            
            if (await fs.pathExists(statsFile)) {
                const savedStats = await fs.readJson(statsFile);
                this.stats = {
                    ...this.stats,
                    ...savedStats,
                    startTime: new Date(savedStats.startTime)
                };
            }
        } catch (error) {
            console.error('Error loading ping stats:', error);
        }
    }

    /**
     * Save plugin stats to file
     */
    async saveStats() {
        try {
            const fs = require('fs-extra');
            const path = require('path');
            const statsFile = path.join(this.pluginPath || __dirname, 'stats.json');
            
            await fs.writeJson(statsFile, this.stats, { spaces: 2 });
        } catch (error) {
            console.error('Error saving ping stats:', error);
        }
    }

    /**
     * Shutdown the plugin
     */
    async shutdown() {
        try {
            console.log('🛑 Shutting down Ping plugin...');
            
            await this.saveStats();
            this.isInitialized = false;
            
            console.log('✅ Ping plugin shutdown complete');
            
        } catch (error) {
            console.error('Error during Ping plugin shutdown:', error);
        }
    }

    /**
     * Plugin health check
     */
    async healthCheck() {
        return {
            status: this.isInitialized ? 'healthy' : 'unhealthy',
            uptime: this.getUptime(),
            stats: this.stats,
            lastCheck: new Date().toISOString()
        };
    }
}

module.exports = PingPlugin;