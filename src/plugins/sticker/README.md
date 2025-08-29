# Sticker Converter Plugin

Convert images, videos, and GIFs to WhatsApp stickers with a simple reply command.

## Features

- 📷 **Image to Sticker**: Convert any image to a sticker
- 🎥 **Video to Animated Sticker**: Convert videos to animated stickers (max 10 seconds)
- 🎭 **GIF to Animated Sticker**: Convert GIFs to animated stickers
- 🔧 **Auto Resize**: Automatically resizes media to 512x512 pixels
- 📦 **Custom Pack Name**: Uses configurable sticker pack name from environment

## Usage

1. **Reply to any image, video, or GIF**
2. **Type `.sticker`**
3. **Wait for processing**
4. **Receive your sticker!**

### Examples

```
[Someone sends an image]
You: .sticker (reply to the image)
Bot: 🔄 Processing... Converting to sticker... 
Bot: [Sends sticker version]
```

```
[Someone sends a GIF]
You: .sticker (reply to the GIF)
Bot: 🔄 Processing... Converting to sticker...
Bot: [Sends animated sticker]
```

## Configuration

### Environment Variable

Add this to your `.env` file to customize the sticker pack name:

```env
STICKER_NAME=MatDev
```

**Default**: `MatDev`

### Supported Media Types

- **Images**: JPEG, PNG, WebP, BMP, TIFF
- **Videos**: MP4, WebM, MOV, AVI (converted to animated WebP)
- **GIFs**: Animated GIFs (converted to animated WebP)

## Technical Details

### Image Processing
- Resizes to 512x512 pixels
- Maintains aspect ratio with transparent padding
- Converts to WebP format
- Optimized for WhatsApp sticker requirements

### Video/GIF Processing
- Limits duration to 10 seconds (WhatsApp requirement)
- Resizes to 512x512 pixels
- Converts to animated WebP format
- Removes audio (stickers don't support audio)

### File Management
- Uses temporary directory for processing
- Automatically cleans up temp files
- Error handling for failed conversions

## Dependencies

The plugin requires these npm packages:

```json
{
  "sharp": "^0.32.0",
  "fluent-ffmpeg": "^2.1.2",
  "fs-extra": "^11.0.0"
}
```

### System Requirements

**For video/GIF processing, you need FFmpeg installed:**

#### Windows
```bash
# Download from https://ffmpeg.org/download.html
# Or use chocolatey
choco install ffmpeg
```

#### macOS
```bash
brew install ffmpeg
```

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install ffmpeg
```

#### CentOS/RHEL
```bash
sudo yum install ffmpeg
```

## Error Handling

The plugin handles various error scenarios:

- ❌ No replied message
- ❌ Replied message has no media
- ❌ Unsupported media type
- ❌ Download failure
- ❌ Processing errors
- ❌ Conversion failures

## File Structure

```
src/plugins/sticker/
├── index.js          # Main plugin class
├── plugin.json       # Plugin configuration
├── README.md         # This documentation
└── temp/            # Temporary processing directory
```

## Performance Notes

- **Images**: Process quickly (< 2 seconds)
- **Videos/GIFs**: May take longer depending on file size and duration
- **Large Files**: Automatically optimized for WhatsApp limits
- **Memory**: Temporary files cleaned up after processing

## Troubleshooting

### FFmpeg Not Found
```
Error: FFmpeg not found
```
**Solution**: Install FFmpeg on your system (see System Requirements)

### Processing Failed
```
❌ Failed to create sticker
```
**Possible causes**:
- Corrupted media file
- Unsupported format
- Insufficient disk space
- FFmpeg error

### Media Too Large
Large files may timeout. The plugin automatically:
- Resizes media to appropriate dimensions
- Limits video duration to 10 seconds
- Compresses output for optimal size

## Advanced Usage

### Custom Quality Settings

You can modify quality settings in `plugin.json`:

```json
{
  "settings": {
    "maxDuration": 10,     // Max video duration (seconds)
    "outputSize": 512,     // Output dimensions (pixels)
    "quality": 90          // WebP quality (1-100)
  }
}
```

### Batch Processing

Currently supports one sticker at a time. For multiple stickers, use the command multiple times on different messages.

## Updates

- **v1.0.0**: Initial release with image, video, and GIF support