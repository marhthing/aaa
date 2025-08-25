/**
 * PlayerStats Model - Player game statistics
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const PlayerStats = sequelize.define('PlayerStats', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        gamesPlayed: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        gamesWon: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        gamesLost: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        gamesDraw: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        totalScore: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        averageScore: {
            type: DataTypes.FLOAT,
            defaultValue: 0
        },
        bestScore: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        winStreak: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        bestWinStreak: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        gameStats: {
            type: DataTypes.JSON,
            defaultValue: {
                tictactoe: { played: 0, won: 0, lost: 0, draw: 0 },
                wordchain: { played: 0, won: 0, lost: 0, bestChain: 0 },
                randomword: { played: 0, won: 0, lost: 0, correctGuesses: 0 },
                trivia: { played: 0, won: 0, lost: 0, correctAnswers: 0 },
                hangman: { played: 0, won: 0, lost: 0, wordsGuessed: 0 }
            }
        },
        achievements: {
            type: DataTypes.JSON,
            defaultValue: []
        },
        lastGameAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        level: {
            type: DataTypes.INTEGER,
            defaultValue: 1
        },
        experience: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        rank: {
            type: DataTypes.STRING,
            defaultValue: 'Beginner'
        }
    }, {
        tableName: 'player_stats',
        timestamps: true,
        indexes: [
            {
                fields: ['userId']
            },
            {
                fields: ['totalScore']
            },
            {
                fields: ['winStreak']
            },
            {
                fields: ['level']
            }
        ]
    });
    
    // Methods to update stats
    PlayerStats.prototype.updateGameStats = function(gameType, result, score = 0) {
        this.gamesPlayed += 1;
        
        if (result === 'won') {
            this.gamesWon += 1;
            this.winStreak += 1;
            if (this.winStreak > this.bestWinStreak) {
                this.bestWinStreak = this.winStreak;
            }
        } else if (result === 'lost') {
            this.gamesLost += 1;
            this.winStreak = 0;
        } else if (result === 'draw') {
            this.gamesDraw += 1;
        }
        
        this.totalScore += score;
        this.averageScore = this.totalScore / this.gamesPlayed;
        
        if (score > this.bestScore) {
            this.bestScore = score;
        }
        
        // Update game-specific stats
        if (!this.gameStats[gameType]) {
            this.gameStats[gameType] = { played: 0, won: 0, lost: 0, draw: 0 };
        }
        
        this.gameStats[gameType].played += 1;
        this.gameStats[gameType][result] += 1;
        
        this.lastGameAt = new Date();
        
        // Update level and experience
        this.experience += this.calculateExperience(result, score);
        this.updateLevel();
        
        return this.save();
    };
    
    PlayerStats.prototype.calculateExperience = function(result, score) {
        let exp = 10; // Base experience
        
        if (result === 'won') exp += 25;
        else if (result === 'draw') exp += 10;
        
        exp += Math.floor(score / 10);
        
        return exp;
    };
    
    PlayerStats.prototype.updateLevel = function() {
        const newLevel = Math.floor(this.experience / 100) + 1;
        
        if (newLevel > this.level) {
            this.level = newLevel;
            this.updateRank();
        }
    };
    
    PlayerStats.prototype.updateRank = function() {
        const ranks = [
            { min: 1, max: 5, name: 'Beginner' },
            { min: 6, max: 15, name: 'Amateur' },
            { min: 16, max: 30, name: 'Player' },
            { min: 31, max: 50, name: 'Expert' },
            { min: 51, max: 75, name: 'Master' },
            { min: 76, max: 100, name: 'Champion' },
            { min: 101, max: Infinity, name: 'Legend' }
        ];
        
        const currentRank = ranks.find(rank => 
            this.level >= rank.min && this.level <= rank.max
        );
        
        if (currentRank) {
            this.rank = currentRank.name;
        }
    };
    
    return PlayerStats;
};
