/**
 * Settings Plugin - Bot configuration and user preferences
 */

module.exports = {
    name: 'settings',
    description: 'Manage bot settings and user preferences',
    version: '1.0.0',
    command: ['settings', 'config', 'prefs'],
    category: 'utilities',
    usage: '[get/set] [key] [value]',
    fromMe: false,
    type: 'whatsapp',
    cooldown: 5,
    
    async function(message, match, bot) {
        try {
            const args = match ? match.trim().split(' ') : [];
            const action = args[0]?.toLowerCase();
            const key = args[1];
            const value = args.slice(2).join(' ');
            
            if (!action) {
                await this.showSettingsMenu(message, bot);
                return;
            }
            
            switch (action) {
                case 'get':
                    await this.getSetting(message, key, bot);
                    break;
                    
                case 'set':
                    await this.setSetting(message, key, value, bot);
                    break;
                    
                case 'list':
                    await this.listSettings(message, bot);
                    break;
                    
                case 'reset':
                    await this.resetSettings(message, key, bot);
                    break;
                    
                case 'lang':
                case 'language':
                    await this.setLanguage(message, key, bot);
                    break;
                    
                default:
                    await message.reply(`❓ Unknown action: ${action}\n\nUse ${bot.config.PREFIX}settings for help.`);
            }
            
        } catch (error) {
            await message.reply('❌ Settings command failed.');
            throw error;
        }
    },
    
    /**
     * Show settings menu
     */
    async showSettingsMenu(message, bot) {
        const prefix = bot.config.PREFIX;
        const isGroup = message.isGroup;
        const isAdmin = message.isAdmin || message.isSudo;
        
        let settingsText = `⚙️ *Settings Menu*\n\n`;
        
        // User settings
        settingsText += `👤 *User Settings:*\n`;
        settingsText += `• ${prefix}settings lang <code> - Set language (en/es/hi/ar/fr)\n`;
        settingsText += `• ${prefix}settings get <key> - Get setting value\n`;
        settingsText += `• ${prefix}settings list - List all settings\n\n`;
        
        // Group settings (only for admins in groups)
        if (isGroup && isAdmin) {
            settingsText += `👥 *Group Settings:*\n`;
            settingsText += `• ${prefix}settings set welcome <true/false> - Welcome messages\n`;
            settingsText += `• ${prefix}settings set goodbye <true/false> - Goodbye messages\n`;
            settingsText += `• ${prefix}settings set antilink <true/false> - Anti-link protection\n`;
            settingsText += `• ${prefix}settings set antispam <true/false> - Anti-spam protection\n`;
            settingsText += `• ${prefix}settings set commands <true/false> - Allow commands\n`;
            settingsText += `• ${prefix}settings set games <true/false> - Allow games\n\n`;
        }
        
        // Bot owner settings
        if (message.isSudo) {
            settingsText += `🔐 *Bot Settings (Owner Only):*\n`;
            settingsText += `• ${prefix}settings set autoread <true/false> - Auto-read messages\n`;
            settingsText += `• ${prefix}settings set autoonline <true/false> - Always online\n`;
            settingsText += `• ${prefix}settings set rejectcalls <true/false> - Reject calls\n`;
            settingsText += `• ${prefix}settings set prefix <prefix> - Change command prefix\n`;
            settingsText += `• ${prefix}settings reset <key> - Reset to default\n\n`;
        }
        
        settingsText += `💡 *Current Language:* ${await this.getUserLanguage(message.sender, bot)}\n`;
        settingsText += `📍 *Context:* ${isGroup ? 'Group Chat' : 'Private Chat'}`;
        
        await message.reply(settingsText);
    },
    
    /**
     * Get a setting value
     */
    async getSetting(message, key, bot) {
        if (!key) {
            await message.reply('❓ Please specify a setting key.\n\nUse `settings list` to see available settings.');
            return;
        }
        
        try {
            let value;
            let context = 'user';
            
            // Check if it's a group setting
            if (message.isGroup && this.isGroupSetting(key)) {
                const group = await bot.database.getGroup(message.from);
                if (group && group.settings) {
                    value = group.settings[key];
                    context = 'group';
                }
            }
            // Check if it's a user setting
            else if (this.isUserSetting(key)) {
                const user = await bot.database.getUser(message.sender);
                if (user && user.settings) {
                    value = user.settings[key];
                }
            }
            // Check if it's a bot setting (sudo only)
            else if (message.isSudo && this.isBotSetting(key)) {
                value = await bot.database.getSetting(key);
                context = 'bot';
            }
            
            if (value !== undefined) {
                await message.reply(`⚙️ *Setting Value*\n\n📋 **${key}** (${context}): \`${value}\``);
            } else {
                await message.reply(`❓ Setting "${key}" not found or not accessible.`);
            }
            
        } catch (error) {
            await message.reply('❌ Failed to get setting value.');
            throw error;
        }
    },
    
    /**
     * Set a setting value
     */
    async setSetting(message, key, value, bot) {
        if (!key || value === undefined) {
            await message.reply('❓ Please specify both key and value.\n\nUsage: `settings set <key> <value>`');
            return;
        }
        
        try {
            // Validate and convert value
            const parsedValue = this.parseValue(value);
            
            // Group settings (admin required)
            if (message.isGroup && this.isGroupSetting(key)) {
                if (!message.isAdmin && !message.isSudo) {
                    await message.reply('🔒 You need admin privileges to change group settings.');
                    return;
                }
                
                await this.setGroupSetting(message.from, key, parsedValue, bot);
                await message.reply(`✅ Group setting **${key}** set to \`${parsedValue}\``);
            }
            // User settings
            else if (this.isUserSetting(key)) {
                await this.setUserSetting(message.sender, key, parsedValue, bot);
                await message.reply(`✅ Your setting **${key}** set to \`${parsedValue}\``);
            }
            // Bot settings (sudo only)
            else if (message.isSudo && this.isBotSetting(key)) {
                await bot.database.setSetting(key, parsedValue);
                await message.reply(`✅ Bot setting **${key}** set to \`${parsedValue}\``);
                
                // Apply setting immediately if needed
                await this.applyBotSetting(key, parsedValue, bot);
            }
            else {
                await message.reply(`❓ Setting "${key}" not found or not accessible.`);
            }
            
        } catch (error) {
            await message.reply(`❌ Failed to set setting: ${error.message}`);
        }
    },
    
    /**
     * Set user language
     */
    async setLanguage(message, langCode, bot) {
        if (!langCode) {
            const currentLang = await this.getUserLanguage(message.sender, bot);
            await message.reply(`🌐 *Language Settings*\n\nCurrent: ${currentLang}\n\nAvailable languages:\n• en - English\n• es - Español\n• hi - हिंदी\n• ar - العربية\n• fr - Français\n\nUsage: \`settings lang <code>\``);
            return;
        }
        
        const supportedLangs = ['en', 'es', 'hi', 'ar', 'fr'];
        
        if (!supportedLangs.includes(langCode)) {
            await message.reply(`❌ Unsupported language: ${langCode}\n\nSupported: ${supportedLangs.join(', ')}`);
            return;
        }
        
        try {
            await this.setUserSetting(message.sender, 'language', langCode, bot);
            await message.reply(`✅ Language set to: ${this.getLanguageName(langCode)}`);
        } catch (error) {
            await message.reply('❌ Failed to set language.');
        }
    },
    
    /**
     * List all available settings
     */
    async listSettings(message, bot) {
        let settingsText = `📋 *Available Settings*\n\n`;
        
        // User settings
        settingsText += `👤 *User Settings:*\n`;
        settingsText += `• language - Interface language (en/es/hi/ar/fr)\n`;
        settingsText += `• notifications - Enable notifications (true/false)\n`;
        settingsText += `• timezone - User timezone\n\n`;
        
        // Group settings
        if (message.isGroup) {
            settingsText += `👥 *Group Settings:*\n`;
            settingsText += `• welcome - Welcome new members (true/false)\n`;
            settingsText += `• goodbye - Goodbye leaving members (true/false)\n`;
            settingsText += `• antilink - Block links (true/false)\n`;
            settingsText += `• antispam - Anti-spam protection (true/false)\n`;
            settingsText += `• commands - Allow commands (true/false)\n`;
            settingsText += `• games - Allow games (true/false)\n\n`;
        }
        
        // Bot settings (sudo only)
        if (message.isSudo) {
            settingsText += `🔐 *Bot Settings:*\n`;
            settingsText += `• autoread - Auto-read messages (true/false)\n`;
            settingsText += `• autoonline - Always online (true/false)\n`;
            settingsText += `• rejectcalls - Reject calls (true/false)\n`;
            settingsText += `• prefix - Command prefix\n`;
            settingsText += `• loglevel - Logging level (error/warn/info/debug)\n\n`;
        }
        
        settingsText += `💡 Use \`settings get <key>\` to see current values.`;
        
        await message.reply(settingsText);
    },
    
    /**
     * Reset settings to default
     */
    async resetSettings(message, key, bot) {
        if (!message.isSudo) {
            await message.reply('🔒 Only bot owners can reset settings.');
            return;
        }
        
        if (!key) {
            await message.reply('❓ Please specify a setting key to reset.');
            return;
        }
        
        try {
            await bot.database.setSetting(key, null);
            await message.reply(`✅ Setting "${key}" reset to default value.`);
        } catch (error) {
            await message.reply('❌ Failed to reset setting.');
        }
    },
    
    /**
     * Check if key is a group setting
     */
    isGroupSetting(key) {
        const groupSettings = ['welcome', 'goodbye', 'antilink', 'antispam', 'commands', 'games'];
        return groupSettings.includes(key);
    },
    
    /**
     * Check if key is a user setting
     */
    isUserSetting(key) {
        const userSettings = ['language', 'notifications', 'timezone'];
        return userSettings.includes(key);
    },
    
    /**
     * Check if key is a bot setting
     */
    isBotSetting(key) {
        const botSettings = ['autoread', 'autoonline', 'rejectcalls', 'prefix', 'loglevel'];
        return botSettings.includes(key);
    },
    
    /**
     * Parse setting value
     */
    parseValue(value) {
        const lowerValue = value.toLowerCase();
        
        if (lowerValue === 'true') return true;
        if (lowerValue === 'false') return false;
        if (!isNaN(value)) return Number(value);
        
        return value;
    },
    
    /**
     * Set group setting
     */
    async setGroupSetting(groupJid, key, value, bot) {
        const group = await bot.database.getGroup(groupJid);
        
        if (group) {
            const newSettings = { ...group.settings, [key]: value };
            await bot.database.getModel('Group').update(
                { settings: newSettings },
                { where: { jid: groupJid } }
            );
        }
    },
    
    /**
     * Set user setting
     */
    async setUserSetting(userJid, key, value, bot) {
        const user = await bot.database.getUser(userJid);
        
        if (user) {
            const newSettings = { ...user.settings, [key]: value };
            await bot.database.updateUser(userJid, { settings: newSettings });
        } else {
            // Create new user with setting
            await bot.database.createUser({
                jid: userJid,
                settings: { [key]: value }
            });
        }
    },
    
    /**
     * Apply bot setting immediately
     */
    async applyBotSetting(key, value, bot) {
        switch (key) {
            case 'prefix':
                bot.config.PREFIX = value;
                break;
            case 'autoread':
                bot.config.AUTO_READ = value;
                break;
            case 'autoonline':
                bot.config.AUTO_ONLINE = value;
                break;
            case 'rejectcalls':
                bot.config.REJECT_CALLS = value;
                break;
        }
    },
    
    /**
     * Get user language
     */
    async getUserLanguage(userJid, bot) {
        try {
            const user = await bot.database.getUser(userJid);
            return user?.settings?.language || bot.config.BOT_LANG || 'en';
        } catch (error) {
            return 'en';
        }
    },
    
    /**
     * Get language display name
     */
    getLanguageName(code) {
        const names = {
            'en': 'English',
            'es': 'Español',
            'hi': 'हिंदी',
            'ar': 'العربية',
            'fr': 'Français'
        };
        return names[code] || code;
    }
};
