/**
 * Setting Model - Bot configuration settings
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Setting = sequelize.define('Setting', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        key: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        value: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        type: {
            type: DataTypes.ENUM('string', 'number', 'boolean', 'json'),
            defaultValue: 'string'
        },
        category: {
            type: DataTypes.STRING,
            defaultValue: 'general'
        },
        description: {
            type: DataTypes.STRING,
            allowNull: true
        },
        isEditable: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        }
    }, {
        tableName: 'settings',
        timestamps: true,
        indexes: [
            {
                fields: ['key']
            },
            {
                fields: ['category']
            }
        ]
    });
    
    return Setting;
};
