const fs = require('fs-extra');
const path = require('path');

class PluginLoader {
    constructor() {
        this.loadedModules = new Map();
    }

    async loadPlugin(pluginPath, options = {}) {
        try {
            const pluginName = path.basename(pluginPath);
            
            // Check if plugin directory exists
            if (!await fs.pathExists(pluginPath)) {
                throw new Error(`Plugin directory not found: ${pluginPath}`);
            }
            
            // Load plugin configuration
            const configPath = path.join(pluginPath, 'plugin.json');
            if (!await fs.pathExists(configPath)) {
                throw new Error(`Plugin configuration not found: ${configPath}`);
            }
            
            const config = await fs.readJson(configPath);
            
            // Validate plugin configuration
            this.validatePluginConfig(config);
            
            // Load main plugin module
            const indexPath = path.join(pluginPath, 'index.js');
            if (!await fs.pathExists(indexPath)) {
                throw new Error(`Plugin entry point not found: ${indexPath}`);
            }
            
            // Clear module cache for hot reload
            const absoluteIndexPath = path.resolve(indexPath);
            if (require.cache[absoluteIndexPath]) {
                delete require.cache[absoluteIndexPath];
            }
            
            // Load plugin class
            const PluginClass = require(absoluteIndexPath);
            
            // Create plugin instance
            const pluginInstance = new PluginClass({
                config,
                pluginPath,
                pluginName,
                ...options
            });
            
            // Store loaded module reference
            this.loadedModules.set(pluginName, {
                path: pluginPath,
                configPath,
                indexPath,
                absoluteIndexPath,
                config,
                instance: pluginInstance,
                loadedAt: new Date().toISOString()
            });
            
            return {
                instance: pluginInstance,
                config,
                metadata: {
                    name: pluginName,
                    path: pluginPath,
                    loadedAt: new Date().toISOString()
                }
            };
            
        } catch (error) {
            console.error(`Error loading plugin from ${pluginPath}:`, error);
            throw error;
        }
    }

    async unloadPlugin(pluginName) {
        try {
            const moduleInfo = this.loadedModules.get(pluginName);
            
            if (!moduleInfo) {
                return false;
            }
            
            // Shutdown plugin if it has shutdown method
            if (moduleInfo.instance && typeof moduleInfo.instance.shutdown === 'function') {
                await moduleInfo.instance.shutdown();
            }
            
            // Clear from require cache
            if (require.cache[moduleInfo.absoluteIndexPath]) {
                delete require.cache[moduleInfo.absoluteIndexPath];
            }
            
            // Clear additional module files from cache
            await this.clearPluginCache(moduleInfo.path);
            
            // Remove from loaded modules
            this.loadedModules.delete(pluginName);
            
            return true;
            
        } catch (error) {
            console.error(`Error unloading plugin ${pluginName}:`, error);
            return false;
        }
    }

    async clearPluginCache(pluginPath) {
        try {
            const absolutePluginPath = path.resolve(pluginPath);
            
            // Find all modules that belong to this plugin
            const modulesToClear = Object.keys(require.cache).filter(modulePath => {
                return modulePath.startsWith(absolutePluginPath);
            });
            
            // Clear them from cache
            for (const modulePath of modulesToClear) {
                delete require.cache[modulePath];
            }
            
        } catch (error) {
            console.error('Error clearing plugin cache:', error);
        }
    }

    validatePluginConfig(config) {
        if (!config || typeof config !== 'object') {
            throw new Error('Invalid plugin configuration: must be an object');
        }
        
        if (!config.name || typeof config.name !== 'string') {
            throw new Error('Invalid plugin configuration: name is required and must be a string');
        }
        
        if (!config.version || typeof config.version !== 'string') {
            throw new Error('Invalid plugin configuration: version is required and must be a string');
        }
        
        if (config.dependencies && !Array.isArray(config.dependencies)) {
            throw new Error('Invalid plugin configuration: dependencies must be an array');
        }
        
        if (config.commands && !Array.isArray(config.commands)) {
            throw new Error('Invalid plugin configuration: commands must be an array');
        }
        
        return true;
    }

    getLoadedPlugins() {
        return Array.from(this.loadedModules.entries()).map(([name, info]) => ({
            name,
            config: info.config,
            loadedAt: info.loadedAt,
            path: info.path
        }));
    }

    isPluginLoaded(pluginName) {
        return this.loadedModules.has(pluginName);
    }

    getPluginInfo(pluginName) {
        return this.loadedModules.get(pluginName) || null;
    }

    async reloadPlugin(pluginName) {
        const moduleInfo = this.loadedModules.get(pluginName);
        
        if (!moduleInfo) {
            throw new Error(`Plugin ${pluginName} is not loaded`);
        }
        
        const pluginPath = moduleInfo.path;
        const options = moduleInfo.instance.options || {};
        
        // Unload current instance
        await this.unloadPlugin(pluginName);
        
        // Load new instance
        return await this.loadPlugin(pluginPath, options);
    }

    clearAllPlugins() {
        const pluginNames = Array.from(this.loadedModules.keys());
        
        for (const pluginName of pluginNames) {
            this.unloadPlugin(pluginName).catch(error => {
                console.error(`Error unloading plugin ${pluginName}:`, error);
            });
        }
        
        this.loadedModules.clear();
    }
}

// Export singleton instance
module.exports = new PluginLoader();
