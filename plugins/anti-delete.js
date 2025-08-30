
const { bot } = require('../lib/client')
const fs = require('fs-extra')
const path = require('path')

// Store for tracking messages temporarily
const messageTracker = new Map()

// Configuration for anti-delete
let antiDeleteConfig = {
  enabled: true,
  sendToPersonal: true, // Send to user's personal chat
  customJid: null, // Optional: specific JID to send deleted messages
  trackDuration: 3 * 24 * 60 * 60 * 1000, // Track messages for 3 days
  ignoreOwner: true // Don't track owner's deleted messages
}

// Load configuration
async function loadAntiDeleteConfig() {
  try {
    const configPath = path.join(__dirname, '../data/plugins/anti-delete-config.json')
    if (await fs.pathExists(configPath)) {
      const config = await fs.readJson(configPath)
      antiDeleteConfig = { ...antiDeleteConfig, ...config }
    }
  } catch (error) {
    console.error('Failed to load anti-delete config:', error)
  }
}

// Save configuration
async function saveAntiDeleteConfig() {
  try {
    const configPath = path.join(__dirname, '../data/plugins/anti-delete-config.json')
    await fs.ensureDir(path.dirname(configPath))
    await fs.writeJson(configPath, antiDeleteConfig)
  } catch (error) {
    console.error('Failed to save anti-delete config:', error)
  }
}

// Track new messages
async function trackMessage(message, messageText, socket) {
  if (!antiDeleteConfig.enabled) return
  
  const messageId = message.key.id
  const senderJid = message.key.participant || message.key.remoteJid
  const chatJid = message.key.remoteJid
  const isFromOwner = message.key.fromMe
  
  // Skip if ignoring owner messages and this is from owner
  if (antiDeleteConfig.ignoreOwner && isFromOwner) return
  
  // Check if message has media and download it
  let mediaData = null
  if (hasMedia(message.message) && socket) {
    try {
      const { downloadMedia } = require('../lib/utils')
      const buffer = await downloadMedia(message, socket)
      if (buffer) {
        mediaData = {
          buffer: buffer,
          type: getMessageType(message.message),
          mimetype: getMediaMimetype(message.message),
          filename: getMediaFilename(message.message)
        }
      }
    } catch (error) {
      console.error('Failed to download media for tracking:', error)
    }
  }
  
  // Store message data
  messageTracker.set(messageId, {
    id: messageId,
    senderJid,
    chatJid,
    text: messageText,
    timestamp: Date.now(),
    isFromOwner,
    isGroup: chatJid.endsWith('@g.us'),
    originalMessage: message,
    mediaData: mediaData
  })
  
  // Clean up old messages
  setTimeout(() => {
    messageTracker.delete(messageId)
  }, antiDeleteConfig.trackDuration)
}

// Helper functions for media handling
function hasMedia(messageContent) {
  return !!(messageContent.imageMessage || 
           messageContent.videoMessage || 
           messageContent.audioMessage || 
           messageContent.documentMessage || 
           messageContent.stickerMessage)
}

function getMessageType(messageContent) {
  if (messageContent.imageMessage) return 'image'
  if (messageContent.videoMessage) return 'video'
  if (messageContent.audioMessage) return 'audio'
  if (messageContent.documentMessage) return 'document'
  if (messageContent.stickerMessage) return 'sticker'
  return 'text'
}

function getMediaMimetype(messageContent) {
  if (messageContent.imageMessage) return messageContent.imageMessage.mimetype
  if (messageContent.videoMessage) return messageContent.videoMessage.mimetype
  if (messageContent.audioMessage) return messageContent.audioMessage.mimetype
  if (messageContent.documentMessage) return messageContent.documentMessage.mimetype
  if (messageContent.stickerMessage) return messageContent.stickerMessage.mimetype
  return null
}

function getMediaFilename(messageContent) {
  if (messageContent.documentMessage?.fileName) return messageContent.documentMessage.fileName
  if (messageContent.imageMessage) return 'image.jpg'
  if (messageContent.videoMessage) return 'video.mp4'
  if (messageContent.audioMessage) return 'audio.ogg'
  if (messageContent.stickerMessage) return 'sticker.webp'
  return 'media'
}

