# Anti-View-Once Plugin

Automatically captures and stores view-once messages for recovery, allowing you to retrieve them later even after they've been viewed.

## Features

- **Automatic Capture**: Detects and downloads view-once images and videos
- **Media Storage**: Saves view-once media to the MediaVault system
- **Command Recovery**: Use `.vv` to retrieve the latest captured view-once message
- **Auto-Forward**: Optionally set a default JID to automatically forward all captured view-once messages
- **Smart Storage**: Keeps the last 10 view-once messages in memory for quick access

## Commands

### `.vv`
Sends the most recent captured view-once message to your chat.

**Usage**: `.vv`

### `.vv <jid>`
Sets the default forward destination for all captured view-once messages.

**Usage**: `.vv 1234567890@s.whatsapp.net`

**Examples**:
- `.vv` - Get the latest view-once message
- `.vv 2347046040727@s.whatsapp.net` - Set auto-forward to your personal number

## How It Works

1. **Detection**: The plugin monitors all incoming messages for view-once content
2. **Capture**: When a view-once message is detected, it downloads and stores the media
3. **Storage**: Media is saved using the bot's MediaVault system with proper organization
4. **Recovery**: Use commands to retrieve captured content even after the original view-once expires
5. **Auto-Forward**: Optionally forward all captured view-once messages to a specified chat

## Privacy & Security

- Only the bot owner can use view-once recovery commands
- Captured content is stored locally on your server
- Settings are saved persistently across bot restarts
- Automatic cleanup keeps only the most recent 10 captures in memory

## Configuration

The plugin stores settings in `data/plugins/anti-view-once/settings.json`:

```json
{
    "defaultForwardJid": "1234567890@s.whatsapp.net",
    "lastUpdated": "2025-08-18T12:00:00.000Z"
}
```

## File Structure

```
data/
├── plugins/
│   └── anti-view-once/
│       └── settings.json          # Plugin settings
└── media/
    ├── images/
    │   └── viewonce_*.jpg          # Captured view-once images
    └── videos/
        └── viewonce_*.mp4          # Captured view-once videos
```

## Notes

- View-once messages are captured automatically when received
- The plugin respects WhatsApp's media download limitations
- Captured media maintains original quality and metadata
- Integration with the bot's existing media storage system ensures consistency