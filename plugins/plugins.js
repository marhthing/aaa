const axios = require('axios')
const { writeFileSync, unlinkSync } = require('fs')
const path = require('path')
const {
  bot,
  parseGistUrls,
  getPlugin,
  setPlugin,
  pluginsList,
  delPlugin,
  removePlugin,
  installPlugin,
  lang,
  config,
} = require('../lib/')

bot(
  {
    pattern: 'plugin ?(.*)',
    desc: lang.plugins.plugin.desc,
    type: 'plugin',
  },
  async (message, match) => {
    match = match || message.reply_message?.text
    if (!match) return await message.send(lang.plugins.plugin.usage)
    
    const sessionId = config.WHATSAPP_SESSION_ID || 'default'
    
    if (match == 'list') {
      const plugins = await getPlugin(sessionId)
      if (!plugins) return await message.send(lang.plugins.plugin.not_installed)
      let msg = ''
      plugins.map(({ name, url }) => {
        msg += `${name} : ${url}\n`
      })
      return await message.send('```' + msg + '```')
    }
    
    const isValidUrl = parseGistUrls(match)
    if (!isValidUrl || isValidUrl.length < 1) {
      const plugin = await getPlugin(sessionId, match)
      if (plugin?.url) return await message.send(plugin.url, { quoted: message.message })
    }
    
    if (!isValidUrl) return await message.send(lang.plugins.plugin.invalid)
    let msg = ''

    for (const url of isValidUrl) {
      try {
        const res = await axios.get(url)
        if (res.status === 200) {
          let plugin_name = /pattern: ["'](.*)["'],/g.exec(res.data)
          plugin_name = plugin_name[1].split(' ')[0]
          const pluginPath = path.join(config.EPLUGIN_DIR, sessionId + plugin_name + '.js')
          
          // Ensure directory exists
          const fs = require('fs-extra')
          await fs.ensureDir(config.EPLUGIN_DIR)
          
          writeFileSync(pluginPath, res.data)

          try {
            const { loadPlugin } = require('../lib/plugins')
            loadPlugin(pluginPath, sessionId)
          } catch (e) {
            await message.send(`❌ Error loading plugin: ${e.message}`)
            return unlinkSync(pluginPath)
          }

          await setPlugin(plugin_name, url, sessionId)
          msg += `${pluginsList(res.data).join(',')}\n`
        }
      } catch (error) {
        await message.send(`❌ Error: ${error.message}\n${url}`)
      }
    }

    await message.send(lang.plugins.plugin.installed.replace('{}', msg.trim()))
  }
)

bot(
  {
    pattern: 'remove ?(.*)',
    desc: lang.plugins.remove.desc,
    type: 'plugin',
  },
  async (message, match) => {
    if (!match) return await message.send(lang.plugins.remove.usage)
    
    const sessionId = config.WHATSAPP_SESSION_ID || 'default'
    
    if (match == 'all') {
      const plugins = await getPlugin(sessionId)
      for (const plugin of plugins) {
        try {
          await delPlugin(plugin.name, sessionId)
          removePlugin(plugin.name, sessionId)
        } catch (error) {}
      }
    } else {
      const isDeleted = await delPlugin(match, sessionId)
      if (!isDeleted) return await message.send(lang.plugins.remove.not_found.replace('{}', match))
      removePlugin(match, sessionId)
    }
    return await message.send(lang.plugins.remove.removed)
  }
)