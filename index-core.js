// index-core.js
// Core logic for PingOne User Management main page

// Global variables
let globalCSVRowCount = 0;
let cancelRequested = false;
let report = [];

// Main event handlers and core functionality
document.addEventListener('DOMContentLoaded', function() {
  // Initialize core systems
  initializeCoreSystems();
  setupEventListeners();
  restoreSavedState();
});

function initializeCoreSystems() {
  // Initialize tooltip system
  if (typeof tippy !== 'undefined') {
    tippy('[data-tippy-content]', {
      theme: 'pingone',
      placement: 'top',
      arrow: true,
      animation: 'shift-away',
      duration: [200, 150],
      delay: [0, 0],
      interactive: false,
      allowHTML: true,
      maxWidth: 260,
      offset: [0, 8],
      trigger: 'mouseenter focus',
      touch: ['hold', 500],
    });
  }
  
  // Initialize sidebar navigation
  initializeSidebar();
}

function setupEventListeners() {
  // File input change handler
  const fileInput = document.getElementById('csvFile');
  if (fileInput) {
    fileInput.addEventListener('change', handleFileSelection);
  }
  
  // Action buttons
  setupActionButtons();
  
  // Storage event listeners for cross-page sync
  window.addEventListener('storage', handleStorageEvents);
}

function setupActionButtons() {
  // Import Users button
  const importBtn = document.getElementById('importUsersBtn');
  if (importBtn) {
    importBtn.addEventListener('click', () => performAction('import'));
  }
  
  // Modify Users button
  const modifyBtn = document.getElementById('modifyUsersBtn');
  if (modifyBtn) {
    modifyBtn.addEventListener('click', () => performAction('modify'));
  }
  
  // Delete Users button
  const deleteBtn = document.getElementById('deleteUsersBtn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => performAction('delete'));
  }
  
  // Cancel button
  const cancelBtn = document.getElementById('cancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', cancelOperation);
  }
}

// File handling functions
function handleFileSelection(event) {
  const file = event.target.files[0];
  if (!file) {
    clearFileDisplay();
    return;
  }
  
  // Update file display
  updateFileDisplay(file.name);
  
  // Count CSV rows
  countCSVRows(file).then(rowCount => {
    updateTotalRecordsDisplay(rowCount);
  }).catch(error => {
    console.error('Error counting CSV rows:', error);
    updateTotalRecordsDisplay(0);
  });
  
  // Save file name based on checkbox state
  const saveFileNameCheckbox = document.getElementById('saveFileNameCheckbox');
  if (saveFileNameCheckbox && saveFileNameCheckbox.checked) {
    localStorage.setItem('saved_csv_file_name', file.name);
    sessionStorage.removeItem('temp_csv_file_name');
  } else {
    sessionStorage.setItem('temp_csv_file_name', file.name);
    localStorage.removeItem('saved_csv_file_name');
  }
}

function updateFileDisplay(fileName) {
  const fileNameDisplay = document.getElementById('fileNameDisplay');
  if (fileNameDisplay) {
    fileNameDisplay.textContent = fileName;
    fileNameDisplay.style.display = 'block';
  }
}

function clearFileDisplay() {
  const fileNameDisplay = document.getElementById('fileNameDisplay');
  if (fileNameDisplay) {
    fileNameDisplay.style.display = 'none';
  }
  updateTotalRecordsDisplay(0);
}

// Core action functions
async function performAction(actionType) {
  const fileInput = document.getElementById('csvFile');
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    showError('Please select a CSV file first.');
    return;
  }
  
  const credentials = getCredentials();
  if (!credentials.valid) {
    showError('Please fill in all required credential fields.');
    return;
  }
  
  // Show action status
  showActionStatus(actionType);
  
  try {
    const formData = new FormData();
    formData.append('csv', fileInput.files[0]);
    formData.append('environmentId', credentials.environmentId);
    formData.append('clientId', credentials.clientId);
    formData.append('clientSecret', credentials.clientSecret);
    
    if (actionType === 'modify') {
      formData.append('mode', 'modify');
      const modifyAttributes = getModifyAttributes();
      formData.append('modifyAttributes', JSON.stringify(modifyAttributes));
    } else if (actionType === 'delete') {
      formData.append('mode', 'delete');
    }
    
    const endpoint = actionType === 'delete' ? '/delete-users' : '/import-users';
    
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // Handle streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          handleProgressUpdate(data, actionType);
        } catch (e) {
          console.warn('Failed to parse progress update:', line);
        }
      }
    }
    
    hideActionStatus();
    showSuccess(`Operation completed successfully!`);
    
  } catch (error) {
    console.error('Operation failed:', error);
    hideActionStatus();
    showError(`Operation failed: ${error.message}`);
  }
}

