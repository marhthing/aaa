const fs = require('fs-extra');
const path = require('path');
const { EventEmitter } = require('events');

class StorageService extends EventEmitter {
    constructor() {
        super();
        this.dataDir = './data';
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        this.isInitialized = false;
    }

    async initialize(dataDir = './data') {
        try {
            this.dataDir = dataDir;
            await fs.ensureDir(this.dataDir);
            
            // Create subdirectories
            const subdirs = ['messages', 'media', 'plugins', 'system', 'sessions'];
            for (const subdir of subdirs) {
                await fs.ensureDir(path.join(this.dataDir, subdir));
            }
            
            this.isInitialized = true;
            console.log('✅ Storage Service initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize Storage Service:', error);
            throw error;
        }
    }

    async save(namespace, key, data) {
        try {
            const filePath = this.getFilePath(namespace, key);
            await fs.ensureDir(path.dirname(filePath));
            
            const saveData = {
                data,
                timestamp: new Date().toISOString(),
                version: '1.0'
            };
            
            await fs.writeJson(filePath, saveData, { spaces: 2 });
            
            // Update cache
            this.cache.set(`${namespace}:${key}`, {
                data,
                timestamp: Date.now()
            });
            
            this.emit('data_saved', { namespace, key, data });
            return true;
            
        } catch (error) {
            console.error(`Error saving data to ${namespace}:${key}:`, error);
            this.emit('storage_error', { operation: 'save', namespace, key, error });
            return false;
        }
    }

