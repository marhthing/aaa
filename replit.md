# MATDEV Bot - WhatsApp Personal Assistant

## Overview

MATDEV Bot is a comprehensive WhatsApp bot built as a personal assistant with strict access control. The bot operates through the owner's WhatsApp number and is designed with a plugin-based architecture for modular functionality. It features automatic message archival, media storage, hot-reload capabilities, and game integration while maintaining security through owner-only access by default.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture
The bot follows a **self-contained plugin architecture** with centralized core services:

- **BotClient**: Main orchestrator managing WhatsApp client connection and component coordination
- **Plugin System**: Hot-reloadable, isolated plugins with standardized interfaces
- **Middleware Stack**: Layered processing pipeline for message handling, access control, and feature enhancement
- **Event-Driven Design**: EventBus enables loose coupling between components

### Access Control Model
**Owner-Centric Security**:
- Default behavior: Only bot owner can execute commands
- Selective permissions: Owner can grant specific command access to other users via `.allow <command>`
- Game exceptions: During active games, participants can send valid game inputs
- JID-based identification using WhatsApp's Jabber ID system

### Data Storage Strategy
**Hierarchical File-Based Storage**:
- **Message Archival**: Organized by year/month/chat-type structure in `data/messages/`
- **Media Vault**: Categorized storage in `data/media/` with automatic cleanup
- **Plugin Data**: Isolated storage per plugin in `data/plugins/`
- **State Management**: JSON-based persistence with in-memory caching

### Plugin Architecture
**Self-Contained Plugin Design**:
- Each plugin directory contains: `index.js` (main class), `plugin.json` (config), `README.md`
- **Hot-Reload**: File watcher automatically reloads plugins on changes
- **Isolation**: Plugins cannot interfere with each other
- **Standardized Interface**: All plugins implement `initialize()`, `executeCommand()`, `getCommands()` methods

### Message Processing Pipeline
**Middleware-Based Processing**:
1. **Message Capture**: Archive all messages immediately
2. **Access Filter**: Enforce owner-only or permission-based access
3. **Game State Manager**: Handle active game sessions
4. **Loading Reactions**: Provide visual feedback for command execution
5. **Media Downloader**: Process and store media attachments

### Environment and Configuration
**Multi-Layer Configuration**:
- **System Environment** (`.env.system`): Core bot settings
- **User Environment** (`.env`): User-customizable settings  
- **Plugin Configs** (`plugin.json`): Individual plugin settings
- **Runtime State**: Dynamic configuration changes via commands

## External Dependencies

### Core WhatsApp Integration
- **@whiskeysockets/baileys**: WhatsApp Web API for message handling and connection management
- **qrcode-terminal**: QR code generation for initial authentication

### Media Processing
- **fluent-ffmpeg**: Video/audio processing and format conversion
- **sharp**: High-performance image processing and optimization
- **jimp**: Cross-platform image manipulation
- **node-webpmux**: WebP format handling for stickers

### File System and Storage
- **fs-extra**: Enhanced file system operations with promise support
- **chokidar**: File system watching for hot-reload functionality

### Network and APIs
- **axios**: HTTP client for external API integrations
- **node-fetch**: Alternative fetch implementation for web requests
- **@distube/ytdl-core**: YouTube video downloading capabilities
- **@tobyg74/tiktok-api-dl**: TikTok content downloading

### Development and Monitoring
- **pino**: High-performance JSON logging
- **express**: Web server framework for optional web interface
- **socket.io**: Real-time communication for web interface
- **readline**: Interactive command-line interface