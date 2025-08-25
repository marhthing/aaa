/**
 * MatDev Scheduler Utility
 * Cron-based scheduling system for automated tasks
 */

const logger = require('./logger');

class Scheduler {
    constructor(bot) {
        this.bot = bot;
        this.jobs = new Map();
        this.intervals = new Map();
        this.timeouts = new Map();
        this.isRunning = false;
        
        logger.info('⏰ Scheduler initialized');
    }
    
    /**
     * Start the scheduler
     */
    start() {
        this.isRunning = true;
        
        // Start periodic job checker
        this.mainInterval = setInterval(() => {
            this.checkJobs();
        }, 60000); // Check every minute
        
        logger.info('▶️ Scheduler started');
    }
    
    /**
     * Stop the scheduler
     */
    stop() {
        this.isRunning = false;
        
        // Clear main interval
        if (this.mainInterval) {
            clearInterval(this.mainInterval);
        }
        
        // Clear all jobs
        this.clearAllJobs();
        
        logger.info('⏹️ Scheduler stopped');
    }
    
    /**
     * Schedule a message to be sent at a specific time
     */
    scheduleMessage(jid, message, scheduleTime, options = {}) {
        try {
            const jobId = this.generateJobId();
            const delay = scheduleTime.getTime() - Date.now();
            
            if (delay <= 0) {
                throw new Error('Schedule time must be in the future');
            }
            
            const timeout = setTimeout(async () => {
                try {
                    await this.bot.sendMessage(jid, message, options);
                    logger.info(`📅 Scheduled message sent to ${jid}`);
                    
                    // Remove job after execution
                    this.removeJob(jobId);
                } catch (error) {
                    logger.error('Failed to send scheduled message:', error);
                }
            }, delay);
            
            const job = {
                id: jobId,
                type: 'message',
                jid,
                message,
                scheduleTime,
                options,
                createdAt: new Date(),
                status: 'pending'
            };
            
            this.jobs.set(jobId, job);
            this.timeouts.set(jobId, timeout);
            
            logger.info(`⏰ Message scheduled for ${scheduleTime.toISOString()}`);
            return jobId;
            
        } catch (error) {
            logger.error('Failed to schedule message:', error);
            throw error;
        }
    }
    
    /**
     * Schedule a recurring message (daily, weekly, etc.)
     */
    scheduleRecurringMessage(jid, message, pattern, options = {}) {
        try {
            const jobId = this.generateJobId();
            
            const job = {
                id: jobId,
                type: 'recurring',
                jid,
                message,
                pattern,
                options,
                createdAt: new Date(),
                lastRun: null,
                nextRun: this.calculateNextRun(pattern),
                status: 'active'
            };
            
            this.jobs.set(jobId, job);
            
            logger.info(`🔁 Recurring message scheduled: ${pattern}`);
            return jobId;
            
        } catch (error) {
            logger.error('Failed to schedule recurring message:', error);
            throw error;
        }
    }
    
    /**
     * Schedule a reminder
     */
    scheduleReminder(jid, reminder, scheduleTime, userJid) {
        const message = {
            text: `⏰ *Reminder:*\n${reminder}\n\n_Scheduled by @${userJid.split('@')[0]}_`
        };
        
        return this.scheduleMessage(jid, message, scheduleTime);
    }
    
    /**
     * Schedule a function to run at a specific time
     */
    scheduleFunction(func, scheduleTime, context = {}) {
        try {
            const jobId = this.generateJobId();
            const delay = scheduleTime.getTime() - Date.now();
            
            if (delay <= 0) {
                throw new Error('Schedule time must be in the future');
            }
            
            const timeout = setTimeout(async () => {
                try {
                    await func(context);
                    logger.info(`🔧 Scheduled function executed: ${jobId}`);
                    
                    // Remove job after execution
                    this.removeJob(jobId);
                } catch (error) {
                    logger.error('Failed to execute scheduled function:', error);
                }
            }, delay);
            
            const job = {
                id: jobId,
                type: 'function',
                func,
                scheduleTime,
                context,
                createdAt: new Date(),
                status: 'pending'
            };
            
            this.jobs.set(jobId, job);
            this.timeouts.set(jobId, timeout);
            
            return jobId;
            
        } catch (error) {
            logger.error('Failed to schedule function:', error);
            throw error;
        }
    }
    
    /**
     * Check and execute scheduled jobs
     */
    checkJobs() {
        if (!this.isRunning) return;
        
        const now = new Date();
        
        for (const [jobId, job] of this.jobs) {
            if (job.type === 'recurring' && job.status === 'active') {
                if (job.nextRun && now >= job.nextRun) {
                    this.executeRecurringJob(job);
                }
            }
        }
    }
    
    /**
     * Execute a recurring job
     */
    async executeRecurringJob(job) {
        try {
            await this.bot.sendMessage(job.jid, job.message, job.options);
            
            job.lastRun = new Date();
            job.nextRun = this.calculateNextRun(job.pattern, job.lastRun);
            
            logger.info(`🔁 Recurring job executed: ${job.id}`);
            
        } catch (error) {
            logger.error(`Failed to execute recurring job ${job.id}:`, error);
        }
    }
    
