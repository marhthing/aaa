const fs = require('fs-extra');
const path = require('path');

class PluginDiscovery {
    constructor(dependencies = {}) {
        this.pluginsPath = path.join(process.cwd(), 'src', 'plugins');
        this.registryPath = path.join(this.pluginsPath, '.registry.json');
        this.plugins = new Map(); // pluginName -> plugin instance
        this.commands = new Map(); // commandName -> plugin instance
        this.isInitialized = false;
        this.loadedPlugins = new Set();
        this.dependencies = dependencies;
    }

    async initialize() {
        try {
            console.log('🔧 Initializing plugin discovery...');

            // Ensure plugins directory exists
            await fs.ensureDir(this.pluginsPath);

            // Load or create registry
            await this.loadRegistry();

            // Discover and load all plugins
            await this.discoverPlugins();

            this.isInitialized = true;
            console.log(`✅ Plugin discovery initialized with ${this.plugins.size} plugins`);

        } catch (error) {
            console.error('❌ Failed to initialize plugin discovery:', error);
            throw error;
        }
    }

    async loadRegistry() {
        try {
            if (await fs.pathExists(this.registryPath)) {
                const registry = await fs.readJson(this.registryPath);
                console.log(`📁 Loaded plugin registry with ${registry.plugins?.length || 0} entries`);
            } else {
                // Create empty registry
                await this.saveRegistry([]);
            }
        } catch (error) {
            console.error('⚠️ Failed to load plugin registry, creating new one:', error);
            await this.saveRegistry([]);
        }
    }

    async saveRegistry(plugins) {
        try {
            const registry = {
                version: '1.0.0',
                lastUpdated: new Date().toISOString(),
                plugins: plugins || Array.from(this.plugins.values()).map(plugin => ({
                    name: plugin.manifest.name,
                    version: plugin.manifest.version,
                    enabled: plugin.enabled,
                    loadedAt: plugin.loadedAt,
                    commands: plugin.manifest.commands?.map(cmd => cmd.name) || []
                }))
            };

            await fs.writeJson(this.registryPath, registry, { spaces: 2 });
        } catch (error) {
            console.error('❌ Failed to save plugin registry:', error);
        }
    }

    async discoverPlugins() {
        try {
            const pluginDirs = await fs.readdir(this.pluginsPath);
            
            for (const dirName of pluginDirs) {
                // Skip hidden files and registry
                if (dirName.startsWith('.') || dirName.startsWith('_')) {
                    continue;
                }

                const pluginPath = path.join(this.pluginsPath, dirName);
                const stat = await fs.stat(pluginPath);

                if (stat.isDirectory()) {
                    await this.loadPlugin(dirName);
                }
            }

            // Save updated registry
            await this.saveRegistry();

        } catch (error) {
            console.error('❌ Error during plugin discovery:', error);
        }
    }

