const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');

class PluginInstaller {
    constructor(options) {
        this.botClient = options.botClient;
        this.accessControl = options.accessControl;
        this.config = options.config;
        this.pluginsPath = options.pluginPath ? path.dirname(options.pluginPath) : path.join(__dirname, '..');
        this.installedPluginsPath = path.join(this.pluginsPath, 'installed-plugins');
        
        console.log('🔧 Initializing Plugin Installer...');
    }

    async initialize() {
        // Ensure installed plugins directory exists
        await fs.ensureDir(this.installedPluginsPath);
        console.log('✅ Plugin Installer initialized');
    }

    async executeCommand(command, message, args) {
        if (command.name === 'plugin') {
            const subCommand = args[0];
            
            if (subCommand === 'install') {
                return await this.installPlugin(message, args[1]);
            } else if (subCommand === 'remove') {
                return await this.removePlugin(message, args[1]);
            } else if (subCommand === 'list') {
                return await this.listInstalledPlugins(message);
            } else {
                await message.reply('Usage: .plugin install <gist-url> | .plugin remove <plugin-name> | .plugin list');
            }
        }
    }

    async installPlugin(message, gistUrl) {
        try {
            if (!gistUrl) {
                await message.reply('Please provide a GitHub gist URL');
                return;
            }

            await message.reply('📥 Downloading plugin...');

            // Extract gist ID from URL
            const gistId = this.extractGistId(gistUrl);
            if (!gistId) {
                await message.reply('❌ Invalid GitHub gist URL');
                return;
            }

            // Download gist content
            const gistData = await this.downloadGist(gistId);
            if (!gistData) {
                await message.reply('❌ Failed to download gist');
                return;
            }

            // Find the .js file in the gist
            const jsFile = Object.keys(gistData.files).find(filename => 
                filename.endsWith('.js')
            );

            if (!jsFile) {
                await message.reply('❌ No JavaScript file found in gist');
                return;
            }

            const pluginContent = gistData.files[jsFile].content;
            
            // Extract plugin name from filename (remove .js extension)
            const pluginName = path.basename(jsFile, '.js');
            
            // Create plugin directory
            const pluginDir = path.join(this.installedPluginsPath, pluginName);
            await fs.ensureDir(pluginDir);

            // Create plugin structure
            await this.createPluginStructure(pluginDir, pluginName, pluginContent, gistData);

            // Notify plugin discovery to reload
            if (this.botClient && this.botClient.pluginDiscovery) {
                const success = await this.botClient.pluginDiscovery.loadPlugin(`installed-plugins/${pluginName}`);
                if (success) {
                    await message.reply(`✅ Plugin '${pluginName}' installed and loaded successfully!`);
                } else {
                    await message.reply(`⚠️ Plugin '${pluginName}' installed but failed to load. Check logs for details.`);
                }
            } else {
                await message.reply(`✅ Plugin '${pluginName}' installed! Restart the bot to load it.`);
            }

        } catch (error) {
            console.error('Error installing plugin:', error);
            await message.reply(`❌ Error installing plugin: ${error.message}`);
        }
    }

    async removePlugin(message, pluginName) {
        try {
            if (!pluginName) {
                await message.reply('Please provide a plugin name to remove');
                return;
            }

            const pluginDir = path.join(this.installedPluginsPath, pluginName);
            
            if (!await fs.pathExists(pluginDir)) {
                await message.reply(`❌ Plugin '${pluginName}' not found`);
                return;
            }

            // Unload plugin first
            if (this.botClient && this.botClient.pluginDiscovery) {
                await this.botClient.pluginDiscovery.unloadPlugin(`installed-plugins/${pluginName}`);
            }

            // Remove plugin directory
            await fs.remove(pluginDir);
            
            await message.reply(`✅ Plugin '${pluginName}' removed successfully!`);

        } catch (error) {
            console.error('Error removing plugin:', error);
            await message.reply(`❌ Error removing plugin: ${error.message}`);
        }
    }

    async listInstalledPlugins(message) {
        try {
            const plugins = await fs.readdir(this.installedPluginsPath);
            
            if (plugins.length === 0) {
                await message.reply('📦 No installed plugins found');
                return;
            }

            let response = '📦 *Installed Plugins:*\\n\\n';
            
            for (const pluginName of plugins) {
                const manifestPath = path.join(this.installedPluginsPath, pluginName, 'plugin.json');
                if (await fs.pathExists(manifestPath)) {
                    try {
                        const manifest = await fs.readJson(manifestPath);
                        response += `• ${manifest.name} v${manifest.version}\\n`;
                        response += `  ${manifest.description}\\n\\n`;
                    } catch {
                        response += `• ${pluginName} (corrupted manifest)\\n\\n`;
                    }
                }
            }

            await message.reply(response);

        } catch (error) {
            console.error('Error listing plugins:', error);
            await message.reply('❌ Error listing plugins');
        }
    }

