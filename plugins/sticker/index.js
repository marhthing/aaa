const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const ffmpeg = require('fluent-ffmpeg')

class StickerPlugin {
  constructor() {
    this.name = 'sticker'
    this.description = 'Convert images and videos to stickers'
    this.commands = [
      {
        name: 'sticker',
        description: 'Convert replied image/video to sticker or use as caption',
        usage: '.sticker (reply to media) or send media with .sticker caption'
      }
    ]
  }

  async initialize(client) {
    this.client = client
    this.socket = client.socket
    console.log('🎭 Sticker converter plugin initialized')
  }

  async executeCommand(messageData, command, args) {
    const { key, message, quoted } = messageData
    
    try {
      let mediaMessage = null
      let mediaType = null
      
      // Check if replying to a message with media
      if (quoted && (quoted.imageMessage || quoted.videoMessage)) {
        if (quoted.imageMessage) {
          mediaMessage = quoted.imageMessage
          mediaType = 'image'
        } else if (quoted.videoMessage) {
          mediaMessage = quoted.videoMessage
          mediaType = 'video'
        }
      }
      // Check if current message has media with .sticker caption
      else if (message.imageMessage || message.videoMessage) {
        if (message.imageMessage) {
          mediaMessage = message.imageMessage
          mediaType = 'image'
        } else if (message.videoMessage) {
          mediaMessage = message.videoMessage
          mediaType = 'video'
        }
      }
      
      if (!mediaMessage) {
        await this.socket.sendMessage(key.remoteJid, {
          text: '❌ Please reply to an image or video, or send media with .sticker caption'
        })
        return
      }
      
      // Add loading reaction
      await this.socket.sendMessage(key.remoteJid, {
        react: { text: '🔄', key: key }
      })
      
      // Download the media
      const buffer = await this.downloadMedia(mediaMessage)
      if (!buffer) {
        await this.socket.sendMessage(key.remoteJid, {
          text: '❌ Failed to download media'
        })
        return
      }
      
      // Convert to sticker
      const stickerBuffer = await this.convertToSticker(buffer, mediaType)
      if (!stickerBuffer) {
        await this.socket.sendMessage(key.remoteJid, {
          text: '❌ Failed to convert media to sticker'
        })
        return
      }
      
      // Get sticker pack name from environment or use bot name
      const packName = process.env.STICKER_NAME || 'MATDEV Bot'
      
      // Send sticker
      await this.socket.sendMessage(key.remoteJid, {
        sticker: stickerBuffer,
        packname: packName,
        author: 'MATDEV Bot'
      })
      
      // Success reaction
      await this.socket.sendMessage(key.remoteJid, {
        react: { text: '✅', key: key }
      })
      
    } catch (error) {
      console.error('❌ Sticker conversion error:', error)
      await this.socket.sendMessage(key.remoteJid, {
        text: '❌ Error converting to sticker'
      })
    }
  }
  
  async downloadMedia(mediaMessage) {
    try {
      const buffer = await this.socket.downloadMediaMessage(mediaMessage)
      return buffer
    } catch (error) {
      console.error('❌ Media download error:', error)
      return null
    }
  }
  
  async convertToSticker(buffer, mediaType) {
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
          const tempInput = path.join(__dirname, '../../data/downloads/temp_input.mp4')
          const tempOutput = path.join(__dirname, '../../data/downloads/temp_sticker.webp')
          
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
  
  getCommands() {
    return this.commands
  }
}

module.exports = StickerPlugin