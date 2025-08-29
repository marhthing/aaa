
const config = require('../config');
const { getPlugin, setPlugin, delPlugin, removePlugin, installExternalPlugin, registerPluginCommand, getRegisteredCommands, getCommandHandler, listPlugins } = require('./plugins');
const { parseGistUrls, pluginsList, formatTime } = require('./utils');

// Bot function for plugin registration
function bot(commandConfig, handler) {
    registerPluginCommand(commandConfig, handler, config.WHATSAPP_SESSION_ID || 'default');
}

// Utility functions
function random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Language object (simplified)
const lang = {
    plugins: {
        ping: {
            desc: 'Check bot response time',
            ping_sent: '🏓 Ping...',
            pong: '🏓 Pong! Response time: {}ms'
        },
        plugin: {
            desc: 'Install/manage plugins',
            usage: 'Usage: .plugin <url> or .plugin list',
            not_installed: 'No plugins installed',
            invalid: 'Invalid plugin URL',
            installed: 'Plugin(s) installed: {}'
        },
        remove: {
            desc: 'Remove plugins',
            usage: 'Usage: .remove <plugin_name> or .remove all',
            not_found: 'Plugin {} not found',
            removed: 'Plugin(s) removed successfully'
        }
    }
};

module.exports = {
    bot,
    config,
    getPlugin,
    setPlugin,
    delPlugin,
    removePlugin,
    installExternalPlugin,
    registerPluginCommand,
    getRegisteredCommands,
    getCommandHandler,
    listPlugins,
    parseGistUrls,
    pluginsList,
    formatTime,
    random,
    lang
};
