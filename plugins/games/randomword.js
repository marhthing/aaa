/**
 * Random Word Game Plugin - Guess the random word
 */

module.exports = {
    name: 'randomword',
    description: 'Guess the randomly generated word game',
    version: '1.0.0',
    command: ['rw', 'randomword', 'wordguess'],
    category: 'games',
    usage: '<start/guess> [letter/word]',
    fromMe: false,
    type: 'whatsapp',
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
                    
                case 'guess':
                    const guess = args[1];
                    await this.makeGuess(message, guess, bot);
                    break;
                    
                case 'hint':
                    await this.getHint(message, bot);
                    break;
                    
                case 'status':
                    await this.getGameStatus(message, bot);
                    break;
                    
                case 'quit':
                case 'end':
                    await this.quitGame(message, bot);
                    break;
                    
                default:
                    // Check if it's a direct guess
                    if (this.isValidGuess(action)) {
                        await this.makeGuess(message, action, bot);
                    } else {
                        await message.reply(`❓ Unknown action: ${action}\n\nUse ${bot.config.PREFIX}rw for help.`);
                    }
            }
            
        } catch (error) {
            await message.reply('❌ Random word game command failed.');
            throw error;
        }
    },
    
    /**
     * Show game menu and instructions
     */
    async showGameMenu(message, bot) {
        const prefix = bot.config.PREFIX;
        
        let gameText = `🎯 *Random Word Game*\n\n`;
        gameText += `🎮 **How to Play:**\n`;
        gameText += `1. Start a game: ${prefix}rw start\n`;
        gameText += `2. Guess letters: ${prefix}rw guess <letter>\n`;
        gameText += `3. Or guess the word: ${prefix}rw guess <word>\n`;
        gameText += `4. Get hints: ${prefix}rw hint\n\n`;
        
        gameText += `🏆 **Rules:**\n`;
        gameText += `• You have 6 wrong guesses maximum\n`;
        gameText += `• Guess letters one by one or the entire word\n`;
        gameText += `• Each wrong guess costs you a life\n`;
        gameText += `• Hints are available but cost a life\n`;
        gameText += `• Win by guessing the complete word\n\n`;
        
        gameText += `📊 **Scoring:**\n`;
        gameText += `• Base score: Word length × 10\n`;
        gameText += `• Bonus: Remaining lives × 5\n`;
        gameText += `• Penalty: -5 per hint used\n\n`;
        
        gameText += `🎪 **Commands:**\n`;
        gameText += `• ${prefix}rw start - Start new game\n`;
        gameText += `• ${prefix}rw guess <letter/word> - Make a guess\n`;
        gameText += `• ${prefix}rw <letter/word> - Quick guess\n`;
        gameText += `• ${prefix}rw hint - Get a hint (-1 life)\n`;
        gameText += `• ${prefix}rw status - Check game status\n`;
        gameText += `• ${prefix}rw quit - Quit current game\n\n`;
        
        // Check if there's an active game
        const activeGame = this.getActiveGame(message.from, bot);
        if (activeGame) {
            gameText += `🎮 **Active Game!**\n`;
            gameText += `Player: @${activeGame.players[0].split('@')[0]}\n`;
            gameText += `Lives: ${6 - activeGame.boardState.wrongGuesses}/6\n`;
            gameText += this.formatWordDisplay(activeGame.boardState);
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
                await message.reply(`🎮 You already have an active game!\n\n${this.formatGameStatus(existingGame)}\n\nUse \`rw quit\` to end it first.`);
                return;
            }
            
            // Create new game
            if (!bot.gameHandler) {
                await message.reply('❌ Game system not available.');
                return;
            }
            
            const gameSettings = {
                maxPlayers: 1,
                minPlayers: 1,
                turnTimeout: 300, // 5 minutes
                maxWrongGuesses: 6
            };
            
            const gameSession = await bot.gameHandler.createGame('randomword', message.from, message.sender, gameSettings);
            
            // Auto-start since it's single player
            await bot.gameHandler.startGame(gameSession.id);
            
            const updatedGame = bot.gameHandler.activeSessions.get(gameSession.id);
            
            let gameText = `🎯 *Random Word Game Started!*\n\n`;
            gameText += `🎮 **Player:** @${message.sender.split('@')[0]}\n`;
            gameText += `❤️ **Lives:** 6\n`;
            gameText += `🎪 **Category:** ${updatedGame.boardState.category}\n\n`;
            gameText += this.formatWordDisplay(updatedGame.boardState);
            gameText += `\n\n💡 Guess a letter with: \`rw <letter>\`\n`;
            gameText += `🔮 Get a hint with: \`rw hint\` (costs 1 life)`;
            
            await message.reply({
                text: gameText,
                mentions: [message.sender]
            });
            
        } catch (error) {
            await message.reply('❌ Failed to start game: ' + error.message);
        }
    },
    
    /**
     * Make a guess (letter or word)
     */
    async makeGuess(message, guess, bot) {
        try {
            if (!guess) {
                await message.reply('❓ Please provide a letter or word to guess.\n\nUsage: `rw guess <letter/word>`');
                return;
            }
            
            const activeGame = this.getActiveGame(message.from, bot);
            
            if (!activeGame) {
                await message.reply('❓ No active game found.\n\nStart one with: `rw start`');
                return;
            }
            
            if (activeGame.state !== 'active') {
                await message.reply('🎮 Game is not active.');
                return;
            }
            
            if (!activeGame.players.includes(message.sender)) {
                await message.reply('🚫 This is not your game!');
                return;
            }
            
            const cleanGuess = guess.toLowerCase().trim();
            
            // Validate guess
            if (!this.isValidGuess(cleanGuess)) {
                await message.reply('❌ Invalid guess. Please enter a single letter or a complete word (letters only).');
                return;
            }
            
            // Process the guess
            const result = await bot.gameHandler.processMove(activeGame.id, message.sender, cleanGuess);
            
            if (result.gameResult && result.gameResult.ended) {
                // Game ended
                await this.sendGameResult(message, result.game, result.gameResult, bot);
            } else {
                // Game continues
                await this.sendGuessResult(message, result.game, result.result, bot);
            }
            
        } catch (error) {
            await message.reply('❌ Guess failed: ' + error.message);
        }
    },
    
    /**
     * Get a hint
     */
    async getHint(message, bot) {
        try {
            const activeGame = this.getActiveGame(message.from, bot);
            
            if (!activeGame) {
                await message.reply('❓ No active game found.');
                return;
            }
            
            if (!activeGame.players.includes(message.sender)) {
                await message.reply('🚫 This is not your game!');
                return;
            }
            
            if (activeGame.boardState.wrongGuesses >= activeGame.settings.maxWrongGuesses - 1) {
                await message.reply('❌ Cannot use hint - you only have 1 life remaining!');
                return;
            }
            
            // Add wrong guess for using hint
            activeGame.boardState.wrongGuesses++;
            activeGame.boardState.hintsUsed = (activeGame.boardState.hintsUsed || 0) + 1;
            
            // Generate hint
            const hint = this.generateHint(activeGame.boardState);
            
            let hintText = `💡 *Hint Used* (-1 life)\n\n`;
            hintText += `🔮 **Hint:** ${hint}\n`;
            hintText += `❤️ **Lives Remaining:** ${activeGame.settings.maxWrongGuesses - activeGame.boardState.wrongGuesses}\n\n`;
            hintText += this.formatWordDisplay(activeGame.boardState);
            
            // Update game in database
            await bot.gameHandler.updateGameInDatabase(activeGame);
            
            await message.reply(hintText);
            
        } catch (error) {
            await message.reply('❌ Failed to get hint.');
        }
    },
    
    /**
     * Get current game status
     */
    async getGameStatus(message, bot) {
        const activeGame = this.getActiveGame(message.from, bot);
        
        if (!activeGame) {
            await message.reply('❓ No active game found.');
            return;
        }
        
        const statusText = this.formatGameStatus(activeGame);
        await message.reply(statusText);
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
                await message.reply('🚫 You can only quit your own games.');
                return;
            }
            
            // Reveal the word before ending
            const word = activeGame.boardState.word.toUpperCase();
            await message.reply(`🏃 Game ended.\n\n🔤 **The word was:** ${word}\n\nBetter luck next time! 🎮`);
            
            // End the game
            await bot.gameHandler.endGame(activeGame.id, { 
                reason: 'quit',
                quitter: message.sender 
            });
            
        } catch (error) {
            await message.reply('❌ Failed to quit game.');
        }
    },
    
    /**
     * Get active game for user
     */
    getActiveGame(chatId, bot) {
        if (!bot.gameHandler) return null;
        
        // For random word, check if user has active game in any chat
        for (const game of bot.gameHandler.activeSessions.values()) {
            if (game.type === 'randomword' && game.chatId === chatId && game.state === 'active') {
                return game;
            }
        }
        return null;
    },
    
    /**
     * Validate guess input
     */
    isValidGuess(guess) {
        return /^[a-z]+$/.test(guess) && (guess.length === 1 || guess.length >= 3);
    },
    
    /**
     * Generate word list for random selection
     */
    getRandomWord() {
        const wordCategories = {
            animals: ['elephant', 'giraffe', 'penguin', 'dolphin', 'butterfly', 'kangaroo', 'cheetah', 'octopus'],
            technology: ['computer', 'internet', 'software', 'algorithm', 'database', 'programming', 'artificial', 'digital'],
            nature: ['mountain', 'rainbow', 'thunder', 'lightning', 'sunrise', 'waterfall', 'volcano', 'glacier'],
            food: ['chocolate', 'sandwich', 'pizza', 'hamburger', 'spaghetti', 'strawberry', 'pineapple', 'avocado'],
            sports: ['football', 'basketball', 'swimming', 'tennis', 'baseball', 'volleyball', 'badminton', 'cricket'],
            science: ['chemistry', 'physics', 'biology', 'astronomy', 'geology', 'mathematics', 'laboratory', 'experiment']
        };
        
        const categories = Object.keys(wordCategories);
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        const words = wordCategories[randomCategory];
        const randomWord = words[Math.floor(Math.random() * words.length)];
        
        return {
            word: randomWord,
            category: randomCategory.charAt(0).toUpperCase() + randomCategory.slice(1)
        };
    },
    
    /**
     * Generate hint based on current game state
     */
    generateHint(boardState) {
        const word = boardState.word;
        const guessedLetters = boardState.guesses || [];
        
        const hints = [
            `The word has ${word.length} letters.`,
            `The word starts with "${word[0].toUpperCase()}".`,
            `The word ends with "${word[word.length - 1].toUpperCase()}".`,
            `The word contains the letter "${word[Math.floor(word.length / 2)].toUpperCase()}".`,
            `Category: ${boardState.category}`
        ];
        
        // Filter out hints that might reveal too much
        const availableHints = hints.filter(hint => {
            // Add logic to prevent giving away too much
            return true;
        });
        
        return availableHints[Math.floor(Math.random() * availableHints.length)];
    },
    
    /**
     * Format word display with guessed letters
     */
    formatWordDisplay(boardState) {
        const word = boardState.word;
        const guessedWord = boardState.guessedWord || Array(word.length).fill('_');
        
        let display = `🔤 **Word:** ${guessedWord.join(' ')}\n`;
        
        if (boardState.guesses && boardState.guesses.length > 0) {
            const correctGuesses = boardState.guesses.filter(letter => word.includes(letter));
            const wrongGuesses = boardState.guesses.filter(letter => !word.includes(letter));
            
            if (correctGuesses.length > 0) {
                display += `✅ **Correct:** ${correctGuesses.join(', ').toUpperCase()}\n`;
            }
            
            if (wrongGuesses.length > 0) {
                display += `❌ **Wrong:** ${wrongGuesses.join(', ').toUpperCase()}\n`;
            }
        }
        
        const livesRemaining = 6 - (boardState.wrongGuesses || 0);
        const heartsDisplay = '❤️'.repeat(livesRemaining) + '💔'.repeat(boardState.wrongGuesses || 0);
        display += `❤️ **Lives:** ${heartsDisplay} (${livesRemaining}/6)`;
        
        return display;
    },
    
    /**
     * Format complete game status
     */
    formatGameStatus(game) {
        let statusText = `🎯 *Random Word Game Status*\n\n`;
        statusText += `🎮 **Player:** @${game.players[0].split('@')[0]}\n`;
        statusText += `📊 **State:** ${game.state}\n`;
        statusText += `🎪 **Category:** ${game.boardState.category}\n\n`;
        statusText += this.formatWordDisplay(game.boardState);
        
        if (game.boardState.hintsUsed) {
            statusText += `\n💡 **Hints Used:** ${game.boardState.hintsUsed}`;
        }
        
        return statusText;
    },
    
    /**
     * Send guess result
     */
    async sendGuessResult(message, game, result, bot) {
        const { letter, correct, guessedWord, wrongGuesses } = result;
        
        let resultText = correct ? '✅ *Good Guess!*\n\n' : '❌ *Wrong Guess!*\n\n';
        
        if (letter.length === 1) {
            resultText += `🔤 **Letter:** ${letter.toUpperCase()}\n`;
            if (correct) {
                const count = game.boardState.word.split(letter).length - 1;
                resultText += `📊 **Found:** ${count} time${count > 1 ? 's' : ''}\n`;
            }
        } else {
            resultText += `📝 **Word Guess:** ${letter.toUpperCase()}\n`;
        }
        
        resultText += `\n${this.formatWordDisplay(game.boardState)}\n`;
        
        const livesRemaining = game.settings.maxWrongGuesses - wrongGuesses;
        if (livesRemaining <= 2 && livesRemaining > 0) {
            resultText += `\n⚠️ **Warning:** Only ${livesRemaining} ${livesRemaining === 1 ? 'life' : 'lives'} remaining!`;
        }
        
        resultText += `\n\n💡 Keep guessing! Type a letter or the complete word.`;
        
        await message.reply(resultText);
    },
    
    /**
     * Send game result
     */
    async sendGameResult(message, game, gameResult, bot) {
        const word = game.boardState.word.toUpperCase();
        
        let resultText = gameResult.winner ? '🎊 *You Won!*\n\n' : '💔 *Game Over!*\n\n';
        
        resultText += `🔤 **The word was:** ${word}\n`;
        resultText += `🎪 **Category:** ${game.boardState.category}\n`;
        
        if (gameResult.winner) {
            const livesRemaining = game.settings.maxWrongGuesses - game.boardState.wrongGuesses;
            const baseScore = word.length * 10;
            const lifeBonus = livesRemaining * 5;
            const hintPenalty = (game.boardState.hintsUsed || 0) * 5;
            const finalScore = baseScore + lifeBonus - hintPenalty;
            
            resultText += `\n🏆 **Final Score:** ${finalScore}\n`;
            resultText += `📊 **Breakdown:**\n`;
            resultText += `• Base score: ${baseScore} (${word.length} letters × 10)\n`;
            resultText += `• Life bonus: +${lifeBonus} (${livesRemaining} lives × 5)\n`;
            
            if (hintPenalty > 0) {
                resultText += `• Hint penalty: -${hintPenalty} (${game.boardState.hintsUsed} hints × 5)\n`;
            }
        }
        
        // Game statistics
        const totalGuesses = game.boardState.guesses ? game.boardState.guesses.length : 0;
        const correctGuesses = game.boardState.guesses ? 
            game.boardState.guesses.filter(letter => game.boardState.word.includes(letter)).length : 0;
        
        resultText += `\n📈 **Game Stats:**\n`;
        resultText += `• Total guesses: ${totalGuesses}\n`;
        resultText += `• Correct guesses: ${correctGuesses}\n`;
        resultText += `• Wrong guesses: ${game.boardState.wrongGuesses}\n`;
        
        if (game.boardState.hintsUsed) {
            resultText += `• Hints used: ${game.boardState.hintsUsed}\n`;
        }
        
        const duration = new Date(game.endedAt) - new Date(game.startedAt);
        const durationMinutes = Math.floor(duration / 60000);
        const durationSeconds = Math.floor((duration % 60000) / 1000);
        
        resultText += `• Duration: ${durationMinutes}m ${durationSeconds}s\n`;
        
        resultText += `\n🎮 Play again with: \`rw start\``;
        
        await message.reply(resultText);
    }
};
