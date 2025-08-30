const fs = require('fs')
const path = require('path')

class EnvManagerPlugin {
  constructor() {
    this.name = 'env-manager'
    this.description = 'Manage user environment variables'
    this.commands = [
      {
        name: 'env',
        description: 'View current user environment variables',
        usage: '.env'
      },
      {
        name: 'env add',
        description: 'Add or update environment variable',
        usage: '.env add KEY=value'
      },
      {
        name: 'env remove',
        description: 'Remove environment variable',
        usage: '.env remove KEY'
      }
    ]
    
    // Whitelist of user-editable environment variables
    this.allowedEnvVars = [
      'STICKER_NAME',
      'BOT_PREFIX',
      'TIMEZONE',
      'LANGUAGE',
      'AUTO_READ',
      'WELCOME_MESSAGE',
      'GOODBYE_MESSAGE',
      'DOWNLOAD_TIMEOUT',
      'MAX_FILE_SIZE',
      'CUSTOM_STATUS'
    ]
    
    // System variables that should NEVER be shown or modified
    this.blockedEnvVars = [
      'SESSION_ID',
      'BOT_NUMBER',
      'OWNER_NUMBER',
      'DATABASE_URL',
      'WEBHOOK_URL',
      'API_KEY',
      'SECRET_KEY',
      'TOKEN',
      'PASSWORD',
      'PRIVATE_KEY',
      'CLIENT_SECRET',
      'AUTH_TOKEN',
      'ACCESS_TOKEN',
      'REFRESH_TOKEN',
      'ENCRYPTION_KEY',
      'JWT_SECRET',
      'COOKIE_SECRET',
      'SESSION_SECRET',
      'ADMIN_PASSWORD',
      'DB_PASSWORD',
      'REDIS_PASSWORD',
      'SMTP_PASSWORD',
      'EMAIL_PASSWORD'
    ]
    
    this.envFilePath = path.join(process.cwd(), '.env')
  }

  async initialize(client) {
    this.client = client
    this.socket = client.socket
    this.ownerJid = client.ownerJid
    console.log('⚙️ Environment manager plugin initialized')
  }

  async executeCommand(messageData, command, args) {
    const { key, message } = messageData
    const senderJid = key.remoteJid.endsWith('@g.us') ? key.participant : key.remoteJid
    
    // STRICT OWNER-ONLY CHECK - Cannot be bypassed by .allow
    if (senderJid !== this.ownerJid) {
      await this.socket.sendMessage(key.remoteJid, {
        text: '🔒 Environment management is restricted to bot owner only'
      })
      return
    }
    
    try {
      const fullCommand = command + (args.length > 0 ? ' ' + args.join(' ') : '')
      
      if (fullCommand === 'env') {
        await this.viewEnvironmentVariables(key.remoteJid)
      } else if (fullCommand.startsWith('env add ')) {
        const envString = args.slice(1).join(' ')
        await this.addEnvironmentVariable(key.remoteJid, envString)
      } else if (fullCommand.startsWith('env remove ')) {
        const varName = args[1]
        await this.removeEnvironmentVariable(key.remoteJid, varName)
      } else {
        await this.socket.sendMessage(key.remoteJid, {
          text: `📋 *Environment Variable Commands:*\n\n` +
                `🔍 \`.env\` - View current variables\n` +
                `➕ \`.env add KEY=value\` - Add/update variable\n` +
                `➖ \`.env remove KEY\` - Remove variable\n\n` +
                `💡 Only user-safe variables are allowed`
        })
      }
    } catch (error) {
      console.error('❌ Environment manager error:', error)
      await this.socket.sendMessage(key.remoteJid, {
        text: '❌ Error managing environment variables'
      })
    }
  }
  
  async viewEnvironmentVariables(chatJid) {
    try {
      const envVars = this.loadEnvFile()
      const userVars = {}
      
      // Filter to only show allowed variables
      for (const [key, value] of Object.entries(envVars)) {
        if (this.isAllowedVariable(key)) {
          userVars[key] = value
        }
      }
      
      if (Object.keys(userVars).length === 0) {
        await this.socket.sendMessage(chatJid, {
          text: '📝 *User Environment Variables:*\n\n' +
                '_(No user variables set)_\n\n' +
                '💡 Use `.env add KEY=value` to add variables'
        })
        return
      }
      
      let message = '📝 *User Environment Variables:*\n\n'
      for (const [key, value] of Object.entries(userVars)) {
        message += `• **${key}** = \`${value}\`\n`
      }
      message += '\n💡 Use `.env add` or `.env remove` to modify'
      
      await this.socket.sendMessage(chatJid, { text: message })
      
    } catch (error) {
      console.error('❌ Error viewing env vars:', error)
      await this.socket.sendMessage(chatJid, {
        text: '❌ Error reading environment variables'
      })
    }
  }
  
