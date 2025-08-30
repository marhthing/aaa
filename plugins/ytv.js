const { bot } = require('../lib/client')
const fs = require('fs-extra')
const path = require('path')
const axios = require('axios')
const ytdl = require('@distube/ytdl-core')

bot(
  {
    pattern: 'ytv ?(.*)',
    desc: 'Download YouTube video',
    type: 'downloader',
  },
  async (message, match) => {
    const url = match.trim()
    if (!url) {
      return await message.reply('❌ Provide YouTube URL\nExample: .ytv https://youtu.be/xyz')
    }

    if (!isValidYouTubeUrl(url)) {
      return await message.reply('❌ Invalid YouTube URL')
    }

    let tempFile
    try {
      tempFile = await downloadVideo(url, message.key.id)
      if (!tempFile) {
        return await message.reply('❌ *Download failed*\n\nAll download methods failed. The video might be private, age-restricted, or unavailable.')
      }
      
      // Check file size
      const stats = fs.statSync(tempFile)
      const fileSizeMB = stats.size / 1024 / 1024
      
      if (fileSizeMB > 100) {
        fs.unlinkSync(tempFile)
        return await message.reply(`❌ *Video too large*\n\nFile size: ${fileSizeMB.toFixed(2)}MB\nMaximum allowed: 100MB`)
      }

      // Send video
      await message.client.socket.sendMessage(message.key.remoteJid, {
        video: fs.readFileSync(tempFile),
      })

      // console.log('✅ Video sent successfully')
    } catch (error) {
      console.error('❌ Error:', error)
      await message.reply('❌ Failed to download or send video')
    } finally {
      // Always delete temp file
      if (tempFile) {
        try {
          fs.unlinkSync(tempFile)
          // console.log(`🗑️ Cleaned up: ${tempFile}`)
        } catch (e) {}
      }
    }
  }
)

bot(
  {
    pattern: 'youtube ?(.*)',
    desc: 'Download YouTube video (alias)',
    type: 'downloader',
  },
  async (message, match) => {
    // Use same logic as ytv
    const url = match.trim()
    if (!url) {
      return await message.reply('❌ Provide YouTube URL\nExample: .youtube https://youtu.be/xyz')
    }

    if (!isValidYouTubeUrl(url)) {
      return await message.reply('❌ Invalid YouTube URL')
    }

    let tempFile
    try {
      tempFile = await downloadVideo(url, message.key.id)
      if (!tempFile) {
        return await message.reply('❌ *Download failed*\n\nAll download methods failed. The video might be private, age-restricted, or unavailable.')
      }
      
      // Check file size
      const stats = fs.statSync(tempFile)
      const fileSizeMB = stats.size / 1024 / 1024
      
      if (fileSizeMB > 100) {
        fs.unlinkSync(tempFile)
        return await message.reply(`❌ *Video too large*\n\nFile size: ${fileSizeMB.toFixed(2)}MB\nMaximum allowed: 100MB`)
      }

      // Send video
      await message.client.socket.sendMessage(message.key.remoteJid, {
        video: fs.readFileSync(tempFile),
      })

      // console.log('✅ Video sent successfully')
    } catch (error) {
      console.error('❌ Error:', error)
      await message.reply('❌ Failed to download or send video')
    } finally {
      // Always delete temp file
      if (tempFile) {
        try {
          fs.unlinkSync(tempFile)
          // console.log(`🗑️ Cleaned up: ${tempFile}`)
        } catch (e) {}
      }
    }
  }
)

function isValidYouTubeUrl(url) {
  const patterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=/,
    /^https?:\/\/(www\.)?youtu\.be\//,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\//
  ]
  return patterns.some(pattern => pattern.test(url))
}

function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  ]
  
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  
  return null
}

async function downloadVideo(url, messageId) {
  const downloaders = [
    { name: 'ytdl-core', func: () => downloadWithYtdl(url, messageId) },
    { name: 'Alternative API', func: () => downloadWithCobalt(url, messageId) },
    { name: 'Y2mate', func: () => downloadWithSavefrom(url, messageId) },
    { name: 'Direct ytdl fallback', func: () => downloadWithGeneric(url, messageId) }
  ]

  const errors = []

  for (let i = 0; i < downloaders.length; i++) {
    try {
      console.log(`🔄 Trying method ${i + 1} (${downloaders[i].name})...`)
      const result = await downloaders[i].func()
      if (result && fs.existsSync(result)) {
        const stats = fs.statSync(result)
        if (stats.size > 0) {
          console.log(`✅ Download successful with ${downloaders[i].name} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`)
          return result
        } else {
          console.log(`❌ Downloaded file is empty from ${downloaders[i].name}`)
          try { fs.unlinkSync(result) } catch (e) {}
        }
      }
    } catch (error) {
      const errorMsg = `${downloaders[i].name}: ${error.message}`
      console.log(`❌ Method ${i + 1} failed: ${errorMsg}`)
      errors.push(errorMsg)
    }
  }

  console.log('❌ All download methods failed:')
  errors.forEach((error, index) => console.log(`  ${index + 1}. ${error}`))
  return null
}

