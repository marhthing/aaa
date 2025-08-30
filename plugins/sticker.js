const { bot } = require('../lib/client')
const sharp = require('sharp')
const ffmpeg = require('fluent-ffmpeg')
const fs = require('fs')
const path = require('path')

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
      
      // Check if replying to a message with media
      if (message.quoted && (message.quoted.image || message.quoted.video)) {
        if (message.quoted.image) {
          mediaMessage = message.quoted
          mediaType = 'image'
        } else if (message.quoted.video) {
          mediaMessage = message.quoted
          mediaType = 'video'
        }
      }
      // Check if current message has media with .sticker caption
      else if (message.image || message.video) {
        if (message.image) {
          mediaMessage = message
          mediaType = 'image'
        } else if (message.video) {
          mediaMessage = message
          mediaType = 'video'
        }
      }
      
      if (!mediaMessage) {
        return await message.reply('❌ Please reply to an image or video, or send media with .sticker caption')
      }
      
      // Add loading reaction
      await message.react('🔄')
      
      // Download the media
      const buffer = await mediaMessage.download()
      if (!buffer) {
        return await message.reply('❌ Failed to download media')
      }
      
      // Convert to sticker
      const stickerBuffer = await convertToSticker(buffer, mediaType)
      if (!stickerBuffer) {
        return await message.reply('❌ Failed to convert media to sticker')
      }
      
      // Get sticker pack name from environment or use bot name
      const packName = process.env.STICKER_NAME || 'MATDEV Bot'
      
      // Send sticker
      await message.client.socket.sendMessage(message.key.remoteJid, {
        sticker: stickerBuffer,
        packname: packName,
        author: 'MATDEV Bot'
      })
      
      // Success reaction
      await message.react('✅')
      
    } catch (error) {
      console.error('❌ Sticker conversion error:', error)
      await message.reply('❌ Error converting to sticker')
    }
  }
)

async function convertToSticker(buffer, mediaType) {
  try {
    if (mediaType === 'image') {
      // Convert image to WebP sticker format
      const stickerBuffer = await sharp(buffer)
        .resize(512, 512, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .webp()
        .toBuffer()
      
      return stickerBuffer
    } else if (mediaType === 'video') {
      // Convert video to animated WebP
      return new Promise((resolve, reject) => {
        const tempInput = path.join(__dirname, '../data/downloads/temp_input.mp4')
        const tempOutput = path.join(__dirname, '../data/downloads/temp_sticker.webp')
        
        // Save input buffer
        fs.writeFileSync(tempInput, buffer)
        
        ffmpeg(tempInput)
          .outputOptions([
            '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=black@0',
            '-loop', '0',
            '-preset', 'default',
            '-an',
            '-vsync', '0',
            '-s', '512x512'
          ])
          .toFormat('webp')
          .output(tempOutput)
          .on('end', () => {
            try {
              const stickerBuffer = fs.readFileSync(tempOutput)
              // Clean up temp files
              fs.unlinkSync(tempInput)
              fs.unlinkSync(tempOutput)
              resolve(stickerBuffer)
            } catch (error) {
              reject(error)
            }
          })
          .on('error', (error) => {
            // Clean up temp files on error
            try {
              fs.unlinkSync(tempInput)
              fs.unlinkSync(tempOutput)
            } catch {}
            reject(error)
          })
          .run()
      })
    }
    
    return null
  } catch (error) {
    console.error('❌ Sticker conversion error:', error)
    return null
  }
}