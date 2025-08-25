/**
 * Database Configuration
 * Advanced database setup with connection pooling, migrations, and optimization
 */

const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs-extra');
const environmentConfig = require('./environment');

class DatabaseConfig {
    constructor() {
        this.sequelize = null;
        this.models = {};
        this.isConnected = false;
        this.config = environmentConfig.getDatabaseConfig();
        this.retryCount = 0;
        this.maxRetries = 5;
        
        this.initialize();
    }
    
    /**
     * Initialize database connection
     */
    async initialize() {
        try {
            await this.createSequelizeInstance();
            await this.setupConnectionHandlers();
            
            if (this.config.dialect === 'sqlite') {
                await this.ensureDataDirectory();
            }
            
        } catch (error) {
            console.error('Database initialization failed:', error);
            throw error;
        }
    }
    
    /**
     * Create Sequelize instance with optimal configuration
     */
    async createSequelizeInstance() {
        const options = {
            dialect: this.config.dialect,
            logging: this.config.logging,
            pool: this.config.pool,
            retry: {
                max: 3,
                timeout: 60000,
                match: [
                    /SQLITE_BUSY/,
                    /ECONNRESET/,
                    /ECONNREFUSED/,
                    /ENOTFOUND/,
                    /ENETUNREACH/,
                    /connection terminated/
                ]
            },
            dialectOptions: this.getDialectOptions(),
            benchmark: environmentConfig.isDevelopment(),
            define: {
                timestamps: true,
                underscored: false,
                freezeTableName: false,
                charset: 'utf8mb4',
                collate: 'utf8mb4_unicode_ci'
            },
            hooks: this.getHooks(),
            transactionType: 'IMMEDIATE'
        };
        
        if (this.config.url) {
            this.sequelize = new Sequelize(this.config.url, options);
        } else {
            this.sequelize = new Sequelize({
                storage: this.config.storage,
                ...options
            });
        }
    }
    
    /**
     * Get dialect-specific options
     */
    getDialectOptions() {
        if (this.config.dialect === 'postgres') {
            return {
                ssl: this.config.ssl ? {
                    require: true,
                    rejectUnauthorized: false
                } : false,
                keepAlive: true,
                statement_timeout: 60000,
                query_timeout: 60000,
                connectionTimeoutMillis: 30000,
                idleTimeoutMillis: 30000
            };
        } else if (this.config.dialect === 'sqlite') {
            return {
                mode: 'WAL',
                cache: 'shared',
                foreign_keys: 1,
                journal_mode: 'WAL',
                synchronous: 'NORMAL',
                temp_store: 'memory',
                mmap_size: 268435456, // 256MB
                cache_size: -64000, // 64MB
                busy_timeout: 30000
            };
        }
        
        return {};
    }
    
    /**
     * Setup database hooks
     */
    getHooks() {
        return {
            beforeConnect: async (config) => {
                console.log('Connecting to database...');
            },
            afterConnect: async (connection, config) => {
                console.log('Database connected successfully');
                
                if (this.config.dialect === 'sqlite') {
                    // Enable SQLite optimizations
                    await this.sequelize.query('PRAGMA foreign_keys = ON');
                    await this.sequelize.query('PRAGMA journal_mode = WAL');
                    await this.sequelize.query('PRAGMA synchronous = NORMAL');
                    await this.sequelize.query('PRAGMA cache_size = -64000');
                    await this.sequelize.query('PRAGMA temp_store = memory');
                    await this.sequelize.query('PRAGMA mmap_size = 268435456');
                }
            },
            beforeDisconnect: async (connection) => {
                console.log('Disconnecting from database...');
            }
        };
    }
    
    /**
     * Setup connection event handlers
     */
    async setupConnectionHandlers() {
        // Handle connection errors
        this.sequelize.connectionManager.on('error', (error) => {
            console.error('Database connection error:', error);
            this.handleConnectionError(error);
        });
        
        // Handle disconnections
        this.sequelize.connectionManager.on('disconnect', () => {
            console.warn('Database disconnected');
            this.isConnected = false;
        });
    }
    
