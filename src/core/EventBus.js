const EventEmitter = require('events');

class EventBus extends EventEmitter {
    constructor() {
        super();
        this.eventHistory = [];
        this.maxHistorySize = 1000;
        this.listeners = new Map(); // eventName -> Set of listener info
        this.metrics = {
            totalEvents: 0,
            eventCounts: new Map(),
            errorCounts: new Map()
        };
    }

    emit(eventName, ...args) {
        try {
            // Record event in history
            this.recordEvent(eventName, args);

            // Update metrics
            this.metrics.totalEvents++;
            this.metrics.eventCounts.set(eventName, (this.metrics.eventCounts.get(eventName) || 0) + 1);

            // Emit the event
            return super.emit(eventName, ...args);

        } catch (error) {
            console.error(`❌ Error emitting event '${eventName}':`, error);
            this.metrics.errorCounts.set(eventName, (this.metrics.errorCounts.get(eventName) || 0) + 1);
            super.emit('error', { eventName, error, args });
            return false;
        }
    }

    recordEvent(eventName, args) {
        const eventRecord = {
            name: eventName,
            timestamp: new Date().toISOString(),
            data: this.sanitizeEventData(args)
        };

        this.eventHistory.push(eventRecord);

        // Maintain history size limit
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory.shift();
        }
    }

    sanitizeEventData(args) {
        // Remove sensitive data and large objects for history
        return args.map(arg => {
            if (arg && typeof arg === 'object') {
                if (arg.constructor.name === 'Message') {
                    return {
                        type: 'Message',
                        from: arg.from,
                        body: arg.body?.substring(0, 100),
                        hasMedia: arg.hasMedia
                    };
                }
                if (Buffer.isBuffer(arg)) {
                    return { type: 'Buffer', size: arg.length };
                }
                if (arg instanceof Error) {
                    return { type: 'Error', message: arg.message };
                }
                return { type: arg.constructor.name };
            }
            return arg;
        });
    }

    on(eventName, listener) {
        // Track listener registration
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, new Set());
        }
        
        this.listeners.get(eventName).add({
            listener,
            registeredAt: new Date().toISOString()
        });

        return super.on(eventName, listener);
    }

    once(eventName, listener) {
        // Track one-time listener registration
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, new Set());
        }
        
        this.listeners.get(eventName).add({
            listener,
            registeredAt: new Date().toISOString(),
            once: true
        });

        return super.once(eventName, listener);
    }

    off(eventName, listener) {
        // Remove from tracking
        if (this.listeners.has(eventName)) {
            const listenerSet = this.listeners.get(eventName);
            for (const listenerInfo of listenerSet) {
                if (listenerInfo.listener === listener) {
                    listenerSet.delete(listenerInfo);
                    break;
                }
            }
        }

        return super.off(eventName, listener);
    }

    removeAllListeners(eventName) {
        // Clear tracking
        if (eventName) {
            this.listeners.delete(eventName);
        } else {
            this.listeners.clear();
        }

        return super.removeAllListeners(eventName);
    }

    getEventHistory(limit = 50) {
        return this.eventHistory.slice(-limit);
    }

    getEventsByName(eventName, limit = 50) {
        return this.eventHistory
            .filter(event => event.name === eventName)
            .slice(-limit);
    }

    getRecentEvents(minutes = 5) {
        const cutoff = new Date(Date.now() - minutes * 60 * 1000);
        return this.eventHistory.filter(event => new Date(event.timestamp) > cutoff);
    }

    getMetrics() {
        return {
            totalEvents: this.metrics.totalEvents,
            uniqueEventTypes: this.metrics.eventCounts.size,
            eventCounts: Object.fromEntries(this.metrics.eventCounts),
            errorCounts: Object.fromEntries(this.metrics.errorCounts),
            totalListeners: Array.from(this.listeners.values())
                .reduce((total, listeners) => total + listeners.size, 0),
            listenersByEvent: Object.fromEntries(
                Array.from(this.listeners.entries()).map(([eventName, listeners]) => 
                    [eventName, listeners.size]
                )
            ),
            historySize: this.eventHistory.length,
            maxHistorySize: this.maxHistorySize
        };
    }

    clearHistory() {
        this.eventHistory = [];
        console.log('🧹 Cleared event history');
    }

    clearMetrics() {
        this.metrics = {
            totalEvents: 0,
            eventCounts: new Map(),
            errorCounts: new Map()
        };
        console.log('🧹 Cleared event metrics');
    }

    // High-level event emitters for common bot events
    emitMessageReceived(message) {
        this.emit('message:received', message);
    }

    emitMessageSent(message) {
        this.emit('message:sent', message);
    }

    emitCommandExecuted(command, message, result) {
        this.emit('command:executed', { command, message, result });
    }

    emitCommandError(command, message, error) {
        this.emit('command:error', { command, message, error });
    }

    emitPluginLoaded(plugin) {
        this.emit('plugin:loaded', plugin);
    }

    emitPluginUnloaded(plugin) {
        this.emit('plugin:unloaded', plugin);
    }

    emitPluginError(plugin, error) {
        this.emit('plugin:error', { plugin, error });
    }

    emitGameStarted(game, chat) {
        this.emit('game:started', { game, chat });
    }

    emitGameEnded(game, chat, result) {
        this.emit('game:ended', { game, chat, result });
    }

    emitMediaDownloaded(media, message) {
        this.emit('media:downloaded', { media, message });
    }

    emitAccessDenied(message, reason) {
        this.emit('access:denied', { message, reason });
    }
}

module.exports = EventBus;
