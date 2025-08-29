const fs = require('fs-extra');
const path = require('path');

class PerformanceMonitor {
    constructor() {
        this.metricsPath = path.join(process.cwd(), 'data', 'system', 'performance.json');
        this.metrics = {
            startTime: Date.now(),
            totalMessages: 0,
            totalCommands: 0,
            totalPluginLoads: 0,
            totalErrors: 0,
            commandExecutionTimes: new Map(),
            pluginLoadTimes: new Map(),
            memoryUsage: [],
            cpuUsage: [],
            responseTime: [],
            errorHistory: [],
            systemHealth: {
                status: 'healthy',
                lastCheck: null,
                issues: []
            }
        };
        
        this.monitoringInterval = null;
        this.saveInterval = null;
        this.maxHistorySize = 1000;
        this.isMonitoring = false;
    }

    async initialize() {
        try {
            console.log('🔧 Initializing performance monitor...');

            // Ensure data directory exists
            await fs.ensureDir(path.dirname(this.metricsPath));

            // Load existing metrics
            await this.loadMetrics();

            // Start monitoring
            this.startMonitoring();

            // Start periodic save
            this.startPeriodicSave();

            console.log('✅ Performance monitor initialized');

        } catch (error) {
            console.error('❌ Failed to initialize performance monitor:', error);
            throw error;
        }
    }

    async loadMetrics() {
        try {
            if (await fs.pathExists(this.metricsPath)) {
                const savedMetrics = await fs.readJson(this.metricsPath);
                
                // Merge with current metrics, preserving Maps
                Object.assign(this.metrics, savedMetrics);
                
                // Convert arrays back to Maps
                if (savedMetrics.commandExecutionTimes) {
                    this.metrics.commandExecutionTimes = new Map(savedMetrics.commandExecutionTimes);
                }
                if (savedMetrics.pluginLoadTimes) {
                    this.metrics.pluginLoadTimes = new Map(savedMetrics.pluginLoadTimes);
                }

                console.log('📊 Loaded existing performance metrics');
            }
        } catch (error) {
            console.error('⚠️ Failed to load performance metrics, starting fresh:', error);
        }
    }

    async saveMetrics() {
        try {
            const metricsToSave = {
                ...this.metrics,
                commandExecutionTimes: Array.from(this.metrics.commandExecutionTimes.entries()),
                pluginLoadTimes: Array.from(this.metrics.pluginLoadTimes.entries()),
                lastSaved: new Date().toISOString()
            };

            await fs.writeJson(this.metricsPath, metricsToSave, { spaces: 2 });
        } catch (error) {
            console.error('❌ Failed to save performance metrics:', error);
        }
    }

    startMonitoring() {
        if (this.isMonitoring) {
            return;
        }

        this.isMonitoring = true;
        
        // Monitor system metrics every 30 seconds
        this.monitoringInterval = setInterval(() => {
            this.collectSystemMetrics();
        }, 30000);

        console.log('👀 Started performance monitoring');
    }

    startPeriodicSave() {
        // Save metrics every 5 minutes
        this.saveInterval = setInterval(async () => {
            await this.saveMetrics();
        }, 5 * 60 * 1000);
    }

    collectSystemMetrics() {
        try {
            // Memory usage
            const memUsage = process.memoryUsage();
            this.addMemoryUsage({
                timestamp: Date.now(),
                rss: memUsage.rss,
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                external: memUsage.external
            });

            // CPU usage (approximation)
            const cpuUsage = process.cpuUsage();
            this.addCpuUsage({
                timestamp: Date.now(),
                user: cpuUsage.user,
                system: cpuUsage.system
            });

            // Health check
            this.performHealthCheck();

        } catch (error) {
            console.error('❌ Error collecting system metrics:', error);
        }
    }

    addMemoryUsage(usage) {
        this.metrics.memoryUsage.push(usage);
        
        // Keep only recent entries
        if (this.metrics.memoryUsage.length > this.maxHistorySize) {
            this.metrics.memoryUsage.shift();
        }
    }

