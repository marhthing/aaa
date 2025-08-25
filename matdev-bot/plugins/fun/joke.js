/**
 * Joke Plugin - Random jokes and humor
 */

const axios = require('axios');

module.exports = {
    name: 'joke',
    description: 'Get random jokes, puns, and funny content',
    version: '1.0.0',
    command: ['joke', 'humor', 'funny', 'laugh'],
    category: 'fun',
    usage: '[category] | dad | programming | random',
    fromMe: false,
    type: 'whatsapp',
    cooldown: 5,
    
    async function(message, match, bot) {
        try {
            const args = match ? match.trim().toLowerCase() : 'random';
            
            switch (args) {
                case 'dad':
                case 'dadjoke':
                    await this.getDadJoke(message);
                    break;
                    
                case 'programming':
                case 'code':
                case 'dev':
                    await this.getProgrammingJoke(message);
                    break;
                    
                case 'chuck':
                case 'norris':
                    await this.getChuckNorrisJoke(message);
                    break;
                    
                case 'pun':
                case 'puns':
                    await this.getPunJoke(message);
                    break;
                    
                case 'oneliners':
                case 'oneliner':
                    await this.getOneLiner(message);
                    break;
                    
                case 'categories':
                case 'list':
                    await this.showCategories(message, bot);
                    break;
                    
                case 'random':
                case '':
                default:
                    await this.getRandomJoke(message);
                    break;
            }
            
        } catch (error) {
            await message.reply('❌ Joke command failed. Even my humor is broken! 😅');
            throw error;
        }
    },
    
    /**
     * Show joke categories and menu
     */
    async showCategories(message, bot) {
        const prefix = bot.config.PREFIX;
        
        let jokeText = `😂 *Joke Categories*\n\n`;
        jokeText += `🎭 **Available Categories:**\n`;
        jokeText += `• ${prefix}joke random - Random joke\n`;
        jokeText += `• ${prefix}joke dad - Dad jokes\n`;
        jokeText += `• ${prefix}joke programming - Programming humor\n`;
        jokeText += `• ${prefix}joke chuck - Chuck Norris jokes\n`;
        jokeText += `• ${prefix}joke pun - Puns and wordplay\n`;
        jokeText += `• ${prefix}joke oneliner - One-liner jokes\n\n`;
        
        jokeText += `🤖 **How it works:**\n`;
        jokeText += `• Fetches jokes from various APIs\n`;
        jokeText += `• Family-friendly content only\n`;
        jokeText += `• Fresh jokes every time\n`;
        jokeText += `• Multiple categories available\n\n`;
        
        jokeText += `😄 **Examples:**\n`;
        jokeText += `• ${prefix}joke - Get a random joke\n`;
        jokeText += `• ${prefix}laugh dad - Get a dad joke\n`;
        jokeText += `• ${prefix}funny code - Programming joke\n\n`;
        
        jokeText += `💡 *Need a laugh? Try any category above!*`;
        
        await message.reply(jokeText);
    },
    
    /**
     * Get a random joke from multiple sources
     */
    async getRandomJoke(message) {
        const jokeSources = [
            () => this.getDadJoke(message, false),
            () => this.getProgrammingJoke(message, false),
            () => this.getChuckNorrisJoke(message, false),
            () => this.getOneLiner(message, false),
            () => this.getBuiltInJoke(message, 'random')
        ];
        
        const randomSource = jokeSources[Math.floor(Math.random() * jokeSources.length)];
        await randomSource();
    },
    
    /**
     * Get a dad joke
     */
    async getDadJoke(message, showCategory = true) {
        try {
            // Try official dad joke API
            const response = await axios.get('https://icanhazdadjoke.com/', {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'MatDev WhatsApp Bot'
                },
                timeout: 5000
            });
            
            const joke = response.data.joke;
            const jokeText = showCategory ? `👨 *Dad Joke*\n\n${joke}\n\n😂 *Ba dum tss!*` : joke;
            
            await message.reply(jokeText);
            
        } catch (error) {
            // Fallback to built-in jokes
            await this.getBuiltInJoke(message, 'dad');
        }
    },
    
    /**
     * Get a programming joke
     */
    async getProgrammingJoke(message, showCategory = true) {
        try {
            // Try programming jokes API
            const response = await axios.get('https://official-joke-api.appspot.com/jokes/programming/random', {
                timeout: 5000
            });
            
            const jokeData = response.data[0];
            const joke = `${jokeData.setup}\n\n${jokeData.punchline}`;
            const jokeText = showCategory ? `💻 *Programming Joke*\n\n${joke}\n\n🤓 *Classic!*` : joke;
            
            await message.reply(jokeText);
            
        } catch (error) {
            // Fallback to built-in jokes
            await this.getBuiltInJoke(message, 'programming');
        }
    },
    
    /**
     * Get a Chuck Norris joke
     */
    async getChuckNorrisJoke(message, showCategory = true) {
        try {
            // Try Chuck Norris API
            const response = await axios.get('https://api.chucknorris.io/jokes/random', {
                timeout: 5000
            });
            
            const joke = response.data.value;
            const jokeText = showCategory ? `🥊 *Chuck Norris Fact*\n\n${joke}\n\n💪 *Legendary!*` : joke;
            
            await message.reply(jokeText);
            
        } catch (error) {
            // Fallback to built-in jokes
            await this.getBuiltInJoke(message, 'chuck');
        }
    },
    
    /**
     * Get a pun joke
     */
    async getPunJoke(message, showCategory = true) {
        await this.getBuiltInJoke(message, 'pun', showCategory);
    },
    
    /**
     * Get a one-liner joke
     */
    async getOneLiner(message, showCategory = true) {
        try {
            // Try one-liner API
            const response = await axios.get('https://official-joke-api.appspot.com/jokes/general/random', {
                timeout: 5000
            });
            
            const jokeData = response.data[0];
            const joke = jokeData.type === 'general' ? 
                `${jokeData.setup} ${jokeData.punchline}` : 
                `${jokeData.setup}\n\n${jokeData.punchline}`;
            
            const jokeText = showCategory ? `🎯 *One-Liner*\n\n${joke}\n\n😁 *Quick and funny!*` : joke;
            
            await message.reply(jokeText);
            
        } catch (error) {
            // Fallback to built-in jokes
            await this.getBuiltInJoke(message, 'oneliner');
        }
    },
    
    /**
     * Get built-in jokes as fallback
     */
    async getBuiltInJoke(message, category, showCategory = true) {
        const jokes = this.getBuiltInJokes();
        const categoryJokes = jokes[category] || jokes.random;
        const randomJoke = categoryJokes[Math.floor(Math.random() * categoryJokes.length)];
        
        const categoryEmojis = {
            dad: '👨',
            programming: '💻',
            chuck: '🥊',
            pun: '🎭',
            oneliner: '🎯',
            random: '😂'
        };
        
        const categoryNames = {
            dad: 'Dad Joke',
            programming: 'Programming Joke',
            chuck: 'Chuck Norris Fact',
            pun: 'Pun',
            oneliner: 'One-Liner',
            random: 'Random Joke'
        };
        
        const emoji = categoryEmojis[category] || '😂';
        const name = categoryNames[category] || 'Joke';
        
        const jokeText = showCategory ? 
            `${emoji} *${name}*\n\n${randomJoke.text}\n\n${randomJoke.reaction}` : 
            randomJoke.text;
        
        await message.reply(jokeText);
    },
    
    /**
     * Built-in jokes collection
     */
    getBuiltInJokes() {
        return {
            dad: [
                {
                    text: "Why don't scientists trust atoms? Because they make up everything!",
                    reaction: "😂 *Classic dad joke!*"
                },
                {
                    text: "I invented a new word: Plagiarism!",
                    reaction: "🤣 *Wait a minute...*"
                },
                {
                    text: "Why don't eggs tell jokes? They'd crack each other up!",
                    reaction: "🥚 *Egg-cellent!*"
                },
                {
                    text: "I'm reading a book about anti-gravity. It's impossible to put down!",
                    reaction: "📚 *Literally uplifting!*"
                },
                {
                    text: "Why did the scarecrow win an award? He was outstanding in his field!",
                    reaction: "🌾 *Outstanding indeed!*"
                }
            ],
            
            programming: [
                {
                    text: "Why do programmers prefer dark mode? Because light attracts bugs!",
                    reaction: "🐛 *So true!*"
                },
                {
                    text: "How many programmers does it take to change a light bulb? None, that's a hardware problem!",
                    reaction: "💡 *Classic!*"
                },
                {
                    text: "Why do Java developers wear glasses? Because they don't C#!",
                    reaction: "👓 *Language humor!*"
                },
                {
                    text: "There are only 10 types of people in the world: those who understand binary and those who don't.",
                    reaction: "🔢 *Binary brilliance!*"
                },
                {
                    text: "Why was the JavaScript developer sad? Because he didn't Node how to Express himself!",
                    reaction: "📦 *Node-js humor!*"
                }
            ],
            
            chuck: [
                {
                    text: "Chuck Norris doesn't use web standards as the web will conform to him.",
                    reaction: "🌐 *Web legend!*"
                },
                {
                    text: "Chuck Norris can divide by zero.",
                    reaction: "➗ *Mathematics bows down!*"
                },
                {
                    text: "Chuck Norris doesn't need to type cast. The values change type out of fear.",
                    reaction: "💪 *Programming power!*"
                },
                {
                    text: "Chuck Norris's keyboard doesn't have a Ctrl key because nothing controls Chuck Norris.",
                    reaction: "⌨️ *Ultimate control!*"
                }
            ],
            
            pun: [
                {
                    text: "I used to be a banker, but I lost interest.",
                    reaction: "💰 *Financial humor!*"
                },
                {
                    text: "Time flies like an arrow. Fruit flies like a banana.",
                    reaction: "🍌 *Word play master!*"
                },
                {
                    text: "I'm terrified of elevators, so I'll start taking steps to avoid them.",
                    reaction: "🏗️ *Step by step!*"
                },
                {
                    text: "The graveyard is so crowded, people are dying to get in!",
                    reaction: "⚰️ *Dark humor!*"
                }
            ],
            
            oneliner: [
                {
                    text: "I told my wife she was drawing her eyebrows too high. She looked surprised.",
                    reaction: "😮 *Surprisingly funny!*"
                },
                {
                    text: "I haven't slept for ten days... because that would be too long.",
                    reaction: "😴 *Sleep logic!*"
                },
                {
                    text: "I used to think I was indecisive, but now I'm not sure.",
                    reaction: "🤔 *Decisively indecisive!*"
                },
                {
                    text: "My math teacher called me average. How mean!",
                    reaction: "📊 *Statistically funny!*"
                }
            ],
            
            random: [
                {
                    text: "Why don't aliens ever land at airports? Because they're looking for space!",
                    reaction: "🛸 *Out of this world!*"
                },
                {
                    text: "What do you call a fake noodle? An impasta!",
                    reaction: "🍝 *Pasta la vista!*"
                },
                {
                    text: "Why did the coffee file a police report? It got mugged!",
                    reaction: "☕ *Criminal coffee!*"
                },
                {
                    text: "What's the best thing about Switzerland? I don't know, but the flag is a big plus.",
                    reaction: "🇨🇭 *Positive thinking!*"
                }
            ]
        };
    }
};
