
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

      // Method 1: Using InstaLooter API (Free)
      try {
        const response = await axios.post('https://instalooter.com/api/post', {
          url: url
        }, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        })

        if (response.data && response.data.success && response.data.media) {
          const media = response.data.media[0]
          const mediaUrl = media.url
          const caption = `📷 *Instagram Post*\n\n🔗 **Source:** Instagram`

          await message.react('✅')
          if (media.type === 'video') {
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
        console.error('InstaLooter method failed:', error1.message)
      }

      // Method 2: Using SaveInsta API (Free alternative)
      try {
        const response2 = await axios.post('https://saveinsta.app/core/ajax.php', {
          url: url,
          host: 'instagram'
        }, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'https://saveinsta.app/'
          }
        })

        if (response2.data && typeof response2.data === 'string') {
          const urlMatch = response2.data.match(/"url":"([^"]*)"/)
          if (urlMatch) {
            const mediaUrl = urlMatch[1].replace(/\\u002F/g, '/')
            const caption = `📷 *Instagram Post*\n\n🔗 **Source:** Instagram`

            await message.react('✅')
            // Try to determine if it's video or image from URL
            if (mediaUrl.includes('.mp4') || mediaUrl.includes('video')) {
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
      } catch (error2) {
        console.error('SaveInsta method failed:', error2.message)
      }

      // Method 3: Using InstaDownloader API (Free alternative)
      try {
        const response3 = await axios.get(`https://instadownloader.co/system/action.php`, {
          params: {
            url: url,
            ajax: 1,
            download: 1
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'https://instadownloader.co/'
          }
        })

        if (response3.data && response3.data.success && response3.data.data) {
          const mediaData = response3.data.data[0]
          const mediaUrl = mediaData.url
          const caption = `📷 *Instagram Post*\n\n🔗 **Source:** Instagram`

          await message.react('✅')
          if (mediaData.type === 'video') {
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
      } catch (error3) {
        console.error('InstaDownloader method failed:', error3.message)
      }

      // Method 4: Using SnapInsta API (Free alternative)
      try {
        const response4 = await axios.post('https://snapinsta.app/action2.php', 
          `url=${encodeURIComponent(url)}&action=post`,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Referer': 'https://snapinsta.app/'
            }
          }
        )

        if (response4.data && typeof response4.data === 'string') {
          // Parse HTML response to extract download link
          const urlMatch = response4.data.match(/href="([^"]*(?:jpg|jpeg|png|mp4)[^"]*)"/)
          if (urlMatch) {
            const mediaUrl = urlMatch[1]
            const caption = `📷 *Instagram Post*\n\n🔗 **Source:** Instagram`

            await message.react('✅')
            if (mediaUrl.includes('.mp4')) {
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
      } catch (error4) {
        console.error('SnapInsta method failed:', error4.message)
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