function cancelOperation() {
  cancelRequested = true;
  fetch('/cancel', { method: 'POST' });
  hideActionStatus();
  if (typeof showInfo === 'function') {
    showInfo('Operation cancelled.');
  } else {
    alert('Operation cancelled.');
  }
}

// Credential management
function getCredentials() {
  // Get credentials from localStorage (saved from settings page)
  const environmentId = localStorage.getItem('pingone_env_id')?.trim();
  const clientId = localStorage.getItem('pingone_client_id')?.trim();
  const clientSecret = localStorage.getItem('pingone_client_secret')?.trim();
  
  return {
    environmentId,
    clientId,
    clientSecret,
    valid: !!(environmentId && clientId && clientSecret)
  };
}

// State management
function restoreSavedState() {
  // Credentials are now managed in settings page, so we don't restore them here
  
  // Restore file name
  const savedFileName = localStorage.getItem('saved_csv_file_name') || 
                       sessionStorage.getItem('temp_csv_file_name');
  if (savedFileName) {
    updateFileDisplay(savedFileName);
  }
  
  // Restore modify attributes
  restoreModifyAttributes();
}

function handleStorageEvents(event) {
  if (event.key === 'saved_csv_file_name' || event.key === 'temp_csv_file_name') {
    const fileName = event.newValue;
    if (fileName) {
      updateFileDisplay(fileName);
    } else {
      clearFileDisplay();
    }
  }
}

// Helper functions
function getModifyAttributes() {
  const attributes = [];
  const checkboxes = document.querySelectorAll('.modify-attr-list input[type="checkbox"]:checked');
  checkboxes.forEach(checkbox => {
    if (checkbox.id !== 'modAttrSelectAll') {
      attributes.push(checkbox.id);
    }
  });
  return attributes;
}

function restoreModifyAttributes() {
  const savedAttrs = JSON.parse(localStorage.getItem('modify_attributes') || '[]');
  const checkboxes = document.querySelectorAll('.modify-attr-list input[type="checkbox"]');
  
  if (savedAttrs.length === 0) {
    // Default attributes
    const defaultAttrs = ['modAttrFirstName', 'modAttrLastName', 'modAttrEmail', 'modAttrUsername'];
    checkboxes.forEach(checkbox => {
      checkbox.checked = defaultAttrs.includes(checkbox.id);
    });
  } else {
    checkboxes.forEach(checkbox => {
      checkbox.checked = savedAttrs.includes(checkbox.id);
    });
  }
  
  updateSelectAllState();
}

function updateSelectAllState() {
  const selectAllCheckbox = document.getElementById('modAttrSelectAll');
  const attributeCheckboxes = document.querySelectorAll('.modify-attr-list input[type="checkbox"]:not(#modAttrSelectAll)');
  
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = Array.from(attributeCheckboxes).every(cb => cb.checked);
  }
}

// Export functions for use in other modules
window.indexCore = {
  performAction,
  cancelOperation,
  getCredentials,
  handleFileSelection,
  updateFileDisplay,
  clearFileDisplay
};

// Global functions for HTML onclick handlers
window.uploadCSV = function() {
  performAction('Import');
};

window.deleteCSVUsers = function() {
  performAction('Delete');
};

window.modifyCSVUsers = function() {
  performAction('Modify');
};

// Make other essential functions globally available
window.showError = function(message) {
  if (window.indexUI && window.indexUI.showError) {
    window.indexUI.showError(message);
  } else {
    alert(message);
  }
};

