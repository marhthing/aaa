const { bot } = require('../lib/client')
const axios = require('axios')

bot(
  {
    pattern: 'instagram ?(.*)',
    desc: 'Download Instagram video/photo',
    type: 'media',
  },
  async (message, match) => {
    if (!match || !match.trim()) {
      return await message.reply('❌ Please provide an Instagram URL\n\nUsage: `.instagram <instagram_url>`')
    }

    const url = match.trim()

    // Validate Instagram URL
    if (!url.includes('instagram.com')) {
      return await message.reply('❌ Please provide a valid Instagram URL')
    }

    await message.react('⏳')

    try {
      // Method 1: Using RapidAPI Instagram Downloader
      await message.reply('🔄 Downloading from Instagram...')

      const options = {
        method: 'GET',
        url: 'https://instagram-downloader-download-instagram-videos-stories.p.rapidapi.com/index',
        params: { url: url },
        headers: {
          'X-RapidAPI-Key': 'f2d0d9da7emsh4f7d8c0b0e7e5f0p1c4b2djsn8f7b9a5d2c3e',
          'X-RapidAPI-Host': 'instagram-downloader-download-instagram-videos-stories.p.rapidapi.com'
        }
      }

      const response = await axios.request(options)

      if (response.data && response.data.media && response.data.media.length > 0) {
        const media = response.data.media[0]
        const mediaUrl = media.url
        const mediaType = media.type || 'image'

        if (mediaUrl) {
          const caption = `📸 *Instagram ${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}*\n\n` +
                         `👤 **User:** ${response.data.title || 'Unknown'}\n` +
                         `📱 **Type:** ${mediaType}\n` +
                         `🔗 **Source:** Instagram`

          await message.react('✅')

          if (mediaType === 'video') {
            return await message.send('', {
              video: { url: mediaUrl },
              caption: caption
            })
          } else {
            return await message.send('', {
              image: { url: mediaUrl },
              caption: caption
            })
          }
        }
      }

      // Method 2: Fallback using different API
      try {
        const fallbackResponse = await axios.get(`https://api.instagram-downloader.net/download?url=${encodeURIComponent(url)}`)

        if (fallbackResponse.data && fallbackResponse.data.download_url) {
          const downloadUrl = fallbackResponse.data.download_url
          const mediaType = fallbackResponse.data.type || 'image'

          const caption = `📸 *Instagram ${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}*\n\n` +
                         `📱 **Type:** ${mediaType}\n` +
                         `🔗 **Source:** Instagram`

          await message.react('✅')

          if (mediaType === 'video' || downloadUrl.includes('.mp4')) {
            return await message.send('', {
              video: { url: downloadUrl },
              caption: caption
            })
          } else {
            return await message.send('', {
              image: { url: downloadUrl },
              caption: caption
            })
          }
        }
      } catch (fallbackError) {
        console.error('Instagram fallback method failed:', fallbackError.message)
      }

      // Method 3: Another fallback
      try {
        const response3 = await axios.post('https://saveig.app/api/ajaxSearch', 
          `q=${encodeURIComponent(url)}&t=media&lang=en`,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          }
        )

        if (response3.data && response3.data.data) {
          // Parse HTML response to extract download links
          const htmlData = response3.data.data
          const videoMatch = htmlData.match(/<a[^>]*href="([^"]*)"[^>]*>Download Video<\/a>/)
          const imageMatch = htmlData.match(/<a[^>]*href="([^"]*)"[^>]*>Download Image<\/a>/)

          if (videoMatch || imageMatch) {
            const downloadUrl = videoMatch ? videoMatch[1] : imageMatch[1]
            const mediaType = videoMatch ? 'video' : 'image'

            const caption = `📸 *Instagram ${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}*\n\n` +
                           `📱 **Type:** ${mediaType}\n` +
                           `🔗 **Source:** Instagram`

            await message.react('✅')

            if (mediaType === 'video') {
              return await message.send('', {
                video: { url: downloadUrl },
                caption: caption
              })
            } else {
              return await message.send('', {
                image: { url: downloadUrl },
                caption: caption
              })
            }
          }
        }
      } catch (error3) {
        console.error('Instagram method 3 failed:', error3.message)
      }

      await message.react('❌')
      return await message.reply('❌ Failed to download Instagram media. The post might be private or the link is invalid.')

    } catch (error) {
      console.error('Instagram download error:', error)
      await message.react('❌')
      return await message.reply('❌ Failed to download Instagram media. Please try again later.')
    }
  }
)