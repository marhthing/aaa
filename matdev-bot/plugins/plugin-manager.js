/**
 * Plugin Manager - Install plugins from URLs (GitHub Gists, etc.)
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

module.exports = {
    name: 'plugin-manager',
    description: 'Install and manage plugins from marketplace URLs',
    version: '1.0.0',
    command: ['plugin', 'install', 'marketplace'],
    category: 'admin',
    usage: 'plugin <github_gist_url> | plugin list | plugin remove <name>',
    fromMe: true,
    type: 'whatsapp',
    cooldown: 5,
    adminOnly: true,
    sudoOnly: true,
    
    async function(message, match, bot) {
        try {
            const args = match ? match.trim().split(' ') : [];
            
            if (!args.length) {
                await this.showPluginMenu(message, bot);
                return;
            }
            
            const action = args[0].toLowerCase();
            
            switch (action) {
                case 'list':
                    await this.listPlugins(message, bot);
                    break;
                    
                case 'remove':
                case 'delete':
                    if (args[1]) {
                        await this.removePlugin(message, args[1], bot);
                    } else {
                        await message.reply('❓ Please specify plugin name to remove.');
                    }
                    break;
                    
                case 'reload':
                    await this.reloadPlugins(message, bot);
                    break;
                    
                default:
                    // Treat as URL for installation
                    if (this.isValidUrl(args[0])) {
                        await this.installPlugin(message, args[0], bot);
                    } else {
                        await message.reply('❓ Invalid command. Use: plugin <url> | plugin list | plugin remove <name>');
                    }
                    break;
            }
            
        } catch (error) {
            await message.reply(`❌ Plugin manager error: ${error.message}`);
            throw error;
        }
    },
    
    /**
     * Show plugin management menu
     */
    async showPluginMenu(message, bot) {
        const prefix = bot.config.PREFIX;
        
        let menuText = `🔌 *Plugin Manager*\n\n`;
        menuText += `📋 **Commands:**\n`;
        menuText += `• ${prefix}plugin <url> - Install plugin from URL\n`;
        menuText += `• ${prefix}plugin list - List installed plugins\n`;
        menuText += `• ${prefix}plugin remove <name> - Remove plugin\n`;
        menuText += `• ${prefix}plugin reload - Reload all plugins\n\n`;
        
        menuText += `🌐 **Supported Sources:**\n`;
        menuText += `• GitHub Gists (gist.github.com)\n`;
        menuText += `• Raw GitHub files\n`;
        menuText += `• Direct .js file URLs\n\n`;
        
        menuText += `💡 **Example:**\n`;
        menuText += `${prefix}plugin https://gist.github.com/user/abc123\n\n`;
        
        menuText += `⚠️ **Note:** Only install plugins from trusted sources!`;
        
        await message.reply(menuText);
    },
    
    /**
     * Install plugin from URL
     */
    async installPlugin(message, url, bot) {
        try {
            await message.reply('⏳ Installing plugin...');
            
            // Validate and process URL
            const processedUrl = this.processUrl(url);
            if (!processedUrl) {
                await message.reply('❌ Unsupported URL format. Use GitHub Gists or raw file URLs.');
                return;
            }
            
            // Download plugin content
            const response = await axios.get(processedUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'MatDev-Bot/1.0.0'
                }
            });
            
            const pluginCode = response.data;
            
            // Extract plugin name from code
            const pluginName = this.extractPluginName(pluginCode, url);
            if (!pluginName) {
                await message.reply('❌ Could not determine plugin name. Invalid plugin format.');
                return;
            }
            
            // Validate plugin structure
            if (!this.validatePluginCode(pluginCode)) {
                await message.reply('❌ Invalid plugin structure. Missing required fields.');
                return;
            }
            
            // Save plugin file
            const pluginsDir = path.join(process.cwd(), 'plugins', 'marketplace');
            await fs.ensureDir(pluginsDir);
            
            const pluginPath = path.join(pluginsDir, `${pluginName}.js`);
            await fs.writeFile(pluginPath, pluginCode, 'utf8');
            
            // Try to load the plugin
            try {
                const result = await bot.pluginManager.loadPlugin(pluginPath);
                
                if (result.success) {
                    await message.reply(`✅ Plugin *${pluginName}* installed successfully!\n\n` +
                        `📋 Commands: ${result.commands.join(', ')}\n` +
                        `📁 Path: ${result.file}`);
                } else {
                    // Remove failed plugin
                    await fs.remove(pluginPath);
                    await message.reply(`❌ Plugin installation failed: ${result.error}`);
                }
            } catch (loadError) {
                // Remove failed plugin
                await fs.remove(pluginPath);
                await message.reply(`❌ Plugin loading failed: ${loadError.message}`);
            }
            
        } catch (error) {
            if (error.response && error.response.status === 404) {
                await message.reply('❌ Plugin URL not found. Check the URL and try again.');
            } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                await message.reply('❌ Network error. Check your internet connection.');
            } else {
                await message.reply(`❌ Installation failed: ${error.message}`);
            }
            throw error;
        }
    },
    
    /**
     * List installed plugins
     */
    async listPlugins(message, bot) {
        try {
            const plugins = bot.pluginManager.getPluginList();
            
            if (plugins.length === 0) {
                await message.reply('📭 No plugins installed.');
                return;
            }
            
            let listText = `🔌 *Installed Plugins* (${plugins.length})\n\n`;
            
            // Group by category
            const categories = {};
            plugins.forEach(plugin => {
                const category = plugin.metadata.category || 'general';
                if (!categories[category]) {
                    categories[category] = [];
                }
                categories[category].push(plugin);
            });
            
            // Display by category
            for (const [category, categoryPlugins] of Object.entries(categories)) {
                listText += `📂 **${category.toUpperCase()}**\n`;
                
                categoryPlugins.forEach(plugin => {
                    const status = plugin.enabled ? '✅' : '❌';
                    listText += `${status} *${plugin.name}*\n`;
                    listText += `   Commands: ${plugin.metadata.commands.join(', ')}\n`;
                    listText += `   Description: ${plugin.metadata.description}\n\n`;
                });
            }
            
            await message.reply(listText);
            
        } catch (error) {
            await message.reply(`❌ Failed to list plugins: ${error.message}`);
            throw error;
        }
    },
    
    /**
     * Remove plugin
     */
    async removePlugin(message, pluginName, bot) {
        try {
            const plugin = bot.pluginManager.getPlugin(pluginName);
            
            if (!plugin) {
                await message.reply(`❌ Plugin *${pluginName}* not found.`);
                return;
            }
            
            // Don't allow removing core plugins
            if (!plugin.relativePath.includes('marketplace')) {
                await message.reply(`❌ Cannot remove core plugin *${pluginName}*.`);
                return;
            }
            
            // Unload plugin
            const unloaded = bot.pluginManager.unloadPlugin(pluginName);
            
            if (unloaded) {
                // Remove plugin file
                await fs.remove(plugin.filePath);
                await message.reply(`✅ Plugin *${pluginName}* removed successfully.`);
            } else {
                await message.reply(`❌ Failed to unload plugin *${pluginName}*.`);
            }
            
        } catch (error) {
            await message.reply(`❌ Failed to remove plugin: ${error.message}`);
            throw error;
        }
    },
    
    /**
     * Reload all plugins
     */
    async reloadPlugins(message, bot) {
        try {
            await message.reply('🔄 Reloading all plugins...');
            
            const result = await bot.pluginManager.loadAll();
            const successful = result.filter(r => r.success).length;
            const failed = result.filter(r => !r.success).length;
            
            await message.reply(`✅ Plugin reload complete!\n\n` +
                `✅ Successful: ${successful}\n` +
                `❌ Failed: ${failed}`);
                
        } catch (error) {
            await message.reply(`❌ Failed to reload plugins: ${error.message}`);
            throw error;
        }
    },
    
    /**
     * Process URL to get raw content
     */
    processUrl(url) {
        try {
            // GitHub Gist
            if (url.includes('gist.github.com')) {
                const gistMatch = url.match(/gist\.github\.com\/[^\/]+\/([a-f0-9]+)/);
                if (gistMatch) {
                    return `https://gist.githubusercontent.com/${gistMatch[0].split('/')[1]}/${gistMatch[1]}/raw`;
                }
            }
            
            // Raw GitHub
            if (url.includes('raw.githubusercontent.com')) {
                return url;
            }
            
            // GitHub file
            if (url.includes('github.com') && url.includes('/blob/')) {
                return url.replace('/blob/', '/raw/');
            }
            
            // Direct file URL
            if (url.endsWith('.js')) {
                return url;
            }
            
            return null;
        } catch (error) {
            return null;
        }
    },
    
    /**
     * Validate URL format
     */
    isValidUrl(string) {
        try {
            const url = new URL(string);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (error) {
            return false;
        }
    },
    
    /**
     * Extract plugin name from code
     */
    extractPluginName(code, url) {
        try {
            // Try to extract from module.exports.name
            const nameMatch = code.match(/name:\s*['"]([\w-]+)['"]/);
            if (nameMatch) {
                return nameMatch[1];
            }
            
            // Try to extract from command
            const commandMatch = code.match(/command:\s*\[?['"]([\w-]+)['"]/);
            if (commandMatch) {
                return commandMatch[1];
            }
            
            // Extract from URL
            const urlMatch = url.match(/\/([^\/]+)\.js$/);
            if (urlMatch) {
                return urlMatch[1];
            }
            
            // Generate from gist ID
            const gistMatch = url.match(/\/([a-f0-9]+)$/);
            if (gistMatch) {
                return `plugin-${gistMatch[1].substring(0, 8)}`;
            }
            
            return null;
        } catch (error) {
            return null;
        }
    },
    
    /**
     * Validate plugin code structure
     */
    validatePluginCode(code) {
        try {
            // Check for required module.exports structure
            if (!code.includes('module.exports')) {
                return false;
            }
            
            // Check for required fields
            const requiredFields = ['command', 'function'];
            return requiredFields.every(field => code.includes(field));
            
        } catch (error) {
            return false;
        }
    }
};