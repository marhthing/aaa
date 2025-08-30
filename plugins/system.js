
const { bot } = require('../lib/client')

bot(
  {
    pattern: 'shutdown ?(.*)',
    desc: 'Shutdown the bot gracefully',
    type: 'system',
  },
  async (message, match) => {
    // Only owner can shutdown
    if (!message.key.fromMe && message.sender !== message.client.ownerJid) {
      return await message.reply('❌ Only owner can shutdown the bot')
    }
    
    try {
      // Send shutdown notification
      const utils = require('../lib/utils')
      await utils.sendOwnerNotification(message.client.socket, message.client.ownerJid, 'shutdown')
    } catch (error) {
      console.error('Failed to send shutdown notification:', error)
    }
    
    // Give time for the notification to be sent
    setTimeout(() => {
      console.log('🛑 Bot shutdown requested by owner')
      process.exit(0)
    }, 3000) // Increased to 3 seconds to ensure notification is sent
  }
)

bot(
  {
    pattern: 'restart ?(.*)',
    desc: 'Restart the bot process',
    type: 'system',
  },
  async (message, match) => {
    // Only owner can restart
    if (!message.key.fromMe && message.sender !== message.client.ownerJid) {
      return await message.reply('❌ Only owner can restart the bot')
    }
    
    try {
      // Send restart notification (just a quick acknowledgment)
      await message.reply('🔄 *Bot Restarting...*\n\nI\'ll be back in a moment! ⚡')
    } catch (error) {
      console.error('Failed to send restart acknowledgment:', error)
    }
    
    // Give time for the message to be sent
    setTimeout(() => {
      console.log('🔄 Bot restart requested by owner')
      process.exit(1) // Exit code 1 will trigger restart in manager
    }, 2000)
  }
)

bot(
  {
    pattern: 'status ?(.*)',
    desc: 'Show bot system status',
    type: 'system',
  },
  async (message, match) => {
    const status = message.client.getStatus()
    const uptime = process.uptime()
    const days = Math.floor(uptime / 86400)
    const hours = Math.floor((uptime % 86400) / 3600)
    const minutes = Math.floor((uptime % 3600) / 60)
    
    const memUsage = process.memoryUsage()
    const memUsed = (memUsage.heapUsed / 1024 / 1024).toFixed(2)
    const memTotal = (memUsage.heapTotal / 1024 / 1024).toFixed(2)
    
    const statusMessage = `📊 *Bot System Status*\n\n` +
      `🟢 Status: ${status.ready ? 'Online' : 'Offline'}\n` +
      `⏰ Uptime: ${days}d ${hours}h ${minutes}m\n` +
      `🔌 Plugins: ${status.pluginsLoaded} loaded\n` +
      `🧠 Memory: ${memUsed}MB / ${memTotal}MB\n` +
      `📱 Owner: ${status.ownerJid || 'Not set'}\n` +
      `🔧 Node.js: ${process.version}\n` +
      `💻 Platform: ${process.platform}\n` +
      `🆔 Process ID: ${process.pid}`
    
    return await message.reply(statusMessage)
  }
)
