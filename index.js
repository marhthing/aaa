const { spawn, spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const { existsSync, writeFileSync } = require('fs')

let restartCount = 0
const maxRestarts = 5
const restartWindow = 30000 // 30 seconds
let lastRestartTime = Date.now()
let currentChild = null
let isShuttingDown = false
let isPairingMode = false

// GitHub Repository Configuration
const GITHUB_REPO = 'https://github.com/marhthing/aaa.git'

// Function to install dependencies
function installDependencies() {
    console.log('📦 Installing dependencies...')
    const installResult = spawnSync('npm', ['install', '--force'], {
        stdio: 'inherit',
        env: { ...process.env, CI: 'true' }
    })

    if (installResult.error || installResult.status !== 0) {
        console.error(`❌ Failed to install dependencies: ${
            installResult.error ? installResult.error.message : 'Unknown error'
        }`)
        process.exit(1)
    }
    console.log('✅ Dependencies installed successfully!')
}

// Function to check dependencies
function checkDependencies() {
    if (!existsSync(path.resolve('package.json'))) {
        console.error('❌ package.json not found!')
        process.exit(1)
    }

    const result = spawnSync('npm', ['ls'], {
        stdio: 'pipe', // Don't show output unless there's an error
    })

    if (result.status !== 0) {
        console.log('⚠️ Some dependencies are missing or incorrectly installed.')
        installDependencies()
    } else {
        console.log('✅ Dependencies are properly installed')
    }
}

// Function to find the bot entry point
function findBotEntryPoint() {
    const possibleEntryPoints = ['bot.js', 'index.js', 'app.js', 'main.js', 'src/index.js', 'src/bot.js']

    for (const file of possibleEntryPoints) {
        if (existsSync(file)) {
            // Make sure it's not this manager script
            if (file === 'index.js') {
                try {
                    const content = fs.readFileSync(file, 'utf8')
                    // If this index.js contains "MATDEV Bot Manager", it's the manager script
                    if (content.includes('MATDEV Bot Manager') || content.includes('GitHub Repository Configuration')) {
                        continue // Skip this file, it's the manager
                    }
                } catch (err) {
                    // If we can't read it, skip it
                    continue
                }
            }
            console.log(`✅ Found bot entry point: ${file}`)
            return file
        }
    }

    // Check package.json for main field
    try {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
        if (packageJson.main && existsSync(packageJson.main)) {
            const mainFile = packageJson.main
            // Make sure it's not this manager script
            if (mainFile !== 'index.js' || !fs.readFileSync(mainFile, 'utf8').includes('MATDEV Bot Manager')) {
                console.log(`✅ Using package.json main: ${mainFile}`)
                return mainFile
            }
        }
    } catch (err) {
        console.log('⚠️ Could not read package.json main field')
    }

    return null
}

// Function to clone repository
function cloneRepository() {
    console.log('📥 Cloning the repository...')
    console.log('🔗 Repository:', GITHUB_REPO)

    // First, clone to a temporary directory
    const tempDir = 'temp_clone'
    const cloneResult = spawnSync('git', ['clone', GITHUB_REPO, tempDir], {
        stdio: 'inherit',
    })

    if (cloneResult.error) {
        throw new Error(`Failed to clone the repository: ${cloneResult.error.message}`)
    }

    if (cloneResult.status !== 0) {
        throw new Error(`Git clone failed with exit code: ${cloneResult.status}`)
    }

    console.log('✅ Repository cloned to temp directory')

    // Check what was cloned
    console.log('📁 Verifying cloned files...')
    if (!existsSync(`${tempDir}/package.json`)) {
        console.error('❌ No package.json found in cloned repository!')
        spawnSync('rm', ['-rf', tempDir], { stdio: 'inherit' })
        process.exit(1)
    }

    // Move contents from temp directory to current directory (excluding this manager)
    console.log('📦 Moving bot files to current directory...')

    // Create a backup of this manager script
    const managerBackup = 'manager_backup.js'
    if (existsSync('index.js')) {
        spawnSync('cp', ['index.js', managerBackup], { stdio: 'inherit' })
    }

    const moveResult = spawnSync('bash', ['-c', `cp -r ${tempDir}/* . && cp -r ${tempDir}/.[^.]* . 2>/dev/null || true`], {
        stdio: 'inherit',
    })

    if (moveResult.error) {
        console.error('❌ Failed to move repository contents:', moveResult.error.message)
        process.exit(1)
    }

    // Restore this manager script if it was overwritten
    if (existsSync(managerBackup)) {
        const currentIndexContent = fs.readFileSync('index.js', 'utf8')
        const backupContent = fs.readFileSync(managerBackup, 'utf8')

        // If current index.js doesn't look like our manager, restore our manager
        if (!currentIndexContent.includes('MATDEV Bot Manager') && backupContent.includes('MATDEV Bot Manager')) {
            console.log('🔄 Restoring manager script...')
            spawnSync('cp', [managerBackup, 'index.js'], { stdio: 'inherit' })
        }

        // Clean up backup
        spawnSync('rm', ['-f', managerBackup], { stdio: 'inherit' })
    }

    // Clean up temp directory
    spawnSync('rm', ['-rf', tempDir], {
        stdio: 'inherit',
    })

    console.log('✅ Bot files moved successfully!')

    // Verify we have a valid bot entry point
    const entryPoint = findBotEntryPoint()
    if (!entryPoint) {
        console.error('❌ No valid bot entry point found after cloning!')
        console.log('📁 Available JS files:')
        spawnSync('find', ['.', '-name', '*.js', '-type', 'f'], { stdio: 'inherit' })
        process.exit(1)
    }

    installDependencies()
    return entryPoint
}

// Smart setup logic
function setupBot() {
    console.log('🔍 Checking bot setup...')

    // Check if bot.js exists in root (priority check)
    if (existsSync('bot.js')) {
        console.log('✅ bot.js found in root directory - skipping clone')
        if (existsSync('package.json')) {
            checkDependencies()
        } else {
            console.log('⚠️ bot.js exists but no package.json found')
        }
        return 'bot.js'
    }

    // Check for other possible entry points
    const existingEntryPoint = findBotEntryPoint()
    if (existingEntryPoint) {
        console.log(`✅ Bot entry point found: ${existingEntryPoint} - skipping clone`)
        if (existsSync('package.json')) {
            checkDependencies()
        } else {
            console.log('⚠️ Bot files exist but no package.json found')
        }
        return existingEntryPoint
    }

    // Check if package.json exists but no entry point found
    if (existsSync('package.json')) {
        console.log('⚠️ package.json exists but no valid entry point found')
        try {
            const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
            console.log('📋 Package.json main field:', packageJson.main || 'not specified')
            console.log('📋 Package.json scripts:', JSON.stringify(packageJson.scripts || {}, null, 2))
        } catch (err) {
            console.log('❌ Could not read package.json')
        }

        // Still try to find any JS files
        console.log('📁 Available JS files:')
        spawnSync('find', ['.', '-name', '*.js', '-maxdepth', '2', '-type', 'f'], { stdio: 'inherit' })

        console.log('🤔 Bot files seem incomplete, cloning fresh copy...')
        return cloneRepository()
    }

    // No bot files found, clone repository
    console.log('📂 No bot files found, cloning from GitHub...')
    return cloneRepository()
}

function startBot() {
    console.log('🚀 Starting MATDEV Bot...')

    // Check for update flag
    const updateFlagPath = path.resolve('.update_flag')
    if (existsSync(updateFlagPath)) {
        console.log('🔄 Update flag detected - forcing reclone...')
        try {
            fs.unlinkSync(updateFlagPath) // Remove the flag file
            console.log('🗑️ Update flag removed')
        } catch (err) {
            console.error('⚠️ Could not remove update flag:', err.message)
        }
        
        // Force reclone by calling cloneRepository directly
        try {
            const entryPoint = cloneRepository()
            console.log(`🎯 Starting bot with: ${entryPoint}`)
            startBotProcess(entryPoint)
            return
        } catch (error) {
            console.error('❌ Failed to reclone repository:', error.message)
            process.exit(1)
        }
    }

    // Determine the entry point
    let entryPoint = setupBot()

    console.log(`🎯 Starting bot with: ${entryPoint}`)
    startBotProcess(entryPoint)
}

function startBotProcess(entryPoint) {
    const child = spawn('node', [entryPoint], {
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

        // Try to find an alternative entry point
        console.log('🔍 Looking for alternative entry points...')
        const alternatives = ['bot.js', 'app.js', 'main.js', 'src/index.js', 'src/bot.js']

        for (const alt of alternatives) {
            if (existsSync(alt) && alt !== entryPoint) {
                console.log(`🔄 Trying alternative entry point: ${alt}`)
                setTimeout(() => {
                    const altChild = spawn('node', [alt], { stdio: 'inherit', cwd: __dirname })
                    currentChild = altChild
                    // Note: For brevity, not re-adding all event handlers here
                    // In practice, you'd want to refactor this into a reusable function
                }, 1000)
                return
            }
        }

        console.error('❌ No working entry points found')
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
console.log('📱 Enhanced with smart clone detection and Pterodactyl compatibility')
startBot()