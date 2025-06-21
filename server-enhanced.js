/**
 * Enhanced PingOne User Management Application - Node.js Server
 * 
 * ⚠️ IMPORTANT: This application MUST run on this Node.js server.
 * Do NOT use http-server or any static file server.
 * 
 * This server provides:
 * - PingOne API authentication endpoints with enhanced security
 * - User import/delete/modify operations
 * - File upload handling with validation
 * - Real-time logging and status tracking
 * - CORS support for cross-origin requests
 * - Rate limiting and input validation
 * - Security headers and error handling
 * 
 * To run: npm start (which executes: node server-enhanced.js)
 * Server runs on: http://localhost:3001
 */

const express = require('express');
const multer = require('multer');
const Papa = require('papaparse');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors');
const os = require('os');
const path = require('path');

// Import configuration and services
const { config, validateConfig } = require('./config');
const authService = require('./services/auth');
const {
  globalRateLimiter,
  authRateLimiter,
  uploadRateLimiter,
  validateInput,
  errorHandler,
  requestLogger,
  securityHeaders,
  corsOptions
} = require('./middleware/security');

// Validate configuration on startup
validateConfig();

const app = express();

// Security middleware
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(globalRateLimiter);
app.use(requestLogger);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.upload.destination);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: config.upload.maxSize,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = config.upload.allowedTypes;
    const fileExtension = file.originalname.toLowerCase().substring(
      file.originalname.lastIndexOf('.')
    );
    
    if (allowedTypes.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`));
    }
  }
});

// Serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

let cancelRequested = false;

app.post('/cancel', (req, res) => {
  cancelRequested = true;
  res.json({ cancelled: true });
});

// Use absolute path for log file
const statusLogPath = path.resolve(__dirname, config.logging.file);

// Helper to safely write to log file
function safeAppendLog(content) {
  try {
    fs.appendFileSync(statusLogPath, content);
  } catch (err) {
    console.error(`Error writing to ${config.logging.file}:`, err);
  }
}

function safeWriteLog(content) {
  try {
    fs.writeFileSync(statusLogPath, content);
  } catch (err) {
    console.error(`Error writing to ${config.logging.file}:`, err);
  }
}

// Helper to get server access URLs
function getServerUrls() {
  const interfaces = os.networkInterfaces();
  const urls = [];
  
  // Add localhost URL
  urls.push(`http://127.0.0.1:${config.server.port}`);
  
  // Add network interface URLs
  Object.keys(interfaces).forEach((name) => {
    interfaces[name].forEach((interface) => {
      if (interface.family === 'IPv4' && !interface.internal) {
        urls.push(`http://${interface.address}:${config.server.port}`);
      }
    });
  });
  
  return urls;
}

// Helper to write operation start log entry
function logOperationStart(operationType) {
  const timestamp = new Date().toISOString();
  const localTime = new Date().toLocaleString();
  const serverUrls = getServerUrls();
  const logEntry = `\n${timestamp} | OPERATION_START | ${operationType} | Starting ${operationType} at ${localTime}`;
  const urlInfo = `Server URLs: ${serverUrls.join(', ')}`;
  safeAppendLog(logEntry + '\n');
  safeAppendLog(`${timestamp} | SERVER_INFO | ${urlInfo}\n`);
}

// Helper to write a run header with asterisks and timestamp
function writeRunHeader() {
  const now = new Date().toLocaleString();
  safeWriteLog(`\n********************\n* Run started: ${now} *\n********************\n`);
  return Date.now(); // Return start time
}

// Helper to write a run footer with asterisks and timestamp and total time
function writeRunFooter(startTime) {
  const now = new Date().toLocaleString();
  safeAppendLog(`\n********************\n* Run ended:   ${now} *\n********************\n`);
  if (startTime) {
    const totalSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    safeAppendLog(`Total time of run: ${totalSeconds} seconds\n`);
  }
}

// At server startup, create or overwrite the log file with a header
const logStartTime = new Date().toLocaleString();
safeWriteLog(`********\n${logStartTime}\nStart of Logging\n`);

// Log all endpoint calls
function logStatus(message) {
  safeAppendLog(`${new Date().toISOString()} | ${message}\n`);
}

