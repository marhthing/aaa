
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

    await message.react('⏳')

    try {
      await message.reply('🔄 Downloading from TikTok...')

      // Method 1: Using TikTok Scraper API (Free)
      try {
        const response = await axios.post('https://lovetik.com/api/ajax/search', {
          query: url
        }, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'https://lovetik.com/'
          }
        })

        if (response.data && response.data.links && response.data.links.length > 0) {
          const videoData = response.data.links[0]
          const videoUrl = videoData.a || videoData.url
          const title = response.data.desc || 'TikTok Video'
          const author = response.data.author || 'Unknown'

          if (videoUrl) {
            const caption = `🎵 *TikTok Video*\n\n` +
                           `👤 **Author:** ${author}\n` +
                           `📝 **Title:** ${title}\n` +
                           `🔗 **Source:** TikTok`

            await message.react('✅')
            return await message.send('', {
              video: { url: videoUrl },
              caption: caption
            })
          }
        }
      } catch (error1) {
        console.error('Lovetik method failed:', error1.message)
      }

      // Method 2: Using TikMate API (Free alternative)
      try {
        const response2 = await axios.post('https://tikmate.online/download/link', {
          url: url
        }, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        })

        if (response2.data && response2.data.success && response2.data.video_url) {
          const videoUrl = response2.data.video_url
          const title = response2.data.title || 'TikTok Video'
          const author = response2.data.author || 'Unknown'

          const caption = `🎵 *TikTok Video*\n\n` +
                         `👤 **Author:** ${author}\n` +
                         `📝 **Title:** ${title}\n` +
                         `🔗 **Source:** TikTok`

          await message.react('✅')
          return await message.send('', {
            video: { url: videoUrl },
            caption: caption
          })
        }
      } catch (error2) {
        console.error('TikMate method failed:', error2.message)
      }

      // Method 3: Using SaveTT API (Free alternative)
      try {
        const response3 = await axios.get(`https://savett.cc/api/ajaxSearch`, {
          params: {
            q: url,
            lang: 'en'
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        })

        if (response3.data && response3.data.status === 'ok' && response3.data.links) {
          const videoLink = response3.data.links.find(link => link.s && link.s.includes('mp4'))
          if (videoLink && videoLink.a) {
            const caption = `🎵 *TikTok Video*\n\n🔗 **Source:** TikTok`

            await message.react('✅')
            return await message.send('', {
              video: { url: videoLink.a },
              caption: caption
            })
          }
        }
      } catch (error3) {
        console.error('SaveTT method failed:', error3.message)
      }

      // Method 4: Using TikWM (Updated approach)
      try {
        const response4 = await axios.get(`https://www.tikwm.com/api/`, {
          params: {
            url: url,
            hd: 1
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        })

        if (response4.data && response4.data.code === 0 && response4.data.data) {
          const data = response4.data.data
          const videoUrl = data.hdplay || data.play || data.wmplay
          const title = data.title || 'TikTok Video'
          const author = data.author?.nickname || 'Unknown'

          if (videoUrl) {
            const caption = `🎵 *TikTok Video*\n\n` +
                           `👤 **Author:** ${author}\n` +
                           `📝 **Title:** ${title}\n` +
                           `🔗 **Source:** TikTok`

            await message.react('✅')
            return await message.send('', {
              video: { url: videoUrl },
              caption: caption
            })
          }
        }
      } catch (error4) {
        console.error('TikWM method failed:', error4.message)
      }

      await message.react('❌')
      return await message.reply('❌ Failed to download TikTok video. The video might be private or all services are temporarily unavailable.')

    } catch (error) {
      console.error('TikTok download error:', error)
      await message.react('❌')
      return await message.reply('❌ Failed to download TikTok video. Please try again later.')
    }
  }
)
