
const { bot } = require('../lib/client')
const config = require('../config')

bot(
  {
    pattern: 'allow (.*?) (.*)',
    desc: 'Allow a user to use a specific command',
    type: 'owner',
  },
  async (message, match) => {
    const [targetJid, commandToAllow] = match.trim().split(' ')
    
    if (!targetJid || !commandToAllow) {
      return await message.reply('❌ Usage: .allow <jid> <command>')
    }
    
    // Only owner can grant permissions
    if (!message.key.fromMe && message.sender !== message.client.ownerJid) {
      return await message.reply('❌ Only owner can grant permissions')
    }
    
    message.client.allowCommand(targetJid, commandToAllow)
    return await message.reply(`✅ User ${targetJid} can now use .${commandToAllow}`)
  }
)

bot(
  {
    pattern: 'disallow (.*?) (.*)',
    desc: 'Remove user permission for a specific command',
    type: 'owner',
  },
  async (message, match) => {
    const [targetJid, commandToDisallow] = match.trim().split(' ')
    
    if (!targetJid || !commandToDisallow) {
      return await message.reply('❌ Usage: .disallow <jid> <command>')
    }
    
    // Only owner can revoke permissions
    if (!message.key.fromMe && message.sender !== message.client.ownerJid) {
      return await message.reply('❌ Only owner can revoke permissions')
    }
    
    message.client.disallowCommand(targetJid, commandToDisallow)
    return await message.reply(`❌ Removed .${commandToDisallow} access for ${targetJid}`)
  }
)

bot(
  {
    pattern: 'permissions ?(.*)',
    desc: 'List allowed users and their permissions',
    type: 'owner',
  },
  async (message, match) => {
    // Only owner can view permissions
    if (!message.key.fromMe && message.sender !== message.client.ownerJid) {
      return await message.reply('❌ Only owner can view permissions')
    }
    
    const allowedUsers = message.client.allowedUsers
    
    if (allowedUsers.size === 0) {
      return await message.reply('📋 No users have been granted specific permissions')
    }
    
    let permissionsList = '📋 *Current Permissions:*\n\n'
    
    for (const [jid, commands] of allowedUsers.entries()) {
      permissionsList += `👤 ${jid}:\n`
      permissionsList += `   Commands: ${commands.join(', ')}\n\n`
    }
    
    return await message.reply(permissionsList)
  }
)
