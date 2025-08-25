/**
 * Tic-Tac-Toe Game Plugin
 */

module.exports = {
    name: 'tictactoe',
    description: 'Play Tic-Tac-Toe game with another player',
    version: '1.0.0',
    command: ['ttt', 'tictactoe', 'xo'],
    category: 'games',
    usage: '<start/join/move> [position]',
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
                    
                case 'move':
                case 'play':
                    const position = parseInt(args[1]);
                    await this.makeMove(message, position, bot);
                    break;
                    
                case 'status':
                    await this.getGameStatus(message, bot);
                    break;
                    
                case 'quit':
                case 'end':
                    await this.quitGame(message, bot);
                    break;
                    
                default:
                    // Check if it's a direct position move
                    const directPosition = parseInt(action);
                    if (directPosition >= 1 && directPosition <= 9) {
                        await this.makeMove(message, directPosition, bot);
                    } else {
                        await message.reply(`❓ Unknown action: ${action}\n\nUse ${bot.config.PREFIX}ttt for help.`);
                    }
            }
            
        } catch (error) {
            await message.reply('❌ Tic-Tac-Toe command failed.');
            throw error;
        }
    },
    
    /**
     * Show game menu and instructions
     */
    async showGameMenu(message, bot) {
        const prefix = bot.config.PREFIX;
        
        let gameText = `🎯 *Tic-Tac-Toe Game*\n\n`;
        gameText += `🎮 **How to Play:**\n`;
        gameText += `1. Start a game: ${prefix}ttt start\n`;
        gameText += `2. Another player joins: ${prefix}ttt join\n`;
        gameText += `3. Make moves: ${prefix}ttt move <1-9>\n`;
        gameText += `4. Or simply: ${prefix}ttt <1-9>\n\n`;
        
        gameText += `📋 **Board Positions:**\n`;
        gameText += `\`\`\`\n`;
        gameText += `1️⃣ 2️⃣ 3️⃣\n`;
        gameText += `4️⃣ 5️⃣ 6️⃣\n`;
        gameText += `7️⃣ 8️⃣ 9️⃣\n`;
        gameText += `\`\`\`\n\n`;
        
        gameText += `🏆 **Rules:**\n`;
        gameText += `• Get 3 in a row (horizontal, vertical, or diagonal)\n`;
        gameText += `• First player uses ❌, second player uses ⭕\n`;
        gameText += `• Take turns making moves\n`;
        gameText += `• Game ends when someone wins or it's a draw\n\n`;
        
        gameText += `🎪 **Commands:**\n`;
        gameText += `• ${prefix}ttt start - Start new game\n`;
        gameText += `• ${prefix}ttt join - Join existing game\n`;
        gameText += `• ${prefix}ttt status - Check game status\n`;
        gameText += `• ${prefix}ttt quit - Quit current game\n\n`;
        
        // Check if there's an active game
        const activeGame = this.getActiveGame(message.from, bot);
        if (activeGame) {
            gameText += `🎮 **Active Game in this group!**\n`;
            gameText += `Players: ${activeGame.players.map(p => '@' + p.split('@')[0]).join(' vs ')}\n`;
            gameText += `Turn: @${activeGame.players[activeGame.currentPlayer].split('@')[0]}\n\n`;
            gameText += this.formatBoard(activeGame.boardState);
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
                await message.reply(`🎮 There's already an active game in this group!\n\nPlayers: ${existingGame.players.map(p => '@' + p.split('@')[0]).join(' vs ')}\n\nUse \`ttt quit\` to end it or \`ttt join\` to join.`);
                return;
            }
            
            // Create new game using game handler
            if (!bot.gameHandler) {
                await message.reply('❌ Game system not available.');
                return;
            }
            
            const gameSession = await bot.gameHandler.createGame('tictactoe', message.from, message.sender);
            
            await message.reply({
                text: `🎯 *Tic-Tac-Toe Started!*\n\n🎮 **Creator:** @${message.sender.split('@')[0]}\n⏳ **Waiting for second player...**\n\nAnother player can join by typing: \`ttt join\`\n\n${this.formatBoard(gameSession.boardState)}`,
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
                await message.reply(`❓ No active game in this group.\n\nStart one with: \`ttt start\``);
                return;
            }
            
            if (activeGame.players.includes(message.sender)) {
                await message.reply('🎮 You are already in this game!');
                return;
            }
            
            if (activeGame.state !== 'waiting') {
                await message.reply('🎮 This game is already in progress or ended.');
                return;
            }
            
            // Join the game
            const updatedGame = await bot.gameHandler.joinGame(activeGame.id, message.sender);
            
            if (updatedGame.state === 'active') {
                const gameText = `🎯 *Game Started!*\n\n`;
                gameText += `👥 **Players:**\n`;
                gameText += `❌ @${updatedGame.players[0].split('@')[0]}\n`;
                gameText += `⭕ @${updatedGame.players[1].split('@')[0]}\n\n`;
                gameText += `🎮 **Turn:** @${updatedGame.players[updatedGame.currentPlayer].split('@')[0]}\n\n`;
                gameText += this.formatBoard(updatedGame.boardState);
                gameText += `\n💡 Make a move by typing: \`ttt <1-9>\``;
                
                await message.reply({
                    text: gameText,
                    mentions: updatedGame.players
                });
            }
            
        } catch (error) {
            await message.reply('❌ Failed to join game: ' + error.message);
        }
    },
    
    /**
     * Make a move
     */
    async makeMove(message, position, bot) {
        try {
            if (!position || position < 1 || position > 9) {
                await message.reply('❓ Please provide a valid position (1-9).\n\nUse `ttt <1-9>` to make a move.');
                return;
            }
            
            const activeGame = this.getActiveGame(message.from, bot);
            
            if (!activeGame) {
                await message.reply('❓ No active game in this group.\n\nStart one with: `ttt start`');
                return;
            }
            
            if (activeGame.state !== 'active') {
                await message.reply('🎮 Game is not active. Current state: ' + activeGame.state);
                return;
            }
            
            if (!activeGame.players.includes(message.sender)) {
                await message.reply('🚫 You are not a player in this game!');
                return;
            }
            
            // Process the move
            const result = await bot.gameHandler.processMove(activeGame.id, message.sender, position.toString());
            
            if (result.gameResult && result.gameResult.ended) {
                // Game ended
                await this.sendGameResult(message, result.game, result.gameResult, bot);
            } else {
                // Game continues
                await this.sendGameUpdate(message, result.game, bot);
            }
            
        } catch (error) {
            await message.reply('❌ Move failed: ' + error.message);
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
        
        let statusText = `🎯 *Tic-Tac-Toe Status*\n\n`;
        statusText += `🎮 **State:** ${activeGame.state}\n`;
        
        if (activeGame.players.length > 0) {
            statusText += `👥 **Players:**\n`;
            activeGame.players.forEach((player, index) => {
                const symbol = activeGame.boardState.symbols[index];
                const isCurrent = index === activeGame.currentPlayer;
                statusText += `${symbol} @${player.split('@')[0]}${isCurrent ? ' (current turn)' : ''}\n`;
            });
        }
        
        if (activeGame.state === 'active') {
            statusText += `\n${this.formatBoard(activeGame.boardState)}`;
            statusText += `\n💡 Make a move: \`ttt <1-9>\``;
        }
        
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
                await message.reply('🚫 You can only quit games you are playing in.');
                return;
            }
            
            // End the game
            await bot.gameHandler.endGame(activeGame.id, { 
                reason: 'quit',
                quitter: message.sender 
            });
            
            await message.reply(`🏃 Game ended by @${message.sender.split('@')[0]}.`);
            
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
     * Format the game board for display
     */
    formatBoard(boardState) {
        const board = boardState.board;
        const positions = boardState.positions;
        
        let boardText = `📋 **Game Board:**\n\`\`\`\n`;
        
        for (let i = 0; i < 9; i += 3) {
            const row = board.slice(i, i + 3)
                .map((cell, index) => cell || positions[i + index])
                .join(' ');
            boardText += row + '\n';
        }
        
        boardText += `\`\`\``;
        return boardText;
    },
    
    /**
     * Send game update
     */
    async sendGameUpdate(message, game, bot) {
        const currentPlayerJid = game.players[game.currentPlayer];
        
        let updateText = `🎯 *Move Made!*\n\n`;
        updateText += `🎮 **Turn:** @${currentPlayerJid.split('@')[0]}\n\n`;
        updateText += this.formatBoard(game.boardState);
        updateText += `\n💡 Make your move: \`ttt <1-9>\``;
        
        await message.reply({
            text: updateText,
            mentions: [currentPlayerJid]
        });
    },
    
    /**
     * Send game result
     */
    async sendGameResult(message, game, gameResult, bot) {
        let resultText = `🎊 *Game Over!*\n\n`;
        
        if (gameResult.winner) {
            resultText += `🏆 **Winner:** @${gameResult.winner.split('@')[0]}\n`;
        } else {
            resultText += `🤝 **Result:** It's a draw!\n`;
        }
        
        resultText += `\n${this.formatBoard(game.boardState)}\n`;
        
        // Add game statistics
        const moveCount = game.moves.length;
        const duration = new Date(game.endedAt) - new Date(game.startedAt);
        const durationMinutes = Math.floor(duration / 60000);
        
        resultText += `\n📊 **Game Stats:**\n`;
        resultText += `• Moves: ${moveCount}\n`;
        resultText += `• Duration: ${durationMinutes}m\n`;
        resultText += `• Players: ${game.players.map(p => '@' + p.split('@')[0]).join(', ')}\n\n`;
        
        resultText += `🎮 Start a new game with: \`ttt start\``;
        
        await message.reply({
            text: resultText,
            mentions: game.players
        });
    }
};
