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

// Serve static files from the current directory
app.use(express.static(__dirname));

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
    
    // Validate input
    const validation = authService.validateAllCredentials(environmentId, clientId, clientSecret);
    if (!validation.isValid) {
      logStatus(`/get-worker-token | validation_error`);
      writeRunFooter(startTime);
      return res.status(400).json({ 
        error: 'Invalid credentials format.',
        details: validation.errors
      });
    }
    
    const token = await authService.getWorkerToken(environmentId, clientId, clientSecret);
    logStatus(`/get-worker-token | success`);
    writeRunFooter(startTime);
    res.json({ access_token: token });
  } catch (err) {
    logStatus(`/get-worker-token | error`);
    const timestamp = new Date().toISOString();
    const errorMsg = err && err.stack ? err.stack : (err && err.message ? err.message : JSON.stringify(err));
    const logEntry = `${timestamp} | Get Worker Token failed | ${errorMsg}`;
    safeAppendLog(logEntry + '\n');
    writeRunFooter(startTime);
    
    res.status(500).json({ error: err.message });
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

// Enhanced user import endpoint with security
app.post('/import-users', uploadRateLimiter, upload.single('csv'), validateInput, async (req, res) => {
  const mode = req.body.mode || 'import';
  let operationType = 'Import';
  
  // Determine operation type based on mode
  if (mode === 'modify') {
    operationType = 'Modify';
  } else if (mode === 'import+modify') {
    operationType = 'Import+Modify';
  }
  
  // Log operation start with detailed information
  logOperationStart(operationType);
  
  const startTime = writeRunHeader();
  cancelRequested = false;
  
  // Set up streaming response
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  try {
    const filePath = req.file.path;
    const { environmentId, clientId, clientSecret } = req.body;
    
    // Validate credentials
    const validation = authService.validateAllCredentials(environmentId, clientId, clientSecret);
    if (!validation.isValid) {
      logStatus(`/import-users | validation_error`);
      writeRunFooter(startTime);
      res.write(JSON.stringify({ error: 'Invalid credentials format.', details: validation.errors }) + '\n');
      return res.end();
    }
    
    // Get access token
    const accessToken = await authService.getWorkerToken(environmentId, clientId, clientSecret);
    
    // Parse CSV file
    const csvData = fs.readFileSync(filePath, 'utf8');
    const results = Papa.parse(csvData, {
      header: true,
      skipEmptyLines: true,
      error: (error) => {
        throw new Error(`CSV parsing error: ${error.message}`);
      }
    });
    
    if (results.errors.length > 0) {
      throw new Error(`CSV parsing errors: ${results.errors.map(e => e.message).join(', ')}`);
    }
    
    const users = results.data;
    
    // Validate user count
    if (users.length > config.validation.maxUsersPerImport) {
      throw new Error(`Too many users. Maximum allowed: ${config.validation.maxUsersPerImport}`);
    }
    
    // Validate required fields
    const requiredFields = config.validation.requiredFields;
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const missingFields = requiredFields.filter(field => !user[field] || user[field].trim() === '');
      if (missingFields.length > 0) {
        throw new Error(`User ${i + 1} missing required fields: ${missingFields.join(', ')}`);
      }
    }
    
    // Send initial progress
    res.write(JSON.stringify({ progress: 'started', total: users.length, processed: 0 }) + '\n');
    
    // Process users with progress updates
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    let batchCounter = 0;
    
    for (let i = 0; i < users.length; i++) {
      if (cancelRequested) {
        logStatus(`/import-users | cancelled`);
        res.write(JSON.stringify({ progress: 'cancelled', processed: i, success: successCount, error: errorCount }) + '\n');
        break;
      }
      
      try {
        const user = users[i];
        await createUser(user, environmentId, accessToken);
        successCount++;
        logStatus(`/import-users | user_${i + 1}_success | ${user.username || user.email}`);
      } catch (error) {
        errorCount++;
        const errorMsg = `User ${i + 1} (${users[i].username || users[i].email}): ${error.message}`;
        errors.push(errorMsg);
        logStatus(`/import-users | user_${i + 1}_error | ${errorMsg}`);
      }
      
      // Send progress update every 5 users or on the last user
      if ((i + 1) % 5 === 0 || i === users.length - 1) {
        batchCounter++;
        const processedCount = i + 1;
        res.write(JSON.stringify({ 
          progress: 'processing', 
          processed: processedCount, 
          total: users.length,
          batchCounter: batchCounter,
          success: successCount, 
          error: errorCount 
        }) + '\n');
      }
    }
    
    // Clean up uploaded file
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('Error deleting uploaded file:', err);
    }
    
    const result = {
      progress: 'complete',
      success: successCount,
      errors: errorCount,
      total: users.length,
      errorDetails: errors,
      cancelled: cancelRequested,
      batchCounter: batchCounter
    };
    
    logStatus(`/import-users | complete | ${JSON.stringify(result)}`);
    writeRunFooter(startTime);
    
    // Send final result
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
  
  // Set up streaming response
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  try {
    const filePath = req.file.path;
    const { environmentId, clientId, clientSecret } = req.body;
    
    // Validate credentials
    const validation = authService.validateAllCredentials(environmentId, clientId, clientSecret);
    if (!validation.isValid) {
      logStatus(`/delete-users | validation_error`);
      writeRunFooter(startTime);
      res.write(JSON.stringify({ error: 'Invalid credentials format.', details: validation.errors }) + '\n');
      return res.end();
    }
    
    // Get access token
    const accessToken = await authService.getWorkerToken(environmentId, clientId, clientSecret);
    
    // Parse CSV file
    const csvData = fs.readFileSync(filePath, 'utf8');
    const results = Papa.parse(csvData, {
      header: true,
      skipEmptyLines: true,
      error: (error) => {
        throw new Error(`CSV parsing error: ${error.message}`);
      }
    });
    
    if (results.errors.length > 0) {
      throw new Error(`CSV parsing errors: ${results.errors.map(e => e.message).join(', ')}`);
    }
    
    const users = results.data;
    
    // Validate user count
    if (users.length > config.validation.maxUsersPerImport) {
      throw new Error(`Too many users. Maximum allowed: ${config.validation.maxUsersPerImport}`);
    }
    
    // Send initial progress
    res.write(JSON.stringify({ progress: 'started', total: users.length, processed: 0 }) + '\n');
    
    // Process users with progress updates
    let successCount = 0;
    let errorCount = 0;
    let notFoundCount = 0;
    const errors = [];
    let batchCounter = 0;
    
    for (let i = 0; i < users.length; i++) {
      if (cancelRequested) {
        logStatus(`/delete-users | cancelled`);
        res.write(JSON.stringify({ progress: 'cancelled', processed: i, success: successCount, error: errorCount }) + '\n');
        break;
      }
      
      try {
        const user = users[i];
        const userId = await findUserByUsername(user.username, environmentId, accessToken);
        
        if (userId) {
          await deleteUser(userId, environmentId, accessToken);
          successCount++;
          logStatus(`/delete-users | user_${i + 1}_deleted | ${user.username}`);
        } else {
          notFoundCount++;
          logStatus(`/delete-users | user_${i + 1}_not_found | ${user.username}`);
        }
      } catch (error) {
        errorCount++;
        const errorMsg = `User ${i + 1} (${users[i].username}): ${error.message}`;
        errors.push(errorMsg);
        logStatus(`/delete-users | user_${i + 1}_error | ${errorMsg}`);
      }
      
      // Send progress update every 5 users or on the last user
      if ((i + 1) % 5 === 0 || i === users.length - 1) {
        batchCounter++;
        const processedCount = i + 1;
        res.write(JSON.stringify({ 
          progress: 'processing', 
          processed: processedCount, 
          total: users.length,
          batchCounter: batchCounter,
          success: successCount, 
          error: errorCount,
          notFound: notFoundCount
        }) + '\n');
      }
    }
    
    // Clean up uploaded file
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('Error deleting uploaded file:', err);
    }
    
    const result = {
      progress: 'complete',
      success: successCount,
      errors: errorCount,
      notFound: notFoundCount,
      total: users.length,
      errorDetails: errors,
      cancelled: cancelRequested,
      batchCounter: batchCounter
    };
    
    logStatus(`/delete-users | complete | ${JSON.stringify(result)}`);
    writeRunFooter(startTime);
    
    // Send final result
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