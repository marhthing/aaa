/**
 * MatDev Game Handler
 * Real-time game engine with multi-player support
 */

const logger = require('../utils/logger');
const { GameError } = require('../class/BotError');

class GameHandler {
    constructor(bot) {
        this.bot = bot;
        this.activeSessions = new Map();
        this.gameTypes = ['tictactoe', 'wordchain', 'randomword', 'trivia', 'hangman'];
        
        // Game configurations
        this.gameConfigs = {
            tictactoe: {
                maxPlayers: 2,
                minPlayers: 2,
                turnTimeout: 60,
                boardSize: 3
            },
            wordchain: {
                maxPlayers: 10,
                minPlayers: 2,
                turnTimeout: 30,
                minWordLength: 3
            },
            randomword: {
                maxPlayers: 1,
                minPlayers: 1,
                turnTimeout: 60,
                maxGuesses: 6
            },
            trivia: {
                maxPlayers: 10,
                minPlayers: 1,
                turnTimeout: 30,
                questionsPerRound: 10
            },
            hangman: {
                maxPlayers: 1,
                minPlayers: 1,
                turnTimeout: 120,
                maxWrongGuesses: 6
            }
        };
        
        // Cleanup expired games every 5 minutes
        setInterval(() => this.cleanupExpiredGames(), 5 * 60 * 1000);
        
        logger.info('🎮 Game handler initialized');
    }
    
    /**
     * Create a new game session
     */
    async createGame(gameType, chatId, creatorJid, settings = {}) {
        try {
            if (!this.gameTypes.includes(gameType)) {
                throw new GameError(`Invalid game type: ${gameType}`, gameType);
            }
            
            // Check if there's already an active game in this chat
            const existingGame = this.getActiveGameInChat(chatId);
            if (existingGame) {
                throw new GameError('There is already an active game in this chat', gameType, existingGame.id);
            }
            
            // Generate unique game ID
            const gameId = this.generateGameId();
            
            // Get creator user
            const creator = await this.bot.database.getUser(creatorJid);
            if (!creator) {
                throw new GameError('Creator not found in database', gameType);
            }
            
            // Merge settings with defaults
            const gameSettings = {
                ...this.gameConfigs[gameType],
                ...settings
            };
            
            // Create game session
            const gameSession = {
                id: gameId,
                type: gameType,
                players: [creatorJid],
                state: 'waiting',
                currentPlayer: 0,
                boardState: this.initializeBoardState(gameType),
                settings: gameSettings,
                createdBy: creator.id,
                chatId,
                startedAt: null,
                endedAt: null,
                winner: null,
                score: {},
                moves: [],
                metadata: {
                    lastActivity: new Date(),
                    turnStartTime: null
                }
            };
            
            // Save to database
            await this.bot.database.getModel('GameSession').create(gameSession);
            
            // Store in active sessions
            this.activeSessions.set(gameId, gameSession);
            
            logger.logGame(gameType, gameId, 'created', [creatorJid]);
            
            return gameSession;
            
        } catch (error) {
            logger.error('Create game error:', error);
            throw error;
        }
    }
    
    /**
     * Join an existing game
     */
    async joinGame(gameId, playerJid) {
        try {
            const game = this.activeSessions.get(gameId);
            if (!game) {
                throw new GameError('Game not found', null, gameId);
            }
            
            if (game.state !== 'waiting') {
                throw new GameError('Game is not accepting new players', game.type, gameId);
            }
            
            if (game.players.includes(playerJid)) {
                throw new GameError('You are already in this game', game.type, gameId);
            }
            
            if (game.players.length >= game.settings.maxPlayers) {
                throw new GameError('Game is full', game.type, gameId);
            }
            
            // Add player
            game.players.push(playerJid);
            game.metadata.lastActivity = new Date();
            
            // Start game if enough players
            if (game.players.length >= game.settings.minPlayers) {
                await this.startGame(gameId);
            }
            
            // Update database
            await this.updateGameInDatabase(game);
            
            logger.logGame(game.type, gameId, 'player_joined', [playerJid]);
            
            return game;
            
        } catch (error) {
            logger.error('Join game error:', error);
            throw error;
        }
    }
    
