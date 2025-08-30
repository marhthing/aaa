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


    
    const tempFile = await downloadVideo(url, message.key.id)
    if (!tempFile) {
      return await message.reply('❌ Download failed')
    }

    try {
      // Send video
      await message.client.socket.sendMessage(message.key.remoteJid, {
        video: fs.readFileSync(tempFile),

      })
      
      console.log('✅ Video sent successfully')
    } catch (error) {
      console.error('❌ Error sending video:', error)
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


    
    const tempFile = await downloadVideo(url, message.key.id)
    if (!tempFile) {
      return await message.reply('❌ Download failed')
    }

    try {
      // Send video
      await message.client.socket.sendMessage(message.key.remoteJid, {
        video: fs.readFileSync(tempFile),

      })
      
      console.log('✅ Video sent successfully')
    } catch (error) {
      console.error('❌ Error sending video:', error)
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

function isValidYouTubeUrl(url) {
  const patterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=/,
    /^https?:\/\/(www\.)?youtu\.be\//,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\//
  ]
  return patterns.some(pattern => pattern.test(url))
}

async function downloadVideo(url, messageId) {
  const downloaders = [
    () => downloadWithYtdl(url, messageId),
    () => downloadWithCobalt(url, messageId),
    () => downloadWithSavefrom(url, messageId),
    () => downloadWithGeneric(url, messageId)
  ]

  for (let i = 0; i < downloaders.length; i++) {
    try {
      console.log(`🔄 Trying method ${i + 1}...`)
      const result = await downloaders[i]()
      if (result) {
        console.log(`✅ Download successful with method ${i + 1}`)
        return result
      }
    } catch (error) {
      console.log(`❌ Method ${i + 1} failed:`, error.message)
    }
  }
  
  return null
}

// Method 1: ytdl-core (already installed)
async function downloadWithYtdl(url, messageId) {
  const videoDir = path.join(__dirname, '../data/downloads/video')
  await fs.ensureDir(videoDir)
  
  const filename = `yt_${messageId}_${Date.now()}.mp4`
  const filepath = path.join(videoDir, filename)

  return new Promise((resolve, reject) => {
    const stream = ytdl(url, { 
      quality: 'highestvideo',
      filter: 'videoandaudio'
    })
    
    const writeStream = fs.createWriteStream(filepath)
    stream.pipe(writeStream)
    
    writeStream.on('finish', () => resolve(filepath))
    writeStream.on('error', reject)
    stream.on('error', reject)
  })
}

// Method 2: Cobalt API
async function downloadWithCobalt(url, messageId) {
  const response = await axios.post('https://co.wuk.sh/api/json', {
    url: url,
    vQuality: '720'
  }, {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    timeout: 30000
  })

  if (response.data?.url) {
    return await downloadFromDirectUrl(response.data.url, messageId)
  }
  throw new Error('No download URL from Cobalt')
}

// Method 3: SaveFrom.net API
async function downloadWithSavefrom(url, messageId) {
  const apiUrl = `https://api.savefrom.net/info?url=${encodeURIComponent(url)}`
  
  const response = await axios.get(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    timeout: 30000
  })

  // Parse response for video URL
  const data = response.data
  if (data && data.url) {
    return await downloadFromDirectUrl(data.url, messageId)
  }
  throw new Error('No download URL from SaveFrom')
}

// Method 4: Generic web scraper
async function downloadWithGeneric(url, messageId) {
  const apiUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://www.y2mate.com/mates/en68/analyze/ajax?url=${url}&q_auto=0&ajax=1`)}`
  
  const response = await axios.get(apiUrl, { timeout: 30000 })
  
  if (response.data?.contents) {
    const contents = JSON.parse(response.data.contents)
    if (contents.result?.includes('href=')) {
      // Extract download URL from HTML
      const match = contents.result.match(/href="([^"]+)"/)
      if (match?.[1]) {
        return await downloadFromDirectUrl(match[1], messageId)
      }
    }
  }
  throw new Error('No download URL from generic scraper')
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