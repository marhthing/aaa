
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
    pattern: 'antidelete ?(.*)',
    desc: 'Configure anti-delete settings',
    type: 'system',
  },
  async (message, match) => {
    // Only owner can configure
    if (!message.key.fromMe && message.sender !== message.client.ownerJid) {
      return await message.reply('❌ Only owner can configure anti-delete settings')
    }
    
    const args = match.trim().split(' ')
    const action = args[0]?.toLowerCase()
    
    if (!action) {
      const status = antiDeleteConfig.enabled ? '🟢 Enabled' : '🔴 Disabled'
      const target = antiDeleteConfig.customJid 
        ? `Custom JID: ${antiDeleteConfig.customJid}` 
        : antiDeleteConfig.sendToPersonal 
          ? 'Personal Chat' 
          : 'Disabled'
      
      return await message.reply(
        `🛡️ *Anti-Delete Status*\n\n` +
        `Status: ${status}\n` +
        `Target: ${target}\n` +
        `Track Duration: ${antiDeleteConfig.trackDuration / 1000 / 60 / 60}h\n` +
        `Ignore Owner: ${antiDeleteConfig.ignoreOwner ? 'Yes' : 'No'}\n\n` +
        `*Commands:*\n` +
        `• \`.antidelete enable\` - Enable anti-delete\n` +
        `• \`.antidelete disable\` - Disable anti-delete\n` +
        `• \`.antidelete setjid <jid>\` - Set custom JID\n` +
        `• \`.antidelete personal\` - Send to personal chat\n` +
        `• \`.antidelete ignore owner on/off\` - Toggle owner ignore`
      )
    }
    
    switch (action) {
      case 'enable':
        antiDeleteConfig.enabled = true
        await saveAntiDeleteConfig()
        return await message.reply('✅ Anti-delete enabled')
        
      case 'disable':
        antiDeleteConfig.enabled = false
        await saveAntiDeleteConfig()
        return await message.reply('❌ Anti-delete disabled')
        
      case 'setjid':
        const jid = args[1]
        if (!jid) {
          return await message.reply('❌ Usage: .antidelete setjid <jid>')
        }
        antiDeleteConfig.customJid = jid
        antiDeleteConfig.sendToPersonal = false
        await saveAntiDeleteConfig()
        return await message.reply(`✅ Anti-delete will send to: ${jid}`)
        
      case 'personal':
        antiDeleteConfig.sendToPersonal = true
        antiDeleteConfig.customJid = null
        await saveAntiDeleteConfig()
        return await message.reply('✅ Anti-delete will send to personal chat')
        
      case 'ignore':
        if (args[1] === 'owner') {
          const setting = args[2]?.toLowerCase()
          if (setting === 'on') {
            antiDeleteConfig.ignoreOwner = true
            await saveAntiDeleteConfig()
            return await message.reply('✅ Will ignore owner deleted messages')
          } else if (setting === 'off') {
            antiDeleteConfig.ignoreOwner = false
            await saveAntiDeleteConfig()
            return await message.reply('✅ Will track owner deleted messages')
          }
        }
        return await message.reply('❌ Usage: .antidelete ignore owner on/off')
        
      default:
        return await message.reply('❌ Invalid option. Use `.antidelete` to see available commands')
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
