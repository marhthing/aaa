/**
 * Game State Utilities
 * Helper functions for game management and state tracking
 */

const { GAME_STATES, TIME } = require('./constants');
const { jidManager } = require('./jidManager');

class GameUtils {
    constructor() {
        this.gameCache = new Map();
        this.playerStatsCache = new Map();
    }

    /**
     * Create new game session
     */
    createGameSession(gameType, chatId, ownerJid, options = {}) {
        const sessionId = this.generateSessionId();
        const normalizedOwnerJid = jidManager.normalizeJid(ownerJid);

        const gameSession = {
            id: sessionId,
            type: gameType,
            chatId: chatId,
            owner: normalizedOwnerJid,
            players: [normalizedOwnerJid],
            state: GAME_STATES.WAITING,
            gameData: this.initializeGameData(gameType),
            options: {
                maxPlayers: options.maxPlayers || this.getDefaultMaxPlayers(gameType),
                timeLimit: options.timeLimit || this.getDefaultTimeLimit(gameType),
                allowSpectators: options.allowSpectators || false,
                ...options
            },
            createdAt: Date.now(),
            startedAt: null,
            endedAt: null,
            winner: null,
            moves: []
        };

        this.gameCache.set(sessionId, gameSession);
        return gameSession;
    }

    /**
     * Initialize game-specific data
     */
    initializeGameData(gameType) {
        switch (gameType) {
            case 'tictactoe':
                return {
                    board: Array(9).fill(null), // 3x3 grid
                    currentPlayer: 0,
                    symbols: ['X', 'O']
                };

            case 'wordguess':
                return {
                    word: null,
                    guesses: [],
                    attemptsLeft: 6,
                    guessedLetters: new Set(),
                    category: null
                };

            case 'quiz':
                return {
                    questions: [],
                    currentQuestion: 0,
                    scores: new Map(),
                    round: 1,
                    maxRounds: 10
                };

            default:
                return {};
        }
    }

    /**
     * Get default maximum players for game type
     */
    getDefaultMaxPlayers(gameType) {
        const defaults = {
            'tictactoe': 2,
            'wordguess': 5,
            'quiz': 10
        };

        return defaults[gameType] || 2;
    }

    /**
     * Get default time limit for game type (in minutes)
     */
    getDefaultTimeLimit(gameType) {
        const defaults = {
            'tictactoe': 5,
            'wordguess': 10,
            'quiz': 15
        };

        return defaults[gameType] || 10;
    }

    /**
     * Add player to game
     */
    addPlayerToGame(sessionId, playerJid) {
        const game = this.gameCache.get(sessionId);
        if (!game) return { success: false, reason: 'Game not found' };

        const normalizedJid = jidManager.normalizeJid(playerJid);
        if (!normalizedJid) return { success: false, reason: 'Invalid player JID' };

        // Check if already in game
        if (game.players.includes(normalizedJid)) {
            return { success: false, reason: 'Player already in game' };
        }

        // Check max players
        if (game.players.length >= game.options.maxPlayers) {
            return { success: false, reason: 'Game is full' };
        }

        // Check game state
        if (game.state !== GAME_STATES.WAITING) {
            return { success: false, reason: 'Game already started' };
        }

        game.players.push(normalizedJid);

        // Auto-start game if enough players
        if (game.players.length === game.options.maxPlayers) {
            this.startGame(sessionId);
        }

        return { success: true, game };
    }

    /**
     * Start game
     */
    startGame(sessionId) {
        const game = this.gameCache.get(sessionId);
        if (!game) return false;

        if (game.state !== GAME_STATES.WAITING) return false;

        game.state = GAME_STATES.ACTIVE;
        game.startedAt = Date.now();

        // Game-specific initialization
        switch (game.type) {
            case 'wordguess':
                game.gameData.word = this.selectRandomWord();
                break;

            case 'quiz':
                game.gameData.questions = this.generateQuizQuestions();
                break;
        }

        return true;
    }

