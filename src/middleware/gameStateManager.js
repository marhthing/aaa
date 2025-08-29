const EnvironmentManager = require('../core/EnvironmentManager');

class GameStateManagerMiddleware {
    constructor() {
        this.envManager = new EnvironmentManager();
        this.botClient = null;
        this.eventBus = null;
        this.gameSessionStore = null;
        this.isInitialized = false;
    }

    async initialize(dependencies) {
        try {
            this.botClient = dependencies.client;
            this.eventBus = dependencies.eventBus;
            this.gameSessionStore = dependencies.gameSessionStore;
            await this.envManager.initialize();

            this.isInitialized = true;
            console.log('🎮 Game state manager middleware initialized');
            return this;

        } catch (error) {
            console.error('Error initializing Game State Manager middleware:', error);
            throw error;
        }
    }

    async process(context) {
        try {
            if (!this.isInitialized) return;

            const { message } = context;
            const messageText = message.body || '';

            // Only process if games are enabled
            if (this.envManager.get('ENABLE_GAMES') !== 'true') {
                return;
            }

            // Check if there's an active game in this chat
            const chatId = message.key.remoteJid;
            const accessController = this.botClient.getAccessController();
            const activeGame = accessController.getActiveGame(chatId);

            if (activeGame) {
                // Check if this message is game input
                if (this.isValidGameInput(messageText, activeGame)) {
                    context.metadata.isGameInput = true;
                    context.metadata.gameInfo = activeGame;
                    await this.handleGameInput(context);
                    return;
                }
            }

            // Check if this is a game command
            const prefix = this.envManager.get('BOT_PREFIX', '.');

            if (messageText.startsWith(prefix)) {
                const command = messageText.substring(prefix.length).trim().split(' ')[0].toLowerCase();

                if (this.isGameCommand(command)) {
                    context.metadata.isGameCommand = true;
                    context.metadata.gameCommand = command;
                }
            }

        } catch (error) {
            console.error('Error in Game State Manager middleware:', error);
            this.eventBus.emit('middleware_error', { 
                middleware: 'GameStateManager', 
                error, 
                message: context.message 
            });
        }
    }

    async handleGameInput(context) {
        const { message } = context;
        const gameInfo = context.metadata.gameInfo;

        try {
            // Mark as valid game input for further processing
            context.metadata.validGameInput = true;
            context.stopped = true; // Stop further processing - game plugin will handle this

            const chatId = message.key.remoteJid;
            // Extract player JID properly - same logic as in TicTacToe plugin
            let player;
            if (message.key?.participant) {
                // In group chat, participant is the sender
                player = message.key.participant;
            } else {
                // In private chat, remoteJid is the sender
                player = message.key?.remoteJid || message.from;
            }

            console.log('🎮 GameStateManager - Extracted player JID:', player, 'Chat:', chatId);

            this.eventBus.emit('game_input_received', {
                chatId: chatId,
                gameType: gameInfo.type,
                input: message.body.trim(),
                player: player,
                gameInfo
            });

        } catch (error) {
            console.error('Error handling game input:', error);
        }
    }

    isGameCommand(command) {
        const gameCommands = ['tictactoe', 'wordguess', 'endgame', 'gameinfo'];
        return gameCommands.includes(command);
    }

    isValidGameInput(input, gameInfo) {
        if (!input || !gameInfo) return false;

        const text = input.trim().toLowerCase();

        switch (gameInfo.type) {
            case 'tictactoe':
                // Valid moves are positions 1-9 or 'quit'
                return /^[1-9]$/.test(text) || text === 'quit';

            case 'wordguess':
                // Valid inputs are single letters, 'start', or 'quit'
                return /^[a-z]$/.test(text) || text === 'quit' || text === 'start';

            default:
                return false;
        }
    }

    async shutdown() {
        this.isInitialized = false;
    }
}

module.exports = new GameStateManagerMiddleware();