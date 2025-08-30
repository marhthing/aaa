
const { bot } = require('../lib/client')
const config = require('../config')
const fs = require('fs-extra')
const path = require('path')

// No cache needed - we search media files directly


// Helper function to find media file by message ID (no cache needed)
async function findMediaFileByMessageId(messageId) {
  try {
    const mediaTypes = ['image', 'video', 'audio', 'document', 'sticker']
    
    for (const mediaType of mediaTypes) {
      const mediaDir = path.join(config.MEDIA_DIR, mediaType)
      
      if (await fs.pathExists(mediaDir)) {
        const files = await fs.readdir(mediaDir)
        
        // Look for files that contain the message ID in filename
        const matchingFile = files.find(file => file.includes(messageId))
        
        if (matchingFile) {
          const fullPath = path.join(mediaDir, matchingFile)
          return {
            filePath: fullPath,
            type: mediaType,
            mimetype: getDefaultMimetype(mediaType),
            fileName: matchingFile
          }
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error finding media file:', error)
    return null
  }
}

// Helper function to get default mimetype by media type
function getDefaultMimetype(mediaType) {
  switch (mediaType) {
    case 'image': return 'image/jpeg'
    case 'video': return 'video/mp4'
    case 'audio': return 'audio/ogg'
    case 'sticker': return 'image/webp'
    case 'document': return 'application/octet-stream'
    default: return 'application/octet-stream'
  }
}

// Helper function to create media message from file info
async function createMediaMessageFromFile(mediaFile) {
  const message = {}
  
  try {
    if (!mediaFile.filePath) {
      throw new Error('No file path available')
    }
    
    // Read media from file
    const mediaBuffer = await fs.readFile(mediaFile.filePath)
    
    switch (mediaFile.type) {
      case 'image':
        message.image = mediaBuffer
        break
      case 'video':
        message.video = mediaBuffer
        break
      case 'audio':
        message.audio = mediaBuffer
        message.mimetype = mediaFile.mimetype
        break
      case 'document':
        message.document = mediaBuffer
        message.mimetype = mediaFile.mimetype
        break
      case 'sticker':
        message.sticker = mediaBuffer
        break
      default:
        message.document = mediaBuffer
        message.mimetype = mediaFile.mimetype
    }
    
    return message
    
  } catch (error) {
    console.error('Error reading media file:', error)
    return { text: '❌ Media file not found' }
  }
}

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
    desc: 'Save status media to bot owner personal chat',
    type: 'utility',
  },
  async (message, match) => {
    try {
      console.log('🔍 Save command started - checking quoted message...')
      
      // Check if this is a reply to a status
      const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage
      console.log(`🔍 Quoted message exists: ${!!quotedMessage}`)
      
      if (!quotedMessage) {
        console.log('❌ No quoted message found')
        return await message.reply('❌ Please reply to a status message with .save to save the media')
      }

      // Get the quoted message ID
      const quotedMessageId = message.message?.extendedTextMessage?.contextInfo?.stanzaId
      console.log(`🔍 Quoted message ID: ${quotedMessageId}`)
      
      if (!quotedMessageId) {
        console.log('❌ No quoted message ID found')
        return await message.reply('❌ Unable to identify the status message')
      }

      // Find media file directly from storage using message ID
      console.log(`🔍 Searching for media file with message ID: ${quotedMessageId}`)
      
      const mediaFile = await findMediaFileByMessageId(quotedMessageId)
      console.log(`🔍 Media file found: ${!!mediaFile}`)
      
      if (!mediaFile) {
        console.log('❌ No media file found for this message ID')
        return await message.reply('❌ No media found for this status. Media may have been deleted.')
      }

      // Send the media to bot owner's personal chat
      const botOwnerJid = message.client.ownerJid
      console.log(`💾 Saving status media to bot owner's personal chat: ${botOwnerJid}`)
      
      const mediaMessage = await createMediaMessageFromFile(mediaFile)
      await message.client.socket.sendMessage(botOwnerJid, mediaMessage)
      
      await message.reply('✅ Status media saved to bot owner personal chat!')
      console.log(`✅ Status media saved for bot owner: ${botOwnerJid}`)
      
    } catch (error) {
      console.error('❌ Error saving status media:', error)
      await message.reply('❌ Failed to save status media. Please try again.')
    }
  }
)

bot(
  {
    pattern: 'send ?(.*)',
    desc: 'Send status media to specified JID',
    type: 'utility',
  },
  async (message, match) => {
    try {
      const targetJid = match[1]?.trim()
      
      if (!targetJid) {
        return await message.reply('❌ Please specify a JID: .send <jid>\nExample: .send 2347012345678@s.whatsapp.net')
      }

      // Check if this is a reply to a status
      const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage
      if (!quotedMessage) {
        return await message.reply('❌ Please reply to a status message with .send <jid> to send the media')
      }

      // Get the quoted message ID
      const quotedMessageId = message.message?.extendedTextMessage?.contextInfo?.stanzaId
      if (!quotedMessageId) {
        return await message.reply('❌ Unable to identify the status message')
      }

      // Find media file directly from storage using message ID
      const mediaFile = await findMediaFileByMessageId(quotedMessageId)
      if (!mediaFile) {
        return await message.reply('❌ No media found for this status. Media may have been deleted.')
      }

      // Send the media to specified JID
      console.log(`💾 Sending status media to specified JID: ${targetJid}`)
      
      const mediaMessage = await createMediaMessageFromFile(mediaFile)
      await message.client.socket.sendMessage(targetJid, mediaMessage)
      
      await message.reply(`✅ Status media sent to ${targetJid}!`)
      console.log(`✅ Status media sent to specified JID: ${targetJid}`)
      
    } catch (error) {
      console.error('Error sending status media to JID:', error)
      await message.reply('❌ Failed to send status media. Please check the JID and try again.')
    }
  }
)

// Function to handle status updates (when owner posts to status)
async function handleStatusUpdate(client, message) {
  try {
    console.log(`🔍 Status update check: remoteJid=${message.key.remoteJid}, participant=${message.key.participant}`)
    
    // Check if this is a status update from the bot owner
    const isStatusUpdate = message.key.remoteJid === 'status@broadcast'
    const senderJid = message.key.participant || message.key.remoteJid
    const isFromOwner = client.isOwnerJid(senderJid)
    
    console.log(`🔍 Status analysis: isStatusUpdate=${isStatusUpdate}, isFromOwner=${isFromOwner}, senderJid=${senderJid}`)
    console.log(`🔍 Owner comparison: bot owner=${client.ownerJid}, status sender=${senderJid}`)
    
    if (!isStatusUpdate) return
    
    // Handle both owner's status and other people's status
    if (!isFromOwner) {
      console.log('📱 Status from other user - will cache for .save feature')
    }
    
    // Check if status contains media
    if (client.hasMedia(message.message)) {
      const userType = isFromOwner ? 'Owner' : 'User'
      console.log(`📱 ${userType} posted media status, waiting for media archive to save it...`)
      
      // Wait a bit for the media archive system to save the media first
      setTimeout(async () => {
        try {
          // Find the media file that was saved by the media archive system
          const mediaPath = await findArchivedStatusMedia(message, client)
          
          if (mediaPath) {
            const mediaType = client.getMessageType(message.message)
            const messageId = message.key.id
            
            // Cache reference to the already-saved media file
            statusMediaCache.set(messageId, {
              filePath: mediaPath,
              type: mediaType,
              mimetype: getMediaMimetype(message.message),
              timestamp: Date.now(),
              caption: getMediaCaption(message.message),
              archived: true // Flag to indicate this is from archive
            })
            
            console.log(`✅ Status media reference cached: ${messageId} -> ${mediaPath}`)
            
            // Clean up cache after 24 hours (but don't delete the archived file)
            setTimeout(() => {
              statusMediaCache.delete(messageId)
              console.log(`🗑️ Cleaned up expired status cache: ${messageId}`)
            }, 24 * 60 * 60 * 1000)
          } else {
            console.log('⚠️ Could not find archived media for status')
          }
        } catch (error) {
          console.error('Error finding archived status media:', error)
        }
      }, 2000) // 2 second delay to let media archive save first
    } else {
      console.log('📱 Owner posted text status (no media)')
    }
    
  } catch (error) {
    console.error('Error handling status update:', error)
  }
}

// Helper function to find media that was already saved by the media archive system
async function findArchivedStatusMedia(message, client) {
  try {
    const mediaType = client.getMessageType(message.message)
    const messageId = message.key.id
    const senderJid = message.key.participant || message.sender
    const senderNumber = senderJid.split('@')[0]
    
    // Media archive saves with pattern: {senderNumber}_{messageId}_{timestamp}.{extension}
    const mediaDir = path.join(config.MEDIA_DIR, mediaType)
    
    // Look for files that match the sender and message ID pattern
    const files = await fs.readdir(mediaDir).catch(() => [])
    const matchingFile = files.find(file => 
      file.startsWith(`${senderNumber}_${messageId}_`)
    )
    
    if (matchingFile) {
      const fullPath = path.join(mediaDir, matchingFile)
      // Verify file exists and is readable
      const fileExists = await fs.pathExists(fullPath)
      if (fileExists) {
        return fullPath
      }
    }
    
    return null
  } catch (error) {
    console.error('Error finding archived media:', error)
    return null
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
    
    // Find media file directly from storage using message ID
    const mediaFile = await findMediaFileByMessageId(quotedMessageId)
    if (!mediaFile) {
      console.log(`📱 No media file found for status reply: ${quotedMessageId}`)
      return
    }
    
    const senderJid = message.key.participant || message.key.remoteJid
    console.log(`📤 Sending status media to ${senderJid} who requested: "${text}"`)
    
    // Send the media to the requester
    const mediaMessage = await createMediaMessageFromFile(mediaFile)
    
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
