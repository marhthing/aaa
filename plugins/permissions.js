
const { bot } = require('../lib/client')
const config = require('../config')

bot(
  {
    pattern: 'allow (.*)',
    desc: 'Allow a user to use a specific command - flexible syntax',
    type: 'owner',
  },
  async (message, match) => {
    const input = match.trim()
    
    if (!input) {
      return await message.reply('❌ Usage examples:\n• `.allow ping` - Allow current chat user to use ping\n• `.allow @user ping` - Allow tagged user to use ping\n• `.allow <jid> ping` - Allow specific JID to use ping')
    }
    
    // Only owner can grant permissions
    if (!message.key.fromMe && !message.client.isOwnerJid(message.sender)) {
      return await message.reply('❌ Only owner can grant permissions')
    }
    
    let targetJid = null
    let commandToAllow = null
    
    // Check for mentioned users first (when tagging someone)
    if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
      // Tagged user case: .allow @user ping
      targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0]
      // Extract command from input (last word after removing @mentions)
      const words = input.split(' ').filter(word => !word.startsWith('@') && word.trim())
      commandToAllow = words[words.length - 1]
    } else {
      // No mentions - parse input normally
      const parts = input.split(' ')
      
      if (parts.length === 1) {
        // Case: .allow ping (allow current chat user)
        commandToAllow = parts[0]
        
        if (message.isGroup) {
          return await message.reply('❌ In group chats, please tag a user:\n• `.allow @user ping`')
        } else {
          // In private chat, target is the other participant
          targetJid = message.key.remoteJid
        }
      } else if (parts.length === 2) {
        // Case: .allow <jid> ping
        const firstPart = parts[0]
        commandToAllow = parts[1]
        
        // Check if it's a JID format
        if (firstPart.includes('@')) {
          targetJid = firstPart
        } else {
          return await message.reply('❌ Invalid format. Use:\n• `.allow ping` (in private chat)\n• `.allow @user ping` (tag user)\n• `.allow <jid> ping` (specify JID)')
        }
      } else {
        return await message.reply('❌ Invalid format. Use:\n• `.allow ping` - Allow current chat user\n• `.allow @user ping` - Allow tagged user\n• `.allow <jid> ping` - Allow specific JID')
      }
    }
    
    if (!targetJid || !commandToAllow) {
      return await message.reply('❌ Could not determine target user or command')
    }
    
    // Validate command name
    if (!commandToAllow.match(/^[a-zA-Z0-9_-]+$/)) {
      return await message.reply('❌ Invalid command name. Use only letters, numbers, underscore, and dash.')
    }
    
    // Grant permission
    message.client.allowCommand(targetJid, commandToAllow)
    
    // Get user-friendly display name
    const displayName = targetJid.includes('@') ? targetJid.split('@')[0] : targetJid
    
    return await message.reply(`✅ User ${displayName} can now use **.${commandToAllow}**`)
  }
)

bot(
  {
    pattern: 'disallow (.*)',
    desc: 'Remove user permission for a specific command - flexible syntax',
    type: 'owner',
  },
  async (message, match) => {
    const input = match.trim()
    
    if (!input) {
      return await message.reply('❌ Usage examples:\n• `.disallow ping` - Remove current chat user ping access\n• `.disallow @user ping` - Remove tagged user ping access\n• `.disallow <jid> ping` - Remove specific JID ping access')
    }
    
    // Only owner can revoke permissions
    if (!message.key.fromMe && !message.client.isOwnerJid(message.sender)) {
      return await message.reply('❌ Only owner can revoke permissions')
    }
    
    let targetJid = null
    let commandToDisallow = null
    
    // Check for mentioned users first (when tagging someone)
    if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
      // Tagged user case: .disallow @user ping
      targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0]
      // Extract command from input (last word after removing @mentions)
      const words = input.split(' ').filter(word => !word.startsWith('@') && word.trim())
      commandToDisallow = words[words.length - 1]
    } else {
      // No mentions - parse input normally
      const parts = input.split(' ')
      
      if (parts.length === 1) {
        // Case: .disallow ping (disallow current chat user)
        commandToDisallow = parts[0]
        
        if (message.isGroup) {
          return await message.reply('❌ In group chats, please tag a user:\n• `.disallow @user ping`')
        } else {
          // In private chat, target is the other participant
          targetJid = message.key.remoteJid
        }
      } else if (parts.length === 2) {
        // Case: .disallow <jid> ping
        const firstPart = parts[0]
        commandToDisallow = parts[1]
        
        // Check if it's a JID format
        if (firstPart.includes('@')) {
          targetJid = firstPart
        } else {
          return await message.reply('❌ Invalid format. Use:\n• `.disallow ping` (in private chat)\n• `.disallow @user ping` (tag user)\n• `.disallow <jid> ping` (specify JID)')
        }
      } else {
        return await message.reply('❌ Invalid format. Use:\n• `.disallow ping` - Remove current chat user access\n• `.disallow @user ping` - Remove tagged user access\n• `.disallow <jid> ping` - Remove specific JID access')
      }
    }
    
    if (!targetJid || !commandToDisallow) {
      return await message.reply('❌ Could not determine target user or command')
    }
    
    // Revoke permission
    message.client.disallowCommand(targetJid, commandToDisallow)
    
    // Get user-friendly display name
    const displayName = targetJid.includes('@') ? targetJid.split('@')[0] : targetJid
    
    return await message.reply(`❌ Removed **.${commandToDisallow}** access for ${displayName}`)
  }
)

bot(
  {
    pattern: 'pm ?(.*)',
    desc: 'Show permissions for user',
    type: 'misc',
  },
  async (message, match) => {
    let targetJid = null
    
    // In group chats, check for mentioned users
    if (message.isGroup) {
      if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0]
      } else {
        return await message.reply('❌ Tag a user to check their permissions')
      }
    } else {
      // In private chat, target is the other participant
      targetJid = message.key.remoteJid
    }
    
    const allowedCommands = message.client.allowedUsers.get(targetJid) || []
    
    if (allowedCommands.length === 0) {
      return await message.reply('❌ No commands')
    }
    
    return await message.reply(`✅ Commands: ${allowedCommands.join(', ')}`)
  }
)



bot(
  {
    pattern: 'permissions ?(.*)',
    desc: 'List all allowed users and their permissions (owner only)',
    type: 'owner',
  },
  async (message, match) => {
    // Only owner can view all permissions
    if (!message.key.fromMe && !message.client.isOwnerJid(message.sender)) {
      return await message.reply('❌ Only owner can view all permissions')
    }
    
    const allowedUsers = message.client.allowedUsers
    
    if (allowedUsers.size === 0) {
      return await message.reply('📋 No users have been granted specific permissions\n\n💡 **Usage Examples:**\n• `.allow ping` - Allow current chat user\n• `.allow @user ping` - Allow tagged user\n• `.allow <jid> ping` - Allow specific JID')
    }
    
    let permissionsList = '📋 **All User Permissions:**\n\n'
    
    for (const [jid, commands] of allowedUsers.entries()) {
      const displayName = jid.includes('@') ? jid.split('@')[0] : jid
      permissionsList += `👤 **${displayName}**\n`
      permissionsList += `   📝 Commands: ${commands.join(', ')}\n\n`
    }
    
    permissionsList += '\n💡 **Tip:** Use `.disallow @user command` to revoke access'
    
    return await message.reply(permissionsList)
  }
)
