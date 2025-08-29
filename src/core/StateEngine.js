const fs = require('fs-extra');
const path = require('path');

class StateEngine {
    constructor() {
        this.states = new Map(); // chatId -> state data
        this.globalState = new Map(); // global bot state
        this.statePath = path.join(process.cwd(), 'data', 'system', 'states.json');
        this.autoSave = true;
        this.saveInterval = 30000; // Save every 30 seconds
        this.saveTimer = null;
    }

    async initialize() {
        try {
            console.log('🔧 Initializing state engine...');

            // Ensure data directory exists
            await fs.ensureDir(path.dirname(this.statePath));

            // Load existing state
            await this.loadState();

            // Start auto-save if enabled
            if (this.autoSave) {
                this.startAutoSave();
            }

            console.log('✅ State engine initialized');

        } catch (error) {
            console.error('❌ Failed to initialize state engine:', error);
            throw error;
        }
    }

    async loadState() {
        try {
            if (await fs.pathExists(this.statePath)) {
                const stateData = await fs.readJson(this.statePath);
                
                // Load chat states
                if (stateData.chatStates) {
                    for (const [chatId, state] of Object.entries(stateData.chatStates)) {
                        this.states.set(chatId, state);
                    }
                }

                // Load global state
                if (stateData.globalState) {
                    for (const [key, value] of Object.entries(stateData.globalState)) {
                        this.globalState.set(key, value);
                    }
                }

                console.log(`📁 Loaded state for ${this.states.size} chats`);
            }
        } catch (error) {
            console.error('⚠️ Failed to load state, starting fresh:', error);
        }
    }

    async saveState() {
        try {
            const stateData = {
                chatStates: Object.fromEntries(this.states),
                globalState: Object.fromEntries(this.globalState),
                lastSaved: new Date().toISOString(),
                version: '1.0.0'
            };

            await fs.writeJson(this.statePath, stateData, { spaces: 2 });
            
        } catch (error) {
            console.error('❌ Failed to save state:', error);
        }
    }

    startAutoSave() {
        this.saveTimer = setInterval(async () => {
            await this.saveState();
        }, this.saveInterval);
    }

    stopAutoSave() {
        if (this.saveTimer) {
            clearInterval(this.saveTimer);
            this.saveTimer = null;
        }
    }

    // Chat State Management
    getChatState(chatId, key, defaultValue = null) {
        const chatState = this.states.get(chatId) || {};
        return chatState[key] !== undefined ? chatState[key] : defaultValue;
    }

    setChatState(chatId, key, value) {
        if (!this.states.has(chatId)) {
            this.states.set(chatId, {});
        }
        
        this.states.get(chatId)[key] = value;
        this.states.get(chatId).lastUpdated = new Date().toISOString();
    }

    updateChatState(chatId, updates) {
        if (!this.states.has(chatId)) {
            this.states.set(chatId, {});
        }
        
        const chatState = this.states.get(chatId);
        Object.assign(chatState, updates);
        chatState.lastUpdated = new Date().toISOString();
    }

    deleteChatState(chatId, key = null) {
        if (key) {
            // Delete specific key
            const chatState = this.states.get(chatId);
            if (chatState) {
                delete chatState[key];
                chatState.lastUpdated = new Date().toISOString();
            }
        } else {
            // Delete entire chat state
            this.states.delete(chatId);
        }
    }

    getAllChatState(chatId) {
        return this.states.get(chatId) || {};
    }

    // Global State Management
    getGlobalState(key, defaultValue = null) {
        return this.globalState.get(key) !== undefined ? this.globalState.get(key) : defaultValue;
    }

    setGlobalState(key, value) {
        this.globalState.set(key, value);
    }

    deleteGlobalState(key) {
        this.globalState.delete(key);
    }

    getAllGlobalState() {
        return Object.fromEntries(this.globalState);
    }

    // Command State Management (for multi-step commands)
    startCommandSession(chatId, command, initialData = {}) {
        const sessionKey = `command_${command}`;
        
        this.setChatState(chatId, sessionKey, {
            command: command,
            step: 0,
            data: initialData,
            startedAt: new Date().toISOString(),
            active: true
        });

        return this.getChatState(chatId, sessionKey);
    }

    getCommandSession(chatId, command) {
        const sessionKey = `command_${command}`;
        return this.getChatState(chatId, sessionKey);
    }

    updateCommandSession(chatId, command, updates) {
        const sessionKey = `command_${command}`;
        const session = this.getChatState(chatId, sessionKey);
        
        if (session) {
            Object.assign(session, updates);
            session.lastUpdated = new Date().toISOString();
            this.setChatState(chatId, sessionKey, session);
        }
        
        return session;
    }

    nextCommandStep(chatId, command, stepData = {}) {
        const session = this.getCommandSession(chatId, command);
        
        if (session) {
            session.step++;
            Object.assign(session.data, stepData);
            session.lastUpdated = new Date().toISOString();
            this.setChatState(chatId, `command_${command}`, session);
        }
        
        return session;
    }

