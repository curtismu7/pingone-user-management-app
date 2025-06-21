/**
 * PingOne User Management Application - Node.js Server
 * 
 * ⚠️ IMPORTANT: This application MUST run on this Node.js server.
 * Do NOT use http-server or any static file server.
 * 
 * This server provides:
 * - PingOne API authentication endpoints
 * - User import/delete/modify operations
 * - File upload handling
 * - Real-time logging and status tracking
 * - CORS support for cross-origin requests
 * - Enhanced security with rate limiting and input validation
 * 
 * To run: npm start (which executes: node server.js)
 * Server runs on: http://localhost:3001
 */

const express = require('express');
const multer = require('multer');
const uDSV = require('udsv');
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
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { environmentId, clientId, clientSecret } = JSON.parse(body);
        logStatus(`/get-worker-token | start`);
        if (!environmentId || !clientId || !clientSecret) {
          logStatus(`/get-worker-token | error`);
          writeRunFooter(startTime);
          return res.status(400).json({ error: 'Missing required credentials.' });
        }
        const token = await getWorkerToken(environmentId, clientId, clientSecret);
        logStatus(`/get-worker-token | success`);
        writeRunFooter(startTime);
        res.json({ access_token: token });
      } catch (err) {
        logStatus(`/get-worker-token | error`);
        // Add detailed error logging for Get Worker Token failures
        const timestamp = new Date().toISOString();
        const errorMsg = err && err.stack ? err.stack : (err && err.message ? err.message : JSON.stringify(err));
        const logEntry = `${timestamp} | Get Worker Token failed | ${errorMsg}`;
        safeAppendLog(logEntry + '\n');
        writeRunFooter(startTime);
        
        // Return more specific error messages based on the error type
        let errorMessage = 'Failed to get worker token.';
        if (err.response) {
          // PingOne API error response
          if (err.response.status === 401) {
            errorMessage = 'Invalid credentials. Please check your Client ID and Client Secret.';
          } else if (err.response.status === 404) {
            errorMessage = 'Environment not found. Please check your Environment ID.';
          } else if (err.response.status === 400) {
            errorMessage = 'Invalid request. Please check your credentials format.';
          } else {
            errorMessage = `PingOne API error: ${err.response.status} - ${err.response.statusText}`;
          }
        } else if (err.code === 'ENOTFOUND') {
          errorMessage = 'Network error. Please check your internet connection.';
        } else if (err.code === 'ECONNREFUSED') {
          errorMessage = 'Connection refused. Please try again later.';
        } else if (err.message) {
          errorMessage = err.message;
        }
        
        res.status(500).json({ error: errorMessage });
      }
    });
  });
});