    /**
     * Start a game
     */
    async startGame(gameId) {
        try {
            const game = this.activeSessions.get(gameId);
            if (!game) {
                throw new GameError('Game not found', null, gameId);
            }
            
            if (game.state !== 'waiting') {
                throw new GameError('Game cannot be started', game.type, gameId);
            }
            
            // Initialize game state
            game.state = 'active';
            game.startedAt = new Date();
            game.metadata.lastActivity = new Date();
            game.metadata.turnStartTime = new Date();
            
            // Initialize scores
            for (const player of game.players) {
                game.score[player] = 0;
            }
            
            // Game-specific initialization
            switch (game.type) {
                case 'tictactoe':
                    game.boardState = this.initializeTicTacToeBoard();
                    break;
                case 'wordchain':
                    game.boardState = { currentWord: null, usedWords: [], chain: [] };
                    break;
                case 'randomword':
                    game.boardState = await this.initializeRandomWordGame();
                    break;
                case 'trivia':
                    game.boardState = await this.initializeTriviaGame();
                    break;
                case 'hangman':
                    game.boardState = await this.initializeHangmanGame();
                    break;
            }
            
            // Update database
            await this.updateGameInDatabase(game);
            
            logger.logGame(game.type, gameId, 'started', game.players);
            
            return game;
            
        } catch (error) {
            logger.error('Start game error:', error);
            throw error;
        }
    }
    
    /**
     * Process a game move
     */
    async processMove(gameId, playerJid, move) {
        try {
            const game = this.activeSessions.get(gameId);
            if (!game) {
                throw new GameError('Game not found', null, gameId);
            }
            
            if (game.state !== 'active') {
                throw new GameError('Game is not active', game.type, gameId);
            }
            
            if (!game.players.includes(playerJid)) {
                throw new GameError('You are not in this game', game.type, gameId);
            }
            
            // Check if it's player's turn (for turn-based games)
            if (this.isTurnBased(game.type)) {
                const currentPlayerJid = game.players[game.currentPlayer];
                if (playerJid !== currentPlayerJid) {
                    throw new GameError('It is not your turn', game.type, gameId);
                }
            }
            
            // Validate move
            if (!this.isValidMove(game, move)) {
                throw new GameError('Invalid move', game.type, gameId);
            }
            
            // Process move based on game type
            const result = await this.processGameSpecificMove(game, playerJid, move);
            
            // Record move
            game.moves.push({
                player: playerJid,
                move,
                timestamp: new Date(),
                result
            });
            
            // Update metadata
            game.metadata.lastActivity = new Date();
            
            // Check for game end
            const gameResult = this.checkGameEnd(game);
            if (gameResult.ended) {
                await this.endGame(gameId, gameResult);
            } else {
                // Next turn
                if (this.isTurnBased(game.type)) {
                    this.nextTurn(game);
                }
            }
            
            // Update database
            await this.updateGameInDatabase(game);
            
            logger.logGame(game.type, gameId, 'move_processed', [playerJid], { move, result });
            
            return { game, result, gameResult };
            
        } catch (error) {
            logger.error('Process move error:', error);
            throw error;
        }
    }
    
    /**
     * End a game
     */
    async endGame(gameId, result = {}) {
        try {
            const game = this.activeSessions.get(gameId);
            if (!game) {
                throw new GameError('Game not found', null, gameId);
            }
            
            game.state = 'ended';
            game.endedAt = new Date();
            game.winner = result.winner || null;
            
            // Update player statistics
            await this.updatePlayerStats(game, result);
            
            // Update database
            await this.updateGameInDatabase(game);
            
            // Remove from active sessions
            this.activeSessions.delete(gameId);
            
            logger.logGame(game.type, gameId, 'ended', game.players, result);
            
            return game;
            
        } catch (error) {
            logger.error('End game error:', error);
            throw error;
        }
    }
    
    /**
     * Handle game move from message
     */
    async handleGameMove(message) {
        try {
            if (!message.text || !message.isGroup) return;
            
            const activeGame = this.getActiveGameInChat(message.from);
            if (!activeGame) return;
            
            // Check if message is a game move
            const move = this.parseGameMove(activeGame, message.text);
            if (!move) return;
            
            // Process the move
            const result = await this.processMove(activeGame.id, message.sender, move);
            
            // Send game update to chat
            await this.sendGameUpdate(message.from, result);
            
        } catch (error) {
            if (error instanceof GameError) {
                await message.reply(`🎮 ${error.getUserMessage()}`);
            } else {
                logger.error('Handle game move error:', error);
            }
        }
    }
    
    /**
     * Get active game in chat
     */
    getActiveGameInChat(chatId) {
        for (const game of this.activeSessions.values()) {
            if (game.chatId === chatId && game.state === 'active') {
                return game;
            }
        }
        return null;
    }
    
