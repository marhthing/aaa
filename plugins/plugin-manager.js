const { bot } = require('../lib/client')
const fs = require('fs-extra')
const path = require('path')
const https = require('https')
const config = require('../config')

// Storage for remote plugin URLs
const REMOTE_PLUGINS_FILE = path.join(config.PLUGINS_DATA_DIR, 'remote_plugins.json')

async function loadRemotePlugins() {
    try {
        if (await fs.pathExists(REMOTE_PLUGINS_FILE)) {
            return await fs.readJson(REMOTE_PLUGINS_FILE)
        }
        return {}
    } catch (error) {
        // console.error('Failed to load remote plugins:', error)
        return {}
    }
}

async function saveRemotePlugins(plugins) {
    try {
        await fs.ensureDir(path.dirname(REMOTE_PLUGINS_FILE))
        await fs.writeJson(REMOTE_PLUGINS_FILE, plugins, { spaces: 2 })
    } catch (error) {
        // console.error('Failed to save remote plugins:', error)
    }
}

function downloadGist(url) {
    return new Promise((resolve, reject) => {
        // Convert GitHub Gist URL to raw URL
        let rawUrl = url
        if (url.includes('gist.github.com') && !url.includes('/raw/')) {
            // Extract gist ID and convert to raw URL
            const gistMatch = url.match(/gist\.github\.com\/[^\/]+\/([a-f0-9]+)/)
            if (gistMatch) {
                rawUrl = `https://gist.githubusercontent.com/${gistMatch[1]}/raw/`
            } else {
                return reject(new Error('Invalid GitHub Gist URL format'))
            }
        }

        const request = https.get(rawUrl, (response) => {
            if (response.statusCode !== 200) {
                return reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`))
            }

            let data = ''
            response.on('data', chunk => data += chunk)
            response.on('end', () => resolve(data))
        })

        request.on('error', reject)
        request.setTimeout(10000, () => {
            request.destroy()
            reject(new Error('Download timeout'))
        })
    })
}

function extractPluginName(code) {
    // Try to extract plugin name from code patterns
    const patterns = [
        /pattern:\s*['"`]([^'"`\s]+)/,
        /command:\s*['"`]([^'"`\s]+)/,
        /name:\s*['"`]([^'"`\s]+)/
    ]

    for (const pattern of patterns) {
        const match = code.match(pattern)
        if (match) {
            return match[1].replace(/[^a-zA-Z0-9_-]/g, '_')
        }
    }

    return `remote_${Date.now()}`
}

bot(
  {
    pattern: 'plugin install (.*)',
    desc: 'Install a plugin from GitHub Gist URL',
    type: 'system',
  },
  async (message, match) => {
    if (!message.key.fromMe && message.sender !== message.client.ownerJid) {
      return await message.reply('❌ Only owner can install plugins')
    }

    const url = match.trim()
    if (!url) {
      return await message.reply('❌ Please provide a GitHub Gist URL\n\nUsage: `.plugin install <gist-url>`')
    }

    if (!url.includes('gist.github.com')) {
      return await message.reply('❌ Only GitHub Gist URLs are supported')
    }

    await message.react('⏳')

    try {
      // Download plugin code
      await message.reply('📥 Downloading plugin from Gist...')
      const pluginCode = await downloadGist(url)

      if (!pluginCode || pluginCode.trim().length === 0) {
        return await message.reply('❌ Downloaded file is empty or invalid')
      }

      // Validate it's a valid plugin
      if (!pluginCode.includes('bot(') && !pluginCode.includes('require(')) {
        return await message.reply('❌ Invalid plugin format. Plugin must use bot() function.')
      }

      // Extract plugin name
      const pluginName = extractPluginName(pluginCode)
      const pluginFileName = `${pluginName}.js`
      const pluginPath = path.join(config.PLUGINS_DIR, pluginFileName)

      // Check if plugin already exists
      if (await fs.pathExists(pluginPath)) {
        return await message.reply(`❌ Plugin "${pluginName}" already exists. Use \`.plugin update\` to update it.`)
      }

      // Save plugin file
      await fs.writeFile(pluginPath, pluginCode)

      // Update remote plugins registry
      const remotePlugins = await loadRemotePlugins()
      remotePlugins[pluginName] = {
        url: url,
        installedAt: new Date().toISOString(),
        fileName: pluginFileName
      }
      await saveRemotePlugins(remotePlugins)

      // Reload plugins
      await message.client.loadPlugins()

      await message.react('✅')
      return await message.reply(`✅ Plugin "${pluginName}" installed successfully!\n📁 Saved as: ${pluginFileName}\n🔄 Plugins reloaded`)

    } catch (error) {
      console.error('Plugin installation failed:', error)
      await message.react('❌')
      return await message.reply(`❌ Failed to install plugin: ${error.message}`)
    }
  }
)

bot(
  {
    pattern: 'plugin remove (.*)',
    desc: 'Remove an installed plugin',
    type: 'system',
  },
  async (message, match) => {
    if (!message.key.fromMe && message.sender !== message.client.ownerJid) {
      return await message.reply('❌ Only owner can remove plugins')
    }

    const pluginName = match.trim()
    if (!pluginName) {
      return await message.reply('❌ Please provide a plugin name\n\nUsage: `.plugin remove <plugin-name>`')
    }

    try {
      const remotePlugins = await loadRemotePlugins()

      if (!remotePlugins[pluginName]) {
        return await message.reply(`❌ Plugin "${pluginName}" not found in remote plugins registry`)
      }

      const pluginFileName = remotePlugins[pluginName].fileName
      const pluginPath = path.join(config.PLUGINS_DIR, pluginFileName)

      // Remove plugin file
      if (await fs.pathExists(pluginPath)) {
        await fs.remove(pluginPath)
      }

      // Remove from registry
      delete remotePlugins[pluginName]
      await saveRemotePlugins(remotePlugins)

      // Reload plugins
      await message.client.loadPlugins()

      return await message.reply(`✅ Plugin "${pluginName}" removed successfully!\n🔄 Plugins reloaded`)

    } catch (error) {
      console.error('Plugin removal failed:', error)
      return await message.reply(`❌ Failed to remove plugin: ${error.message}`)
    }
  }
)

bot(
  {
    pattern: 'plugin update (.*)',
    desc: 'Update an installed plugin from its original Gist URL',
    type: 'system',
  },
  async (message, match) => {
    if (!message.key.fromMe && message.sender !== message.client.ownerJid) {
      return await message.reply('❌ Only owner can update plugins')
    }

    const pluginName = match.trim()
    if (!pluginName) {
      return await message.reply('❌ Please provide a plugin name\n\nUsage: `.plugin update <plugin-name>`')
    }

    await message.react('⏳')

    try {
      const remotePlugins = await loadRemotePlugins()

      if (!remotePlugins[pluginName]) {
        return await message.reply(`❌ Plugin "${pluginName}" not found in remote plugins registry`)
      }

      const pluginInfo = remotePlugins[pluginName]

      // Download updated plugin code
      await message.reply('📥 Downloading updated plugin from Gist...')
      const pluginCode = await downloadGist(pluginInfo.url)

      if (!pluginCode || pluginCode.trim().length === 0) {
        return await message.reply('❌ Downloaded file is empty or invalid')
      }

      // Save updated plugin file
      const pluginPath = path.join(config.PLUGINS_DIR, pluginInfo.fileName)
      await fs.writeFile(pluginPath, pluginCode)

      // Update registry
      pluginInfo.updatedAt = new Date().toISOString()
      await saveRemotePlugins(remotePlugins)

      // Reload plugins
      await message.client.loadPlugins()

      await message.react('✅')
      return await message.reply(`✅ Plugin "${pluginName}" updated successfully!\n🔄 Plugins reloaded`)

    } catch (error) {
      console.error('Plugin update failed:', error)
      await message.react('❌')
      return await message.reply(`❌ Failed to update plugin: ${error.message}`)
    }
  }
)

bot(
  {
    pattern: 'plugin list ?(.*)',
    desc: 'List all installed remote plugins',
    type: 'system',
  },
  async (message, match) => {
    try {
      const remotePlugins = await loadRemotePlugins()
      const pluginNames = Object.keys(remotePlugins)

      if (pluginNames.length === 0) {
        return await message.reply('📋 No remote plugins installed yet.\n\nUse `.plugin install <gist-url>` to install plugins.')
      }

      let listMessage = '📋 *Installed Remote Plugins*\n\n'

      for (const [name, info] of Object.entries(remotePlugins)) {
        const installedDate = new Date(info.installedAt).toLocaleDateString()
        const updatedDate = info.updatedAt ? ` (Updated: ${new Date(info.updatedAt).toLocaleDateString()})` : ''

        listMessage += `🔹 **${name}**\n`
        listMessage += `   📁 ${info.fileName}\n`
        listMessage += `   📅 ${installedDate}${updatedDate}\n`
        listMessage += `   🔗 ${info.url}\n\n`
      }

      listMessage += `📊 Total: ${pluginNames.length} remote plugins`

      return await message.reply(listMessage)

    } catch (error) {
      console.error('Failed to list plugins:', error)
      return await message.reply('❌ Failed to load plugins list')
    }
  }
)

bot(
  {
    pattern: 'plugin help ?(.*)',
    desc: 'Show plugin manager help',
    type: 'system',
  },
  async (message, match) => {
    const helpMessage = `🔧 *Plugin Manager Commands*\n\n` +
      `📥 \`.plugin install <gist-url>\`\n` +
      `   Install a plugin from GitHub Gist\n\n` +
      `🗑️ \`.plugin remove <plugin-name>\`\n` +
      `   Remove an installed plugin\n\n` +
      `🔄 \`.plugin update <plugin-name>\`\n` +
      `   Update plugin from original Gist\n\n` +
      `📋 \`.plugin list\`\n` +
      `   List all installed remote plugins\n\n` +
      `❓ \`.plugin help\`\n` +
      `   Show this help message\n\n` +
      `💡 **Example:**\n` +
      `\`.plugin install https://gist.github.com/user/abc123\``

    return await message.reply(helpMessage)
  }
)