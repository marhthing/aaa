{
  "name": "enhance",
  "displayName": "Image Enhancement Plugin",
  "description": "Download, enhance and upscale images using AI-powered free enhancement services",
  "version": "1.0.0",
  "author": "MATDEV Bot",
  "enabled": true,
  "ownerOnly": false,
  "priority": 15,
  "category": "media",
  "dependencies": [
    "axios",
    "fs-extra",
    "form-data"
  ],
  "commands": [
    {
      "name": "enhance",
      "description": "Enhance and upscale an image by tagging or replying to it",
      "usage": "enhance (reply to an image or tag an image)",
      "ownerOnly": false,
      "examples": [
        ".enhance (reply to an image)",
        ".enhance (tag an image with this command)"
      ]
    },
    {
      "name": "enhancestatus",
      "description": "Check the status of the image enhancement plugin",
      "usage": "enhancestatus",
      "ownerOnly": false,
      "examples": [
        ".enhancestatus"
      ]
    }
  ],
  "features": [
    "image-download",
    "image-enhancement",
    "ai-upscaling",
    "quality-improvement",
    "automatic-cleanup"
  ],
  "permissions": [
    "storage:read",
    "storage:write",
    "network:request",
    "media:download",
    "media:upload"
  ],
  "settings": {
    "maxFileSize": "10MB",
    "supportedFormats": ["jpeg", "jpg", "png", "webp", "gif", "bmp"],
    "enhancementScale": 2,
    "tempFileRetention": "5minutes",
    "defaultQuality": 100
  },
  "metadata": {
    "created": "2025-08-18T10:15:00.000Z",
    "tags": ["image", "enhancement", "ai", "upscaling", "media", "quality"],
    "requirements": [
      "Internet connection for API access",
      "Sufficient disk space for temporary files",
      "Sharp library (optional, for better enhancement)"
    ]
  }
}