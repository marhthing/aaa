/**
 * User Model - WhatsApp user data
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const User = sequelize.define('User', {
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
            allowNull: true
        },
        pushName: {
            type: DataTypes.STRING,
            allowNull: true
        },
        language: {
            type: DataTypes.STRING,
            defaultValue: 'en'
        },
        isBanned: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        banReason: {
            type: DataTypes.STRING,
            allowNull: true
        },
        banExpiry: {
            type: DataTypes.DATE,
            allowNull: true
        },
        isVip: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        vipExpiry: {
            type: DataTypes.DATE,
            allowNull: true
        },
        commandCount: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        lastActive: {
            type: DataTypes.DATE,
            allowNull: true
        },
        settings: {
            type: DataTypes.JSON,
            defaultValue: {}
        },
        stats: {
            type: DataTypes.JSON,
            defaultValue: {
                messagesReceived: 0,
                messagesSent: 0,
                commandsUsed: 0,
                mediaShared: 0
            }
        }
    }, {
        tableName: 'users',
        timestamps: true,
        indexes: [
            {
                fields: ['jid']
            },
            {
                fields: ['isBanned']
            },
            {
                fields: ['isVip']
            },
            {
                fields: ['lastActive']
            }
        ]
    });
    
    return User;
};
