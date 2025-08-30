const { bot } = require('../lib/client')
const fs = require('fs-extra')
const path = require('path')
const axios = require('axios')

bot(
  {
    pattern: 'facebook ?(.*)',
    desc: 'Download Facebook video',
    type: 'downloader',
  },
  async (message, match) => {
    const url = match.trim()
    if (!url) {
      return await message.reply('❌ Provide Facebook URL')
    }

    if (!isValidFacebookUrl(url)) {
      return await message.reply('❌ Invalid Facebook URL')
    }

    const tempFile = await downloadFacebookVideo(url, message.key.id)
    if (!tempFile) {
      return await message.reply('❌ Download failed')
    }

    try {
      await message.client.socket.sendMessage(message.key.remoteJid, {
        video: fs.readFileSync(tempFile)
      })
      console.log('✅ Facebook video sent successfully')
    } catch (error) {
      console.error('❌ Error sending Facebook video:', error)
      await message.reply('❌ Failed to send video')
    } finally {
      try {
        fs.unlinkSync(tempFile)
        console.log(`🗑️ Cleaned up: ${tempFile}`)
      } catch (e) {}
    }
  }
)

function isValidFacebookUrl(url) {
  const patterns = [
    /^https?:\/\/(www\.)?(facebook\.com|fb\.watch)\/.*\/videos?\//,
    /^https?:\/\/(www\.)?facebook\.com\/watch/,
    /^https?:\/\/fb\.watch\/[A-Za-z0-9_-]+/
  ]
  return patterns.some(pattern => pattern.test(url))
}

async function downloadFacebookVideo(url, messageId) {
  const downloaders = [
    () => downloadWithSnapSave(url, messageId),
    () => downloadWithFDown(url, messageId),
    () => downloadWithFDownloader(url, messageId)
  ]

  for (let i = 0; i < downloaders.length; i++) {
    try {
      console.log(`🔄 Trying Facebook method ${i + 1}...`)
      const result = await downloaders[i]()
      if (result) {
        console.log(`✅ Facebook download successful with method ${i + 1}`)
        return result
      }
    } catch (error) {
      console.log(`❌ Facebook method ${i + 1} failed:`, error.message)
    }
  }
  return null
}

async function downloadWithSnapSave(url, messageId) {
  const response = await axios.post('https://snapsave.app/action.php', {
    url: url
  }, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    timeout: 30000
  })

  const videoMatch = response.data.match(/href="([^"]+)".*?download.*?video/i)
  if (videoMatch?.[1]) {
    return await downloadFromDirectUrl(videoMatch[1], messageId, 'fb_snap_')
  }
  throw new Error('No video URL from SnapSave')
}

async function downloadWithFDown(url, messageId) {
  const response = await axios.post('https://fdown.net/download', {
    URLz: url
  }, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    timeout: 30000
  })

  const videoMatch = response.data.match(/href="([^"]+)".*?Download.*?HD/i)
  if (videoMatch?.[1]) {
    return await downloadFromDirectUrl(videoMatch[1], messageId, 'fb_fdown_')
  }
  throw new Error('No video URL from FDown')
}

async function downloadWithFDownloader(url, messageId) {
  const response = await axios.post('https://fdownloader.net/api/ajaxSearch', {
    q: url,
    vt: 'facebook'
  }, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    timeout: 30000
  })

  if (response.data?.links) {
    const hdLink = response.data.links.find(link => link.quality === 'hd')
    const videoUrl = hdLink ? hdLink.link : response.data.links[0]?.link
    if (videoUrl) {
      return await downloadFromDirectUrl(videoUrl, messageId, 'fb_fdl_')
    }
  }
  throw new Error('No video URL from FDownloader')
}

async function downloadFromDirectUrl(directUrl, messageId, prefix) {
  const videoDir = path.join(__dirname, '../data/downloads/video')
  await fs.ensureDir(videoDir)
  
  const filename = `${prefix}${messageId}_${Date.now()}.mp4`
  const filepath = path.join(videoDir, filename)

  const response = await axios({
    method: 'GET',
    url: directUrl,
    responseType: 'stream',
    timeout: 60000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  })

  const writer = fs.createWriteStream(filepath)
  response.data.pipe(writer)

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(filepath))
    writer.on('error', reject)
  })
}