    addCpuUsage(usage) {
        this.metrics.cpuUsage.push(usage);
        
        // Keep only recent entries
        if (this.metrics.cpuUsage.length > this.maxHistorySize) {
            this.metrics.cpuUsage.shift();
        }
    }

    recordMessageProcessed() {
        this.metrics.totalMessages++;
    }

    recordCommandExecuted(commandName, executionTime) {
        this.metrics.totalCommands++;
        
        // Store command execution time
        if (!this.metrics.commandExecutionTimes.has(commandName)) {
            this.metrics.commandExecutionTimes.set(commandName, []);
        }
        
        const times = this.metrics.commandExecutionTimes.get(commandName);
        times.push({
            timestamp: Date.now(),
            duration: executionTime
        });

        // Keep only recent times
        if (times.length > 100) {
            times.shift();
        }
    }

    recordPluginLoad(pluginName, loadTime) {
        this.metrics.totalPluginLoads++;
        
        this.metrics.pluginLoadTimes.set(pluginName, {
            timestamp: Date.now(),
            duration: loadTime
        });
    }

    recordError(error, context = {}) {
        this.metrics.totalErrors++;
        
        const errorRecord = {
            timestamp: Date.now(),
            message: error.message,
            stack: error.stack,
            context: context
        };

        this.metrics.errorHistory.push(errorRecord);

        // Keep only recent errors
        if (this.metrics.errorHistory.length > this.maxHistorySize) {
            this.metrics.errorHistory.shift();
        }

        // Update health status
        this.updateHealthStatus();
    }

    recordResponseTime(duration) {
        this.metrics.responseTime.push({
            timestamp: Date.now(),
            duration: duration
        });

        // Keep only recent response times
        if (this.metrics.responseTime.length > this.maxHistorySize) {
            this.metrics.responseTime.shift();
        }
    }

    performHealthCheck() {
        const issues = [];
        const memUsage = process.memoryUsage();
        
        // Check memory usage
        const memUsageMB = memUsage.rss / 1024 / 1024;
        if (memUsageMB > 500) { // 500MB threshold
            issues.push(`High memory usage: ${memUsageMB.toFixed(2)}MB`);
        }

        // Check error rate (last 10 minutes)
        const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
        const recentErrors = this.metrics.errorHistory.filter(e => e.timestamp > tenMinutesAgo);
        if (recentErrors.length > 10) {
            issues.push(`High error rate: ${recentErrors.length} errors in last 10 minutes`);
        }

        // Check response time
        const recentResponseTimes = this.metrics.responseTime.slice(-50);
        if (recentResponseTimes.length > 0) {
            const avgResponseTime = recentResponseTimes.reduce((sum, rt) => sum + rt.duration, 0) / recentResponseTimes.length;
            if (avgResponseTime > 5000) { // 5 seconds threshold
                issues.push(`Slow response time: ${avgResponseTime.toFixed(2)}ms average`);
            }
        }

        // Update health status
        this.metrics.systemHealth = {
            status: issues.length > 0 ? 'warning' : 'healthy',
            lastCheck: new Date().toISOString(),
            issues: issues
        };
    }

    updateHealthStatus() {
        // Quick health status update based on recent activity
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        const recentErrors = this.metrics.errorHistory.filter(e => e.timestamp > fiveMinutesAgo);
        
        if (recentErrors.length > 5) {
            this.metrics.systemHealth.status = 'critical';
        } else if (recentErrors.length > 2) {
            this.metrics.systemHealth.status = 'warning';
        }
    }

