# Core Commands Plugin

The essential system management plugin for MATDEV bot. This plugin provides core functionality that every bot instance needs.

## Features

- **Help System**: Comprehensive help and documentation for all commands
- **Bot Information**: Display detailed bot stats and system information  
- **Status Monitoring**: Real-time bot health and performance metrics
- **Settings Management**: View and configure bot settings
- **Permission Control**: Grant/revoke command permissions for users
- **Plugin Management**: Reload plugins and manage system components
- **Environment Variables**: Secure management of configuration variables

## Commands

### `.help [command]`
- **Description**: Show available commands or detailed help for a specific command
- **Access**: Available to all users
- **Examples**:
  - `.help` - Show all available commands
  - `.help ping` - Show help for ping command

### `.info`
- **Description**: Display comprehensive bot information including connection status, features, and settings
- **Access**: Owner only
- **Shows**: Connected account, platform, battery, enabled features

### `.status`
- **Description**: Real-time bot system status and health check
- **Access**: Owner only  
- **Shows**: Core systems status, plugin status, connection health

### `.settings`
- **Description**: Display current bot configuration and settings
- **Access**: Owner only
- **Shows**: Bot name, prefix, enabled features, permissions

### `.allow <command>`
- **Description**: Grant permission for a user to use a specific command
- **Access**: Owner only
- **Usage**: Use this command in the target user's chat
- **Example**: `.allow ping` - Allows that user to use .ping command

### `.disallow <command>`
- **Description**: Remove command permission from a user
- **Access**: Owner only
- **Usage**: Use this command in the target user's chat
- **Example**: `.disallow ping` - Removes ping permission from user

### `.reload [plugin]`
- **Description**: Reload all plugins or a specific plugin
- **Access**: Owner only
- **Examples**:
  - `.reload` - Reload all plugins
  - `.reload ping` - Reload only the ping plugin

### `.env <subcommand> [args]`
- **Description**: Manage environment variables securely
- **Access**: Owner only
- **Subcommands**:
  - `list` - List available environment variables
  - `get <key>` - Get value of specific variable
  - `set <key> <value>` - Set environment variable
  - `remove <key>` - Remove environment variable

## File Structure

```
core-commands-new/
├── index.js          # Main plugin class with all functionality
├── plugin.json       # Plugin configuration and metadata
└── README.md         # This documentation
```

## Architecture

This plugin demonstrates the new standalone architecture:

1. **Self-Contained**: All functionality is within this single plugin folder
2. **No External Dependencies**: Uses only core bot dependencies
3. **Integrated Environment**: Built-in environment management
4. **Standard Interface**: Implements the unified plugin interface
5. **Hot Reload Ready**: Supports live reloading without restart

## Integration

The plugin integrates with:
- **Access Control System**: For permission management
- **Environment Manager**: For configuration access
- **Plugin Discovery**: For plugin reload functionality
- **Bot Client**: For connection and system information

## Configuration

Configure through `plugin.json`:
- `enabled`: Enable/disable the plugin
- `settings.enableAdvancedHelp`: Show detailed command help
- `settings.showSystemStats`: Include system metrics in status
- `settings.allowEnvironmentAccess`: Enable environment variable management

## Security

- All environment commands are owner-only
- Sensitive information is filtered from responses
- Permission changes require owner authentication
- Environment variables are handled securely

This plugin is essential for bot operation and provides the foundation for all system management tasks.