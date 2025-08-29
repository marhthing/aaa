const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

// In-memory plugin registry
const pluginRegistry = new Map();
const pluginCommands = new Map();

/**
 * Database operations for plugin management
 * Since we don't have a full database yet, using file-based storage
 */
class PluginDB {
    constructor() {
        this.dbPath = path.join(config.SESSION_DIR, 'plugins.json');
    }
    
    async getPlugins(sessionId = 'default') {
        try {
            const data = await fs.readJSON(this.dbPath).catch(() => ({ sessions: {} }));
            return data.sessions[sessionId] || [];
        } catch (error) {
            return [];
        }
    }
    
    async setPlugin(name, url, sessionId = 'default') {
        try {
            const data = await fs.readJSON(this.dbPath).catch(() => ({ sessions: {} }));
            if (!data.sessions[sessionId]) {
                data.sessions[sessionId] = [];
            }
            
            // Remove existing plugin with same name
            data.sessions[sessionId] = data.sessions[sessionId].filter(p => p.name !== name);
            
            // Add new plugin
            data.sessions[sessionId].push({
                name,
                url,
                installedAt: new Date().toISOString()
            });
            
            await fs.writeJSON(this.dbPath, data, { spaces: 2 });
            return true;
        } catch (error) {
            console.error('Error saving plugin:', error);
            return false;
        }
    }
    
    async deletePlugin(name, sessionId = 'default') {
        try {
            const data = await fs.readJSON(this.dbPath).catch(() => ({ sessions: {} }));
            if (!data.sessions[sessionId]) {
                return false;
            }
            
            const initialLength = data.sessions[sessionId].length;
            data.sessions[sessionId] = data.sessions[sessionId].filter(p => p.name !== name);
            
            if (data.sessions[sessionId].length < initialLength) {
                await fs.writeJSON(this.dbPath, data, { spaces: 2 });
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error deleting plugin:', error);
            return false;
        }
    }
}

const pluginDB = new PluginDB();

/**
 * Get plugins for session
 */
async function getPlugin(sessionId, pluginName = null) {
    const plugins = await pluginDB.getPlugins(sessionId);
    
    if (pluginName) {
        return plugins.find(p => p.name === pluginName) || null;
    }
    
    return plugins.length > 0 ? plugins : null;
}

/**
 * Save plugin to database
 */
async function setPlugin(name, url, sessionId) {
    return await pluginDB.setPlugin(name, url, sessionId);
}

/**
 * Delete plugin from database
 */
async function delPlugin(name, sessionId) {
    return await pluginDB.deletePlugin(name, sessionId);
}

/**
 * Remove plugin from memory and file system
 */
function removePlugin(name, sessionId) {
    try {
        // Remove from memory registry
        pluginRegistry.delete(`${sessionId}_${name}`);
        
        // Remove commands associated with this plugin
        for (const [command, plugin] of pluginCommands.entries()) {
            if (plugin.name === name && plugin.sessionId === sessionId) {
                pluginCommands.delete(command);
            }
        }
        
        // Remove plugin file
        const pluginPath = path.join(config.EPLUGIN_DIR, `${sessionId}${name}.js`);
        if (fs.existsSync(pluginPath)) {
            fs.unlinkSync(pluginPath);
        }
        
        return true;
    } catch (error) {
        console.error('Error removing plugin:', error);
        return false;
    }
}

/**
 * Load plugin into memory
 */
function loadPlugin(pluginPath, sessionId) {
    try {
        // Clear require cache for hot reload
        delete require.cache[require.resolve(pluginPath)];
        
        // Load plugin code
        const pluginCode = fs.readFileSync(pluginPath, 'utf8');
        
        // Execute plugin in safe context
        const sandbox = {
            bot: (config, handler) => {
                registerPluginCommand(config, handler, sessionId);
            },
            require,
            console,
            Buffer,
            process: { env: process.env },
            setTimeout,
            setInterval,
            clearTimeout,
            clearInterval
        };
        
        // Execute plugin
        const func = new Function(
            'bot', 'require', 'console', 'Buffer', 'process', 
            'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
            pluginCode
        );
        
        func.call(
            sandbox,
            sandbox.bot,
            require,
            console,
            Buffer,
            sandbox.process,
            setTimeout,
            setInterval,
            clearTimeout,
            clearInterval
        );
        
        return true;
    } catch (error) {
        console.error('Error loading plugin:', error);
        throw error;
    }
}

/**
 * Register plugin command
 */
function registerPluginCommand(commandConfig, handler, sessionId) {
    const { pattern, desc, type } = commandConfig;
    
    // Extract command name from pattern
    let commandName;
    if (typeof pattern === 'string') {
        commandName = pattern.replace(/[^\w]/g, '').split(' ')[0].toLowerCase();
    } else {
        // Handle regex patterns
        commandName = pattern.toString().replace(/[^\w]/g, '').split(' ')[0].toLowerCase();
    }
    
    if (commandName) {
        pluginCommands.set(commandName, {
            name: commandName,
            pattern,
            desc,
            type,
            handler,
            sessionId
        });
    }
}

/**
 * Install plugin from external source
 */
async function installExternalPlugin(pluginCode, pluginName, sessionId) {
    try {
        const pluginPath = path.join(config.EPLUGIN_DIR, `${sessionId}${pluginName}.js`);
        
        // Ensure directory exists
        await fs.ensureDir(config.EPLUGIN_DIR);
        
        // Write plugin file
        await fs.writeFile(pluginPath, pluginCode);
        
        // Load plugin
        loadPlugin(pluginPath, sessionId);
        
        return true;
    } catch (error) {
        console.error('Error installing external plugin:', error);
        throw error;
    }
}

/**
 * Get all registered commands
 */
function getRegisteredCommands() {
    return Array.from(pluginCommands.keys());
}

/**
 * Get plugin command handler
 */
function getCommandHandler(command) {
    return pluginCommands.get(command.toLowerCase());
}

/**
 * List all plugins with their commands
 */
function listPlugins() {
    const pluginList = {};
    
    for (const [command, plugin] of pluginCommands.entries()) {
        if (!pluginList[plugin.sessionId]) {
            pluginList[plugin.sessionId] = {};
        }
        
        if (!pluginList[plugin.sessionId][plugin.name]) {
            pluginList[plugin.sessionId][plugin.name] = {
                commands: [],
                type: plugin.type,
                desc: plugin.desc
            };
        }
        
        pluginList[plugin.sessionId][plugin.name].commands.push(command);
    }
    
    return pluginList;
}

module.exports = {
    getPlugin,
    setPlugin,
    delPlugin,
    removePlugin,
    loadPlugin,
    installExternalPlugin,
    registerPluginCommand,
    getRegisteredCommands,
    getCommandHandler,
    listPlugins,
    pluginDB
};