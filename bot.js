const { Client } = require('./lib/client')
const config = require('./config')

const start = async () => {
    console.log(`MATDEV Bot ${config.VERSION}`)
    console.log('🚀 Starting WhatsApp Personal Assistant...')
    
    // Create bot client
    console.log('📱 Creating bot client...')
    const bot = new Client()
    console.log('✅ Bot client created')
    
    // Setup graceful shutdown handlers first
    const shutdown = async () => {
        console.log('🛑 Shutting down gracefully...')
        try {
            await bot.destroy()
        } catch (error) {
            console.error('Error during shutdown:', error)
        }
        process.exit(0)
    }
    
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
    
    // Function to attempt connection with retry logic
    const connectWithRetry = async (retryCount = 0) => {
        try {
            // Check if bot is already connected before attempting
            const status = bot.getStatus()
            if (status.ready) {
                console.log('✅ Bot already connected and ready')
                return
            }
            
            console.log('📞 Calling bot.connect()...')
            await bot.connect()
            console.log('✅ Bot connected successfully')
        } catch (error) {
            console.error(`💥 Connection attempt ${retryCount + 1} failed:`, error.message)
            
            if (retryCount < 3) {
                const retryDelay = (retryCount + 1) * 5000 // Increasing delay
                console.log(`🔄 Retrying connection in ${retryDelay/1000} seconds...`)
                setTimeout(() => connectWithRetry(retryCount + 1), retryDelay)
            } else {
                console.error('❌ Max connection attempts reached. Bot will keep running and retry automatically when session issues are resolved.')
                // Don't exit - let the bot's internal retry mechanisms handle it
            }
        }
    }
    
    // Small delay to ensure proper initialization
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Start initial connection attempt
    await connectWithRetry()
}

// Start the bot
start()