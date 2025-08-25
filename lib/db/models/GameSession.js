/**
 * GameSession Model - Multi-player game sessions
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const GameSession = sequelize.define('GameSession', {
        id: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false
        },
        type: {
            type: DataTypes.ENUM('tictactoe', 'wordchain', 'randomword', 'trivia', 'hangman'),
            allowNull: false
        },
        players: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: []
        },
        state: {
            type: DataTypes.ENUM('waiting', 'active', 'paused', 'ended'),
            defaultValue: 'waiting'
        },
        currentPlayer: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        boardState: {
            type: DataTypes.JSON,
            defaultValue: {}
        },
        settings: {
            type: DataTypes.JSON,
            defaultValue: {
                maxPlayers: 2,
                turnTimeout: 60,
                difficulty: 'medium',
                autoEnd: true
            }
        },
        createdBy: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        chatId: {
            type: DataTypes.STRING,
            allowNull: false
        },
        startedAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        endedAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        winner: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        score: {
            type: DataTypes.JSON,
            defaultValue: {}
        },
        moves: {
            type: DataTypes.JSON,
            defaultValue: []
        },
        metadata: {
            type: DataTypes.JSON,
            defaultValue: {}
        }
    }, {
        tableName: 'game_sessions',
        timestamps: true,
        indexes: [
            {
                fields: ['type']
            },
            {
                fields: ['state']
            },
            {
                fields: ['createdBy']
            },
            {
                fields: ['chatId']
            },
            {
                fields: ['createdAt']
            }
        ]
    });
    
    return GameSession;
};
