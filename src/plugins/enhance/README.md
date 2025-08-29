# Image Enhancement Plugin

## Overview

The Image Enhancement Plugin automatically downloads images from WhatsApp messages, enhances them using AI-powered free enhancement services, and sends back the improved version. It supports multiple enhancement methods and provides automatic cleanup of temporary files.

## Features

- 🎨 **AI-Powered Enhancement**: Uses multiple free enhancement services
- 📈 **Image Upscaling**: Improves resolution while maintaining quality
- 🔧 **Automatic Processing**: Simply tag or reply to images
- 🧹 **Smart Cleanup**: Automatically removes files after 5 minutes
- 📱 **Multiple Formats**: Supports JPEG, PNG, WebP, GIF, BMP
- ⚡ **Fast Processing**: Optimized for quick results
- 🛡️ **Error Handling**: Robust error handling and fallback methods

## Installation

### Step 1: Create Plugin Directory
```bash
mkdir -p src/plugins/enhance
```

### Step 2: Add Plugin Files
Place the following files in `src/plugins/enhance/`:
- `index.js` (main plugin code)
- `plugin.json` (configuration)
- `README.md` (this file)

### Step 3: Install Dependencies
The plugin requires these npm packages:
```bash
npm install axios fs-extra form-data
```

### Optional Enhancement (Recommended)
For better image processing, install Sharp:
```bash
npm install sharp
```

### Step 4: Restart Bot
The plugin will automatically load when you restart the MATDEV Bot.

## Commands

### `.enhance`
Enhance an image by tagging it or replying to it.

**Usage:**
- Reply to an image: Send `.enhance` as a reply to any image
- Tag an image: Send an image with `.enhance` as the caption

**Examples:**
```
User: [sends image]
Bot: [reply with] .enhance

User: [sends image with caption] .enhance
Bot: [processes and sends enhanced version]
```

### `.enhancestatus`
Check the status of the enhancement plugin and available services.

**Usage:**
```
.enhancestatus
```

## How It Works

1. **Image Detection**: Plugin detects when `.enhance` is used with an image
2. **Download**: Downloads the image from WhatsApp
3. **Processing**: Applies AI enhancement using available services:
   - Sharp library (if installed) - for professional image processing
   - Fallback methods for basic enhancement
   - Multiple service attempts for best results
4. **Upload**: Sends the enhanced image back to the chat
5. **Cleanup**: Automatically removes files after 5 minutes

## Enhancement Methods

The plugin uses multiple enhancement approaches:

### Primary Method: Sharp Library
- Professional image sharpening
- Brightness/saturation adjustment
- High-quality upscaling using Lanczos3 kernel
- Noise reduction

### Fallback Methods
- Basic image processing
- Format optimization
- Quality improvement
- Resolution preservation

## Supported Formats

- **JPEG/JPG** - Full support
- **PNG** - Full support with transparency
- **WebP** - Modern format support
- **GIF** - Static images (animated GIFs processed as first frame)
- **BMP** - Basic bitmap support

## Configuration

The plugin can be configured via `plugin.json`:

```json
{
  "settings": {
    "maxFileSize": "10MB",
    "enhancementScale": 2,
    "tempFileRetention": "5minutes",
    "defaultQuality": 100
  }
}
```

### Settings Explanation

- `maxFileSize`: Maximum file size to process
- `enhancementScale`: Upscaling factor (1-4)
- `tempFileRetention`: How long to keep temp files
- `defaultQuality`: Output quality percentage

## File Management

### Temporary Files
- Downloaded images stored in `{root}/data/enhance/`
- Files automatically cleaned up after 5 minutes
- Both input and enhanced images are removed

### Storage Requirements
- ~20MB free space recommended
- Temporary storage for input/output images
- Automatic cleanup prevents storage buildup

## Error Handling

The plugin handles various error scenarios:

- **Invalid file types**: Clear error messages
- **Network failures**: Automatic retry with fallback methods  
- **Processing errors**: Graceful degradation
- **Storage issues**: Automatic cleanup and recovery

## Performance

### Processing Times
- Small images (< 1MB): 2-5 seconds
- Medium images (1-5MB): 5-15 seconds
- Large images (5-10MB): 15-30 seconds

### Resource Usage
- CPU: Moderate during processing
- Memory: 50-200MB temporary usage
- Disk: Minimal permanent storage
- Network: Only for downloading/uploading

## Troubleshooting

### Common Issues

**Plugin not loading:**
```bash
# Check if data directory exists
ls -la data/enhance/

# Verify plugin.json is valid JSON
node -e "console.log(JSON.parse(require('fs').readFileSync('src/plugins/enhance/plugin.json')))"
```

**Enhancement not working:**
1. Check if Sharp is installed: `npm list sharp`
2. Verify image format is supported
3. Check available disk space
4. Review bot logs for specific errors

**Slow processing:**
1. Install Sharp library for faster processing
2. Reduce image size before enhancement
3. Check internet connection speed

### Debug Commands

Check plugin status:
```
.enhancestatus
```

View plugin info (admin):
```
.plugins
```

### Log Files

Monitor bot console for enhancement logs:
- `📥 Image saved:` - Download successful
- `🎨 Starting image enhancement` - Processing started
- `✅ Image enhanced` - Enhancement completed
- `❌ Enhancement failed` - Error occurred

## Advanced Usage

### Batch Processing
While not directly supported, you can enhance multiple images by using the command on each image individually.

### Integration with Other Plugins
The enhance plugin can work alongside other media plugins:
- Use with compression plugins for size optimization
- Combine with watermark plugins for branded images
- Chain with format conversion plugins

### API Extensions
The plugin architecture allows for easy addition of new enhancement services:
1. Add service configuration to `this.services`
2. Implement service-specific enhancement method
3. Add error handling and fallback logic

## Contributing

To add new enhancement services:

1. **Add Service Configuration:**
```javascript
this.services.push({
    name: 'new_service',
    url: 'https://api.example.com/enhance',
    enabled: true
});
```

2. **Implement Enhancement Method:**
```javascript
async tryNewServiceEnhancement(inputPath, timestamp) {
    // Implementation here
}
```

3. **Update Service Selection Logic:**
Add the new service to the enhancement pipeline.

## Privacy & Security

- **No data retention**: Images are deleted automatically after 5 minutes
- **Local processing**: Primary enhancement happens locally
- **Secure cleanup**: Temporary files are securely removed
- **No external tracking**: No user data sent to third parties

## License
 
This plugin is part of the MATDEV Bot ecosystem and follows the same license terms.

## Support

For issues or feature requests:
1. Check troubleshooting section above
2. Review bot logs for specific errors
3. Verify all dependencies are installed
4. Test with different image formats and sizes

## Version History

- **v1.0.0** - Initial release with Sharp integration and multiple enhancement methods