window.showSuccess = function(message) {
  if (window.indexUI && window.indexUI.showSuccess) {
    window.indexUI.showSuccess(message);
  } else {
    alert(message);
  }
};

// Initialize UI functions globally
function initializeGlobalUI() {
  window.indexUI = {
    showError: typeof showError !== 'undefined' ? showError : function(msg) { console.log('Error:', msg); },
    showSuccess: typeof showSuccess !== 'undefined' ? showSuccess : function(msg) { console.log('Success:', msg); },
    showInfo: typeof showInfo !== 'undefined' ? showInfo : function(msg) { console.log('Info:', msg); },
    showNotification: typeof showNotification !== 'undefined' ? showNotification : function(msg, type) { console.log('Notification:', msg, type); },
    showModal: typeof showModal !== 'undefined' ? showModal : function(title, content, buttons) { console.log('Modal:', title, content); },
    hideModal: typeof hideModal !== 'undefined' ? hideModal : function() { console.log('Hide modal'); },
    showActionStatus: typeof showActionStatus !== 'undefined' ? showActionStatus : function(actionType) { console.log('Action status:', actionType); },
    hideActionStatus: typeof hideActionStatus !== 'undefined' ? hideActionStatus : function() { console.log('Hide action status'); },
    updateActionProgress: typeof updateActionProgress !== 'undefined' ? updateActionProgress : function(progress, total, actionType) { console.log('Progress:', progress, total, actionType); },
    showActionComplete: typeof showActionComplete !== 'undefined' ? showActionComplete : function(success, message) { console.log('Action complete:', success, message); }
  };
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeGlobalUI);

// Comprehensive Form Persistence System
class FormPersistence {
  constructor() {
    this.storagePrefix = 'pingone_';
    this.formElements = new Map();
    this.init();
  }
  
  init() {
    this.setupFormElements();
    this.setupEventListeners();
    this.restoreFormState();
  }
  
  setupFormElements() {
    // Text inputs
    this.addElement('envIdInput', 'env_id', 'text');
    this.addElement('clientIdInput', 'client_id', 'text');
    this.addElement('clientSecretInput', 'client_secret', 'text');
    
    // Checkboxes
    this.addElement('saveAllCredentials', 'save_all_credentials', 'checkbox');
    this.addElement('rememberClientSecret', 'remember_client_secret', 'checkbox');
    this.addElement('saveFileNameCheckbox', 'save_file_name', 'checkbox');
  }
  
  addElement(elementId, storageKey, type) {
    const element = document.getElementById(elementId);
    if (element) {
      this.formElements.set(elementId, {
        element: element,
        storageKey: this.storagePrefix + storageKey,
        type: type
      });
    }
  }
  
  setupEventListeners() {
    this.formElements.forEach((config, elementId) => {
      const { element, storageKey, type } = config;
      
      if (type === 'text' || type === 'password' || type === 'number') {
        // Save on input and change
        element.addEventListener('input', () => this.saveElement(elementId));
        element.addEventListener('change', () => this.saveElement(elementId));
      } else if (type === 'checkbox') {
        // Save on change
        element.addEventListener('change', () => this.saveElement(elementId));
      } else if (type === 'select') {
        // Save on change
        element.addEventListener('change', () => this.saveElement(elementId));
      }
    });
  }
  
  saveElement(elementId) {
    const config = this.formElements.get(elementId);
    if (!config) return;
    
    const { element, storageKey, type } = config;
    
    if (type === 'text' || type === 'password' || type === 'number') {
      localStorage.setItem(storageKey, element.value);
    } else if (type === 'checkbox') {
      localStorage.setItem(storageKey, element.checked.toString());
    } else if (type === 'select') {
      localStorage.setItem(storageKey, element.value);
    }
  }
  
