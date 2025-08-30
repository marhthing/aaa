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
  // Direct download using fdown.net approach (based on working Python library)
  try {
    // Step 1: Get the webpage with video info
    const postResponse = await axios.post('https://fdown.net/download', 
      `URLz=${encodeURIComponent(url)}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
          'Referer': 'https://fdown.net/',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br'
        },
        timeout: 30000
      }
    )

    // Step 2: Parse HTML for download links using 2025 patterns
    const html = postResponse.data
    const linkPatterns = [
      /<a[^>]+href="(https:\/\/[^"]*(?:fbcdn\.net|facebook\.com)[^"]*\.mp4[^"]*)"[^>]*>.*?(?:HD|Download|Normal)/gi,
      /<a[^>]+href="(https:\/\/video[^"]*\.mp4[^"]*)"[^>]*>/gi,
      /data-file="(https:\/\/[^"]*\.mp4[^"]*)"/gi,
      /"(https:\/\/[^"]*fbcdn\.net[^"]*\.mp4[^"]*)"/gi
    ]
    
    for (const pattern of linkPatterns) {
      const matches = [...html.matchAll(pattern)]
      for (const match of matches) {
        if (match?.[1]) {
          const cleanUrl = match[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"')
          if (cleanUrl.includes('.mp4') || cleanUrl.includes('fbcdn.net')) {
            return await downloadFromDirectUrl(cleanUrl, messageId, 'fb_fdown_')
          }
        }
      }
    }
    
    throw new Error('No video download URL found')
  } catch (error) {
    throw new Error(`FDown error: ${error.message}`)
  }
}

async function downloadWithFDownloader(url, messageId) {
  // FDownloader.net updated approach for 2025
  try {
    const response = await axios.post('https://fdownloader.net/api/ajaxSearch', 
      `q=${encodeURIComponent(url)}&vt=facebook`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
          'Referer': 'https://fdownloader.net/',
          'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: 30000
      }
    )

    if (response.data?.links && Array.isArray(response.data.links)) {
      // Look for HD first, then SD
      const hdLink = response.data.links.find(link => link.quality === 'hd' || link.quality === '720p')
      const sdLink = response.data.links.find(link => link.quality === 'sd' || link.quality === '360p')
      const anyLink = response.data.links[0]
      
      const bestLink = hdLink || sdLink || anyLink
      
      if (bestLink?.link && (bestLink.link.includes('fbcdn.net') || bestLink.link.includes('.mp4'))) {
        return await downloadFromDirectUrl(bestLink.link, messageId, 'fb_fdl_')
      }
    }
    
    throw new Error('No valid video links found')
  } catch (error) {
    throw new Error(`FDownloader error: ${error.message}`)
  }
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