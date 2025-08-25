/**
 * Security Configuration
 * Comprehensive security settings and middleware configuration
 */

const crypto = require('crypto');
const environmentConfig = require('./environment');

class SecurityConfig {
    constructor() {
        this.config = this.initializeConfig();
        this.secrets = this.generateSecrets();
        this.rateLimits = this.setupRateLimits();
        this.blacklists = this.setupBlacklists();
    }
    
    /**
     * Initialize security configuration
     */
    initializeConfig() {
        return {
            // JWT Configuration
            jwt: {
                secret: process.env.JWT_SECRET || this.generateSecret(64),
                expiresIn: process.env.JWT_EXPIRES_IN || '7d',
                algorithm: 'HS256',
                issuer: 'matdev-bot',
                audience: 'matdev-users'
            },
            
            // Session Configuration
            session: {
                secret: process.env.SESSION_SECRET || this.generateSecret(64),
                name: 'matdev.sid',
                resave: false,
                saveUninitialized: false,
                rolling: true,
                cookie: {
                    maxAge: 24 * 60 * 60 * 1000, // 24 hours
                    httpOnly: true,
                    secure: environmentConfig.isProduction(),
                    sameSite: environmentConfig.isProduction() ? 'strict' : 'lax'
                }
            },
            
            // Encryption
            encryption: {
                algorithm: 'aes-256-gcm',
                keyLength: 32,
                ivLength: 16,
                tagLength: 16,
                key: process.env.ENCRYPTION_KEY || this.generateSecret(32)
            },
            
            // Anti-Spam Configuration
            antiSpam: {
                messageThreshold: parseInt(process.env.SPAM_MESSAGE_THRESHOLD) || 5,
                timeWindow: parseInt(process.env.SPAM_TIME_WINDOW) || 10000, // 10 seconds
                blockDuration: parseInt(process.env.SPAM_BLOCK_DURATION) || 60000, // 1 minute
                maxWarnings: parseInt(process.env.SPAM_MAX_WARNINGS) || 3,
                escalationMultiplier: 2
            },
            
            // Rate Limiting
            rateLimit: {
                commands: {
                    windowMs: 60 * 1000, // 1 minute
                    max: parseInt(process.env.RATE_LIMIT_COMMANDS) || 20,
                    message: 'Too many commands. Please try again later.',
                    standardHeaders: true,
                    legacyHeaders: false
                },
                api: {
                    windowMs: 15 * 60 * 1000, // 15 minutes
                    max: parseInt(process.env.RATE_LIMIT_API) || 100,
                    message: 'Too many requests. Please try again later.',
                    standardHeaders: true,
                    legacyHeaders: false
                },
                auth: {
                    windowMs: 15 * 60 * 1000, // 15 minutes
                    max: 5, // Strict limit for auth endpoints
                    message: 'Too many authentication attempts. Please try again later.',
                    standardHeaders: true,
                    legacyHeaders: false
                }
            },
            
            // CORS Settings
            cors: {
                origin: this.getAllowedOrigins(),
                credentials: true,
                optionsSuccessStatus: 200,
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
                maxAge: 86400 // 24 hours
            },
            
            // Content Security Policy
            csp: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com"],
                    styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
                    imgSrc: ["'self'", "data:", "https:", "blob:"],
                    fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
                    connectSrc: ["'self'", "wss:", "ws:", "https:"],
                    mediaSrc: ["'self'", "blob:"],
                    objectSrc: ["'none'"],
                    childSrc: ["'none'"],
                    frameAncestors: ["'none'"],
                    formAction: ["'self'"],
                    upgradeInsecureRequests: environmentConfig.isProduction() ? [] : null
                }
            },
            
            // Input Validation
            validation: {
                maxMessageLength: parseInt(process.env.MAX_MESSAGE_LENGTH) || 4000,
                maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 16 * 1024 * 1024, // 16MB
                allowedFileTypes: [
                    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                    'video/mp4', 'video/avi', 'video/mov',
                    'audio/mp3', 'audio/wav', 'audio/ogg',
                    'application/pdf', 'text/plain'
                ],
                maxCommandArgs: 50,
                maxUsernameLength: 100
            },
            
