/**
 * Environment Configuration
 * Handles environment-specific settings and validation
 */

const path = require('path');
const fs = require('fs');

class EnvironmentConfig {
    constructor() {
        this.env = process.env.NODE_ENV || 'development';
        this.platform = this.detectPlatform();
        this.loadEnvironmentVariables();
        this.validateEnvironment();
    }
    
    /**
     * Detect hosting platform
     */
    detectPlatform() {
        if (process.env.DYNO) return 'heroku';
        if (process.env.KOYEB_APP_NAME) return 'koyeb';
        if (process.env.RAILWAY_ENVIRONMENT) return 'railway';
        if (process.env.RENDER_SERVICE_NAME) return 'render';
        if (process.env.VERCEL) return 'vercel';
        if (process.env.NETLIFY) return 'netlify';
        if (process.env.AWS_LAMBDA_FUNCTION_NAME) return 'aws-lambda';
        if (process.env.GOOGLE_CLOUD_PROJECT) return 'gcp';
        if (process.env.AZURE_FUNCTIONS_ENVIRONMENT) return 'azure';
        return 'vps';
    }
    
    /**
     * Load environment variables
     */
    loadEnvironmentVariables() {
        // Try to load .env file if it exists
        const envPath = path.join(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
            require('dotenv').config({ path: envPath });
        }
        
        // Load platform-specific env file
        const platformEnvPath = path.join(process.cwd(), `.env.${this.platform}`);
        if (fs.existsSync(platformEnvPath)) {
            require('dotenv').config({ path: platformEnvPath, override: true });
        }
        
        // Load environment-specific env file
        const envSpecificPath = path.join(process.cwd(), `.env.${this.env}`);
        if (fs.existsSync(envSpecificPath)) {
            require('dotenv').config({ path: envSpecificPath, override: true });
        }
    }
    
    /**
     * Validate environment configuration
     */
    validateEnvironment() {
        const errors = [];
        
        // Required environment variables
        const required = [
            'SESSION_ID'
        ];
        
        // Check required variables
        required.forEach(key => {
            if (!process.env[key]) {
                errors.push(`Missing required environment variable: ${key}`);
            }
        });
        
        // Platform-specific validation
        if (this.platform === 'heroku') {
            this.validateHeroku(errors);
        } else if (this.platform === 'railway') {
            this.validateRailway(errors);
        } else if (this.platform === 'render') {
            this.validateRender(errors);
        }
        
        // Database validation
        if (this.isProduction() && !process.env.DATABASE_URL) {
            errors.push('DATABASE_URL is required for production environment');
        }
        
        if (errors.length > 0) {
            console.error('Environment validation failed:');
            errors.forEach(error => console.error(`- ${error}`));
            
            if (this.isProduction()) {
                process.exit(1);
            } else {
                console.warn('Continuing with warnings in development mode...');
            }
        }
    }
    