    /**
     * Process game move
     */
    processGameMove(sessionId, playerJid, move) {
        const game = this.gameCache.get(sessionId);
        if (!game) return { success: false, reason: 'Game not found' };

        const normalizedJid = jidManager.normalizeJid(playerJid);
        if (!game.players.includes(normalizedJid)) {
            return { success: false, reason: 'Player not in game' };
        }

        if (game.state !== GAME_STATES.ACTIVE) {
            return { success: false, reason: 'Game not active' };
        }

        // Process move based on game type
        const result = this.processGameSpecificMove(game, normalizedJid, move);

        if (result.success) {
            // Record move
            game.moves.push({
                player: normalizedJid,
                move: move,
                timestamp: Date.now(),
                result: result.moveResult
            });

            // Check for game end
            if (result.gameEnded) {
                this.endGame(sessionId, result.winner);
            }
        }

        return result;
    }

    /**
     * Process game-specific moves
     */
    processGameSpecificMove(game, playerJid, move) {
        switch (game.type) {
            case 'tictactoe':
                return this.processTicTacToeMove(game, playerJid, move);

            case 'wordguess':
                return this.processWordGuessMove(game, playerJid, move);

            case 'quiz':
                return this.processQuizMove(game, playerJid, move);

            default:
                return { success: false, reason: 'Unknown game type' };
        }
    }

    /**
     * Process Tic-Tac-Toe move
     */
    processTicTacToeMove(game, playerJid, move) {
        const position = parseInt(move) - 1;
        if (isNaN(position) || position < 0 || position > 8) {
            return { success: false, reason: 'Invalid position' };
        }

        if (game.gameData.board[position] !== null) {
            return { success: false, reason: 'Position already taken' };
        }

        // Check if it's player's turn
        const currentPlayerIndex = game.gameData.currentPlayer;
        if (game.players[currentPlayerIndex] !== playerJid) {
            return { success: false, reason: 'Not your turn' };
        }

        // Make move
        const symbol = game.gameData.symbols[currentPlayerIndex];
        game.gameData.board[position] = symbol;

        // Check for win
        const winner = this.checkTicTacToeWin(game.gameData.board);
        const gameEnded = winner || !game.gameData.board.includes(null);

        if (!gameEnded) {
            // Switch turns
            game.gameData.currentPlayer = 1 - currentPlayerIndex;
        }

        return {
            success: true,
            moveResult: { position, symbol },
            gameEnded,
            winner: winner ? playerJid : (gameEnded ? 'tie' : null),
            board: game.gameData.board
        };
    }

    /**
     * Check Tic-Tac-Toe win condition
     */
    checkTicTacToeWin(board) {
        const winPatterns = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
            [0, 4, 8], [2, 4, 6] // Diagonals
        ];

