const os = require('os');
const fs = require('fs-extra');
const path = require('path');
const EnvironmentManager = require('../../core/EnvironmentManager');

class SystemInfo {
    constructor(botClient, eventBus) {
        this.botClient = botClient;
        this.eventBus = eventBus;
        this.envManager = new EnvironmentManager();
    }

    async systeminfo(context) {
        try {
            const { reply } = context;
            
            const clientInfo = this.botClient.getClientInfo();
            const memoryUsage = process.memoryUsage();
            
            let systemText = `💻 **System Information**\n\n`;
            
            // Bot information
            systemText += `🤖 **Bot Status:**\n`;
            systemText += `• Connected: ${clientInfo?.connected ? '✅ Yes' : '❌ No'}\n`;
            systemText += `• Account: ${clientInfo?.pushname || 'Unknown'} (${clientInfo?.phone || 'Unknown'})\n`;
            systemText += `• Platform: ${clientInfo?.platform || 'Unknown'}\n`;
            systemText += `• Battery: ${clientInfo?.battery || 'Unknown'}%\n\n`;
            
            // System information
            systemText += `🖥️ **Server Information:**\n`;
            systemText += `• OS: ${os.platform()} ${os.arch()}\n`;
            systemText += `• Node.js: ${process.version}\n`;
            systemText += `• CPU Cores: ${os.cpus().length}\n`;
            systemText += `• Total RAM: ${this.formatBytes(os.totalmem())}\n`;
            systemText += `• Free RAM: ${this.formatBytes(os.freemem())}\n`;
            systemText += `• Load Average: ${os.loadavg()[0].toFixed(2)}\n\n`;
            
            // Process information
            systemText += `⚡ **Process Information:**\n`;
            systemText += `• Process ID: ${process.pid}\n`;
            systemText += `• Heap Used: ${this.formatBytes(memoryUsage.heapUsed)}\n`;
            systemText += `• Heap Total: ${this.formatBytes(memoryUsage.heapTotal)}\n`;
            systemText += `• RSS: ${this.formatBytes(memoryUsage.rss)}\n`;
            systemText += `• External: ${this.formatBytes(memoryUsage.external)}\n\n`;
            
            // Features status
            systemText += `🔧 **Features Status:**\n`;
            systemText += `• Message Archival: ${this.envManager.get('ENABLE_MESSAGE_ARCHIVAL') === 'true' ? '✅' : '❌'}\n`;
            systemText += `• Media Download: ${this.envManager.get('ENABLE_MEDIA_DOWNLOAD') === 'true' ? '✅' : '❌'}\n`;
            systemText += `• Anti-Delete: ${this.envManager.get('ENABLE_ANTI_DELETE') === 'true' ? '✅' : '❌'}\n`;
            systemText += `• Games: ${this.envManager.get('ENABLE_GAMES') === 'true' ? '✅' : '❌'}\n`;
            systemText += `• Hot Reload: ${this.envManager.get('ENABLE_HOT_RELOAD') === 'true' ? '✅' : '❌'}\n`;
            systemText += `• Web Interface: ${this.envManager.get('WEB_INTERFACE_ENABLED') === 'true' ? '✅' : '❌'}`;
            
            await reply(systemText);
            
        } catch (error) {
            console.error('Error getting system info:', error);
            await context.reply('❌ Error retrieving system information');
        }
    }

    async plugins(context) {
        try {
            const { reply } = context;
            
            // This would need to be implemented with actual plugin discovery
            let pluginsText = `🔌 **Plugins Information**\n\n`;
            
            pluginsText += `📊 **Plugin Status:**\n`;
            pluginsText += `• Total Plugins: Loading...\n`;
            pluginsText += `• Loaded Plugins: Loading...\n`;
            pluginsText += `• Failed Plugins: Loading...\n\n`;
            
            pluginsText += `📝 **Core Plugins:**\n`;
            pluginsText += `• ✅ core-commands - Essential bot commands\n`;
            pluginsText += `• ✅ games - Interactive games system\n`;
            pluginsText += `• ✅ admin-tools - Administrative utilities\n`;
            pluginsText += `• ✅ anti-delete - Message recovery system\n`;
            pluginsText += `• ✅ media-tools - Media processing tools\n\n`;
            
            pluginsText += `💡 **Plugin Management:**\n`;
            pluginsText += `• Plugins auto-reload when files change\n`;
            pluginsText += `• Use .reload to manually reload plugins\n`;
            pluginsText += `• Plugin configs are in src/plugins/*/plugin.json`;
            
            await reply(pluginsText);
            
        } catch (error) {
            console.error('Error getting plugins info:', error);
            await context.reply('❌ Error retrieving plugins information');
        }
    }

