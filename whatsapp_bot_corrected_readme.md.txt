# WhatsApp Bot - Personal Assistant Architecture

## 📋 Table of Contents
- [Overview](#overview)
- [Architecture](#architecture) 
- [Core Behavior](#core-behavior)
- [File Structure](#file-structure)
- [Core Components](#core-components)
- [Plugin System](#plugin-system)
- [Media & Message Storage](#media--message-storage)
- [Session Management](#session-management)
- [Hot-Reload Plugin System](#hot-reload-plugin-system)
- [Installation & Setup](#installation--setup)
- [Configuration](#configuration)
- [Usage Examples](#usage-examples)
- [Development Guide](#development-guide)
- [API Reference](#api-reference)

## 🎯 Overview

This WhatsApp bot is built as a **personal assistant** that operates through **your WhatsApp number** with strict access control:

### 🔐 Core Behavior (IMPORTANT)
- **Bot ONLY responds to YOU (the owner)** by default
- **Your responses appear from YOUR WhatsApp number/JID** 
- **Other users are ignored** unless specific exceptions apply
- **Complete message & media archival** of all conversations
- **Hot-reload plugin system** for adding functionality without restart

### ✅ When Bot Responds to Others
1. **During Active Games**: When you start `.tictactoe`, both players can send valid game moves
2. **Explicitly Allowed Commands**: Use `.allow ping` in someone's chat to let them use `.ping` 
3. **Game Input Only**: Other users can only send valid game inputs, not general commands

### 🔄 Command Processing Flow
```
User Message → Is Owner? → Process Command + Loading Reaction
             ↓ No
             Is Game Active? → Is Valid Game Input? → Process Game Move
             ↓ No                ↓ No
             Is Command Allowed? → Process Allowed Command
             ↓ No
             IGNORE (No Response)
```

### ⚡ Loading Reaction System
- **Auto-loading emoji** (⏳) when you send commands
- **Emoji removed** when command processing completes
- **Visual feedback** for command execution status

---

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   YOUR WhatsApp │    │   Message Store  │    │   Hot-Reload    │
│   Number/JID    │───▶│   JSON + Media   │───▶│   Plugin System │
│   (Owner Only)  │    │   Archive        │    │   Auto-Discovery│
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                       │
         │                        ▼                       │
         │              ┌──────────────────┐              │
         │              │  Access Control  │              │
         │              │  Owner/Game/Allow│              │
         │              │  Filter          │              │
         │              └──────────────────┘              │
         │                        │                       │
         ▼                        ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Loading React │    │   State Machine  │    │   Plugin Store  │
│   Emoji System  │    │   Context Engine │    │   Standalone    │
│   Auto Remove   │    │   Game States    │    │   Configs       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

---

## 📁 File Structure

```
whatsapp-bot/
├── package.json                 
├── .env                         # User-configurable settings
├── .env.system                  # System settings (hidden from user)
├── start.js                     # Session selector & startup
│
├── src/
│   ├── index.js                 
│   │
│   ├── core/                    
│   │   ├── BotClient.js         # Personal WhatsApp client wrapper
│   │   ├── EnvironmentManager.js# Dual .env system manager
│   │   ├── AccessController.js  # Owner/Game/Allow permission system
│   │   ├── LoadingReaction.js   # Auto loading emoji manager
│   │   ├── SessionManager.js    # Multi-session handler (separable)
│   │   ├── EventBus.js          # High-performance event system
│   │   ├── MessageArchiver.js   # Complete message storage engine
│   │   ├── MediaVault.js        # Universal media storage system
│   │   ├── HotReloader.js       # Live plugin reload system
│   │   ├── MessageProcessor.js  # Owner-first message router
│   │   ├── StateEngine.js       # Game & conversation states
│   │   ├── PluginDiscovery.js   # Auto-detect & register plugins
│   │   └── PerformanceMonitor.js
│   │
│   ├── middleware/              
│   │   ├── index.js             
│   │   ├── messageCapture.js    # Archive all messages + metadata
│   │   ├── accessFilter.js      # Owner/Game/Allow filtering
│   │   ├── loadingReaction.js   # Loading emoji middleware
│   │   ├── mediaDownloader.js   # Auto-download all media
│   │   ├── gameStateManager.js  # Game session management
│   │   ├── allowedCommands.js   # Per-user command permissions
│   │   └── errorRecovery.js     
│   │
│   ├── plugins/                 # Hot-reloadable plugins (AUTO-DISCOVERY)
│   │   ├── .registry.json       # Auto-generated plugin index
│   │   ├── _loader.js           # Plugin discovery engine
│   │   │
│   │   ├── core-commands/       # Essential bot commands (Owner Only)
│   │   │   ├── plugin.json      # Plugin manifest & config
│   │   │   ├── index.js         # Main plugin entry
│   │   │   ├── commands.js      # .help, .info, .settings, .allow
│   │   │   ├── envCommands.js   # .env add/remove/list/set commands
│   │   │   └── states.js        # Command states
│   │   │
│   │   ├── games/               # Interactive games (Multi-user when active)
│   │   │   ├── plugin.json      
│   │   │   ├── index.js         
│   │   │   ├── ticTacToe.js     # .tictactoe - allows opponent input
│   │   │   ├── wordGuess.js     # .wordguess - allows multiple players
│   │   │   └── gameStates.js    # Game state management
│   │   │
│   │   ├── admin-tools/         # Admin utilities (Owner Only)
│   │   │   ├── plugin.json      
│   │   │   ├── index.js         
│   │   │   ├── allowCommands.js # .allow/.disallow command management
│   │   │   ├── userManager.js   # User permission management
│   │   │   └── systemInfo.js    # .status, .reload commands
│   │   │
│   │   ├── anti-delete/         # Message recovery (Owner Only)
│   │   │   ├── plugin.json      
│   │   │   ├── index.js         
│   │   │   ├── detector.js      # Deletion detection
│   │   │   └── recovery.js      # Message recovery from archive
│   │   │
│   │   ├── media-tools/         # Media processing (Owner Only)
│   │   │   ├── plugin.json      
│   │   │   ├── index.js         
│   │   │   ├── converter.js     # Format conversion
│   │   │   ├── upscaler.js      # Image/video upscaling
│   │   │   └── analyzer.js      # Media analysis
│   │   │
│   │   └── [auto-discovered]/   # Drop any new plugin here!
│   │       ├── plugin.json      # Required: Plugin manifest
│   │       ├── index.js         # Required: Main entry point
│   │       └── [custom files]   # Optional: Plugin-specific files
│   │
│   ├── services/                
│   │   ├── storage.js           
│   │   ├── environmentService.js# .env management service
│   │   ├── accessControl.js     # Owner/Game/Allow permission logic
│   │   ├── gameSessionStore.js  # Active game sessions
│   │   ├── allowedCommands.js   # Per-user allowed command store
│   │   ├── reactionManager.js   # Loading emoji management
│   │   ├── mediaManager.js      
│   │   └── messageQuery.js      
│   │
│   └── utils/                   
│       ├── jidManager.js        # JID validation & owner detection
│       ├── messageUtils.js      
│       ├── accessUtils.js       # Permission checking utilities
│       ├── gameUtils.js         # Game state utilities
│       └── constants.js         
│
├── sessions/                    # Multi-session storage (SEPARABLE)
│   ├── session_001/            
│   │   ├── auth/               
│   │   ├── config.json         
│   │   └── metadata.json       # Contains OWNER_JID
│   └── session_registry.json   
│
├── data/                       
│   ├── messages/               # Complete message archive
│   │   ├── 2024/               
│   │   │   ├── 01/             
│   │   │   │   ├── individual/ # All personal chats (archived)
│   │   │   │   ├── groups/     # All group chats (archived)
│   │   │   │   └── status/     # Status updates (archived)
│   │   │   └── [other months]
│   │   └── [other years]
│   │
│   ├── media/                  # Universal media vault
│   │   ├── images/             # All images (from all chats)
│   │   ├── videos/             # All videos
│   │   ├── audio/              # All audio files
│   │   ├── documents/          # All documents
│   │   └── stickers/           # All stickers
│   │
│   ├── plugins/                # Plugin-specific data
│   │   ├── games/              
│   │   │   ├── active_games.json    # Current game sessions
│   │   │   ├── allowed_players.json # Game participant permissions
│   │   │   └── game_history.json    # Game results
│   │   ├── admin-tools/        
│   │   │   ├── allowed_commands.json # Per-user command permissions
│   │   │   └── user_permissions.json # User access levels
│   │   └── [plugin-name]/      
│   │
│   └── system/                 
│       ├── access_control.json # Owner JID & permission settings
│       ├── loading_reactions.json # Active loading emoji states
│       └── performance.json    
│
└── config/                     
    ├── default.json            # Default configuration
    └── plugins.json            # Plugin-specific settings
```

---

## 🔐 Core Behavior Details

### Access Control System

#### 1. **Owner-Only Mode (Default)**
```javascript
// Every message is filtered through access control
async processMessage(message) {
  const isOwner = this.accessControl.isOwner(message.sender)
  
  if (!isOwner) {
    // Check if it's a valid game input or allowed command
    return this.handleNonOwnerMessage(message)
  }
  
  // Process owner command with loading reaction
  await this.showLoadingReaction(message)
  const response = await this.processOwnerCommand(message)
  await this.removeLoadingReaction(message)
  
  return response
}
```

#### 2. **Game Exception System**
```javascript
// When game is active, allow specific inputs
async handleGameMessage(message) {
  const activeGame = await this.gameManager.getActiveGame(message.chat)
  
  if (!activeGame) return null // Ignore if no game
  
  if (this.isValidGameInput(message.text, activeGame.type)) {
    return this.processGameMove(message, activeGame)
  }
  
  return null // Ignore invalid game input
}
```

#### 3. **Command Allow System**
```javascript
// Owner can allow specific commands for specific users
// Usage: .allow ping (in user's chat)
async allowCommand(commandName, userJid, chatJid) {
  await this.allowedCommands.add({
    user: userJid,
    command: commandName,
    chat: chatJid,
    allowedBy: this.ownerJid,
    timestamp: Date.now()
  })
}

// Check if user can use command
async canUseCommand(userJid, commandName, chatJid) {
  return this.allowedCommands.isAllowed(userJid, commandName, chatJid)
}
```

---

## ⚡ Loading Reaction System

### Auto-Loading Emoji Management
```javascript
class LoadingReaction {
  async showLoading(message) {
    // Add loading emoji to owner's command
    await this.client.sendReaction(
      message.chat, 
      message.id, 
      '⏳'
    )
    
    this.activeReactions.set(message.id, {
      chat: message.chat,
      messageId: message.id,
      timestamp: Date.now()
    })
  }
  
  async removeLoading(message) {
    // Remove loading emoji when done
    await this.client.sendReaction(
      message.chat, 
      message.id, 
      ''  // Empty reaction removes it
    )
    
    this.activeReactions.delete(message.id)
  }
}
```

### Usage in Commands
```javascript
async executeCommand(message) {
  // Show loading
  await this.loadingReaction.showLoading(message)
  
  try {
    // Process command
    const result = await this.processCommand(message)
    
    // Send response
    await this.sendResponse(message.chat, result)
    
  } finally {
    // Always remove loading emoji
    await this.loadingReaction.removeLoading(message)
  }
}
```

---

## 🎮 Plugin System

### Plugin Architecture
Each plugin is self-contained with strict access control:

#### Core Commands Plugin (Owner Only)
```javascript
// plugins/core-commands/index.js
module.exports = {
  name: 'core-commands',
  ownerOnly: true, // This plugin only responds to owner
  
  commands: {
    async help(message, context) {
      return this.generateHelpText(context.availableCommands)
    },
    
    async allow(message, args, context) {
      // .allow ping - allows user to use .ping in this chat
      const commandName = args[0]
      const userJid = context.chatJid // Current chat participant
      
      await context.accessControl.allowCommand(commandName, userJid, context.chatJid)
      return `✅ User can now use .${commandName} in this chat`
    },
    
    async disallow(message, args, context) {
      const commandName = args[0]
      const userJid = context.chatJid
      
      await context.accessControl.disallowCommand(commandName, userJid, context.chatJid)
      return `❌ User can no longer use .${commandName}`
    }
  }
}
```

#### Games Plugin (Multi-user when active)
```javascript
// plugins/games/index.js
module.exports = {
  name: 'games',
  ownerOnly: false, // Can respond to others during active games
  
  commands: {
    async tictactoe(message, args, context) {
      if (!context.isOwner) return null // Only owner can start games
      
      // Start new game - now other player can participate
      const game = await this.startTicTacToe(message.chat, message.sender)
      return 'Tic-tac-toe started! Other player can send 1-9 to play.'
    }
  },
  
  gameStates: {
    async TICTACTOE_ACTIVE(message, context) {
      // This handles messages from both players during game
      const game = context.activeGame
      
      if (!this.isValidMove(message.text)) {
        return null // Ignore invalid inputs
      }
      
      return this.processGameMove(message, game)
    }
  }
}
```

#### Plugin Manifest
```json
{
  "name": "weather-plugin",
  "version": "1.0.0",
  "description": "Weather information plugin",
  "ownerOnly": true,
  "autoLoad": true,
  
  "commands": {
    "triggers": ["weather", "forecast"],
    "prefix": ".",
    "allowedUsers": "owner" // or "all" for games
  },
  
  "permissions": [
    "message.send",
    "reaction.add",
    "media.download"
  ],
  
  "config": {
    "apiKey": "your-api-key",
    "defaultCity": "New York"
  }
}
```

---

## 💾 Complete Message & Media Storage

### Message Archival System
Every message from every chat is stored, regardless of whether bot responds:

```json
{
  "messageId": "3EB0C431C1E23C5A7B4F",
  "timestamp": 1693920000000,
  "sender": "1234567890@s.whatsapp.net",
  "recipient": "0987654321@s.whatsapp.net", // Your JID
  "chatType": "individual|group|status",
  "messageType": "text|image|video|audio|document|sticker",
  "content": {
    "text": "Hello world!",
    "caption": "Optional caption",
    "mediaPath": "data/media/images/2024/01/3EB0C431C1E23C5A7B4F.jpg"
  },
  "wasProcessed": false, // true only if bot responded
  "botResponse": {
    "responseId": "3EB0C431C1E23C5A7B5G",
    "plugin": "core-commands",
    "command": "help",
    "processingTime": 1200
  }
}
```

### Media Vault System
All media files auto-downloaded and stored:
- **Images**: Original quality + thumbnails
- **Videos**: Original + compressed versions
- **Audio**: Voice notes and music files
- **Documents**: PDFs, Word docs, etc.
- **Stickers**: Complete sticker collection

---

## 🚀 Installation & Setup

### Quick Start
```bash
git clone <repository-url>
cd whatsapp-bot
npm install

# Copy environment templates
cp .env.example .env
# Note: .env.system is automatically created with system defaults

# Configure your API keys and preferences in .env
nano .env

npm run start
```

### First Time Setup
1. **Scan QR Code**: Link your WhatsApp
2. **System Detection**: Bot auto-detects your JID and saves to `.env.system`
3. **Configure Settings**: Use `.env add/set` commands to customize
4. **Test Environment**: Send `.env list` to see your settings
5. **Archive Starts**: All messages now being stored

### Environment Configuration

#### `.env` - User Configurable Settings
```env
# User Customizable Settings
PREFIX=.
LOADING_EMOJI=⏳
LOADING_REACTIONS=true
AUTO_REACTIONS=false
AUTO_REACTION_DELAY=1000

# API Keys (User can add/remove)
GEMINI_API=
OPENAI_API=
WEATHER_API=
TRANSLATE_API=

# Plugin Settings
GAMES_ENABLED=true
ANTI_DELETE_ENABLED=false
MEDIA_TOOLS_ENABLED=true

# Performance Settings
RATE_LIMIT=10
RATE_WINDOW=60000
MAX_CONCURRENT_COMMANDS=5
COMMAND_TIMEOUT=30000

# Storage Preferences
BACKUP_ENABLED=true
BACKUP_INTERVAL=24h
MEDIA_AUTO_DOWNLOAD=true
MESSAGE_RETENTION_DAYS=0  # 0 = forever

# Reaction Settings
REACTION_SUCCESS=✅
REACTION_ERROR=❌
REACTION_WARNING=⚠️
```

#### `.env.system` - System Settings (Hidden from user)
```env
# Core System Settings (NEVER user-modifiable)
BOT_NAME=MatDev
BOT_VERSION=2.1.0
SYSTEM_ID=matdev-whatsapp-bot
ARCHITECTURE_VERSION=1.0

# Technology Stack
RUNTIME=Node.js
WHATSAPP_CLIENT=Baileys
DATABASE_TYPE=JSON

# Security Settings (Hardcoded)
OWNER_JID=your-number@s.whatsapp.net
STRICT_OWNER_MODE=true
ACCESS_CONTROL_ENABLED=true
ALLOW_COMMAND_SYSTEM=true

# Core Storage (Cannot be disabled)
ARCHIVE_ALL_MESSAGES=true
ARCHIVE_ALL_MEDIA=true
SESSION_PERSISTENCE=true

# System Limits (Security)
MAX_SESSIONS=10
MAX_PLUGIN_COUNT=50
MAX_FILE_SIZE=100MB
SYSTEM_MEMORY_LIMIT=2GB

# Internal Paths (Hidden)
DATA_PATH=./data
SESSIONS_PATH=./sessions
PLUGINS_PATH=./src/plugins
LOGS_PATH=./logs

# Core Features (Cannot be disabled)
HOT_RELOAD_ENABLED=true
MESSAGE_ARCHIVAL_ENABLED=true
GAME_STATE_SYSTEM=true
LOADING_REACTION_CORE=true
```

---

## 💡 Usage Examples

### Owner Commands
```bash
# Basic commands (only you can use)
.help                    # Show available commands
.info                    # Bot status and info
.reload plugins          # Hot-reload all plugins

# Environment Management
.env list                # Show all configurable settings  
.env add GEMINI_API=sk-123 # Add/update API key
.env remove WEATHER_API  # Remove API key
.env set PREFIX=/        # Change command prefix
.env toggle AUTO_REACTIONS # Toggle feature on/off

# User management
.allow ping              # Allow current chat user to use .ping
.disallow ping           # Remove permission
.status @user            # Check user permissions

# Games (you start, others can join)
.tictactoe               # Start game, opponent can play
.wordguess               # Start word game

# Admin tools
.stats                   # Usage statistics
.backup                  # Create manual backup
```

### Game Interaction Flow
```bash
# In group chat or with friend:
You: .tictactoe
Bot: "Game started! Send 1-9 to make moves"

# Now your opponent can send:
Friend: 5                # Valid - bot processes move
Friend: hello            # Invalid - bot ignores
Friend: 1                # Valid - bot processes move

You: 9                   # Your move
# Game continues until complete
```

### Allow Command System
```bash
# In someone's personal chat:
You: .allow ping
Bot: "✅ User can now use .ping in this chat"

# Now that user can:
Them: .ping
Bot: "Pong! 🏓"

# Remove permission:
You: .disallow ping  
Bot: "❌ User can no longer use .ping"
```

---

## 🔧 Development Guide

### Adding Owner-Only Plugin
```javascript
// plugins/my-plugin/index.js
module.exports = {
  name: 'my-plugin',
  ownerOnly: true,  // IMPORTANT: Only owner can use
  
  commands: {
    async mycommand(message, args, context) {
      // This only executes for owner
      return 'Owner-only response'
    }
  }
}
```

### Adding Game Plugin
```javascript
// plugins/my-game/index.js  
module.exports = {
  name: 'my-game',
  ownerOnly: false, // Can respond to others during game
  
  commands: {
    async startgame(message, args, context) {
      if (!context.isOwner) return null // Only owner starts
      
      // Set game state - now others can participate
      await context.setState('MY_GAME_ACTIVE', {
        players: [message.sender],
        currentTurn: message.sender
      })
      
      return 'Game started! Others can now participate.'
    }
  },
  
  gameStates: {
    async MY_GAME_ACTIVE(message, context) {
      // Handle game input from any player
      if (!this.isValidGameInput(message.text)) {
        return null // Ignore invalid input
      }
      
      return this.processGameInput(message, context)
    }
  }
}
```

### Loading Reaction Integration
```javascript
async myLongCommand(message, context) {
  // Loading emoji automatically shown by middleware
  
  // Simulate long processing
  await this.someLongOperation()
  
  // Loading emoji automatically removed when return
  return 'Operation complete!'
}
```

---

## 🔒 Security & Privacy

### Access Control
- **Owner JID Verification**: Only your WhatsApp can control bot
- **Game State Validation**: Users can only send valid game inputs
- **Command Allowlist**: Explicit permission required for others
- **Session Isolation**: Each session maintains separate permissions

### Message Privacy  
- **Complete Archive**: All messages stored for anti-delete/search
- **No External Sharing**: Data stays in your storage
- **Encrypted Sessions**: WhatsApp encryption preserved
- **Local Storage Only**: No cloud dependencies

### Permission Levels
1. **Owner** (You): Full access to all commands
2. **Game Participant**: Can send valid game moves only
3. **Allowed Command User**: Can use specific commands you permit
4. **Everyone Else**: Completely ignored

---

---

## 📋 Plugin Development Rules & Guidelines

### 🚨 **CRITICAL RULES - NEVER VIOLATE**

#### **1. Access Control Rules (MANDATORY)**
```javascript
// ✅ CORRECT - Always check access permissions
module.exports = {
  name: 'my-plugin',
  ownerOnly: true, // Set false only for games
  
  commands: {
    async myCommand(message, args, context) {
      // Owner-only commands automatically filtered by core
      // Games: set ownerOnly: false, then validate in gameStates
      return 'Response only to owner'
    }
  }
}

// ❌ WRONG - Never bypass access control
async myCommand(message, args, context) {
  // DON'T manually check isOwner - let core handle it
  if (context.isOwner) { /* ... */ }
}
```

#### **2. State Management Rules (MANDATORY)**
```javascript
// ✅ CORRECT - Always use provided state methods
async startGame(message, context) {
  await context.setState('GAME_ACTIVE', {
    players: [message.sender],
    board: Array(9).fill(null)
  })
}

// ❌ WRONG - Never store state in plugin variables
let gameState = {} // This will break with hot-reload!
```

#### **3. Environment Variable Rules (MANDATORY)**
```javascript
// ✅ CORRECT - Always use context.env
async myCommand(message, args, context) {
  const apiKey = context.env.get('MY_API_KEY')
  
  if (!apiKey) {
    return '❌ API key required. Use: .env add MY_API_KEY=your-key'
  }
}

// ❌ WRONG - Never use process.env directly
const apiKey = process.env.MY_API_KEY // This bypasses validation!
```

#### **4. Error Handling Rules (MANDATORY)**
```javascript
// ✅ CORRECT - Always wrap in try-catch
async myCommand(message, args, context) {
  try {
    const result = await this.someAsyncOperation()
    return `Success: ${result}`
  } catch (error) {
    context.logger.error('My Plugin Error:', error)
    return '❌ Operation failed. Please try again.'
  }
}

// ❌ WRONG - Never let errors bubble up uncaught
async myCommand(message, args, context) {
  const result = await this.someAsyncOperation() // Can crash bot!
  return result
}
```

---

### 📋 **PLUGIN STRUCTURE REQUIREMENTS**

#### **Required Files**
```
plugins/my-plugin/
├── plugin.json      # REQUIRED: Plugin manifest
├── index.js         # REQUIRED: Main entry point
├── commands.js      # OPTIONAL: Command handlers
├── states.js        # OPTIONAL: State handlers  
├── utils.js         # OPTIONAL: Plugin utilities
└── README.md        # RECOMMENDED: Plugin documentation
```

#### **plugin.json Schema (REQUIRED)**
```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Brief description of plugin functionality",
  "author": "Your Name",
  "matdevVersion": ">=2.1.0",
  
  "ownerOnly": true,
  "enabled": true,
  "autoLoad": true,
  
  "commands": {
    "triggers": ["command1", "cmd1"],
    "prefix": "auto", 
    "category": "general"
  },
  
  "states": [
    "MY_PLUGIN_STATE_1",
    "MY_PLUGIN_STATE_2"
  ],
  
  "requiredEnv": [
    {
      "key": "MY_API_KEY",
      "description": "API key for external service",
      "required": true,
      "validation": "string"
    }
  ],
  
  "permissions": [
    "message.send",
    "reaction.add", 
    "media.download"
  ],
  
  "dependencies": {
    "npm": ["axios", "cheerio"],
    "plugins": []
  }
}
```

#### **index.js Structure (REQUIRED)**
```javascript
module.exports = {
  // Plugin Identity (REQUIRED)
  name: 'my-plugin',
  version: '1.0.0',
  description: 'Plugin description',
  
  // Access Control (REQUIRED)
  ownerOnly: true, // false only for games
  
  // Command Handlers (REQUIRED if plugin has commands)
  commands: {
    async myCommand(message, args, context) {
      // Command implementation
    }
  },
  
  // State Handlers (OPTIONAL - only for complex workflows)
  states: {
    async MY_PLUGIN_STATE(message, context) {
      // State implementation
    }
  },
  
  // Lifecycle Hooks (OPTIONAL)
  async onLoad() {
    console.log('Plugin loaded')
  },
  
  async onUnload() {
    console.log('Plugin unloaded')
  },
  
  async onReload() {
    console.log('Plugin reloaded')
  }
}
```

---

### 🔧 **TECHNICAL REQUIREMENTS**

#### **Node.js & Baileys Compatibility**
```javascript
// ✅ CORRECT - Use async/await for Baileys operations
async sendMessage(context, jid, content) {
  try {
    const result = await context.client.sendMessage(jid, content)
    return result
  } catch (error) {
    throw new Error(`Failed to send message: ${error.message}`)
  }
}

// ✅ CORRECT - Handle Baileys message objects properly  
async processMessage(message, context) {
  const messageText = message.body || message.text || ''
  const messageType = message.type || 'text'
  const sender = message.key.remoteJid
  const isGroup = sender.endsWith('@g.us')
}

// ❌ WRONG - Don't assume message structure
const text = message.text // Might be undefined!
```

#### **Memory Management Rules**
```javascript
// ✅ CORRECT - Clean up resources  
async onUnload() {
  // Clear timers
  if (this.intervalId) {
    clearInterval(this.intervalId)
  }
  
  // Close connections
  if (this.apiConnection) {
    await this.apiConnection.close()
  }
  
  // Clear large data structures
  this.cache.clear()
}

// ❌ WRONG - Memory leaks
let interval = setInterval(() => {}, 1000) // Never cleared!
let bigCache = new Map() // Never cleared!
```

#### **Hot-Reload Compatibility**
```javascript
// ✅ CORRECT - No persistent module-level state
module.exports = {
  commands: {
    async myCommand(message, args, context) {
      // Use context for persistent data
      const data = await context.storage.get('my-plugin-data')
    }
  }
}

// ❌ WRONG - Module-level state breaks hot-reload  
let moduleState = {} // This will be lost on reload!

module.exports = {
  commands: {
    async myCommand() {
      moduleState.data = 'something' // Lost on hot-reload!
    }
  }
}
```

---

### 🎮 **GAME PLUGIN SPECIAL RULES**

#### **Multi-User Game Template**
```javascript
module.exports = {
  name: 'my-game',
  ownerOnly: false, // REQUIRED for games
  
  commands: {
    async startGame(message, args, context) {
      // Only owner can start games
      if (!context.isOwner) {
        return null // Don't respond to non-owners
      }
      
      // Set game state - now others can participate
      await context.setState('MY_GAME_ACTIVE', {
        players: [message.sender],
        gameData: this.initializeGame(),
        startedBy: message.sender,
        chatId: message.chat
      })
      
      return '🎮 Game started! Others can now participate.'
    }
  },
  
  states: {
    async MY_GAME_ACTIVE(message, context) {
      const gameState = context.getState()
      
      // Validate game input (ignore invalid messages)
      if (!this.isValidGameInput(message.text, gameState)) {
        return null // Ignore invalid input
      }
      
      // Process valid game move
      return this.processGameMove(message, gameState, context)
    }
  },
  
  // Game-specific methods
  isValidGameInput(text, gameState) {
    // Return true only for valid game inputs
    return /^[1-9]$/.test(text) // Example: numbers 1-9
  }
}
```

---

### 🌐 **API INTEGRATION GUIDELINES**

#### **Environment Variables for APIs**
```javascript
// plugin.json - Declare required API keys
{
  "requiredEnv": [
    {
      "key": "WEATHER_API_KEY",
      "description": "OpenWeatherMap API key",
      "required": true,
      "validation": "string",
      "setupInstructions": "Get API key from openweathermap.org"
    }
  ]
}

// index.js - Check API availability
commands: {
  async weather(message, args, context) {
    const apiKey = context.env.get('WEATHER_API_KEY')
    
    if (!apiKey) {
      return `❌ Weather API not configured.\n\n` +
             `Setup: .env add WEATHER_API_KEY=your-key\n` +
             `Get key: https://openweathermap.org/api`
    }
    
    // Use API...
  }
}
```

#### **HTTP Request Best Practices**
```javascript
// ✅ CORRECT - Proper error handling & timeouts
const axios = require('axios')

async makeApiRequest(url, apiKey) {
  try {
    const response = await axios.get(url, {
      timeout: 10000, // 10 second timeout
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'MatDev WhatsApp Bot'
      }
    })
    
    return response.data
  } catch (error) {
    if (error.response) {
      throw new Error(`API Error: ${error.response.status} - ${error.response.data.message}`)
    } else if (error.request) {
      throw new Error('Network error: No response from API')
    } else {
      throw new Error(`Request error: ${error.message}`)
    }
  }
}
```

---

### 💾 **DATA STORAGE GUIDELINES**

#### **Plugin Data Storage**
```javascript
// ✅ CORRECT - Use provided storage methods
async savePluginData(context, key, data) {
  await context.storage.set(`my-plugin:${key}`, data)
}

async loadPluginData(context, key) {
  return await context.storage.get(`my-plugin:${key}`)
}

// ✅ CORRECT - Namespace your data
const STORAGE_KEYS = {
  USER_PREFERENCES: 'my-plugin:user-prefs',
  GAME_SCORES: 'my-plugin:game-scores', 
  API_CACHE: 'my-plugin:api-cache'
}
```

#### **User Data Management**
```javascript
// ✅ CORRECT - Per-user data storage
async getUserData(context, userId) {
  return await context.storage.get(`my-plugin:users:${userId}`) || {
    preferences: {},
    stats: { commandsUsed: 0 },
    createdAt: Date.now()
  }
}

async updateUserStats(context, userId, action) {
  const userData = await this.getUserData(context, userId)
  userData.stats.commandsUsed++
  userData.stats.lastUsed = Date.now()
  
  await context.storage.set(`my-plugin:users:${userId}`, userData)
}
```

---

### 🔍 **TESTING & VALIDATION RULES**

#### **Command Testing Template**
```javascript
// Create test-plugin for validation
module.exports = {
  name: 'test-plugin',
  ownerOnly: true,
  
  commands: {
    async test(message, args, context) {
      const tests = [
        this.testEnvironmentAccess(context),
        this.testStorageOperations(context),
        this.testStateManagement(context),
        this.testErrorHandling(context)
      ]
      
      const results = await Promise.all(tests)
      return `Test Results:\n${results.join('\n')}`
    }
  },
  
  async testEnvironmentAccess(context) {
    try {
      const prefix = context.env.get('PREFIX')
      return `✅ Environment: PREFIX = ${prefix}`
    } catch (error) {
      return `❌ Environment: ${error.message}`
    }
  }
}
```

#### **Plugin Validation Checklist**
Before publishing a plugin, verify:

- [ ] **plugin.json** is valid JSON with required fields
- [ ] **ownerOnly** is set correctly (true for admin, false for games)
- [ ] **All async functions** use try-catch error handling
- [ ] **Environment variables** are accessed via context.env
- [ ] **Storage operations** use context.storage methods
- [ ] **State management** uses context.setState/getState
- [ ] **No module-level persistent state** (hot-reload compatible)
- [ ] **Memory cleanup** in onUnload hook if needed
- [ ] **API requests** have proper timeout and error handling
- [ ] **Game inputs** are validated before processing

---

### 🚀 **PERFORMANCE OPTIMIZATION RULES**

#### **Response Time Guidelines**
```javascript
// ✅ CORRECT - Fast responses with loading indication
async slowOperation(message, context) {
  // Loading emoji automatically shown by core
  
  // Keep user informed for long operations
  if (estimatedTime > 5000) {
    await context.sendMessage(message.chat, '⏳ Processing... this may take a moment')
  }
  
  const result = await this.performSlowOperation()
  return result
}
```

#### **Caching Best Practices**
```javascript
// ✅ CORRECT - Implement smart caching
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async getCachedApiData(context, key) {
  const cached = await context.storage.get(`cache:${key}`)
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data
  }
  
  // Fetch fresh data
  const freshData = await this.fetchFromAPI(key)
  
  // Cache it
  await context.storage.set(`cache:${key}`, {
    data: freshData,
    timestamp: Date.now()
  })
  
  return freshData
}
```

---

### 📚 **DOCUMENTATION REQUIREMENTS**

#### **Plugin README Template**
```markdown
# My Plugin

## Description
Brief description of what the plugin does.

## Commands
- `.mycommand` - Description of command

## Setup
If API keys required:
1. Get API key from [provider](https://example.com)
2. Add to MatDev: `.env add MY_API_KEY=your-key`

## Usage Examples
```bash
.mycommand arg1 arg2
```

## Environment Variables
- `MY_API_KEY` (required) - API key from provider
- `MY_SETTING` (optional) - Custom setting

## Permissions Required
- message.send
- reaction.add
```

#### **Code Documentation Standards**
```javascript
/**
 * Process weather command
 * @param {Object} message - WhatsApp message object
 * @param {Array} args - Command arguments
 * @param {Object} context - MatDev context object
 * @returns {Promise<string>} Weather information or error message
 */
async weather(message, args, context) {
  // Implementation...
}
```

---

### ⚠️ **COMMON MISTAKES TO AVOID**

#### **1. Access Control Violations**
```javascript
// ❌ WRONG - Bypassing access control
if (message.sender === 'someone@s.whatsapp.net') {
  // This bypasses the owner-only system!
}
```

#### **2. Blocking Operations**  
```javascript
// ❌ WRONG - Synchronous operations
const result = fs.readFileSync('large-file.txt') // Blocks bot!

// ✅ CORRECT - Async operations
const result = await fs.promises.readFile('large-file.txt')
```

#### **3. Memory Leaks**
```javascript
// ❌ WRONG - Uncleared intervals
setInterval(() => {}, 1000) // Never cleared!

// ✅ CORRECT - Cleanup in onUnload
async onLoad() {
  this.intervalId = setInterval(() => {}, 1000)
}

async onUnload() {
  if (this.intervalId) {
    clearInterval(this.intervalId)
  }
}
```

#### **4. State Corruption**
```javascript
// ❌ WRONG - Direct state modification
const state = context.getState()
state.data = 'modified' // This doesn't persist!

// ✅ CORRECT - Use setState
const state = context.getState()
await context.setState(state.name, {
  ...state.data,
  data: 'modified'
})
```

---

**Follow these rules religiously to ensure your plugins work seamlessly with MatDev's architecture and don't break the bot's core functionality.**