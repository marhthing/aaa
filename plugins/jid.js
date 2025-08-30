const { bot } = require('../lib/client')

bot(
  {
    pattern: 'jid ?(.*)',
    desc: 'Get chat JID',
    type: 'utility',
  },
  async (message, match) => {
    try {
      const chatJid = message.key.remoteJid
      return await message.send(`\`${chatJid}\``)
    } catch (error) {
      console.error('❌ JID command error:', error)
      return await message.reply('❌ Error retrieving JID')
    }
  }
)