    async loadPlugin(pluginName) {
        try {
            const pluginPath = path.join(this.pluginsPath, pluginName);
            const manifestPath = path.join(pluginPath, 'plugin.json');

            // Check if manifest exists
            if (!await fs.pathExists(manifestPath)) {
                console.warn(`⚠️ Plugin '${pluginName}' missing manifest file`);
                return false;
            }

            // Load manifest
            const manifest = await fs.readJson(manifestPath);
            
            // Validate manifest
            if (!this.validateManifest(manifest)) {
                console.error(`❌ Invalid manifest for plugin '${pluginName}'`);
                return false;
            }

            // Check if already loaded
            if (this.plugins.has(pluginName)) {
                console.log(`🔄 Reloading plugin: ${pluginName}`);
                await this.unloadPlugin(pluginName);
            }

            // Load plugin main file
            const mainPath = path.join(pluginPath, manifest.main || 'index.js');
            
            if (!await fs.pathExists(mainPath)) {
                console.error(`❌ Plugin '${pluginName}' main file not found: ${manifest.main || 'index.js'}`);
                return false;
            }

            // Clear require cache for hot reload
            delete require.cache[require.resolve(mainPath)];

            // Load plugin class
            const PluginClass = require(mainPath);
            
            // Prepare plugin options with all necessary dependencies
            const pluginOptions = {
                ...this.dependencies,
                config: manifest,
                pluginPath: pluginPath,
                pluginName: pluginName,
                manifest: manifest
            };
            
            const pluginInstance = new PluginClass(pluginOptions);

            // Initialize plugin
            if (pluginInstance.initialize) {
                await pluginInstance.initialize();
            }

            // Create plugin wrapper
            const plugin = {
                name: pluginName,
                instance: pluginInstance,
                manifest: manifest,
                path: pluginPath,
                enabled: true,
                loadedAt: new Date().toISOString()
            };

            // Store plugin
            this.plugins.set(pluginName, plugin);
            this.loadedPlugins.add(pluginName);

            // Register commands
            if (manifest.commands) {
                for (const commandDef of manifest.commands) {
                    this.commands.set(commandDef.name, plugin);
                    console.log(`📝 Registered command: ${commandDef.name} -> ${pluginName}`);
                }
            }

            console.log(`✅ Loaded plugin: ${pluginName} v${manifest.version}`);
            return true;

        } catch (error) {
            console.error(`❌ Failed to load plugin '${pluginName}':`, error);
            return false;
        }
    }

    async unloadPlugin(pluginName) {
        try {
            const plugin = this.plugins.get(pluginName);
            
            if (!plugin) {
                return false;
            }

            // Unregister commands
            if (plugin.manifest.commands) {
                for (const commandDef of plugin.manifest.commands) {
                    this.commands.delete(commandDef.name);
                    console.log(`🗑️ Unregistered command: ${commandDef.name}`);
                }
            }

            // Shutdown plugin
            if (plugin.instance.shutdown) {
                await plugin.instance.shutdown();
            }

            // Remove from maps
            this.plugins.delete(pluginName);
            this.loadedPlugins.delete(pluginName);

            console.log(`🗑️ Unloaded plugin: ${pluginName}`);
            return true;

        } catch (error) {
            console.error(`❌ Failed to unload plugin '${pluginName}':`, error);
            return false;
        }
    }

    async reloadPlugin(pluginName) {
        try {
            console.log(`🔄 Reloading plugin: ${pluginName}`);
            
            await this.unloadPlugin(pluginName);
            const success = await this.loadPlugin(pluginName);
            
            if (success) {
                await this.saveRegistry();
            }
            
            return success;

        } catch (error) {
            console.error(`❌ Failed to reload plugin '${pluginName}':`, error);
            return false;
        }
    }

    validateManifest(manifest) {
        const required = ['name', 'version', 'description'];
        
        for (const field of required) {
            if (!manifest[field]) {
                console.error(`❌ Manifest missing required field: ${field}`);
                return false;
            }
        }

        // Validate commands if present
        if (manifest.commands) {
            if (!Array.isArray(manifest.commands)) {
                console.error(`❌ Manifest commands must be an array`);
                return false;
            }

            for (const cmd of manifest.commands) {
                if (!cmd.name || !cmd.description) {
                    console.error(`❌ Command missing name or description`);
                    return false;
                }
            }
        }

        return true;
    }

    async executeCommand(commandName, message, command) {
        const plugin = this.commands.get(commandName);
        
        if (!plugin) {
            throw new Error(`Command '${commandName}' not found`);
        }

        if (!plugin.enabled) {
            throw new Error(`Plugin '${plugin.name}' is disabled`);
        }

        // Check if plugin has command handler
        if (!plugin.instance.executeCommand) {
            throw new Error(`Plugin '${plugin.name}' has no command handler`);
        }

        try {
            // Create context object for the plugin
            const context = {
                message: message,
                args: command.args,
                command: command,
                reply: async (text, options = {}) => {
                    // Send message to the chat
                    const chatId = message.key.remoteJid;
                    const { BotClient } = require('./BotClient');
                    const botClient = this.dependencies.botClient;
                    
                    if (botClient && botClient.sendMessage) {
                        return await botClient.sendMessage(chatId, text, options);
                    } else {
                        throw new Error('Bot client not available for reply');
                    }
                }
            };
            
            return await plugin.instance.executeCommand(commandName, context);
        } catch (error) {
            console.error(`❌ Error executing command '${commandName}' in plugin '${plugin.name}':`, error);
            throw error;
        }
    }

