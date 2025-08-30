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
      await message.client.socket.sendMessage(message.key.remoteJid, {
        video: fs.readFileSync(tempFile)
      })
      // console.log('✅ Facebook video sent successfully')
    } catch (error) {
      console.error('❌ Error sending Facebook video:', error)
      await message.reply('❌ Failed to send video')
    } finally {
      try {
        fs.unlinkSync(tempFile)
        // console.log(`🗑️ Cleaned up: ${tempFile}`)
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
  const downloaders = [
    () => downloadWithSnapSave(url, messageId),
    () => downloadWithFDown(url, messageId),
    () => downloadWithFDownloader(url, messageId)
  ]

  for (let i = 0; i < downloaders.length; i++) {
    try {
      // console.log(`🔄 Trying Facebook method ${i + 1}...`)
      const result = await downloaders[i]()
      if (result) {
        // console.log(`✅ Facebook download successful with method ${i + 1}`)
        return result
      }
    } catch (error) {
      // console.log(`❌ Facebook method ${i + 1} failed:`, error.message)
    }
  }
  return null
}

async function downloadWithSnapSave(url, messageId) {
  // SnapSave web scraping approach
  const response = await axios.post('https://snapsave.app/action2.php', 
    `url=${encodeURIComponent(url)}&lang=en`,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://snapsave.app/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 30000
    }
  )

  // Parse for download links in HTML response
  const patterns = [
    /href="(https:\/\/[^"]*\.mp4[^"]*)"[^>]*>\s*Download[^<]*HD/gi,
    /href="(https:\/\/[^"]*\.mp4[^"]*)"[^>]*>\s*Download[^<]*SD/gi,
    /data-url="(https:\/\/[^"]*\.mp4[^"]*)"/gi,
    /href="(https:\/\/video[^"]*fbcdn\.net[^"]*)"/gi
  ]
  
  for (const pattern of patterns) {
    const matches = [...response.data.matchAll(pattern)]
    for (const match of matches) {
      if (match?.[1] && (match[1].includes('.mp4') || match[1].includes('fbcdn.net'))) {
        const videoUrl = match[1].replace(/&amp;/g, '&')
        return await downloadFromDirectUrl(videoUrl, messageId, 'fb_snap_')
      }
    }
  }
  
  throw new Error('No video URL found in SnapSave response')
}

async function downloadWithFDown(url, messageId) {
  // FDown.net web scraping approach (no public API available)
  const response = await axios.post('https://fdown.net/download', 
    `URLz=${encodeURIComponent(url)}`,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://fdown.net/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      },
      timeout: 30000
    }
  )

  // Parse HTML response for video URLs (2025 updated patterns)
  const patterns = [
    /href="(https:\/\/[^"]*\.mp4[^"]*)"[^>]*>[^<]*(?:HD|Download)/gi,
    /data-url="(https:\/\/[^"]*\.mp4[^"]*)"/gi,
    /href="(https:\/\/video[^"]*fbcdn\.net[^"]*)"/gi,
    /<a[^>]*href="([^"]*)">\s*(?:HD|Download|Normal)/gi
  ]
  
  for (const pattern of patterns) {
    const matches = [...response.data.matchAll(pattern)]
    for (const match of matches) {
      if (match?.[1] && (match[1].includes('.mp4') || match[1].includes('fbcdn.net'))) {
        const videoUrl = match[1].replace(/&amp;/g, '&') // Decode HTML entities
        return await downloadFromDirectUrl(videoUrl, messageId, 'fb_fdown_')
      }
    }
  }
  
  throw new Error('No video URL found in FDown response')
}

async function downloadWithFDownloader(url, messageId) {
  // Updated 2025 FDownloader API
  const response = await axios.post('https://fdownloader.net/api/facebook', {
    url: url
  }, {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json'
    },
    timeout: 30000
  })

  if (response.data && response.data.success) {
    const videoData = response.data.data
    const videoUrl = videoData?.hd_url || videoData?.sd_url || videoData?.video_url
    
    if (videoUrl && (videoUrl.includes('fbcdn.net') || videoUrl.includes('facebook.com'))) {
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