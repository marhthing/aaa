/**
 * MatDev Plugin Class
 * Dynamic plugin loading and management system
 */

const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');
const { BotError } = require('./BotError');

class Plugin {
    constructor(bot) {
        this.bot = bot;
        this.plugins = new Map();
        this.loadedFiles = new Map();
        this.hotReloadEnabled = process.env.NODE_ENV !== 'production';
        this.pluginDir = path.join(process.cwd(), this.bot.config.PLUGIN_DIR);
        
        // Ensure plugin directory exists
        fs.ensureDirSync(this.pluginDir);
        
        logger.info('🔌 Plugin system initialized');
    }
    
    /**
     * Load all plugins from the plugins directory
     */
    async loadAll() {
        try {
            logger.info('📦 Loading plugins...');
            
            const files = await this.getPluginFiles();
            const loadResults = [];
            
            for (const file of files) {
                try {
                    const result = await this.loadPlugin(file);
                    loadResults.push(result);
                } catch (error) {
                    logger.error(`Failed to load plugin ${file}:`, error);
                    loadResults.push({ file, success: false, error: error.message });
                }
            }
            
            const successful = loadResults.filter(r => r.success).length;
            const failed = loadResults.filter(r => !r.success).length;
            
            logger.info(`✅ Plugin loading completed: ${successful} successful, ${failed} failed`);
            
            return loadResults;
        } catch (error) {
            logger.error('Failed to load plugins:', error);
            throw new BotError('Plugin loading failed', 'PLUGIN_LOAD_ERROR');
        }
    }
    
    /**
     * Get all plugin files recursively
     */
    async getPluginFiles() {
        const files = [];
        
        const scanDirectory = async (dir) => {
            const items = await fs.readdir(dir, { withFileTypes: true });
            
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                
                if (item.isDirectory()) {
                    await scanDirectory(fullPath);
                } else if (item.isFile() && item.name.endsWith('.js')) {
                    files.push(fullPath);
                }
            }
        };
        
