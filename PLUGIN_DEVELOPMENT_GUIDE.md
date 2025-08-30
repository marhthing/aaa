
# MATDEV Bot Plugin Development Guide

## Plugin Structure Requirements

### 1. Basic Plugin Template
Every plugin must follow this exact structure:

```javascript
const { bot } = require('../lib/client')

bot(
  {
    pattern: 'yourcommand ?(.*)',
    desc: 'Description of what your plugin does',
    type: 'misc', // or 'owner', 'system', 'fun', 'utility', etc.
  },
  async (message, match) => {
    // Your plugin logic here
    
    // Use message.reply() to respond
    return await message.reply('Your response here')
  }
)
```

### 2. Required Import
- **MUST** start with: `const { bot } = require('../lib/client')`
- This imports the bot function needed to register your plugin

### 3. Pattern Rules
- Use `pattern: 'command ?(.*)'` format
- `?(.*)` makes parameters optional
- Pattern is case-insensitive
- Examples:
  - `'test ?(.*)' ` - matches `.test` and `.test hello`
  - `'weather (.*)' ` - requires parameter: `.weather london`
  - `'ping'` - exact match only: `.ping`

### 4. Plugin Types
Choose appropriate type:
- `'misc'` - General commands
- `'fun'` - Entertainment/games
- `'utility'` - Useful tools
- `'owner'` - Owner-only commands
- `'system'` - Bot management
- `'media'` - Media processing

## Message Object Properties

The `message` parameter provides these methods:

```javascript
// Send a message
await message.send('Hello World')

// Reply to the message (quotes original)
await message.reply('This is a reply')

// React to the message
await message.react('✅')

// Message properties
message.text       // Full message text
message.sender     // Sender's JID
message.jid        // Chat JID
message.isGroup    // true if group chat
message.args       // Array of command arguments
message.command    // The command used
message.key        // Message key object
```

## Plugin Examples

### Simple Command
```javascript
const { bot } = require('../lib/client')

bot(
  {
    pattern: 'hello ?(.*)',
    desc: 'Say hello to someone',
    type: 'fun',
  },
  async (message, match) => {
    const name = match || 'World'
    return await message.reply(`Hello ${name}! 👋`)
  }
)
```

### Command with Parameters
```javascript
const { bot } = require('../lib/client')

bot(
  {
    pattern: 'calc (.*)',
    desc: 'Simple calculator',
    type: 'utility',
  },
  async (message, match) => {
    if (!match) {
      return await message.reply('❌ Usage: .calc 2+2')
    }
    
    try {
      // Simple math evaluation (be careful with eval!)
      const result = Function('"use strict"; return (' + match + ')')()
      return await message.reply(`🧮 Result: ${result}`)
    } catch (error) {
      return await message.reply('❌ Invalid calculation')
    }
  }
)
```

### Using External APIs
```javascript
const { bot } = require('../lib/client')

bot(
  {
    pattern: 'joke ?(.*)',
    desc: 'Get a random joke',
    type: 'fun',
  },
  async (message, match) => {
    try {
      // Add loading reaction
      await message.react('⏳')
      
      // Fetch joke from API
      const response = await fetch('https://api.joke.com/random')
      const data = await response.json()
      
      await message.react('😄')
      return await message.reply(`😂 ${data.joke}`)
      
    } catch (error) {
      await message.react('❌')
      return await message.reply('❌ Failed to fetch joke')
    }
  }
)
```

## Best Practices

### 1. Error Handling
Always wrap your code in try-catch:

```javascript
async (message, match) => {
  try {
    // Your code here
  } catch (error) {
    console.error('Plugin error:', error)
    return await message.reply('❌ Something went wrong')
  }
}
```

### 2. Input Validation
```javascript
if (!match || match.trim().length === 0) {
  return await message.reply('❌ Usage: .command <parameter>')
}
```

### 3. Reactions for Feedback
```javascript
await message.react('⏳') // Loading
// Do work...
await message.react('✅') // Success
```

### 4. Descriptive Messages
```javascript
// Good
return await message.reply('✅ Weather: 25°C, Sunny in London')

// Bad
return await message.reply('25')
```

## File Naming
- Use descriptive names: `weather.js`, `translate.js`, `meme.js`
- Avoid spaces: use `word-word.js` or `wordWord.js`
- Use lowercase for consistency

## Dependencies
If your plugin needs external packages:
1. The bot auto-installs from `package.json`
2. Common packages already available:
   - `axios` - HTTP requests
   - `fs-extra` - File operations
   - `path` - Path utilities

## Testing Your Plugin
1. Save your plugin as `plugins/yourname.js`
2. Use `.plugin install <gist-url>` to install from GitHub Gist
3. Test with the command pattern you defined
4. Check console for error messages

## GitHub Gist Requirements
When sharing your plugin:
1. Create a single `.js` file on GitHub Gist
2. Make it public
3. Use descriptive filename: `weather-plugin.js`
4. Include comment at top explaining what it does

## Common Mistakes to Avoid

1. **Wrong import path**: Must be `../lib/client`, not `./lib/client`
2. **Missing async/await**: Always use `async` function and `await` for replies
3. **Not handling errors**: Always wrap in try-catch
4. **Complex patterns**: Keep patterns simple and clear
5. **Missing return**: Always `return await message.reply()`

## Advanced Features

### Access to Client Methods
```javascript
async (message, match) => {
  // Access bot client methods
  const status = message.client.getStatus()
  
  // Check if user has access to command
  const hasAccess = message.client.hasAccess(message.sender, 'admin')
  
  // Allow/disallow commands (owner only)
  message.client.allowCommand(userJid, 'weather')
}
```

### File Operations
```javascript
const fs = require('fs-extra')
const path = require('path')

// Save data
const dataPath = path.join(__dirname, '../data/plugins/mydata.json')
await fs.writeJson(dataPath, { users: [] })

// Read data
const data = await fs.readJson(dataPath)
```

Follow these rules exactly, and your plugin will work perfectly with the MATDEV Bot system!
