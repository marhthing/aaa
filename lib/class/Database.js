/**
 * MatDev Database Class
 * Handle all database operations with Sequelize
 */

const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs-extra');
const logger = require('../utils/logger');
const config = require('../../config');

class Database {
    constructor() {
        this.sequelize = null;
        this.models = {};
        this.isConnected = false;
        
        this.initializeSequelize();
    }
    
    /**
     * Initialize Sequelize instance
     */
    initializeSequelize() {
        try {
            if (config.DB_TYPE === 'postgres') {
                // PostgreSQL for production
                this.sequelize = new Sequelize(config.DATABASE_URL, {
                    dialect: 'postgres',
                    dialectOptions: {
                        ssl: process.env.NODE_ENV === 'production' ? {
                            require: true,
                            rejectUnauthorized: false
                        } : false
                    },
                    logging: config.LOG_LEVEL === 'debug' ? logger.debug.bind(logger) : false,
                    pool: {
                        max: 5,
                        min: 0,
                        acquire: 30000,
                        idle: 10000
                    }
                });
            } else {
                // SQLite for development
                const dbPath = path.join(process.cwd(), 'data');
                fs.ensureDirSync(dbPath);
                
                this.sequelize = new Sequelize({
                    dialect: 'sqlite',
                    storage: path.join(dbPath, 'matdev.db'),
                    logging: config.LOG_LEVEL === 'debug' ? logger.debug.bind(logger) : false
                });
            }
            
            logger.info(`📊 Database initialized (${config.DB_TYPE})`);
        } catch (error) {
            logger.error('Failed to initialize database:', error);
            throw error;
        }
    }
    
    /**
     * Connect to database
     */
    async connect() {
        try {
            await this.sequelize.authenticate();
            this.isConnected = true;
            
            // Load models
            await this.loadModels();
            
            logger.info('✅ Database connected successfully');
            return true;
        } catch (error) {
            logger.error('Failed to connect to database:', error);
            throw error;
        }
    }
    
    /**
     * Load all database models
     */
    async loadModels() {
        try {
            const modelsDir = path.join(__dirname, '../db/models');
            const modelFiles = await fs.readdir(modelsDir);
            
            // Load each model
            for (const file of modelFiles) {
                if (file.endsWith('.js') && file !== 'index.js') {
                    const modelName = path.basename(file, '.js');
                    const modelPath = path.join(modelsDir, file);
                    
                    try {
                        const model = require(modelPath)(this.sequelize);
                        this.models[modelName] = model;
                        logger.debug(`📋 Loaded model: ${modelName}`);
                    } catch (error) {
                        logger.error(`Failed to load model ${modelName}:`, error);
                    }
                }
            }
            
            // Set up associations
            this.setupAssociations();
            
            logger.info(`📚 Loaded ${Object.keys(this.models).length} database models`);
        } catch (error) {
            logger.error('Failed to load models:', error);
            throw error;
        }
    }
    
    /**
     * Set up model associations
     */
    setupAssociations() {
        try {
            const { User, Group, Session, GameSession, PlayerStats, Log } = this.models;
            
            // User associations
            if (User && GameSession) {
                User.hasMany(GameSession, { foreignKey: 'createdBy' });
                GameSession.belongsTo(User, { foreignKey: 'createdBy' });
            }
            
            if (User && PlayerStats) {
                User.hasOne(PlayerStats, { foreignKey: 'userId' });
                PlayerStats.belongsTo(User, { foreignKey: 'userId' });
            }
            
            if (User && Log) {
                User.hasMany(Log, { foreignKey: 'userId' });
                Log.belongsTo(User, { foreignKey: 'userId' });
            }
            
            // Group associations
            if (Group && Log) {
                Group.hasMany(Log, { foreignKey: 'groupId' });
                Log.belongsTo(Group, { foreignKey: 'groupId' });
            }
            
            logger.debug('🔗 Database associations set up');
        } catch (error) {
            logger.error('Failed to set up associations:', error);
        }
    }
    
    /**
     * Synchronize database (create tables)
     */
    async sync(force = false) {
        try {
            await this.sequelize.sync({ force });
            logger.info('🔄 Database synchronized');
            return true;
        } catch (error) {
            logger.error('Failed to sync database:', error);
            throw error;
        }
    }
    
    /**
     * Get a model
     */
    getModel(modelName) {
        return this.models[modelName];
    }
    
