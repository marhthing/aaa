const { generateWAMessageFromContent, downloadMediaMessage } = require('@whiskeysockets/baileys')
const fs = require('fs-extra')
const path = require('path')

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

module.exports = {
    sendMessage,
    downloadMedia,
    addReaction,
    getMessageText
}