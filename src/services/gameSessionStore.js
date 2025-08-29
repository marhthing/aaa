const { EventEmitter } = require('events');
const storageService = require('./storage');

class GameSessionStore extends EventEmitter {
    constructor() {
        super();
        this.activeSessions = new Map(); // sessionId -> session data
        this.sessionHistory = [];
        this.playerStats = new Map(); // playerId -> stats
        this.isInitialized = false;
    }

    async initialize() {
        try {
            await this.loadGameData();
            this.isInitialized = true;
            console.log('✅ Game Session Store initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Game Session Store:', error);
            throw error;
        }
    }

    async loadGameData() {
        try {
            // Load active sessions
            const activeData = await storageService.load('games', 'active_sessions');
            if (activeData) {
                for (const [sessionId, sessionData] of Object.entries(activeData)) {
                    this.activeSessions.set(sessionId, sessionData);
                }
            }

            // Load session history
            const historyData = await storageService.load('games', 'session_history');
            if (historyData) {
                this.sessionHistory = historyData;
            }

            // Load player stats
            const statsData = await storageService.load('games', 'player_stats');
            if (statsData) {
                for (const [playerId, stats] of Object.entries(statsData)) {
                    this.playerStats.set(playerId, stats);
                }
            }
        } catch (error) {
            console.error('Error loading game data:', error);
        }
    }

    async saveGameData() {
        try {
            await storageService.save('games', 'active_sessions', 
                Object.fromEntries(this.activeSessions.entries())
            );
            
            await storageService.save('games', 'session_history', this.sessionHistory);
            
            await storageService.save('games', 'player_stats', 
                Object.fromEntries(this.playerStats.entries())
            );
        } catch (error) {
            console.error('Error saving game data:', error);
        }
    }

    createSession(chatId, gameType, gameData = {}) {
        const sessionId = this.generateSessionId();
        
        const session = {
            id: sessionId,
            chatId,
            gameType,
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            players: gameData.players || [],
            data: gameData,
            moves: [],
            metadata: {
                version: '1.0.0',
                creator: gameData.startedBy || null
            }
        };

        this.activeSessions.set(sessionId, session);
        this.emit('session_created', { sessionId, session });
        this.saveGameData();

        return session;
    }

    getSession(sessionId) {
        return this.activeSessions.get(sessionId) || null;
    }

    getSessionByChat(chatId) {
        for (const session of this.activeSessions.values()) {
            if (session.chatId === chatId && session.status === 'active') {
                return session;
            }
        }
        return null;
    }

    updateSession(sessionId, updates) {
        const session = this.activeSessions.get(sessionId);
        
        if (!session) {
            return null;
        }

        const updatedSession = {
            ...session,
            ...updates,
            updatedAt: new Date().toISOString()
        };

        this.activeSessions.set(sessionId, updatedSession);
        this.emit('session_updated', { sessionId, session: updatedSession, updates });
        this.saveGameData();

        return updatedSession;
    }

    addMove(sessionId, move) {
        const session = this.activeSessions.get(sessionId);
        
        if (!session) {
            return false;
        }

        const moveRecord = {
            id: this.generateMoveId(),
            playerId: move.playerId,
            type: move.type,
            data: move.data,
            timestamp: new Date().toISOString(),
            valid: move.valid !== false
        };

        session.moves.push(moveRecord);
        session.updatedAt = new Date().toISOString();

        this.activeSessions.set(sessionId, session);
        this.emit('move_added', { sessionId, move: moveRecord });
        this.saveGameData();

        return moveRecord;
    }

    endSession(sessionId, result = {}) {
        const session = this.activeSessions.get(sessionId);
        
        if (!session) {
            return null;
        }

        // Update session status
        session.status = 'completed';
        session.endedAt = new Date().toISOString();
        session.result = result;
        session.duration = new Date(session.endedAt) - new Date(session.createdAt);

        // Move to history
        this.sessionHistory.push({ ...session });
        
        // Keep only last 1000 sessions in history
        if (this.sessionHistory.length > 1000) {
            this.sessionHistory = this.sessionHistory.slice(-1000);
        }

        // Remove from active sessions
        this.activeSessions.delete(sessionId);

        // Update player stats
        this.updatePlayerStats(session);

        this.emit('session_ended', { sessionId, session });
        this.saveGameData();

        return session;
    }

