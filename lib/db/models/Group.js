/**
 * Group Model - WhatsApp group data
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Group = sequelize.define('Group', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        jid: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        participantCount: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        botJoinedAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        settings: {
            type: DataTypes.JSON,
            defaultValue: {
                welcome: true,
                goodbye: true,
                antiLink: false,
                antiSpam: true,
                autoDelete: false,
                commandsAllowed: true,
                gamesAllowed: true
            }
        },
        protection: {
            type: DataTypes.JSON,
            defaultValue: {
                antiBot: false,
                antiLink: false,
                antiSpam: true,
                antiFlood: true,
                maxWarnings: 3
            }
        },
        stats: {
            type: DataTypes.JSON,
            defaultValue: {
                messagesCount: 0,
                commandsUsed: 0,
                mediaShared: 0,
                membersJoined: 0,
                membersLeft: 0
            }
        }
    }, {
        tableName: 'groups',
        timestamps: true,
        indexes: [
            {
                fields: ['jid']
            },
            {
                fields: ['isActive']
            }
        ]
    });
    
    return Group;
};
