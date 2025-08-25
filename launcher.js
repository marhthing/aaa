const { spawnSync, spawn } = require('child_process')
const { existsSync, writeFileSync } = require('fs')
const path = require('path')

const SESSION_ID = 'updateThis' // Edit this line only, don't remove ' <- this symbol

let nodeRestartCount = 0
const maxNodeRestarts = 5
const restartWindow = 30000 // 30 seconds
let lastRestartTime = Date.now()

function startNode() {
  const child = spawn('node', ['bot.js'], { cwd: '.', stdio: 'inherit' })

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

function installDependencies() {
  console.log('Installing dependencies...')
  const installResult = spawnSync(
    'npm',
    ['install', '--force', '--no-audit'],
    {
      cwd: '.',
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
    cwd: '.',
    stdio: 'pipe'
  })

  if (result.status !== 0) {
    console.log('Some dependencies are missing or incorrectly installed.')
    installDependencies()
  }
}

function setupConfig() {
  const configPath = '.env'
  try {
    console.log('Setting up configuration...')
    const configContent = `SESSION_ID=${SESSION_ID}
PREFIX=.
BOT_NAME=MatDev
BOT_LANG=en
AUTO_READ=false
AUTO_ONLINE=true
REJECT_CALLS=true
LOG_LEVEL=info
NODE_ENV=production
DATABASE_URL=sqlite:./data/matdev.db`
    
    writeFileSync(configPath, configContent)
    console.log('✅ Configuration setup complete')
  } catch (err) {
    throw new Error(`Failed to write to .env: ${err.message}`)
  }
}

function validateSessionId() {
  if (SESSION_ID === 'updateThis') {
    console.error('❌ Please edit the SESSION_ID in launcher.js before running!')
    console.error('   Change "updateThis" to your actual session ID from the web scanner.')
    process.exit(1)
  }
  console.log(`✅ Using SESSION_ID: ${SESSION_ID}`)
}

console.log('🚀 MatDev WhatsApp Bot Launcher')
console.log('================================')

validateSessionId()
setupConfig()
checkDependencies()

console.log('🔌 Starting WhatsApp bot...')
startNode()