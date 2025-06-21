// index-utils.js
// Utility functions for PingOne User Management main page

// CSV parsing and row counting
async function countCSVRows(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(0);
      return;
    }
    
    // Check if uDSV is available
    if (typeof uDSV === 'undefined') {
      console.warn('uDSV library not loaded, cannot count CSV rows');
      resolve(0); // Return 0 as fallback
      return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const csvString = e.target.result;
        const result = uDSV.parse(csvString, {
          header: true,
          skipEmptyLines: true
        });
        const rowCount = result.data ? result.data.length : 0;
        resolve(rowCount);
      } catch (error) {
        console.error('Error parsing CSV for row count:', error);
        reject(error);
      }
    };
    reader.onerror = function(error) {
      console.error('Error reading file for row count:', error);
      reject(error);
    };
    reader.readAsText(file);
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

// Function to handle 429 (Too Many Requests) errors gracefully
function handle429Error(error, operation) {
  console.error(`${operation} error (429):`, error);
  
  const errorMessage = `⚠️ Rate limit exceeded. The server is temporarily limiting requests to prevent overload. Please wait a moment and try again.`;
  
  // Show a user-friendly notification
  if (window.indexUI && window.indexUI.showError) {
    window.indexUI.showError(
      `Rate limit exceeded. Please wait a moment and try again.\n\nThis usually happens when:\n• Processing large CSV files\n• Making multiple requests quickly\n• Server is under high load\n\nTry again in 30-60 seconds.`
    );
  } else {
    alert(`Rate limit exceeded. Please wait 30-60 seconds and try again.`);
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
  showInfo('uDSV CSV parser is already loaded and working correctly.');
}; 