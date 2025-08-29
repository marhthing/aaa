# MATDEV Bot

## Overview
MATDEV is a WhatsApp bot designed to operate through the owner's WhatsApp number with strict access control. It features a modular architecture with a hot-reload plugin system, comprehensive message archival, and intelligent command processing. Built as a personal assistant, MATDEV primarily responds only to the bot owner while maintaining selective interaction capabilities for specific scenarios like games or explicitly allowed commands. The project's ambition is to provide a secure, efficient, and highly customizable personal bot experience. Key capabilities include anti-delete functionality for messages and media, automatic capture and forwarding of view-once content, and robust access control.

## Recent Changes (August 2025)
- **Migration Complete**: Successfully migrated from Replit Agent to standard Replit environment
- **Enhanced Image Enhancement Plugin**: Updated enhance command to use stored media system instead of re-downloading, saves enhanced images to `data/media/enhance`, and auto-deletes after 5 minutes for privacy
- **Enhanced Game Input Processing**: Updated message processor to handle number-only inputs during active games without requiring command prefix
- **Improved TicTacToe Plugin**: Redesigned for more natural chat-like gameplay with cleaner messaging
- **Fixed JID Extraction**: Corrected sender JID detection in TicTacToe plugin following AccessController patterns
- **Resolved Owner JID Access**: Fixed AccessController.ownerJid property access (was incorrectly calling as method)
- **Enhanced Player Detection**: Proper distinction between bot owner and chat partner in private conversations
- **Hot-Reload System**: Confirmed working perfectly for real-time plugin development

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture Pattern
The system follows a personal assistant architecture with multi-session support and hot-reload capabilities:
- **Single Owner Model**: Bot responds primarily to the owner's commands, with selective exceptions.
- **Session-Based Design**: Multiple WhatsApp sessions can be managed through a unified starter interface.
- **Plugin Architecture**: Modular plugin system with hot-reload functionality for adding features without restart.
- **Event-Driven Processing**: Message processing flows through ownership validation, game state checks, and command authorization.

### Access Control System
- **Owner-First Design**: All commands processed for bot owner by default.
- **Selective Interaction**: Non-owners can interact only during active games or with explicitly allowed commands.
- **Command Authorization**: `.allow` system enables temporary command access for specific users.
- **Game State Management**: Active games allow valid inputs from all participants.

### Message Processing Flow
1. **Ownership Validation**: Check if sender is bot owner.
2. **Game State Check**: Verify if active game allows user interaction.
3. **Command Authorization**: Validate allowed commands for non-owners.
4. **Loading Feedback**: Visual reaction system with emoji indicators.

### Plugin System Design
- **Fully Self-Contained**: Each plugin folder contains `index.js` (main class), `plugin.json` (config), and optional documentation.
- **Hot-Reload Capability**: Automatic detection and reloading of plugin changes.
- **Unified Interface**: All plugins implement `executeCommand` method with a standard context.
- **Standalone Games Architecture**: Games are individual plugins rather than grouped together, making it extremely easy to add new games.
- **Game Development Guide**: Complete guide available in `GAME_PLUGIN_GUIDE.md` for creating new games.

### Data Storage Architecture
- **Message Archival**: Complete conversation and media storage.
- **Session Management**: Isolated session data in dedicated directories.
- **Configuration System**: Centralized configuration management for bot behavior.
- **Media Storage Optimization**: Media is stored and linked directly during message archiving for efficiency.

### User Interface Design
- **CLI Startup Interface**: Interactive session selection with colored console output.
- **Visual Feedback System**: Loading reactions and status indicators in WhatsApp.
- **Multi-Session Support**: Choose from available sessions at startup.

### Implemented Layers
- **Utility Layer (`src/utils/`)**: Includes modules for constants, JID management, message processing, access utilities, and game utilities.
- **Services Layer (`src/services/`)**: Provides services for storage, access control, game session management, environment variables, allowed commands, reaction management, media management, and message querying.
- **Configuration System (`config/`)**: Contains `default.json` for general bot configuration and `plugins.json` for plugin-specific settings.

### Key Features
- **Anti-Delete**: Automatically captures all messages and media, detects deletions in real-time, and forwards deleted content to the bot owner. Includes recovery commands.
- **Anti-View-Once**: Automatically captures view-once messages (images and videos). Provides commands to retrieve the latest capture and auto-forward them.
- **Core Commands**: help, menu, info, status, settings, allow, disallow, reload, env, shutdown, restart.
- **Standalone Game Plugins**: Each game is now a separate plugin for easy expansion:
  - **TicTacToe Plugin**: `tictactoe`, `ttt` - Interactive tic-tac-toe with AI opponent
  - **WordGuess Plugin**: `wordguess`, `wg` - Word guessing with difficulty levels
  - **EndGame Plugin**: `endgame`, `quit` - Universal game ending command
- **Admin Tools**: systeminfo, plugins, users, permissions, logs, cleanup, backup.
- **Media Tools**: convert, upscale, analyze, mediainfo, compress, extract.
- **Access Control**: Proper owner detection, command permissions, game participation.
- **Hot Reload**: Automatic plugin reloading on file changes.
- **Message Archival**: Complete conversation and media storage system.

## External Dependencies
- **@whiskeysockets/baileys**: For WhatsApp Web client integration.
- **fs-extra**: For enhanced file system operations.
- **qrcode-terminal**: For displaying QR codes during authentication.
- **express & socket.io**: For optional web interface support.
- **readline**: For interactive CLI session management.
- **pino**: For structured logging.
- **chokidar**: For file watching in hot-reload system.