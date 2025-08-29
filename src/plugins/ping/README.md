# Ping Plugin

A simple and self-contained plugin that demonstrates the standalone plugin architecture for MATDEV bot.

## Features

- **Response Time Testing**: Measure bot response times with the `.ping` command
- **Statistics Tracking**: Keep track of ping counts and uptime
- **Plugin Information**: View detailed plugin stats with `.pinginfo`
- **Persistent Storage**: Plugin state is saved and restored across restarts

## Commands

### `.ping`
- **Description**: Test bot response time and connectivity
- **Usage**: `.ping`
- **Access**: Available to all users
- **Response**: Shows response time, total pings, and uptime

### `.pinginfo`
- **Description**: Show detailed plugin information and statistics
- **Usage**: `.pinginfo`  
- **Access**: Owner only
- **Response**: Displays plugin version, stats, uptime, and status

## File Structure

```
ping/
├── index.js          # Main plugin class with all functionality
├── plugin.json       # Plugin configuration and metadata
├── README.md         # This documentation
└── stats.json        # Runtime statistics (created automatically)
```

## How It Works

This plugin demonstrates the standalone architecture where:

1. **Everything is self-contained** - All code, configuration, and data files are within the plugin folder
2. **No external dependencies** - The plugin doesn't rely on shared utilities or services
3. **Automatic discovery** - The plugin is automatically detected and loaded by the plugin system
4. **Persistent state** - Plugin maintains its own statistics file
5. **Standard interface** - Implements the required plugin interface for seamless integration

## Installation

Simply place this folder in `src/plugins/` and restart the bot. The plugin will be automatically discovered and loaded.

## Configuration

The plugin can be configured through `plugin.json`:

- `enabled`: Set to `false` to disable the plugin
- `settings.maxPingHistory`: Maximum number of ping records to keep
- `settings.enableStatistics`: Whether to track statistics

## Example Usage

```
You: .ping
Bot: 🏓 Pong!
     ⚡ Response Time: 15ms
     📊 Total Pings: 42
     ⏰ Uptime: 2h 15m 30s

You: .pinginfo
Bot: 🏓 Ping Plugin Info
     📋 Name: Ping Plugin
     📝 Description: Simple ping/pong plugin...
     🔢 Version: 1.0.0
     📊 Total Pings: 42
     🚀 Started: 8/18/2025, 10:15:00 AM
     ⏰ Uptime: 2h 15m 30s
     ✅ Status: Active
```

This plugin serves as a template for creating new standalone plugins for the MATDEV bot system.