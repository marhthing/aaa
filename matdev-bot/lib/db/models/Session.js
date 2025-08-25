/**
 * Session Model - WhatsApp session data
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Session = sequelize.define('Session', {
        id: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false
        },
        sessionId: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        data: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        lastConnected: {
            type: DataTypes.DATE,
            allowNull: true
        },
        connectionCount: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        metadata: {
            type: DataTypes.JSON,
            defaultValue: {}
        }
    }, {
        tableName: 'sessions',
        timestamps: true,
        indexes: [
            {
                fields: ['sessionId']
            },
            {
                fields: ['isActive']
            }
        ]
    });
    
    return Session;
};
