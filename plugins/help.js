const { bot } = require('../lib/client')

bot(
  {
    pattern: 'help ?(.*)',
    desc: 'Show available commands',
    type: 'misc',
  },
  async (message, match) => {
    const isGroup = message.jid.endsWith('@g.us')
    
    let helpText = `🤖 *MATDEV Bot Commands*\n\n📋 Available Commands:\n• .ping - Check bot response time\n• .alive - Check if bot is alive\n• .help - Show this help menu\n• .jid - Show current chat JID\n\n💡 More commands will be added soon!`
    
    // Add group setup instructions if this is a group and user hasn't been registered yet
    if (isGroup) {
      helpText += `\n\n⚠️ *Group Setup Required*\nTo use commands in groups, send any message (not a command) first to register your identity, then try commands again.`
    }
    
    return await message.send(helpText)
  }
)