  restoreFormState() {
    this.formElements.forEach((config, elementId) => {
      const { element, storageKey, type } = config;
      
      if (type === 'text' || type === 'password' || type === 'number') {
        const savedValue = localStorage.getItem(storageKey);
        if (savedValue) {
          element.value = savedValue;
        }
      } else if (type === 'checkbox') {
        const savedValue = localStorage.getItem(storageKey);
        if (savedValue !== null) {
          element.checked = savedValue === 'true';
        }
      } else if (type === 'select') {
        const savedValue = localStorage.getItem(storageKey);
        if (savedValue) {
          element.value = savedValue;
        }
      }
    });
    
    // Restore file name
    this.restoreFileName();
  }
  
  restoreFileName() {
    if (typeof loadSavedFileName === 'function') {
      loadSavedFileName();
    }
  }
  
  clearAllSettings() {
    // Clear all localStorage items with our prefix
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(this.storagePrefix)) {
        localStorage.removeItem(key);
      }
    });
    
    // Clear shared file storage
    localStorage.removeItem('pingone_default_csv_file');
    localStorage.removeItem('pingone_default_csv_content');
    sessionStorage.removeItem('temp_csv_file_name');
    
    // Reset form elements
    this.formElements.forEach((config, elementId) => {
      const { element, type } = config;
      
      if (type === 'text' || type === 'password' || type === 'number') {
        element.value = '';
      } else if (type === 'checkbox') {
        element.checked = false;
      } else if (type === 'select') {
        element.selectedIndex = 0;
      }
    });
    
    // Clear file input and display
    const fileInput = document.getElementById('csvFile');
    if (fileInput) {
      fileInput.value = '';
    }
    
    const selectedFileNameDisplay = document.getElementById('selectedFileNameDisplay');
    if (selectedFileNameDisplay) {
      selectedFileNameDisplay.style.display = 'none';
    }
    
    // Reset credential validation status
    window.credentialsValidated = false;
    const statusSpan = document.getElementById('credentialsStatus');
    if (statusSpan) {
      statusSpan.textContent = 'Credentials not validated';
      statusSpan.style.color = '#6b7280';
    }
    
    console.log('All settings cleared successfully');
  }
}

// Comprehensive Token Management System
class TokenManager {
  constructor() {
    this.storagePrefix = 'pingone_token_';
    this.tokenExpiryMinutes = 60; // Token expires after 60 minutes
    this.validationExpiryMinutes = 30; // Re-validate every 30 minutes
    this.currentToken = null;
    this.tokenExpiry = null;
    this.lastValidation = null;
    this.isValidating = false;
    this.init();
  }
  
  init() {
    this.loadStoredToken();
    this.setupPeriodicValidation();
  }
  
  // Load token from localStorage
  loadStoredToken() {
    try {
      const storedToken = localStorage.getItem(this.storagePrefix + 'access_token');
      const storedExpiry = localStorage.getItem(this.storagePrefix + 'expiry');
      const storedValidation = localStorage.getItem(this.storagePrefix + 'last_validation');
      
      if (storedToken && storedExpiry && storedValidation) {
        this.currentToken = storedToken;
        this.tokenExpiry = new Date(storedExpiry);
        this.lastValidation = new Date(storedValidation);
        
        // Check if token is still valid
        if (this.isTokenValid()) {
          window.credentialsValidated = true;
          this.updateCredentialStatus('✅ Credentials validated', '#16a34a');
          return true;
        }
      }
    } catch (error) {
      console.warn('Error loading stored token:', error);
    }
    
    // Clear invalid token
    this.clearToken();
    return false;
  }
  
  // Store token in localStorage
  storeToken(token, expiryMinutes = this.tokenExpiryMinutes) {
    try {
      this.currentToken = token;
      this.tokenExpiry = new Date(Date.now() + (expiryMinutes * 60 * 1000));
      this.lastValidation = new Date();
      
      localStorage.setItem(this.storagePrefix + 'access_token', token);
      localStorage.setItem(this.storagePrefix + 'expiry', this.tokenExpiry.toISOString());
      localStorage.setItem(this.storagePrefix + 'last_validation', this.lastValidation.toISOString());
      
      window.credentialsValidated = true;
      this.updateCredentialStatus('✅ Credentials validated', '#16a34a');
      return true;
    } catch (error) {
      console.error('Error storing token:', error);
      return false;
    }
  }
  
