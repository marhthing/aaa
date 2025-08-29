/**
 * Ping Plugin - Check bot response time and status
 */

module.exports = {
    name: 'ping',
    description: 'Check bot response time and system status',
    version: '1.0.0',
    command: ['ping', 'pong', 'speed'],
    category: 'general',
    usage: '',
    fromMe: false,
    type: 'whatsapp',
    cooldown: 5,
    
    async execute(bot, message, args) {
        try {
            const startTime = Date.now();
            
            // Send initial message
            const response = await message.reply('🏓 Pinging...');
            
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            
            // Get system information
            const stats = {
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                isConnected: bot.isConnected,
                pluginCount: bot.pluginManager ? bot.pluginManager.getLoadedPlugins().length : 0,
                platform: bot.config.PLATFORM || 'unknown'
            };
            const uptime = module.exports.formatUptime(stats.uptime);
            const memoryUsage = module.exports.formatMemoryUsage(stats.memoryUsage);
            
            // Get database status
            const dbHealth = await module.exports.checkDatabaseHealth(bot);
            
            // Create detailed response
            let pingText = `🏓 *Pong!*\n\n`;
            pingText += `⚡ *Response Time:* ${responseTime}ms\n`;
            pingText += `⏱️ *Uptime:* ${uptime}\n`;
            pingText += `💾 *Memory Usage:* ${memoryUsage}\n`;
            pingText += `🔗 *Connection:* ${stats.isConnected ? '✅ Connected' : '❌ Disconnected'}\n`;
            pingText += `📊 *Database:* ${dbHealth.status}\n`;
            pingText += `🔌 *Plugins:* ${stats.pluginCount} loaded\n`;
            pingText += `🌐 *Platform:* ${stats.platform}\n\n`;
            
            // Performance indicators
            const performance = module.exports.getPerformanceIndicator(responseTime);
            pingText += `📈 *Performance:* ${performance.emoji} ${performance.text}\n\n`;
            
            // Additional stats
            if (bot.cache) {
                const cacheStats = bot.cache.getStats();
                pingText += `🗄️ *Cache:* ${cacheStats.size} items (${cacheStats.hitRate} hit rate)\n`;
            }
            
            if (bot.rateLimit) {
                const rateLimitStats = bot.rateLimit.getStats();
                pingText += `⏰ *Rate Limit:* ${rateLimitStats.globalCommands} active limits\n`;
            }
            
            pingText += `\n🕐 *Timestamp:* ${new Date().toLocaleString()}`;
            
            // Edit the original message with detailed response
            await bot.sock.sendMessage(message.from, {
                text: pingText,
                edit: response.key
            });
            
        } catch (error) {
            await message.reply('❌ Failed to get ping information.');
            throw error;
        }
    },
    
    /**
     * Format uptime in human readable format
     */
    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
        
        return parts.join(' ');
    },
    
    /**
     * Format memory usage
     */
    formatMemoryUsage(memoryUsage) {
        const usedMB = (memoryUsage.rss / 1024 / 1024).toFixed(2);
        const totalMB = (memoryUsage.heapTotal / 1024 / 1024).toFixed(2);
        const percentage = ((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100).toFixed(1);
        
        return `${usedMB}MB (${percentage}% of ${totalMB}MB)`;
    },
    
    /**
     * Check database health
     */
    async checkDatabaseHealth(bot) {
        try {
            const isHealthy = await bot.database.healthCheck();
            
            if (isHealthy) {
                return { status: '✅ Healthy', healthy: true };
            } else {
                return { status: '⚠️ Issues detected', healthy: false };
            }
        } catch (error) {
            return { status: '❌ Disconnected', healthy: false };
        }
    },
    
    /**
     * Get performance indicator based on response time
     */
    getPerformanceIndicator(responseTime) {
        if (responseTime < 100) {
            return { emoji: '🚀', text: 'Excellent' };
        } else if (responseTime < 300) {
            return { emoji: '✅', text: 'Good' };
        } else if (responseTime < 500) {
            return { emoji: '⚠️', text: 'Fair' };
        } else if (responseTime < 1000) {
            return { emoji: '🐌', text: 'Slow' };
        } else {
            return { emoji: '❌', text: 'Poor' };
        }
    }
};
