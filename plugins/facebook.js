
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
      return await message.reply('❌ Download failed - All methods unavailable. Facebook may have updated their security.')
    }

    try {
      // Send video
      await message.client.socket.sendMessage(message.key.remoteJid, {
        video: fs.readFileSync(tempFile),
        caption: '🎥 *Facebook Video Downloaded*'
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
    /^https?:\/\/(www\.)?facebook\.com\/share\/r\/[A-Za-z0-9]+/,
    /^https?:\/\/(www\.)?facebook\.com\/share\/v\/[A-Za-z0-9]+/,
    /^https?:\/\/(www\.)?facebook\.com\/.*\/posts\/[0-9]+/,
    /^https?:\/\/(www\.)?facebook\.com\/reel\/[0-9]+/,
    /^https?:\/\/(www\.)?facebook\.com\/.*\/videos\/[0-9]+/
  ]
  return patterns.some(pattern => pattern.test(url))
}

async function downloadFacebookVideo(url, messageId) {
  const downloaders = [
    () => downloadWithSnapSave(url, messageId),
    () => downloadWithFBDown(url, messageId),
    () => downloadWithGetMyFB(url, messageId),
    () => downloadWithFacebookIO(url, messageId),
    () => downloadWithDirectScrape(url, messageId)
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

// Method 1: SnapSave (reliable for Facebook)
async function downloadWithSnapSave(url, messageId) {
  const response = await axios.post('https://snapsave.app/action.php?lang=en', 
    `url=${encodeURIComponent(url)}`,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://snapsave.app/',
        'Origin': 'https://snapsave.app'
      },
      timeout: 25000
    }
  )

  const videoMatch = response.data.match(/<a[^>]+href="([^"]+)"[^>]*>\s*Download\s+Video/i)
  if (videoMatch && videoMatch[1]) {
    return await downloadFromDirectUrl(videoMatch[1], messageId, 'fb_snap_')
  }
  throw new Error('No video URL from SnapSave')
}

// Method 2: FBDown
async function downloadWithFBDown(url, messageId) {
  const response = await axios.post('https://fbdown.net/download.php', 
    `URLz=${encodeURIComponent(url)}`,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://fbdown.net/'
      },
      timeout: 25000
    }
  )

  const videoMatch = response.data.match(/href="([^"]+)"[^>]*>\s*Download\s+(HD|Normal)/i)
  if (videoMatch && videoMatch[1]) {
    return await downloadFromDirectUrl(videoMatch[1], messageId, 'fb_fbdown_')
  }
  throw new Error('No video URL from FBDown')
}

// Method 3: GetMyFB
async function downloadWithGetMyFB(url, messageId) {
  const response = await axios.post('https://getmyfb.com/process', {
    id: url,
    locale: 'en'
  }, {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      'Referer': 'https://getmyfb.com/'
    },
    timeout: 25000
  })

  if (response.data && response.data.success && response.data.data && response.data.data.length > 0) {
    const videoUrl = response.data.data[0].url
    if (videoUrl) {
      return await downloadFromDirectUrl(videoUrl, messageId, 'fb_getmyfb_')
    }
  }
  throw new Error('No video URL from GetMyFB')
}

// Method 4: Facebook.io
async function downloadWithFacebookIO(url, messageId) {
  const response = await axios.post('https://facebook.io/download/', 
    `url=${encodeURIComponent(url)}`,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://facebook.io/',
        'Origin': 'https://facebook.io'
      },
      timeout: 25000
    }
  )

  const videoMatch = response.data.match(/href="([^"]+)"[^>]*class="btn[^"]*"[^>]*>\s*Download/i)
  if (videoMatch && videoMatch[1]) {
    return await downloadFromDirectUrl(videoMatch[1], messageId, 'fb_fbio_')
  }
  throw new Error('No video URL from Facebook.io')
}

// Method 5: Direct scraping attempt
async function downloadWithDirectScrape(url, messageId) {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    },
    timeout: 30000
  })

  // Look for video URLs in page source
  const patterns = [
    /"playable_url":"([^"]+)"/,
    /"playable_url_quality_hd":"([^"]+)"/,
    /"browser_native_hd_url":"([^"]+)"/,
    /"browser_native_sd_url":"([^"]+)"/
  ]

  for (const pattern of patterns) {
    const match = response.data.match(pattern)
    if (match && match[1]) {
      const videoUrl = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '')
      if (videoUrl.includes('video')) {
        return await downloadFromDirectUrl(videoUrl, messageId, 'fb_direct_')
      }
    }
  }
  throw new Error('No video URL from direct scraping')
}

// Helper: Download from direct URL
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
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': '*/*',
      'Connection': 'keep-alive'
    }
  })

  const writer = fs.createWriteStream(filepath)
  response.data.pipe(writer)

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(filepath))
    writer.on('error', reject)
    
    // Add timeout for download
    setTimeout(() => {
      writer.destroy()
      reject(new Error('Download timeout'))
    }, 60000)
  })
}
