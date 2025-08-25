/**
 * Meme Plugin - Meme generation and random memes
 */

const axios = require('axios');

module.exports = {
    name: 'meme',
    description: 'Generate memes and get random memes from various sources',
    version: '1.0.0',
    command: ['meme', 'memes', 'funny'],
    category: 'fun',
    usage: '[random] | [generate <template> <top text> <bottom text>]',
    fromMe: false,
    type: 'whatsapp',
    cooldown: 10,
    
    async function(message, match, bot) {
        try {
            const args = match ? match.trim().split(' ') : [];
            const action = args[0]?.toLowerCase();
            
            if (!action || action === 'random') {
                await this.getRandomMeme(message);
            } else if (action === 'generate' || action === 'gen') {
                await this.generateMeme(message, args.slice(1), bot);
            } else if (action === 'templates') {
                await this.showTemplates(message, bot);
            } else if (action === 'reddit') {
                await this.getRedditMeme(message);
            } else {
                await this.showMemeMenu(message, bot);
            }
            
        } catch (error) {
            await message.reply('❌ Meme command failed. The memes are broken! 😭');
            throw error;
        }
    },
    
    /**
     * Show meme menu and usage
     */
    async showMemeMenu(message, bot) {
        const prefix = bot.config.PREFIX;
        
        let memeText = `🎭 *Meme Generator*\n\n`;
        memeText += `🎯 **Commands:**\n`;
        memeText += `• ${prefix}meme - Random meme\n`;
        memeText += `• ${prefix}meme random - Random meme\n`;
        memeText += `• ${prefix}meme reddit - Reddit meme\n`;
        memeText += `• ${prefix}meme templates - View templates\n`;
        memeText += `• ${prefix}meme generate <template> <top> <bottom>\n\n`;
        
        memeText += `🖼️ **Meme Generation:**\n`;
        memeText += `Create custom memes using popular templates!\n\n`;
        
        memeText += `📋 **Example:**\n`;
        memeText += `${prefix}meme generate drake "Old way" "New way"\n\n`;
        
        memeText += `🎪 **Popular Templates:**\n`;
        memeText += `• drake - Drake pointing meme\n`;
        memeText += `• distracted - Distracted boyfriend\n`;
        memeText += `• pikachu - Surprised Pikachu\n`;
        memeText += `• doge - Such wow, much meme\n`;
        memeText += `• success - Success kid\n`;
        memeText += `• first - First world problems\n\n`;
        
        memeText += `🌟 **Features:**\n`;
        memeText += `• Fresh memes from Reddit\n`;
        memeText += `• Custom meme generation\n`;
        memeText += `• Multiple meme sources\n`;
        memeText += `• High quality images\n\n`;
        
        memeText += `💡 *Get ready to laugh! Try any command above.*`;
        
        await message.reply(memeText);
    },
    
    /**
     * Get a random meme
     */
    async getRandomMeme(message) {
        try {
            await message.reply('🎭 Finding a fresh meme...');
            
            // Try multiple meme sources
            const memeSources = [
                () => this.getRedditMeme(message, false),
                () => this.getMemeFromAPI(message, false),
                () => this.getBuiltInMeme(message, false)
            ];
            
            // Try each source until one works
            for (const source of memeSources) {
                try {
                    await source();
                    return;
                } catch (error) {
                    continue;
                }
            }
            
            // Fallback if all sources fail
            await message.reply('😅 Sorry, I couldn\'t fetch a fresh meme right now. Try again in a moment!');
            
        } catch (error) {
            await message.reply('❌ Failed to get meme. The meme gods are not happy! 😔');
            throw error;
        }
    },
    
    /**
     * Get meme from Reddit
     */
    async getRedditMeme(message, showSource = true) {
        try {
            const subreddits = ['memes', 'dankmemes', 'wholesomememes', 'programmerhumor', 'me_irl'];
            const randomSubreddit = subreddits[Math.floor(Math.random() * subreddits.length)];
            
            const response = await axios.get(`https://meme-api.herokuapp.com/gimme/${randomSubreddit}`, {
                timeout: 10000
            });
            
            const memeData = response.data;
            
            if (!memeData.url) {
                throw new Error('No meme URL received');
            }
            
            // Download the image
            const imageResponse = await axios.get(memeData.url, {
                responseType: 'arraybuffer',
                timeout: 15000
            });
            
            const imageBuffer = Buffer.from(imageResponse.data);
            
            let caption = showSource ? `🎭 *Random Meme*\n\n` : '';
            caption += `📝 **Title:** ${memeData.title}\n`;
            caption += `👍 **Upvotes:** ${memeData.ups || 'N/A'}\n`;
            caption += `📱 **Source:** r/${randomSubreddit}\n`;
            caption += `👤 **Author:** u/${memeData.author}\n\n`;
            caption += `😂 *Enjoy the meme!*`;
            
            await message.reply({
                image: imageBuffer,
                caption: caption
            });
            
        } catch (error) {
            if (showSource) {
                await this.getMemeFromAPI(message, true);
            } else {
                throw error;
            }
        }
    },
    
    /**
     * Get meme from alternative API
     */
    async getMemeFromAPI(message, showSource = true) {
        try {
            // Using imgflip API as alternative
            const response = await axios.get('https://api.imgflip.com/get_memes', {
                timeout: 5000
            });
            
            const memes = response.data.data.memes;
            const randomMeme = memes[Math.floor(Math.random() * memes.length)];
            
            // Download the meme image
            const imageResponse = await axios.get(randomMeme.url, {
                responseType: 'arraybuffer',
                timeout: 10000
            });
            
            const imageBuffer = Buffer.from(imageResponse.data);
            
            let caption = showSource ? `🎭 *Random Meme Template*\n\n` : '';
            caption += `📝 **Name:** ${randomMeme.name}\n`;
            caption += `🔢 **ID:** ${randomMeme.id}\n`;
            caption += `📏 **Size:** ${randomMeme.width}x${randomMeme.height}\n\n`;
            caption += `💡 *Use this template with:* meme generate ${randomMeme.id}`;
            
            await message.reply({
                image: imageBuffer,
                caption: caption
            });
            
        } catch (error) {
            if (showSource) {
                await this.getBuiltInMeme(message, true);
            } else {
                throw error;
            }
        }
    },
    
    /**
     * Generate custom meme
     */
    async generateMeme(message, args, bot) {
        try {
            if (args.length < 3) {
                await message.reply('❓ Usage: meme generate <template> <top text> <bottom text>\n\nExample: meme generate drake "Old way" "New way"');
                return;
            }
            
            const template = args[0].toLowerCase();
            const topText = args[1].replace(/"/g, '');
            const bottomText = args[2].replace(/"/g, '');
            
            await message.reply('🎨 Generating your custom meme...');
            
            // Get template ID
            const templateId = this.getTemplateId(template);
            
            if (!templateId) {
                await message.reply(`❌ Template "${template}" not found. Use \`meme templates\` to see available templates.`);
                return;
            }
            
            // Generate meme using imgflip API
            const memeUrl = await this.generateMemeImage(templateId, topText, bottomText);
            
            if (!memeUrl) {
                await message.reply('❌ Failed to generate meme. Try again with different text.');
                return;
            }
            
            // Download generated meme
            const imageResponse = await axios.get(memeUrl, {
                responseType: 'arraybuffer',
                timeout: 10000
            });
            
            const imageBuffer = Buffer.from(imageResponse.data);
            
            let caption = `🎨 *Custom Meme Generated*\n\n`;
            caption += `📝 **Template:** ${template}\n`;
            caption += `⬆️ **Top Text:** ${topText}\n`;
            caption += `⬇️ **Bottom Text:** ${bottomText}\n\n`;
            caption += `😂 *Your personalized meme is ready!*`;
            
            await message.reply({
                image: imageBuffer,
                caption: caption
            });
            
        } catch (error) {
            await message.reply('❌ Failed to generate custom meme. Try again later!');
            throw error;
        }
    },
    
    /**
     * Generate meme image using API
     */
    async generateMemeImage(templateId, topText, bottomText) {
        try {
            // Note: In production, you would need an imgflip API username and password
            const response = await axios.post('https://api.imgflip.com/caption_image', {
                template_id: templateId,
                username: process.env.IMGFLIP_USERNAME || 'demo_user',
                password: process.env.IMGFLIP_PASSWORD || 'demo_pass',
                text0: topText,
                text1: bottomText
            }, {
                timeout: 10000
            });
            
            if (response.data.success) {
                return response.data.data.url;
            } else {
                throw new Error('API returned error');
            }
            
        } catch (error) {
            // Fallback: return a placeholder or built-in meme
            return null;
        }
    },
    
    /**
     * Show available templates
     */
    async showTemplates(message, bot) {
        const prefix = bot.config.PREFIX;
        
        let templatesText = `🖼️ *Meme Templates*\n\n`;
        templatesText += `🎯 **Popular Templates:**\n\n`;
        
        const templates = this.getPopularTemplates();
        
        templates.forEach(template => {
            templatesText += `📝 **${template.name}**\n`;
            templatesText += `   ID: ${template.id}\n`;
            templatesText += `   Usage: ${prefix}meme gen ${template.shortName} "top" "bottom"\n\n`;
        });
        
        templatesText += `💡 **Examples:**\n`;
        templatesText += `• ${prefix}meme gen drake "Old method" "New method"\n`;
        templatesText += `• ${prefix}meme gen distracted "My code" "Stack Overflow" "Me"\n`;
        templatesText += `• ${prefix}meme gen pikachu "When you see a bug"\n\n`;
        
        templatesText += `🎨 *Create your own viral memes!*`;
        
        await message.reply(templatesText);
    },
    
    /**
     * Get built-in meme as fallback
     */
    async getBuiltInMeme(message, showSource = true) {
        const memeQuotes = [
            "When you fix one bug and create three more 🐛",
            "Me: 'I'll just check one more thing'\n*3 hours later*",
            "Stack Overflow: Exists\nProgrammers: It's free real estate",
            "When the code works but you don't know why 🤷‍♂️",
            "Client: Can you make it pop more?\nDesigner: *Internal screaming*",
            "When you finally understand a concept you've been struggling with 💡",
            "Me: 'This will be a quick fix'\nAlso me: *Refactors entire codebase*"
        ];
        
        const randomQuote = memeQuotes[Math.floor(Math.random() * memeQuotes.length)];
        
        let caption = showSource ? `🎭 *Programmer Meme*\n\n` : '';
        caption += `${randomQuote}\n\n`;
        caption += `😂 *Classic developer humor!*`;
        
        await message.reply(caption);
    },
    
    /**
     * Get template ID from name
     */
    getTemplateId(templateName) {
        const templates = {
            'drake': '181913649',
            'distracted': '112126428',
            'pikachu': '155067746',
            'doge': '8072285',
            'success': '61544',
            'first': '61579',
            'oldman': '61556',
            'interesting': '61585',
            'yoda': '61581',
            'wonka': '61582',
            'philosoraptor': '61516',
            'fry': '61520',
            'captain': '61584',
            'matrix': '100777631'
        };
        
        return templates[templateName.toLowerCase()];
    },
    
    /**
     * Get popular templates list
     */
    getPopularTemplates() {
        return [
            { id: '181913649', name: 'Drake Pointing', shortName: 'drake' },
            { id: '112126428', name: 'Distracted Boyfriend', shortName: 'distracted' },
            { id: '155067746', name: 'Surprised Pikachu', shortName: 'pikachu' },
            { id: '8072285', name: 'Doge', shortName: 'doge' },
            { id: '61544', name: 'Success Kid', shortName: 'success' },
            { id: '61579', name: 'First World Problems', shortName: 'first' },
            { id: '61556', name: 'Most Interesting Man', shortName: 'interesting' },
            { id: '61520', name: 'Futurama Fry', shortName: 'fry' },
            { id: '100777631', name: 'Matrix Morpheus', shortName: 'matrix' }
        ];
    }
};