// New endpoint to get environment details
app.post('/get-environment-details', async (req, res) => {
  const startTime = writeRunHeader();
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      const { environmentId, clientId, clientSecret } = JSON.parse(body);
      logStatus(`/get-environment-details | start`);
      if (!environmentId || !clientId || !clientSecret) {
        logStatus(`/get-environment-details | error`);
        writeRunFooter(startTime);
        return res.status(400).json({ error: 'Missing required credentials.' });
      }
      
      // Get access token first
      const accessToken = await getWorkerToken(environmentId, clientId, clientSecret);
      
      // Fetch environment details
      const response = await axios.get(
        `https://api.pingone.com/v1/environments/${environmentId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const environmentName = response.data.name;
      logStatus(`/get-environment-details | success`);
      writeRunFooter(startTime);
      res.json({ 
        environment_name: environmentName,
        environment_id: environmentId
      });
    } catch (err) {
      logStatus(`/get-environment-details | error`);
      const timestamp = new Date().toISOString();
      const errorMsg = err && err.stack ? err.stack : (err && err.message ? err.message : JSON.stringify(err));
      const logEntry = `${timestamp} | Get Environment Details failed | ${errorMsg}`;
      safeAppendLog(logEntry + '\n');
      writeRunFooter(startTime);
      
      // Return more specific error messages based on the error type
      let errorMessage = 'Failed to get environment details.';
      if (err.response) {
        if (err.response.status === 401) {
          errorMessage = 'Invalid credentials. Please check your Client ID and Client Secret.';
        } else if (err.response.status === 404) {
          errorMessage = 'Environment not found. Please check your Environment ID.';
        } else if (err.response.status === 400) {
          errorMessage = 'Invalid request. Please check your credentials format.';
        } else {
          errorMessage = `PingOne API error: ${err.response.status} - ${err.response.statusText}`;
        }
      } else if (err.code === 'ENOTFOUND') {
        errorMessage = 'Network error. Please check your internet connection.';
      } else if (err.code === 'ECONNREFUSED') {
        errorMessage = 'Connection refused. Please try again later.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      res.status(500).json({ error: errorMessage });
    }
  });
});

app.post('/import-users', upload.single('csv'), (req, res) => {
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
  const filePath = req.file.path;
  const environmentId = req.body.environmentId;
  const clientId = req.body.clientId;
  const clientSecret = req.body.clientSecret;
  const modifyMode = req.body.modifyMode || 'all';
  let modifyAttributes = [];
  try {
    if (req.body.modifyAttributes) {
      modifyAttributes = JSON.parse(req.body.modifyAttributes);
    }
  } catch (e) { modifyAttributes = []; }
  logStatus(`/import-users | start`);
  if (!environmentId || !clientId || !clientSecret) {
    logStatus(`/import-users | error`);
    res.status(400).json({ error: 'Missing required PingOne credentials.' });
    return;
  }
  fs.readFile(filePath, 'utf8', async (err, csvData) => {
    if (err) {
      logStatus(`/import-users | error`);
      res.status(500).json({ error: 'Error reading CSV file' });
      return;
    }
    const importResult = uDSV.parse(csvData, { header: true, skipEmptyLines: true });
    let accessToken;
    try {
      accessToken = await getWorkerToken(environmentId, clientId, clientSecret);
      if (res.write) {
        res.write(JSON.stringify({ progress: mode === 'modify' ? 'modifying_users' : 'importing_users' }) + '\n');
      }
    } catch (tokenErr) {
      logStatus(`/import-users | error`);
      res.status(500).json({ error: 'Failed to get worker token' });
      return;
    }
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    let modifiedCount = 0;
    for (const user of importResult.data) {
      if (cancelRequested) {
        if (res.write) {
          res.write(JSON.stringify({ progress: 'cancelled', processed: processedCount, success: successCount, error: errorCount, skipped: skippedCount, modified: modifiedCount }) + '\n');
          res.end();
        }
        fs.unlinkSync(filePath);
        logStatus(`/import-users | cancelled`);
        return;
      }
      const data = {
        username: user.username,
        email: user.email,
        population: { id: user.populationId },
        name: {
          given: user.firstName,
          family: user.lastName
        }
      };
      // Optional fields
      if (user.middleName) data.name.middle = user.middleName;
      if (user.prefix) data.name.prefix = user.prefix;
      if (user.suffix) data.name.suffix = user.suffix;
      if (user.formattedName) data.name.formatted = user.formattedName;
      if (user.title) data.title = user.title;
      if (user.preferredLanguage) data.preferredLanguage = user.preferredLanguage;
      if (user.locale) data.locale = user.locale;
      if (user.timezone) data.timezone = user.timezone;
      if (user.externalId) data.externalId = user.externalId;
      if (user.type) data.type = user.type;
      if (user.active !== undefined && user.active !== "") data.active = user.active === 'true';
      if (user.nickname) data.nickname = user.nickname;
      if (user.password) data.password = user.password;
      // Phone numbers
      const phoneNumbers = [];
      if (user.primaryPhone) phoneNumbers.push({ type: 'primary', value: user.primaryPhone });
      if (user.mobilePhone) phoneNumbers.push({ type: 'mobile', value: user.mobilePhone });
      if (phoneNumbers.length > 0) data.phoneNumbers = phoneNumbers;
      // Address
      if (user.streetAddress || user.countryCode || user.locality || user.region || user.postalCode) {
        data.address = {};
        if (user.streetAddress) data.address.streetAddress = user.streetAddress;
        if (user.countryCode) data.address.country = user.countryCode;
        if (user.locality) data.address.locality = user.locality;
        if (user.region) data.address.region = user.region;
        if (user.postalCode) data.address.postalCode = user.postalCode;
      }
      try {
        // Check if user exists
        const searchResp = await axios.get(
          `https://api.pingone.com/v1/environments/${environmentId}/users?filter=username eq \"${user.username}\"`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        const foundUsers = searchResp.data._embedded && searchResp.data._embedded.users ? searchResp.data._embedded.users : [];
        if (mode === 'import') {
          if (foundUsers.length > 0) {
            // User exists, skip
            logStatus(`/import-users | ${user.username} | skipped`);
            report.push({ username: user.username, status: 'skipped' });
            skippedCount++;
          } else {
            // Create user
            await axios.post(
              `https://api.pingone.com/v1/environments/${environmentId}/users`,
              data,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                },
                timeout: 10000
              }
            );
            logStatus(`/import-users | ${user.username} | created`);
            report.push({ username: user.username, status: 'created' });
            successCount++;
          }
        } else if (mode === 'modify') {
          if (foundUsers.length === 0) {
            // User not found, skip
            logStatus(`/import-users | ${user.username} | skipped`);
            report.push({ username: user.username, status: 'skipped' });
            skippedCount++;
          } else {
            // User exists, update
            const userId = foundUsers[0].id;
            let updateData = {};
            // Map checkbox IDs to user fields
            const attrMap = {
              modAttrFirstName: ['name', 'given'],
              modAttrLastName: ['name', 'family'],
              modAttrEmail: ['email'],
              modAttrUsername: ['username'],
              modAttrPassword: ['password'],
              modAttrPopulation: ['population', 'id'],
              modAttrActive: ['active'],
              modAttrTitle: ['title'],
              modAttrPhone: ['phoneNumbers'],
              modAttrAddress: ['address'],
              modAttrLocale: ['locale'],
              modAttrTimezone: ['timezone'],
              modAttrExternalId: ['externalId'],
              modAttrType: ['type'],
              modAttrNickname: ['nickname']
            };
            // If no modifyAttributes, allow all (legacy behavior)
            const allowAll = !modifyAttributes || modifyAttributes.length === 0;
            // Always compare and only update changed fields, but restrict to allowed attributes
            for (const key in data) {
              // Check if this key or subkey is allowed by modifyAttributes
              let allowed = false;
              if (allowAll) {
                allowed = true;
              } else {
                for (const attr of modifyAttributes) {
                  if (!attrMap[attr]) continue;
                  if (attrMap[attr][0] === key) {
                    // If subkey, check subkey match
                    if (attrMap[attr].length === 1) {
                      allowed = true;
                      break;
                    } else if (typeof data[key] === 'object' && data[key] !== null) {
                      // Will check subkey below
                      allowed = true;
                      break;
                    }
                  }
                }
              }
              if (!allowed) continue;
              if (typeof data[key] === 'object' && data[key] !== null) {
                updateData[key] = {};
                for (const subkey in data[key]) {
                  // If restricting by subkey, check if this subkey is allowed
                  let subAllowed = allowAll;
                  if (!allowAll) {
                    for (const attr of modifyAttributes) {
                      if (attrMap[attr] && attrMap[attr][0] === key && attrMap[attr][1] === subkey) {
                        subAllowed = true;
                        break;
                      }
                    }
                  }
                  if (!subAllowed) continue;
                  if (JSON.stringify(data[key][subkey]) !== JSON.stringify(foundUsers[0][key]?.[subkey])) {
                    updateData[key][subkey] = data[key][subkey];
                  }
                }
                if (Object.keys(updateData[key]).length === 0) delete updateData[key];
              } else {
                if (JSON.stringify(data[key]) !== JSON.stringify(foundUsers[0][key])) {
                  updateData[key] = data[key];
                }
              }
            }
            // If no changes, skip update and log as skipped
            if (Object.keys(updateData).length === 0) {
              logStatus(`/import-users | ${user.username} | skipped`);
              report.push({ username: user.username, status: 'skipped' });
              skippedCount++;
            } else {
              await axios.patch(
                `https://api.pingone.com/v1/environments/${environmentId}/users/${userId}`,
                updateData,
                {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  },
                  timeout: 10000
                }
              );
              logStatus(`/import-users | ${user.username} | modified`);
              report.push({ username: user.username, status: 'modified' });
              modifiedCount++;
            }
          }
        } else if (mode === 'import+modify') {
          if (foundUsers.length === 0) {
            // Create user
            await axios.post(
              `https://api.pingone.com/v1/environments/${environmentId}/users`,
              data,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                },
                timeout: 10000
              }
            );
            logStatus(`/import-users | ${user.username} | created`);
            report.push({ username: user.username, status: 'created' });
            successCount++;
          } else {
            // User exists, update
            const userId = foundUsers[0].id;
            let updateData = {};
            // Map checkbox IDs to user fields
            const attrMap = {
              modAttrFirstName: ['name', 'given'],
              modAttrLastName: ['name', 'family'],
              modAttrEmail: ['email'],
              modAttrUsername: ['username'],
              modAttrPassword: ['password'],
              modAttrPopulation: ['population', 'id'],
              modAttrActive: ['active'],
              modAttrTitle: ['title'],
              modAttrPhone: ['phoneNumbers'],
              modAttrAddress: ['address'],
              modAttrLocale: ['locale'],
              modAttrTimezone: ['timezone'],
              modAttrExternalId: ['externalId'],
              modAttrType: ['type'],
              modAttrNickname: ['nickname']
            };
            const allowAll = !modifyAttributes || modifyAttributes.length === 0;
            if (modifyMode === 'all') {
              // Only include allowed fields
              for (const key in data) {
                let allowed = false;
                if (allowAll) {
                  allowed = true;
                } else {
                  for (const attr of modifyAttributes) {
                    if (!attrMap[attr]) continue;
                    if (attrMap[attr][0] === key) {
                      if (attrMap[attr].length === 1) {
                        allowed = true;
                        break;
                      } else if (typeof data[key] === 'object' && data[key] !== null) {
                        allowed = true;
                        break;
                      }
                    }
                  }
                }
                if (!allowed) continue;
                if (typeof data[key] === 'object' && data[key] !== null) {
                  updateData[key] = {};
                  for (const subkey in data[key]) {
                    let subAllowed = allowAll;
                    if (!allowAll) {
                      for (const attr of modifyAttributes) {
                        if (attrMap[attr] && attrMap[attr][0] === key && attrMap[attr][1] === subkey) {
                          subAllowed = true;
                          break;
                        }
                      }
                    }
                    if (!subAllowed) continue;
                    updateData[key][subkey] = data[key][subkey];
                  }
                  if (Object.keys(updateData[key]).length === 0) delete updateData[key];
                } else {
                  updateData[key] = data[key];
                }
              }
            } else {
              for (const key in data) {
                let allowed = false;
                if (allowAll) {
                  allowed = true;
                } else {
                  for (const attr of modifyAttributes) {
                    if (!attrMap[attr]) continue;
                    if (attrMap[attr][0] === key) {
                      if (attrMap[attr].length === 1) {
                        allowed = true;
                        break;
                      } else if (typeof data[key] === 'object' && data[key] !== null) {
                        allowed = true;
                        break;
                      }
                    }
                  }
                }
                if (!allowed) continue;
                if (typeof data[key] === 'object' && data[key] !== null) {
                  updateData[key] = {};
                  for (const subkey in data[key]) {
                    let subAllowed = allowAll;
                    if (!allowAll) {
                      for (const attr of modifyAttributes) {
                        if (attrMap[attr] && attrMap[attr][0] === key && attrMap[attr][1] === subkey) {
                          subAllowed = true;
                          break;
                        }
                      }
                    }
                    if (!subAllowed) continue;
                    if (JSON.stringify(data[key][subkey]) !== JSON.stringify(foundUsers[0][key]?.[subkey])) {
                      updateData[key][subkey] = data[key][subkey];
                    }
                  }
                  if (Object.keys(updateData[key]).length === 0) delete updateData[key];
                } else {
                  if (JSON.stringify(data[key]) !== JSON.stringify(foundUsers[0][key])) {
                    updateData[key] = data[key];
                  }
                }
              }
            }
            if (Object.keys(updateData).length > 0) {
              await axios.patch(
                `https://api.pingone.com/v1/environments/${environmentId}/users/${userId}`,
                updateData,
                {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  },
                  timeout: 10000
                }
              );
              logStatus(`/import-users | ${user.username} | modified`);
              report.push({ username: user.username, status: 'modified' });
              modifiedCount++;
            } else {
              logStatus(`/import-users | ${user.username} | skipped`);
              report.push({ username: user.username, status: 'skipped' });
              skippedCount++;
            }
          }
        }
      } catch (err) {
        logStatus(`/import-users | ${user.username} | error`);
        report.push({
          username: user.username,
          status: 'error',
          error: err.response?.data || err.message
        });
        errorCount++;
      }
      processedCount++;
      if (processedCount % 5 === 0) {
        if (res.write) {
          res.write(JSON.stringify({ progress: mode === 'modify' ? 'modifying_users' : 'importing_users', processed: processedCount, success: successCount, error: errorCount, skipped: skippedCount, modified: modifiedCount }) + '\n');
        }
      }
    }
    fs.unlinkSync(filePath);
    logStatus(`/import-users | success`);
    writeRunFooter(startTime);
    if (res.write) {
      res.write(JSON.stringify(report) + '\n');
      res.end();
    }
  });
});

