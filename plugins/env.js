const { bot } = require('../lib/client')
const fs = require('fs')
const path = require('path')

// Whitelist of user-editable environment variables
const allowedEnvVars = [
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
const blockedEnvVars = [
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

const envFilePath = path.join(process.cwd(), '.env')

bot(
  {
    pattern: 'env ?(.*)',
    desc: 'Manage environment variables (owner only)',
    type: 'system',
  },
  async (message, match) => {
    // STRICT OWNER-ONLY CHECK - Cannot be bypassed by .allow
    const senderJid = message.key.remoteJid.endsWith('@g.us') ? message.key.participant : message.key.remoteJid
    const ownerJid = message.client.ownerJid
    
    // Extract base phone number from both JIDs for comparison (handle :device_id format)
    const senderPhone = senderJid.split('@')[0].split(':')[0]
    const ownerPhone = ownerJid.split('@')[0].split(':')[0]
    
    if (senderPhone !== ownerPhone) {
      return await message.reply('🔒 Environment management is restricted to bot owner only')
    }
    
    const args = match.trim().split(' ').filter(arg => arg.length > 0)
    
    try {
      if (args.length === 0) {
        await viewEnvironmentVariables(message)
      } else if (args[0] === 'add' && args.length > 1) {
        const envString = args.slice(1).join(' ')
        await addEnvironmentVariable(message, envString)
      } else if (args[0] === 'remove' && args.length > 1) {
        const varName = args[1]
        await removeEnvironmentVariable(message, varName)
      } else {
        await message.reply(
          `📋 *Environment Variable Commands:*\n\n` +
          `🔍 \`.env\` - View current variables\n` +
          `➕ \`.env add KEY=value\` - Add/update variable\n` +
          `➖ \`.env remove KEY\` - Remove variable\n\n` +
          `💡 Only user-safe variables are allowed`
        )
      }
    } catch (error) {
      console.error('❌ Environment manager error:', error)
      await message.reply('❌ Error managing environment variables')
    }
  }
)

async function viewEnvironmentVariables(message) {
  try {
    const envVars = loadEnvFile()
    const userVars = {}
    
    // Filter to only show allowed variables
    for (const [key, value] of Object.entries(envVars)) {
      if (isAllowedVariable(key)) {
        userVars[key] = value
      }
    }
    
    if (Object.keys(userVars).length === 0) {
      return await message.reply(
        '📝 *User Environment Variables:*\n\n' +
        '_(No user variables set)_\n\n' +
        '💡 Use `.env add KEY=value` to add variables'
      )
    }
    
    let msg = '📝 *User Environment Variables:*\n\n'
    for (const [key, value] of Object.entries(userVars)) {
      msg += `• **${key}** = \`${value}\`\n`
    }
    msg += '\n💡 Use `.env add` or `.env remove` to modify'
    
    await message.reply(msg)
    
  } catch (error) {
    console.error('❌ Error viewing env vars:', error)
    await message.reply('❌ Error reading environment variables')
  }
}

async function addEnvironmentVariable(message, envString) {
  try {
    if (!envString.includes('=')) {
      return await message.reply('❌ Invalid format. Use: `.env add KEY=value`')
    }
    
    const [key, ...valueParts] = envString.split('=')
    const value = valueParts.join('=').trim()
    const cleanKey = key.trim().toUpperCase()
    
    if (!isAllowedVariable(cleanKey)) {
      return await message.reply(
        `❌ Variable "${cleanKey}" is not allowed\n\n` +
        `✅ Allowed variables: ${allowedEnvVars.join(', ')}`
      )
    }
    
    if (!value) {
      return await message.reply('❌ Value cannot be empty')
    }
    
    // Load current env vars
    const envVars = loadEnvFile()
    const isUpdate = envVars.hasOwnProperty(cleanKey)
    
    // Update the variable
    envVars[cleanKey] = value
    
    // Save to file
    saveEnvFile(envVars)
    
    // Update runtime environment
    process.env[cleanKey] = value
    
    const action = isUpdate ? 'updated' : 'added'
    await message.reply(
      `✅ Environment variable **${cleanKey}** ${action}\n` +
      `📋 Value: \`${value}\`\n\n` +
      `🔄 Restart bot to apply changes to all plugins`
    )
    
  } catch (error) {
    console.error('❌ Error adding env var:', error)
    await message.reply('❌ Error adding environment variable')
  }
}

async function removeEnvironmentVariable(message, varName) {
  try {
    if (!varName) {
      return await message.reply('❌ Please specify variable name: `.env remove KEY`')
    }
    
    const cleanKey = varName.trim().toUpperCase()
    
    if (!isAllowedVariable(cleanKey)) {
      return await message.reply(`❌ Variable "${cleanKey}" is not allowed to be modified`)
    }
    
    // Load current env vars
    const envVars = loadEnvFile()
    
    if (!envVars.hasOwnProperty(cleanKey)) {
      return await message.reply(`❌ Variable "${cleanKey}" not found`)
    }
    
    // Remove the variable
    delete envVars[cleanKey]
    delete process.env[cleanKey]
    
    // Save to file
    saveEnvFile(envVars)
    
    await message.reply(
      `✅ Environment variable **${cleanKey}** removed\n\n` +
      `🔄 Restart bot to apply changes to all plugins`
    )
    
  } catch (error) {
    console.error('❌ Error removing env var:', error)
    await message.reply('❌ Error removing environment variable')
  }
}

function isAllowedVariable(key) {
  const upperKey = key.toUpperCase()
  
  // Check if it's in the blocked list
  for (const blocked of blockedEnvVars) {
    if (upperKey.includes(blocked)) {
      return false
    }
  }
  
  // Check if it's in the allowed list
  return allowedEnvVars.includes(upperKey)
}

function loadEnvFile() {
  try {
    if (!fs.existsSync(envFilePath)) {
      return {}
    }
    
    const content = fs.readFileSync(envFilePath, 'utf8')
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

function saveEnvFile(envVars) {
  try {
    let content = '# User Environment Variables\n'
    content += '# Generated by MATDEV Bot\n\n'
    
    for (const [key, value] of Object.entries(envVars)) {
      // Add quotes if value contains spaces
      const formattedValue = value.includes(' ') ? `"${value}"` : value
      content += `${key}=${formattedValue}\n`
    }
    
    fs.writeFileSync(envFilePath, content, 'utf8')
  } catch (error) {
    console.error('❌ Error saving .env file:', error)
    throw error
  }
}