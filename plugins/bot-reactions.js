
const { bot } = require('../lib/client')
const fs = require('fs-extra')
const path = require('path')

// Configuration for bot reactions
let botReactionConfig = {
  enabled: true,
  loadingEmoji: '⏳',
  successEmoji: '✅', 
  errorEmoji: '❌'
}

// Load configuration
async function loadBotReactionConfig() {
  try {
    const configPath = path.join(__dirname, '../data/plugins/bot-reaction-config.json')
    if (await fs.pathExists(configPath)) {
      const config = await fs.readJson(configPath)
      botReactionConfig = { ...botReactionConfig, ...config }
    }
  } catch (error) {
    console.error('Failed to load bot reaction config:', error)
  }
}

// Save configuration
async function saveBotReactionConfig() {
  try {
    const configPath = path.join(__dirname, '../data/plugins/bot-reaction-config.json')
    await fs.ensureDir(path.dirname(configPath))
    await fs.writeJson(configPath, botReactionConfig)
  } catch (error) {
    console.error('Failed to save bot reaction config:', error)
  }
}

// Initialize configuration
async function initializeBotReactions() {
  await loadBotReactionConfig()
  console.log('🎭 Bot reaction system initialized')
}

bot(
  {
    pattern: 'br ?(.*)',
    desc: 'Control bot auto-reactions (on/off/status)',
    type: 'system',
  },
  async (message, match) => {
    // Only owner can configure
    if (!message.key.fromMe && !message.client.isOwnerJid(message.sender)) {
      return await message.reply('❌ Only owner can configure bot reactions')
    }
    
    const param = match.trim().toLowerCase()
    
    if (!param) {
      // Show current status
      const status = botReactionConfig.enabled ? '🔵 ON' : '🔴 OFF'
      return await message.reply(status)
    }
    
    if (param === 'on') {
      botReactionConfig.enabled = true
      await saveBotReactionConfig()
      return await message.reply('✅ Bot auto-reactions enabled')
    }
    
    if (param === 'off') {
      botReactionConfig.enabled = false
      await saveBotReactionConfig()
      return await message.reply('❌ Bot auto-reactions disabled')
    }
    
    return await message.reply('❌ Invalid option. Use `.br on`, `.br off`, or `.br` for status')
  }
)

// Export functions for use by client
module.exports = {
  getBotReactionConfig: () => botReactionConfig,
  initializeBotReactions
}

// Initialize the system
initializeBotReactions()
