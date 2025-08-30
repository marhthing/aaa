const { bot } = require('../lib/client')
const fs = require('fs-extra')
const path = require('path')
const axios = require('axios')

bot(
  {
    pattern: 'instagram ?(.*)',
    desc: 'Download Instagram video',
    type: 'downloader',
  },
  async (message, match) => {
    const url = match.trim()
    if (!url) {
      return await message.reply('❌ Provide Instagram URL')
    }

    if (!isValidInstagramUrl(url)) {
      return await message.reply('❌ Invalid Instagram URL')
    }

    const tempFile = await downloadInstagramVideo(url, message.key.id)
    if (!tempFile) {
      return await message.reply('❌ Download failed')
    }

    try {
      await message.client.socket.sendMessage(message.key.remoteJid, {
        video: fs.readFileSync(tempFile)
      })
      console.log('✅ Instagram video sent successfully')
    } catch (error) {
      console.error('❌ Error sending Instagram video:', error)
      await message.reply('❌ Failed to send video')
    } finally {
      try {
        fs.unlinkSync(tempFile)
        console.log(`🗑️ Cleaned up: ${tempFile}`)
      } catch (e) {}
    }
  }
)

function isValidInstagramUrl(url) {
  const patterns = [
    /^https?:\/\/(www\.)?instagram\.com\/p\/[A-Za-z0-9_-]+/,
    /^https?:\/\/(www\.)?instagram\.com\/reel\/[A-Za-z0-9_-]+/,
    /^https?:\/\/(www\.)?instagram\.com\/tv\/[A-Za-z0-9_-]+/
  ]
  return patterns.some(pattern => pattern.test(url))
}

async function downloadInstagramVideo(url, messageId) {
  const downloaders = [
    () => downloadWithSnapInsta(url, messageId),
    () => downloadWithIgram(url, messageId),
    () => downloadWithApiInsta(url, messageId)
  ]

  for (let i = 0; i < downloaders.length; i++) {
    try {
      console.log(`🔄 Trying Instagram method ${i + 1}...`)
      const result = await downloaders[i]()
      if (result) {
        console.log(`✅ Instagram download successful with method ${i + 1}`)
        return result
      }
    } catch (error) {
      console.log(`❌ Instagram method ${i + 1} failed:`, error.message)
    }
  }
  return null
}

async function downloadWithSnapInsta(url, messageId) {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    timeout: 30000
  })

  // Direct scraping from Instagram page
  const patterns = [
    /"video_url":"([^"]+)"/,
    /property="og:video" content="([^"]+)"/,
    /"contentUrl":"([^"]+)"/,
    /property="og:video:secure_url" content="([^"]+)"/
  ]
  
  for (const pattern of patterns) {
    const match = response.data.match(pattern)
    if (match?.[1]) {
      const videoUrl = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '')
      return await downloadFromDirectUrl(videoUrl, messageId, 'ig_direct_')
    }
  }
  throw new Error('No video URL from direct scraping')
}

async function downloadWithIgram(url, messageId) {
  const response = await axios.post('https://v3.igdownloader.app/api/ajaxSearch', {
    q: url,
    t: 'media',
    lang: 'en'
  }, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    timeout: 30000
  })

  // Parse HTML response for video links
  const patterns = [
    /href="([^"]+)"[^>]*>.*?Download video/i,
    /data-href="([^"]+)"/,
    /onclick="window\.open\('([^']+)'/
  ]
  
  for (const pattern of patterns) {
    const match = response.data.match(pattern)
    if (match?.[1] && match[1].includes('cdninstagram')) {
      return await downloadFromDirectUrl(match[1], messageId, 'ig_igram_')
    }
  }
  throw new Error('No video URL from IGDownloader')
}

async function downloadWithApiInsta(url, messageId) {
  const response = await axios.post('https://api-insta.com/api/media', {
    url: url
  }, {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    timeout: 30000
  })

  if (response.data?.data?.video_url) {
    return await downloadFromDirectUrl(response.data.data.video_url, messageId, 'ig_apiinsta_')
  }
  
  // Try alternative response format
  if (response.data?.video_url) {
    return await downloadFromDirectUrl(response.data.video_url, messageId, 'ig_apiinsta_')
  }
  
  throw new Error('No video URL from API-Insta')
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