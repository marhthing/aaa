
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

      // Enhanced APIs with better reliability
      const APIs = [
        {
          name: 'TikWM',
          url: 'https://www.tikwm.com/api/',
          method: 'get'
        },
        {
          name: 'SSSTik',
          url: 'https://ssstik.io/abc',
          method: 'post'
        },
        {
          name: 'MusicalDown',
          url: 'https://musicaldown.com/download',
          method: 'post'
        },
        {
          name: 'TikMate',
          url: 'https://tikmate.online/download/token',
          method: 'post'
        }
      ]

      let success = false
      let lastError = ''

      // Method 1: TikWM API (Most reliable)
      try {
        const response = await axios.get(`${APIs[0].url}?url=${encodeURIComponent(url)}&hd=1`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.tikwm.com/',
            'Accept': 'application/json, text/plain, */*'
          },
          timeout: 20000
        })

        if (response.data && response.data.code === 0 && response.data.data) {
          const data = response.data.data
          const videoUrl = data.hdplay || data.play || data.wmplay
          const title = data.title || 'TikTok Video'
          const author = data.author?.nickname || data.author?.unique_id || 'Unknown'

          if (videoUrl) {
            const caption = `🎵 *TikTok Video*\n\n` +
                           `👤 **Author:** ${author}\n` +
                           `📝 **Title:** ${title.substring(0, 100)}${title.length > 100 ? '...' : ''}\n` +
                           `🔗 **Source:** TikTok`

            await message.reply('', {
              video: { url: videoUrl },
              caption: caption
            })
            success = true
          }
        }
      } catch (error1) {
        lastError = `TikWM API failed: ${error1.message}`
      }

      // Method 2: SSSTik API
      if (!success) {
        try {
          const response = await axios.post(APIs[1].url, `id=${encodeURIComponent(url)}&locale=en&tt=bWJuZWdq`, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://ssstik.io/',
              'Origin': 'https://ssstik.io'
            },
            timeout: 20000
          })

          // Parse HTML response for video URL
          const htmlContent = response.data
          const videoMatch = htmlContent.match(/href="([^"]*)" class="without_watermark"/)
          
          if (videoMatch && videoMatch[1]) {
            const videoUrl = videoMatch[1]
            const titleMatch = htmlContent.match(/<p class="maintext">([^<]*)<\/p>/)
            const authorMatch = htmlContent.match(/<h2>([^<]*)<\/h2>/)
            
            const title = titleMatch ? titleMatch[1].trim() : 'TikTok Video'
            const author = authorMatch ? authorMatch[1].trim() : 'Unknown'

            const caption = `🎵 *TikTok Video*\n\n` +
                           `👤 **Author:** ${author}\n` +
                           `📝 **Title:** ${title.substring(0, 100)}${title.length > 100 ? '...' : ''}\n` +
                           `🔗 **Source:** TikTok`

            await message.reply('', {
              video: { url: videoUrl },
              caption: caption
            })
            success = true
          }
        } catch (error2) {
          lastError = `SSSTik API failed: ${error2.message}`
        }
      }

      // Method 3: MusicalDown API
      if (!success) {
        try {
          const response = await axios.post(APIs[2].url, `url=${encodeURIComponent(url)}`, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://musicaldown.com/',
              'Origin': 'https://musicaldown.com'
            },
            timeout: 20000
          })

          // Parse HTML response for download link
          const htmlContent = response.data
          const videoMatch = htmlContent.match(/href="([^"]*)"[^>]*>.*?Download.*?Server.*?01/i)
          
          if (videoMatch && videoMatch[1]) {
            const videoUrl = videoMatch[1]
            
            const caption = `🎵 *TikTok Video*\n\n` +
                           `📝 **Title:** TikTok Video\n` +
                           `🔗 **Source:** TikTok`

            await message.reply('', {
              video: { url: videoUrl },
              caption: caption
            })
            success = true
          }
        } catch (error3) {
          lastError = `MusicalDown API failed: ${error3.message}`
        }
      }

      // Method 4: Direct extraction attempt
      if (!success) {
        try {
          // Convert short URL to full URL if needed
          let fullUrl = url
          if (url.includes('vt.tiktok.com') || url.includes('vm.tiktok.com')) {
            const expandResponse = await axios.get(url, {
              maxRedirects: 5,
              timeout: 10000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            })
            fullUrl = expandResponse.request.res.responseUrl || url
          }

          // Extract video ID from URL
          const videoIdMatch = fullUrl.match(/\/video\/(\d+)/) || fullUrl.match(/\/v\/(\d+)/)
          
          if (videoIdMatch && videoIdMatch[1]) {
            // Try alternative TikWM endpoint
            const altResponse = await axios.get(`https://tikwm.com/api/?url=${encodeURIComponent(fullUrl)}`, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
                'Accept': 'application/json'
              },
              timeout: 15000
            })

            if (altResponse.data && altResponse.data.code === 0 && altResponse.data.data) {
              const data = altResponse.data.data
              const videoUrl = data.play || data.wmplay
              
              if (videoUrl) {
                const caption = `🎵 *TikTok Video*\n\n` +
                               `📝 **Title:** ${data.title || 'TikTok Video'}\n` +
                               `🔗 **Source:** TikTok`

                await message.reply('', {
                  video: { url: videoUrl },
                  caption: caption
                })
                success = true
              }
            }
          }
        } catch (error4) {
          lastError = `Direct extraction failed: ${error4.message}`
        }
      }

      if (!success) {
        return await message.reply(`❌ Failed to download TikTok video. All services are currently unavailable.\n\n**Last error:** ${lastError}\n\n**Possible reasons:**\n• Video is private or restricted\n• TikTok has updated their API\n• Network connectivity issues\n• Video URL is invalid\n\nPlease try again later or with a different video.`)
      }

    } catch (error) {
      return await message.reply(`❌ Failed to download TikTok video: ${error.message}\n\nPlease try again later.`)
    }
  }
)