    getMetrics() {
        const uptime = Date.now() - this.metrics.startTime;
        const memUsage = process.memoryUsage();
        
        return {
            uptime: uptime,
            uptimeFormatted: this.formatUptime(uptime),
            totalMessages: this.metrics.totalMessages,
            totalCommands: this.metrics.totalCommands,
            totalPluginLoads: this.metrics.totalPluginLoads,
            totalErrors: this.metrics.totalErrors,
            systemHealth: this.metrics.systemHealth,
            currentMemory: {
                rss: this.formatBytes(memUsage.rss),
                heapUsed: this.formatBytes(memUsage.heapUsed),
                heapTotal: this.formatBytes(memUsage.heapTotal)
            },
            averageResponseTime: this.getAverageResponseTime(),
            topCommands: this.getTopCommands(),
            recentErrors: this.metrics.errorHistory.slice(-10)
        };
    }

    getDetailedMetrics() {
        return {
            ...this.getMetrics(),
            memoryHistory: this.metrics.memoryUsage.slice(-100),
            cpuHistory: this.metrics.cpuUsage.slice(-100),
            responseTimeHistory: this.metrics.responseTime.slice(-100),
            commandExecutionTimes: Object.fromEntries(this.metrics.commandExecutionTimes),
            pluginLoadTimes: Object.fromEntries(this.metrics.pluginLoadTimes),
            errorHistory: this.metrics.errorHistory.slice(-50)
        };
    }

    getAverageResponseTime() {
        const recentTimes = this.metrics.responseTime.slice(-100);
        if (recentTimes.length === 0) return 0;
        
        const total = recentTimes.reduce((sum, rt) => sum + rt.duration, 0);
        return Math.round(total / recentTimes.length);
    }

    getTopCommands() {
        const commandStats = [];
        
        for (const [command, times] of this.metrics.commandExecutionTimes) {
            if (times.length > 0) {
                const totalTime = times.reduce((sum, t) => sum + t.duration, 0);
                const avgTime = totalTime / times.length;
                
                commandStats.push({
                    command: command,
                    executions: times.length,
                    averageTime: Math.round(avgTime),
                    totalTime: totalTime
                });
            }
        }

        return commandStats
            .sort((a, b) => b.executions - a.executions)
            .slice(0, 10);
    }

    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    formatBytes(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }

    generateReport() {
        const metrics = this.getDetailedMetrics();
        
        return {
            reportGeneratedAt: new Date().toISOString(),
            summary: {
                status: metrics.systemHealth.status,
                uptime: metrics.uptimeFormatted,
                totalMessages: metrics.totalMessages,
                totalCommands: metrics.totalCommands,
                totalErrors: metrics.totalErrors,
                averageResponseTime: `${metrics.averageResponseTime}ms`
            },
            performance: {
                memoryUsage: metrics.currentMemory,
                topCommands: metrics.topCommands,
                systemHealth: metrics.systemHealth
            },
            recommendations: this.generateRecommendations(metrics)
        };
    }

    generateRecommendations(metrics) {
        const recommendations = [];
        
        // Memory recommendations
        const memUsageMB = process.memoryUsage().rss / 1024 / 1024;
        if (memUsageMB > 300) {
            recommendations.push({
                type: 'memory',
                severity: 'warning',
                message: 'Consider restarting the bot to free up memory',
                action: 'restart'
            });
        }

        // Error rate recommendations
        if (metrics.totalErrors > 50) {
            recommendations.push({
                type: 'errors',
                severity: 'high',
                message: 'High error count detected, check logs for issues',
                action: 'investigate'
            });
        }

        // Response time recommendations
        if (metrics.averageResponseTime > 3000) {
            recommendations.push({
                type: 'performance',
                severity: 'medium',
                message: 'Slow response times detected, optimize command handlers',
                action: 'optimize'
            });
        }

        return recommendations;
    }

    stop() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        if (this.saveInterval) {
            clearInterval(this.saveInterval);
            this.saveInterval = null;
        }

        this.isMonitoring = false;
        console.log('🛑 Stopped performance monitoring');
    }

    async shutdown() {
        try {
            console.log('🛑 Shutting down performance monitor...');

            this.stop();
            await this.saveMetrics();

            console.log('✅ Performance monitor shutdown complete');

        } catch (error) {
            console.error('❌ Error during performance monitor shutdown:', error);
        }
    }
}

module.exports = PerformanceMonitor;
