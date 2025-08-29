# MATDEV Bot Plugin Development Guide

## Overview

MATDEV Bot uses a **fully self-contained plugin architecture** where each plugin is completely standalone. This guide provides the exact rules and structure needed to create plugins that will work seamlessly with the bot system.

## Plugin Architecture

### Core Principles
- **Self-Contained**: Each plugin folder contains everything needed (code, config, documentation)
- **Hot-Reload**: Plugins automatically reload when files change
- **Isolated**: Plugins don't interfere with each other
- **Standardized**: All plugins follow the same interface and structure

### Required Files Structure

```
src/plugins/your-plugin-name/
├── index.js          # Main plugin class (REQUIRED)
├── plugin.json       # Plugin configuration (REQUIRED)
├── README.md         # Documentation (RECOMMENDED)
└── [additional-files] # Any other files your plugin needs
```

## REQUIRED: plugin.json Configuration

Every plugin **MUST** have a `plugin.json` file with this exact structure:

```json
{
  "name": "your-plugin-name",
  "displayName": "Your Plugin Display Name",
  "description": "Brief description of what your plugin does",
  "version": "1.0.0",
  "author": "Your Name",
  "enabled": true,
  "ownerOnly": false,
  "priority": 10,
  "category": "utility",
  "dependencies": [],
  "commands": [
    {
      "name": "commandname",
      "description": "What this command does",
      "usage": "commandname [args]",
      "ownerOnly": false,
      "examples": [
        ".commandname",
        ".commandname arg1 arg2"
      ]
    }
  ],
  "features": [
    "feature-1",
    "feature-2"
  ],
  "permissions": [
    "storage:read",
    "storage:write"
  ],
  "settings": {
    "customSetting": "value"
  },
  "metadata": {
    "created": "2025-08-18T10:15:00.000Z",
    "tags": ["tag1", "tag2"]
  }
}
```

### plugin.json Field Requirements

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ YES | Unique plugin identifier (lowercase, no spaces) |
| `displayName` | string | ✅ YES | Human-readable plugin name |
| `description` | string | ✅ YES | Brief description of plugin functionality |
| `version` | string | ✅ YES | Semantic version (e.g., "1.0.0") |
| `author` | string | ✅ YES | Plugin author name |
| `enabled` | boolean | ✅ YES | Whether plugin should load (true/false) |
| `ownerOnly` | boolean | ✅ YES | If true, only bot owner can use ALL commands |
| `priority` | number | ✅ YES | Loading priority (1-100, higher = loads first) |
| `category` | string | ✅ YES | Plugin category (utility, games, admin, etc.) |
| `commands` | array | ✅ YES | Array of command definitions (see below) |
| `dependencies` | array | 🔶 OPTIONAL | External dependencies needed |
| `features` | array | 🔶 OPTIONAL | List of features provided |
| `permissions` | array | 🔶 OPTIONAL | Required permissions |
| `settings` | object | 🔶 OPTIONAL | Default plugin settings |
| `metadata` | object | 🔶 OPTIONAL | Additional metadata |

### Command Definition Structure

Each command in the `commands` array must have:

```json
{
  "name": "commandname",
  "description": "What this command does",
  "usage": "commandname [optional-args]",
  "ownerOnly": false,
  "examples": [
    ".commandname",
    ".commandname with args"
  ]
}
```

## REQUIRED: index.js Plugin Class

Your `index.js` file **MUST** export a class that follows this exact interface:

```javascript
class YourPlugin {
    constructor(options = {}) {
        this.name = 'your-plugin-name'; // Must match plugin.json name
        this.botClient = options.botClient;
        this.eventBus = options.eventBus;
        this.config = options.config || {};
        this.pluginPath = options.pluginPath;
        
        this.isInitialized = false;
        // Your plugin state here
    }

    /**
     * REQUIRED: Initialize the plugin
     */
    async initialize() {
        try {
            console.log(`🔧 Initializing ${this.config.displayName} plugin...`);
            
            // Your initialization logic here
            
            this.isInitialized = true;
            console.log(`✅ ${this.config.displayName} plugin initialized`);
            
        } catch (error) {
            console.error(`❌ Failed to initialize ${this.config.displayName} plugin:`, error);
            throw error;
        }
    }

    /**
     * REQUIRED: Get plugin information
     */
    getInfo() {
        return {
            name: this.name,
            version: this.config.version,
            description: this.config.description,
            commands: this.getCommands(),
            isInitialized: this.isInitialized
        };
    }

    /**
     * REQUIRED: Get available commands
     */
    getCommands() {
        return this.config.commands || [];
    }

    /**
     * REQUIRED: Main command execution handler
     */
    async executeCommand(commandName, context) {
        if (!this.isInitialized) {
            throw new Error(`${this.config.displayName} plugin not initialized`);
        }

        const { message, args, reply } = context;

        switch (commandName.toLowerCase()) {
            case 'yourcommand':
                return await this.handleYourCommand(context);
            
            default:
                throw new Error(`Unknown command: ${commandName}`);
        }
    }

    /**
     * OPTIONAL: Cleanup when plugin is unloaded
     */
    async shutdown() {
        try {
            // Your cleanup logic here
            this.isInitialized = false;
            console.log(`✅ ${this.config.displayName} plugin shutdown complete`);
        } catch (error) {
            console.error(`❌ Error during ${this.config.displayName} plugin shutdown:`, error);
        }
    }

    // Your command handlers here
    async handleYourCommand(context) {
        const { message, args, reply } = context;
        // Command implementation
        await reply('Your response here');
    }
}

module.exports = YourPlugin;
```

## Required Methods

Your plugin class **MUST** implement these methods:

