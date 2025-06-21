/**
 * Security Middleware for PingOne User Management Application
 * 
 * This module provides comprehensive security middleware including:
 * - Rate limiting
 * - Input validation
 * - CORS protection
 * - Security headers
 * - Request sanitization
 */

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { config } = require('../config');

/**
 * Rate limiting middleware to prevent abuse
 */
const createRateLimiter = (windowMs, max, message = 'Too many requests') => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

/**
 * Global rate limiter for all routes
 */
const globalRateLimiter = createRateLimiter(
  config.security.rateLimit.windowMs,
  config.security.rateLimit.max,
  'Too many requests from this IP'
);

/**
 * Strict rate limiter for authentication endpoints
 */
const authRateLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5, // 5 attempts
  'Too many authentication attempts'
);

/**
 * File upload rate limiter
 */
const uploadRateLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  10, // 10 uploads per hour
  'Too many file uploads'
);

/**
 * Input validation middleware
 */
const validateInput = (req, res, next) => {
  // Sanitize request body
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        // Remove potential XSS vectors
        req.body[key] = req.body[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      }
    });
  }

  // Validate file uploads
  if (req.file) {
    const allowedTypes = config.upload.allowedTypes;
    const fileExtension = req.file.originalname.toLowerCase().substring(
      req.file.originalname.lastIndexOf('.')
    );
    
    if (!allowedTypes.includes(fileExtension)) {
      return res.status(400).json({
        error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`
      });
    }

    if (req.file.size > config.upload.maxSize) {
      return res.status(400).json({
        error: `File too large. Maximum size: ${config.upload.maxSize / (1024 * 1024)}MB`
      });
    }
  }

  next();
};

/**
 * Error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Don't expose internal errors to client
  const isDevelopment = config.server.environment === 'development';
  
  if (err.response) {
    // API error
    return res.status(err.response.status).json({
      error: isDevelopment ? err.response.data : 'External API Error',
      timestamp: new Date().toISOString()
    });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: 'File too large',
      maxSize: config.upload.maxSize / (1024 * 1024) + 'MB'
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      error: 'Unexpected file field'
    });
  }

  // Generic error response
  res.status(500).json({
    error: isDevelopment ? err.message : 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
};

/**
 * Request logging middleware
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    };
    
    console.log(`${logEntry.method} ${logEntry.url} ${logEntry.status} ${logEntry.duration}`);
  });

  next();
};

/**
 * Security headers middleware
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: [
        "'self'", 
        "'unsafe-inline'", 
        "https://fonts.googleapis.com", 
        "https://assets.pingone.com",
        "https://unpkg.com",
        "https://use.typekit.net",
        "https://p.typekit.net"
      ],
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'", 
        "https://unpkg.com", 
        "https://cdnjs.cloudflare.com"
      ],
      fontSrc: [
        "'self'", 
        "https://fonts.gstatic.com",
        "https://assets.pingone.com",
        "https://use.typekit.net",
        "https://p.typekit.net",
        "data:"
      ],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: [
        "'self'", 
        "https://auth.pingone.com", 
        "https://api.pingone.com"
      ]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

/**
 * CORS configuration
 */
const corsOptions = {
  origin: config.security.cors.origin,
  credentials: config.security.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
};

module.exports = {
  globalRateLimiter,
  authRateLimiter,
  uploadRateLimiter,
  validateInput,
  errorHandler,
  requestLogger,
  securityHeaders,
  corsOptions
}; 