    /**
     * Handle connection errors with retry logic
     */
    async handleConnectionError(error) {
        this.isConnected = false;
        
        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            const delay = Math.pow(2, this.retryCount) * 1000; // Exponential backoff
            
            console.log(`Retrying database connection in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`);
            
            setTimeout(async () => {
                try {
                    await this.connect();
                } catch (retryError) {
                    console.error('Database retry failed:', retryError);
                }
            }, delay);
        } else {
            console.error('Max database connection retries reached');
        }
    }
    
    /**
     * Ensure data directory exists for SQLite
     */
    async ensureDataDirectory() {
        if (this.config.storage) {
            const dataDir = path.dirname(this.config.storage);
            await fs.ensureDir(dataDir);
        }
    }
    
    /**
     * Connect to database
     */
    async connect() {
        try {
            await this.sequelize.authenticate();
            this.isConnected = true;
            this.retryCount = 0;
            
            console.log('✅ Database connection established');
            return true;
        } catch (error) {
            console.error('❌ Database connection failed:', error);
            throw error;
        }
    }
    
    /**
     * Load all database models
     */
    async loadModels() {
        try {
            const modelsDir = path.join(__dirname, '../lib/db/models');
            const modelFiles = await fs.readdir(modelsDir);
            
            // Load models in correct order to handle dependencies
            const loadOrder = [
                'User.js',
                'Group.js',
                'Session.js',
                'Setting.js',
                'Log.js',
                'PlayerStats.js',
                'GameSession.js'
            ];
            
            // Load models in specified order
            for (const fileName of loadOrder) {
                if (modelFiles.includes(fileName)) {
                    await this.loadModel(path.join(modelsDir, fileName));
                }
            }
            
            // Load any remaining models
            for (const fileName of modelFiles) {
                if (fileName.endsWith('.js') && !loadOrder.includes(fileName)) {
                    await this.loadModel(path.join(modelsDir, fileName));
                }
            }
            
            // Setup associations
            await this.setupAssociations();
            
            console.log(`📚 Loaded ${Object.keys(this.models).length} database models`);
            return this.models;
            
        } catch (error) {
            console.error('Failed to load models:', error);
            throw error;
        }
    }
    
    /**
     * Load individual model
     */
    async loadModel(modelPath) {
        try {
            const modelName = path.basename(modelPath, '.js');
            const modelDefinition = require(modelPath);
            
            if (typeof modelDefinition === 'function') {
                this.models[modelName] = modelDefinition(this.sequelize);
                console.log(`📋 Loaded model: ${modelName}`);
            }
        } catch (error) {
            console.error(`Failed to load model ${modelPath}:`, error);
        }
    }
    
    /**
     * Setup model associations
     */
    async setupAssociations() {
        try {
            const { User, Group, Session, Log, GameSession, PlayerStats } = this.models;
            
            // User associations
            if (User) {
                if (GameSession) {
                    User.hasMany(GameSession, { foreignKey: 'createdBy', as: 'createdGames' });
                    GameSession.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
                }
                
                if (PlayerStats) {
                    User.hasOne(PlayerStats, { foreignKey: 'userId', as: 'stats' });
                    PlayerStats.belongsTo(User, { foreignKey: 'userId', as: 'user' });
                }
                
                if (Log) {
                    User.hasMany(Log, { foreignKey: 'userId', as: 'logs' });
                    Log.belongsTo(User, { foreignKey: 'userId', as: 'user' });
                }
            }
            
            // Group associations
            if (Group && Log) {
                Group.hasMany(Log, { foreignKey: 'groupId', as: 'logs' });
                Log.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });
            }
            
            console.log('🔗 Database associations configured');
        } catch (error) {
            console.error('Failed to setup associations:', error);
        }
    }
    
    /**
     * Synchronize database schema
     */
    async sync(options = {}) {
        try {
            const syncOptions = {
                force: false,
                alter: environmentConfig.isDevelopment(),
                ...options
            };
            
            console.log('🔄 Synchronizing database schema...');
            await this.sequelize.sync(syncOptions);
            
            console.log('✅ Database schema synchronized');
            return true;
        } catch (error) {
            console.error('❌ Database sync failed:', error);
            throw error;
        }
    }
    
    /**
     * Run database migrations
     */
    async runMigrations() {
        try {
            // In a production app, you would use Sequelize CLI or Umzug
            // For now, we'll use sync with alter option
            if (environmentConfig.isDevelopment()) {
                await this.sync({ alter: true });
            }
            
            console.log('✅ Database migrations completed');
        } catch (error) {
            console.error('❌ Migration failed:', error);
            throw error;
        }
    }
    
    /**
     * Create database backup
     */
    async createBackup() {
        try {
            if (this.config.dialect === 'sqlite') {
                return await this.createSQLiteBackup();
            } else if (this.config.dialect === 'postgres') {
                return await this.createPostgresBackup();
            }
        } catch (error) {
            console.error('Backup creation failed:', error);
            throw error;
        }
    }
    
    /**
     * Create SQLite backup
     */
    async createSQLiteBackup() {
        const backupDir = path.join(environmentConfig.getPaths().data, 'backups');
        await fs.ensureDir(backupDir);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `backup-${timestamp}.db`);
        
        await fs.copy(this.config.storage, backupPath);
        
        console.log(`✅ SQLite backup created: ${backupPath}`);
        return backupPath;
    }
    
    /**
     * Create PostgreSQL backup
     */
    async createPostgresBackup() {
        // In production, you would use pg_dump
        // For now, export data as JSON
        const backup = {
            timestamp: new Date().toISOString(),
            data: {}
        };
        
        for (const [modelName, model] of Object.entries(this.models)) {
            try {
                backup.data[modelName] = await model.findAll();
            } catch (error) {
                console.warn(`Failed to backup ${modelName}:`, error.message);
                backup.data[modelName] = [];
            }
        }
        
        const backupDir = path.join(environmentConfig.getPaths().data, 'backups');
        await fs.ensureDir(backupDir);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `backup-${timestamp}.json`);
        
        await fs.writeJSON(backupPath, backup, { spaces: 2 });
        
        console.log(`✅ PostgreSQL backup created: ${backupPath}`);
        return backupPath;
    }
    
    /**
     * Optimize database performance
     */
    async optimize() {
        try {
            if (this.config.dialect === 'sqlite') {
                await this.sequelize.query('VACUUM');
                await this.sequelize.query('ANALYZE');
                console.log('✅ SQLite database optimized');
            } else if (this.config.dialect === 'postgres') {
                await this.sequelize.query('VACUUM ANALYZE');
                console.log('✅ PostgreSQL database optimized');
            }
        } catch (error) {
            console.error('Database optimization failed:', error);
        }
    }
    
    /**
     * Get database statistics
     */
    async getStats() {
        try {
            const stats = {
                isConnected: this.isConnected,
                dialect: this.config.dialect,
                models: Object.keys(this.models).length,
                tables: {}
            };
            
            // Get table statistics
            for (const [modelName, model] of Object.entries(this.models)) {
                try {
                    stats.tables[modelName] = await model.count();
                } catch (error) {
                    stats.tables[modelName] = 0;
                }
            }
            
            // Get database size for SQLite
            if (this.config.dialect === 'sqlite' && this.config.storage) {
                try {
                    const statInfo = await fs.stat(this.config.storage);
                    stats.size = statInfo.size;
                } catch (error) {
                    stats.size = 0;
                }
            }
            
            return stats;
        } catch (error) {
            console.error('Failed to get database stats:', error);
            return null;
        }
    }
    
    /**
     * Health check
     */
    async healthCheck() {
        try {
            await this.sequelize.authenticate();
            return {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                dialect: this.config.dialect,
                isConnected: this.isConnected
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: error.message,
                isConnected: false
            };
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
                console.log('📊 Database connection closed');
            }
        } catch (error) {
            console.error('Failed to close database connection:', error);
        }
    }
    
    /**
     * Get Sequelize instance
     */
    getSequelize() {
        return this.sequelize;
    }
    
    /**
     * Get loaded models
     */
    getModels() {
        return this.models;
    }
}

module.exports = new DatabaseConfig();
