
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
      // Method 1: Using TikTok API
      await message.reply('🔄 Downloading from TikTok...')
      
      const options = {
        method: 'GET',
        url: 'https://tiktok-downloader-download-tiktok-videos-without-watermark.p.rapidapi.com/vid/index',
        params: { url: url },
        headers: {
          'X-RapidAPI-Key': 'f2d0d9da7emsh4f7d8c0b0e7e5f0p1c4b2djsn8f7b9a5d2c3e',
          'X-RapidAPI-Host': 'tiktok-downloader-download-tiktok-videos-without-watermark.p.rapidapi.com'
        }
      }

      const response = await axios.request(options)
      
      if (response.data && response.data.video && response.data.video.length > 0) {
        const videoUrl = response.data.video[0]
        const title = response.data.title || 'TikTok Video'
        const author = response.data.author || 'Unknown'
        
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

      // Method 2: Using alternative API
      try {
        const response2 = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`)
        
        if (response2.data && response2.data.video && response2.data.video.noWatermark) {
          const videoUrl = response2.data.video.noWatermark
          const title = response2.data.title || 'TikTok Video'
          const author = response2.data.author?.name || 'Unknown'
          
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
        console.error('TikTok method 2 failed:', error2.message)
      }

      // Method 3: Using SnapTik alternative
      try {
        const response3 = await axios.post('https://snaptik.app/abc2.php', 
          `url=${encodeURIComponent(url)}`,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          }
        )

        if (response3.data && typeof response3.data === 'string') {
          // Parse the response to extract video URL
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
        console.error('TikTok method 3 failed:', error3.message)
      }

      // Method 4: Using TikWM
      try {
        const response4 = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`)
        
        if (response4.data && response4.data.data && response4.data.data.play) {
          const videoUrl = response4.data.data.play
          const title = response4.data.data.title || 'TikTok Video'
          const author = response4.data.data.author?.nickname || 'Unknown'
          
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
      } catch (error4) {
        console.error('TikTok method 4 failed:', error4.message)
      }

      await message.react('❌')
      return await message.reply('❌ Failed to download TikTok video. The video might be private or the link is invalid.')

    } catch (error) {
      console.error('TikTok download error:', error)
      await message.react('❌')
      return await message.reply('❌ Failed to download TikTok video. Please try again later.')
    }
  }
)