    extractGistId(url) {
        // Handle different gist URL formats
        const patterns = [
            /gist\.github\.com\/[^/]+\/([a-f0-9]+)/,
            /gist\.github\.com\/([a-f0-9]+)/,
            /^([a-f0-9]+)$/
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return match[1];
            }
        }

        return null;
    }

    async downloadGist(gistId) {
        try {
            const response = await axios.get(`https://api.github.com/gists/${gistId}`);
            return response.data;
        } catch (error) {
            console.error('Error downloading gist:', error);
            return null;
        }
    }

    async createPluginStructure(pluginDir, pluginName, pluginContent, gistData) {
        // Convert single file plugin to proper plugin structure
        
        // Create plugin.json
        const pluginManifest = {
            name: pluginName,
            version: "1.0.0",
            description: gistData.description || `Installed plugin: ${pluginName}`,
            author: gistData.owner?.login || "Unknown",
            source: gistData.html_url,
            installedAt: new Date().toISOString(),
            commands: this.extractCommands(pluginContent),
            main: "index.js"
        };

        await fs.writeJson(path.join(pluginDir, 'plugin.json'), pluginManifest, { spaces: 2 });

        // Create index.js with plugin wrapper
        const wrappedContent = this.wrapPluginContent(pluginContent, pluginName);
        await fs.writeFile(path.join(pluginDir, 'index.js'), wrappedContent, 'utf8');

        // Create README
        const readme = `# ${pluginName}

${pluginManifest.description}

**Author:** ${pluginManifest.author}
**Source:** ${pluginManifest.source}
**Installed:** ${pluginManifest.installedAt}

## Commands
${pluginManifest.commands.map(cmd => `- ${cmd.name}: ${cmd.description}`).join('\\n')}
`;

        await fs.writeFile(path.join(pluginDir, 'README.md'), readme, 'utf8');
    }

    extractCommands(content) {
        const commands = [];
        
        // Look for bot() function calls to extract command patterns
        const botCallRegex = /bot\s*\(\s*{[^}]*pattern\s*:\s*['"`]([^'"`]+)['"`][^}]*desc\s*:\s*['"`]([^'"`]+)['"`]/g;
        
        let match;
        while ((match = botCallRegex.exec(content)) !== null) {
            const pattern = match[1];
            const description = match[2];
            
            // Extract command name from pattern (first word before any regex)
            const commandMatch = pattern.match(/^([a-zA-Z0-9_-]+)/);
            if (commandMatch) {
                commands.push({
                    name: commandMatch[1],
                    description: description,
                    pattern: pattern
                });
            }
        }
        
        return commands;
    }

    wrapPluginContent(content, pluginName) {
        return `// Auto-generated wrapper for plugin: ${pluginName}
// Original content from GitHub gist

class ${pluginName.charAt(0).toUpperCase() + pluginName.slice(1)}Plugin {
    constructor(options) {
        this.botClient = options.botClient;
        this.accessControl = options.accessControl;
        this.config = options.config;
        this.pluginName = options.pluginName;
        
        // Initialize the original plugin functionality
        this.initOriginalPlugin();
    }

    async initialize() {
        console.log(\`✅ \${this.pluginName} plugin initialized\`);
    }

    initOriginalPlugin() {
        // Create bot function that mimics the original bot API
        const bot = (config, handler) => {
            // Register the command in our system
            const commandName = this.extractCommandName(config.pattern);
            if (commandName) {
                this.registerCommand(commandName, config, handler);
            }
        };

        // Make bot function available globally for the original plugin
        global.bot = bot;
        
        // Execute original plugin content
        try {
            ${content}
        } catch (error) {
            console.error(\`Error executing plugin content for \${this.pluginName}:\`, error);
        }
        
        // Clean up global bot function
        delete global.bot;
    }

    extractCommandName(pattern) {
        if (typeof pattern === 'string') {
            const match = pattern.match(/^([a-zA-Z0-9_-]+)/);
            return match ? match[1] : null;
        }
        return null;
    }

    registerCommand(commandName, config, handler) {
        // Store command for later execution
        if (!this.commands) {
            this.commands = new Map();
        }
        
        this.commands.set(commandName, {
            config,
            handler,
            pattern: new RegExp(config.pattern, 'i')
        });
    }

    async executeCommand(command, message, args) {
        const commandName = command.name;
        const registeredCommand = this.commands?.get(commandName);
        
        if (registeredCommand) {
            try {
                // Create match object from message text
                const fullText = args.join(' ');
                const match = fullText.match(registeredCommand.pattern);
                const matchText = match ? match[1] || fullText : fullText;
                
                // Call the original handler
                await registeredCommand.handler(message, matchText);
            } catch (error) {
                console.error(\`Error executing command \${commandName}:\`, error);
                await message.reply(\`❌ Error executing command: \${error.message}\`);
            }
        }
    }

    getCommands() {
        return this.config.commands || [];
    }

    async shutdown() {
        console.log(\`🛑 Shutting down \${this.pluginName} plugin...\`);
    }
}

module.exports = ${pluginName.charAt(0).toUpperCase() + pluginName.slice(1)}Plugin;
`;
    }
}

module.exports = PluginInstaller;