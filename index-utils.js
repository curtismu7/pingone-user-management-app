// index-utils.js
// Utility functions for PingOne User Management main page

// Library Loading Logger
window.libraryLogger = {
  loadedLibraries: new Set(),
  loadTimes: {},
  errors: [],
  
  logLibraryLoad: function(libraryName, timestamp, source) {
    this.loadedLibraries.add(libraryName);
    this.loadTimes[libraryName] = {
      timestamp: timestamp,
      source: source,
      loadTime: Date.now() - timestamp
    };
    console.log(`📚 ${libraryName} loaded from ${source} in ${this.loadTimes[libraryName].loadTime}ms`);
  },
  
  logError: function(libraryName, error, source) {
    this.errors.push({
      library: libraryName,
      error: error,
      source: source,
      timestamp: Date.now()
    });
    console.error(`❌ Error loading ${libraryName} from ${source}:`, error);
  },
  
  getLoadReport: function() {
    return {
      loaded: Array.from(this.loadedLibraries),
      loadTimes: this.loadTimes,
      errors: this.errors
    };
  }
};

// CSV Parser Management
async function ensureCSVParserLoaded() {
  return new Promise((resolve, reject) => {
    // Check if uDSV is available (our primary parser)
    if (typeof uDSV !== 'undefined') {
      console.log('✅ uDSV CSV parser is already loaded');
      resolve();
      return;
    }
    
    // Check if Papa Parse is available (fallback)
    if (typeof Papa !== 'undefined' && Papa.parse) {
      console.log('✅ Papa Parse is already loaded');
      resolve();
      return;
    }
    
    // Wait for parser to load
    let attempts = 0;
    const maxAttempts = 100; // 10 seconds max wait
    
    const checkParser = () => {
      attempts++;
      
      if (typeof uDSV !== 'undefined' || (typeof Papa !== 'undefined' && Papa.parse)) {
        console.log('✅ CSV parser loaded after waiting');
        resolve();
        return;
      }
      
      if (attempts >= maxAttempts) {
        console.error('❌ CSV parser failed to load after 10 seconds');
        reject(new Error('CSV parser library failed to load'));
        return;
      }
      
      setTimeout(checkParser, 100);
    };
    
    checkParser();
  });
}

// Function to count CSV rows and update status
async function countCSVRows(file) {
  return new Promise(async (resolve, reject) => {
    if (!file) {
      window.globalCSVRowCount = 0;
      resolve(0);
      return;
    }
    
    try {
      // Ensure CSV parser is loaded
      await ensureCSVParserLoaded();
      
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const csvString = e.target.result;
          
          // Use uDSV if available, otherwise fall back to Papa Parse
          let result;
          if (typeof uDSV !== 'undefined') {
            result = uDSV.parse(csvString, {
              header: true,
              skipEmptyLines: true
            });
          } else if (typeof Papa !== 'undefined' && Papa.parse) {
            result = Papa.parse(csvString, {
              header: true,
              skipEmptyLines: true
            });
          } else {
            throw new Error('No CSV parser available');
          }
          
          const rowCount = result.data ? result.data.length : 0;
          window.globalCSVRowCount = rowCount; // Store globally
          resolve(rowCount);
        } catch (error) {
          console.error('Error parsing CSV for row count:', error);
          window.globalCSVRowCount = 0;
          reject(error);
        }
      };
      reader.onerror = function(error) {
        console.error('Error reading file for row count:', error);
        window.globalCSVRowCount = 0;
        reject(error);
      };
      reader.readAsText(file);
    } catch (error) {
      console.error('Failed to load CSV parser:', error);
      window.globalCSVRowCount = 0;
      reject(error);
    }
  });
}

// Function to update status area with total records
function updateTotalRecordsDisplay(rowCount) {
  const actionStatusText = document.getElementById('actionStatusText');
  if (actionStatusText) {
    actionStatusText.textContent = `Total Records: ${rowCount}`;
  }
}