    async load(namespace, key) {
        try {
            // Check cache first
            const cacheKey = `${namespace}:${key}`;
            const cached = this.cache.get(cacheKey);
            
            if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
                return cached.data;
            }
            
            // Load from file
            const filePath = this.getFilePath(namespace, key);
            
            if (!(await fs.pathExists(filePath))) {
                return null;
            }
            
            const fileData = await fs.readJson(filePath);
            const data = fileData.data || fileData; // Support both wrapped and unwrapped data
            
            // Update cache
            this.cache.set(cacheKey, {
                data,
                timestamp: Date.now()
            });
            
            this.emit('data_loaded', { namespace, key, data });
            return data;
            
        } catch (error) {
            console.error(`Error loading data from ${namespace}:${key}:`, error);
            this.emit('storage_error', { operation: 'load', namespace, key, error });
            return null;
        }
    }

    async exists(namespace, key) {
        try {
            const filePath = this.getFilePath(namespace, key);
            return await fs.pathExists(filePath);
        } catch (error) {
            return false;
        }
    }

    async delete(namespace, key) {
        try {
            const filePath = this.getFilePath(namespace, key);
            
            if (await fs.pathExists(filePath)) {
                await fs.remove(filePath);
            }
            
            // Remove from cache
            this.cache.delete(`${namespace}:${key}`);
            
            this.emit('data_deleted', { namespace, key });
            return true;
            
        } catch (error) {
            console.error(`Error deleting data from ${namespace}:${key}:`, error);
            this.emit('storage_error', { operation: 'delete', namespace, key, error });
            return false;
        }
    }

    async list(namespace) {
        try {
            const namespacePath = path.join(this.dataDir, namespace);
            
            if (!(await fs.pathExists(namespacePath))) {
                return [];
            }
            
            const files = await fs.readdir(namespacePath);
            return files
                .filter(file => file.endsWith('.json'))
                .map(file => file.replace('.json', ''));
                
        } catch (error) {
            console.error(`Error listing data in namespace ${namespace}:`, error);
            return [];
        }
    }

    async saveBuffer(namespace, key, buffer, metadata = {}) {
        try {
            const filePath = this.getFilePath(namespace, key, '.bin');
            await fs.ensureDir(path.dirname(filePath));
            
            // Save buffer
            await fs.writeFile(filePath, buffer);
            
            // Save metadata
            const metadataPath = this.getFilePath(namespace, key + '_metadata');
            await fs.writeJson(metadataPath, {
                ...metadata,
                size: buffer.length,
                timestamp: new Date().toISOString()
            });
            
            this.emit('buffer_saved', { namespace, key, size: buffer.length });
            return true;
            
        } catch (error) {
            console.error(`Error saving buffer to ${namespace}:${key}:`, error);
            return false;
        }
    }

    async loadBuffer(namespace, key) {
        try {
            const filePath = this.getFilePath(namespace, key, '.bin');
            
            if (!(await fs.pathExists(filePath))) {
                return null;
            }
            
            return await fs.readFile(filePath);
            
        } catch (error) {
            console.error(`Error loading buffer from ${namespace}:${key}:`, error);
            return null;
        }
    }

    async getMetadata(namespace, key) {
        try {
            return await this.load(namespace, key + '_metadata');
        } catch (error) {
            return null;
        }
    }

    getFilePath(namespace, key, extension = '.json') {
        return path.join(this.dataDir, namespace, `${key}${extension}`);
    }

    clearCache() {
        this.cache.clear();
        this.emit('cache_cleared');
    }

    getCacheStats() {
        return {
            size: this.cache.size,
            timeout: this.cacheTimeout,
            keys: Array.from(this.cache.keys())
        };
    }

    async getStorageStats() {
        try {
            const stats = {
                totalSize: 0,
                fileCount: 0,
                namespaces: {}
            };
            
            const namespaces = await fs.readdir(this.dataDir);
            
            for (const namespace of namespaces) {
                const namespacePath = path.join(this.dataDir, namespace);
                const stat = await fs.stat(namespacePath);
                
                if (stat.isDirectory()) {
                    const namespaceStats = await this.getNamespaceStats(namespacePath);
                    stats.namespaces[namespace] = namespaceStats;
                    stats.totalSize += namespaceStats.size;
                    stats.fileCount += namespaceStats.fileCount;
                }
            }
            
            return stats;
            
        } catch (error) {
            console.error('Error getting storage stats:', error);
            return null;
        }
    }

    async getNamespaceStats(namespacePath) {
        let size = 0;
        let fileCount = 0;
        
        try {
            const files = await fs.readdir(namespacePath);
            
            for (const file of files) {
                const filePath = path.join(namespacePath, file);
                const stat = await fs.stat(filePath);
                
                if (stat.isFile()) {
                    size += stat.size;
                    fileCount++;
                }
            }
        } catch (error) {
            // Directory might not exist or be accessible
        }
        
        return { size, fileCount };
    }

    async cleanup(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 days default
        try {
            let deletedCount = 0;
            const cutoffTime = Date.now() - maxAge;
            
            const namespaces = await fs.readdir(this.dataDir);
            
            for (const namespace of namespaces) {
                const namespacePath = path.join(this.dataDir, namespace);
                
                if ((await fs.stat(namespacePath)).isDirectory()) {
                    const files = await fs.readdir(namespacePath);
                    
                    for (const file of files) {
                        const filePath = path.join(namespacePath, file);
                        const stat = await fs.stat(filePath);
                        
                        if (stat.isFile() && stat.mtime.getTime() < cutoffTime) {
                            await fs.remove(filePath);
                            deletedCount++;
                            
                            // Remove from cache
                            const key = file.replace('.json', '');
                            this.cache.delete(`${namespace}:${key}`);
                        }
                    }
                }
            }
            
            this.emit('cleanup_completed', { deletedCount });
            return deletedCount;
            
        } catch (error) {
            console.error('Error during storage cleanup:', error);
            return 0;
        }
    }

    async backup(backupPath) {
        try {
            await fs.copy(this.dataDir, backupPath);
            this.emit('backup_created', { backupPath });
            return true;
        } catch (error) {
            console.error('Error creating backup:', error);
            return false;
        }
    }

    async restore(backupPath) {
        try {
            await fs.copy(backupPath, this.dataDir);
            this.clearCache(); // Clear cache after restore
            this.emit('backup_restored', { backupPath });
            return true;
        } catch (error) {
            console.error('Error restoring backup:', error);
            return false;
        }
    }
}

// Export singleton instance
module.exports = new StorageService();
