#!/usr/bin/env node

/**
 * MATDEV Bot Starter - Levanter Style
 * Simple startup script similar to the attached a.txt but for MATDEV
 */

const { spawn, spawnSync } = require('child_process')
const { existsSync } = require('fs')
const path = require('path')

const SESSION_CHECK = process.env.WHATSAPP_SESSION_ID // No need to edit this like levanter

let nodeRestartCount = 0
const maxNodeRestarts = 5
const restartWindow = 30000 // 30 seconds
let lastRestartTime = Date.now()

function startNode() {
  const child = spawn('node', ['index.js'], { stdio: 'inherit' })

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

function checkSession() {
  // Check if session is configured via environment or if sessions directory exists
  if (SESSION_CHECK || existsSync('sessions')) {
    console.log('✅ Session found, starting MATDEV bot...')
    return true
  }
  
  console.log('❌ No session found. Setting up session first...')
  console.log('🔧 Running session setup...')
  
  // Run the session setup
  const setupResult = spawnSync('node', ['index_old_launcher.js'], { stdio: 'inherit' })
  
  if (setupResult.error) {
    console.error('Failed to run session setup:', setupResult.error.message)
    return false
  }
  
  return true
}

function installDependencies() {
  if (!existsSync(path.resolve('package.json'))) {
    console.error('package.json not found!')
    process.exit(1)
  }

  const result = spawnSync('npm', ['install'], { stdio: 'inherit' })

  if (result.error || result.status !== 0) {
    console.error(`Failed to install dependencies: ${result.error ? result.error.message : 'Unknown error'}`)
    process.exit(1)
  }
}

// Check dependencies
if (!existsSync('node_modules')) {
  console.log('📦 Installing dependencies...')
  installDependencies()
}

// Check session
if (checkSession()) {
  startNode()
} else {
  console.log('❌ Session setup failed or cancelled')
  process.exit(1)
}