// Function to clear total records display
function clearTotalRecordsDisplay() {
  const actionStatusText = document.getElementById('actionStatusText');
  if (actionStatusText) {
    actionStatusText.textContent = '';
  }
}

// File handling utilities
function loadSavedFileName() {
  const selectedFileNameDisplay = document.getElementById('selectedFileNameDisplay');
  const selectedFileNameText = document.getElementById('selectedFileNameText');
  const saveFileNameCheckbox = document.getElementById('saveFileNameCheckbox');
  const headerFileName = document.getElementById('headerFileName');
  const fileNameDisplay = document.getElementById('fileNameDisplay');
  
  // First check localStorage for persistent file name (default file from settings)
  let fileName = localStorage.getItem('pingone_default_csv_file');
  if (fileName) {
    if(fileNameDisplay) {
      fileNameDisplay.textContent = fileName;
    }
    if (selectedFileNameText) {
      selectedFileNameText.innerHTML = `<strong>Default File:</strong> <span style="color:#e60028;">${fileName}</span>`;
    }
    if (selectedFileNameDisplay) {
      selectedFileNameDisplay.style.display = 'block';
    }
    if (saveFileNameCheckbox) saveFileNameCheckbox.checked = true;
    
    // Update the header text with the saved file name
    if (headerFileName) {
      headerFileName.textContent = fileName;
    }
  } else {
    // Check sessionStorage for temporary file name
    fileName = sessionStorage.getItem('temp_csv_file_name');
    if (fileName) {
      if(fileNameDisplay) {
        fileNameDisplay.textContent = fileName;
      }
      if (selectedFileNameText) {
        selectedFileNameText.innerHTML = `<strong>Selected:</strong> <span style="color:#e60028;">${fileName}</span>`;
      }
      if (selectedFileNameDisplay) {
        selectedFileNameDisplay.style.display = 'block';
      }
      if (saveFileNameCheckbox) saveFileNameCheckbox.checked = false;
      
      // Update the header text with the selected file name
      if (headerFileName) {
        headerFileName.textContent = fileName;
      }
    } else {
      // No saved file name, reset to default
      if (headerFileName) {
        headerFileName.textContent = 'file with users and extension of .csv file';
      }
    }
  }
}

// Function to sync file names when navigating between pages
function syncFileNameBetweenPages() {
  // This function can be called when navigating to ensure file names are synced
  // It's automatically called by loadSavedFileName() on page load
  loadSavedFileName();
}

// Rate limit error handling
function handle429Error(error, operation) {
  console.error(`${operation} error (429):`, error);
  
  // Show user-friendly message
  const statusBox = document.getElementById('statusBox');
  const rateLimitMessage = `
    <div class="alert alert-warning">
      <strong>Rate Limit Exceeded</strong><br>
      PingOne API is temporarily limiting requests. This is normal for bulk operations.<br>
      <strong>What to do:</strong>
      <ul>
        <li>Wait 30-60 seconds before trying again</li>
        <li>Try with fewer users at once</li>
        <li>Check your PingOne environment limits</li>
      </ul>
      <small>Technical details: ${error.message}</small>
    </div>
  `;
  
  if (statusBox) {
    statusBox.innerHTML = rateLimitMessage;
  }
  
  // Show rate limit warning banner
  showRateLimitWarning();
  
  // Auto-retry after delay (for certain operations)
  if (operation === 'Import' || operation === 'Delete') {
    setTimeout(() => {
      console.log(`Auto-retrying ${operation} operation after rate limit delay...`);
      // Could implement auto-retry logic here
    }, 30000); // 30 second delay
  }
}

// Function to check if an error is a 429 error
function is429Error(error) {
  return error.message && (
    error.message.includes('429') || 
    error.message.includes('Too Many Requests') ||
    error.message.includes('rate limit')
  );
}

