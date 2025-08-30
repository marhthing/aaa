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

    await message.reply('⏳ Downloading Facebook video...')
    
    const tempFile = await downloadFacebookVideo(url, message.key.id)
    if (!tempFile) {
      return await message.reply('❌ Download failed')
    }

    try {
      // Send video (exact same pattern as TikTok/YouTube)
      await message.client.socket.sendMessage(message.key.remoteJid, {
        video: fs.readFileSync(tempFile)
      })

    } catch (error) {
      console.error('❌ Error sending Facebook video:', error)
      await message.reply('❌ Failed to send video')
    } finally {
      // Always delete temp file
      try {
        fs.unlinkSync(tempFile)
      } catch (e) {}
    }
  }
)

function isValidFacebookUrl(url) {
  const patterns = [
    /^https?:\/\/(www\.)?(facebook\.com|fb\.watch)\/.*\/videos?\//,
    /^https?:\/\/(www\.)?facebook\.com\/watch/,
    /^https?:\/\/fb\.watch\/[A-Za-z0-9_-]+/,
    /^https?:\/\/(www\.)?facebook\.com\/share\/r\/[A-Za-z0-9]+/, // New 2025 share format
    /^https?:\/\/(www\.)?facebook\.com\/share\/v\/[A-Za-z0-9]+/, // Share video format
    /^https?:\/\/(www\.)?facebook\.com\/.*\/posts\/[0-9]+/, // Post format
    /^https?:\/\/(www\.)?facebook\.com\/reel\/[0-9]+/ // Reel format
  ]
  return patterns.some(pattern => pattern.test(url))
}

async function downloadFacebookVideo(url, messageId) {
  // Using multiple fallbacks like successful TikTok/YouTube plugins
  const downloaders = [
    () => downloadWithCobalt(url, messageId),
    () => downloadWithSaveFrom(url, messageId),
    () => downloadWithY2Mate(url, messageId),
    () => downloadWithGeneric(url, messageId)
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

// Method 1: TikWM API (working for multiple platforms including Facebook)
async function downloadWithCobalt(url, messageId) {
  const response = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.tikwm.com/',
      'Accept': 'application/json'
    },
    timeout: 20000
  })

  if (response.data && response.data.code === 0 && response.data.data) {
    const videoUrl = response.data.data.hdplay || response.data.data.play || response.data.data.wmplay
    if (videoUrl) {
      return await downloadFromDirectUrl(videoUrl, messageId)
    }
  }
  throw new Error('No download URL from TikWM')
}

// Method 2: SSSTik API (working for Facebook)
async function downloadWithSaveFrom(url, messageId) {
  const response = await axios.post('https://ssstik.io/abc', `id=${encodeURIComponent(url)}&locale=en&tt=bWJuZWdq`, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://ssstik.io/',
      'Origin': 'https://ssstik.io'
    },
    timeout: 20000
  })

  // Parse HTML response for video URL
  const videoMatch = response.data.match(/href="([^"]*)" class="without_watermark"/)
  if (videoMatch && videoMatch[1]) {
    return await downloadFromDirectUrl(videoMatch[1], messageId)
  }
  
  throw new Error('No video URL from SSSTik')
}

// Method 3: Y2Mate (same as YouTube)
async function downloadWithY2Mate(url, messageId) {
  const apiUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://www.y2mate.com/mates/en68/analyze/ajax?url=${url}&q_auto=0&ajax=1`)}`

  const response = await axios.get(apiUrl, { 
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  })

  if (response.data?.contents) {
    const contents = JSON.parse(response.data.contents)
    if (contents.result?.includes('href=')) {
      const match = contents.result.match(/href="([^"]+)"/)
      if (match?.[1]) {
        return await downloadFromDirectUrl(match[1], messageId)
      }
    }
  }
  throw new Error('No download URL from Y2Mate')
}

// Method 4: Generic backup method
async function downloadWithGeneric(url, messageId) {
  // Try TikWM API (works for multiple platforms)
  const response = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'application/json'
    },
    timeout: 30000
  })

  if (response.data?.data?.play || response.data?.data?.wmplay) {
    const videoUrl = response.data.data.play || response.data.data.wmplay
    return await downloadFromDirectUrl(videoUrl, messageId)
  }
  
  throw new Error('No download URL from Generic')
}

// Helper: Download from direct URL (same pattern as TikTok/YouTube)
async function downloadFromDirectUrl(directUrl, messageId) {
  const videoDir = path.join(__dirname, '../data/downloads/video')
  await fs.ensureDir(videoDir)

  const filename = `fb_${messageId}_${Date.now()}.mp4`
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