    endCommandSession(chatId, command) {
        const sessionKey = `command_${command}`;
        this.deleteChatState(chatId, sessionKey);
    }

    isCommandSessionActive(chatId, command) {
        const session = this.getCommandSession(chatId, command);
        return session && session.active;
    }

    // Game State Management
    startGameSession(chatId, gameType, gameData = {}) {
        const gameSession = {
            type: gameType,
            status: 'active',
            data: gameData,
            startedAt: new Date().toISOString(),
            lastMove: new Date().toISOString()
        };

        this.setChatState(chatId, 'game', gameSession);
        return gameSession;
    }

    getGameSession(chatId) {
        return this.getChatState(chatId, 'game');
    }

    updateGameSession(chatId, updates) {
        const session = this.getGameSession(chatId);
        
        if (session) {
            Object.assign(session, updates);
            session.lastMove = new Date().toISOString();
            this.setChatState(chatId, 'game', session);
        }
        
        return session;
    }

    endGameSession(chatId) {
        this.deleteChatState(chatId, 'game');
    }

    isGameActive(chatId) {
        const session = this.getGameSession(chatId);
        return session && session.status === 'active';
    }

    // Conversation Context Management
    setConversationContext(chatId, context) {
        this.setChatState(chatId, 'conversation_context', {
            ...context,
            setAt: new Date().toISOString()
        });
    }

    getConversationContext(chatId) {
        return this.getChatState(chatId, 'conversation_context');
    }

    clearConversationContext(chatId) {
        this.deleteChatState(chatId, 'conversation_context');
    }

    // Temporary State (expires after timeout)
    setTemporaryState(chatId, key, value, timeoutMs = 300000) { // 5 minutes default
        const tempData = {
            value: value,
            expiresAt: Date.now() + timeoutMs
        };

        this.setChatState(chatId, `temp_${key}`, tempData);

        // Set cleanup timer
        setTimeout(() => {
            this.deleteChatState(chatId, `temp_${key}`);
        }, timeoutMs);

        return tempData;
    }

    getTemporaryState(chatId, key) {
        const tempData = this.getChatState(chatId, `temp_${key}`);
        
        if (!tempData) {
            return null;
        }

        // Check if expired
        if (Date.now() > tempData.expiresAt) {
            this.deleteChatState(chatId, `temp_${key}`);
            return null;
        }

        return tempData.value;
    }

    // State Queries and Statistics
    getAllActiveCommands() {
        const activeCommands = [];
        
        for (const [chatId, state] of this.states) {
            for (const [key, value] of Object.entries(state)) {
                if (key.startsWith('command_') && value.active) {
                    activeCommands.push({
                        chatId: chatId,
                        command: value.command,
                        step: value.step,
                        startedAt: value.startedAt
                    });
                }
            }
        }

        return activeCommands;
    }

    getAllActiveGames() {
        const activeGames = [];
        
        for (const [chatId, state] of this.states) {
            if (state.game && state.game.status === 'active') {
                activeGames.push({
                    chatId: chatId,
                    ...state.game
                });
            }
        }

        return activeGames;
    }

    getStateStats() {
        let totalStates = 0;
        let totalCommands = 0;
        let totalGames = 0;
        let totalTempStates = 0;

        for (const [chatId, state] of this.states) {
            totalStates++;
            
            for (const key of Object.keys(state)) {
                if (key.startsWith('command_')) totalCommands++;
                if (key === 'game') totalGames++;
                if (key.startsWith('temp_')) totalTempStates++;
            }
        }

        return {
            totalChatStates: this.states.size,
            totalGlobalStates: this.globalState.size,
            totalStateEntries: totalStates,
            activeCommands: totalCommands,
            activeGames: totalGames,
            temporaryStates: totalTempStates
        };
    }

    async cleanup() {
        // Clean up expired temporary states
        let cleanedCount = 0;
        
        for (const [chatId, state] of this.states) {
            const keysToDelete = [];
            
            for (const [key, value] of Object.entries(state)) {
                if (key.startsWith('temp_') && value.expiresAt && Date.now() > value.expiresAt) {
                    keysToDelete.push(key);
                }
            }

            for (const key of keysToDelete) {
                delete state[key];
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            console.log(`🧹 Cleaned up ${cleanedCount} expired temporary states`);
        }

        // Save state after cleanup
        await this.saveState();
        
        return cleanedCount;
    }

    async shutdown() {
        try {
            console.log('🛑 Shutting down state engine...');

            // Stop auto-save
            this.stopAutoSave();

            // Final save
            await this.saveState();

            // Clear state
            this.states.clear();
            this.globalState.clear();

            console.log('✅ State engine shutdown complete');

        } catch (error) {
            console.error('❌ Error during state engine shutdown:', error);
        }
    }
}

module.exports = StateEngine;
