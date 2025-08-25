# Overview

MatDev is a professional WhatsApp bot built with Node.js that provides advanced messaging capabilities, plugin-based architecture, and multi-language support. The bot offers comprehensive features including games, media processing, group management, and administrative tools. It's designed for production deployment with support for multiple hosting platforms and robust error handling.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Core Architecture
The bot follows a modular class-based architecture with clear separation of concerns:

- **Bot Class**: Main orchestrator handling WhatsApp connections, session management, and component coordination
- **Message Class**: Processes incoming messages with reply capabilities and permission checking
- **Command Class**: Manages command registration, execution, and middleware pipeline
- **Plugin Class**: Dynamic plugin loading system with hot-reload support for development
- **Database Class**: Sequelize-based ORM handling data persistence with support for both SQLite and PostgreSQL

## Plugin System
Features a comprehensive plugin architecture where each plugin is a self-contained module with:
- Command registration and execution
- Category-based organization (admin, games, utilities, fun)
- Permission-based access control (sudo, admin, group-only)
- Built-in cooldown and rate limiting
- Multi-language support integration

## Database Design
Uses Sequelize ORM with models for:
- **Users**: WhatsApp user profiles, bans, VIP status, preferences
- **Groups**: WhatsApp group metadata, settings, participant tracking  
- **Sessions**: WhatsApp connection session management
- **GameSessions**: Multi-player game state management
- **PlayerStats**: User gaming statistics and achievements
- **Logs**: System activity and error logging
- **Settings**: Bot configuration storage

## Multi-Language Support
JSON-based localization system supporting multiple languages (English, Arabic, Spanish, French) with template-based message formatting and per-user language preferences.

## Security Framework
Implements comprehensive security measures:
- **Anti-Spam**: Message frequency monitoring with automatic blocking
- **Rate Limiting**: Per-user command throttling to prevent abuse  
- **Input Validation**: Sanitization of user inputs and media processing
- **Permission System**: Multi-tier access control (public, admin, sudo, owner)
- **Environment-based Configuration**: Secure handling of API keys and secrets

## Web Dashboard
Express.js-based web interface providing:
- Real-time bot status monitoring
- Plugin management capabilities
- System statistics and performance metrics
- Remote bot control (start/stop/restart)
- Log viewing and system health checks

# External Dependencies

## Core WhatsApp Integration
- **@whiskeysockets/baileys**: WhatsApp Web API implementation for message handling and connection management
- **qrcode-terminal**: QR code generation for WhatsApp Web authentication

## Database Layer
- **sequelize**: ORM for database abstraction and model management
- **pg**: PostgreSQL driver for production deployments
- **sqlite3**: SQLite driver for development and local testing

## Web Framework
- **express**: HTTP server for web dashboard and API endpoints

## Utilities and Processing
- **winston**: Advanced logging system with multiple transports
- **axios**: HTTP client for external API integrations
- **moment**: Date and time manipulation
- **fs-extra**: Enhanced filesystem operations
- **qrcode**: QR code generation utilities

## External APIs (Optional)
- **Weather API**: For weather information commands
- **Translation API**: For multilingual text translation features

## Development Tools
- **dotenv**: Environment variable management for configuration