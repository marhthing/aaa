const { spawnSync, spawn } = require('child_process')
const { existsSync, writeFileSync } = require('fs')
const path = require('path')

const SESSION_ID = 'updateThis' // Edit this line only, don't remove ' <- this symbol

let nodeRestartCount = 0
const maxNodeRestarts = 5
const restartWindow = 30000 // 30 seconds
let lastRestartTime = Date.now()

function startNode() {
  const child = spawn('node', ['bot.js'], { cwd: 'matdev-bot', stdio: 'inherit' })

  child.on('exit', (code) => {
    if (code !== 0) {
      const currentTime = Date.now()
      if (currentTime - lastRestartTime > restartWindow) {
        nodeRestartCount = 0
      }
      lastRestartTime = currentTime
      nodeRestartCount++

      if (nodeRestartCount > maxNodeRestarts) {
        console.error('Node.js process is restarting continuously. Stopping retries...')
        return
      }
      console.log(
        `Node.js process exited with code ${code}. Restarting... (Attempt ${nodeRestartCount})`
      )
      startNode()
    }
  })
}

function startPm2() {
  const pm2 = spawn('npm', ['run', 'pm2'], {
    cwd: 'matdev-bot',
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let restartCount = 0
  const maxRestarts = 5

  pm2.on('exit', (code) => {
    if (code !== 0) {
      startNode()
    }
  })

  pm2.on('error', (error) => {
    console.error(`npm pm2 error: ${error.message}`)
    startNode()
  })

  // Check for infinite restarts
  if (pm2.stderr) {
    pm2.stderr.on('data', (data) => {
      const output = data.toString()
      if (output.includes('restart')) {
        restartCount++
        if (restartCount > maxRestarts) {
          spawnSync('npm', ['run', 'pm2:stop'], { cwd: 'matdev-bot', stdio: 'inherit' })
          startNode()
        }
      }
    })
  }

  if (pm2.stdout) {
    pm2.stdout.on('data', (data) => {
      const output = data.toString()
      console.log(output)
      if (output.includes('Connecting')) {
        restartCount = 0
      }
    })
  }
}

function installDependencies() {
  console.log('Installing dependencies...')
  const installResult = spawnSync(
    'npm',
    ['install', '--force', '--no-audit'],
    {
      cwd: 'matdev-bot',
      stdio: 'inherit',
      env: { ...process.env, CI: 'true' }
    }
  )

  if (installResult.error || installResult.status !== 0) {
    console.error(
      `Failed to install dependencies: ${
        installResult.error ? installResult.error.message : 'Unknown error'
      }`
    )
    process.exit(1)
  }
}

function checkDependencies() {
  if (!existsSync(path.resolve('matdev-bot/package.json'))) {
    console.error('package.json not found!')
    process.exit(1)
  }

  const result = spawnSync('npm', ['ls', '--depth=0'], {
    cwd: 'matdev-bot',
    stdio: 'pipe',
  })

  if (result.status !== 0) {
    console.log('Some dependencies are missing or incorrectly installed.')
    installDependencies()
  }
}

function cloneRepository() {
  console.log('Setting up MatDev WhatsApp Bot...')
  
  // For now, use current directory as the bot since repo is not uploaded yet
  // When you upload to GitHub, change this URL to your actual repository
  const GITHUB_REPO = 'https://github.com/YOUR_USERNAME/matdev-whatsapp-bot.git'
  
  // Try to clone, but if it fails, use current directory
  const cloneResult = spawnSync(
    'git',
    ['clone', GITHUB_REPO, 'matdev-bot'],
    {
      stdio: 'pipe', // Don't show output to avoid confusing users
    }
  )

  if (cloneResult.error || cloneResult.status !== 0) {
    console.log('Repository not found, using current directory as bot source...')
    
    // Create symbolic link or copy current directory
    const copyResult = spawnSync('cp', ['-r', '.', 'matdev-bot'], {
      stdio: 'inherit'
    })
    
    if (copyResult.error) {
      throw new Error(`Failed to set up bot: ${copyResult.error.message}`)
    }
  }

  const configPath = 'matdev-bot/.env'
  try {
    console.log('Writing configuration...')
    writeFileSync(configPath, `SESSION_ID=${SESSION_ID}
PREFIX=.
BOT_NAME=MatDev
BOT_LANG=en
AUTO_READ=false
AUTO_ONLINE=true
REJECT_CALLS=true
LOG_LEVEL=info
NODE_ENV=production
DATABASE_URL=${process.env.DATABASE_URL || 'sqlite:./data/matdev.db'}`)
  } catch (err) {
    throw new Error(`Failed to write to .env: ${err.message}`)
  }

  installDependencies()
}

function validateSessionId() {
  if (SESSION_ID === 'updateThis') {
    console.error('❌ Please edit the SESSION_ID in index.js before running!')
    console.error('   Change "updateThis" to your actual session ID from the web scanner.')
    console.error('   Get your session ID from: https://your-scanner-site.vercel.app')
    process.exit(1)
  }
  console.log(`✅ Using SESSION_ID: ${SESSION_ID}`)
}

console.log('🚀 MatDev WhatsApp Bot Launcher')
console.log('================================')

validateSessionId()

if (!existsSync('matdev-bot')) {
  cloneRepository()
  checkDependencies()
} else {
  checkDependencies()
}

console.log('🔌 Starting WhatsApp bot...')
startPm2()