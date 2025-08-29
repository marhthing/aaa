const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs-extra');

class HotReloader {
    constructor(botClient) {
        this.botClient = botClient;
        this.watchers = new Map();
        this.pluginsPath = path.join(process.cwd(), 'src', 'plugins');
        this.isRunning = false;
        this.reloadQueue = [];
        this.processing = false;
        this.cooldownPeriod = 1000; // 1 second cooldown between reloads
        this.lastReload = new Map(); // plugin -> timestamp
    }

    async initialize() {
        try {
            console.log('🔧 Initializing hot reloader...');

            if (process.env.AUTO_RELOAD_PLUGINS !== 'true') {
                console.log('ℹ️ Hot reload disabled by configuration');
                return;
            }

            // Start watching plugins directory
            await this.startWatching();

            // Start processing reload queue
            this.startQueueProcessor();

            this.isRunning = true;
            console.log('✅ Hot reloader initialized and watching for changes');

        } catch (error) {
            console.error('❌ Failed to initialize hot reloader:', error);
            throw error;
        }
    }

    async startWatching() {
        // Watch for plugin file changes
        const pluginWatcher = chokidar.watch(this.pluginsPath, {
            ignored: [
                '**/node_modules/**',
                '**/.git/**',
                '**/.*',
                '**/*.log',
                '**/*.tmp'
            ],
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 500,
                pollInterval: 100
            }
        });

        pluginWatcher.on('change', (filePath) => {
            this.handleFileChange('change', filePath);
        });

        pluginWatcher.on('add', (filePath) => {
            this.handleFileChange('add', filePath);
        });

        pluginWatcher.on('unlink', (filePath) => {
            this.handleFileChange('delete', filePath);
        });

        pluginWatcher.on('addDir', (dirPath) => {
            this.handleDirectoryChange('add', dirPath);
        });

        pluginWatcher.on('unlinkDir', (dirPath) => {
            this.handleDirectoryChange('delete', dirPath);
        });

        pluginWatcher.on('error', (error) => {
            console.error('❌ Plugin watcher error:', error);
        });

        this.watchers.set('plugins', pluginWatcher);

