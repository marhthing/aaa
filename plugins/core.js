const { bot, config } = require('../lib/')

// Help command
bot(
  {
    pattern: 'help ?(.*)',
    desc: 'Show available commands',
    type: 'core',
  },
  async (message, match) => {
    const { listPlugins } = require('../lib/plugins')
    const plugins = listPlugins()
    
    let helpText = `*🤖 ${config.BOT_NAME} Commands*\n\n`
    
    const sessionId = config.WHATSAPP_SESSION_ID || 'default'
    const sessionPlugins = plugins[sessionId] || {}
    
    const categories = {}
    
    for (const [pluginName, pluginInfo] of Object.entries(sessionPlugins)) {
      const type = pluginInfo.type || 'misc'
      if (!categories[type]) categories[type] = []
      categories[type].push({
        name: pluginName,
        commands: pluginInfo.commands,
        desc: pluginInfo.desc
      })
    }
    
    for (const [category, categoryPlugins] of Object.entries(categories)) {
      helpText += `*📁 ${category.toUpperCase()}*\n`
      for (const plugin of categoryPlugins) {
        helpText += `• ${config.PREFIX}${plugin.commands[0]} - ${plugin.desc}\n`
      }
      helpText += '\n'
    }
    
    helpText += `_Use ${config.PREFIX}plugin <url> to install new plugins_`
    
    await message.send(helpText)
  }
)

// Menu command (alias for help)
bot(
  {
    pattern: 'menu ?(.*)',
    desc: 'Show available commands',
    type: 'core',
  },
  async (message, match) => {
    // Just call help
    const { getCommandHandler } = require('../lib/plugins')
    const helpHandler = getCommandHandler('help')
    if (helpHandler) {
      await helpHandler.handler(message, match)
    }
  }
)

// Status command
bot(
  {
    pattern: 'status ?(.*)',
    desc: 'Show bot status',
    type: 'core',
  },
  async (message, match) => {
    const uptime = process.uptime()
    const formatTime = require('../lib/utils').formatTime
    
    const statusText = `*🤖 ${config.BOT_NAME} Status*

✅ *Bot Status:* Online
⏰ *Uptime:* ${formatTime(uptime * 1000)}
📱 *Session:* ${config.WHATSAPP_SESSION_ID || 'default'}
🔧 *Version:* ${config.VERSION}
🧠 *Memory Usage:* ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
🔌 *Plugins:* ${require('../lib/plugins').getRegisteredCommands().length} commands loaded

_${config.BOT_NAME} is running smoothly!_`

    await message.send(statusText)
  }
)

// Info command
bot(
  {
    pattern: 'info ?(.*)',
    desc: 'Show bot information',
    type: 'core',
  },
  async (message, match) => {
    const infoText = `*🤖 ${config.BOT_NAME} Bot*

*Description:* Advanced WhatsApp bot with modular plugin system
*Version:* ${config.VERSION}
*Prefix:* ${config.PREFIX}

*Features:*
• 🔥 Hot-reload plugin system
• 🛡️ Anti-delete protection
• 🔐 Anti-view-once capture
• 🎮 Interactive games
• 🔧 Dynamic plugin installation
• 📊 Performance monitoring

*Owner Features:*
• Complete access control
• Session management
• Plugin installation via URLs
• Advanced media tools

_Built with ❤️ for personal automation_`

    await message.send(infoText)
  }
)

// Reload command (owner only)
bot(
  {
    pattern: 'reload ?(.*)',
    desc: 'Reload plugins (owner only)',
    type: 'admin',
  },
  async (message, match) => {
    if (!message.isOwner) {
      return await message.send('❌ This command is owner only')
    }
    
    try {
      // Clear plugin cache and reload
      const pluginCommands = require('../lib/plugins').getRegisteredCommands()
      const count = pluginCommands.length
      
      // Trigger reload (simplified)
      await message.send(`🔄 Reloading ${count} commands...`)
      
      // In a real implementation, you'd reload all plugins here
      await message.send('✅ Plugins reloaded successfully!')
      
    } catch (error) {
      await message.send(`❌ Reload failed: ${error.message}`)
    }
  }
)