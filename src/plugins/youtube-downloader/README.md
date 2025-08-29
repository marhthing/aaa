# YouTube Video Downloader Plugin

A MATDEV Bot plugin that downloads YouTube videos and sends them directly to WhatsApp chats.

## Features

- 🎥 Download YouTube videos in highest available quality
- 📱 Support for YouTube Shorts
- 📁 Automatically saves to `data/downloads/video/` directory
- 📱 Sends video directly to WhatsApp chat
- ⏱️ Shows video duration and file size
- 🛡️ Built-in safeguards (file size limits, duration limits)
- 🧹 File naming with sanitization and conflict prevention
- 🗑️ Automatic file cleanup after 5 minutes

## Installation

1. Create plugin directory:
   ```bash
   mkdir -p src/plugins/youtube-downloader
   ```

2. Copy the plugin files:
   - `index.js` - Main plugin code
   - `plugin.json` - Plugin configuration
   - `README.md` - This documentation

3. Install required dependencies:
   ```bash
   npm uninstall ytdl-core
   npm install @distube/ytdl-core fs-extra
   ```

   **Note**: If you already have `ytdl-core` installed, uninstall it first as `@distube/ytdl-core` is a better maintained fork.

4. The bot will automatically detect and load the plugin.

## Usage

### Download Video Command

```
.ytv <youtube-url>
```

**Examples:**
- `.ytv https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- `.ytv https://youtu.be/dQw4w9WgXcQ`
- `.ytv https://youtube.com/shorts/ZIRMxSQh764`

### How it works:

1. **Validation**: Checks if the provided URL is a valid YouTube link
2. **Info Retrieval**: Gets video metadata (title, duration, etc.)
3. **Safety Checks**: Ensures video isn't too long (1 hour limit) or too large
4. **Download**: Downloads video in highest quality to `data/downloads/video/`
5. **Send**: Sends the video file to the WhatsApp chat with details
6. **Auto-Cleanup**: Automatically deletes the file after 5 minutes to save space

## File Structure

```
src/plugins/youtube-downloader/
├── index.js          # Main plugin class
├── plugin.json       # Plugin configuration
└── README.md         # This documentation
```

## Download Location

Videos are saved to: `{project-root}/data/downloads/video/`

Filename format: `{sanitized-title}_{video-id}_{timestamp}.mp4`

Example: `Never_Gonna_Give_You_Up_dQw4w9WgXcQ_2025-08-18T10-15-30-123Z.mp4`

## Configuration

### Settings in plugin.json:

- `maxFileSize`: Maximum file size limit (default: 50MB)
- `videoQuality`: Video quality preference (default: highest)
- `audioQuality`: Audio quality preference (default: highestaudio)
- `autoDeleteAfter`: Time before auto-deletion (default: 5 minutes)

### Limitations:

- **Video Duration**: 1 hour maximum (prevents very large downloads)
- **File Size**: 16MB WhatsApp limit for sending (larger files saved but not sent)
- **Format**: Downloads as MP4 with audio and video

## Error Handling

The plugin handles various error scenarios:

- ❌ Invalid YouTube URLs
- ❌ Private or unavailable videos
- ❌ Videos too long (>1 hour)
- ❌ Network errors during download
- ❌ File system errors
- ⚠️ Files too large for WhatsApp (saved but not sent)

## Dependencies

- `@distube/ytdl-core`: Enhanced YouTube video downloading (more reliable than ytdl-core)
- `fs-extra`: Enhanced file system operations
- `path`: File path utilities

## Permissions Required

- `storage:read` - Read from file system
- `storage:write` - Write downloaded files
- `network:external` - Access YouTube APIs

## Troubleshooting

### Common Issues:

1. **"Video unavailable"**: Video might be private, deleted, or region-restricted
2. **"Could not extract functions"**: YouTube extraction error - usually temporary, try again in a few minutes
3. **"Download failed"**: Check internet connection and YouTube URL validity
4. **"Too large for WhatsApp"**: File downloaded but exceeds 16MB WhatsApp limit
5. **Slow downloads**: Depends on video size and internet speed

### Debug Information:

The plugin logs detailed information to console:
- Download progress (every 25%)
- File sizes and locations
- Error details

## Advanced Configuration

To modify the plugin behavior:

1. **Change download quality**: Edit `videoQuality` in plugin.json
2. **Adjust file size limits**: Modify size checks in the code
3. **Enable file cleanup**: Uncomment the cleanup line in `sendVideoToChat()`
4. **Change download location**: Modify `this.downloadPath` in constructor

## Security Notes

- Only downloads from YouTube domains
- Sanitizes filenames to prevent directory traversal
- Validates URLs before processing
- Limits video duration to prevent abuse

## Version History

- **v1.0.0** - Initial release with basic YouTube download functionality