        console.log(`👀 Watching plugins directory: ${this.pluginsPath}`);
    }

    handleFileChange(eventType, filePath) {
        const relativePath = path.relative(this.pluginsPath, filePath);
        const pluginName = this.extractPluginName(relativePath);

        if (!pluginName) {
            return; // Not a plugin file
        }

        console.log(`📝 File ${eventType}: ${relativePath}`);

        // Add to reload queue
        this.queueReload({
            type: 'file',
            event: eventType,
            pluginName: pluginName,
            filePath: filePath,
            relativePath: relativePath,
            timestamp: Date.now()
        });
    }

    handleDirectoryChange(eventType, dirPath) {
        const relativePath = path.relative(this.pluginsPath, dirPath);
        const pluginName = this.extractPluginName(relativePath);

        if (!pluginName) {
            return; // Not a plugin directory
        }

        console.log(`📁 Directory ${eventType}: ${relativePath}`);

        // Add to reload queue
        this.queueReload({
            type: 'directory',
            event: eventType,
            pluginName: pluginName,
            dirPath: dirPath,
            relativePath: relativePath,
            timestamp: Date.now()
        });
    }

    extractPluginName(relativePath) {
        // Extract plugin name from path (first directory level)
        const parts = relativePath.split(path.sep);
        
        if (parts.length > 0 && !parts[0].startsWith('.')) {
            return parts[0];
        }
        
        return null;
    }

    queueReload(reloadItem) {
        const pluginName = reloadItem.pluginName;
        const now = Date.now();
        const lastReloadTime = this.lastReload.get(pluginName) || 0;

        // Check cooldown period
        if (now - lastReloadTime < this.cooldownPeriod) {
            console.log(`⏸️ Skipping reload for ${pluginName} (cooldown period)`);
            return;
        }

        // Remove existing items for this plugin (debounce)
        this.reloadQueue = this.reloadQueue.filter(item => item.pluginName !== pluginName);

        // Add new reload item
        this.reloadQueue.push(reloadItem);

        console.log(`📋 Queued reload for plugin: ${pluginName}`);
    }

    startQueueProcessor() {
        setInterval(async () => {
            if (!this.processing && this.reloadQueue.length > 0) {
                await this.processReloadQueue();
            }
        }, 500); // Check every 500ms
    }

    async processReloadQueue() {
        if (this.processing || this.reloadQueue.length === 0) {
            return;
        }

        this.processing = true;

        try {
            const reloadItem = this.reloadQueue.shift();
            await this.executeReload(reloadItem);

        } catch (error) {
            console.error('❌ Error processing reload queue:', error);
        } finally {
            this.processing = false;
        }
    }

    async executeReload(reloadItem) {
        const { pluginName, event, filePath } = reloadItem;

        try {
            console.log(`🔄 Reloading plugin: ${pluginName}`);

            // Update last reload timestamp
            this.lastReload.set(pluginName, Date.now());

            if (event === 'delete') {
                // Unload plugin
                await this.unloadPlugin(pluginName);
            } else {
                // Reload plugin
                await this.reloadPlugin(pluginName);
            }

            console.log(`✅ Successfully reloaded plugin: ${pluginName}`);

            // Emit reload event
            this.botClient.eventBus?.emit('plugin:reloaded', {
                pluginName: pluginName,
                event: event,
                filePath: filePath
            });

        } catch (error) {
            console.error(`❌ Failed to reload plugin ${pluginName}:`, error);

            // Emit reload error event
            this.botClient.eventBus?.emit('plugin:reload_error', {
                pluginName: pluginName,
                error: error,
                filePath: filePath
            });
        }
    }

    async reloadPlugin(pluginName) {
        const pluginPath = path.join(this.pluginsPath, pluginName);

        // Check if plugin directory exists
        if (!await fs.pathExists(pluginPath)) {
            throw new Error(`Plugin directory not found: ${pluginPath}`);
        }

        // Check if plugin.json exists
        const manifestPath = path.join(pluginPath, 'plugin.json');
        if (!await fs.pathExists(manifestPath)) {
            throw new Error(`Plugin manifest not found: ${manifestPath}`);
        }

        // Clear require cache for plugin files
        this.clearRequireCache(pluginPath);

        // Let plugin discovery handle the reload
        if (this.botClient.pluginDiscovery) {
            await this.botClient.pluginDiscovery.reloadPlugin(pluginName);
        }
    }

    async unloadPlugin(pluginName) {
        const pluginPath = path.join(this.pluginsPath, pluginName);

        // Clear require cache
        this.clearRequireCache(pluginPath);

        // Let plugin discovery handle the unload
        if (this.botClient.pluginDiscovery) {
            await this.botClient.pluginDiscovery.unloadPlugin(pluginName);
        }
    }

    clearRequireCache(pluginPath) {
        const absolutePath = path.resolve(pluginPath);
        
        // Get all cached modules that are under the plugin path
        const cachedModules = Object.keys(require.cache).filter(modulePath => 
            modulePath.startsWith(absolutePath)
        );

        // Delete from cache
        cachedModules.forEach(modulePath => {
            delete require.cache[modulePath];
        });

        console.log(`🧹 Cleared require cache for ${cachedModules.length} modules in plugin`);
    }

    async stop() {
        try {
            console.log('🛑 Stopping hot reloader...');

            this.isRunning = false;

            // Close all watchers
            for (const [name, watcher] of this.watchers) {
                await watcher.close();
                console.log(`🔌 Closed watcher: ${name}`);
            }

            this.watchers.clear();
            this.reloadQueue = [];

            console.log('✅ Hot reloader stopped');

        } catch (error) {
            console.error('❌ Error stopping hot reloader:', error);
        }
    }

    getStats() {
        return {
            isRunning: this.isRunning,
            watchersCount: this.watchers.size,
            queueSize: this.reloadQueue.length,
            processing: this.processing,
            reloadHistory: Array.from(this.lastReload.entries()).map(([plugin, timestamp]) => ({
                plugin,
                lastReload: new Date(timestamp).toISOString()
            }))
        };
    }

    async forceReload(pluginName) {
        console.log(`🔄 Force reloading plugin: ${pluginName}`);
        
        // Clear cooldown
        this.lastReload.delete(pluginName);
        
        // Queue immediate reload
        this.queueReload({
            type: 'manual',
            event: 'change',
            pluginName: pluginName,
            filePath: path.join(this.pluginsPath, pluginName),
            relativePath: pluginName,
            timestamp: Date.now()
        });
    }

    async reloadAllPlugins() {
        console.log('🔄 Force reloading all plugins...');
        
        try {
            const pluginDirs = await fs.readdir(this.pluginsPath);
            
            for (const pluginName of pluginDirs) {
                const pluginPath = path.join(this.pluginsPath, pluginName);
                const stat = await fs.stat(pluginPath);
                
                if (stat.isDirectory() && !pluginName.startsWith('.')) {
                    await this.forceReload(pluginName);
                }
            }

            console.log('✅ Queued reload for all plugins');

        } catch (error) {
            console.error('❌ Failed to reload all plugins:', error);
            throw error;
        }
    }
}

module.exports = HotReloader;
