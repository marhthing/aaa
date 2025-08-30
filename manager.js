
const { spawn } = require('child_process')
const path = require('path')

let restartCount = 0
const maxRestarts = 5
const restartWindow = 30000 // 30 seconds
let lastRestartTime = Date.now()

function startBot() {
    console.log('🚀 Starting MATDEV Bot...')
    
    const child = spawn('node', ['index.js'], {
        stdio: 'inherit',
        cwd: __dirname
    })

    child.on('exit', (code, signal) => {
        console.log(`🔄 Bot process exited with code ${code} and signal ${signal}`)
        
        // Only restart on unexpected exits (not manual shutdown)
        if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGINT') {
            const currentTime = Date.now()
            
            // Reset restart count if enough time has passed
            if (currentTime - lastRestartTime > restartWindow) {
                restartCount = 0
            }
            
            lastRestartTime = currentTime
            restartCount++

            if (restartCount > maxRestarts) {
                console.error(`❌ Bot has crashed ${maxRestarts} times in ${restartWindow/1000} seconds. Stopping auto-restart.`)
                process.exit(1)
            }

            console.log(`🔄 Restarting bot... (Attempt ${restartCount}/${maxRestarts})`)
            setTimeout(() => startBot(), 2000) // Wait 2 seconds before restart
        } else {
            console.log('✅ Bot shutdown gracefully')
            process.exit(0)
        }
    })

    child.on('error', (error) => {
        console.error('❌ Failed to start bot process:', error)
        process.exit(1)
    })

    // Handle manager shutdown signals
    process.on('SIGINT', () => {
        console.log('🛑 Received SIGINT, shutting down bot...')
        child.kill('SIGTERM')
    })

    process.on('SIGTERM', () => {
        console.log('🛑 Received SIGTERM, shutting down bot...')
        child.kill('SIGTERM')
    })
}

console.log('🎯 MATDEV Bot Manager Starting...')
startBot()
