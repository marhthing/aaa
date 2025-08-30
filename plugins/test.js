
const { bot } = require('../lib/client')

bot(
  {
    pattern: 'test ?(.*)',
    desc: 'Test command to verify bot is working',
    type: 'misc',
  },
  async (message, match) => {
    const testMessage = `🧪 *Test Command Working!*\n\n✅ Bot is receiving and processing commands\n📝 Your input: ${match || 'none'}\n🕐 Time: ${new Date().toLocaleString()}`
    
    return await message.reply(testMessage)
  }
)
