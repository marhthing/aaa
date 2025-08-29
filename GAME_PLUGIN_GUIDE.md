# 🎮 Game Plugin Development Guide

## Quick Start - Adding a New Game

### 1. Create Plugin Directory
```bash
mkdir src/plugins/yourgame
```

### 2. Create Main Plugin File (`index.js`)
```javascript
class YourGamePlugin {
    constructor(options) {
        this.options = options;
        this.botClient = options.botClient;
        this.eventBus = options.eventBus;
        this.metadata = options.metadata;
        this.config = options.config;
        
        this.games = new Map(); // chatId -> game data
        this.isInitialized = false;
    }

    async initialize() {
        console.log('🎮 Initializing YourGame plugin...');
        this.isInitialized = true;
        console.log('✅ YourGame plugin initialized');
    }

    async executeCommand(commandName, context) {
        if (!this.isInitialized) {
            throw new Error('YourGame plugin not initialized');
        }

        switch (commandName) {
            case 'yourgame':
                return await this.startGame(context);
            default:
                throw new Error(`Unknown command: ${commandName}`);
        }
    }

    async startGame(context) {
        const { reply, message } = context;
        const chatId = message.key.remoteJid;
        const player = message.key.participant || message.key.remoteJid;
        
        // Check if game already active
        const accessController = this.botClient.getAccessController();
        const activeGame = accessController.getActiveGame(chatId);
        
        if (activeGame) {
            await reply(`🎮 A ${activeGame.type} game is already active. Use .endgame to stop it first.`);
            return { success: false };
        }
        
        // Your game logic here
        await reply('🎮 Your game started!');
        
        // Register game with access controller
        accessController.startGame(chatId, 'yourgame', {
            startedBy: player,
            players: [player],
            state: 'active'
        });
        
        return { success: true };
    }

    async handleInput(chatId, input, player) {
        // Handle player input during active game
        // Return { message: "response", gameEnded: boolean }
    }

    async endGame(chatId, reason = 'ended') {
        this.games.delete(chatId);
        return {
            success: true,
            message: `🎮 Your game ${reason}!`
        };
    }

    async shutdown() {
        console.log('🛑 Shutting down YourGame plugin...');
        this.isInitialized = false;
        console.log('✅ YourGame plugin shutdown complete');
    }
}

module.exports = YourGamePlugin;
```

### 3. Create Plugin Configuration (`plugin.json`)
```json
{
  "name": "yourgame",
  "displayName": "Your Game Name",
  "description": "Description of your game",
  "version": "1.0.0",
  "author": "Your Name",
  "enabled": true,
  "ownerOnly": false,
  "priority": 65,
  "commands": [
    {
      "name": "yourgame",
      "description": "Start your game",
      "usage": "yourgame [options]",
      "ownerOnly": false,
      "allowInGames": false
    }
  ],
  "features": ["games", "interactive"],
  "permissions": ["games:start", "games:manage"],
  "multiUserSupport": true
}
```

### 4. Test Your Game
- Save the files
- The hot-reload system will automatically load your plugin
- Test with `.yourgame` command

## Key Features Available

### Access Control System
```javascript
const accessController = this.botClient.getAccessController();

// Check for active games
const activeGame = accessController.getActiveGame(chatId);

// Start a game (allows non-owners to interact)
accessController.startGame(chatId, 'gametype', gameInfo);

// End a game
accessController.endGame(chatId);
```

### Event System
```javascript
// Emit events
this.eventBus.emit('game_started', { chatId, gameType, players });
this.eventBus.emit('game_ended', { chatId, gameType, reason });

// Listen to events
this.eventBus.on('game_input_received', async (data) => {
    await this.handleInput(data);
});
```

### Message Context
```javascript
async executeCommand(commandName, context) {
    const { args, reply, message } = context;
    
    // Get chat and player info
    const chatId = message.key.remoteJid;
    const player = message.key.participant || message.key.remoteJid;
    
    // Send response
    await reply('Your message here');
}
```

## Examples

### Current Working Games:
- **TicTacToe** (`src/plugins/tictactoe/`) - Multiplayer with AI opponent
- **WordGuess** (`src/plugins/wordguess/`) - Single player with difficulty levels
- **EndGame** (`src/plugins/endgame/`) - Universal game ending

### Game Input Handling
Non-owner users can send input during active games. The system automatically routes their messages to your `handleInput` method.

## Hot Reload
The system automatically detects file changes and reloads your plugin without restarting the bot. Just save your files and test!

## Tips
1. **Always check for active games** before starting a new one
2. **Use the access controller** to manage game permissions
3. **Handle the quit command** in your input handler
4. **Save game state** if you want persistence across restarts
5. **Emit events** to integrate with the broader system

Your game will be automatically available in the `.menu` command once loaded!