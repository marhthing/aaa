/**
 * Word Chain Game Plugin
 */

module.exports = {
    name: 'wordchain',
    description: 'Play word chain game where each word must start with the last letter of the previous word',
    version: '1.0.0',
    command: ['wc', 'wordchain', 'chain'],
    category: 'games',
    usage: '<start/join/word> [word]',
    fromMe: false,
    type: 'whatsapp',
    groupOnly: true,
    cooldown: 3,
    
    async function(message, match, bot) {
        try {
            const args = match ? match.trim().split(' ') : [];
            const action = args[0]?.toLowerCase();
            
            if (!action) {
                await this.showGameMenu(message, bot);
                return;
            }
            
            switch (action) {
                case 'start':
                case 'create':
                    await this.startGame(message, bot);
                    break;
                    
                case 'join':
                    await this.joinGame(message, bot);
                    break;
                    
                case 'word':
                    const word = args[1];
                    await this.submitWord(message, word, bot);
                    break;
                    
                case 'status':
                    await this.getGameStatus(message, bot);
                    break;
                    
                case 'quit':
                case 'end':
                    await this.quitGame(message, bot);
                    break;
                    
                case 'scores':
                    await this.showScores(message, bot);
                    break;
                    
                default:
                    // Check if it's a word submission
                    if (this.isValidWord(action)) {
                        await this.submitWord(message, action, bot);
                    } else {
                        await message.reply(`❓ Unknown action: ${action}\n\nUse ${bot.config.PREFIX}wc for help.`);
                    }
            }
            
        } catch (error) {
            await message.reply('❌ Word chain command failed.');
            throw error;
        }
    },
    
    /**
     * Show game menu and instructions
     */
    async showGameMenu(message, bot) {
        const prefix = bot.config.PREFIX;
        
        let gameText = `🔗 *Word Chain Game*\n\n`;
        gameText += `🎮 **How to Play:**\n`;
        gameText += `1. Start a game: ${prefix}wc start\n`;
        gameText += `2. Players join: ${prefix}wc join\n`;
        gameText += `3. Submit words: ${prefix}wc <word>\n`;
        gameText += `4. Each word must start with the last letter of the previous word\n\n`;
        
        gameText += `🏆 **Rules:**\n`;
        gameText += `• Minimum word length: 3 letters\n`;
        gameText += `• No repeated words\n`;
        gameText += `• Real English words only\n`;
        gameText += `• Score = word length\n`;
        gameText += `• Take turns in order\n\n`;
        
        gameText += `📝 **Example Chain:**\n`;
        gameText += `CAT → TREE → ELEPHANT → TABLE → EASY\n\n`;
        
        gameText += `🎪 **Commands:**\n`;
        gameText += `• ${prefix}wc start - Start new game\n`;
        gameText += `• ${prefix}wc join - Join existing game\n`;
        gameText += `• ${prefix}wc <word> - Submit a word\n`;
        gameText += `• ${prefix}wc status - Check game status\n`;
        gameText += `• ${prefix}wc scores - View current scores\n`;
        gameText += `• ${prefix}wc quit - Quit current game\n\n`;
        
        // Check if there's an active game
        const activeGame = this.getActiveGame(message.from, bot);
        if (activeGame) {
            gameText += `🎮 **Active Game in this group!**\n`;
            gameText += `Players: ${activeGame.players.length}\n`;
            gameText += `Chain length: ${activeGame.boardState.chain.length}\n`;
            
            if (activeGame.boardState.currentWord) {
                const lastLetter = activeGame.boardState.currentWord.slice(-1).toUpperCase();
                gameText += `Next word must start with: **${lastLetter}**\n`;
            }
            
            if (activeGame.state === 'active') {
                const currentPlayer = activeGame.players[activeGame.currentPlayer];
                gameText += `Turn: @${currentPlayer.split('@')[0]}`;
            }
        }
        
        await message.reply(gameText);
    },
    
    /**
     * Start a new game
     */
    async startGame(message, bot) {
        try {
            // Check if there's already an active game
            const existingGame = this.getActiveGame(message.from, bot);
            if (existingGame) {
                await message.reply(`🎮 There's already an active game in this group!\n\nUse \`wc join\` to join or \`wc quit\` to end it.`);
                return;
            }
            
            // Create new game
            if (!bot.gameHandler) {
                await message.reply('❌ Game system not available.');
                return;
            }
            
            const gameSettings = {
                maxPlayers: 10,
                minPlayers: 2,
                turnTimeout: 60,
                minWordLength: 3
            };
            
            const gameSession = await bot.gameHandler.createGame('wordchain', message.from, message.sender, gameSettings);
            
            await message.reply({
                text: `🔗 *Word Chain Started!*\n\n🎮 **Creator:** @${message.sender.split('@')[0]}\n⏳ **Waiting for more players...**\n\nOthers can join by typing: \`wc join\`\n\n📋 **Settings:**\n• Min players: ${gameSettings.minPlayers}\n• Max players: ${gameSettings.maxPlayers}\n• Min word length: ${gameSettings.minWordLength}\n• Turn timeout: ${gameSettings.turnTimeout}s`,
                mentions: [message.sender]
            });
            
        } catch (error) {
            await message.reply('❌ Failed to start game: ' + error.message);
        }
    },
    
    /**
     * Join an existing game
     */
    async joinGame(message, bot) {
        try {
            const activeGame = this.getActiveGame(message.from, bot);
            
            if (!activeGame) {
                await message.reply(`❓ No active game in this group.\n\nStart one with: \`wc start\``);
                return;
            }
            
            if (activeGame.players.includes(message.sender)) {
                await message.reply('🎮 You are already in this game!');
                return;
            }
            
            // Join the game
            const updatedGame = await bot.gameHandler.joinGame(activeGame.id, message.sender);
            
            let joinText = `✅ @${message.sender.split('@')[0]} joined the game!\n\n`;
            joinText += `👥 **Players (${updatedGame.players.length}):**\n`;
            updatedGame.players.forEach((player, index) => {
                joinText += `${index + 1}. @${player.split('@')[0]}\n`;
            });
            
            if (updatedGame.state === 'active') {
                joinText += `\n🎮 **Game Started!**\n`;
                joinText += `Turn: @${updatedGame.players[updatedGame.currentPlayer].split('@')[0]}\n`;
                joinText += `💡 Submit your first word to start the chain!`;
            } else {
                joinText += `\n⏳ Waiting for more players or game start...`;
            }
            
            await message.reply({
                text: joinText,
                mentions: updatedGame.players
            });
            
        } catch (error) {
            await message.reply('❌ Failed to join game: ' + error.message);
        }
    },
    
    /**
     * Submit a word to the chain
     */
    async submitWord(message, word, bot) {
        try {
            if (!word) {
                await message.reply('❓ Please provide a word.\n\nUsage: `wc <word>`');
                return;
            }
            
            const activeGame = this.getActiveGame(message.from, bot);
            
            if (!activeGame) {
                await message.reply('❓ No active game in this group.\n\nStart one with: `wc start`');
                return;
            }
            
            if (activeGame.state !== 'active') {
                await message.reply('🎮 Game is not active. Use `wc join` to join or `wc start` to start.');
                return;
            }
            
            if (!activeGame.players.includes(message.sender)) {
                await message.reply('🚫 You are not a player in this game!\n\nUse `wc join` to join.');
                return;
            }
            
            // Validate word
            const validation = this.validateWord(word, activeGame);
            if (!validation.valid) {
                await message.reply(`❌ Invalid word: ${validation.reason}`);
                return;
            }
            
            // Process the move
            const result = await bot.gameHandler.processMove(activeGame.id, message.sender, word.toLowerCase());
            
            // Send update
            await this.sendWordUpdate(message, result.game, result.result, bot);
            
        } catch (error) {
            await message.reply('❌ Failed to submit word: ' + error.message);
        }
    },
    
    /**
     * Get current game status
     */
    async getGameStatus(message, bot) {
        const activeGame = this.getActiveGame(message.from, bot);
        
        if (!activeGame) {
            await message.reply('❓ No active game in this group.');
            return;
        }
        
        let statusText = `🔗 *Word Chain Status*\n\n`;
        statusText += `🎮 **State:** ${activeGame.state}\n`;
        statusText += `👥 **Players:** ${activeGame.players.length}\n`;
        
        if (activeGame.state === 'active') {
            const currentPlayer = activeGame.players[activeGame.currentPlayer];
            statusText += `🎯 **Current Turn:** @${currentPlayer.split('@')[0]}\n`;
            
            if (activeGame.boardState.chain.length > 0) {
                statusText += `🔗 **Chain Length:** ${activeGame.boardState.chain.length}\n`;
                
                // Show recent words
                const recentWords = activeGame.boardState.chain.slice(-5);
                statusText += `\n📝 **Recent Words:**\n`;
                recentWords.forEach(entry => {
                    statusText += `• ${entry.word.toUpperCase()} (${entry.player.split('@')[0]})\n`;
                });
                
                if (activeGame.boardState.currentWord) {
                    const lastLetter = activeGame.boardState.currentWord.slice(-1).toUpperCase();
                    statusText += `\n🎯 **Next word must start with:** ${lastLetter}`;
                }
            } else {
                statusText += `\n💡 **Waiting for first word to start the chain!**`;
            }
        }
        
        await message.reply(statusText);
    },
    
    /**
     * Show current scores
     */
    async showScores(message, bot) {
        const activeGame = this.getActiveGame(message.from, bot);
        
        if (!activeGame) {
            await message.reply('❓ No active game in this group.');
            return;
        }
        
        let scoresText = `🏆 *Word Chain Scores*\n\n`;
        
        // Sort players by score
        const playerScores = activeGame.players.map(player => ({
            player,
            score: activeGame.score[player] || 0
        })).sort((a, b) => b.score - a.score);
        
        if (playerScores.every(p => p.score === 0)) {
            scoresText += `🎮 No scores yet! Submit words to earn points.\n\n`;
            scoresText += `💡 **Scoring:** Each word gives points equal to its length.`;
        } else {
            playerScores.forEach((playerScore, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📊';
                scoresText += `${medal} @${playerScore.player.split('@')[0]}: ${playerScore.score} points\n`;
            });
            
            const totalWords = activeGame.boardState.chain.length;
            const totalPoints = playerScores.reduce((sum, p) => sum + p.score, 0);
            
            scoresText += `\n📊 **Game Stats:**\n`;
            scoresText += `• Total words: ${totalWords}\n`;
            scoresText += `• Total points: ${totalPoints}\n`;
            
            if (totalWords > 0) {
                scoresText += `• Average word length: ${(totalPoints / totalWords).toFixed(1)}`;
            }
        }
        
        await message.reply(scoresText);
    },
    
    /**
     * Quit current game
     */
    async quitGame(message, bot) {
        try {
            const activeGame = this.getActiveGame(message.from, bot);
            
            if (!activeGame) {
                await message.reply('❓ No active game to quit.');
                return;
            }
            
            if (!activeGame.players.includes(message.sender) && !message.isSudo) {
                await message.reply('🚫 You can only quit games you are playing in.');
                return;
            }
            
            // Show final scores before ending
            await this.showScores(message, bot);
            
            // End the game
            await bot.gameHandler.endGame(activeGame.id, { 
                reason: 'quit',
                quitter: message.sender 
            });
            
            await message.reply(`🏃 Word chain game ended by @${message.sender.split('@')[0]}.\n\nThanks for playing! 🎮`);
            
        } catch (error) {
            await message.reply('❌ Failed to quit game.');
        }
    },
    
    /**
     * Get active game in chat
     */
    getActiveGame(chatId, bot) {
        if (!bot.gameHandler) return null;
        return bot.gameHandler.getActiveGameInChat(chatId);
    },
    
    /**
     * Validate if text is a valid word
     */
    isValidWord(text) {
        return /^[a-zA-Z]+$/.test(text) && text.length >= 3;
    },
    
    /**
     * Validate word for game rules
     */
    validateWord(word, game) {
        const cleanWord = word.toLowerCase().trim();
        
        // Check length
        if (cleanWord.length < game.settings.minWordLength) {
            return {
                valid: false,
                reason: `Word must be at least ${game.settings.minWordLength} letters long.`
            };
        }
        
        // Check if it's alphabetic
        if (!/^[a-z]+$/.test(cleanWord)) {
            return {
                valid: false,
                reason: 'Word must contain only letters.'
            };
        }
        
        // Check if already used
        if (game.boardState.usedWords.includes(cleanWord)) {
            return {
                valid: false,
                reason: 'Word has already been used in this game.'
            };
        }
        
        // Check chain continuation
        if (game.boardState.currentWord) {
            const lastLetter = game.boardState.currentWord.slice(-1);
            const firstLetter = cleanWord.charAt(0);
            
            if (lastLetter !== firstLetter) {
                return {
                    valid: false,
                    reason: `Word must start with "${lastLetter.toUpperCase()}" (last letter of "${game.boardState.currentWord.toUpperCase()}").`
                };
            }
        }
        
        return { valid: true };
    },
    
    /**
     * Send word update to chat
     */
    async sendWordUpdate(message, game, moveResult, bot) {
        const { word, score } = moveResult;
        
        let updateText = `✅ *Word Accepted!*\n\n`;
        updateText += `🔗 **Word:** ${word.toUpperCase()}\n`;
        updateText += `👤 **Player:** @${message.sender.split('@')[0]}\n`;
        updateText += `⭐ **Points:** +${score}\n`;
        updateText += `📊 **Total Score:** ${game.score[message.sender] || 0}\n\n`;
        
        // Show chain progress
        const chainLength = game.boardState.chain.length;
        updateText += `🔗 **Chain Length:** ${chainLength}\n`;
        
        // Show recent words
        if (chainLength > 1) {
            const recentWords = game.boardState.chain.slice(-3).map(entry => entry.word.toUpperCase());
            updateText += `📝 **Recent:** ${recentWords.join(' → ')}\n`;
        }
        
        // Next turn
        const nextPlayer = game.players[game.currentPlayer];
        const lastLetter = word.slice(-1).toUpperCase();
        
        updateText += `\n🎯 **Next Turn:** @${nextPlayer.split('@')[0]}\n`;
        updateText += `💡 **Next word must start with:** ${lastLetter}`;
        
        await message.reply({
            text: updateText,
            mentions: [message.sender, nextPlayer]
        });
    }
};
