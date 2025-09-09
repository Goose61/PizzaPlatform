const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss');
const validator = require('validator');
const winston = require('winston');

/**
 * Enhanced Security Middleware Suite
 * Implements defense-in-depth security controls
 */

// Security logger
const securityLogger = winston.createLogger({
  level: 'warn',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/security-events.log' }),
    new winston.transports.Console({ 
      format: winston.format.simple(),
      level: 'error'
    })
  ]
});

/**
 * Input Sanitization Middleware
 * Prevents XSS and NoSQL injection attacks
 */
const sanitizeInput = (req, res, next) => {
  // Sanitize against NoSQL injection
  req.body = mongoSanitize.sanitize(req.body);
  req.query = mongoSanitize.sanitize(req.query);
  req.params = mongoSanitize.sanitize(req.params);

  // Sanitize strings against XSS
  const sanitizeObject = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = xss(obj[key], {
          whiteList: {}, // No HTML tags allowed
          stripIgnoreTag: true,
          stripIgnoreTagBody: ['script']
        });
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  };

  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }
  
  next();
};

/**
 * Input Validation Helper
 */
const validateInput = {
  email: (email) => validator.isEmail(email),
  walletAddress: (address) => /^[A-HJ-NP-Z1-9]{32,44}$/.test(address),
  amount: (amount) => validator.isNumeric(amount.toString()) && parseFloat(amount) > 0,
  businessId: (id) => validator.isMongoId(id),
  transactionId: (id) => /^[a-zA-Z0-9]{64,88}$/.test(id), // Solana transaction format
};

/**
 * Request Size Limiter
 */
const requestSizeLimiter = (req, res, next) => {
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (req.get('content-length') > maxSize) {
    return res.status(413).json({ 
      error: 'Request too large',
      code: 'REQUEST_TOO_LARGE' 
    });
  }
  next();
};

/**
 * Enhanced Rate Limiters
 */
const createAdvancedRateLimit = (windowMs, max, message, keyGenerator = null) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message, code: 'RATE_LIMIT_EXCEEDED' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyGenerator || ((req) => {
      // Combine IP and user ID if available for more accurate limiting
      return req.user ? `${req.ip}-${req.user._id}` : req.ip;
    }),
    handler: (req, res, next, options) => {
      securityLogger.warn('Rate limit exceeded', {
        ip: req.ip,
        userId: req.user?._id,
        endpoint: req.path,
        userAgent: req.get('User-Agent')
      });
      res.status(429).json(options.message);
    },
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/api/health';
    }
  });
};

// Financial operation rate limiter (stricter)
const financialLimiter = createAdvancedRateLimit(
  5 * 60 * 1000, // 5 minutes
  5, // 5 requests per 5 minutes
  'Too many financial operations, please wait'
);

// Admin operation rate limiter
const adminLimiter = createAdvancedRateLimit(
  1 * 60 * 1000, // 1 minute
  20, // 20 requests per minute
  'Too many admin operations, please slow down'
);

/**
 * Security Headers Middleware
 */
const securityHeaders = (req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // XSS Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions Policy
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  next();
};

/**
 * Error Sanitization Middleware
 * Prevents information disclosure in production
 */
const sanitizeErrors = (err, req, res, next) => {
  // Log the full error internally
  securityLogger.error('Application error', {
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    ip: req.ip,
    endpoint: req.path,
    userId: req.user?._id
  });

  // Generic error response for production
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({
      error: 'An internal error occurred',
      code: 'INTERNAL_SERVER_ERROR',
      timestamp: new Date().toISOString()
    });
  }

  // Development: include stack trace
  return res.status(err.status || 500).json({
    error: err.message,
    code: err.code || 'INTERNAL_SERVER_ERROR',
    stack: err.stack,
    timestamp: new Date().toISOString()
  });
};

/**
 * Request Logging Middleware for Security Auditing
 */
const auditLogger = (req, res, next) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    // Log suspicious activities
    if (res.statusCode >= 400 || duration > 10000) {
      securityLogger.warn('Suspicious request', {
        method: req.method,
        url: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?._id,
        timestamp: new Date().toISOString()
      });
    }
  });

  next();
};

/**
 * Business Logic Authorization
 */
const authorizeBusinessAccess = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    
    if (!businessId) {
      return res.status(400).json({ 
        error: 'Business ID required',
        code: 'MISSING_BUSINESS_ID' 
      });
    }

    if (!validateInput.businessId(businessId)) {
      return res.status(400).json({ 
        error: 'Invalid business ID format',
        code: 'INVALID_BUSINESS_ID' 
      });
    }

    // Check if user owns the business or has admin privileges
    if (req.admin) {
      return next(); // Admins can access any business
    }

    const Business = require('../models/Business');
    const business = await Business.findById(businessId);
    
    if (!business) {
      return res.status(404).json({ 
        error: 'Business not found',
        code: 'BUSINESS_NOT_FOUND' 
      });
    }

    if (business.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        error: 'Access denied to this business',
        code: 'BUSINESS_ACCESS_DENIED' 
      });
    }

    req.business = business;
    next();
  } catch (error) {
    securityLogger.error('Business authorization error', {
      error: error.message,
      businessId: req.params.businessId,
      userId: req.user?._id
    });
    return res.status(500).json({ 
      error: 'Authorization check failed',
      code: 'AUTH_CHECK_FAILED' 
    });
  }
};

/**
 * Transaction Amount Validation
 */
const validateTransactionAmount = (req, res, next) => {
  const { amount } = req.body;
  
  if (amount !== 15) {
    securityLogger.warn('Invalid transaction amount attempt', {
      attemptedAmount: amount,
      userId: req.user?._id,
      ip: req.ip
    });
    return res.status(400).json({ 
      error: 'Invalid transaction amount. All transactions must be $15 USDC',
      code: 'INVALID_TRANSACTION_AMOUNT' 
    });
  }
  
  next();
};

/**
 * Blockchain Address Validation
 */
const validateWalletAddress = (req, res, next) => {
  const { walletAddress } = req.body;
  
  if (walletAddress && !validateInput.walletAddress(walletAddress)) {
    return res.status(400).json({ 
      error: 'Invalid Solana wallet address format',
      code: 'INVALID_WALLET_ADDRESS' 
    });
  }
  
  next();
};

module.exports = {
  sanitizeInput,
  requestSizeLimiter,
  financialLimiter,
  adminLimiter,
  securityHeaders,
  sanitizeErrors,
  auditLogger,
  authorizeBusinessAccess,
  validateTransactionAmount,
  validateWalletAddress,
  validateInput,
  createAdvancedRateLimit
};