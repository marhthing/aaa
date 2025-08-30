
const { bot } = require('../lib/client')
const axios = require('axios')

bot(
  {
    pattern: 'ig ?(.*)',
    desc: 'Download Instagram post/reel',
    type: 'media',
  },
  async (message, match) => {
    if (!match || !match.trim()) {
      return await message.reply('❌ Please provide an Instagram URL\n\nUsage: `.ig <instagram_url>`')
    }

    const url = match.trim()

    // Validate Instagram URL
    if (!url.includes('instagram.com')) {
      return await message.reply('❌ Please provide a valid Instagram URL')
    }

    try {
      await message.reply('🔄 Downloading from Instagram...')

      // Working APIs for Instagram
      const APIs = [
        'https://api.saveig.app/v1/media-info',
        'https://api.instasave.website/media',
        'https://api.downloadgram.org/media'
      ]

      let success = false

      // Method 1: SaveIG API
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
          const mediaUrl = data.download_url || data.video_url || data.image_url
          const caption = data.caption || 'Instagram Post'
          const author = data.username || 'Unknown'

          if (mediaUrl) {
            const messageCaption = `📸 *Instagram Post*\n\n` +
                                  `👤 **Author:** @${author}\n` +
                                  `📝 **Caption:** ${caption}\n` +
                                  `🔗 **Source:** Instagram`

            const isVideo = mediaUrl.includes('.mp4') || data.type === 'video'
            
            if (isVideo) {
              await message.send('', {
                video: { url: mediaUrl },
                caption: messageCaption
              })
            } else {
              await message.send('', {
                image: { url: mediaUrl },
                caption: messageCaption
              })
            }
            success = true
          }
        }
      } catch (error1) {
        console.error('SaveIG API failed:', error1.message)
      }

      // Method 2: InstaSave API
      if (!success) {
        try {
          const response = await axios.get(APIs[1], {
            params: { url: url },
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 15000
          })

          if (response.data && response.data.download_link) {
            const mediaUrl = response.data.download_link
            const caption = response.data.caption || 'Instagram Post'

            const messageCaption = `📸 *Instagram Post*\n\n` +
                                  `📝 **Caption:** ${caption}\n` +
                                  `🔗 **Source:** Instagram`

            const isVideo = mediaUrl.includes('.mp4')
            
            if (isVideo) {
              await message.send('', {
                video: { url: mediaUrl },
                caption: messageCaption
              })
            } else {
              await message.send('', {
                image: { url: mediaUrl },
                caption: messageCaption
              })
            }
            success = true
          }
        } catch (error2) {
          console.error('InstaSave API failed:', error2.message)
        }
      }

      // Method 3: DownloadGram API
      if (!success) {
        try {
          const response = await axios.post(APIs[2], {
            url: url
          }, {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 15000
          })

          if (response.data && response.data.media && response.data.media.length > 0) {
            const media = response.data.media[0]
            const mediaUrl = media.url
            const caption = response.data.caption || 'Instagram Post'

            if (mediaUrl) {
              const messageCaption = `📸 *Instagram Post*\n\n` +
                                    `📝 **Caption:** ${caption}\n` +
                                    `🔗 **Source:** Instagram`

              const isVideo = media.type === 'video' || mediaUrl.includes('.mp4')
              
              if (isVideo) {
                await message.send('', {
                  video: { url: mediaUrl },
                  caption: messageCaption
                })
              } else {
                await message.send('', {
                  image: { url: mediaUrl },
                  caption: messageCaption
                })
              }
              success = true
            }
          }
        } catch (error3) {
          console.error('DownloadGram API failed:', error3.message)
        }
      }

      if (!success) {
        return await message.reply('❌ Failed to download Instagram media. All services are temporarily unavailable or the post might be private.')
      }

    } catch (error) {
      console.error('Instagram download error:', error)
      return await message.reply('❌ Failed to download Instagram media. Please try again later.')
    }
  }
)