// Handle message deletion detection
async function handleDeletedMessage(socket, deletedMessageId, chatJid) {
  if (!antiDeleteConfig.enabled) return
  
  const trackedMessage = messageTracker.get(deletedMessageId)
  if (!trackedMessage) return
  
  try {
    // Determine where to send the deleted message
    let targetJid = antiDeleteConfig.customJid
    
    if (!targetJid && antiDeleteConfig.sendToPersonal) {
      // Send to user's personal chat
      targetJid = trackedMessage.senderJid.includes('@g.us') 
        ? trackedMessage.senderJid 
        : trackedMessage.senderJid.split('@')[0] + '@s.whatsapp.net'
    }
    
    if (!targetJid) return
    
    // Format the recovery message
    const chatName = trackedMessage.isGroup ? chatJid : 'Private Chat'
    const senderName = trackedMessage.senderJid.split('@')[0]
    const timeDeleted = new Date().toLocaleString()
    
    let recoveryMessage = `🗑️ *DELETED MESSAGE DETECTED*\n\n`
    recoveryMessage += `👤 *Sender:* ${senderName}\n`
    recoveryMessage += `💬 *Chat:* ${chatName}\n`
    recoveryMessage += `⏰ *Deleted at:* ${timeDeleted}\n`
    
    // Send text part if exists
    if (trackedMessage.text) {
      recoveryMessage += `📝 *Original Message:*\n\n"${trackedMessage.text}"`
    }
    
    // Send recovery message first
    await socket.sendMessage(targetJid, { text: recoveryMessage })
    
    // Send media if available
    if (trackedMessage.mediaData && trackedMessage.mediaData.buffer) {
      const mediaData = trackedMessage.mediaData
      let mediaMessage = {}
      
      switch (mediaData.type) {
        case 'image':
          mediaMessage = {
            image: mediaData.buffer,
            caption: `🗑️ Deleted ${mediaData.type} from ${senderName}`,
            mimetype: mediaData.mimetype
          }
          break
        case 'video':
          mediaMessage = {
            video: mediaData.buffer,
            caption: `🗑️ Deleted ${mediaData.type} from ${senderName}`,
            mimetype: mediaData.mimetype
          }
          break
        case 'audio':
          mediaMessage = {
            audio: mediaData.buffer,
            mimetype: mediaData.mimetype,
            ptt: false
          }
          break
        case 'document':
          mediaMessage = {
            document: mediaData.buffer,
            mimetype: mediaData.mimetype,
            fileName: `deleted_${mediaData.filename}`
          }
          break
        case 'sticker':
          mediaMessage = {
            sticker: mediaData.buffer
          }
          break
      }
      
      if (Object.keys(mediaMessage).length > 0) {
        await socket.sendMessage(targetJid, mediaMessage)
        console.log(`🗑️ Deleted media (${mediaData.type}) recovered and sent`)
      }
    }
    
    console.log(`🗑️ Deleted message recovered and sent to ${targetJid}`)
    
  } catch (error) {
    console.error('Error handling deleted message:', error)
  }
}

// Initialize anti-delete system
async function initializeAntiDelete() {
  await loadAntiDeleteConfig()
  console.log('🛡️ Anti-delete system initialized')
}

// Hook into message handling
bot(
  {
    pattern: 'delete ?(.*)',
    desc: 'Configure anti-delete settings',
    type: 'system',
  },
  async (message, match) => {
    // Only owner can configure
    if (!message.key.fromMe && message.sender !== message.client.ownerJid) {
      return await message.reply('❌ Only owner can configure anti-delete settings')
    }
    
    const param = match.trim().toLowerCase()
    
    if (!param) {
      // Show current status
      const status = antiDeleteConfig.enabled ? '🟢 ON' : '🔴 OFF'
      const target = antiDeleteConfig.customJid 
        ? antiDeleteConfig.customJid
        : 'User Personal Chat'
      
      return await message.reply(
        `🛡️ *Anti-Delete Status*\n\n` +
        `Status: ${status}\n` +
        `Target: ${target}\n\n` +
        `*Commands:*\n` +
        `• \`.delete on\` - Enable anti-delete\n` +
        `• \`.delete off\` - Disable anti-delete\n` +
        `• \`.delete <jid>\` - Set custom JID`
      )
    }
    
    if (param === 'on') {
      antiDeleteConfig.enabled = true
      await saveAntiDeleteConfig()
      return await message.reply('✅ Anti-delete enabled')
    }
    
    if (param === 'off') {
      antiDeleteConfig.enabled = false
      await saveAntiDeleteConfig()
      return await message.reply('❌ Anti-delete disabled')
    }
    
    // If it's not 'on' or 'off', treat it as JID
    if (param.includes('@')) {
      antiDeleteConfig.customJid = param
      antiDeleteConfig.sendToPersonal = false
      await saveAntiDeleteConfig()
      return await message.reply(`✅ Anti-delete will send to: ${param}`)
    } else {
      return await message.reply('❌ Invalid JID format or command\n\nUse: `.delete on/off` or `.delete <jid>`')
    }
  }
)

// Initialize the system
initializeAntiDelete()

// Export functions for use in client
module.exports = {
  trackMessage,
  handleDeletedMessage,
  antiDeleteConfig
}