// Method 1: ytdl-core with better error handling and fallback quality
async function downloadWithYtdl(url, messageId) {
  const videoDir = path.join(__dirname, '../data/downloads/video')
  await fs.ensureDir(videoDir)

  const filename = `yt_${messageId}_${Date.now()}.mp4`
  const filepath = path.join(videoDir, filename)

  return new Promise((resolve, reject) => {
    // Try multiple quality options
    const qualityOptions = [
      { quality: 'highest', filter: 'videoandaudio' },
      { quality: 'highestvideo', filter: 'videoandaudio' },
      { quality: 'lowest', filter: 'videoandaudio' },
      { quality: 'highestaudio', filter: 'audioonly' }
    ]

    let currentOption = 0

    function tryDownload() {
      if (currentOption >= qualityOptions.length) {
        reject(new Error('All quality options failed'))
        return
      }

      const options = qualityOptions[currentOption]
      currentOption++

      try {
        const stream = ytdl(url, options)
        const writeStream = fs.createWriteStream(filepath)
        
        stream.pipe(writeStream)

        writeStream.on('finish', () => resolve(filepath))
        writeStream.on('error', (err) => {
          console.log(`Quality option ${currentOption} failed:`, err.message)
          tryDownload()
        })
        stream.on('error', (err) => {
          console.log(`Stream error for option ${currentOption}:`, err.message)
          tryDownload()
        })
      } catch (error) {
        console.log(`Setup error for option ${currentOption}:`, error.message)
        tryDownload()
      }
    }

    tryDownload()
  })
}

// Method 2: Alternative API (yt-dlp style)
async function downloadWithCobalt(url, messageId) {
  const apiUrl = `https://api.cobalt.tools/api/json`
  
  const response = await axios.post(apiUrl, {
    url: url,
    vQuality: '720',
    aFormat: 'mp3',
    filenamePattern: 'basic'
  }, {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    timeout: 45000
  })

  if (response.data?.url) {
    return await downloadFromDirectUrl(response.data.url, messageId)
  }
  throw new Error('No download URL from alternative API')
}

// Method 3: Y2mate API alternative
async function downloadWithSavefrom(url, messageId) {
  try {
    // Extract video ID from URL
    const videoId = extractVideoId(url)
    if (!videoId) throw new Error('Invalid YouTube URL')
    
    const apiUrl = `https://www.y2mate.com/mates/analyzeV2/ajax`
    
    const response = await axios.post(apiUrl, 
      `k_query=${encodeURIComponent(url)}&k_page=home&hl=en&q_auto=0`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.y2mate.com/'
        },
        timeout: 30000
      }
    )

    if (response.data?.links?.mp4) {
      const qualities = Object.keys(response.data.links.mp4)
      const bestQuality = qualities.find(q => ['720p', '480p', '360p'].includes(q)) || qualities[0]
      
      if (bestQuality && response.data.links.mp4[bestQuality]) {
        return await downloadFromDirectUrl(response.data.links.mp4[bestQuality].url, messageId)
      }
    }
    
    throw new Error('No download URL found')
  } catch (error) {
    throw new Error(`Y2mate method failed: ${error.message}`)
  }
}

// Method 4: Direct ytdl with audio-only fallback
async function downloadWithGeneric(url, messageId) {
  const videoDir = path.join(__dirname, '../data/downloads/video')
  await fs.ensureDir(videoDir)

  const filename = `yt_${messageId}_${Date.now()}.mp4`
  const filepath = path.join(videoDir, filename)

  try {
    // Try to get video info first
    const info = await ytdl.getInfo(url)
    if (!info) throw new Error('Cannot get video info')
    
    // Try to download with lowest quality that includes video
    const stream = ytdl(url, {
      quality: 'lowest',
      filter: format => format.hasVideo && format.hasAudio
    })

    const writeStream = fs.createWriteStream(filepath)
    stream.pipe(writeStream)

    return new Promise((resolve, reject) => {
      writeStream.on('finish', () => resolve(filepath))
      writeStream.on('error', reject)
      stream.on('error', reject)
      
      // Add timeout
      setTimeout(() => {
        writeStream.destroy()
        reject(new Error('Download timeout'))
      }, 60000)
    })
  } catch (error) {
    throw new Error(`Direct ytdl failed: ${error.message}`)
  }
}

// Helper: Download from direct URL
async function downloadFromDirectUrl(directUrl, messageId) {
  const videoDir = path.join(__dirname, '../data/downloads/video')
  await fs.ensureDir(videoDir)

  const filename = `yt_${messageId}_${Date.now()}.mp4`
  const filepath = path.join(videoDir, filename)

  const response = await axios({
    method: 'GET',
    url: directUrl,
    responseType: 'stream',
    timeout: 60000
  })

  const writer = fs.createWriteStream(filepath)
  response.data.pipe(writer)

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(filepath))
    writer.on('error', reject)
  })
}