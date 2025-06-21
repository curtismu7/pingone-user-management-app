/**
 * Centralized Configuration for PingOne User Management Application
 * 
 * This file manages all configuration settings and ensures sensitive data
 * is never hardcoded in the source code.
 */

require('dotenv').config();

const config = {
  // Server Configuration
  server: {
    port: process.env.PORT || 3001,
    host: process.env.HOST || 'localhost',
    environment: process.env.NODE_ENV || 'development'
  },

  // PingOne Configuration (defaults only, not required at startup)
  pingone: {
    authUri: process.env.PINGONE_AUTH_URI || 'https://auth.pingone.com',
    apiUri: process.env.PINGONE_API_URI || 'https://api.pingone.com',
    scopes: process.env.PINGONE_SCOPES || 'p1:admin:user:read p1:admin:user:write'
  },

  // File Upload Configuration
  upload: {
    maxSize: parseInt(process.env.UPLOAD_MAX_SIZE) || 10 * 1024 * 1024, // 10MB
    allowedTypes: ['.csv'],
    destination: process.env.UPLOAD_DESTINATION || 'uploads/',
    tempDir: process.env.UPLOAD_TEMP_DIR || 'uploads/'
  },

  // Security Configuration
  security: {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    },
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX) || 100 // limit each IP to 100 requests per windowMs
    },
    session: {
      secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
      maxAge: parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000 // 24 hours
    }
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'import-status.log',
    maxSize: parseInt(process.env.LOG_MAX_SIZE) || 10 * 1024 * 1024, // 10MB
    maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5
  },

  // Validation Configuration
  validation: {
    maxUsersPerImport: parseInt(process.env.MAX_USERS_PER_IMPORT) || 1000,
    requiredFields: ['username', 'email', 'firstName', 'lastName', 'populationId'],
    optionalFields: ['middleName', 'prefix', 'suffix', 'formattedName', 'title', 
                     'preferredLanguage', 'locale', 'timezone', 'externalId', 'type', 
                     'active', 'nickname', 'password', 'primaryPhone', 'mobilePhone',
                     'streetAddress', 'countryCode', 'locality', 'region', 'postalCode']
  }
};

// No required credential validation at startup
function validateConfig() {
  // Only warn if SESSION_SECRET is default
  if (config.security.session.secret === 'your-secret-key-change-in-production') {
    console.warn('⚠️  Warning: SESSION_SECRET is using the default value. Set a strong SESSION_SECRET in your .env file for production.');
  }
  console.log('✅ Configuration loaded. PingOne credentials will be provided by the user at runtime.');
}

// Export configuration and validation function
module.exports = {
  config,
  validateConfig
}; 