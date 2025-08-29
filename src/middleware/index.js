const messageCapture = require('./messageCapture');
const accessFilter = require('./accessFilter');
const loadingReaction = require('./loadingReaction');
const mediaDownloader = require('./mediaDownloader');
const gameStateManager = require('./gameStateManager');
const allowedCommands = require('./allowedCommands');
const errorRecovery = require('./errorRecovery');

class MiddlewareManager {
    constructor() {
        this.middlewares = [];
        this.isInitialized = false;
    }

    async initialize(dependencies) {
        try {
            console.log('🔧 Initializing middleware stack...');

            // Initialize all middleware modules
            await messageCapture.initialize(dependencies);
            await accessFilter.initialize(dependencies);
            await loadingReaction.initialize(dependencies);
            await mediaDownloader.initialize(dependencies);
            await gameStateManager.initialize(dependencies);
            await allowedCommands.initialize(dependencies);
            await errorRecovery.initialize(dependencies);

            // Register middleware in execution order
            this.middlewares = [
                { name: 'messageCapture', handler: messageCapture },
                { name: 'errorRecovery', handler: errorRecovery },
                { name: 'accessFilter', handler: accessFilter },
                { name: 'gameStateManager', handler: gameStateManager },
                { name: 'allowedCommands', handler: allowedCommands },
                { name: 'loadingReaction', handler: loadingReaction },
                { name: 'mediaDownloader', handler: mediaDownloader }
            ];

            this.isInitialized = true;
            console.log(`✅ Middleware stack initialized with ${this.middlewares.length} middleware`);

        } catch (error) {
            console.error('❌ Failed to initialize middleware stack:', error);
            throw error;
        }
    }

    async processMessage(message, context = {}) {
        if (!this.isInitialized) {
            throw new Error('Middleware stack not initialized');
        }

        let middlewareContext = {
            ...context,
            message: message,
            stopPropagation: false,
            skipRemaining: false
        };

        try {
            // Execute middleware in order
            for (const middleware of this.middlewares) {
                try {
                    // Check if middleware should be skipped
                    if (middlewareContext.skipRemaining) {
                        break;
                    }

                    // Execute middleware
                    const result = await middleware.handler.process(message, middlewareContext);
                    
                    // Update context with result
                    if (result && typeof result === 'object') {
                        middlewareContext = { ...middlewareContext, ...result };
                    }

                    // Check for stop propagation
                    if (middlewareContext.stopPropagation) {
                        console.log(`🛑 Message processing stopped by middleware: ${middleware.name}`);
                        break;
                    }

                } catch (error) {
                    console.error(`❌ Error in middleware '${middleware.name}':`, error);
                    
                    // Allow error recovery middleware to handle it
                    if (middleware.name !== 'errorRecovery') {
                        middlewareContext.error = error;
                        middlewareContext.failedMiddleware = middleware.name;
                    } else {
                        throw error; // If error recovery fails, propagate error
                    }
                }
            }

            return middlewareContext;

        } catch (error) {
            console.error('❌ Fatal error in middleware stack:', error);
            throw error;
        }
    }

    getMiddlewareStats() {
        return {
            totalMiddleware: this.middlewares.length,
            initialized: this.isInitialized,
            middleware: this.middlewares.map(mw => ({
                name: mw.name,
                stats: mw.handler.getStats ? mw.handler.getStats() : null
            }))
        };
    }

    async shutdown() {
        try {
            console.log('🛑 Shutting down middleware stack...');

            // Shutdown all middleware in reverse order
            for (const middleware of this.middlewares.reverse()) {
                try {
                    if (middleware.handler.shutdown) {
                        await middleware.handler.shutdown();
                    }
                } catch (error) {
                    console.error(`❌ Error shutting down middleware '${middleware.name}':`, error);
                }
            }

            this.middlewares = [];
            this.isInitialized = false;

            console.log('✅ Middleware stack shutdown complete');

        } catch (error) {
            console.error('❌ Error during middleware shutdown:', error);
        }
    }
}

module.exports = new MiddlewareManager();