  // Clear stored token
  clearToken() {
    this.currentToken = null;
    this.tokenExpiry = null;
    this.lastValidation = null;
    window.credentialsValidated = false;
    
    localStorage.removeItem(this.storagePrefix + 'access_token');
    localStorage.removeItem(this.storagePrefix + 'expiry');
    localStorage.removeItem(this.storagePrefix + 'last_validation');
    
    this.updateCredentialStatus('Credentials not validated', '#6b7280');
  }
  
  // Check if token is valid and not expired
  isTokenValid() {
    if (!this.currentToken || !this.tokenExpiry) {
      return false;
    }
    
    const now = new Date();
    return now < this.tokenExpiry;
  }
  
  // Check if we need to re-validate (based on validation expiry)
  needsRevalidation() {
    if (!this.lastValidation) {
      return true;
    }
    
    const now = new Date();
    const validationExpiry = new Date(this.lastValidation.getTime() + (this.validationExpiryMinutes * 60 * 1000));
    return now > validationExpiry;
  }
  
  // Get current token (with validation if needed)
  async getValidToken() {
    // If we have a valid token and don't need revalidation, return it
    if (this.isTokenValid() && !this.needsRevalidation()) {
      return this.currentToken;
    }
    
    // If token is expired, clear it
    if (!this.isTokenValid()) {
      this.clearToken();
    }
    
    // Try to re-validate silently
    const success = await this.silentRevalidation();
    if (success) {
      return this.currentToken;
    }
    
    return null;
  }
  
  // Silent background revalidation
  async silentRevalidation() {
    if (this.isValidating) {
      return false;
    }
    
    this.isValidating = true;
    
    try {
      const environmentId = localStorage.getItem('pingone_env_id');
      const clientId = localStorage.getItem('pingone_client_id');
      const clientSecret = localStorage.getItem('pingone_client_secret');
      
      if (!environmentId || !clientId || !clientSecret) {
        return false;
      }
      
      const response = await fetch('/get-worker-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          environmentId: environmentId,
          clientId: clientId,
          clientSecret: clientSecret
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.access_token) {
          this.storeToken(result.access_token);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.warn('Silent revalidation failed:', error);
      return false;
    } finally {
      this.isValidating = false;
    }
  }
  
  // Update credential status display
  updateCredentialStatus(message, color) {
    const statusSpan = document.getElementById('credentialsStatusText');
    if (statusSpan) {
      statusSpan.innerHTML = message;
      statusSpan.style.color = color;
    }
  }
  
  // Setup periodic validation check
  setupPeriodicValidation() {
    // Check every 5 minutes
    setInterval(() => {
      if (this.isTokenValid() && this.needsRevalidation()) {
        this.silentRevalidation();
      }
    }, 5 * 60 * 1000);
  }
}

// Unified Popup System
class UnifiedPopup {
  constructor() {
    this.popup = document.getElementById('unifiedPopup');
    this.title = document.getElementById('popupTitle');
    this.content = document.getElementById('popupContent');
    this.buttons = document.getElementById('popupButtons');
    this.closeBtn = document.getElementById('closeUnifiedPopup');
    this.autoCloseTimer = null;
    
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    // Close button
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.hide());
    }
    
