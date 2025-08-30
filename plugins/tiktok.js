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

      // Method 1: Using TikWM (Free and reliable)
      try {
        const response = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        })

        if (response.data && response.data.data && response.data.data.play) {
          const videoUrl = response.data.data.play
          const title = response.data.data.title || 'TikTok Video'
          const author = response.data.data.author?.nickname || 'Unknown'

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
      } catch (error1) {
        console.error('TikWM method failed:', error1.message)
      }

      // Method 2: Using SSSTik (Free alternative)
      try {
        const response2 = await axios.post('https://ssstik.io/abc?url=dl', 
          `id=${encodeURIComponent(url)}&locale=en&tt=1`,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Referer': 'https://ssstik.io/'
            }
          }
        )

        if (response2.data && typeof response2.data === 'string') {
          // Parse the response to extract video URL
          const videoMatch = response2.data.match(/"url":"([^"]*\.mp4[^"]*)"/)
          if (videoMatch) {
            const videoUrl = videoMatch[1].replace(/\\u002F/g, '/')

            const caption = `🎵 *TikTok Video*\n\n🔗 **Source:** TikTok`

            await message.react('✅')
            return await message.send('', {
              video: { url: videoUrl },
              caption: caption
            })
          }
        }
      } catch (error2) {
        console.error('SSSTik method failed:', error2.message)
      }

      // Method 3: Using SnapTik (Free alternative)
      try {
        const response3 = await axios.post('https://snaptik.app/abc2.php', 
          `url=${encodeURIComponent(url)}`,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Referer': 'https://snaptik.app/'
            }
          }
        )

        if (response3.data && typeof response3.data === 'string') {
          const videoMatch = response3.data.match(/"url":"([^"]*\.mp4[^"]*)"/)
          if (videoMatch) {
            const videoUrl = videoMatch[1].replace(/\\u002F/g, '/')

            const caption = `🎵 *TikTok Video*\n\n🔗 **Source:** TikTok`

            await message.react('✅')
            return await message.send('', {
              video: { url: videoUrl },
              caption: caption
            })
          }
        }
      } catch (error3) {
        console.error('SnapTik method failed:', error3.message)
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