  async addEnvironmentVariable(chatJid, envString) {
    try {
      if (!envString.includes('=')) {
        await this.socket.sendMessage(chatJid, {
          text: '❌ Invalid format. Use: `.env add KEY=value`'
        })
        return
      }
      
      const [key, ...valueParts] = envString.split('=')
      const value = valueParts.join('=').trim()
      const cleanKey = key.trim().toUpperCase()
      
      if (!this.isAllowedVariable(cleanKey)) {
        await this.socket.sendMessage(chatJid, {
          text: `❌ Variable "${cleanKey}" is not allowed\n\n` +
                `✅ Allowed variables: ${this.allowedEnvVars.join(', ')}`
        })
        return
      }
      
      if (!value) {
        await this.socket.sendMessage(chatJid, {
          text: '❌ Value cannot be empty'
        })
        return
      }
      
      // Load current env vars
      const envVars = this.loadEnvFile()
      const isUpdate = envVars.hasOwnProperty(cleanKey)
      
      // Update the variable
      envVars[cleanKey] = value
      
      // Save to file
      this.saveEnvFile(envVars)
      
      // Update runtime environment
      process.env[cleanKey] = value
      
      const action = isUpdate ? 'updated' : 'added'
      await this.socket.sendMessage(chatJid, {
        text: `✅ Environment variable **${cleanKey}** ${action}\n` +
              `📋 Value: \`${value}\`\n\n` +
              `🔄 Restart bot to apply changes to all plugins`
      })
      
    } catch (error) {
      console.error('❌ Error adding env var:', error)
      await this.socket.sendMessage(chatJid, {
        text: '❌ Error adding environment variable'
      })
    }
  }
  
  async removeEnvironmentVariable(chatJid, varName) {
    try {
      if (!varName) {
        await this.socket.sendMessage(chatJid, {
          text: '❌ Please specify variable name: `.env remove KEY`'
        })
        return
      }
      
      const cleanKey = varName.trim().toUpperCase()
      
      if (!this.isAllowedVariable(cleanKey)) {
        await this.socket.sendMessage(chatJid, {
          text: `❌ Variable "${cleanKey}" is not allowed to be modified`
        })
        return
      }
      
      // Load current env vars
      const envVars = this.loadEnvFile()
      
      if (!envVars.hasOwnProperty(cleanKey)) {
        await this.socket.sendMessage(chatJid, {
          text: `❌ Variable "${cleanKey}" not found`
        })
        return
      }
      
      // Remove the variable
      delete envVars[cleanKey]
      delete process.env[cleanKey]
      
      // Save to file
      this.saveEnvFile(envVars)
      
      await this.socket.sendMessage(chatJid, {
        text: `✅ Environment variable **${cleanKey}** removed\n\n` +
              `🔄 Restart bot to apply changes to all plugins`
      })
      
    } catch (error) {
      console.error('❌ Error removing env var:', error)
      await this.socket.sendMessage(chatJid, {
        text: '❌ Error removing environment variable'
      })
    }
  }
  
  isAllowedVariable(key) {
    const upperKey = key.toUpperCase()
    
    // Check if it's in the blocked list
    for (const blocked of this.blockedEnvVars) {
      if (upperKey.includes(blocked)) {
        return false
      }
    }
    
    // Check if it's in the allowed list
    return this.allowedEnvVars.includes(upperKey)
  }
  
  loadEnvFile() {
    try {
      if (!fs.existsSync(this.envFilePath)) {
        return {}
      }
      
      const content = fs.readFileSync(this.envFilePath, 'utf8')
      const envVars = {}
      
      content.split('\n').forEach(line => {
        line = line.trim()
        if (line && !line.startsWith('#') && line.includes('=')) {
          const [key, ...valueParts] = line.split('=')
          const value = valueParts.join('=').trim()
          if (key && value) {
            envVars[key.trim()] = value.replace(/^["']|["']$/g, '') // Remove quotes
          }
        }
      })
      
      return envVars
    } catch (error) {
      console.error('❌ Error loading .env file:', error)
      return {}
    }
  }
  
  saveEnvFile(envVars) {
    try {
      let content = '# User Environment Variables\n'
      content += '# Generated by MATDEV Bot\n\n'
      
      for (const [key, value] of Object.entries(envVars)) {
        // Add quotes if value contains spaces
        const formattedValue = value.includes(' ') ? `"${value}"` : value
        content += `${key}=${formattedValue}\n`
      }
      
      fs.writeFileSync(this.envFilePath, content, 'utf8')
    } catch (error) {
      console.error('❌ Error saving .env file:', error)
      throw error
    }
  }
  
  getCommands() {
    return this.commands
  }
}

module.exports = EnvManagerPlugin