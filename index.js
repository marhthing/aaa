const { spawnSync, spawn } = require('child_process')
const { existsSync, writeFileSync } = require('fs')
const path = require('path')

// Session will be managed automatically by the bot - no manual configuration needed

let nodeRestartCount = 0
const maxNodeRestarts = 5
const restartWindow = 30000 // 30 seconds
let lastRestartTime = Date.now()

function startNode() {
  const child = spawn('node', ['bot.js'], { stdio: 'inherit' })

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
  console.log('Checking dependencies...')
  const installResult = spawnSync(
    'npm',
    ['install', '--force', '--no-audit'],
    {
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
  if (!existsSync(path.resolve('package.json'))) {
    console.error('package.json not found!')
    process.exit(1)
  }

  const result = spawnSync('npm', ['ls', '--depth=0'], {
    stdio: 'pipe',
  })

  if (result.status !== 0) {
    console.log('Some dependencies are missing or incorrectly installed.')
    installDependencies()
  }
}

// Git repository cloning disabled - using current directory code
function setupBot() {
  console.log('Setting up MatDev WhatsApp Bot from current directory...')
  
  // Comment: Repository cloning is disabled since code is already present
  // const GITHUB_REPO = 'https://github.com/YOUR_USERNAME/matdev-whatsapp-bot.git'
  
  console.log('✅ Using current directory as bot source')
  
  // No need to copy - we're using the current directory directly
  // Just ensure dependencies are installed
  installDependencies()
}

// Session validation removed - bot will handle session linking automatically

console.log('🚀 MatDev WhatsApp Bot Launcher')
console.log('================================')

// Session validation removed - bot handles linking automatically

setupBot()

console.log('🔌 Starting WhatsApp bot...')
startNode()