        await scanDirectory(this.pluginDir);
        return files;
    }
    
    /**
     * Load a single plugin
     */
    async loadPlugin(filePath) {
        try {
            const relativePath = path.relative(process.cwd(), filePath);
            const pluginName = this.getPluginName(filePath);
            
            // Clear require cache for hot reload
            if (this.hotReloadEnabled && require.cache[filePath]) {
                delete require.cache[filePath];
            }
            
            // Load plugin module
            const pluginModule = require(filePath);
            
            // Validate plugin structure
            this.validatePlugin(pluginModule, pluginName);
            
            // Create plugin metadata
            const plugin = {
                name: pluginName,
                filePath,
                relativePath,
                module: pluginModule,
                metadata: {
                    name: pluginModule.name || pluginName,
                    description: pluginModule.description || 'No description',
                    version: pluginModule.version || '1.0.0',
                    category: pluginModule.category || 'general',
                    commands: Array.isArray(pluginModule.command) ? pluginModule.command : [pluginModule.command],
                    aliases: pluginModule.aliases || [],
                    usage: pluginModule.usage || '',
                    fromMe: pluginModule.fromMe || false,
                    type: pluginModule.type || 'whatsapp',
                    cooldown: pluginModule.cooldown || 0,
                    adminOnly: pluginModule.adminOnly || false,
                    groupOnly: pluginModule.groupOnly || false,
                    privateOnly: pluginModule.privateOnly || false,
                    sudoOnly: pluginModule.sudoOnly || false
                },
                enabled: true,
                loadedAt: new Date(),
                stats: {
                    executions: 0,
                    errors: 0,
                    lastUsed: null
                }
            };
            
            // Register commands
            const executeFunction = pluginModule.function || pluginModule.execute;
            if (pluginModule.command && executeFunction) {
                await this.registerPluginCommands(plugin);
            }
            
            // Store plugin
            this.plugins.set(pluginName, plugin);
            this.loadedFiles.set(filePath, pluginName);
            
            logger.debug(`🔌 Loaded plugin: ${pluginName} (${plugin.metadata.commands.join(', ')})`);
            
            return {
                file: relativePath,
                name: pluginName,
                success: true,
                commands: plugin.metadata.commands
            };
            
        } catch (error) {
            logger.error(`Failed to load plugin ${filePath}:`, error);
            throw new BotError(`Plugin load failed: ${error.message}`, 'PLUGIN_LOAD_ERROR');
        }
    }
    
    /**
     * Validate plugin structure
     */
    validatePlugin(pluginModule, pluginName) {
        if (!pluginModule.command) {
            throw new Error(`Plugin ${pluginName} missing 'command' property`);
        }
        
        // Check for either 'function' or 'execute' property
        const executeFunction = pluginModule.function || pluginModule.execute;
        if (!executeFunction || typeof executeFunction !== 'function') {
            throw new Error(`Plugin ${pluginName} missing or invalid 'function' or 'execute' property`);
        }
        
        // Validate command names
        const commands = Array.isArray(pluginModule.command) ? pluginModule.command : [pluginModule.command];
        for (const cmd of commands) {
            if (typeof cmd !== 'string' || cmd.length === 0) {
                throw new Error(`Plugin ${pluginName} has invalid command: ${cmd}`);
            }
        }
    }
    
    /**
     * Register plugin commands with the command system
     */
    async registerPluginCommands(plugin) {
        try {
            const commandData = {
                command: plugin.metadata.commands,
                aliases: plugin.metadata.aliases,
                category: plugin.metadata.category,
                description: plugin.metadata.description,
                usage: plugin.metadata.usage,
                fromMe: plugin.metadata.fromMe,
                type: plugin.metadata.type,
                cooldown: plugin.metadata.cooldown,
                adminOnly: plugin.metadata.adminOnly,
                groupOnly: plugin.metadata.groupOnly,
                privateOnly: plugin.metadata.privateOnly,
                sudoOnly: plugin.metadata.sudoOnly,
                plugin: plugin.name,
                execute: async (bot, message, args) => {
                    try {
                        // Update plugin stats
                        plugin.stats.executions++;
                        plugin.stats.lastUsed = new Date();
                        
                        // Execute plugin function (support both 'function' and 'execute' properties)
                        const executeFunction = plugin.module.function || plugin.module.execute;
                        await executeFunction(bot, message, args);
                        
                    } catch (error) {
                        plugin.stats.errors++;
                        logger.error(`Plugin ${plugin.name} execution error:`, error);
                        throw error;
                    }
                }
            };
            
            this.bot.commandManager.register(commandData);
            
        } catch (error) {
            logger.error(`Failed to register commands for plugin ${plugin.name}:`, error);
            throw error;
        }
    }
    
    /**
     * Unload a plugin
     */
    unloadPlugin(pluginName) {
        try {
            const plugin = this.plugins.get(pluginName);
            if (!plugin) {
                return false;
            }
            
            // Unregister commands
            for (const command of plugin.metadata.commands) {
                this.bot.commandManager.unregister(command);
            }
            
            // Clear require cache
            if (require.cache[plugin.filePath]) {
                delete require.cache[plugin.filePath];
            }
            
            // Remove from maps
            this.plugins.delete(pluginName);
            this.loadedFiles.delete(plugin.filePath);
            
            logger.debug(`🔌 Unloaded plugin: ${pluginName}`);
            return true;
            
        } catch (error) {
            logger.error(`Failed to unload plugin ${pluginName}:`, error);
            return false;
        }
    }
    
    /**
     * Reload a plugin
     */
    async reloadPlugin(pluginName) {
        try {
            const plugin = this.plugins.get(pluginName);
            if (!plugin) {
                throw new Error(`Plugin ${pluginName} not found`);
            }
            
            const filePath = plugin.filePath;
            
            // Unload current version
            this.unloadPlugin(pluginName);
            
            // Load new version
            const result = await this.loadPlugin(filePath);
            
            logger.info(`🔄 Reloaded plugin: ${pluginName}`);
            return result;
            
        } catch (error) {
            logger.error(`Failed to reload plugin ${pluginName}:`, error);
            throw new BotError(`Plugin reload failed: ${error.message}`, 'PLUGIN_RELOAD_ERROR');
        }
    }
    
    /**
     * Enable/disable a plugin
     */
    togglePlugin(pluginName, enabled) {
        const plugin = this.plugins.get(pluginName);
        if (!plugin) {
            return false;
        }
        
        plugin.enabled = enabled;
        
        if (enabled) {
            // Re-register commands
            this.registerPluginCommands(plugin);
        } else {
            // Unregister commands
            for (const command of plugin.metadata.commands) {
                this.bot.commandManager.unregister(command);
            }
        }
        
        logger.info(`🔌 Plugin ${pluginName} ${enabled ? 'enabled' : 'disabled'}`);
        return true;
    }
    
    /**
     * Get plugin by name
     */
    getPlugin(pluginName) {
        return this.plugins.get(pluginName);
    }
    
    /**
     * Get all plugins
     */
    getAll() {
        return Array.from(this.plugins.values());
    }
    
    /**
     * Get plugin list with metadata
     */
    getPluginList() {
        return this.getAll().map(plugin => ({
            name: plugin.name,
            metadata: plugin.metadata,
            enabled: plugin.enabled,
            stats: plugin.stats,
            loadedAt: plugin.loadedAt,
            relativePath: plugin.relativePath
        }));
    }
    
    /**
     * Get plugins by category
     */
    getByCategory(category) {
        return this.getAll().filter(plugin => plugin.metadata.category === category);
    }
    
    /**
     * Get plugin count
     */
    getPluginCount() {
        return this.plugins.size;
    }
    
    /**
     * Get plugin name from file path
     */
    getPluginName(filePath) {
        const relativePath = path.relative(this.pluginDir, filePath);
        return relativePath.replace(/\\/g, '/').replace(/\.js$/, '');
    }
    
    /**
     * Watch for plugin file changes (development only)
     */
    enableHotReload() {
        if (!this.hotReloadEnabled) {
            return;
        }
        
        try {
            const chokidar = require('chokidar');
            
            const watcher = chokidar.watch(this.pluginDir, {
                ignored: /(^|[\/\\])\../,
                persistent: true
            });
            
            watcher.on('change', async (filePath) => {
                try {
                    const pluginName = this.loadedFiles.get(filePath);
                    if (pluginName) {
                        await this.reloadPlugin(pluginName);
                        logger.info(`🔥 Hot reloaded plugin: ${pluginName}`);
                    }
                } catch (error) {
                    logger.error('Hot reload failed:', error);
                }
            });
            
            logger.info('🔥 Plugin hot reload enabled');
            
        } catch (error) {
            logger.warn('Hot reload not available:', error.message);
        }
    }
    
    /**
     * Get plugin statistics
     */
    getStats() {
        const plugins = this.getAll();
        const categories = {};
        let totalExecutions = 0;
        let totalErrors = 0;
        
        for (const plugin of plugins) {
            const category = plugin.metadata.category;
            if (!categories[category]) {
                categories[category] = 0;
            }
            categories[category]++;
            
            totalExecutions += plugin.stats.executions;
            totalErrors += plugin.stats.errors;
        }
        
        return {
            totalPlugins: plugins.length,
            enabledPlugins: plugins.filter(p => p.enabled).length,
            disabledPlugins: plugins.filter(p => !p.enabled).length,
            categories,
            totalExecutions,
            totalErrors,
            errorRate: totalExecutions > 0 ? (totalErrors / totalExecutions * 100).toFixed(2) : 0
        };
    }
}

module.exports = Plugin;