    getPlugin(pluginName) {
        const plugin = this.plugins.get(pluginName);
        return plugin ? plugin.instance : null;
    }

    getPluginInfo(pluginName) {
        return this.plugins.get(pluginName) || null;
    }

    getAllPlugins() {
        return Array.from(this.plugins.values()).map(plugin => ({
            name: plugin.name,
            version: plugin.manifest.version,
            description: plugin.manifest.description,
            enabled: plugin.enabled,
            loadedAt: plugin.loadedAt,
            commands: plugin.manifest.commands?.map(cmd => cmd.name) || []
        }));
    }

    getAllCommands() {
        const commands = [];
        
        for (const plugin of this.plugins.values()) {
            if (plugin.manifest.commands) {
                for (const cmd of plugin.manifest.commands) {
                    commands.push({
                        name: cmd.name,
                        description: cmd.description,
                        usage: cmd.usage || null,
                        plugin: plugin.name,
                        ownerOnly: cmd.ownerOnly || false,
                        allowInGames: cmd.allowInGames || false
                    });
                }
            }
        }

        return commands.sort((a, b) => a.name.localeCompare(b.name));
    }

    isCommandAvailable(commandName) {
        return this.commands.has(commandName);
    }

    getCommandInfo(commandName) {
        const plugin = this.commands.get(commandName);
        
        if (!plugin) {
            return null;
        }

        const commandDef = plugin.manifest.commands?.find(cmd => cmd.name === commandName);
        
        return {
            name: commandName,
            description: commandDef?.description || 'No description',
            usage: commandDef?.usage || null,
            plugin: plugin.name,
            ownerOnly: commandDef?.ownerOnly || false,
            allowInGames: commandDef?.allowInGames || false
        };
    }

    async enablePlugin(pluginName) {
        const plugin = this.plugins.get(pluginName);
        
        if (plugin) {
            plugin.enabled = true;
            await this.saveRegistry();
            console.log(`✅ Enabled plugin: ${pluginName}`);
            return true;
        }
        
        return false;
    }

    async disablePlugin(pluginName) {
        const plugin = this.plugins.get(pluginName);
        
        if (plugin) {
            plugin.enabled = false;
            await this.saveRegistry();
            console.log(`❌ Disabled plugin: ${pluginName}`);
            return true;
        }
        
        return false;
    }

    getDiscoveryStats() {
        return {
            totalPlugins: this.plugins.size,
            enabledPlugins: Array.from(this.plugins.values()).filter(p => p.enabled).length,
            totalCommands: this.commands.size,
            loadedPlugins: Array.from(this.loadedPlugins),
            pluginsByStatus: {
                enabled: Array.from(this.plugins.values()).filter(p => p.enabled).map(p => p.name),
                disabled: Array.from(this.plugins.values()).filter(p => !p.enabled).map(p => p.name)
            }
        };
    }

    async shutdown() {
        try {
            console.log('🛑 Shutting down plugin discovery...');

            // Shutdown all plugins
            for (const [pluginName, plugin] of this.plugins) {
                try {
                    if (plugin.instance.shutdown) {
                        await plugin.instance.shutdown();
                    }
                } catch (error) {
                    console.error(`❌ Error shutting down plugin '${pluginName}':`, error);
                }
            }

            // Save final registry
            await this.saveRegistry();

            // Clear maps
            this.plugins.clear();
            this.commands.clear();
            this.loadedPlugins.clear();

            console.log('✅ Plugin discovery shutdown complete');

        } catch (error) {
            console.error('❌ Error during plugin discovery shutdown:', error);
        }
    }
}

module.exports = PluginDiscovery;
