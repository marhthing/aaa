const { bot } = require('../lib/client')

bot(
  {
    pattern: 'help ?(.*)',
    desc: 'Show available commands',
    type: 'misc',
  },
  async (message, match) => {
    const helpText = `🤖 *MATDEV Bot Commands*\n\n📋 Available Commands:\n• .ping - Check bot response time\n• .alive - Check if bot is alive\n• .help - Show this help menu\n\n💡 More commands will be added soon!`
    
    return await message.send(helpText)
  }
)