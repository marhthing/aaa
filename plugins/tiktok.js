const { bot } = require('../lib/client')
const fs = require('fs-extra')
const path = require('path')
const axios = require('axios')
const { Downloader } = require('@tobyg74/tiktok-api-dl')

bot(
  {
    pattern: 'tiktok ?(.*)',
    desc: 'Download TikTok video',
    type: 'downloader',
  },
  async (message, match) => {
    const url = match.trim()
    if (!url) {
      return await message.reply('❌ Provide TikTok URL\nExample: .tiktok https://vm.tiktok.com/xyz')
    }

    if (!isValidTikTokUrl(url)) {
      return await message.reply('❌ Invalid TikTok URL')
    }

    const tempFile = await downloadTikTokVideo(url, message.key.id)
    if (!tempFile) {
      return await message.reply('❌ Download failed')
    }

    try {
      // Send video without caption
      await message.client.socket.sendMessage(message.key.remoteJid, {
        video: fs.readFileSync(tempFile)
      })
      
      console.log('✅ TikTok video sent successfully')
    } catch (error) {
      console.error('❌ Error sending TikTok video:', error)
      await message.reply('❌ Failed to send video')
    } finally {
      // Always delete temp file
      try {
        fs.unlinkSync(tempFile)
        console.log(`🗑️ Cleaned up: ${tempFile}`)
      } catch (e) {}
    }
  }
)

function isValidTikTokUrl(url) {
  const patterns = [
    /^https?:\/\/(www\.)?tiktok\.com\/@[^\/]+\/video\/\d+/,
    /^https?:\/\/vm\.tiktok\.com\/[A-Za-z0-9]+/,
    /^https?:\/\/vt\.tiktok\.com\/[A-Za-z0-9]+/,
    /^https?:\/\/(www\.)?tiktok\.com\/t\/[A-Za-z0-9]+/
  ]
  return patterns.some(pattern => pattern.test(url))
}

async function downloadTikTokVideo(url, messageId) {
  const downloaders = [
    () => downloadWithTikTokApiDl(url, messageId),
    () => downloadWithSsstik(url, messageId),
    () => downloadWithDirectScrape(url, messageId),
    () => downloadWithSnapTik(url, messageId)
  ]

  for (let i = 0; i < downloaders.length; i++) {
    try {
      console.log(`🔄 Trying TikTok method ${i + 1}...`)
      const result = await downloaders[i]()
      if (result) {
        console.log(`✅ TikTok download successful with method ${i + 1}`)
        return result
      }
    } catch (error) {
      console.log(`❌ TikTok method ${i + 1} failed:`, error.message)
    }
  }
  
  return null
}

// Method 1: @tobyg74/tiktok-api-dl (already installed)
async function downloadWithTikTokApiDl(url, messageId) {
  const result = await Downloader(url, {
    version: "v3"
  })

  if (result?.status === 'success' && result?.result?.video) {
    const videoUrl = Array.isArray(result.result.video) ? result.result.video[0] : result.result.video
    return await downloadFromDirectUrl(videoUrl, messageId, 'tiktok_api_')
  }
  throw new Error('No video URL from tiktok-api-dl')
}

// Method 2: SSSTIK API (Fixed)
async function downloadWithSsstik(url, messageId) {
  const response = await axios.post('https://ssstik.io/abc', 
    `id=${encodeURIComponent(url)}&locale=en&tt=bWVldGluZ18=`,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://ssstik.io/'
      },
      timeout: 30000
    }
  )

  // Look for multiple video URL patterns
  const patterns = [
    /data-url="([^"]+)"/,
    /href="([^"]+)">.*?Download/,
    /"video_url":"([^"]+)"/,
    /contentUrl.*?"([^"]+\.mp4[^"]*)"/ 
  ]
  
  for (const pattern of patterns) {
    const match = response.data.match(pattern)
    if (match?.[1]) {
      const videoUrl = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '')
      return await downloadFromDirectUrl(videoUrl, messageId, 'ssstik_')
    }
  }
  throw new Error('No video URL from SSSTIK')
}

// Method 3: Direct TikTok scraping
async function downloadWithDirectScrape(url, messageId) {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    timeout: 30000
  })

  // Look for video URL patterns in the page
  const patterns = [
    /"playAddr":"([^"]+)"/,
    /"downloadAddr":"([^"]+)"/,
    /"videoUrl":"([^"]+)"/,
    /contentUrl.*?"([^"]+\.mp4[^"]*)"/
  ]
  
  for (const pattern of patterns) {
    const match = response.data.match(pattern)
    if (match?.[1]) {
      const videoUrl = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '')
      return await downloadFromDirectUrl(videoUrl, messageId, 'tiktok_scrape_')
    }
  }
  throw new Error('No video URL from direct scraping')
}

// Method 4: SnapTik (Fixed)
async function downloadWithSnapTik(url, messageId) {
  const formData = new URLSearchParams()
  formData.append('url', url)
  formData.append('token', '')
  
  const response = await axios.post('https://snaptik.app/abc2.php', formData, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://snaptik.app/',
      'Origin': 'https://snaptik.app'
    },
    timeout: 30000
  })

  // Look for multiple download link patterns
  const patterns = [
    /data-url="([^"]+)"/,
    /href="([^"]+)"[^>]*>.*?Download/i,
    /"video_url":"([^"]+)"/,
    /onclick="window\.open\('([^']+)'/
  ]
  
  for (const pattern of patterns) {
    const match = response.data.match(pattern)
    if (match?.[1] && match[1].includes('.mp4')) {
      return await downloadFromDirectUrl(match[1], messageId, 'snaptik_')
    }
  }
  throw new Error('No video URL from SnapTik')
}

// Helper: Download from direct URL
async function downloadFromDirectUrl(directUrl, messageId, prefix = 'tiktok_') {
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