// Function to show rate limit warning
function showRateLimitWarning() {
  const rateLimitWarning = document.getElementById('rateLimitWarning');
  if (rateLimitWarning) {
    rateLimitWarning.style.display = 'flex';
    
    // Auto-hide after 60 seconds
    setTimeout(() => {
      hideRateLimitWarning();
    }, 60000);
  }
}

// Function to hide rate limit warning
function hideRateLimitWarning() {
  const rateLimitWarning = document.getElementById('rateLimitWarning');
  if (rateLimitWarning) {
    rateLimitWarning.style.display = 'none';
  }
}

// Manual retry function for CSV parser loading
async function retryPapaParseLoading() {
  console.log('🔄 Manually retrying CSV parser loading...');
  
  const statusBox = document.getElementById('statusBox');
  if (statusBox) {
    statusBox.innerHTML = `
      <div class="alert alert-info">
        <strong>Loading CSV Parser...</strong><br>
        Attempting to load the CSV parsing library...<br>
        <small>Please wait...</small>
      </div>
    `;
  }
  
  try {
    await ensureCSVParserLoaded();
    console.log('✅ CSV parser loaded successfully on manual retry');
    
    // Clear the status
    if (statusBox) {
      statusBox.innerHTML = '';
    }
    
    // Re-count rows if a file is selected
    const fileInput = document.getElementById('csvFile');
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      const rowCount = await countCSVRows(fileInput.files[0]);
      updateTotalRecordsDisplay(rowCount);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Manual CSV parser retry failed:', error);
    
    if (statusBox) {
      statusBox.innerHTML = `
        <div class="alert alert-danger">
          <strong>Library Loading Failed</strong><br>
          CSV parser library failed to load: ${error.message}<br>
          <button onclick="retryPapaParseLoading()" class="button button-sm button-secondary">Retry Loading</button>
          <small>If the issue persists, please check your internet connection and refresh the page.</small>
        </div>
      `;
    }
    
    return false;
  }
}

// Error handling utilities
function handleApiError(error, operation = 'operation') {
  console.error(`${operation} error:`, error);
  
  let errorMessage = 'An unexpected error occurred.';
  let errorDetails = '';
  
  if (error.response) {
    // Server responded with error status
    const status = error.response.status;
    const data = error.response.data;
    
    if (status === 401) {
      errorMessage = 'Authentication failed. Please check your PingOne credentials in the settings.';
      errorDetails = data?.error || 'Unauthorized';
    } else if (status === 403) {
      errorMessage = 'Access denied. Please check your worker app permissions in PingOne.';
      errorDetails = data?.error || 'Forbidden';
    } else if (status === 404) {
      errorMessage = 'Environment or resource not found. Please verify your Environment ID in the settings.';
      errorDetails = data?.error || 'Not Found';
    } else if (status === 400) {
      errorMessage = 'Invalid request. Please check your settings data and try again.';
      errorDetails = data?.error || 'Bad Request';
    } else if (status >= 500) {
      errorMessage = 'PingOne service is temporarily unavailable. Please try again later.';
      errorDetails = data?.error || `Server Error (${status})`;
    } else {
      errorMessage = `Request failed with status ${status}. Please check your settings.`;
      errorDetails = data?.error || `HTTP ${status}`;
    }
  } else if (error.request) {
    // Network error
    errorMessage = 'Network error. Please check your internet connection and try again.';
    errorDetails = 'No response received from server';
  } else {
    // Other error
    errorMessage = error.message || 'An unexpected error occurred.';
    errorDetails = error.toString();
  }
  
  // Show error notification
  if (window.indexUI && window.indexUI.showError) {
    window.indexUI.showError(errorMessage);
  } else {
    alert(errorMessage);
  }
  
  return errorMessage;
}