    /**
     * Execute raw query
     */
    async query(sql, options = {}) {
        try {
            return await this.sequelize.query(sql, {
                type: Sequelize.QueryTypes.SELECT,
                ...options
            });
        } catch (error) {
            logger.error('Database query failed:', error);
            throw error;
        }
    }
    
    /**
     * Start a transaction
     */
    async transaction(callback) {
        try {
            return await this.sequelize.transaction(callback);
        } catch (error) {
            logger.error('Transaction failed:', error);
            throw error;
        }
    }
    
    /**
     * Create a user record
     */
    async createUser(userData) {
        try {
            const User = this.getModel('User');
            if (!User) throw new Error('User model not found');
            
            const [user, created] = await User.findOrCreate({
                where: { jid: userData.jid },
                defaults: userData
            });
            
            return { user, created };
        } catch (error) {
            logger.error('Failed to create user:', error);
            throw error;
        }
    }
    
    /**
     * Get user by JID
     */
    async getUser(jid) {
        try {
            const User = this.getModel('User');
            if (!User) throw new Error('User model not found');
            
            return await User.findOne({ where: { jid } });
        } catch (error) {
            logger.error('Failed to get user:', error);
            throw error;
        }
    }
    
    /**
     * Update user data
     */
    async updateUser(jid, updates) {
        try {
            const User = this.getModel('User');
            if (!User) throw new Error('User model not found');
            
            const [affectedCount] = await User.update(updates, {
                where: { jid }
            });
            
            return affectedCount > 0;
        } catch (error) {
            logger.error('Failed to update user:', error);
            throw error;
        }
    }
    
    /**
     * Create a group record
     */
    async createGroup(groupData) {
        try {
            const Group = this.getModel('Group');
            if (!Group) throw new Error('Group model not found');
            
            const [group, created] = await Group.findOrCreate({
                where: { jid: groupData.jid },
                defaults: groupData
            });
            
            return { group, created };
        } catch (error) {
            logger.error('Failed to create group:', error);
            throw error;
        }
    }
    
    /**
     * Get group by JID
     */
    async getGroup(jid) {
        try {
            const Group = this.getModel('Group');
            if (!Group) throw new Error('Group model not found');
            
            return await Group.findOne({ where: { jid } });
        } catch (error) {
            logger.error('Failed to get group:', error);
            throw error;
        }
    }
    
    /**
     * Log an event
     */
    async log(logData) {
        try {
            const Log = this.getModel('Log');
            if (!Log) throw new Error('Log model not found');
            
            return await Log.create(logData);
        } catch (error) {
            logger.error('Failed to create log:', error);
            throw error;
        }
    }
    
    /**
     * Get setting value
     */
    async getSetting(key, defaultValue = null) {
        try {
            const Setting = this.getModel('Setting');
            if (!Setting) return defaultValue;
            
            const setting = await Setting.findOne({ where: { key } });
            return setting ? setting.value : defaultValue;
        } catch (error) {
            logger.error('Failed to get setting:', error);
            return defaultValue;
        }
    }
    
    /**
     * Set setting value
     */
    async setSetting(key, value) {
        try {
            const Setting = this.getModel('Setting');
            if (!Setting) throw new Error('Setting model not found');
            
            const [setting, created] = await Setting.findOrCreate({
                where: { key },
                defaults: { key, value }
            });
            
            if (!created) {
                await setting.update({ value });
            }
            
            return setting;
        } catch (error) {
            logger.error('Failed to set setting:', error);
            throw error;
        }
    }
    
    /**
     * Get database statistics
     */
    async getStats() {
        try {
            const stats = {};
            
            for (const [modelName, model] of Object.entries(this.models)) {
                try {
                    stats[modelName] = await model.count();
                } catch (error) {
                    stats[modelName] = 0;
                }
            }
            
            return {
                isConnected: this.isConnected,
                dbType: config.DB_TYPE,
                models: Object.keys(this.models).length,
                records: stats
            };
        } catch (error) {
            logger.error('Failed to get database stats:', error);
            return null;
        }
    }
    
    /**
     * Close database connection
     */
    async close() {
        try {
            if (this.sequelize) {
                await this.sequelize.close();
                this.isConnected = false;
                logger.info('📊 Database connection closed');
            }
        } catch (error) {
            logger.error('Failed to close database connection:', error);
        }
    }
    
    /**
     * Health check
     */
    async healthCheck() {
        try {
            await this.sequelize.authenticate();
            return true;
        } catch (error) {
            logger.error('Database health check failed:', error);
            return false;
        }
    }
}

module.exports = Database;
