/**
 * QR Code Plugin - Generate and read QR codes
 */

const qrcode = require('qrcode');

module.exports = {
    name: 'qr',
    description: 'Generate QR codes from text or URLs',
    version: '1.0.0',
    command: ['qr', 'qrcode', 'qrgen'],
    category: 'utilities',
    usage: '<text/url>',
    fromMe: false,
    type: 'whatsapp',
    cooldown: 5,
    
    async function(message, match, bot) {
        try {
            const args = match ? match.trim() : '';
            
            if (!args) {
                await this.showQRMenu(message, bot);
                return;
            }
            
            await this.generateQRCode(message, args, bot);
            
        } catch (error) {
            await message.reply('❌ QR code command failed.');
            throw error;
        }
    },
    
    /**
     * Show QR code menu and usage
     */
    async showQRMenu(message, bot) {
        const prefix = bot.config.PREFIX;
        
        let qrText = `📱 *QR Code Generator*\n\n`;
        qrText += `🔗 **Generate QR Codes:**\n`;
        qrText += `• ${prefix}qr <text> - Generate QR from text\n`;
        qrText += `• ${prefix}qr <url> - Generate QR from URL\n`;
        qrText += `• ${prefix}qr <contact info> - Generate contact QR\n\n`;
        
        qrText += `📋 **Examples:**\n`;
        qrText += `• ${prefix}qr Hello World\n`;
        qrText += `• ${prefix}qr https://github.com\n`;
        qrText += `• ${prefix}qr My secret message\n`;
        qrText += `• ${prefix}qr wifi:SSID:MyWiFi;T:WPA;P:password123;;\n\n`;
        
        qrText += `🎯 **Special Formats:**\n`;
        qrText += `• **WiFi:** wifi:SSID:NetworkName;T:WPA;P:password;;\n`;
        qrText += `• **Email:** mailto:user@example.com\n`;
        qrText += `• **Phone:** tel:+1234567890\n`;
        qrText += `• **SMS:** sms:+1234567890\n`;
        qrText += `• **vCard:** Contact information format\n\n`;
        
        qrText += `⚙️ **Features:**\n`;
        qrText += `• High quality PNG output\n`;
        qrText += `• Support for up to 4296 characters\n`;
        qrText += `• Error correction built-in\n`;
        qrText += `• Fast generation\n`;
        qrText += `• Various data formats supported\n\n`;
        
        qrText += `💡 **Tips:**\n`;
        qrText += `• URLs are automatically detected\n`;
        qrText += `• Long text is supported\n`;
        qrText += `• Special characters work fine`;
        
        await message.reply(qrText);
    },
    
    /**
     * Generate QR code from text
     */
    async generateQRCode(message, text, bot) {
        try {
            // Validate input length
            if (text.length > 4296) {
                await message.reply('❌ Text too long! QR codes support maximum 4296 characters.');
                return;
            }
            
            await message.reply('📱 Generating QR code...');
            
            // Determine QR code type and format text if needed
            const formattedData = this.formatQRData(text);
            
            // Generate QR code options
            const options = {
                errorCorrectionLevel: 'M',
                type: 'png',
                quality: 0.92,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                },
                width: 512
            };
            
            // Generate QR code as buffer
            const qrBuffer = await qrcode.toBuffer(formattedData.data, options);
            
            // Create caption with information
            let caption = `📱 *QR Code Generated*\n\n`;
            caption += `📝 **Type:** ${formattedData.type}\n`;
            caption += `📏 **Data Length:** ${formattedData.data.length} characters\n`;
            
            if (formattedData.description) {
                caption += `💭 **Description:** ${formattedData.description}\n`;
            }
            
            caption += `\n💡 *Scan this QR code with any QR reader app*`;
            
            // Send QR code image
            await message.reply({
                image: qrBuffer,
                caption: caption
            });
            
            // Also send as document for better quality if requested
            await message.reply({
                document: qrBuffer,
                fileName: `qrcode_${Date.now()}.png`,
                mimetype: 'image/png',
                caption: '🖼️ High quality QR code file'
            });
            
        } catch (error) {
            if (error.message.includes('too long')) {
                await message.reply('❌ Data is too long for QR code. Please use shorter text.');
            } else {
                await message.reply('❌ Failed to generate QR code. Please try again.');
            }
            throw error;
        }
    },
    
    /**
     * Format data for QR code and detect type
     */
    formatQRData(text) {
        const data = text.trim();
        
        // URL detection
        if (this.isURL(data)) {
            return {
                data: data,
                type: 'URL',
                description: 'Web link'
            };
        }
        
        // Email detection
        if (data.toLowerCase().startsWith('mailto:') || this.isEmail(data)) {
            const emailData = data.toLowerCase().startsWith('mailto:') ? data : `mailto:${data}`;
            return {
                data: emailData,
                type: 'Email',
                description: 'Email address'
            };
        }
        
        // Phone number detection
        if (data.toLowerCase().startsWith('tel:') || this.isPhoneNumber(data)) {
            const phoneData = data.toLowerCase().startsWith('tel:') ? data : `tel:${data}`;
            return {
                data: phoneData,
                type: 'Phone',
                description: 'Phone number'
            };
        }
        
        // SMS detection
        if (data.toLowerCase().startsWith('sms:')) {
            return {
                data: data,
                type: 'SMS',
                description: 'SMS message'
            };
        }
        
        // WiFi detection
        if (data.toLowerCase().startsWith('wifi:')) {
            return {
                data: data,
                type: 'WiFi',
                description: 'WiFi network credentials'
            };
        }
        
        // vCard detection
        if (data.toLowerCase().startsWith('begin:vcard')) {
            return {
                data: data,
                type: 'vCard',
                description: 'Contact information'
            };
        }
        
        // Geo location detection
        if (data.toLowerCase().startsWith('geo:')) {
            return {
                data: data,
                type: 'Location',
                description: 'Geographic coordinates'
            };
        }
        
        // Plain text
        return {
            data: data,
            type: 'Text',
            description: 'Plain text content'
        };
    },
    
    /**
     * Check if text is a URL
     */
    isURL(text) {
        try {
            const url = new URL(text);
            return ['http:', 'https:', 'ftp:', 'ftps:'].includes(url.protocol);
        } catch {
            return false;
        }
    },
    
    /**
     * Check if text is an email
     */
    isEmail(text) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(text);
    },
    
    /**
     * Check if text is a phone number
     */
    isPhoneNumber(text) {
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        return phoneRegex.test(text.replace(/[\s\-\(\)]/g, ''));
    },
    
    /**
     * Generate WiFi QR code
     */
    generateWiFiQR(ssid, password, security = 'WPA', hidden = false) {
        const wifiString = `WIFI:T:${security};S:${ssid};P:${password};H:${hidden ? 'true' : 'false'};;`;
        return wifiString;
    },
    
    /**
     * Generate vCard QR code
     */
    generateVCardQR(contact) {
        let vcard = 'BEGIN:VCARD\n';
        vcard += 'VERSION:3.0\n';
        
        if (contact.name) {
            vcard += `FN:${contact.name}\n`;
        }
        
        if (contact.phone) {
            vcard += `TEL:${contact.phone}\n`;
        }
        
        if (contact.email) {
            vcard += `EMAIL:${contact.email}\n`;
        }
        
        if (contact.org) {
            vcard += `ORG:${contact.org}\n`;
        }
        
        if (contact.url) {
            vcard += `URL:${contact.url}\n`;
        }
        
        vcard += 'END:VCARD';
        return vcard;
    },
    
    /**
     * Get QR code statistics
     */
    getQRStats(data) {
        const stats = {
            length: data.length,
            type: 'Unknown',
            estimatedSize: Math.ceil(data.length / 10) + 'KB',
            recommendedLevel: 'M'
        };
        
        // Determine error correction level based on use case
        if (data.length < 100) {
            stats.recommendedLevel = 'H'; // High error correction for small data
        } else if (data.length > 1000) {
            stats.recommendedLevel = 'L'; // Low error correction for large data
        }
        
        return stats;
    }
};
