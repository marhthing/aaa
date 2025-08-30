const { bot } = require('../lib/client')
const sharp = require('sharp')
const ffmpeg = require('fluent-ffmpeg')
const fs = require('fs-extra')
const path = require('path')
const { Sticker, StickerTypes } = require('wa-sticker-formatter')

bot(
  {
    pattern: 'sticker ?(.*)',
    desc: 'Convert replied image/video to sticker or use as caption',
    type: 'media',
  },
  async (message, match) => {
    try {
      let mediaMessage = null
      let mediaType = null
      
      // Check if replying to a message with media (quotedMessage structure)
      if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedMsg = message.message.extendedTextMessage.contextInfo.quotedMessage
        if (quotedMsg.imageMessage) {
          mediaMessage = { message: { imageMessage: quotedMsg.imageMessage }, key: message.message.extendedTextMessage.contextInfo }
          mediaType = 'image'
        } else if (quotedMsg.videoMessage) {
          mediaMessage = { message: { videoMessage: quotedMsg.videoMessage }, key: message.message.extendedTextMessage.contextInfo }
          mediaType = 'video'
        }
      }
      // Check if current message has media with .sticker caption
      else if (message.message?.imageMessage) {
        mediaMessage = message
        mediaType = 'image'
      } else if (message.message?.videoMessage) {
        mediaMessage = message
        mediaType = 'video'
      }
      
      if (!mediaMessage) {
        return await message.reply('❌ Please reply to an image or video, or send media with .sticker caption')
      }
      
      // Add loading reaction - check bot reaction config
      // For now, skip reactions until we fix the bot reaction system
      
      // Download the media using utils
      const { downloadMedia } = require('../lib/utils')
      const buffer = await downloadMedia(mediaMessage, message.client.socket)
      if (!buffer) {
        return await message.reply('❌ Failed to download media')
      }
      
      // Get sticker pack name - only use custom name if set, otherwise just MATDEV
      const customName = process.env.STICKER_NAME || process.env.STICKER_PACKNAME
      const packName = customName || 'MATDEV'
      const authorName = customName ? '' : 'MATDEV'  // No author if custom name set
      
      // Create sticker with proper metadata using wa-sticker-formatter
      const sticker = new Sticker(buffer, {
        pack: packName,
        author: authorName,
        type: StickerTypes.FULL,  // Curved edges like WhatsApp stickers
        categories: ['🤖'],
        id: Date.now().toString(),
        quality: 75,
        background: 'transparent'
      })
      
      try {
        // Convert to message format and send
        const stickerMessage = await sticker.toMessage()
        await message.client.socket.sendMessage(message.key.remoteJid, stickerMessage)
        
        console.log(`✅ Sticker sent with metadata: Pack="${packName}", Author="${authorName}"`)
        
        // Success reaction - check bot reaction config
        // For now, skip reactions until we fix the bot reaction system
        
      } catch (stickerError) {
        console.error('❌ Failed to create sticker with metadata:', stickerError)
        await message.reply('❌ Failed to create sticker')
      }
      
    } catch (error) {
      console.error('❌ Sticker conversion error:', error)
      await message.reply('❌ Error converting to sticker')
    }
  }
)

