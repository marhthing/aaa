const { bot } = require('../lib/client')
const fs = require('fs-extra')
const path = require('path')
const axios = require('axios')

bot(
  {
    pattern: 'pinterest ?(.*)',
    desc: 'Download Pinterest video',
    type: 'downloader',
  },
  async (message, match) => {
    const url = match.trim()
    if (!url) {
      return await message.reply('❌ Provide Pinterest URL')
    }

    if (!isValidPinterestUrl(url)) {
      return await message.reply('❌ Invalid Pinterest URL')
    }

    const tempFile = await downloadPinterestVideo(url, message.key.id)
    if (!tempFile) {
      return await message.reply('❌ Download failed')
    }

    try {
      await message.client.socket.sendMessage(message.key.remoteJid, {
        video: fs.readFileSync(tempFile)
      })
      // console.log('✅ Pinterest video sent successfully')
    } catch (error) {
      console.error('❌ Error sending Pinterest video:', error)
      await message.reply('❌ Failed to send video')
    } finally {
      try {
        fs.unlinkSync(tempFile)
        // console.log(`🗑️ Cleaned up: ${tempFile}`)
      } catch (e) {}
    }
  }
)

function isValidPinterestUrl(url) {
  const patterns = [
    /^https?:\/\/(www\.)?pinterest\.com\/pin\/\d+/,
    /^https?:\/\/pin\.it\/[A-Za-z0-9]+/
  ]
  return patterns.some(pattern => pattern.test(url))
}

async function downloadPinterestVideo(url, messageId) {
  const downloaders = [
    () => downloadWithPinterestDownloader(url, messageId),
    () => downloadWithExpertsPhp(url, messageId),
    () => downloadWithGenericScraper(url, messageId)
  ]

  for (let i = 0; i < downloaders.length; i++) {
    try {
      // console.log(`🔄 Trying Pinterest method ${i + 1}...`)
      const result = await downloaders[i]()
      if (result) {
        // console.log(`✅ Pinterest download successful with method ${i + 1}`)
        return result
      }
    } catch (error) {
      // console.log(`❌ Pinterest method ${i + 1} failed:`, error.message)
    }
  }
  return null
}

async function downloadWithPinterestDownloader(url, messageId) {
  const response = await axios.post('https://api.pinterestdownloader.com/download', {
    url: url
  }, {
    headers: {
      'Content-Type': 'application/json'
    },
    timeout: 30000
  })

  if (response.data?.video_url) {
    return await downloadFromDirectUrl(response.data.video_url, messageId, 'pin_dl_')
  }
  throw new Error('No video URL from Pinterest Downloader')
}

async function downloadWithExpertsPhp(url, messageId) {
  const response = await axios.post('https://www.expertsphp.com/pinterest-video-downloader.html', {
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
    return await downloadFromDirectUrl(videoMatch[1], messageId, 'pin_experts_')
  }
  throw new Error('No video URL from ExpertsPHP')
}

async function downloadWithGenericScraper(url, messageId) {
  // Try to extract video URL directly from Pinterest's CDN
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    timeout: 30000
  })

  const videoMatch = response.data.match(/"contentUrl":"([^"]+\.mp4[^"]*)"/)
  if (videoMatch?.[1]) {
    const videoUrl = videoMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '')
    return await downloadFromDirectUrl(videoUrl, messageId, 'pin_scrape_')
  }
  throw new Error('No video URL from Pinterest scraper')
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