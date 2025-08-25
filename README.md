# MatDev WhatsApp Bot - Terminal Edition

A launcher-based WhatsApp bot similar to Levanter architecture.

## 🚀 Quick Start

### For Bot Users:
1. **Get Session ID**: Visit the web scanner (hosted separately)
2. **Download**: Get `index.js` launcher file  
3. **Edit**: Replace `updateThis` with your session ID
4. **Run**: Execute `node index.js`

```javascript
const SESSION_ID = 'your-unique-session-id' // Edit this line
```

### For Bot Developers:
1. **Upload**: Push this repo to your GitHub
2. **Deploy Scanner**: Deploy `web-scanner/` folder to Vercel/Netlify  
3. **Update URL**: Change GitHub URL in `index.js`
4. **Share**: Give users the `index.js` launcher file

## 📁 Project Structure

```
├── index.js             # Main launcher (edit SESSION_ID here)
├── bot.js               # Core bot runner
├── lib/                 # Core system files
├── plugins/             # Bot plugins
│   ├── marketplace/     # Downloaded plugins
│   └── *.js            # Default plugins
├── data/                # Database and media
└── logs/               # Application logs
```

## 🔌 Plugin Marketplace

Install plugins from GitHub Gists or raw URLs:

```
.plugin https://gist.github.com/user/abc123
.plugin list
.plugin remove <name>
.plugin reload
```

### Example Plugin URLs
- https://gist.github.com/IAMRAFFII/886d765a1cbb1eaaa7d06dab9e2a7da8

## 💼 Deployment

This bot can run on various platforms:
- **Replit**: Just edit SESSION_ID and run
- **Render**: Deploy as Node.js app
- **Koyeb**: Docker or Node.js deployment
- **VPS**: PM2 or systemd service
- **Discord Bot Hosting**: Node.js runtime

## 🛠 Commands

Default prefix: `.`

**Admin Commands**:
- `.admin` - Admin panel
- `.plugin <url>` - Install plugin
- `.broadcast <message>` - Send to all chats
- `.settings` - Bot configuration

**Fun Commands**:
- `.joke` - Random joke
- `.meme` - Random meme
- `.ping` - Bot speed test

**Games**:
- `.ttt` - Tic-tac-toe
- `.wc` - Word chain game
- `.rw` - Random word game

**Utilities**:
- `.qr <text>` - Generate QR code
- `.translate <lang> <text>` - Translate text
- `.weather <city>` - Weather info

## 🔐 Security

- Only bot owners can install plugins
- Input validation and sanitization
- Rate limiting and anti-spam
- Secure session management

## 🌐 Architecture

This bot follows the Levanter architecture:

1. **Separate Scanner**: QR scanning hosted on serverless (Vercel) - see `web-scanner/` folder
2. **Launcher System**: Simple SESSION_ID configuration in `index.js`
3. **Plugin Marketplace**: Install from GitHub Gists/URLs
4. **Terminal Operation**: No web UI, pure console
5. **Database Sessions**: Sessions created by web scanner, fetched by bot

## ⚠️ Important

- **Never share your SESSION_ID**
- **Only install plugins from trusted sources**
- **Keep your session files secure**
- **Regular backups of data folder**

## 📞 Support

- Check logs in `./logs/` folder for errors
- Restart with `node launcher.js`
- Clear session: delete `./sessions/` folder