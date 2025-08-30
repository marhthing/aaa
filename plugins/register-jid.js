const { bot } = require('../lib/client')

bot(
  {
    pattern: 'register ?(.*)',
    desc: 'Manually register a JID as owner (debug command)',
    type: 'owner',
  },
  async (message, match) => {
    try {
      // Only owner can use this command
      if (!message.key.fromMe && !message.client.isOwnerJid(message.sender)) {
        return await message.reply('❌ Only owner can register JIDs')
      }

      let jidToRegister = match.trim()
      
      if (!jidToRegister) {
        // Register current sender JID if in group
        if (message.isGroup && message.key.participant) {
          jidToRegister = message.key.participant
        } else {
          return await message.reply('❌ Usage: .register <jid> or use in group to register your participant JID')
        }
      }

      // Register the JID
      message.client.registerOwnerGroupJid(jidToRegister)
      
      return await message.reply(`✅ Registered JID: \`${jidToRegister}\``)
      
    } catch (error) {
      console.error('❌ Register JID error:', error)
      return await message.reply('❌ Error registering JID')
    }
  }
)