    // Close when clicking outside
    if (this.popup) {
      this.popup.addEventListener('click', (event) => {
        if (event.target === this.popup) {
          this.hide();
        }
      });
    }
  }
  
  show(title, content, buttons = [], autoClose = true) {
    if (!this.popup || !this.title || !this.content) return;
    
    this.title.textContent = title;
    this.content.innerHTML = content;
    
    // Clear existing buttons
    if (this.buttons) {
      this.buttons.innerHTML = '';
      
      // Add buttons
      buttons.forEach(button => {
        const btn = document.createElement('button');
        btn.textContent = button.text;
        btn.style.cssText = `
          background: ${button.primary ? '#e60028' : '#f8f9fa'};
          color: ${button.primary ? 'white' : '#212529'};
          border: 1px solid ${button.primary ? '#e60028' : '#000'};
          border-radius: 8px;
          padding: 0.75rem 1.5rem;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          min-width: 80px;
        `;
        
        btn.addEventListener('mouseover', () => {
          btn.style.background = button.primary ? '#b91c1c' : '#e9ecef';
        });
        
        btn.addEventListener('mouseout', () => {
          btn.style.background = button.primary ? '#e60028' : '#f8f9fa';
        });
        
        btn.addEventListener('click', () => {
          if (button.onClick) {
            button.onClick();
          }
          this.hide();
        });
        
        this.buttons.appendChild(btn);
      });
    }
    
    // Show popup
    this.popup.style.display = 'block';
    
    // Auto-close after 2 seconds if enabled
    if (autoClose && buttons.length === 0) {
      this.autoCloseTimer = setTimeout(() => this.hide(), 2000);
    }
  }
  
  hide() {
    if (this.popup) {
      this.popup.style.display = 'none';
    }
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }
  }
  
  // Convenience methods
  alert(message, title = 'Information') {
    this.show(title, message, [
      { text: 'OK', primary: true }
    ], true);
  }
  
  confirm(message, title = 'Confirm', onConfirm, onCancel) {
    this.show(title, message, [
      { text: 'Cancel', primary: false, onClick: onCancel },
      { text: 'Confirm', primary: true, onClick: onConfirm }
    ], false);
  }
}

// Tooltip System
class TooltipManager {
  constructor() {
    this.init();
  }

  init() {
    this.setupCustomTooltips();
    this.setupEnhancedInputs();
    this.setupButtonTooltips();
  }

  setupCustomTooltips() {
    const tooltips = document.querySelectorAll('.custom-tooltip');
    
    tooltips.forEach(tooltip => {
      const icon = tooltip.querySelector('.tooltip-icon');
      const content = tooltip.querySelector('.tooltip-content');
      
      if (!icon || !content) return;

      // Desktop hover events
      icon.addEventListener('mouseenter', () => {
        this.showTooltip(tooltip, content);
      });
      
      icon.addEventListener('mouseleave', () => {
        this.hideTooltip(tooltip, content);
      });
      
      // Mobile touch events
      icon.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.showTooltip(tooltip, content);
      });
      
      icon.addEventListener('touchend', () => {
        setTimeout(() => {
          this.hideTooltip(tooltip, content);
        }, 2000);
      });
    });
  }

  setupEnhancedInputs() {
    const enhancedInputs = document.querySelectorAll('.enhanced-input');
    
    enhancedInputs.forEach(input => {
      // Add focus effects
      input.addEventListener('focus', () => {
        input.style.borderColor = '#e60028';
        input.style.boxShadow = '0 0 0 3px rgba(230, 0, 40, 0.1)';
      });
      
      input.addEventListener('blur', () => {
        input.style.borderColor = '#d1d5db';
        input.style.boxShadow = 'none';
      });
    });
  }

  setupButtonTooltips() {
    const buttonTooltips = document.querySelectorAll('.button-tooltip');
    
    buttonTooltips.forEach(button => {
      const tooltip = button.getAttribute('data-tooltip');
      if (!tooltip) return;
      
      button.addEventListener('mouseenter', () => {
        this.showButtonTooltip(button, tooltip);
      });
      
      button.addEventListener('mouseleave', () => {
        this.hideButtonTooltip(button);
      });
    });
  }

  showTooltip(tooltip, content) {
    tooltip.classList.add('show');
    content.style.opacity = '1';
    content.style.visibility = 'visible';
  }

  hideTooltip(tooltip, content) {
    tooltip.classList.remove('show');
    content.style.opacity = '0';
    content.style.visibility = 'hidden';
  }
  
  showButtonTooltip(button, tooltipText) {
    const tooltip = document.createElement('div');
    tooltip.className = 'button-tooltip-popup';
    tooltip.textContent = tooltipText;
    tooltip.style.cssText = `
      position: absolute;
      background: white;
      color: black;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 0.875rem;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      border: 1px solid #e5e7eb;
      z-index: 1000;
      max-width: 200px;
      white-space: normal;
      pointer-events: none;
    `;
    
    document.body.appendChild(tooltip);
    
    // Position tooltip
    const rect = button.getBoundingClientRect();
    tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
    tooltip.style.top = rect.top - tooltip.offsetHeight - 8 + 'px';
    
    button.tooltipElement = tooltip;
  }
  
  hideButtonTooltip(button) {
    if (button.tooltipElement) {
      button.tooltipElement.remove();
      button.tooltipElement = null;
    }
  }
}