    /**
     * Calculate next run time based on pattern
     */
    calculateNextRun(pattern, from = new Date()) {
        const now = new Date(from);
        
        switch (pattern.type) {
            case 'daily':
                const daily = new Date(now);
                daily.setDate(daily.getDate() + 1);
                daily.setHours(pattern.hour || 9, pattern.minute || 0, 0, 0);
                return daily;
                
            case 'weekly':
                const weekly = new Date(now);
                const daysUntilTarget = (pattern.dayOfWeek + 7 - weekly.getDay()) % 7;
                weekly.setDate(weekly.getDate() + (daysUntilTarget || 7));
                weekly.setHours(pattern.hour || 9, pattern.minute || 0, 0, 0);
                return weekly;
                
            case 'monthly':
                const monthly = new Date(now);
                monthly.setMonth(monthly.getMonth() + 1);
                monthly.setDate(pattern.dayOfMonth || 1);
                monthly.setHours(pattern.hour || 9, pattern.minute || 0, 0, 0);
                return monthly;
                
            case 'interval':
                return new Date(now.getTime() + pattern.milliseconds);
                
            default:
                throw new Error(`Unknown pattern type: ${pattern.type}`);
        }
    }
    
    /**
     * Remove a scheduled job
     */
    removeJob(jobId) {
        const job = this.jobs.get(jobId);
        
        if (job) {
            // Clear timeout if exists
            if (this.timeouts.has(jobId)) {
                clearTimeout(this.timeouts.get(jobId));
                this.timeouts.delete(jobId);
            }
            
            // Clear interval if exists
            if (this.intervals.has(jobId)) {
                clearInterval(this.intervals.get(jobId));
                this.intervals.delete(jobId);
            }
            
            // Remove job
            this.jobs.delete(jobId);
            
            logger.info(`🗑️ Job removed: ${jobId}`);
            return true;
        }
        
        return false;
    }
    
    /**
     * Get all scheduled jobs
     */
    getJobs() {
        const jobs = [];
        
        for (const job of this.jobs.values()) {
            jobs.push({
                ...job,
                func: undefined // Don't expose functions
            });
        }
        
        return jobs;
    }
    
    /**
     * Get jobs for a specific chat
     */
    getJobsForChat(jid) {
        return this.getJobs().filter(job => job.jid === jid);
    }
    
    /**
     * Pause a job
     */
    pauseJob(jobId) {
        const job = this.jobs.get(jobId);
        
        if (job && job.status === 'active') {
            job.status = 'paused';
            logger.info(`⏸️ Job paused: ${jobId}`);
            return true;
        }
        
        return false;
    }
    
    /**
     * Resume a job
     */
    resumeJob(jobId) {
        const job = this.jobs.get(jobId);
        
        if (job && job.status === 'paused') {
            job.status = 'active';
            
            if (job.type === 'recurring') {
                job.nextRun = this.calculateNextRun(job.pattern);
            }
            
            logger.info(`▶️ Job resumed: ${jobId}`);
            return true;
        }
        
        return false;
    }
    
    /**
     * Clear all jobs
     */
    clearAllJobs() {
        // Clear all timeouts
        for (const timeout of this.timeouts.values()) {
            clearTimeout(timeout);
        }
        
        // Clear all intervals
        for (const interval of this.intervals.values()) {
            clearInterval(interval);
        }
        
        this.jobs.clear();
        this.timeouts.clear();
        this.intervals.clear();
        
        logger.info('🧹 All jobs cleared');
    }
    
    /**
     * Generate unique job ID
     */
    generateJobId() {
        return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Get scheduler statistics
     */
    getStats() {
        const stats = {
            isRunning: this.isRunning,
            totalJobs: this.jobs.size,
            activeJobs: 0,
            pendingJobs: 0,
            pausedJobs: 0,
            recurringJobs: 0,
            oneTimeJobs: 0
        };
        
        for (const job of this.jobs.values()) {
            switch (job.status) {
                case 'active':
                    stats.activeJobs++;
                    break;
                case 'pending':
                    stats.pendingJobs++;
                    break;
                case 'paused':
                    stats.pausedJobs++;
                    break;
            }
            
            if (job.type === 'recurring') {
                stats.recurringJobs++;
            } else {
                stats.oneTimeJobs++;
            }
        }
        
        return stats;
    }
    
    /**
     * Schedule system maintenance tasks
     */
    scheduleMaintenanceTasks() {
        // Daily log cleanup at 2 AM
        this.scheduleRecurringMessage(null, null, {
            type: 'daily',
            hour: 2,
            minute: 0
        });
        
        // Weekly database cleanup
        this.scheduleFunction(
            async () => {
                try {
                    await this.bot.database.cleanup();
                    logger.info('📊 Database cleanup completed');
                } catch (error) {
                    logger.error('Database cleanup failed:', error);
                }
            },
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Next week
        );
        
        logger.info('🔧 Maintenance tasks scheduled');
    }
}

module.exports = Scheduler;
