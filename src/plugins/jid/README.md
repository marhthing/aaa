# JID Plugin

## Description
A simple utility plugin that retrieves and displays the current chat's JID (WhatsApp identifier).

## Features
- Get the current chat's JID
- Simple, lightweight implementation
- Works in both group and private chats

## Commands

### `.jid`
Returns the current chat's JID.

**Usage:** `.jid`

**Example:**
```
User: .jid
Bot: 📱 Chat JID:
     120363025343298765@g.us
```

## Installation

1. Create folder: `src/plugins/jid/`
2. Add the three files: `index.js`, `plugin.json`, and `README.md`
3. Bot will automatically detect and load the plugin
4. Use `.jid` command to test

## Technical Details

- **Category:** Utility
- **Priority:** 10
- **Owner Only:** No (available to all users)
- **Dependencies:** None
- **Permissions:** None required

## Use Cases

- Getting chat identifiers for bot development
- Debugging chat-specific issues
- Administrative purposes
- Integration with other systems that need chat JIDs

## Notes

- The JID format differs between private chats and groups
- Private chats: Usually end with `@s.whatsapp.net`
- Group chats: Usually end with `@g.us`
- The plugin handles both types automatically