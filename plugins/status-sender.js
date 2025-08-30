
const { bot } = require('../lib/client')
const { downloadMedia } = require('../lib/utils')
const config = require('../config')
const fs = require('fs-extra')
const path = require('path')

// Store status media temporarily
const statusMediaCache = new Map()

bot(
  {
    pattern: 'status-sender',
    desc: 'Auto send status media when users request it',
    type: 'utility',
  },
  async (message, match) => {
    // This is just for plugin registration - actual logic is in event handlers below
    await message.reply('📱 Status auto-sender is active!\n\nWhen you post media on your status and someone replies with "send", the media will be automatically sent to them.')
  }
)

bot(
  {
    pattern: 'save',
    desc: 'Save status media to personal chat',
    type: 'utility',
  },
  async (message, match) => {
    try {
      // Check if this is a reply to a status
      const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage
      if (!quotedMessage) {
        return await message.reply('❌ Please reply to a status message with .save to save the media')
      }

      // Get the quoted message ID
      const quotedMessageId = message.message?.extendedTextMessage?.contextInfo?.stanzaId
      if (!quotedMessageId) {
        return await message.reply('❌ Unable to identify the status message')
      }

      // Check if we have cached media for this status
      const cachedMedia = statusMediaCache.get(quotedMessageId)
      if (!cachedMedia) {
        return await message.reply('❌ No media found for this status. Media may have expired or not been cached.')
      }

      // Send the cached media to owner's personal chat
      const ownerJid = message.sender // The person who used .save command
      console.log(`💾 Saving status media to ${ownerJid}'s personal chat`)
      
      const mediaMessage = await createMediaMessage(cachedMedia)
      await message.client.socket.sendMessage(ownerJid, mediaMessage)
      
      await message.reply('✅ Status media saved to your personal chat!')
      console.log(`✅ Status media saved for ${ownerJid}`)
      
    } catch (error) {
      console.error('Error saving status media:', error)
      await message.reply('❌ Failed to save status media. Please try again.')
    }
  }
)

// Function to handle status updates (when owner posts to status)
async function handleStatusUpdate(client, message) {
  try {
    // Check if this is a status update from the bot owner
    const isStatusUpdate = message.key.remoteJid === 'status@broadcast'
    const isFromOwner = client.isOwnerJid(message.key.participant || message.sender)
    
    if (!isStatusUpdate || !isFromOwner) return
    
    // Check if status contains media
    if (client.hasMedia(message.message)) {
      console.log('📱 Owner posted media status, caching for auto-send...')
      
      // Download and cache the media
      const mediaBuffer = await downloadMedia(message, client.socket)
      if (mediaBuffer) {
        const mediaType = client.getMessageType(message.message)
        const messageId = message.key.id
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        
        let mediaPath = null
        let fileName = null
        
        // Only save to disk if status media download is enabled
        if (config.ENABLE_STATUS_MEDIA_DOWNLOAD) {
          const extension = getMediaExtension(message.message)
          fileName = `status_${messageId}_${timestamp}${extension}`
          mediaPath = path.join(__dirname, '../data/media', mediaType, fileName)
          
          await fs.ensureDir(path.dirname(mediaPath))
          await fs.writeFile(mediaPath, mediaBuffer)
          console.log(`💾 Status media saved to disk: ${mediaPath}`)
        } else {
          console.log('⚠️ Status media download disabled - caching in memory only')
        }
        
        // Cache media (in memory if disk saving disabled, with file path if enabled)
        statusMediaCache.set(messageId, {
          filePath: mediaPath,
          buffer: config.ENABLE_STATUS_MEDIA_DOWNLOAD ? null : mediaBuffer, // Store buffer only if not saving to disk
          type: mediaType,
          mimetype: getMediaMimetype(message.message),
          timestamp: Date.now(),
          caption: getMediaCaption(message.message),
          fileName: fileName
        })
        
        console.log(`✅ Status media cached: ${messageId} (${mediaType})${mediaPath ? ' -> ' + mediaPath : ' in memory'}`)
        
        // Clean up cache and file after 24 hours (status expires)
        setTimeout(async () => {
          const cachedData = statusMediaCache.get(messageId)
          if (cachedData && cachedData.filePath) {
            try {
              await fs.remove(cachedData.filePath)
              console.log(`🗑️ Deleted expired status media file: ${cachedData.filePath}`)
            } catch (e) {
              console.error('Failed to delete expired media file:', e.message)
            }
          }
          statusMediaCache.delete(messageId)
          console.log(`🗑️ Cleaned up expired status cache: ${messageId}`)
        }, 24 * 60 * 60 * 1000)
      }
    }
    
  } catch (error) {
    console.error('Error handling status update:', error)
  }
}

