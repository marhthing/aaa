
const { bot } = require('../lib/client')
const fs = require('fs-extra')
const path = require('path')

bot(
  {
    pattern: 'vv ?(.*)',
    desc: 'Retrieve and send captured view once media',
    type: 'utility',
  },
  async (message, match) => {
    try {
      const targetJid = match.trim()

      // Check access permissions
      if (!message.key.fromMe && !message.client.isOwnerJid(message.sender)) {
        return await message.reply('❌ Only owner can access view once media')
      }

      const viewOnceDir = path.join(__dirname, '..', 'data', 'view-once')
      const metadataPath = path.join(viewOnceDir, 'metadata.json')

      // Check if view once directory exists
      if (!await fs.pathExists(viewOnceDir)) {
        return await message.reply('❌ No view once media found')
      }

      // Load metadata
      let metadata = []
      if (await fs.pathExists(metadataPath)) {
        metadata = await fs.readJson(metadataPath)
      }

      if (metadata.length === 0) {
        return await message.reply('❌ No view once media captured yet')
      }

      // Determine where to send the media
      let destinationJid = targetJid

      if (!destinationJid) {
        // Send to owner's personal chat (bot owner's own number)
        if (message.client.socket.user && message.client.socket.user.id) {
          destinationJid = message.client.socket.user.id
        } else {
          destinationJid = message.jid
        }
      }

      // Validate JID format if provided
      if (targetJid && !targetJid.includes('@')) {
        return await message.reply('❌ Invalid JID format. Use: .vv <jid@s.whatsapp.net>')
      }

      await message.reply(`📤 Sending ${metadata.length} view once media to ${destinationJid}...`)

      // Send all captured view once media
      for (const item of metadata) {
        try {
          const filePath = item.filePath
          
          // Check if file still exists
          if (!await fs.pathExists(filePath)) {
            continue
          }

          const buffer = await fs.readFile(filePath)
          const senderNumber = item.sender.split('@')[0]
          const timestamp = new Date(item.timestamp).toLocaleString()

          let mediaMessage = {}
          const caption = `👁️ *View Once Media*\n\n📱 From: ${senderNumber}\n⏰ Time: ${timestamp}\n\n_Originally sent as disappearing message_`

          switch (item.mediaType) {
            case 'image':
              mediaMessage = {
                image: buffer,
                caption: caption
              }
              break
            case 'video':
              mediaMessage = {
                video: buffer,
                caption: caption
              }
              break
            case 'audio':
              mediaMessage = {
                audio: buffer,
                mimetype: 'audio/ogg',
                ptt: false
              }
              break
            default:
              continue
          }

          await message.client.socket.sendMessage(destinationJid, mediaMessage)
          
          // Small delay between messages
          await new Promise(resolve => setTimeout(resolve, 1000))

        } catch (error) {
          console.error('Failed to send view once media:', error)
        }
      }

      await message.reply('✅ All view once media sent successfully')

    } catch (error) {
      console.error('View once retrieval error:', error)
      await message.reply('❌ Failed to retrieve view once media')
    }
  }
)

bot(
  {
    pattern: 'vv clear',
    desc: 'Clear all captured view once media',
    type: 'utility',
  },
  async (message) => {
    try {
      // Check access permissions
      if (!message.key.fromMe && !message.client.isOwnerJid(message.sender)) {
        return await message.reply('❌ Only owner can clear view once media')
      }

      const viewOnceDir = path.join(__dirname, '..', 'data', 'view-once')

      if (!await fs.pathExists(viewOnceDir)) {
        return await message.reply('❌ No view once media to clear')
      }

      // Remove all files in view once directory
      await fs.emptyDir(viewOnceDir)

      await message.reply('✅ All view once media cleared successfully')

    } catch (error) {
      console.error('View once clear error:', error)
      await message.reply('❌ Failed to clear view once media')
    }
  }
)

bot(
  {
    pattern: 'vv list',
    desc: 'List all captured view once media',
    type: 'utility',
  },
  async (message) => {
    try {
      // Check access permissions
      if (!message.key.fromMe && !message.client.isOwnerJid(message.sender)) {
        return await message.reply('❌ Only owner can list view once media')
      }

      const viewOnceDir = path.join(__dirname, '..', 'data', 'view-once')
      const metadataPath = path.join(viewOnceDir, 'metadata.json')

      let metadata = []
      if (await fs.pathExists(metadataPath)) {
        metadata = await fs.readJson(metadataPath)
      }

      if (metadata.length === 0) {
        return await message.reply('📂 No view once media captured yet')
      }

      let listMessage = `👁️ *Captured View Once Media*\n\n`
      
      for (let i = 0; i < metadata.length; i++) {
        const item = metadata[i]
        const senderNumber = item.sender.split('@')[0]
        const timestamp = new Date(item.timestamp).toLocaleString()
        
        listMessage += `${i + 1}. 📱 From: ${senderNumber}\n`
        listMessage += `   📷 Type: ${item.mediaType}\n`
        listMessage += `   ⏰ Time: ${timestamp}\n\n`
      }

      listMessage += `📊 Total: ${metadata.length} items\n\n`
      listMessage += `💡 *Commands:*\n`
      listMessage += `• \`.vv\` - Send all to your personal chat\n`
      listMessage += `• \`.vv <jid>\` - Send all to specific JID\n`
      listMessage += `• \`.vv clear\` - Clear all captured media`

      await message.reply(listMessage)

    } catch (error) {
      console.error('View once list error:', error)
      await message.reply('❌ Failed to list view once media')
    }
  }
)
