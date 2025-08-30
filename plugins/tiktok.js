
const { bot } = require('../lib/client')
const axios = require('axios')

bot(
  {
    pattern: 'tiktok ?(.*)',
    desc: 'Download TikTok video',
    type: 'media',
  },
  async (message, match) => {
    if (!match || !match.trim()) {
      return await message.reply('❌ Please provide a TikTok URL\n\nUsage: `.tiktok <tiktok_url>`')
    }

    const url = match.trim()

    // Validate TikTok URL
    if (!url.includes('tiktok.com') && !url.includes('vt.tiktok.com')) {
      return await message.reply('❌ Please provide a valid TikTok URL')
    }

    try {
      await message.reply('🔄 Downloading from TikTok...')

      // Working APIs in order of preference
      const APIs = [
        'https://api.douyin.pro/api/douyin',
        'https://api.tiklydown.eu.org/api/download',
        'https://www.tikwm.com/api/?url='
      ]

      let success = false

      // Method 1: Douyin Pro API
      try {
        const response = await axios.post(APIs[0], {
          url: url
        }, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          timeout: 15000
        })

        if (response.data && response.data.success && response.data.data) {
          const data = response.data.data
          const videoUrl = data.play || data.download_url || data.video_url
          const title = data.title || data.desc || 'TikTok Video'
          const author = data.author?.nickname || data.author || 'Unknown'

          if (videoUrl) {
            const caption = `🎵 *TikTok Video*\n\n` +
                           `👤 **Author:** ${author}\n` +
                           `📝 **Title:** ${title}\n` +
                           `🔗 **Source:** TikTok`

            await message.send('', {
              video: { url: videoUrl },
              caption: caption
            })
            success = true
          }
        }
      } catch (error1) {
        console.error('Douyin Pro API failed:', error1.message)
      }

      // Method 2: TiklyDown API
      if (!success) {
        try {
          const response = await axios.post(APIs[1], {
            url: url
          }, {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 15000
          })

          if (response.data && response.data.success && response.data.video) {
            const data = response.data
            const videoUrl = data.video.noWatermark || data.video.watermark
            const title = data.title || 'TikTok Video'
            const author = data.author?.name || 'Unknown'

            if (videoUrl) {
              const caption = `🎵 *TikTok Video*\n\n` +
                             `👤 **Author:** ${author}\n` +
                             `📝 **Title:** ${title}\n` +
                             `🔗 **Source:** TikTok`

              await message.send('', {
                video: { url: videoUrl },
                caption: caption
              })
              success = true
            }
          }
        } catch (error2) {
          console.error('TiklyDown API failed:', error2.message)
        }
      }

      // Method 3: TikWM API
      if (!success) {
        try {
          const response = await axios.get(APIs[2] + encodeURIComponent(url), {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 15000
          })

          if (response.data && response.data.code === 0 && response.data.data) {
            const data = response.data.data
            const videoUrl = data.hdplay || data.play || data.wmplay
            const title = data.title || 'TikTok Video'
            const author = data.author?.nickname || 'Unknown'

            if (videoUrl) {
              const caption = `🎵 *TikTok Video*\n\n` +
                             `👤 **Author:** ${author}\n` +
                             `📝 **Title:** ${title}\n` +
                             `🔗 **Source:** TikTok`

              await message.send('', {
                video: { url: videoUrl },
                caption: caption
              })
              success = true
            }
          }
        } catch (error3) {
          console.error('TikWM API failed:', error3.message)
        }
      }

      if (!success) {
        return await message.reply('❌ Failed to download TikTok video. All services are temporarily unavailable or the video might be private.')
      }

    } catch (error) {
      console.error('TikTok download error:', error)
      return await message.reply('❌ Failed to download TikTok video. Please try again later.')
    }
  }
)
