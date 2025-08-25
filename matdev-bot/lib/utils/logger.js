/**
 * MatDev Logger Utility
 * Comprehensive logging system using Winston
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs-extra');
const config = require('../../config');

// Ensure logs directory exists
const logDir = path.join(process.cwd(), config.LOG_DIR || 'logs');
fs.ensureDirSync(logDir);

// Custom log format
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} [${level.toUpperCase()}]: ${message} ${metaStr}`;
    })
);

// Console format for development
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({
        format: 'HH:mm:ss'
    }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
        return `${timestamp} ${level}: ${message} ${metaStr}`;
    })
);

// Create logger instance
const logger = winston.createLogger({
    level: config.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { service: 'matdev-bot' },
    transports: [
        // Error log file
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 10485760, // 10MB
            maxFiles: 5,
            tailable: true
        }),
        
        // Combined log file
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log'),
            maxsize: 10485760, // 10MB
            maxFiles: 10,
            tailable: true
        }),
        
        // Debug log file (only in development)
        ...(process.env.NODE_ENV !== 'production' ? [
            new winston.transports.File({
                filename: path.join(logDir, 'debug.log'),
                level: 'debug',
                maxsize: 5242880, // 5MB
                maxFiles: 3,
                tailable: true
            })
        ] : [])
    ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: consoleFormat,
        level: 'debug'
    }));
} else {
    logger.add(new winston.transports.Console({
        format: consoleFormat,
        level: 'info'
    }));
}

// Custom logging methods
logger.logCommand = function(user, command, args, success = true) {
    const message = `Command executed: ${command} by ${user}`;
    const meta = {
        category: 'command',
        user,
        command,
        args,
        success,
        timestamp: new Date().toISOString()
    };
    
    if (success) {
        this.info(message, meta);
    } else {
        this.warn(`${message} - FAILED`, meta);
    }
};

logger.logPlugin = function(pluginName, action, details = {}) {
    const message = `Plugin ${action}: ${pluginName}`;
    const meta = {
        category: 'plugin',
        plugin: pluginName,
        action,
        details,
        timestamp: new Date().toISOString()
    };
    
    this.info(message, meta);
};

logger.logConnection = function(event, details = {}) {
    const message = `Connection ${event}`;
    const meta = {
        category: 'connection',
        event,
        details,
        timestamp: new Date().toISOString()
    };
    
    if (event === 'error' || event === 'disconnected') {
        this.error(message, meta);
    } else {
        this.info(message, meta);
    }
};

logger.logGame = function(gameType, gameId, event, players = [], details = {}) {
    const message = `Game ${event}: ${gameType} (${gameId})`;
    const meta = {
        category: 'game',
        gameType,
        gameId,
        event,
        players,
        details,
        timestamp: new Date().toISOString()
    };
    
    this.info(message, meta);
};

logger.logSecurity = function(event, user, details = {}) {
    const message = `Security event: ${event} - User: ${user}`;
    const meta = {
        category: 'security',
        event,
        user,
        details,
        timestamp: new Date().toISOString()
    };
    
    this.warn(message, meta);
};

logger.logDatabase = function(operation, table, success = true, error = null) {
    const message = `Database ${operation} on ${table}`;
    const meta = {
        category: 'database',
        operation,
        table,
        success,
        error: error ? error.message : null,
        timestamp: new Date().toISOString()
    };
    
    if (success) {
        this.debug(message, meta);
    } else {
        this.error(`${message} - FAILED`, meta);
    }
};

logger.logMedia = function(type, user, size, success = true, error = null) {
    const message = `Media ${type} processed for ${user}`;
    const meta = {
        category: 'media',
        type,
        user,
        size,
        success,
        error: error ? error.message : null,
        timestamp: new Date().toISOString()
    };
    
    if (success) {
        this.info(message, meta);
    } else {
        this.error(`${message} - FAILED`, meta);
    }
};

logger.logAPI = function(service, endpoint, statusCode, responseTime, error = null) {
    const message = `API call: ${service}${endpoint}`;
    const meta = {
        category: 'api',
        service,
        endpoint,
        statusCode,
        responseTime,
        error: error ? error.message : null,
        timestamp: new Date().toISOString()
    };
    
    if (statusCode >= 200 && statusCode < 400) {
        this.info(message, meta);
    } else {
        this.error(`${message} - HTTP ${statusCode}`, meta);
    }
};

// Performance monitoring
logger.logPerformance = function(operation, duration, memory = null) {
    const message = `Performance: ${operation} took ${duration}ms`;
    const meta = {
        category: 'performance',
        operation,
        duration,
        memory: memory || process.memoryUsage(),
        timestamp: new Date().toISOString()
    };
    
    if (duration > 5000) { // Log as warning if operation takes more than 5 seconds
        this.warn(message, meta);
    } else {
        this.debug(message, meta);
    }
};

// Bot statistics logging
logger.logStats = function(stats) {
    const message = 'Bot statistics update';
    const meta = {
        category: 'stats',
        stats,
        timestamp: new Date().toISOString()
    };
    
    this.info(message, meta);
};

// Cleanup old logs
logger.cleanup = async function() {
    try {
        const files = await fs.readdir(logDir);
        const logFiles = files.filter(file => file.endsWith('.log'));
        
        for (const file of logFiles) {
            const filePath = path.join(logDir, file);
            const stats = await fs.stat(filePath);
            const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
            
            // Delete logs older than 30 days
            if (ageInDays > 30) {
                await fs.unlink(filePath);
                this.info(`Deleted old log file: ${file}`);
            }
        }
    } catch (error) {
        this.error('Failed to cleanup old logs:', error);
    }
};

// Schedule daily log cleanup
setInterval(() => {
    logger.cleanup();
}, 24 * 60 * 60 * 1000); // Run daily

module.exports = logger;
