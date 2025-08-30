const { bot } = require('../lib/client')
const { Sticker, StickerTypes } = require('wa-sticker-formatter')
const { downloadMedia } = require('../lib/utils')

bot(
  {
    pattern: 'take ?(.*)',
    desc: 'Change sticker metadata to your own',
    type: 'media',
  },
  async (message, match) => {
    try {
      let stickerMessage = null
      
      // Check if replying to a sticker
      if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage) {
        const quotedMsg = message.message.extendedTextMessage.contextInfo.quotedMessage
        stickerMessage = { 
          message: { stickerMessage: quotedMsg.stickerMessage }, 
          key: message.message.extendedTextMessage.contextInfo 
        }
      }
      
      if (!stickerMessage) {
        return await message.reply('❌ Reply to a sticker with .take')
      }
      
      // Download the sticker
      const buffer = await downloadMedia(stickerMessage, message.client.socket)
      if (!buffer) {
        return await message.reply('❌ Failed to download sticker')
      }
      
      // Get your sticker settings
      const customName = process.env.STICKER_NAME || process.env.STICKER_PACKNAME
      const packName = customName || 'MATDEV'
      const authorName = ''  // Always empty so only pack name shows
      
      // Create new sticker with your metadata
      const newSticker = new Sticker(buffer, {
        pack: packName,
        author: authorName,
        type: StickerTypes.FULL,  // Curved edges like WhatsApp stickers
        categories: ['🤖'],
        id: Date.now().toString(),
        quality: 75,
        background: 'transparent'
      })
      
      try {
        // Send sticker with your metadata
        const stickerMessage = await newSticker.toMessage()
        await message.client.socket.sendMessage(message.key.remoteJid, stickerMessage)
        
        // console.log(`✅ Sticker taken with metadata: Pack="${packName}"`)
        
      } catch (stickerError) {
        console.error('❌ Failed to take sticker:', stickerError)
        await message.reply('❌ Failed to take sticker')
      }
      
    } catch (error) {
      console.error('❌ Take sticker error:', error)
      await message.reply('❌ Error taking sticker')
    }
  }
)