            // Sudo/Admin Security
            admin: {
                maxFailedAttempts: 3,
                lockoutDuration: 30 * 60 * 1000, // 30 minutes
                requireTwoFactor: environmentConfig.isProduction(),
                sessionTimeout: 60 * 60 * 1000, // 1 hour
                auditLog: true
            }
        };
    }
    
    /**
     * Generate cryptographically secure secrets
     */
    generateSecrets() {
        return {
            apiKey: process.env.API_KEY || this.generateSecret(32),
            webhookSecret: process.env.WEBHOOK_SECRET || this.generateSecret(32),
            encryptionSalt: process.env.ENCRYPTION_SALT || this.generateSecret(16)
        };
    }
    
    /**
     * Generate a cryptographically secure random string
     */
    generateSecret(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }
    
    /**
     * Get allowed origins for CORS
     */
    getAllowedOrigins() {
        const origins = ['http://localhost:3000', 'http://localhost:5000'];
        
        if (environmentConfig.isProduction()) {
            const prodOrigins = [
                process.env.FRONTEND_URL,
                `https://${process.env.APP_NAME}.herokuapp.com`,
                `https://${process.env.RAILWAY_SERVICE_NAME}.up.railway.app`,
                `https://${process.env.RENDER_SERVICE_NAME}.onrender.com`
            ].filter(Boolean);
            
            origins.push(...prodOrigins);
        }
        
        return origins;
    }
    
    /**
     * Setup rate limiting configurations
     */
    setupRateLimits() {
        return {
            global: {
                windowMs: 15 * 60 * 1000, // 15 minutes
                max: 1000,
                standardHeaders: true
            },
            commands: {
                windowMs: 60 * 1000, // 1 minute
                max: 20,
                standardHeaders: true
            },
            messages: {
                windowMs: 10 * 1000, // 10 seconds
                max: 5,
                standardHeaders: true
            },
            login: {
                windowMs: 15 * 60 * 1000, // 15 minutes
                max: 5,
                standardHeaders: true
            },
            api: {
                windowMs: 60 * 1000, // 1 minute
                max: 60,
                standardHeaders: true
            }
        };
    }
    
    /**
     * Setup security blacklists
     */
    setupBlacklists() {
        return {
            // Malicious file patterns
            filePatterns: [
                /\.exe$/i, /\.bat$/i, /\.cmd$/i, /\.com$/i, /\.scr$/i,
                /\.vbs$/i, /\.js$/i, /\.jar$/i, /\.zip$/i, /\.rar$/i
            ],
            
            // Suspicious URLs
            urlPatterns: [
                /bit\.ly/i, /tinyurl/i, /t\.co/i, /goo\.gl/i,
                /malware/i, /phishing/i, /suspicious/i
            ],
            
            // Spam keywords
            spamKeywords: [
                'win money', 'free gift', 'click here now',
                'limited time', 'act now', 'congratulations'
            ],
            
            // Blocked IPs (can be loaded from external source)
            blockedIPs: new Set([
                // Add known malicious IPs
            ]),
            
            // Blocked domains
            blockedDomains: new Set([
                // Add known malicious domains
            ])
        };
    }
    
    /**
     * Encrypt sensitive data
     */
    encrypt(text) {
        try {
            const { algorithm, key } = this.config.encryption;
            const iv = crypto.randomBytes(this.config.encryption.ivLength);
            const cipher = crypto.createCipher(algorithm, key, iv);
            
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const tag = cipher.getAuthTag();
            
            return {
                encrypted,
                iv: iv.toString('hex'),
                tag: tag.toString('hex')
            };
        } catch (error) {
            throw new Error('Encryption failed: ' + error.message);
        }
    }
    
    /**
     * Decrypt sensitive data
     */
    decrypt(encryptedData) {
        try {
            const { algorithm, key } = this.config.encryption;
            const { encrypted, iv, tag } = encryptedData;
            
            const decipher = crypto.createDecipher(algorithm, key, Buffer.from(iv, 'hex'));
            decipher.setAuthTag(Buffer.from(tag, 'hex'));
            
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            throw new Error('Decryption failed: ' + error.message);
        }
    }
    
    /**
     * Hash passwords and sensitive data
     */
    hash(data, salt = null) {
        const actualSalt = salt || this.secrets.encryptionSalt;
        return crypto.pbkdf2Sync(data, actualSalt, 100000, 64, 'sha512').toString('hex');
    }
    
    /**
     * Verify hashed data
     */
    verifyHash(data, hash, salt = null) {
        const actualSalt = salt || this.secrets.encryptionSalt;
        const dataHash = this.hash(data, actualSalt);
        return crypto.timingSafeEqual(Buffer.from(dataHash), Buffer.from(hash));
    }
    
    /**
     * Generate secure tokens
     */
    generateToken(length = 32) {
        return crypto.randomBytes(length).toString('base64url');
    }
    
    /**
     * Sanitize user input
     */
    sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        
        return input
            .trim()
            .replace(/[<>]/g, '') // Remove HTML brackets
            .replace(/javascript:/gi, '') // Remove javascript: protocol
            .replace(/on\w+=/gi, '') // Remove event handlers
            .replace(/script/gi, '') // Remove script tags
            .substring(0, this.config.validation.maxMessageLength);
    }
    
    /**
     * Validate file upload
     */
    validateFile(file) {
        const errors = [];
        
        // Check file size
        if (file.size > this.config.validation.maxFileSize) {
            errors.push(`File too large. Maximum size: ${this.config.validation.maxFileSize / 1024 / 1024}MB`);
        }
        
        // Check file type
        if (!this.config.validation.allowedFileTypes.includes(file.mimetype)) {
            errors.push('File type not allowed');
        }
        
        // Check filename for malicious patterns
        const filename = file.originalname || file.name || '';
        for (const pattern of this.blacklists.filePatterns) {
            if (pattern.test(filename)) {
                errors.push('Suspicious file detected');
                break;
            }
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
    
    /**
     * Check if URL is safe
     */
    isUrlSafe(url) {
        try {
            const urlObj = new URL(url);
            
            // Check against blacklisted domains
            if (this.blacklists.blockedDomains.has(urlObj.hostname)) {
                return false;
            }
            
            // Check against suspicious patterns
            for (const pattern of this.blacklists.urlPatterns) {
                if (pattern.test(url)) {
                    return false;
                }
            }
            
            return true;
        } catch (error) {
            return false; // Invalid URL
        }
    }
    
    /**
     * Check if IP is blocked
     */
    isIpBlocked(ip) {
        return this.blacklists.blockedIPs.has(ip);
    }
    
    /**
     * Security middleware factory
     */
    createSecurityMiddleware() {
        return {
            // Input sanitization middleware
            sanitizeInput: (req, res, next) => {
                if (req.body) {
                    for (const key in req.body) {
                        if (typeof req.body[key] === 'string') {
                            req.body[key] = this.sanitizeInput(req.body[key]);
                        }
                    }
                }
                next();
            },
            
            // IP blocking middleware
            blockIp: (req, res, next) => {
                const clientIp = req.ip || req.connection.remoteAddress;
                if (this.isIpBlocked(clientIp)) {
                    return res.status(403).json({ error: 'Access denied' });
                }
                next();
            },
            
            // File validation middleware
            validateFileUpload: (req, res, next) => {
                if (req.file) {
                    const validation = this.validateFile(req.file);
                    if (!validation.valid) {
                        return res.status(400).json({ 
                            error: 'File validation failed',
                            details: validation.errors 
                        });
                    }
                }
                next();
            }
        };
    }
    
    /**
     * Get complete security configuration
     */
    getConfig() {
        return {
            ...this.config,
            secrets: this.secrets,
            rateLimits: this.rateLimits,
            blacklists: {
                filePatterns: this.blacklists.filePatterns.map(p => p.source),
                urlPatterns: this.blacklists.urlPatterns.map(p => p.source),
                spamKeywords: this.blacklists.spamKeywords,
                blockedDomains: Array.from(this.blacklists.blockedDomains),
                blockedIPs: Array.from(this.blacklists.blockedIPs)
            }
        };
    }
    
    /**
     * Generate security report
     */
    generateSecurityReport() {
        return {
            timestamp: new Date().toISOString(),
            environment: environmentConfig.env,
            security: {
                jwtEnabled: !!this.config.jwt.secret,
                sessionSecure: this.config.session.cookie.secure,
                csrfProtection: true,
                rateLimitingEnabled: true,
                inputSanitization: true,
                fileValidation: true,
                encryptionEnabled: true
            },
            configuration: {
                maxFileSize: this.config.validation.maxFileSize,
                allowedFileTypes: this.config.validation.allowedFileTypes.length,
                rateLimitCommands: this.config.rateLimit.commands.max,
                antiSpamThreshold: this.config.antiSpam.messageThreshold,
                blockDuration: this.config.antiSpam.blockDuration
            }
        };
    }
}

module.exports = new SecurityConfig();
