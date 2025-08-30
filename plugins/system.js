
const { bot } = require('../lib/client')

bot(
  {
    pattern: 'shutdown ?(.*)',
    desc: 'Shutdown the bot gracefully',
    type: 'system',
  },
  async (message, match) => {
    // Only owner can shutdown
    if (!message.key.fromMe && message.sender !== message.client.ownerJid) {
      return await message.reply('❌ Only owner can shutdown the bot')
    }
    
    try {
      // Send shutdown notification
      const utils = require('../lib/utils')
      await utils.sendOwnerNotification(message.client.socket, message.client.ownerJid, 'shutdown')
    } catch (error) {
      console.error('Failed to send shutdown notification:', error)
    }
    
    // Give time for the notification to be sent
    setTimeout(() => {
      console.log('🛑 Bot shutdown requested by owner')
      process.exit(0)
    }, 3000) // Increased to 3 seconds to ensure notification is sent
  }
)

bot(
  {
    pattern: 'restart ?(.*)',
    desc: 'Restart the bot process',
    type: 'system',
  },
  async (message, match) => {
    // Only owner can restart
    if (!message.key.fromMe && message.sender !== message.client.ownerJid) {
      return await message.reply('❌ Only owner can restart the bot')
    }
    
    try {
      // Send restart notification (just a quick acknowledgment)
      await message.reply('🔄 *Bot Restarting...*\n\nI\'ll be back in a moment! ⚡')
    } catch (error) {
      console.error('Failed to send restart acknowledgment:', error)
    }
    
    // Give time for the message to be sent
    setTimeout(() => {
      console.log('🔄 Bot restart requested by owner')
      process.exit(1) // Exit code 1 will trigger restart in manager
    }, 2000)
  }
)

bot(
  {
    pattern: 'status ?(.*)',
    desc: 'Show bot system status',
    type: 'system',
  },
  async (message, match) => {
    const status = message.client.getStatus()
    const uptime = process.uptime()
    const days = Math.floor(uptime / 86400)
    const hours = Math.floor((uptime % 86400) / 3600)
    const minutes = Math.floor((uptime % 3600) / 60)
    
    const memUsage = process.memoryUsage()
    const memUsed = (memUsage.heapUsed / 1024 / 1024).toFixed(2)
    const memTotal = (memUsage.heapTotal / 1024 / 1024).toFixed(2)
    
    const statusMessage = `📊 *Bot System Status*\n\n` +
      `🟢 Status: ${status.ready ? 'Online' : 'Offline'}\n` +
      `⏰ Uptime: ${days}d ${hours}h ${minutes}m\n` +
      `🔌 Plugins: ${status.pluginsLoaded} loaded\n` +
      `🧠 Memory: ${memUsed}MB / ${memTotal}MB\n` +
      `📱 Owner: ${status.ownerJid || 'Not set'}\n` +
      `🔧 Node.js: ${process.version}\n` +
      `💻 Platform: ${process.platform}\n` +
      `🆔 Process ID: ${process.pid}`
    
    return await message.reply(statusMessage)
  }
)

bot(
  {
    pattern: 'update ?(.*)',
    desc: 'Check for updates or update the bot',
    type: 'system',
  },
  async (message, match) => {
    // Only owner can update
    if (!message.key.fromMe && message.sender !== message.client.ownerJid) {
      return await message.reply('❌ Only owner can update the bot')
    }

    const { spawn, spawnSync } = require('child_process')
    const fs = require('fs')
    const path = require('path')

    const args = match.trim().toLowerCase()

    if (args === 'now') {
      try {
        await message.reply('🔄 *Updating Bot...*')
        
        // Give time for the message to be sent
        setTimeout(() => {
          console.log('🔄 Bot update requested by owner - triggering reclone')
          // Create a flag file to signal the manager to reclone
          fs.writeFileSync(path.join(__dirname, '../.update_flag'), 'reclone')
          process.exit(1) // Exit code 1 will trigger restart in manager
        }, 2000)
      } catch (error) {
        console.error('Failed to send update acknowledgment:', error)
      }
      return
    }

    // Check for updates
    try {
      await message.reply('🔍 *Checking for updates...*')

      // Check if git is available and we're in a git repository
      const gitCheckResult = spawnSync('git', ['status', '--porcelain'], {
        stdio: 'pipe'
      })

      if (gitCheckResult.error) {
        return await message.reply('❌ *Git not available*\n\nCannot check for updates. Use `.update now` to force reclone from repository.')
      }

      // Check remote updates
      const fetchResult = spawnSync('git', ['fetch', 'origin'], {
        stdio: 'pipe'
      })

      if (fetchResult.status !== 0) {
        return await message.reply('❌ *Cannot fetch from remote*\n\nUse `.update now` to force reclone from repository.')
      }

      // Check how many commits behind
      const behindResult = spawnSync('git', ['rev-list', '--count', 'HEAD..origin/main'], {
        stdio: 'pipe',
        encoding: 'utf8'
      })

      if (behindResult.status !== 0) {
        // Try with master branch
        const behindMasterResult = spawnSync('git', ['rev-list', '--count', 'HEAD..origin/master'], {
          stdio: 'pipe',
          encoding: 'utf8'
        })
        
        if (behindMasterResult.status === 0) {
          const commitsBehind = parseInt(behindMasterResult.stdout.trim()) || 0
          
          if (commitsBehind === 0) {
            return await message.reply('✅ *Bot is up to date!*\n\nNo updates available.')
          } else {
            return await message.reply(`🔄 *${commitsBehind} update(s) available*\n\nUse \`.update now\` to update the bot.`)
          }
        }
        
        return await message.reply('⚠️ *Cannot determine update status*\n\nUse `.update now` to force reclone from repository.')
      }

      const commitsBehind = parseInt(behindResult.stdout.trim()) || 0
      
      if (commitsBehind === 0) {
        return await message.reply('✅ *Bot is up to date!*\n\nNo updates available.')
      } else {
        return await message.reply(`🔄 *${commitsBehind} update(s) available*\n\nUse \`.update now\` to update the bot.`)
      }

    } catch (error) {
      console.error('Update check error:', error)
      return await message.reply('❌ *Error checking for updates*\n\nUse `.update now` to force reclone from repository.')
    }
  }
)
