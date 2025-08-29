const axios = require('axios');
const { writeFileSync, unlinkSync, existsSync } = require('fs');
const path = require('path');

/**
 * Parse GitHub Gist URLs for plugin installation
 */
function parseGistUrls(input) {
    const urls = [];
    const gistRegex = /https?:\/\/gist\.github\.com\/[^\/]+\/[a-f0-9]+/gi;
    const rawGistRegex = /https?:\/\/gist\.githubusercontent\.com\/[^\/]+\/[a-f0-9]+\/raw\/[^\/]*\/[^\/]+\.js/gi;
    
    let matches = input.match(gistRegex);
    if (matches) {
        for (const match of matches) {
            urls.push(match + '/raw');
        }
    }
    
    matches = input.match(rawGistRegex);
    if (matches) {
        urls.push(...matches);
    }
    
    // Also support direct .js file URLs
    const jsFileRegex = /https?:\/\/[^\s]+\.js/gi;
    matches = input.match(jsFileRegex);
    if (matches) {
        urls.push(...matches);
    }
    
    return urls.length > 0 ? urls : null;
}

/**
 * Extract plugin commands from plugin code
 */
function pluginsList(pluginCode) {
    const patterns = [];
    const patternRegex = /pattern:\s*['"`]([^'"`]+)['"`]/gi;
    let match;
    
    while ((match = patternRegex.exec(pluginCode)) !== null) {
        patterns.push(match[1].split(' ')[0]);
    }
    
    return patterns;
}

/**
 * Install plugin from URL or file
 */
async function installPlugin(source, sessionId = 'default') {
    try {
        let pluginCode;
        let pluginName;
        
        if (source.startsWith('http')) {
            // Download from URL
            const response = await axios.get(source);
            if (response.status !== 200) {
                throw new Error(`Failed to download plugin: ${response.status}`);
            }
            pluginCode = response.data;
        } else if (existsSync(source)) {
            // Load from file
            pluginCode = require('fs').readFileSync(source, 'utf8');
        } else {
            throw new Error('Invalid plugin source');
        }
        
        // Extract plugin name from pattern
        const nameMatch = /pattern:\s*['"`]([^'"`\s]+)/i.exec(pluginCode);
        if (!nameMatch) {
            throw new Error('Invalid plugin format: no pattern found');
        }
        
        pluginName = nameMatch[1].toLowerCase();
        
        // Validate plugin code (basic security check)
        if (pluginCode.includes('require(\'child_process\')') || 
            pluginCode.includes('eval(') || 
            pluginCode.includes('Function(')) {
            throw new Error('Plugin contains potentially dangerous code');
        }
        
        return {
            name: pluginName,
            code: pluginCode,
            commands: pluginsList(pluginCode)
        };
        
    } catch (error) {
        throw new Error(`Plugin installation failed: ${error.message}`);
    }
}

/**
 * Format message text
 */
function formatMessage(template, replacements = {}) {
    let formatted = template;
    for (const [key, value] of Object.entries(replacements)) {
        formatted = formatted.replace(new RegExp(`\\&${key}`, 'g'), value);
    }
    return formatted;
}

/**
 * Clean and normalize JID
 */
function normalizeJid(jid) {
    if (!jid) return null;
    return jid.replace(/:\d+/g, '').replace(/@s\.whatsapp\.net/g, '@s.whatsapp.net');
}

/**
 * Check if user is admin in group
 */
function isAdmin(participants, jid) {
    if (!participants || !jid) return false;
    const participant = participants.find(p => p.id === jid);
    return participant?.admin === 'admin' || participant?.admin === 'superadmin';
}

/**
 * Get message type
 */
function getMessageType(message) {
    if (!message.message) return null;
    
    const messageTypes = [
        'conversation',
        'extendedTextMessage',
        'imageMessage',
        'videoMessage',
        'audioMessage',
        'documentMessage',
        'stickerMessage',
        'contactMessage',
        'locationMessage',
        'reactionMessage'
    ];
    
    for (const type of messageTypes) {
        if (message.message[type]) {
            return type;
        }
    }
    
    return 'unknown';
}

/**
 * Extract text from message
 */
function getMessageText(message) {
    if (!message.message) return '';
    
    return message.message.conversation ||
           message.message.extendedTextMessage?.text ||
           message.message.imageMessage?.caption ||
           message.message.videoMessage?.caption ||
           message.message.documentMessage?.caption ||
           '';
}

/**
 * Sleep utility
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Random number generator
 */
function random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Time formatter
 */
function formatTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

module.exports = {
    parseGistUrls,
    pluginsList,
    installPlugin,
    formatMessage,
    normalizeJid,
    isAdmin,
    getMessageType,
    getMessageText,
    sleep,
    random,
    formatTime
};