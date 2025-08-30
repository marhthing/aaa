
const { bot } = require('../lib/client')
const fs = require('fs-extra')
const path = require('path')

// Store for tracking messages temporarily
const messageTracker = new Map()

// Store to prevent duplicate deletion notifications
const deletionCache = new Map()

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
  const isGroup = chatJid.endsWith('@g.us')
  
  // Skip if ignoring owner messages and this is from owner
  if (antiDeleteConfig.ignoreOwner && isFromOwner) {
    return
  }

  // Only track messages in groups or from non-owners (where deletion detection matters)
  if (!isGroup && isFromOwner) {
    return // Don't track owner's personal messages
  }
  
  // Only log tracking for debugging, not every message
  if (process.env.DEBUG_ANTI_DELETE === 'true') {
    console.log(`📝 Tracking message: ${messageId} from ${senderJid} in ${chatJid}`)
  }
  
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
  console.log(`🗑️ Deletion handler called for: ${deletedMessageId} in ${chatJid}`)
  
  if (!antiDeleteConfig.enabled) {
    console.log(`❌ Anti-delete disabled, skipping`)
    return
  }
  
  // Create a unique key for this deletion event to prevent duplicates
  const deletionKey = `${deletedMessageId}_${normalizeJid(chatJid)}`
  
  // Check if we've already processed this deletion recently (within 5 seconds)
  const now = Date.now()
  const lastProcessed = deletionCache.get(deletionKey)
  if (lastProcessed && (now - lastProcessed) < 5000) {
    console.log(`⏭️ Duplicate deletion event ignored: ${deletedMessageId}`)
    return
  }
  
  // Store this deletion event
  deletionCache.set(deletionKey, now)
  
  // Clean up old deletion cache entries (older than 1 minute)
  for (const [key, timestamp] of deletionCache.entries()) {
    if (now - timestamp > 60000) {
      deletionCache.delete(key)
    }
  }
  
  // If ignoring owner messages, check if this deletion is from owner and skip
  if (antiDeleteConfig.ignoreOwner && socket.user) {
    const ownerJid = socket.user.id
    const normalizedChatJid = normalizeJid(chatJid)
    const normalizedOwnerJid = normalizeJid(ownerJid)
    
    // Skip if the chat is with owner (personal messages from owner)
    if (normalizedChatJid === normalizedOwnerJid) {
      console.log(`⏭️ Skipping owner message deletion: ${deletedMessageId}`)
      return
    }
  }
  
  // First check in-memory tracker
  let trackedMessage = messageTracker.get(deletedMessageId)
  
  // If not found in memory, search in archived messages
  if (!trackedMessage) {
    console.log(`🔍 Message not in memory tracker, searching in archived messages...`)
    trackedMessage = await searchArchivedMessage(deletedMessageId, chatJid)
  }
  
  if (!trackedMessage) {
    console.log(`❌ Message not found in tracker or archives: ${deletedMessageId}`)
    console.log(`📊 Currently tracking ${messageTracker.size} messages`)
    return
  }
  
  console.log(`✅ Found deleted message in tracker: ${deletedMessageId}`)
  
  try {
    // Determine where to send the deleted message
    let targetJid = antiDeleteConfig.customJid
    
    if (!targetJid && antiDeleteConfig.sendToPersonal) {
      // Send to owner's personal chat (bot owner's own number)
      if (socket.user && socket.user.id) {
        targetJid = socket.user.id  // Send to bot owner
      } else {
        // Fallback: use the chat where deletion occurred
        targetJid = chatJid
      }
    }
    
    if (!targetJid) return
    
    // Get sender name (remove @s.whatsapp.net and any numbers after ':')
    const senderName = trackedMessage.senderJid.split('@')[0].split(':')[0]
    
    // Send text part if exists using tag format like WhatsApp
    if (trackedMessage.text) {
      // Create a tagged message format similar to WhatsApp quote style
      const taggedMessage = `┌ ${senderName}\n│ ${trackedMessage.text}\n└ 🗑️ _This message was deleted_`
      
      await socket.sendMessage(targetJid, { text: taggedMessage })
    } else {
      // For media-only messages
      const taggedMessage = `┌ ${senderName}\n└ 🗑️ _This media was deleted_`
      await socket.sendMessage(targetJid, { text: taggedMessage })
    }
    
    // Send media if available
    if (trackedMessage.mediaData && trackedMessage.mediaData.buffer) {
      const mediaData = trackedMessage.mediaData
      let mediaMessage = {}
      
      switch (mediaData.type) {
        case 'image':
          mediaMessage = {
            image: mediaData.buffer,
            caption: `🗑️ _Deleted by ${senderName}_`,
            mimetype: mediaData.mimetype
          }
          break
        case 'video':
          mediaMessage = {
            video: mediaData.buffer,
            caption: `🗑️ _Deleted by ${senderName}_`,
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
            fileName: mediaData.filename || 'deleted_file'
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

// Search for message in archived data
async function searchArchivedMessage(messageId, chatJid) {
  try {
    const isGroup = chatJid.endsWith('@g.us')
    const category = isGroup ? 'groups' : 'individual'
    
    // Search in the last 3 days
    for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
      const searchDate = new Date()
      searchDate.setDate(searchDate.getDate() - dayOffset)
      
      const year = searchDate.getFullYear()
      const month = String(searchDate.getMonth() + 1).padStart(2, '0')
      const day = String(searchDate.getDate()).padStart(2, '0')
      
      const archivePath = path.join(
        __dirname, '../data/messages',
        year.toString(),
        month,
        category,
        `${day}.json`
      )
      
      if (await fs.pathExists(archivePath)) {
        const messages = await fs.readJson(archivePath)
        const foundMessage = messages.find(msg => msg.id === messageId)
        
        if (foundMessage) {
          console.log(`✅ Found deleted message in archives: ${messageId}`)
          
          // Convert archived message to tracker format
          return {
            id: foundMessage.id,
            senderJid: foundMessage.from,
            chatJid: foundMessage.to,
            text: foundMessage.body,
            timestamp: new Date(foundMessage.timestamp).getTime(),
            isFromOwner: foundMessage.isOutgoing,
            isGroup: foundMessage.isGroup,
            originalMessage: null,
            mediaData: foundMessage.mediaPath ? await loadArchivedMedia(foundMessage.mediaPath) : null
          }
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error searching archived messages:', error)
    return null
  }
}

// Load archived media if available
async function loadArchivedMedia(mediaPath) {
  try {
    if (!mediaPath || !await fs.pathExists(mediaPath)) return null
    
    const buffer = await fs.readFile(mediaPath)
    const extension = path.extname(mediaPath).toLowerCase()
    
    let type = 'document'
    let mimetype = 'application/octet-stream'
    
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extension)) {
      type = 'image'
      mimetype = `image/${extension.slice(1)}`
    } else if (['.mp4', '.avi', '.mov', '.webm'].includes(extension)) {
      type = 'video'
      mimetype = `video/${extension.slice(1)}`
    } else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(extension)) {
      type = 'audio'
      mimetype = `audio/${extension.slice(1)}`
    }
    
    return {
      buffer,
      type,
      mimetype,
      filename: path.basename(mediaPath)
    }
  } catch (error) {
    console.error('Error loading archived media:', error)
    return null
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

// Helper function to normalize JID for comparison
function normalizeJid(jid) {
  if (!jid) return ''
  
  // Remove any suffix numbers that WhatsApp sometimes adds
  // Convert 2347046040727:26@s.whatsapp.net to 2347046040727@s.whatsapp.net
  return jid.replace(/:\d+@/, '@')
}

// Initialize the system
initializeAntiDelete()

// Export functions for use in client
module.exports = {
  trackMessage,
  handleDeletedMessage,
  antiDeleteConfig
}
