# MatDev WhatsApp Scanner

**Separate web interface for QR code scanning and session creation**

## 🚀 Quick Deploy

Deploy this folder to **Vercel**, **Netlify**, or any serverless platform:

```bash
# Deploy to Vercel
vercel

# Deploy to Netlify
netlify deploy --prod

# Run locally
npm install
npm start
```

## 📋 Environment Variables

Set these in your hosting platform:

```
DATABASE_URL=postgresql://user:pass@host:5432/database
NODE_ENV=production
```

## 🔗 How It Works

1. **Users visit** your deployed scanner URL
2. **Generate** unique session ID
3. **Scan QR code** with WhatsApp
4. **Session saved** to database
5. **Use session ID** in bot launcher

## 📱 Usage Flow

```
User visits scanner → Generates session ID → Scans QR → 
Session saved to DB → Copy session ID → Use in bot launcher
```

## 🌐 Hosting Platforms

- **Vercel**: `vercel.app`
- **Netlify**: `netlify.app`  
- **Railway**: `railway.app`
- **Render**: `render.com`
- **Heroku**: `heroku.com`

## 🔐 Database

Uses the same PostgreSQL database as your main bot. The scanner creates sessions, the bot fetches them.

## 📄 Files

- `index.js` - Express server with Socket.IO
- `public/index.html` - Web interface
- `package.json` - Dependencies