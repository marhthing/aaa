const { bot } = require('../lib/client')
const fs = require('fs-extra')
const path = require('path')
const axios = require('axios')

bot(
  {
    pattern: 'twitter ?(.*)',
    desc: 'Download Twitter/X video',
    type: 'downloader',
  },
  async (message, match) => {
    const url = match.trim()
    if (!url) {
      return await message.reply('❌ Provide Twitter URL')
    }

    if (!isValidTwitterUrl(url)) {
      return await message.reply('❌ Invalid Twitter URL')
    }

    const tempFile = await downloadTwitterVideo(url, message.key.id)
    if (!tempFile) {
      return await message.reply('❌ Download failed')
    }

    try {
      await message.client.socket.sendMessage(message.key.remoteJid, {
        video: fs.readFileSync(tempFile)
      })
      console.log('✅ Twitter video sent successfully')
    } catch (error) {
      console.error('❌ Error sending Twitter video:', error)
      await message.reply('❌ Failed to send video')
    } finally {
      try {
        fs.unlinkSync(tempFile)
        console.log(`🗑️ Cleaned up: ${tempFile}`)
      } catch (e) {}
    }
  }
)

function isValidTwitterUrl(url) {
  const patterns = [
    /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/[^\/]+\/status\/\d+/
  ]
  return patterns.some(pattern => pattern.test(url))
}

async function downloadTwitterVideo(url, messageId) {
  const downloaders = [
    () => downloadWithSSSTwitter(url, messageId),
    () => downloadWithTwitterVid(url, messageId),
    () => downloadWithTwitterDownloader(url, messageId)
  ]

  for (let i = 0; i < downloaders.length; i++) {
    try {
      console.log(`🔄 Trying Twitter method ${i + 1}...`)
      const result = await downloaders[i]()
      if (result) {
        console.log(`✅ Twitter download successful with method ${i + 1}`)
        return result
      }
    } catch (error) {
      console.log(`❌ Twitter method ${i + 1} failed:`, error.message)
    }
  }
  return null
}

async function downloadWithSSSTwitter(url, messageId) {
  const response = await axios.post('https://ssstwitter.com/api/download', {
    url: url
  }, {
    headers: {
      'Content-Type': 'application/json'
    },
    timeout: 30000
  })

  if (response.data?.video_url) {
    return await downloadFromDirectUrl(response.data.video_url, messageId, 'twitter_sss_')
  }
  throw new Error('No video URL from SSSTwitter')
}

async function downloadWithTwitterVid(url, messageId) {
  const response = await axios.get(`https://twittervid.com/download?url=${encodeURIComponent(url)}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    timeout: 30000
  })

  const videoMatch = response.data.match(/href="([^"]+)".*?download.*?video/i)
  if (videoMatch?.[1]) {
    return await downloadFromDirectUrl(videoMatch[1], messageId, 'twitter_vid_')
  }
  throw new Error('No video URL from TwitterVid')
}

async function downloadWithTwitterDownloader(url, messageId) {
  const response = await axios.post('https://twittervideodownloader.com/api/twitter', {
    url: url
  }, {
    headers: {
      'Content-Type': 'application/json'
    },
    timeout: 30000
  })

  if (response.data?.download_url) {
    return await downloadFromDirectUrl(response.data.download_url, messageId, 'twitter_dl_')
  }
  throw new Error('No video URL from TwitterDownloader')
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