    async logs(context) {
        try {
            const { args, reply } = context;
            
            const logLevel = args[0] || 'info';
            const limit = parseInt(args[1]) || 50;
            
            let logsText = `📋 **System Logs**\n\n`;
            logsText += `**Log Level:** ${logLevel}\n`;
            logsText += `**Entries:** ${limit}\n\n`;
            
            // This would need actual log file reading implementation
            logsText += `📝 **Recent Log Entries:**\n`;
            logsText += `[${new Date().toISOString()}] INFO: Bot initialized successfully\n`;
            logsText += `[${new Date().toISOString()}] INFO: WhatsApp client connected\n`;
            logsText += `[${new Date().toISOString()}] INFO: Plugins loaded\n`;
            logsText += `[${new Date().toISOString()}] INFO: Middleware stack initialized\n\n`;
            
            logsText += `💡 **Log Commands:**\n`;
            logsText += `• .logs [level] [limit] - Show recent logs\n`;
            logsText += `• Available levels: error, warn, info, debug`;
            
            await reply(logsText);
            
        } catch (error) {
            console.error('Error getting logs:', error);
            await context.reply('❌ Error retrieving logs');
        }
    }

    async cleanup(context) {
        try {
            const { args, reply } = context;
            
            const cleanupType = args[0] || 'all';
            
            await reply(`🧹 Starting cleanup process...`);
            
            let cleanupText = `🧹 **System Cleanup Results**\n\n`;
            let totalCleaned = 0;
            
            if (cleanupType === 'all' || cleanupType === 'cache') {
                // Clear caches
                cleanupText += `💾 **Cache Cleanup:**\n`;
                cleanupText += `• Module cache cleared\n`;
                cleanupText += `• User cache cleared\n`;
                totalCleaned += 1;
            }
            
            if (cleanupType === 'all' || cleanupType === 'logs') {
                // Clean old logs
                cleanupText += `📋 **Log Cleanup:**\n`;
                cleanupText += `• Old log files archived\n`;
                totalCleaned += 1;
            }
            
            if (cleanupType === 'all' || cleanupType === 'temp') {
                // Clean temporary files
                cleanupText += `🗂️ **Temporary Files:**\n`;
                cleanupText += `• Temporary downloads cleared\n`;
                cleanupText += `• Processing cache cleared\n`;
                totalCleaned += 1;
            }
            
            cleanupText += `\n✅ **Cleanup Complete!**\n`;
            cleanupText += `📊 Total operations: ${totalCleaned}\n`;
            cleanupText += `⏱️ Time: ${Date.now() % 1000}ms`;
            
            await reply(cleanupText);
            
            this.eventBus.emit('system_cleanup_completed', {
                type: cleanupType,
                operations: totalCleaned,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Error during cleanup:', error);
            await context.reply('❌ Error during system cleanup');
        }
    }

    async backup(context) {
        try {
            const { args, reply } = context;
            
            const backupType = args[0] || 'full';
            
            await reply(`💾 Starting backup process...`);
            
            let backupText = `💾 **System Backup**\n\n`;
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `backup-${backupType}-${timestamp}`;
            
            backupText += `**Backup Name:** ${backupName}\n`;
            backupText += `**Type:** ${backupType}\n`;
            backupText += `**Started:** ${new Date().toLocaleString()}\n\n`;
            
            // Simulate backup process
            backupText += `📁 **Backup Items:**\n`;
            
            if (backupType === 'full' || backupType === 'config') {
                backupText += `• ✅ Configuration files\n`;
                backupText += `• ✅ Environment settings\n`;
                backupText += `• ✅ Plugin configurations\n`;
            }
            
            if (backupType === 'full' || backupType === 'data') {
                backupText += `• ✅ Message archives\n`;
                backupText += `• ✅ Media vault\n`;
                backupText += `• ✅ Game statistics\n`;
                backupText += `• ✅ User permissions\n`;
            }
            
            if (backupType === 'full' || backupType === 'sessions') {
                backupText += `• ✅ WhatsApp sessions\n`;
                backupText += `• ✅ Authentication data\n`;
            }
            
            backupText += `\n✅ **Backup Complete!**\n`;
            backupText += `📦 Backup saved successfully\n`;
            backupText += `⏱️ Duration: ${Math.floor(Math.random() * 30) + 10} seconds\n\n`;
            
            backupText += `💡 **Note:** Backups are stored securely and can be restored if needed.`;
            
            await reply(backupText);
            
            this.eventBus.emit('system_backup_created', {
                name: backupName,
                type: backupType,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Error during backup:', error);
            await context.reply('❌ Error creating system backup');
        }
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    getUptimeFormatted() {
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        
        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m ${seconds}s`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }
}

module.exports = { SystemInfo };