    /**
     * Initialize board state for game type
     */
    initializeBoardState(gameType) {
        switch (gameType) {
            case 'tictactoe':
                return this.initializeTicTacToeBoard();
            case 'wordchain':
                return { currentWord: null, usedWords: [], chain: [] };
            case 'randomword':
                return { word: null, guesses: [], wrongGuesses: 0 };
            case 'trivia':
                return { currentQuestion: 0, questions: [], answers: {} };
            case 'hangman':
                return { word: null, guessedLetters: [], wrongGuesses: 0 };
            default:
                return {};
        }
    }
    
    /**
     * Initialize Tic-Tac-Toe board
     */
    initializeTicTacToeBoard() {
        return {
            board: Array(9).fill(''),
            symbols: ['❌', '⭕'],
            positions: [
                '1️⃣', '2️⃣', '3️⃣',
                '4️⃣', '5️⃣', '6️⃣',
                '7️⃣', '8️⃣', '9️⃣'
            ]
        };
    }
    
    /**
     * Initialize Random Word game
     */
    async initializeRandomWordGame() {
        const words = [
            'javascript', 'python', 'computer', 'programming', 'algorithm',
            'database', 'network', 'security', 'artificial', 'intelligence',
            'machine', 'learning', 'development', 'software', 'hardware'
        ];
        
        const randomWord = words[Math.floor(Math.random() * words.length)];
        
        return {
            word: randomWord.toLowerCase(),
            guessedWord: Array(randomWord.length).fill('_'),
            guesses: [],
            wrongGuesses: 0,
            hints: []
        };
    }
    
    /**
     * Check if game type is turn-based
     */
    isTurnBased(gameType) {
        return ['tictactoe', 'wordchain'].includes(gameType);
    }
    
    /**
     * Validate move for game
     */
    isValidMove(game, move) {
        switch (game.type) {
            case 'tictactoe':
                const position = parseInt(move);
                return position >= 1 && position <= 9 && game.boardState.board[position - 1] === '';
                
            case 'wordchain':
                return typeof move === 'string' && move.length >= game.settings.minWordLength;
                
            case 'randomword':
            case 'hangman':
                return typeof move === 'string' && move.length === 1 && /[a-z]/i.test(move);
                
            default:
                return true;
        }
    }
    
    /**
     * Process game-specific move
     */
    async processGameSpecificMove(game, playerJid, move) {
        switch (game.type) {
            case 'tictactoe':
                return this.processTicTacToeMove(game, playerJid, move);
                
            case 'wordchain':
                return this.processWordChainMove(game, playerJid, move);
                
            case 'randomword':
            case 'hangman':
                return this.processWordGuessMove(game, playerJid, move);
                
            default:
                return { success: true };
        }
    }
    
    /**
     * Process Tic-Tac-Toe move
     */
    processTicTacToeMove(game, playerJid, move) {
        const position = parseInt(move) - 1;
        const playerIndex = game.players.indexOf(playerJid);
        const symbol = game.boardState.symbols[playerIndex];
        
        game.boardState.board[position] = symbol;
        
        return {
            success: true,
            position,
            symbol,
            board: game.boardState.board
        };
    }
    
    /**
     * Process Word Chain move
     */
    processWordChainMove(game, playerJid, move) {
        const word = move.toLowerCase().trim();
        
        // Check if word was already used
        if (game.boardState.usedWords.includes(word)) {
            throw new GameError('Word already used', game.type, game.id);
        }
        
        // Check if word continues the chain
        if (game.boardState.currentWord) {
            const lastLetter = game.boardState.currentWord.slice(-1);
            const firstLetter = word.charAt(0);
            
            if (lastLetter !== firstLetter) {
                throw new GameError(`Word must start with "${lastLetter}"`, game.type, game.id);
            }
        }
        
        // Add word to chain
        game.boardState.currentWord = word;
        game.boardState.usedWords.push(word);
        game.boardState.chain.push({
            player: playerJid,
            word,
            timestamp: new Date()
        });
        
        // Update score
        game.score[playerJid] = (game.score[playerJid] || 0) + word.length;
        
        return {
            success: true,
            word,
            score: word.length
        };
    }
    
    /**
     * Process word guess move
     */
    processWordGuessMove(game, playerJid, move) {
        const letter = move.toLowerCase();
        const word = game.boardState.word;
        
        // Check if letter already guessed
        if (game.boardState.guesses.includes(letter)) {
            throw new GameError('Letter already guessed', game.type, game.id);
        }
        
        game.boardState.guesses.push(letter);
        
        let correct = false;
        if (word.includes(letter)) {
            // Update guessed word
            for (let i = 0; i < word.length; i++) {
                if (word[i] === letter) {
                    game.boardState.guessedWord[i] = letter;
                    correct = true;
                }
            }
        } else {
            game.boardState.wrongGuesses++;
        }
        
        return {
            success: true,
            letter,
            correct,
            guessedWord: game.boardState.guessedWord.join(''),
            wrongGuesses: game.boardState.wrongGuesses
        };
    }
    