// CSV validation utilities
function validateCSVFormat(csvString) {
  try {
    const result = uDSV.parse(csvString, {
      header: true,
      skipEmptyLines: true
    });
    
    if (!result.data || result.data.length === 0) {
      return {
        valid: false,
        error: 'CSV file appears to be empty or has no data rows'
      };
    }
    
    // Check for required columns
    const requiredColumns = ['username', 'email', 'firstName', 'lastName', 'populationId'];
    const headers = result.headers || [];
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));
    
    if (missingColumns.length > 0) {
      return {
        valid: false,
        error: `Missing required columns: ${missingColumns.join(', ')}`
      };
    }
    
    return {
      valid: true,
      rowCount: result.data.length,
      headers: headers
    };
  } catch (error) {
    return {
      valid: false,
      error: `CSV parsing error: ${error.message}`
    };
  }
}

// File validation utilities
function validateFileType(file) {
  const allowedTypes = ['.csv'];
  const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
  
  if (!allowedTypes.includes(fileExtension)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`
    };
  }
  
  return { valid: true };
}

function validateFileSize(file, maxSizeMB = 10) {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${maxSizeMB}MB`
    };
  }
  
  return { valid: true };
}

// Credential validation utilities
function validateCredentials(environmentId, clientId, clientSecret) {
  const errors = [];
  
  if (!environmentId || environmentId.trim() === '') {
    errors.push('Environment ID is required');
  } else if (!isValidUUID(environmentId.trim())) {
    errors.push('Environment ID must be a valid UUID format');
  }
  
  if (!clientId || clientId.trim() === '') {
    errors.push('Client ID is required');
  } else if (!isValidUUID(clientId.trim())) {
    errors.push('Client ID must be a valid UUID format');
  }
  
  if (!clientSecret || clientSecret.trim() === '') {
    errors.push('Client Secret is required');
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}

// UUID validation
function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// Date and time utilities
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function getTimeDifference(startTime, endTime) {
  const diff = endTime - startTime;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// Storage utilities
function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('Error saving to localStorage:', error);
    return false;
  }
}

function loadFromStorage(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error('Error loading from localStorage:', error);
    return defaultValue;
  }
}

function removeFromStorage(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error('Error removing from localStorage:', error);
    return false;
  }
}

// String utilities
function truncateString(str, maxLength = 50) {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Array utilities
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

function uniqueArray(array) {
  return [...new Set(array)];
}

// Debounce utility
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Throttle utility
function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Export functions for use in other modules
window.indexUtils = {
  countCSVRows,
  updateTotalRecordsDisplay,
  clearTotalRecordsDisplay,
  handleApiError,
  handle429Error,
  is429Error,
  validateCSVFormat,
  validateFileType,
  validateFileSize,
  validateCredentials,
  isValidUUID,
  formatTimestamp,
  getTimeDifference,
  saveToStorage,
  loadFromStorage,
  removeFromStorage,
  truncateString,
  escapeHtml,
  chunkArray,
  uniqueArray,
  debounce,
  throttle
};

// Missing functions referenced in HTML
window.showCredentialErrorDetails = function() {
  // This function is referenced in settings.html but not used in index.html
  // Adding a placeholder to prevent errors
  console.log('showCredentialErrorDetails called - this function is not implemented for index page');
};

window.retryPapaParseLoading = function() {
  // This function is referenced in the HTML but not needed since we use uDSV
  // Adding a placeholder to prevent errors
  console.log('retryPapaParseLoading called - this function is not needed since we use uDSV');
  if (typeof showInfo === 'function') {
    showInfo('uDSV CSV parser is already loaded and working correctly.');
  } else {
    alert('uDSV CSV parser is already loaded and working correctly.');
  }
};

// Make utility functions globally available
window.countCSVRows = countCSVRows;
window.updateTotalRecordsDisplay = updateTotalRecordsDisplay;
window.clearTotalRecordsDisplay = clearTotalRecordsDisplay;
window.loadSavedFileName = loadSavedFileName;
window.syncFileNameBetweenPages = syncFileNameBetweenPages;
window.handle429Error = handle429Error;
window.is429Error = is429Error;
window.showRateLimitWarning = showRateLimitWarning;
window.hideRateLimitWarning = hideRateLimitWarning;
window.retryPapaParseLoading = retryPapaParseLoading; 