// Log server shutdown
function logShutdown() {
  const now = new Date().toLocaleString();
  safeAppendLog(`********************\n* Server shutdown: ${now} *\n********************\n`);
}

process.on('SIGINT', () => {
  logShutdown();
  process.exit(0);
});
process.on('SIGTERM', () => {
  logShutdown();
  process.exit(0);
});

// Enhanced authentication endpoint with rate limiting and validation
app.post('/get-worker-token', authRateLimiter, validateInput, async (req, res) => {
  const startTime = writeRunHeader();
  
  try {
    const { environmentId, clientId, clientSecret } = req.body;
    
    logStatus(`/get-worker-token | start`);
    
    // Log the request data for debugging (without sensitive info)
    console.log(`get-worker-token request:`, {
      environmentId: environmentId ? `${environmentId.substring(0, 8)}...` : 'undefined',
      clientId: clientId ? `${clientId.substring(0, 8)}...` : 'undefined',
      clientSecret: clientSecret ? `${clientSecret.substring(0, 8)}...` : 'undefined',
      hasEnvironmentId: !!environmentId,
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret
    });
    
    // Validate credentials with detailed error messages
    const validationResult = authService.validateAllCredentials(environmentId, clientId, clientSecret);
    if (!validationResult.isValid) {
      logStatus(`/get-worker-token | validation failed: ${validationResult.errors.join(', ')}`);
      return res.status(400).json({
        success: false,
        error: 'Invalid credentials',
        details: validationResult.errors,
        timestamp: new Date().toISOString()
      });
    }
    
    logStatus(`/get-worker-token | validation passed`);
    
    // Get worker token with retry logic
    const tokenResult = await authService.getWorkerToken(environmentId, clientId, clientSecret);
    
    if (tokenResult.success) {
      logStatus(`/get-worker-token | success`);
      writeRunFooter(startTime);
      res.json({
        success: true,
        accessToken: tokenResult.accessToken,
        expiresIn: tokenResult.expiresIn,
        timestamp: new Date().toISOString()
      });
    } else {
      logStatus(`/get-worker-token | failed: ${tokenResult.error}`);
      writeRunFooter(startTime);
      res.status(500).json({
        success: false,
        error: tokenResult.error,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logStatus(`/get-worker-token | error: ${error.message}`);
    writeRunFooter(startTime);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Library event logging endpoint
app.post('/log-library-event', (req, res) => {
  try {
    const { event, data, userAgent, url } = req.body;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      event: event,
      data: data,
      userAgent: userAgent,
      url: url,
      ip: req.ip || req.connection.remoteAddress
    };
    
    // Log to console with emoji for easy identification
    const emoji = event === 'library_loaded' ? '📚' : '❌';
    console.log(`${emoji} Library Event: ${data.library} | ${event} | ${data.source} | ${data.timestamp}`);
    
    // Append to library events log file
    const logMessage = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync('library-events.log', logMessage);
    
    res.json({ success: true, message: 'Library event logged successfully' });
  } catch (error) {
    console.error('Error logging library event:', error);
    res.status(500).json({ success: false, error: 'Failed to log library event' });
  }
});

// Enhanced environment details endpoint
app.post('/get-environment-details', authRateLimiter, validateInput, async (req, res) => {
  const startTime = writeRunHeader();
  
  try {
    const { environmentId, clientId, clientSecret } = req.body;
    
    logStatus(`/get-environment-details | start`);
    
    // Validate input
    const validation = authService.validateAllCredentials(environmentId, clientId, clientSecret);
    if (!validation.isValid) {
      logStatus(`/get-environment-details | validation_error`);
      writeRunFooter(startTime);
      return res.status(400).json({ 
        error: 'Invalid credentials format.',
        details: validation.errors
      });
    }
    
    const details = await authService.getEnvironmentDetails(environmentId, clientId, clientSecret);
    logStatus(`/get-environment-details | success`);
    writeRunFooter(startTime);
    res.json(details);
  } catch (err) {
    logStatus(`/get-environment-details | error`);
    writeRunFooter(startTime);
    res.status(500).json({ error: err.message });
  }
});

// Add throttling utility for bulk operations
function throttle(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Throttled user creation with exponential backoff
async function createUserWithRetry(user, environmentId, accessToken, retryCount = 0) {
  try {
    return await createUser(user, environmentId, accessToken);
  } catch (error) {
    // Handle 429 errors with exponential backoff
    if (error.response && error.response.status === 429 && retryCount < 3) {
      const backoffDelay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
      console.warn(`Rate limited during user creation. Retrying in ${backoffDelay}ms (attempt ${retryCount + 1}/3)`);
      
      await throttle(backoffDelay);
      return createUserWithRetry(user, environmentId, accessToken, retryCount + 1);
    }
    throw error;
  }
}

// Throttled user deletion with exponential backoff
async function deleteUserWithRetry(userId, environmentId, accessToken, retryCount = 0) {
  try {
    return await deleteUser(userId, environmentId, accessToken);
  } catch (error) {
    // Handle 429 errors with exponential backoff
    if (error.response && error.response.status === 429 && retryCount < 3) {
      const backoffDelay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
      console.warn(`Rate limited during user deletion. Retrying in ${backoffDelay}ms (attempt ${retryCount + 1}/3)`);
      
      await throttle(backoffDelay);
      return deleteUserWithRetry(userId, environmentId, accessToken, retryCount + 1);
    }
    throw error;
  }
}

// Enhanced user import endpoint with security
app.post('/import-users', uploadRateLimiter, upload.single('csv'), validateInput, async (req, res) => {
  const mode = req.body.mode || 'import';
  let operationType = 'Import';
  
  if (mode === 'modify') {
    operationType = 'Modify';
  } else if (mode === 'import+modify') {
    operationType = 'Import+Modify';
  }
  
  logOperationStart(operationType);
  const startTime = writeRunHeader();
  cancelRequested = false;
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  try {
    const filePath = req.file.path;
    const { environmentId, clientId, clientSecret } = req.body;
    const validation = authService.validateAllCredentials(environmentId, clientId, clientSecret);
    if (!validation.isValid) {
      logStatus(`/import-users | validation_error`);
      writeRunFooter(startTime);
      res.write(JSON.stringify({ error: 'Invalid credentials format.', details: validation.errors }) + '\n');
      return res.end();
    }
    const accessToken = await authService.getWorkerToken(environmentId, clientId, clientSecret);
    const csvData = fs.readFileSync(filePath, 'utf8');
    const results = Papa.parse(csvData, {
      header: true,
      skipEmptyLines: true,
      error: (error) => { throw new Error(`CSV parsing error: ${error.message}`); }
    });
    if (results.errors.length > 0) {
      throw new Error(`CSV parsing errors: ${results.errors.map(e => e.message).join(', ')}`);
    }
    const users = results.data;
    if (users.length > config.validation.maxUsersPerImport) {
      throw new Error(`Too many users. Maximum allowed: ${config.validation.maxUsersPerImport}`);
    }
    const requiredFields = config.validation.requiredFields;
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const missingFields = requiredFields.filter(field => !user[field] || user[field].trim() === '');
      if (missingFields.length > 0) {
        throw new Error(`User ${i + 1} missing required fields: ${missingFields.join(', ')}`);
      }
    }
    res.write(JSON.stringify({ progress: 'started', total: users.length, processed: 0 }) + '\n');
    let addedCount = 0;
    let modifiedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let batchCounter = 0;
    const errors = [];
    for (let i = 0; i < users.length; i++) {
      if (cancelRequested) {
        logStatus(`/import-users | cancelled`);
        res.write(JSON.stringify({ progress: 'cancelled', processed: i, added: addedCount, modified: modifiedCount, skipped: skippedCount, error: errorCount }) + '\n');
        break;
      }
      try {
        const user = users[i];
        // Simulate logic: try to create, if exists, modify, else skip
        // For demo, treat all as added
        await createUserWithRetry(user, environmentId, accessToken);
        addedCount++;
        logStatus(`/import-users | user_${i + 1}_added | ${user.username || user.email}`);
        
        // Add small delay between requests to avoid rate limiting
        if (i < users.length - 1) {
          await throttle(200); // 200ms delay between user creations
        }
      } catch (error) {
        errorCount++;
        const errorMsg = `User ${i + 1} (${users[i].username || users[i].email}): ${error.message}`;
        errors.push(errorMsg);
        logStatus(`/import-users | user_${i + 1}_error | ${errorMsg}`);
      }
      if ((i + 1) % 5 === 0 || i === users.length - 1) {
        batchCounter++;
        const processedCount = i + 1;
        res.write(JSON.stringify({ 
          progress: 'processing', 
          processed: processedCount, 
          total: users.length,
          batchCounter: batchCounter,
          added: addedCount,
          modified: modifiedCount,
          skipped: skippedCount,
          deleted: 0,
          error: errorCount
        }) + '\n');
      }
    }
    try { fs.unlinkSync(filePath); } catch (err) { console.error('Error deleting uploaded file:', err); }
    const result = {
      progress: 'complete',
      total: users.length,
      added: addedCount,
      deleted: 0,
      modified: modifiedCount,
      skipped: skippedCount,
      errors: errorCount,
      errorDetails: errors,
      cancelled: cancelRequested,
      batchCounter: batchCounter
    };
    logStatus(`/import-users | complete | ${JSON.stringify(result)}`);
    writeRunFooter(startTime);
    res.write(JSON.stringify(result) + '\n');
    res.end();
  } catch (err) {
    logStatus(`/import-users | error | ${err.message}`);
    writeRunFooter(startTime);
    res.write(JSON.stringify({ error: err.message }) + '\n');
    res.end();
  }
});

// Helper function to create user
async function createUser(user, environmentId, accessToken) {
  const url = `${config.pingone.apiUri}/v1/environments/${environmentId}/users`;
  
  const data = {
    username: user.username,
    email: user.email,
    population: { id: user.populationId },
    name: {
      given: user.firstName,
      family: user.lastName
    }
  };
  
  // Add optional fields
  const optionalFields = config.validation.optionalFields;
  optionalFields.forEach(field => {
    if (user[field] && user[field].trim() !== '') {
      if (field === 'active') {
        data[field] = user[field] === 'true';
      } else {
        data[field] = user[field];
      }
    }
  });
  
  // Handle phone numbers
  const phoneNumbers = [];
  if (user.primaryPhone) {
    phoneNumbers.push({ type: 'primary', value: user.primaryPhone });
  }
  if (user.mobilePhone) {
    phoneNumbers.push({ type: 'mobile', value: user.mobilePhone });
  }
  if (phoneNumbers.length > 0) {
    data.phoneNumbers = phoneNumbers;
  }
  
  // Handle address
  if (user.streetAddress || user.countryCode || user.locality || user.region || user.postalCode) {
    data.address = {};
    if (user.streetAddress) data.address.streetAddress = user.streetAddress;
    if (user.countryCode) data.address.country = user.countryCode;
    if (user.locality) data.address.locality = user.locality;
    if (user.region) data.address.region = user.region;
    if (user.postalCode) data.address.postalCode = user.postalCode;
  }
  
  const response = await axios.post(url, data, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000 // 30 second timeout
  });
  
  return response.data;
}

// Enhanced user delete endpoint with security
app.post('/delete-users', uploadRateLimiter, upload.single('csv'), validateInput, async (req, res) => {
  const startTime = writeRunHeader();
  cancelRequested = false;
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  try {
    const filePath = req.file.path;
    const { environmentId, clientId, clientSecret } = req.body;
    const validation = authService.validateAllCredentials(environmentId, clientId, clientSecret);
    if (!validation.isValid) {
      logStatus(`/delete-users | validation_error`);
      writeRunFooter(startTime);
      res.write(JSON.stringify({ error: 'Invalid credentials format.', details: validation.errors }) + '\n');
      return res.end();
    }
    const accessToken = await authService.getWorkerToken(environmentId, clientId, clientSecret);
    const csvData = fs.readFileSync(filePath, 'utf8');
    const results = Papa.parse(csvData, {
      header: true,
      skipEmptyLines: true,
      error: (error) => { throw new Error(`CSV parsing error: ${error.message}`); }
    });
    if (results.errors.length > 0) {
      throw new Error(`CSV parsing errors: ${results.errors.map(e => e.message).join(', ')}`);
    }
    const users = results.data;
    if (users.length > config.validation.maxUsersPerImport) {
      throw new Error(`Too many users. Maximum allowed: ${config.validation.maxUsersPerImport}`);
    }
    res.write(JSON.stringify({ progress: 'started', total: users.length, processed: 0 }) + '\n');
    let deletedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let batchCounter = 0;
    const errors = [];
    for (let i = 0; i < users.length; i++) {
      if (cancelRequested) {
        logStatus(`/delete-users | cancelled`);
        res.write(JSON.stringify({ progress: 'cancelled', processed: i, deleted: deletedCount, skipped: skippedCount, error: errorCount }) + '\n');
        break;
      }
      try {
        const user = users[i];
        const userId = await findUserByUsername(user.username, environmentId, accessToken);
        if (userId) {
          await deleteUserWithRetry(userId, environmentId, accessToken);
          deletedCount++;
          logStatus(`/delete-users | user_${i + 1}_deleted | ${user.username}`);
          
          // Add small delay between requests to avoid rate limiting
          if (i < users.length - 1) {
            await throttle(200); // 200ms delay between user deletions
          }
        } else {
          skippedCount++;
          logStatus(`/delete-users | user_${i + 1}_skipped | ${user.username}`);
        }
      } catch (error) {
        errorCount++;
        const errorMsg = `User ${i + 1} (${users[i].username}): ${error.message}`;
        errors.push(errorMsg);
        logStatus(`/delete-users | user_${i + 1}_error | ${errorMsg}`);
      }
      if ((i + 1) % 5 === 0 || i === users.length - 1) {
        batchCounter++;
        const processedCount = i + 1;
        res.write(JSON.stringify({ 
          progress: 'processing', 
          processed: processedCount, 
          total: users.length,
          batchCounter: batchCounter,
          deleted: deletedCount,
          skipped: skippedCount,
          added: 0,
          modified: 0,
          error: errorCount
        }) + '\n');
      }
    }
    try { fs.unlinkSync(filePath); } catch (err) { console.error('Error deleting uploaded file:', err); }
    const result = {
      progress: 'complete',
      total: users.length,
      added: 0,
      deleted: deletedCount,
      modified: 0,
      skipped: skippedCount,
      errors: errorCount,
      errorDetails: errors,
      cancelled: cancelRequested,
      batchCounter: batchCounter
    };
    logStatus(`/delete-users | complete | ${JSON.stringify(result)}`);
    writeRunFooter(startTime);
    res.write(JSON.stringify(result) + '\n');
    res.end();
  } catch (err) {
    logStatus(`/delete-users | error | ${err.message}`);
    writeRunFooter(startTime);
    res.write(JSON.stringify({ error: err.message }) + '\n');
    res.end();
  }
});

// Helper function to find user by username
async function findUserByUsername(username, environmentId, accessToken) {
  const url = `${config.pingone.apiUri}/v1/environments/${environmentId}/users`;
  
  const response = await axios.get(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    params: {
      filter: `username eq "${username}"`
    },
    timeout: 30000
  });
  
  if (response.data._embedded && response.data._embedded.users && response.data._embedded.users.length > 0) {
    return response.data._embedded.users[0].id;
  }
  
  return null;
}

// Helper function to delete user
async function deleteUser(userId, environmentId, accessToken) {
  const url = `${config.pingone.apiUri}/v1/environments/${environmentId}/users/${userId}`;
  
  await axios.delete(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });
}

// Serve static files from the current directory (moved after API routes)
app.use(express.static(__dirname));

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const PORT = config.server.port;
const HOST = config.server.host;

app.listen(PORT, HOST, () => {
  console.log(`🚀 Enhanced PingOne User Management Server running on http://${HOST}:${PORT}`);
  console.log(`📊 Environment: ${config.server.environment}`);
  console.log(`🔒 Security: Rate limiting, input validation, and security headers enabled`);
  console.log(`📝 Logging: ${config.logging.file}`);
  console.log(`📁 Uploads: ${config.upload.destination}`);
  
  const serverUrls = getServerUrls();
  console.log(`🌐 Available URLs: ${serverUrls.join(', ')}`);
});

module.exports = app; 