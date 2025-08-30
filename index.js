
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

let restartCount = 0
const maxRestarts = 5
const restartWindow = 30000 // 30 seconds
let lastRestartTime = Date.now()
let currentChild = null
let isShuttingDown = false
let isPairingMode = false

function startBot() {
    console.log('🚀 Starting MATDEV Bot...')
    
    const child = spawn('node', ['bot.js'], {
        stdio: 'inherit',
        cwd: __dirname
    })
    
    currentChild = child

    child.on('exit', (code, signal) => {
        console.log(`🔄 Bot process exited with code ${code} and signal ${signal}`)
        currentChild = null
        
        // Don't restart if we're shutting down
        if (isShuttingDown) {
            console.log('✅ Bot shutdown gracefully during manager shutdown')
            return
        }
        
        // Handle different exit codes
        if (code === 1) {
            // Exit code 1 = restart requested
            console.log('🔄 Restart requested, restarting bot...')
            // Check if this is pairing mode restart
            if (isPairingMode) {
                console.log('📱 Pairing mode restart detected - allowing immediate restart')
                isPairingMode = false
            }
            setTimeout(() => startBot(), 2000)
            return
        }
        
        // Exit code 2 = pairing mode (needs restart to complete authentication)
        if (code === 2) {
            console.log('📱 Pairing mode restart required - restarting to complete authentication...')
            isPairingMode = true
            setTimeout(() => startBot(), 3000) // Slightly longer delay for pairing
            return
        }
        
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

    // Return child process for external control
    return child
}

// Graceful shutdown function
const gracefulShutdown = async (signal) => {
    console.log(`🛑 Received ${signal}, initiating graceful shutdown...`)
    isShuttingDown = true
    
    if (currentChild) {
        console.log('🔄 Sending shutdown signal to bot process...')
        
        // Send SIGTERM first for graceful shutdown
        currentChild.kill('SIGTERM')
        
        // Wait up to 10 seconds for graceful shutdown
        const shutdownTimeout = setTimeout(() => {
            console.log('⚠️ Graceful shutdown timeout, forcing exit...')
            if (currentChild) {
                currentChild.kill('SIGKILL')
            }
            process.exit(1)
        }, 10000)
        
        // Wait for child to exit
        currentChild.on('exit', () => {
            clearTimeout(shutdownTimeout)
            console.log('✅ Bot process shut down successfully')
            process.exit(0)
        })
    } else {
        console.log('✅ No active bot process, exiting...')
        process.exit(0)
    }
}

// Enhanced signal handlers for PM2 compatibility
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')) 
process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'))

// PM2 specific signals
process.on('SIGUSR2', () => {
    console.log('🔄 Received SIGUSR2 (PM2 reload), performing graceful restart...')
    gracefulShutdown('SIGUSR2')
})

// Cleanup on unexpected exit
process.on('exit', (code) => {
    console.log(`🎯 Manager process exiting with code ${code}`)
    if (currentChild && !isShuttingDown) {
        console.log('🛑 Emergency cleanup: killing bot process')
        currentChild.kill('SIGKILL')
    }
})

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught exception in manager:', error)
    gracefulShutdown('UNCAUGHT_EXCEPTION')
})

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled rejection in manager:', reason)
    gracefulShutdown('UNHANDLED_REJECTION')
})

console.log('🎯 MATDEV Bot Manager Starting...')
console.log('📱 Enhanced with graceful shutdown and PM2 compatibility')
startBot()