    updatePlayerStats(session) {
        if (!session.players) return;

        for (const playerId of session.players) {
            if (!playerId || playerId === 'AI') continue;

            let stats = this.playerStats.get(playerId);
            
            if (!stats) {
                stats = {
                    playerId,
                    totalGames: 0,
                    gamesWon: 0,
                    gamesLost: 0,
                    gamesTied: 0,
                    gamesByType: {},
                    totalMoves: 0,
                    averageGameTime: 0,
                    firstGame: new Date().toISOString(),
                    lastGame: new Date().toISOString()
                };
            }

            // Update basic stats
            stats.totalGames++;
            stats.lastGame = new Date().toISOString();
            stats.totalMoves += session.moves.filter(m => m.playerId === playerId).length;

            // Update game type stats
            if (!stats.gamesByType[session.gameType]) {
                stats.gamesByType[session.gameType] = 0;
            }
            stats.gamesByType[session.gameType]++;

            // Update win/loss stats
            if (session.result) {
                if (session.result.winner === playerId) {
                    stats.gamesWon++;
                } else if (session.result.winner === 'tie' || session.result.winner === 'draw') {
                    stats.gamesTied++;
                } else if (session.result.winner) {
                    stats.gamesLost++;
                }
            }

            // Update average game time
            const totalTime = stats.averageGameTime * (stats.totalGames - 1) + (session.duration || 0);
            stats.averageGameTime = totalTime / stats.totalGames;

            this.playerStats.set(playerId, stats);
        }
    }

    getActiveSessions() {
        return Array.from(this.activeSessions.values());
    }

    getSessionHistory(limit = 50) {
        return this.sessionHistory.slice(-limit).reverse();
    }

    getPlayerStats(playerId) {
        return this.playerStats.get(playerId) || null;
    }

    getAllPlayerStats() {
        return Array.from(this.playerStats.values());
    }

    getGameStats() {
        const activeSessions = this.getActiveSessions();
        const totalSessions = this.sessionHistory.length + activeSessions.length;
        
        // Game type distribution
        const gameTypes = {};
        [...this.sessionHistory, ...activeSessions].forEach(session => {
            gameTypes[session.gameType] = (gameTypes[session.gameType] || 0) + 1;
        });

        // Recent activity (last 24 hours)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentSessions = this.sessionHistory.filter(session => 
            new Date(session.createdAt) > oneDayAgo
        );

        // Top players
        const topPlayers = Array.from(this.playerStats.values())
            .sort((a, b) => b.totalGames - a.totalGames)
            .slice(0, 10);

        return {
            totalSessions,
            activeSessions: activeSessions.length,
            completedSessions: this.sessionHistory.length,
            gameTypes,
            recentActivity: recentSessions.length,
            topPlayers: topPlayers.map(player => ({
                id: player.playerId,
                totalGames: player.totalGames,
                winRate: player.totalGames > 0 ? 
                    ((player.gamesWon / player.totalGames) * 100).toFixed(1) + '%' : '0%'
            }))
        };
    }

    // Query methods
    getSessionsByPlayer(playerId, limit = 20) {
        return this.sessionHistory
            .filter(session => session.players && session.players.includes(playerId))
            .slice(-limit)
            .reverse();
    }

    getSessionsByType(gameType, limit = 20) {
        return this.sessionHistory
            .filter(session => session.gameType === gameType)
            .slice(-limit)
            .reverse();
    }

    getSessionsByChat(chatId, limit = 20) {
        return this.sessionHistory
            .filter(session => session.chatId === chatId)
            .slice(-limit)
            .reverse();
    }

    // Utility methods
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    }

    generateMoveId() {
        return `move_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    // Cleanup methods
    cleanupOldSessions(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days
        const cutoff = new Date(Date.now() - maxAge);
        const originalCount = this.sessionHistory.length;
        
        this.sessionHistory = this.sessionHistory.filter(session => 
            new Date(session.endedAt || session.createdAt) > cutoff
        );
        
        const removedCount = originalCount - this.sessionHistory.length;
        
        if (removedCount > 0) {
            this.saveGameData();
            console.log(`🧹 Cleaned up ${removedCount} old game sessions`);
        }
        
        return removedCount;
    }

    endAllActiveSessions(reason = 'system_shutdown') {
        const activeSessionIds = Array.from(this.activeSessions.keys());
        
        for (const sessionId of activeSessionIds) {
            this.endSession(sessionId, { 
                status: 'aborted', 
                reason,
                endedAt: new Date().toISOString()
            });
        }
        
        return activeSessionIds.length;
    }

    reset() {
        this.activeSessions.clear();
        this.sessionHistory = [];
        this.playerStats.clear();
        this.saveGameData();
        this.emit('store_reset');
    }
}

// Export singleton instance
module.exports = new GameSessionStore();