        for (const pattern of winPatterns) {
            const [a, b, c] = pattern;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                return board[a];
            }
        }

        return null;
    }

    /**
     * Process Word Guess move
     */
    processWordGuessMove(game, playerJid, move) {
        const guess = move.toLowerCase().trim();
        
        if (guess.length === 1) {
            // Letter guess
            if (game.gameData.guessedLetters.has(guess)) {
                return { success: false, reason: 'Letter already guessed' };
            }

            game.gameData.guessedLetters.add(guess);
            const isCorrect = game.gameData.word.includes(guess);

            if (!isCorrect) {
                game.gameData.attemptsLeft--;
            }

            const gameEnded = game.gameData.attemptsLeft === 0 || 
                            this.isWordGuessed(game.gameData.word, game.gameData.guessedLetters);

            return {
                success: true,
                moveResult: { type: 'letter', guess, isCorrect },
                gameEnded,
                winner: gameEnded && game.gameData.attemptsLeft > 0 ? playerJid : null
            };
        } else {
            // Word guess
            game.gameData.guesses.push({ player: playerJid, word: guess });
            const isCorrect = guess === game.gameData.word;

            if (!isCorrect) {
                game.gameData.attemptsLeft--;
            }

            const gameEnded = isCorrect || game.gameData.attemptsLeft === 0;

            return {
                success: true,
                moveResult: { type: 'word', guess, isCorrect },
                gameEnded,
                winner: isCorrect ? playerJid : null
            };
        }
    }

    /**
     * Check if word is fully guessed
     */
    isWordGuessed(word, guessedLetters) {
        return word.split('').every(letter => guessedLetters.has(letter));
    }

    /**
     * Process Quiz move
     */
    processQuizMove(game, playerJid, move) {
        const answer = move.toLowerCase().trim();
        const currentQuestion = game.gameData.questions[game.gameData.currentQuestion];
        
        if (!currentQuestion) {
            return { success: false, reason: 'No active question' };
        }

        const isCorrect = answer === currentQuestion.correctAnswer.toLowerCase();

        // Update score
        if (!game.gameData.scores.has(playerJid)) {
            game.gameData.scores.set(playerJid, 0);
        }

        if (isCorrect) {
            game.gameData.scores.set(playerJid, game.gameData.scores.get(playerJid) + 1);
        }

        // Move to next question
        game.gameData.currentQuestion++;
        const gameEnded = game.gameData.currentQuestion >= game.gameData.questions.length;

        let winner = null;
        if (gameEnded) {
            // Find winner (highest score)
            let maxScore = -1;
            for (const [player, score] of game.gameData.scores.entries()) {
                if (score > maxScore) {
                    maxScore = score;
                    winner = player;
                }
            }
        }

        return {
            success: true,
            moveResult: { answer, isCorrect, question: currentQuestion },
            gameEnded,
            winner
        };
    }

    /**
     * End game
     */
    endGame(sessionId, winner) {
        const game = this.gameCache.get(sessionId);
        if (!game) return false;

        game.state = GAME_STATES.FINISHED;
        game.endedAt = Date.now();
        game.winner = winner;

        // Update player statistics
        this.updatePlayerStats(game);

        return true;
    }

    /**
     * Update player statistics
     */
    updatePlayerStats(game) {
        for (const player of game.players) {
            if (!this.playerStatsCache.has(player)) {
                this.playerStatsCache.set(player, {
                    gamesPlayed: 0,
                    gamesWon: 0,
                    gamesByType: {},
                    lastPlayed: null
                });
            }

            const stats = this.playerStatsCache.get(player);
            stats.gamesPlayed++;
            stats.lastPlayed = Date.now();

            if (game.winner === player) {
                stats.gamesWon++;
            }

            if (!stats.gamesByType[game.type]) {
                stats.gamesByType[game.type] = { played: 0, won: 0 };
            }

            stats.gamesByType[game.type].played++;
            if (game.winner === player) {
                stats.gamesByType[game.type].won++;
            }
        }
    }

    /**
     * Get game by chat ID
     */
    getActiveGameByChat(chatId) {
        for (const game of this.gameCache.values()) {
            if (game.chatId === chatId && game.state === GAME_STATES.ACTIVE) {
                return game;
            }
        }
        return null;
    }

    /**
     * Generate session ID
     */
    generateSessionId() {
        return `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Select random word for word guess game
     */
    selectRandomWord() {
        const words = [
            'javascript', 'whatsapp', 'computer', 'programming', 'algorithm',
            'function', 'variable', 'boolean', 'string', 'object',
            'developer', 'software', 'hardware', 'network', 'database'
        ];
        return words[Math.floor(Math.random() * words.length)];
    }

    /**
     * Generate quiz questions
     */
    generateQuizQuestions() {
        const questions = [
            {
                question: "What does 'JS' stand for?",
                options: ["Java Script", "Just Script", "Json Script", "Java Source"],
                correctAnswer: "a"
            },
            {
                question: "Which company created WhatsApp?",
                options: ["Google", "Facebook", "WhatsApp Inc", "Microsoft"],
                correctAnswer: "c"
            }
            // Add more questions as needed
        ];

        return questions.sort(() => Math.random() - 0.5).slice(0, 5); // Random 5 questions
    }

    /**
     * Get player statistics
     */
    getPlayerStats(playerJid) {
        const normalizedJid = jidManager.normalizeJid(playerJid);
        return this.playerStatsCache.get(normalizedJid) || null;
    }

    /**
     * Clear old games
     */
    clearOldGames(maxAge = 24 * TIME.HOUR) {
        const now = Date.now();
        const toDelete = [];

        for (const [sessionId, game] of this.gameCache.entries()) {
            const gameAge = now - game.createdAt;
            if (gameAge > maxAge && game.state === GAME_STATES.FINISHED) {
                toDelete.push(sessionId);
            }
        }

        for (const sessionId of toDelete) {
            this.gameCache.delete(sessionId);
        }

        return toDelete.length;
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            activeGames: Array.from(this.gameCache.values()).filter(g => g.state === GAME_STATES.ACTIVE).length,
            totalGames: this.gameCache.size,
            players: this.playerStatsCache.size
        };
    }
}

// Create singleton instance
const gameUtils = new GameUtils();

module.exports = {
    GameUtils,
    gameUtils
};