    /**
     * Validate Heroku-specific configuration
     */
    validateHeroku(errors) {
        if (!process.env.PORT) {
            errors.push('PORT environment variable should be set by Heroku');
        }
        
        // Check for Heroku add-ons
        if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('postgres')) {
            errors.push('Heroku DATABASE_URL should point to PostgreSQL');
        }
    }
    
    /**
     * Validate Railway-specific configuration
     */
    validateRailway(errors) {
        if (!process.env.RAILWAY_ENVIRONMENT) {
            errors.push('RAILWAY_ENVIRONMENT not detected');
        }
    }
    
    /**
     * Validate Render-specific configuration
     */
    validateRender(errors) {
        if (!process.env.RENDER_SERVICE_NAME) {
            errors.push('RENDER_SERVICE_NAME not detected');
        }
    }
    
    /**
     * Check if running in production
     */
    isProduction() {
        return this.env === 'production';
    }
    
    /**
     * Check if running in development
     */
    isDevelopment() {
        return this.env === 'development';
    }
    
    /**
     * Check if running in test environment
     */
    isTest() {
        return this.env === 'test';
    }
    
    /**
     * Get platform-specific configuration
     */
    getPlatformConfig() {
        const configs = {
            heroku: {
                maxRequestSize: '50mb',
                timeout: 30000,
                keepAlive: true,
                compression: true,
                logLevel: 'info'
            },
            railway: {
                maxRequestSize: '50mb',
                timeout: 30000,
                keepAlive: true,
                compression: true,
                logLevel: 'info'
            },
            render: {
                maxRequestSize: '50mb',
                timeout: 25000,
                keepAlive: true,
                compression: true,
                logLevel: 'info'
            },
            vercel: {
                maxRequestSize: '5mb',
                timeout: 10000,
                keepAlive: false,
                compression: true,
                logLevel: 'warn'
            },
            aws: {
                maxRequestSize: '6mb',
                timeout: 30000,
                keepAlive: false,
                compression: true,
                logLevel: 'info'
            },
            vps: {
                maxRequestSize: '100mb',
                timeout: 60000,
                keepAlive: true,
                compression: true,
                logLevel: 'debug'
            }
        };
        
        return configs[this.platform] || configs.vps;
    }
    
    /**
     * Get environment-specific paths
     */
    getPaths() {
        const basePath = process.cwd();
        
        return {
            base: basePath,
            data: path.join(basePath, 'data'),
            logs: path.join(basePath, 'logs'),
            sessions: path.join(basePath, 'sessions'),
            media: path.join(basePath, 'media'),
            plugins: path.join(basePath, 'plugins'),
            lang: path.join(basePath, 'lang'),
            config: path.join(basePath, 'config'),
            temp: path.join(basePath, 'temp')
        };
    }
    
    /**
     * Get database configuration based on environment
     */
    getDatabaseConfig() {
        if (this.isProduction()) {
            return {
                dialect: 'postgres',
                url: process.env.DATABASE_URL,
                ssl: true,
                pool: {
                    max: 5,
                    min: 0,
                    acquire: 30000,
                    idle: 10000
                },
                logging: false
            };
        } else {
            return {
                dialect: 'sqlite',
                storage: path.join(this.getPaths().data, 'matdev.db'),
                pool: {
                    max: 5,
                    min: 0,
                    acquire: 30000,
                    idle: 10000
                },
                logging: this.isDevelopment() ? console.log : false
            };
        }
    }
    
    /**
     * Get Redis configuration
     */
    getRedisConfig() {
        if (process.env.REDIS_URL) {
            return {
                url: process.env.REDIS_URL,
                retry_unfulfilled_commands: true,
                max_attempts: 3
            };
        }
        
        return null; // No Redis available
    }
    
    /**
     * Get rate limiting configuration
     */
    getRateLimitConfig() {
        return {
            windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
            max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
            standardHeaders: true,
            legacyHeaders: false,
            skip: (req) => {
                // Skip rate limiting for health checks
                return req.path === '/health' || req.path === '/api/status';
            }
        };
    }
    
    /**
     * Get CORS configuration
     */
    getCorsConfig() {
        const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
            process.env.ALLOWED_ORIGINS.split(',') : 
            ['http://localhost:3000', 'http://localhost:5000'];
        
        if (this.isProduction()) {
            // Add production domains
            const prodDomains = [
                `https://${process.env.APP_NAME}.herokuapp.com`,
                `https://${process.env.RAILWAY_SERVICE_NAME}.up.railway.app`,
                `https://${process.env.RENDER_SERVICE_NAME}.onrender.com`
            ].filter(Boolean);
            
            allowedOrigins.push(...prodDomains);
        }
        
        return {
            origin: allowedOrigins,
            credentials: true,
            optionsSuccessStatus: 200
        };
    }
    
    /**
     * Get security headers configuration
     */
    getSecurityConfig() {
        return {
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
                    scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'", "wss:", "ws:"],
                    fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"]
                }
            },
            crossOriginEmbedderPolicy: false,
            crossOriginOpenerPolicy: false,
            crossOriginResourcePolicy: { policy: "cross-origin" },
            dnsPrefetchControl: true,
            frameguard: { action: 'deny' },
            hidePoweredBy: true,
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            },
            ieNoOpen: true,
            noSniff: true,
            originAgentCluster: true,
            permittedCrossDomainPolicies: false,
            referrerPolicy: "no-referrer",
            xssFilter: true
        };
    }
    
    /**
     * Get complete environment configuration
     */
    getConfig() {
        return {
            env: this.env,
            platform: this.platform,
            isProduction: this.isProduction(),
            isDevelopment: this.isDevelopment(),
            isTest: this.isTest(),
            paths: this.getPaths(),
            database: this.getDatabaseConfig(),
            redis: this.getRedisConfig(),
            rateLimit: this.getRateLimitConfig(),
            cors: this.getCorsConfig(),
            security: this.getSecurityConfig(),
            platformConfig: this.getPlatformConfig()
        };
    }
}

module.exports = new EnvironmentConfig();