app.post('/delete-users', upload.single('csv'), (req, res) => {
  // Log operation start with detailed information
  logOperationStart('Delete');
  
  const startTime = writeRunHeader();
  cancelRequested = false;
  const filePath = req.file.path;
  const environmentId = req.body.environmentId;
  const clientId = req.body.clientId;
  const clientSecret = req.body.clientSecret;
  logStatus(`/delete-users | start`);
  if (!environmentId || !clientId || !clientSecret) {
    logStatus(`/delete-users | error`);
    res.status(400).json({ error: 'Missing required PingOne credentials.' });
    return;
  }
  fs.readFile(filePath, 'utf8', async (err, csvData) => {
    if (err) {
      logStatus(`/delete-users | error`);
      res.status(500).json({ error: 'Error reading CSV file' });
      return;
    }
    const deleteResult = uDSV.parse(csvData, { header: true, skipEmptyLines: true });
    let accessToken;
    try {
      accessToken = await getWorkerToken(environmentId, clientId, clientSecret);
    } catch (tokenErr) {
      logStatus(`/delete-users | error`);
      res.status(500).json({ error: 'Failed to get worker token' });
      return;
    }
    let deletedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    for (const user of deleteResult.data) {
      if (cancelRequested) {
        if (res.write) {
          res.write(JSON.stringify({ progress: 'cancelled', deleted: deletedCount, success: successCount, error: errorCount }) + '\n');
          res.end();
        }
        fs.unlinkSync(filePath);
        logStatus(`/delete-users | cancelled`);
        return;
      }
      try {
        const searchResp = await axios.get(
          `https://api.pingone.com/v1/environments/${environmentId}/users?filter=username eq \"${user.username}\"`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        const foundUsers = searchResp.data._embedded && searchResp.data._embedded.users ? searchResp.data._embedded.users : [];
        if (foundUsers.length === 0) {
          logStatus(`/delete-users | ${user.username} | not_found`);
          report.push({ username: user.username, status: 'not_found' });
          continue;
        }
        const userId = foundUsers[0].id;
        await axios.delete(
          `https://api.pingone.com/v1/environments/${environmentId}/users/${userId}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        logStatus(`/delete-users | ${user.username} | deleted`);
        report.push({ username: user.username, status: 'deleted' });
        successCount++;
      } catch (err) {
        logStatus(`/delete-users | ${user.username} | error`);
        report.push({
          username: user.username,
          status: 'error',
          error: err.response?.data || err.message
        });
        errorCount++;
      }
      deletedCount++;
      if (deletedCount % 5 === 0) {
        if (res.write) {
          res.write(JSON.stringify({ progress: 'deleting_users', deleted: deletedCount, success: successCount, error: errorCount }) + '\n');
        }
      }
    }
    fs.unlinkSync(filePath);
    logStatus(`/delete-users | success`);
    writeRunFooter(startTime);
    if (res.write) {
      res.write(JSON.stringify(report) + '\n');
      res.end();
    } else {
      res.json(report);
    }
  });
});

// Log endpoints
app.get('/import-status-log', (req, res) => {
  try {
    if (fs.existsSync(statusLogPath)) {
      const logContent = fs.readFileSync(statusLogPath, 'utf8');
      res.setHeader('Content-Type', 'text/plain');
      res.send(logContent);
    } else {
      res.status(404).json({ error: 'Log file not found' });
    }
  } catch (error) {
    console.error('Error reading log file:', error);
    res.status(500).json({ error: 'Error reading log file' });
  }
});

app.get('/download-log', (req, res) => {
  try {
    if (fs.existsSync(statusLogPath)) {
      res.setHeader('Content-Disposition', 'attachment; filename="import-status.log"');
      res.setHeader('Content-Type', 'text/plain');
      res.sendFile(statusLogPath);
    } else {
      res.status(404).json({ error: 'Log file not found' });
    }
  } catch (error) {
    console.error('Error downloading log file:', error);
    res.status(500).json({ error: 'Error downloading log file' });
  }
});

app.post('/clear-log', (req, res) => {
  try {
    // Create a new log file with just the header
    const logStartTime = new Date().toLocaleString();
    safeWriteLog(`********\n${logStartTime}\nStart of Logging\n`);
    res.json({ success: true, message: 'Log cleared successfully' });
  } catch (error) {
    console.error('Error clearing log file:', error);
    res.status(500).json({ error: 'Error clearing log file' });
  }
});

app.listen(3001, () => {
  console.log('Server running on http://localhost:3001');
});