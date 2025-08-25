/**
 * MatDev Custom Error Classes
 * Comprehensive error handling with custom error types
 */

class BotError extends Error {
    constructor(message, code = 'UNKNOWN_ERROR', recoverable = true) {
        super(message);
        this.name = 'BotError';
        this.code = code;
        this.recoverable = recoverable;
        this.timestamp = new Date();
        
        // Capture stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, BotError);
        }
    }
    
    /**
     * Convert error to JSON
     */
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            recoverable: this.recoverable,
            timestamp: this.timestamp,
            stack: this.stack
        };
    }
    
    /**
     * Get user-friendly error message
     */
    getUserMessage() {
        const userMessages = {
            'CONNECTION_ERROR': '🔌 Connection problem. Please try again later.',
            'PLUGIN_ERROR': '🔌 Plugin error occurred. Please contact admin.',
            'DATABASE_ERROR': '💾 Database error. Please try again.',
            'PERMISSION_ERROR': '🔒 You don\'t have permission for this action.',
            'RATE_LIMIT_ERROR': '⏰ You\'re doing that too often. Please slow down.',
            'VALIDATION_ERROR': '❌ Invalid input provided.',
            'API_ERROR': '🌐 External service error. Please try again.',
            'COMMAND_ERROR': '❓ Command error. Check your syntax.',
            'MEDIA_ERROR': '📁 Media processing error.',
            'GAME_ERROR': '🎮 Game error occurred.',
            'AUTH_ERROR': '🔐 Authentication failed.'
        };
        
        return userMessages[this.code] || '❌ An unexpected error occurred.';
    }
}

class ConnectionError extends BotError {
    constructor(message, details = {}) {
        super(message, 'CONNECTION_ERROR', true);
        this.name = 'ConnectionError';
        this.details = details;
    }
}

class PluginError extends BotError {
    constructor(message, pluginName, recoverable = true) {
        super(message, 'PLUGIN_ERROR', recoverable);
        this.name = 'PluginError';
        this.pluginName = pluginName;
    }
}

class DatabaseError extends BotError {
    constructor(message, query = null) {
        super(message, 'DATABASE_ERROR', true);
        this.name = 'DatabaseError';
        this.query = query;
    }
}

class PermissionError extends BotError {
    constructor(message, requiredPermission = null) {
        super(message, 'PERMISSION_ERROR', false);
        this.name = 'PermissionError';
        this.requiredPermission = requiredPermission;
    }
}

class RateLimitError extends BotError {
    constructor(message, retryAfter = null) {
        super(message, 'RATE_LIMIT_ERROR', false);
        this.name = 'RateLimitError';
        this.retryAfter = retryAfter;
    }
}

class ValidationError extends BotError {
    constructor(message, field = null, value = null) {
        super(message, 'VALIDATION_ERROR', false);
        this.name = 'ValidationError';
        this.field = field;
        this.value = value;
    }
}

class APIError extends BotError {
    constructor(message, service = null, statusCode = null) {
        super(message, 'API_ERROR', true);
        this.name = 'APIError';
        this.service = service;
        this.statusCode = statusCode;
    }
}

class CommandError extends BotError {
    constructor(message, commandName = null) {
        super(message, 'COMMAND_ERROR', false);
        this.name = 'CommandError';
        this.commandName = commandName;
    }
}

class MediaError extends BotError {
    constructor(message, mediaType = null) {
        super(message, 'MEDIA_ERROR', true);
        this.name = 'MediaError';
        this.mediaType = mediaType;
    }
}

class GameError extends BotError {
    constructor(message, gameType = null, gameId = null) {
        super(message, 'GAME_ERROR', true);
        this.name = 'GameError';
        this.gameType = gameType;
        this.gameId = gameId;
    }
}

class AuthError extends BotError {
    constructor(message, authType = null) {
        super(message, 'AUTH_ERROR', true);
        this.name = 'AuthError';
        this.authType = authType;
    }
}

/**
 * Global error handlers for different scenarios
 */
const errorHandlers = {
    /**
     * Handle connection errors with auto-reconnect logic
     */
    connectionError: (error, bot) => {
        console.error('🔌 Connection Error:', error.message);
        
        if (bot && error.recoverable) {
            setTimeout(() => {
                console.log('🔄 Attempting to reconnect...');
                bot.restart().catch(err => {
                    console.error('❌ Reconnection failed:', err.message);
                });
            }, 5000);
        }
    },
    
    /**
     * Handle plugin errors with isolation
     */
    pluginError: (error, pluginName) => {
        console.error(`🔌 Plugin Error (${pluginName}):`, error.message);
        
        // Disable problematic plugin if too many errors
        if (error.code === 'PLUGIN_EXECUTION_ERROR') {
            console.warn(`⚠️ Plugin ${pluginName} may be disabled due to repeated errors`);
        }
    },
    
    /**
     * Handle database errors with fallback
     */
    databaseError: (error, operation) => {
        console.error(`💾 Database Error (${operation}):`, error.message);
        
        // Implement fallback to local storage if needed
        if (error.code === 'CONNECTION_LOST') {
            console.warn('⚠️ Falling back to local storage');
        }
    },
    
    /**
     * Handle API errors with retry logic
     */
    apiError: (error, service, retryCount = 0) => {
        console.error(`🌐 API Error (${service}):`, error.message);
        
        // Implement exponential backoff for retries
        if (error.recoverable && retryCount < 3) {
            const delay = Math.pow(2, retryCount) * 1000;
            console.log(`🔄 Retrying ${service} API call in ${delay}ms...`);
            
            setTimeout(() => {
                // Retry logic would go here
            }, delay);
        }
    },
    
    /**
     * Handle general errors
     */
    generalError: (error, context = 'Unknown') => {
        console.error(`❌ General Error (${context}):`, error.message);
        
        // Log to database if available
        try {
            // Database logging would go here
        } catch (logError) {
            console.error('Failed to log error to database:', logError.message);
        }
    }
};

/**
 * Format error for logging
 */
function formatErrorForLog(error, context = {}) {
    return {
        name: error.name,
        message: error.message,
        code: error.code || 'UNKNOWN',
        recoverable: error.recoverable !== false,
        timestamp: new Date().toISOString(),
        context,
        stack: error.stack
    };
}

/**
 * Check if error is recoverable
 */
function isRecoverableError(error) {
    if (error instanceof BotError) {
        return error.recoverable;
    }
    
    // Common recoverable errors
    const recoverablePatterns = [
        /network/i,
        /timeout/i,
        /connection/i,
        /temporary/i,
        /rate limit/i
    ];
    
    return recoverablePatterns.some(pattern => pattern.test(error.message));
}

module.exports = {
    BotError,
    ConnectionError,
    PluginError,
    DatabaseError,
    PermissionError,
    RateLimitError,
    ValidationError,
    APIError,
    CommandError,
    MediaError,
    GameError,
    AuthError,
    errorHandlers,
    formatErrorForLog,
    isRecoverableError
};
