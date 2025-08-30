
const { bot } = require('../lib/client')
const axios = require('axios')

bot(
  {
    pattern: 'instagram ?(.*)',
    desc: 'Download Instagram video/image',
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
      await message.reply('🔄 Downloading from Instagram...')
      
      // Method 1: Using InstaSave (Free API)
      try {
        const response = await axios.get(`https://api.instasave.website/media?url=${encodeURIComponent(url)}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        })
        
        if (response.data && response.data.status === 'success' && response.data.media && response.data.media.length > 0) {
          const media = response.data.media[0]
          const mediaUrl = media.url
          const mediaType = media.type || 'image'
          const username = response.data.user?.username || 'Unknown'

          const caption = `📸 *Instagram ${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}*\n\n` +
                         `👤 **User:** ${username}\n` +
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
      } catch (error1) {
        console.error('InstaSave method failed:', error1.message)
      }

      // Method 2: Using DownloadGram (Free alternative)
      try {
        const response2 = await axios.post('https://downloadgram.org/media.php', 
          `url=${encodeURIComponent(url)}`,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Referer': 'https://downloadgram.org/'
            }
          }
        )

        if (response2.data && typeof response2.data === 'string') {
          // Parse HTML response to extract download links
          const videoMatch = response2.data.match(/<a[^>]*href="([^"]*)"[^>]*>Download Video<\/a>/)
          const imageMatch = response2.data.match(/<a[^>]*href="([^"]*)"[^>]*>Download Image<\/a>/)

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
      } catch (error2) {
        console.error('DownloadGram method failed:', error2.message)
      }

      // Method 3: Using Insta-Downloader (Another free option)
      try {
        const response3 = await axios.get(`https://api.insta-downloader.com/download?url=${encodeURIComponent(url)}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        })
        
        if (response3.data && response3.data.download_url) {
          const downloadUrl = response3.data.download_url
          const mediaType = response3.data.type || 'image'
          const username = response3.data.username || 'Unknown'

          const caption = `📸 *Instagram ${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}*\n\n` +
                         `👤 **User:** ${username}\n` +
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
      } catch (error3) {
        console.error('Insta-Downloader method failed:', error3.message)
      }

      await message.react('❌')
      return await message.reply('❌ Failed to download Instagram media. The post might be private or all services are temporarily unavailable.')

    } catch (error) {
      console.error('Instagram download error:', error)
      await message.react('❌')
      return await message.reply('❌ Failed to download Instagram media. Please try again later.')
    }
  }
)