// Function to handle replies to status
async function handleStatusReply(client, message) {
  try {
    const text = require('../lib/utils').getMessageText(message)
    if (!text) return
    
    // Check if message contains "send" keyword (case insensitive)
    const sendKeywords = ['send', 'please send', 'pls send', 'plz send', 'give', 'share']
    const containsSendRequest = sendKeywords.some(keyword => 
      text.toLowerCase().includes(keyword.toLowerCase())
    )
    
    if (!containsSendRequest) return
    
    // Check if this is a reply to owner's status
    const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage
    if (!quotedMessage) return
    
    // Get the quoted message ID to find cached media
    const quotedMessageId = message.message?.extendedTextMessage?.contextInfo?.stanzaId
    if (!quotedMessageId) return
    
    // Check if we have cached media for this status
    const cachedMedia = statusMediaCache.get(quotedMessageId)
    if (!cachedMedia) {
      console.log(`📱 No cached media found for status reply: ${quotedMessageId}`)
      return
    }
    
    const senderJid = message.key.participant || message.key.remoteJid
    console.log(`📤 Sending status media to ${senderJid} who requested: "${text}"`)
    
    // Send the cached media to the requester
    const mediaMessage = await createMediaMessage(cachedMedia)
    
    await client.socket.sendMessage(senderJid, mediaMessage)
    
    console.log(`✅ Status media sent to ${senderJid}`)
    
  } catch (error) {
    console.error('Error handling status reply:', error)
  }
}

// Helper function to get media mimetype
function getMediaMimetype(messageContent) {
  if (messageContent.imageMessage) return messageContent.imageMessage.mimetype || 'image/jpeg'
  if (messageContent.videoMessage) return messageContent.videoMessage.mimetype || 'video/mp4'
  if (messageContent.audioMessage) return messageContent.audioMessage.mimetype || 'audio/ogg'
  if (messageContent.documentMessage) return messageContent.documentMessage.mimetype || 'application/octet-stream'
  if (messageContent.stickerMessage) return messageContent.stickerMessage.mimetype || 'image/webp'
  return 'application/octet-stream'
}

// Helper function to get media caption
function getMediaCaption(messageContent) {
  if (messageContent.imageMessage?.caption) return messageContent.imageMessage.caption
  if (messageContent.videoMessage?.caption) return messageContent.videoMessage.caption
  if (messageContent.documentMessage?.caption) return messageContent.documentMessage.caption
  return ''
}

// Helper function to get media file extension
function getMediaExtension(messageContent) {
  if (messageContent.imageMessage) {
    const mimetype = messageContent.imageMessage.mimetype || 'image/jpeg'
    if (mimetype.includes('png')) return '.png'
    if (mimetype.includes('gif')) return '.gif'
    if (mimetype.includes('webp')) return '.webp'
    return '.jpg'
  }
  if (messageContent.videoMessage) {
    const mimetype = messageContent.videoMessage.mimetype || 'video/mp4'
    if (mimetype.includes('webm')) return '.webm'
    if (mimetype.includes('avi')) return '.avi'
    return '.mp4'
  }
  if (messageContent.audioMessage) {
    const mimetype = messageContent.audioMessage.mimetype || 'audio/ogg'
    if (mimetype.includes('mp3')) return '.mp3'
    if (mimetype.includes('wav')) return '.wav'
    return '.ogg'
  }
  if (messageContent.stickerMessage) return '.webp'
  if (messageContent.documentMessage) {
    return messageContent.documentMessage.fileName ? 
      path.extname(messageContent.documentMessage.fileName) : '.bin'
  }
  return '.bin'
}

// Helper function to create media message from cached data
async function createMediaMessage(cachedMedia) {
  const message = {}
  
  try {
    // Get media buffer - either from file or memory
    let mediaBuffer
    if (cachedMedia.buffer) {
      // Media is stored in memory
      mediaBuffer = cachedMedia.buffer
    } else if (cachedMedia.filePath) {
      // Media is stored on disk
      mediaBuffer = await fs.readFile(cachedMedia.filePath)
    } else {
      throw new Error('No media buffer or file path available')
    }
    
    switch (cachedMedia.type) {
      case 'image':
        message.image = mediaBuffer
        if (cachedMedia.caption) message.caption = cachedMedia.caption
        break
      case 'video':
        message.video = mediaBuffer
        if (cachedMedia.caption) message.caption = cachedMedia.caption
        break
      case 'audio':
        message.audio = mediaBuffer
        message.mimetype = cachedMedia.mimetype
        break
      case 'document':
        message.document = mediaBuffer
        message.mimetype = cachedMedia.mimetype
        if (cachedMedia.caption) message.caption = cachedMedia.caption
        break
      case 'sticker':
        message.sticker = mediaBuffer
        break
      default:
        message.document = mediaBuffer
        message.mimetype = cachedMedia.mimetype
    }
    
    return message
    
  } catch (error) {
    console.error('Error reading cached media:', error)
    // Return empty message if media reading fails
    return { text: '❌ Media not found or corrupted' }
  }
}

// Hook into the client's message handling to intercept status updates and replies
const originalHandleMessage = require('../lib/client').Client.prototype.handleMessage

require('../lib/client').Client.prototype.handleMessage = async function(message) {
  try {
    // Handle status updates (when owner posts to status)
    if (message.key.remoteJid === 'status@broadcast') {
      await handleStatusUpdate(this, message)
    }
    
    // Handle potential status replies
    const text = require('../lib/utils').getMessageText(message)
    if (text && message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
      await handleStatusReply(this, message)
    }
    
    // Call original handler
    return await originalHandleMessage.call(this, message)
    
  } catch (error) {
    console.error('Status sender error:', error)
    // Call original handler even if status sender fails
    return await originalHandleMessage.call(this, message)
  }
}

console.log('📱 Status auto-sender plugin loaded')
