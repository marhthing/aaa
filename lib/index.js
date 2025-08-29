// Core exports for levanter-style plugin development
const { Client, logger } = require('./client');
const { 
    getPlugin, 
    setPlugin, 
    delPlugin, 
    removePlugin, 
    loadPlugin,
    installExternalPlugin,
    getCommandHandler,
    listPlugins
} = require('./plugins');

const {
    parseGistUrls,
    pluginsList,
    installPlugin,
    formatMessage,
    normalizeJid,
    isAdmin,
    getMessageType,
    getMessageText,
    sleep,
    random,
    formatTime
} = require('./utils');

const config = require('../config');

// Bot function for plugin registration (levanter-style)
function bot(commandConfig, handler) {
    // This will be called by plugins to register commands
    const { registerPluginCommand } = require('./plugins');
    registerPluginCommand(commandConfig, handler, config.WHATSAPP_SESSION_ID || 'default');
}

// Language support (simplified for now)
const lang = {
    plugins: {
        ping: {
            desc: 'Check bot response time',
            ping_sent: '🏓 Pinging...',
            pong: '🏓 Pong! Response time: {}ms'
        },
        plugin: {
            desc: 'Install external plugins',
            usage: 'Usage: .plugin <github-url> or .plugin list',
            invalid: '❌ Invalid plugin URL',
            installed: '✅ Plugin installed: {}',
            not_installed: '❌ No plugins installed'
        },
        remove: {
            desc: 'Remove installed plugins',
            usage: 'Usage: .remove <plugin-name> or .remove all',
            not_found: '❌ Plugin {} not found',
            removed: '✅ Plugin(s) removed successfully'
        },
        common: {
            update: '✅ Settings updated successfully'
        }
    }
};

module.exports = {
    bot,
    Client,
    logger,
    config,
    lang,
    
    // Plugin management
    getPlugin,
    setPlugin,
    delPlugin,
    removePlugin,
    loadPlugin,
    installPlugin,
    
    // Utilities
    parseGistUrls,
    pluginsList,
    formatMessage,
    normalizeJid,
    isAdmin,
    getMessageType,
    getMessageText,
    sleep,
    random,
    formatTime
};