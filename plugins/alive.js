const { bot } = require('../lib/client')

bot(
  {
    pattern: 'alive ?(.*)',
    desc: 'Check if bot is alive',
    type: 'misc',
  },
  async (message, match) => {
    const uptime = process.uptime()
    const days = Math.floor(uptime / 86400)
    const hours = Math.floor((uptime % 86400) / 3600)
    const minutes = Math.floor((uptime % 3600) / 60)
    
    const aliveMessage = `🤖 *MATDEV Bot is Online!*\n\n⏰ Uptime: ${days}d ${hours}h ${minutes}m\n🔧 Status: Running smoothly\n💫 Ready to serve!`
    
    return await message.send(aliveMessage)
  }
)