| Method | Required | Description |
|--------|----------|-------------|
| `constructor(options)` | ✅ YES | Plugin initialization |
| `async initialize()` | ✅ YES | Setup plugin when loaded |
| `getInfo()` | ✅ YES | Return plugin metadata |
| `getCommands()` | ✅ YES | Return available commands |
| `async executeCommand(name, context)` | ✅ YES | Handle command execution |
| `async shutdown()` | 🔶 OPTIONAL | Cleanup when unloaded |

## Context Object

The `context` object passed to `executeCommand` contains:

```javascript
{
    message: {}, // Original WhatsApp message object
    args: [],    // Command arguments as array
    reply: async (text, options) => {}, // Function to send reply
    botClient: {}, // Bot client instance (if needed)
    eventBus: {}   // Event bus for cross-plugin communication
}
```

## Plugin Categories

Choose appropriate category for your plugin:

- `utility` - General purpose tools
- `games` - Interactive games
- `admin` - Administrative functions
- `media` - Media processing
- `social` - Social features
- `automation` - Background tasks
- `security` - Security related
- `custom` - Specialized functionality

## Access Control Rules

### Owner-Only Plugins
Set `"ownerOnly": true` in plugin.json to restrict entire plugin to owner.

### Per-Command Access
Set `"ownerOnly": true` in individual command definitions for command-level restrictions.

### Allowed Commands System
Non-owner users can only use commands they've been explicitly allowed via `.allow <user> <command>`.

## File Storage

Plugins can store data in their folder:

```javascript
const fs = require('fs-extra');
const path = require('path');

// Save data to plugin folder
const dataPath = path.join(this.pluginPath, 'data.json');
await fs.writeJson(dataPath, yourData);

// Load data from plugin folder
const data = await fs.readJson(dataPath);
```

## Event System

Plugins can communicate via the event bus:

```javascript
// Listen for events
this.eventBus.on('some_event', (data) => {
    // Handle event
});

// Emit events
this.eventBus.emit('your_event', data);
```

## Error Handling

Always wrap command handlers in try-catch:

```javascript
async handleYourCommand(context) {
    try {
        const { reply } = context;
        // Your command logic
        await reply('Success!');
    } catch (error) {
        console.error('Command error:', error);
        await context.reply('❌ Command failed');
    }
}
```

## Hot Reload Support

The bot automatically detects changes and reloads plugins. Ensure your plugin:

1. Properly initializes on reload
2. Cleans up resources in `shutdown()`
3. Handles state gracefully

## Testing Your Plugin

1. Create your plugin folder in `src/plugins/`
2. Add required `index.js` and `plugin.json`
3. The bot will automatically detect and load it
4. Check console for loading messages
5. Test commands with bot owner account

## Plugin Examples

### Simple Utility Plugin

```javascript
class UtilityPlugin {
    constructor(options = {}) {
        this.name = 'utility';
        this.botClient = options.botClient;
        this.eventBus = options.eventBus;
        this.config = options.config;
        this.isInitialized = false;
    }

    async initialize() {
        console.log('🔧 Initializing Utility plugin...');
        this.isInitialized = true;
        console.log('✅ Utility plugin initialized');
    }

    getInfo() {
        return {
            name: this.name,
            version: this.config.version,
            commands: this.getCommands(),
            isInitialized: this.isInitialized
        };
    }

    getCommands() {
        return this.config.commands || [];
    }

    async executeCommand(commandName, context) {
        const { reply } = context;
        
        switch (commandName.toLowerCase()) {
            case 'time':
                await reply(`🕐 Current time: ${new Date().toLocaleString()}`);
                break;
            default:
                throw new Error(`Unknown command: ${commandName}`);
        }
    }
}

module.exports = UtilityPlugin;
```

### Corresponding plugin.json:

```json
{
  "name": "utility",
  "displayName": "Utility Plugin",
  "description": "Basic utility commands",
  "version": "1.0.0",
  "author": "Your Name",
  "enabled": true,
  "ownerOnly": false,
  "priority": 10,
  "category": "utility",
  "commands": [
    {
      "name": "time",
      "description": "Get current time",
      "usage": "time",
      "ownerOnly": false,
      "examples": [".time"]
    }
  ]
}
```

## Installation Instructions

1. **Create Plugin Folder**: `src/plugins/your-plugin-name/`
2. **Add Required Files**: `index.js` and `plugin.json`
3. **Follow Structure**: Use the exact format shown above
4. **Test Plugin**: Bot automatically loads and registers commands
5. **Check Logs**: Verify successful loading in console

## Common Mistakes to Avoid

❌ **Wrong class export**: `module.exports = YourPlugin;` (not an instance)
❌ **Missing required methods**: All required methods must be implemented
❌ **Name mismatch**: Plugin name in class must match plugin.json
❌ **Invalid JSON**: Ensure plugin.json is valid JSON
❌ **Case sensitivity**: Command names are case-insensitive in execution
❌ **Missing error handling**: Always handle errors in command methods

## Plugin Validation Checklist

Before submitting a plugin, ensure:

- [ ] `plugin.json` exists with all required fields
- [ ] `index.js` exports plugin class correctly
- [ ] All required methods are implemented
- [ ] Plugin name matches between files
- [ ] Commands are properly defined
- [ ] Error handling is implemented
- [ ] Plugin initializes without errors
- [ ] Commands work as expected

## Support

If your plugin follows these rules exactly, it will work seamlessly with the MATDEV Bot system. The hot-reload system will automatically detect, load, and register your plugin commands.

For advanced features like database access, media processing, or external API integration, examine existing plugins in the `src/plugins/` directory for reference implementations.