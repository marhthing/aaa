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
      
      // Add loading reaction
      await message.react('🔄')
      
      // Download the media using utils
      const { downloadMedia } = require('../lib/utils')
      const buffer = await downloadMedia(mediaMessage, message.client.socket)
      if (!buffer) {
        return await message.reply('❌ Failed to download media')
      }
      
      // Convert to sticker and save to data folder first
      const stickerResult = await convertToSticker(buffer, mediaType, message.key.id)
      if (!stickerResult) {
        return await message.reply('❌ Failed to convert media to sticker')
      }
      
      // Get sticker pack name from environment or use bot name
      const packName = process.env.STICKER_NAME || 'MATDEV Bot'
      
      try {
        // Send sticker
        await message.client.socket.sendMessage(message.key.remoteJid, {
          sticker: stickerResult.buffer,
          packname: packName,
          author: 'MATDEV Bot'
        })
        
        // Success reaction
        await message.react('✅')
        
      } finally {
        // Always cleanup the temporary sticker file
        if (stickerResult.tempPath) {
          try {
            fs.unlinkSync(stickerResult.tempPath)
            console.log(`🗑️ Cleaned up sticker file: ${stickerResult.tempPath}`)
          } catch (cleanupError) {
            console.error('❌ Failed to cleanup sticker file:', cleanupError)
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Sticker conversion error:', error)
      await message.reply('❌ Error converting to sticker')
    }
  }
)

async function convertToSticker(buffer, mediaType, messageId) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    
    if (mediaType === 'image') {
      // Convert image to WebP sticker format
      const stickerBuffer = await sharp(buffer)
        .resize(512, 512, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .webp()
        .toBuffer()
      
      // Save to data folder temporarily
      const stickerPath = path.join(__dirname, '../data/downloads/sticker', `${messageId}_${timestamp}.webp`)
      await fs.ensureDir(path.dirname(stickerPath))
      await fs.writeFile(stickerPath, stickerBuffer)
      
      console.log(`💾 Sticker saved temporarily: ${stickerPath}`)
      
      return {
        buffer: stickerBuffer,
        tempPath: stickerPath
      }
    } else if (mediaType === 'video') {
      // Convert video to animated WebP
      return new Promise((resolve, reject) => {
        const tempInput = path.join(__dirname, '../data/downloads/temp_input.mp4')
        const tempOutput = path.join(__dirname, '../data/downloads/sticker', `${messageId}_${timestamp}.webp`)
        
        // Ensure sticker directory exists
        fs.ensureDirSync(path.dirname(tempOutput))
        
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
              // Clean up input temp file
              fs.unlinkSync(tempInput)
              
              console.log(`💾 Sticker saved temporarily: ${tempOutput}`)
              
              resolve({
                buffer: stickerBuffer,
                tempPath: tempOutput
              })
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