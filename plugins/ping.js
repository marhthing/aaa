const { bot } = require('../lib/client')

bot(
  {
    pattern: 'ping ?(.*)',
    desc: 'Check bot response time',
    type: 'misc',
  },
  async (message, match) => {
    const start = new Date().getTime()
    await message.send('🏓 Pong!')
    const end = new Date().getTime()
    return await message.send(`⚡ Response time: ${end - start}ms`)
  }
)