    /**
     * Check if game has ended
     */
    checkGameEnd(game) {
        switch (game.type) {
            case 'tictactoe':
                return this.checkTicTacToeEnd(game);
                
            case 'wordchain':
                return { ended: false }; // Word chain can go on indefinitely
                
            case 'randomword':
            case 'hangman':
                return this.checkWordGameEnd(game);
                
            default:
                return { ended: false };
        }
    }
    
    /**
     * Check Tic-Tac-Toe end conditions
     */
    checkTicTacToeEnd(game) {
        const board = game.boardState.board;
        const winPatterns = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
            [0, 4, 8], [2, 4, 6] // diagonals
        ];
        
        // Check for winner
        for (const pattern of winPatterns) {
            const [a, b, c] = pattern;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                const symbol = board[a];
                const playerIndex = game.boardState.symbols.indexOf(symbol);
                const winner = game.players[playerIndex];
                
                return {
                    ended: true,
                    winner,
                    reason: 'win',
                    winPattern: pattern
                };
            }
        }
        
        // Check for draw
        if (board.every(cell => cell !== '')) {
            return {
                ended: true,
                winner: null,
                reason: 'draw'
            };
        }
        
        return { ended: false };
    }
    
    /**
     * Check word game end conditions
     */
    checkWordGameEnd(game) {
        const guessedWord = game.boardState.guessedWord.join('');
        const word = game.boardState.word;
        
        // Player won
        if (guessedWord === word) {
            return {
                ended: true,
                winner: game.players[0],
                reason: 'word_guessed'
            };
        }
        
        // Player lost (too many wrong guesses)
        if (game.boardState.wrongGuesses >= game.settings.maxWrongGuesses) {
            return {
                ended: true,
                winner: null,
                reason: 'max_wrong_guesses'
            };
        }
        
        return { ended: false };
    }
    
    /**
     * Move to next turn
     */
    nextTurn(game) {
        game.currentPlayer = (game.currentPlayer + 1) % game.players.length;
        game.metadata.turnStartTime = new Date();
    }
    
    /**
     * Parse game move from message
     */
    parseGameMove(game, text) {
        // Simple parsing - can be enhanced
        const cleanText = text.trim();
        
        switch (game.type) {
            case 'tictactoe':
                const match = cleanText.match(/^[1-9]$/);
                return match ? match[0] : null;
                
            case 'wordchain':
                const wordMatch = cleanText.match(/^[a-zA-Z]+$/);
                return wordMatch ? wordMatch[0] : null;
                
            case 'randomword':
            case 'hangman':
                const letterMatch = cleanText.match(/^[a-zA-Z]$/);
                return letterMatch ? letterMatch[0] : null;
                
            default:
                return cleanText;
        }
    }
    
    /**
     * Send game update to chat
     */
    async sendGameUpdate(chatId, result) {
        try {
            const { game, result: moveResult, gameResult } = result;
            
            let message = this.formatGameBoard(game);
            
            if (gameResult && gameResult.ended) {
                message += '\n\n' + this.formatGameEndMessage(game, gameResult);
            } else {
                message += '\n\n' + this.formatTurnMessage(game);
            }
            
            await this.bot.sendMessage(chatId, { text: message });
            
        } catch (error) {
            logger.error('Send game update error:', error);
        }
    }
    
    /**
     * Format game board for display
     */
    formatGameBoard(game) {
        switch (game.type) {
            case 'tictactoe':
                return this.formatTicTacToeBoard(game);
                
            case 'wordchain':
                return this.formatWordChainBoard(game);
                
            case 'randomword':
            case 'hangman':
                return this.formatWordGameBoard(game);
                
            default:
                return `🎮 *${game.type.toUpperCase()}*\n\nGame in progress...`;
        }
    }
    
    /**
     * Format Tic-Tac-Toe board
     */
    formatTicTacToeBoard(game) {
        const board = game.boardState.board;
        const positions = game.boardState.positions;
        
        let display = '🎯 *TIC-TAC-TOE*\n\n';
        
        for (let i = 0; i < 9; i += 3) {
            const row = board.slice(i, i + 3)
                .map((cell, index) => cell || positions[i + index])
                .join(' ');
            display += row + '\n';
        }
        
        return display;
    }
    
    /**
     * Format word chain board
     */
    formatWordChainBoard(game) {
        let display = '🔗 *WORD CHAIN*\n\n';
        
        if (game.boardState.chain.length > 0) {
            const lastWords = game.boardState.chain.slice(-5);
            display += '*Recent Words:*\n';
            lastWords.forEach(entry => {
                display += `• ${entry.word} (${entry.player.split('@')[0]})\n`;
            });
        }
        
        if (game.boardState.currentWord) {
            const lastLetter = game.boardState.currentWord.slice(-1).toUpperCase();
            display += `\n*Next word must start with: ${lastLetter}*`;
        }
        
        return display;
    }
    
    /**
     * Format word game board
     */
    formatWordGameBoard(game) {
        const gameTitle = game.type === 'hangman' ? 'HANGMAN' : 'RANDOM WORD';
        let display = `🔤 *${gameTitle}*\n\n`;
        
        display += `*Word:* ${game.boardState.guessedWord.join(' ')}\n`;
        display += `*Wrong guesses:* ${game.boardState.wrongGuesses}/${game.settings.maxWrongGuesses}\n`;
        
        if (game.boardState.guesses.length > 0) {
            display += `*Guessed letters:* ${game.boardState.guesses.join(', ')}\n`;
        }
        
        return display;
    }
    
    /**
     * Format turn message
     */
    formatTurnMessage(game) {
        if (!this.isTurnBased(game.type)) {
            return '*Your turn! Enter your move.*';
        }
        
        const currentPlayerJid = game.players[game.currentPlayer];
        const playerName = currentPlayerJid.split('@')[0];
        
        return `*Turn:* @${playerName}`;
    }
    
    /**
     * Format game end message
     */
    formatGameEndMessage(game, result) {
        let message = '🎊 *GAME OVER*\n\n';
        
        if (result.winner) {
            const winnerName = result.winner.split('@')[0];
            message += `🏆 *Winner:* @${winnerName}\n`;
        } else {
            message += '🤝 *Result:* Draw\n';
        }
        
        // Add scores if available
        const scores = Object.entries(game.score);
        if (scores.length > 0) {
            message += '\n*Scores:*\n';
            scores.forEach(([player, score]) => {
                message += `• ${player.split('@')[0]}: ${score}\n`;
            });
        }
        
        return message;
    }
    
    /**
     * Update player statistics
     */
    async updatePlayerStats(game, result) {
        try {
            for (const playerJid of game.players) {
                const user = await this.bot.database.getUser(playerJid);
                if (!user) continue;
                
                let playerStats = await this.bot.database.getModel('PlayerStats').findOne({
                    where: { userId: user.id }
                });
                
                if (!playerStats) {
                    playerStats = await this.bot.database.getModel('PlayerStats').create({
                        userId: user.id
                    });
                }
                
                const gameResult = result.winner === playerJid ? 'won' : 
                                 result.winner === null ? 'draw' : 'lost';
                const score = game.score[playerJid] || 0;
                
                await playerStats.updateGameStats(game.type, gameResult, score);
            }
            
        } catch (error) {
            logger.error('Update player stats error:', error);
        }
    }
    
    /**
     * Update game in database
     */
    async updateGameInDatabase(game) {
        try {
            await this.bot.database.getModel('GameSession').update(game, {
                where: { id: game.id }
            });
        } catch (error) {
            logger.error('Update game in database error:', error);
        }
    }
    
    /**
     * Generate unique game ID
     */
    generateGameId() {
        return `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Cleanup expired games
     */
    cleanupExpiredGames() {
        try {
            const now = Date.now();
            const expiredGames = [];
            
            for (const [gameId, game] of this.activeSessions) {
                const lastActivity = new Date(game.metadata.lastActivity).getTime();
                const inactiveTime = now - lastActivity;
                
                // Games inactive for more than 30 minutes are considered expired
                if (inactiveTime > 30 * 60 * 1000) {
                    expiredGames.push(gameId);
                }
            }
            
            for (const gameId of expiredGames) {
                this.endGame(gameId, { reason: 'timeout' });
            }
            
            if (expiredGames.length > 0) {
                logger.info(`🧹 Cleaned up ${expiredGames.length} expired games`);
            }
            
        } catch (error) {
            logger.error('Cleanup expired games error:', error);
        }
    }
    
    /**
     * Get game statistics
     */
    getStats() {
        const stats = {
            activeSessions: this.activeSessions.size,
            gameTypes: {},
            totalGames: 0
        };
        
        for (const game of this.activeSessions.values()) {
            if (!stats.gameTypes[game.type]) {
                stats.gameTypes[game.type] = 0;
            }
            stats.gameTypes[game.type]++;
            stats.totalGames++;
        }
        
        return stats;
    }
}

module.exports = GameHandler;
