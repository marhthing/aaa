
module.exports = {
    name: 'logs',
    description: 'View bot message logs and activity',
    version: '1.0.0',
    command: ['logs', 'history', 'messages'],
    category: 'admin',
    usage: '<type> [limit]',
    fromMe: true,
    sudo: true,
    type: 'whatsapp',
    cooldown: 5,
    
    async function(message, match, bot) {
        try {
            const args = match ? match.trim().split(' ') : [];
            const type = args[0]?.toLowerCase() || 'recent';
            const limit = parseInt(args[1]) || 20;
            
            switch (type) {
                case 'messages':
                case 'msg':
                    await this.showMessageLogs(message, bot, limit);
                    break;
                    
                case 'media':
                    await this.showMediaLogs(message, bot, limit);
                    break;
                    
                case 'commands':
                case 'cmd':
                    await this.showCommandLogs(message, bot, limit);
                    break;
                    
                case 'errors':
                    await this.showErrorLogs(message, bot, limit);
                    break;
                    
                case 'stats':
                    await this.showLogStats(message, bot);
                    break;
                    
                case 'clear':
                    await this.clearLogs(message, bot, args[1]);
                    break;
                    
                default:
                    await this.showRecentLogs(message, bot, limit);
                    break;
            }
            
        } catch (error) {
            console.error('Logs plugin error:', error);
            await message.reply(`❌ Error retrieving logs: ${error.message}`);
        }
    },
    
    /**
     * Show recent message logs
     */
    async showRecentLogs(message, bot, limit) {
        const logs = await bot.database.getModel('Log').findAll({
            where: { category: 'message' },
            order: [['createdAt', 'DESC']],
            limit: Math.min(limit, 50)
        });
        
        if (logs.length === 0) {
            await message.reply('📭 No message logs found.');
            return;
        }
        
        let response = `📊 *Recent Message Logs* (${logs.length})\n\n`;
        
        logs.forEach((log, index) => {
            const meta = log.metadata || {};
            const direction = meta.direction === 'outgoing' ? '📤' : '📥';
            const type = meta.messageType || 'text';
            const content = meta.content ? meta.content.substring(0, 50) : '[no content]';
            const time = new Date(log.createdAt).toLocaleTimeString();
            
            response += `${index + 1}. ${direction} ${type.toUpperCase()}\n`;
            response += `   From: ${meta.participant || 'unknown'}\n`;
            response += `   Content: ${content}${content.length > 50 ? '...' : ''}\n`;
            response += `   Time: ${time}\n\n`;
        });
        
        response += `\n💡 Use: \`${bot.config.PREFIX}logs messages\` for detailed view`;
        
        await message.reply(response);
    },
    
    /**
     * Show detailed message logs
     */
    async showMessageLogs(message, bot, limit) {
        const logs = await bot.database.getModel('Log').findAll({
            where: { category: 'message' },
            order: [['createdAt', 'DESC']],
            limit: Math.min(limit, 30)
        });
        
        if (logs.length === 0) {
            await message.reply('📭 No message logs found.');
            return;
        }
        
        let response = `💬 *Message History* (${logs.length} recent)\n\n`;
        
        logs.forEach((log, index) => {
            const meta = log.metadata || {};
            const direction = meta.direction === 'outgoing' ? '📤 OUT' : '📥 IN';
            const isGroup = meta.isGroup ? '👥' : '👤';
            const time = new Date(log.createdAt).toLocaleString();
            
            response += `${index + 1}. ${direction} ${isGroup} ${meta.messageType || 'text'}\n`;
            response += `   Chat: ${meta.remoteJid || 'unknown'}\n`;
            response += `   User: ${meta.participant || 'unknown'}\n`;
            if (meta.content) {
                response += `   Text: ${meta.content.substring(0, 100)}${meta.content.length > 100 ? '...' : ''}\n`;
            }
            response += `   Time: ${time}\n\n`;
        });
        
        await message.reply(response);
    },
    
    /**
     * Show media logs
     */
    async showMediaLogs(message, bot, limit) {
        const logs = await bot.database.getModel('Log').findAll({
            where: { category: 'media' },
            order: [['createdAt', 'DESC']],
            limit: Math.min(limit, 20)
        });
        
        if (logs.length === 0) {
            await message.reply('📭 No media logs found.');
            return;
        }
        
        let response = `🎭 *Media Activity* (${logs.length} recent)\n\n`;
        
        logs.forEach((log, index) => {
            const meta = log.metadata || {};
            const size = meta.fileSize ? `${(meta.fileSize / 1024 / 1024).toFixed(2)}MB` : 'Unknown';
            const time = new Date(log.createdAt).toLocaleString();
            
            response += `${index + 1}. 📎 ${meta.mediaType?.toUpperCase() || 'MEDIA'}\n`;
            response += `   From: ${meta.from || 'unknown'}\n`;
            response += `   Size: ${size}\n`;
            response += `   Type: ${meta.mimeType || 'unknown'}\n`;
            response += `   Time: ${time}\n\n`;
        });
        
        await message.reply(response);
    },
    
    /**
     * Show command logs
     */
    async showCommandLogs(message, bot, limit) {
        const logs = await bot.database.getModel('Log').findAll({
            where: { 
                category: 'command',
                command: { [bot.database.sequelize.Op.ne]: null }
            },
            order: [['createdAt', 'DESC']],
            limit: Math.min(limit, 30)
        });
        
        if (logs.length === 0) {
            await message.reply('📭 No command logs found.');
            return;
        }
        
        let response = `⚡ *Command History* (${logs.length} recent)\n\n`;
        
        logs.forEach((log, index) => {
            const time = new Date(log.createdAt).toLocaleString();
            
            response += `${index + 1}. 🔧 ${log.command}\n`;
            response += `   User: ${log.metadata?.user || 'unknown'}\n`;
            response += `   Status: ${log.level === 'error' ? '❌ Failed' : '✅ Success'}\n`;
            response += `   Time: ${time}\n\n`;
        });
        
        await message.reply(response);
    },
    
    /**
     * Show log statistics
     */
    async showLogStats(message, bot) {
        const stats = await bot.database.getModel('Log').findAll({
            attributes: [
                'category',
                [bot.database.sequelize.fn('COUNT', '*'), 'count']
            ],
            group: ['category'],
            raw: true
        });
        
        const messageStats = await bot.database.getModel('Log').findAll({
            where: { category: 'message' },
            attributes: [
                [bot.database.sequelize.json('metadata.direction'), 'direction'],
                [bot.database.sequelize.fn('COUNT', '*'), 'count']
            ],
            group: [bot.database.sequelize.json('metadata.direction')],
            raw: true
        });
        
        let response = `📊 *Log Statistics*\n\n`;
        
        response += `🗂️ *By Category:*\n`;
        stats.forEach(stat => {
            response += `• ${stat.category}: ${stat.count}\n`;
        });
        
        response += `\n💬 *Messages:*\n`;
        messageStats.forEach(stat => {
            const direction = stat.direction === 'incoming' ? 'Received' : 'Sent';
            response += `• ${direction}: ${stat.count}\n`;
        });
        
        response += `\n📅 *Database Info:*\n`;
        response += `• Total Logs: ${stats.reduce((sum, s) => sum + parseInt(s.count), 0)}\n`;
        response += `• Storage: SQLite/PostgreSQL\n`;
        
        await message.reply(response);
    },
    
    /**
     * Clear logs
     */
    async clearLogs(message, bot, type) {
        if (!type) {
            await message.reply('❓ Specify log type to clear: `messages`, `media`, `commands`, `errors`, or `all`');
            return;
        }
        
        let whereClause = {};
        
        switch (type.toLowerCase()) {
            case 'messages':
                whereClause = { category: 'message' };
                break;
            case 'media':
                whereClause = { category: 'media' };
                break;
            case 'commands':
                whereClause = { category: 'command' };
                break;
            case 'errors':
                whereClause = { level: 'error' };
                break;
            case 'all':
                whereClause = {};
                break;
            default:
                await message.reply('❌ Invalid log type. Use: messages, media, commands, errors, or all');
                return;
        }
        
        const deleted = await bot.database.getModel('Log').destroy({
            where: whereClause
        });
        
        await message.reply(`🗑️ Cleared ${deleted} log entries (${type})`);
    }
};
