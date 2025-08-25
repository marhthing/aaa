/**
 * MatDev Cache Utility
 * In-memory caching system with TTL support
 */

const logger = require('./logger');

class Cache {
    constructor() {
        this.cache = new Map();
        this.timers = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0
        };
        
        // Cleanup expired entries every minute
        setInterval(() => this.cleanup(), 60000);
        
        logger.debug('🗄️ Cache system initialized');
    }
    
    /**
     * Set a value in cache with optional TTL
     */
    set(key, value, ttl = null) {
        try {
            // Clear existing timer if any
            if (this.timers.has(key)) {
                clearTimeout(this.timers.get(key));
                this.timers.delete(key);
            }
            
            // Store value with metadata
            this.cache.set(key, {
                value,
                createdAt: Date.now(),
                ttl,
                accessCount: 0
            });
            
            // Set expiration timer if TTL is specified
            if (ttl && ttl > 0) {
                const timer = setTimeout(() => {
                    this.delete(key);
                }, ttl);
                
                this.timers.set(key, timer);
            }
            
            this.stats.sets++;
            logger.debug(`📦 Cache SET: ${key} (TTL: ${ttl || 'none'})`);
            
            return true;
        } catch (error) {
            logger.error('Cache set error:', error);
            return false;
        }
    }
    
    /**
     * Get a value from cache
     */
    get(key) {
        try {
            const entry = this.cache.get(key);
            
            if (!entry) {
                this.stats.misses++;
                return null;
            }
            
            // Check if expired
            if (this.isExpired(key, entry)) {
                this.delete(key);
                this.stats.misses++;
                return null;
            }
            
            // Update access statistics
            entry.accessCount++;
            entry.lastAccessedAt = Date.now();
            
            this.stats.hits++;
            logger.debug(`📦 Cache HIT: ${key}`);
            
            return entry.value;
        } catch (error) {
            logger.error('Cache get error:', error);
            this.stats.misses++;
            return null;
        }
    }
    
    /**
     * Check if a key exists in cache
     */
    has(key) {
        const entry = this.cache.get(key);
        
        if (!entry) {
            return false;
        }
        
        if (this.isExpired(key, entry)) {
            this.delete(key);
            return false;
        }
        
        return true;
    }
    
    /**
     * Delete a value from cache
     */
    delete(key) {
        try {
            const deleted = this.cache.delete(key);
            
            if (this.timers.has(key)) {
                clearTimeout(this.timers.get(key));
                this.timers.delete(key);
            }
            
            if (deleted) {
                this.stats.deletes++;
                logger.debug(`🗑️ Cache DELETE: ${key}`);
            }
            
            return deleted;
        } catch (error) {
            logger.error('Cache delete error:', error);
            return false;
        }
    }
    
    /**
     * Clear all cache entries
     */
    clear() {
        try {
            // Clear all timers
            for (const timer of this.timers.values()) {
                clearTimeout(timer);
            }
            
            this.cache.clear();
            this.timers.clear();
            
            logger.info('🧹 Cache cleared');
            return true;
        } catch (error) {
            logger.error('Cache clear error:', error);
            return false;
        }
    }
    
    /**
     * Get or set a value (lazy loading pattern)
     */
    async getOrSet(key, factory, ttl = null) {
        try {
            let value = this.get(key);
            
            if (value === null) {
                // Value not in cache, generate it
                if (typeof factory === 'function') {
                    value = await factory();
                } else {
                    value = factory;
                }
                
                if (value !== null && value !== undefined) {
                    this.set(key, value, ttl);
                }
            }
            
            return value;
        } catch (error) {
            logger.error('Cache getOrSet error:', error);
            return null;
        }
    }
    
    /**
     * Check if entry is expired
     */
    isExpired(key, entry) {
        if (!entry.ttl) {
            return false; // No TTL set
        }
        
        const age = Date.now() - entry.createdAt;
        return age > entry.ttl;
    }
    
    /**
     * Get all keys in cache
     */
    keys() {
        return Array.from(this.cache.keys());
    }
    
    /**
     * Get cache size
     */
    size() {
        return this.cache.size;
    }
    
    /**
     * Get cache statistics
     */
    getStats() {
        const totalRequests = this.stats.hits + this.stats.misses;
        const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests * 100).toFixed(2) : 0;
        
        return {
            ...this.stats,
            size: this.size(),
            timers: this.timers.size,
            hitRate: `${hitRate}%`,
            memoryUsage: this.getMemoryUsage()
        };
    }
    
    /**
     * Get approximate memory usage
     */
    getMemoryUsage() {
        try {
            let totalSize = 0;
            
            for (const [key, entry] of this.cache) {
                totalSize += this.sizeof(key) + this.sizeof(entry);
            }
            
            return {
                bytes: totalSize,
                kb: (totalSize / 1024).toFixed(2),
                mb: (totalSize / (1024 * 1024)).toFixed(2)
            };
        } catch (error) {
            return { bytes: 0, kb: '0.00', mb: '0.00' };
        }
    }
    
    /**
     * Rough calculation of object size in bytes
     */
    sizeof(obj) {
        let bytes = 0;
        
        function sizeOf(obj) {
            if (obj !== null && obj !== undefined) {
                switch (typeof obj) {
                    case 'number':
                        bytes += 8;
                        break;
                    case 'string':
                        bytes += obj.length * 2;
                        break;
                    case 'boolean':
                        bytes += 4;
                        break;
                    case 'object':
                        if (obj instanceof Array) {
                            obj.forEach(sizeOf);
                        } else {
                            for (const key in obj) {
                                if (obj.hasOwnProperty(key)) {
                                    sizeOf(obj[key]);
                                    bytes += key.length * 2;
                                }
                            }
                        }
                        break;
                }
            }
            return bytes;
        }
        
        return sizeOf(obj);
    }
    
    /**
     * Cleanup expired entries
     */
    cleanup() {
        try {
            let cleanedCount = 0;
            const now = Date.now();
            
            for (const [key, entry] of this.cache) {
                if (this.isExpired(key, entry)) {
                    this.delete(key);
                    cleanedCount++;
                }
            }
            
            if (cleanedCount > 0) {
                logger.debug(`🧹 Cache cleanup: removed ${cleanedCount} expired entries`);
            }
        } catch (error) {
            logger.error('Cache cleanup error:', error);
        }
    }
    
    /**
     * Get cache entries by pattern
     */
    getByPattern(pattern) {
        const regex = new RegExp(pattern);
        const results = {};
        
        for (const [key, entry] of this.cache) {
            if (regex.test(key) && !this.isExpired(key, entry)) {
                results[key] = entry.value;
            }
        }
        
        return results;
    }
    
    /**
     * Delete entries by pattern
     */
    deleteByPattern(pattern) {
        const regex = new RegExp(pattern);
        let deletedCount = 0;
        
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.delete(key);
                deletedCount++;
            }
        }
        
        logger.debug(`🗑️ Cache pattern delete: removed ${deletedCount} entries`);
        return deletedCount;
    }
    
    /**
     * Export cache data
     */
    export() {
        const data = {};
        
        for (const [key, entry] of this.cache) {
            if (!this.isExpired(key, entry)) {
                data[key] = {
                    value: entry.value,
                    createdAt: entry.createdAt,
                    ttl: entry.ttl
                };
            }
        }
        
        return data;
    }
    
    /**
     * Import cache data
     */
    import(data) {
        try {
            let importedCount = 0;
            
            for (const [key, entry] of Object.entries(data)) {
                const ttl = entry.ttl ? Math.max(0, entry.ttl - (Date.now() - entry.createdAt)) : null;
                
                if (!ttl || ttl > 0) {
                    this.set(key, entry.value, ttl);
                    importedCount++;
                }
            }
            
            logger.info(`📥 Cache import: imported ${importedCount} entries`);
            return importedCount;
        } catch (error) {
            logger.error('Cache import error:', error);
            return 0;
        }
    }
}

module.exports = Cache;
