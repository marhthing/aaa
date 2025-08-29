/**
 * Log Model - System and user activity logs
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Log = sequelize.define('Log', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        level: {
            type: DataTypes.ENUM('error', 'warn', 'info', 'debug'),
            allowNull: false
        },
        message: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        category: {
            type: DataTypes.STRING,
            defaultValue: 'general'
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        groupId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'groups',
                key: 'id'
            }
        },
        command: {
            type: DataTypes.STRING,
            allowNull: true
        },
        plugin: {
            type: DataTypes.STRING,
            allowNull: true
        },
        error: {
            type: DataTypes.JSON,
            allowNull: true
        },
        metadata: {
            type: DataTypes.JSON,
            defaultValue: {}
        },
        ip: {
            type: DataTypes.STRING,
            allowNull: true
        },
        userAgent: {
            type: DataTypes.STRING,
            allowNull: true
        },
        // Message-specific fields
        messageId: {
            type: DataTypes.STRING,
            allowNull: true
        },
        remoteJid: {
            type: DataTypes.STRING,
            allowNull: true
        },
        messageType: {
            type: DataTypes.STRING,
            allowNull: true
        },
        direction: {
            type: DataTypes.ENUM('incoming', 'outgoing'),
            allowNull: true
        }
    }, {
        tableName: 'logs',
        timestamps: true,
        indexes: [
            {
                fields: ['level']
            },
            {
                fields: ['category']
            },
            {
                fields: ['userId']
            },
            {
                fields: ['groupId']
            },
            {
                fields: ['createdAt']
            }
        ]
    });
    
    return Log;
};
