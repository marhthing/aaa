const { generateWAMessageFromContent, downloadMediaMessage } = require('@whiskeysockets/baileys')
const fs = require('fs-extra')
const path = require('path')
const axios = require('axios')
const piexif = require('piexifjs')
const { Image } = require('image-js')

/**
 * Extract text from WhatsApp message
 */
function getMessageText(message) {
    if (!message.message) return null

    const messageContent = message.message

    if (messageContent.conversation) {
        return messageContent.conversation
    }

    if (messageContent.extendedTextMessage?.text) {
        return messageContent.extendedTextMessage.text
    }

    if (messageContent.imageMessage?.caption) {
        return messageContent.imageMessage.caption
    }

    if (messageContent.videoMessage?.caption) {
        return messageContent.videoMessage.caption
    }

    if (messageContent.documentMessage?.caption) {
        return messageContent.documentMessage.caption
    }

    return null
}

/**
 * Send a message to a chat
 */
async function sendMessage(socket, jid, text, options = {}) {
    try {
        const messageOptions = {
            text: text,
            ...options
        }

        return await socket.sendMessage(jid, messageOptions)

    } catch (error) {
        console.error('Failed to send message:', error)
        throw error
    }
}

/**
 * Add reaction to a message
 */
async function addReaction(socket, messageKey, emoji) {
    try {
        const reactionMessage = {
            react: {
                text: emoji,
                key: messageKey
            }
        }

        return await socket.sendMessage(messageKey.remoteJid, reactionMessage)

    } catch (error) {
        console.error('Failed to add reaction:', error)
    }
}

/**
 * Download media from message
 */
async function downloadMedia(message, socket) {
    try {
        const buffer = await downloadMediaMessage(
            message,
            'buffer',
            {},
            {
                logger: console,
                reuploadRequest: socket.updateMediaMessage
            }
        )

        return buffer

    } catch (error) {
        console.error('Failed to download media:', error)
        throw error
    }
}

/**
 * Get chat/group info
 */
function getChatInfo(jid) {
    const isGroup = jid.endsWith('@g.us')
    const isPrivate = jid.endsWith('@s.whatsapp.net')

    return {
        jid,
        isGroup,
        isPrivate,
        type: isGroup ? 'group' : 'private'
    }
}

/**
 * Extract JID from message participant
 */
function getParticipantJid(message) {
    return message.key.participant || message.key.remoteJid
}

/**
 * Send status notification to owner
 */
async function sendOwnerNotification(socket, ownerJid, type, customMessage = null) {
    if (!socket || !ownerJid) return

    try {
        let message = ''
        const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' })

        // Template messages for different status types
        switch (type) {
            case 'startup':
                message = customMessage || `🤖 *MATDEV Bot Started*\n\n✅ Bot is now online and ready\n🕐 Time: ${timestamp}\n📱 Session: Active\n\n_Your personal assistant is ready to serve!_`
                break

            case 'restart':
                message = customMessage || `🔄 *MATDEV Bot Restarted*\n\n✅ Bot has been restarted successfully\n🕐 Time: ${timestamp}\n📱 All systems operational\n\n_Restart completed - back online!_`
                break

            case 'pairing_completed':
                message = customMessage || `📱 *Pairing Completed*\n\n✅ WhatsApp pairing successful\n🕐 Time: ${timestamp}\n🔐 Authentication confirmed\n\n_Your bot is now connected and ready!_`
                break

            case 'shutdown':
                message = customMessage || `🛑 *MATDEV Bot Shutting Down*\n\n⚠️ Bot is going offline\n🕐 Time: ${timestamp}\n\n_Goodbye for now!_`
                break

            default:
                message = customMessage || `ℹ️ *Bot Status Update*\n\n📊 Status: ${type}\n🕐 Time: ${timestamp}`
        }

        // Convert owner JID to private chat format if needed
        const ownerPrivateJid = ownerJid.split(':')[0] + '@s.whatsapp.net'

        await sendMessage(socket, ownerPrivateJid, message)
        console.log(`📤 Status notification sent to owner: ${type}`)

    } catch (error) {
        console.error('Failed to send owner notification:', error)
    }
}

/**
 * Format uptime
 */
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)

    return `${days}d ${hours}h ${minutes}m`
}

/**
 * Sleep utility
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Clean phone number format
 */
function cleanPhoneNumber(phoneNumber) {
    if (!phoneNumber) return null

    // Remove all non-digit characters except +
    let cleaned = phoneNumber.replace(/[^\d+]/g, '')

    // Remove leading + if present
    if (cleaned.startsWith('+')) {
        cleaned = cleaned.substring(1)
    }

    // Validate: should be 10-15 digits
    if (!/^\d{10,15}$/.test(cleaned)) {
        return null
    }

    return cleaned
}

/**
 * Check if user is owner
 */
function isOwner(jid, ownerJid) {
    return jid === ownerJid || jid.includes(ownerJid.split('@')[0])
}

/**
 * Add EXIF metadata to sticker buffer
 * @param {Buffer} buffer - The sticker buffer
 * @param {Object} metadata - Metadata object with packname and author
 * @returns {Buffer} - Buffer with embedded metadata
 */
async function writeExif(buffer, metadata) {
  try {
    // Create EXIF data with proper structure for WhatsApp stickers
    const exifAttr = {
      '0th': {
        [piexif.ImageIFD.Make]: metadata.packname || 'MATDEV Bot',
        [piexif.ImageIFD.ImageDescription]: `${metadata.packname || 'MATDEV Bot'}\nAuthor: ${metadata.author || 'MATDEV Bot'}`,
      },
      'Exif': {
        [piexif.ExifIFD.UserComment]: piexif.helper.UserCommentEncode(`sticker-pack-id\x00${metadata.packname || 'MATDEV Bot'}\x00sticker-pack-name\x00${metadata.packname || 'MATDEV Bot'}\x00sticker-author-name\x00${metadata.author || 'MATDEV Bot'}\x00`)
      }
    }

    const exifData = piexif.dump(exifAttr)
    
    // Convert buffer to base64 for piexif processing
    const base64Data = 'data:image/webp;base64,' + buffer.toString('base64')
    const newData = piexif.insert(exifData, base64Data)
    
    // Convert back to buffer
    const base64String = newData.replace(/^data:image\/webp;base64,/, '')
    return Buffer.from(base64String, 'base64')
  } catch (error) {
    console.log('⚠️ Failed to add EXIF data, sending without metadata:', error.message)
    return buffer
  }
}

module.exports = {
  sendMessage,
  downloadMedia,
  addReaction,
  getMessageText,
  sendOwnerNotification,
  formatUptime,
  sleep,
  cleanPhoneNumber,
  getChatInfo,
  getParticipantJid,
  isOwner,
  writeExif
}