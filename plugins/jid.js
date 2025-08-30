const { bot } = require('../lib/client')

bot(
  {
    pattern: 'jid ?(.*)',
    desc: 'Get chat JID (useful for groups and identifying participants)',
    type: 'utility',
  },
  async (message, match) => {
    try {
      const chatJid = message.key.remoteJid
      const isGroup = chatJid.endsWith('@g.us')
      let senderJid = null
      let jidInfo = `📋 *Chat JID Information*\n\n`
      
      // Basic chat information
      jidInfo += `💬 **Chat JID:** \`${chatJid}\`\n`
      jidInfo += `📱 **Chat Type:** ${isGroup ? 'Group Chat' : 'Private Chat'}\n`
      
      // Sender/Participant information
      if (isGroup) {
        // In group chats, get the participant (sender) JID
        senderJid = message.key.participant || message.key.remoteJid
        jidInfo += `👤 **Your JID in this group:** \`${senderJid}\`\n`
        
        // Check if message is from bot owner
        const isFromMe = message.key.fromMe
        const isOwner = message.client.isOwnerJid(message.sender)
        
        if (isFromMe) {
          jidInfo += `🤖 **Bot Status:** This is from the bot owner\n`
        } else if (isOwner) {
          jidInfo += `👑 **Owner Status:** You are the bot owner\n`
        } else {
          jidInfo += `👥 **Member Status:** Regular group member\n`
        }
        
        // Get group metadata if available
        try {
          const groupMetadata = await message.client.socket.groupMetadata(chatJid)
          jidInfo += `👥 **Group Name:** ${groupMetadata.subject}\n`
          jidInfo += `📊 **Total Members:** ${groupMetadata.participants.length}\n`
        } catch (error) {
          jidInfo += `⚠️ **Group Info:** Could not fetch group metadata\n`
        }
        
      } else {
        // In private chats
        if (message.key.fromMe) {
          senderJid = message.client.socket.user?.id || chatJid
          jidInfo += `🤖 **Bot JID:** \`${senderJid}\`\n`
        } else {
          senderJid = chatJid
          jidInfo += `👤 **Contact JID:** \`${senderJid}\`\n`
        }
      }
      
      // Additional technical info
      jidInfo += `\n📋 **Technical Details:**\n`
      jidInfo += `• Message ID: \`${message.key.id}\`\n`
      jidInfo += `• From Me: ${message.key.fromMe ? 'Yes' : 'No'}\n`
      
      if (isGroup && message.key.participant) {
        jidInfo += `• Participant: \`${message.key.participant}\`\n`
      }
      
      // Usage tip
      jidInfo += `\n💡 **Usage Tip:**\n`
      if (isGroup) {
        jidInfo += `In groups, your JID ends with "lid" - this is normal!\n`
        jidInfo += `Use the Group JID for group-wide commands and\n`
        jidInfo += `your Participant JID for user-specific permissions.`
      } else {
        jidInfo += `This JID can be used for direct messaging\n`
        jidInfo += `and permission management.`
      }
      
      return await message.send(jidInfo)
      
    } catch (error) {
      console.error('❌ JID command error:', error)
      return await message.reply('❌ Error retrieving JID information')
    }
  }
)