// Function to clear all settings
async function clearAllSettings() {
  const confirmed = await new Promise((resolve) => {
    if (window.unifiedPopup) {
      window.unifiedPopup.confirm(
        'Are you sure you want to clear all settings? This will reset all form fields, checkboxes, and saved data. This action cannot be undone.',
        'Confirm Clear Settings',
        () => resolve(true),
        () => resolve(false)
      );
    } else {
      resolve(confirm('Are you sure you want to clear all settings?'));
    }
  });
  
  if (confirmed) {
    if (window.formPersistence) {
      window.formPersistence.clearAllSettings();
    }
    
    // Clear token management system
    if (window.tokenManager) {
      window.tokenManager.clearToken();
    }
    
    if (window.unifiedPopup) {
      window.unifiedPopup.alert('All settings have been cleared successfully!', 'Settings Cleared');
    } else {
      alert('All settings have been cleared successfully!');
    }
  }
}

// Function to show a message when user needs to reselect file
function showFileReselectionMessage() {
  const savedFileName = localStorage.getItem('lastSelectedFileName');
  if (savedFileName && !hasValidFileSelected()) {
    // Show a message to the user that they need to reselect the file
    const statusBox = document.getElementById('statusBox');
    if (statusBox) {
      statusBox.innerHTML = `
        <div class="alert alert-warning">
          <strong>File Selection Required</strong><br>
          You have a saved file name (${savedFileName}) but the actual file is not selected.<br>
          Please click "Choose File" to reselect your CSV file.
        </div>
      `;
    }
    return true;
  }
  return false;
}

// Function to check if we have a valid file selected
function hasValidFileSelected() {
  const fileInput = document.getElementById('csvFile');
  return fileInput && fileInput.files && fileInput.files.length > 0;
}

// Initialize systems when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 Initializing PingOne User Management Application...');
  
  // Initialize library loading monitor
  console.log('🔍 Library Loading Monitor initialized');
  
  // Check for already loaded libraries
  setTimeout(() => {
    if (typeof uDSV !== 'undefined') {
      window.libraryLogger.logLibraryLoad('uDSV', Date.now(), 'head_script');
    }
    if (typeof Papa !== 'undefined' && Papa.parse) {
      window.libraryLogger.logLibraryLoad('PapaParse', Date.now(), 'head_script');
    }
    if (typeof tippy !== 'undefined') {
      window.libraryLogger.logLibraryLoad('Tippy.js', Date.now(), 'head_script');
    }
    if (typeof Popper !== 'undefined') {
      window.libraryLogger.logLibraryLoad('Popper.js', Date.now(), 'head_script');
    }
  }, 100);
  
  // Initialize unified popup
  window.unifiedPopup = new UnifiedPopup();
  
  // Initialize form persistence and token management
  window.formPersistence = new FormPersistence();
  window.tokenManager = new TokenManager();
  
  // Initialize tooltip manager
  window.tooltipManager = new TooltipManager();
  
  // Initialize credential status
  if (typeof validateCredentials === 'function') {
    validateCredentials();
  }
  
  // Load saved file name
  if (typeof loadSavedFileName === 'function') {
    loadSavedFileName();
  }
  
  // Check for file reselection requirement
  showFileReselectionMessage();
  
  console.log('✅ Application initialization complete');
});

// Make classes globally available
window.FormPersistence = FormPersistence;
window.TokenManager = TokenManager;
window.UnifiedPopup = UnifiedPopup;
window.TooltipManager = TooltipManager;
window.clearAllSettings = clearAllSettings;
window.showFileReselectionMessage = showFileReselectionMessage;
window.hasValidFileSelected = hasValidFileSelected; 