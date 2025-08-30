const { Client } = require('./lib/client')
const config = require('./config')

const start = async () => {
    try {
        console.log(`MATDEV Bot ${config.VERSION}`)
        console.log('🚀 Starting WhatsApp Personal Assistant...')
        
        // Create and connect bot client
        console.log('📱 Creating bot client...')
        const bot = new Client()
        console.log('✅ Bot client created')
        
        // Small delay to ensure proper initialization
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        console.log('📞 Calling bot.connect()...')
        await bot.connect()
        console.log('✅ Bot connected successfully')
        
        // Setup graceful shutdown
        const shutdown = async () => {
            console.log('🛑 Shutting down gracefully...')
            await bot.destroy()
            process.exit(0)
        }
        
        process.on('SIGINT', shutdown)
        process.on('SIGTERM', shutdown)
        
    } catch (error) {
        console.error('💥 Failed to start bot:', error)
        process.exit(1)
    }
}

// Start the bot
start()