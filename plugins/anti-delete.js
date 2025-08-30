
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
  trackDuration: 24 * 60 * 60 * 1000, // Track messages for 24 hours
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
function trackMessage(message, messageText) {
  if (!antiDeleteConfig.enabled) return
  
  const messageId = message.key.id
  const senderJid = message.key.participant || message.key.remoteJid
  const chatJid = message.key.remoteJid
  const isFromOwner = message.key.fromMe
  
  // Skip if ignoring owner messages and this is from owner
  if (antiDeleteConfig.ignoreOwner && isFromOwner) return
  
  // Store message data
  messageTracker.set(messageId, {
    id: messageId,
    senderJid,
    chatJid,
    text: messageText,
    timestamp: Date.now(),
    isFromOwner,
    isGroup: chatJid.endsWith('@g.us'),
    originalMessage: message
  })
  
  // Clean up old messages
  setTimeout(() => {
    messageTracker.delete(messageId)
  }, antiDeleteConfig.trackDuration)
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
    recoveryMessage += `📝 *Original Message:*\n\n"${trackedMessage.text || '[Media/System Message]'}"`
    
    // Send recovery message
    await socket.sendMessage(targetJid, { text: recoveryMessage })
    
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
