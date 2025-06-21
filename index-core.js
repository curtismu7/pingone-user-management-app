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
  
  // Clear buttons
  setupClearButtons();
  
  // Credential checkboxes
  setupCredentialCheckboxes();
  
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

function setupClearButtons() {
  // Clear credential buttons
  const clearEnvBtn = document.getElementById('clearEnvIdBtn');
  if (clearEnvBtn) {
    clearEnvBtn.addEventListener('click', () => clearField('envId'));
  }
  
  const clearClientIdBtn = document.getElementById('clearClientIdBtn');
  if (clearClientIdBtn) {
    clearClientIdBtn.addEventListener('click', () => clearField('clientId'));
  }
  
  const clearClientSecretBtn = document.getElementById('clearClientSecretBtn');
  if (clearClientSecretBtn) {
    clearClientSecretBtn.addEventListener('click', () => clearField('clientSecret'));
  }
}

function setupCredentialCheckboxes() {
  const rememberSecretCheckbox = document.getElementById('rememberClientSecret');
  const saveAllCredentialsCheckbox = document.getElementById('saveAllCredentials');
  
  if (rememberSecretCheckbox) {
    rememberSecretCheckbox.addEventListener('change', handleCredentialCheckboxChange);
  }
  
  if (saveAllCredentialsCheckbox) {
    saveAllCredentialsCheckbox.addEventListener('change', handleCredentialCheckboxChange);
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
  showInfo('Operation cancelled.');
}

// Credential management
function getCredentials() {
  const environmentId = document.getElementById('envId')?.value?.trim();
  const clientId = document.getElementById('clientId')?.value?.trim();
  const clientSecret = document.getElementById('clientSecret')?.value?.trim();
  
  return {
    environmentId,
    clientId,
    clientSecret,
    valid: !!(environmentId && clientId && clientSecret)
  };
}

function handleCredentialCheckboxChange() {
  const rememberSecretCheckbox = document.getElementById('rememberClientSecret');
  const saveAllCredentialsCheckbox = document.getElementById('saveAllCredentials');
  
  if (rememberSecretCheckbox) {
    localStorage.setItem('remember_client_secret', rememberSecretCheckbox.checked.toString());
  }
  
  if (saveAllCredentialsCheckbox) {
    localStorage.setItem('save_all_credentials', saveAllCredentialsCheckbox.checked.toString());
  }
  
  // Save current credential values if checkboxes are checked
  const credentials = getCredentials();
  if (saveAllCredentialsCheckbox && saveAllCredentialsCheckbox.checked) {
    if (credentials.environmentId) localStorage.setItem('env_id', credentials.environmentId);
    if (credentials.clientId) localStorage.setItem('client_id', credentials.clientId);
    if (credentials.clientSecret) localStorage.setItem('client_secret', credentials.clientSecret);
  }
}

function clearField(fieldName) {
  const field = document.getElementById(fieldName);
  if (field) {
    field.value = '';
    localStorage.removeItem(fieldName === 'envId' ? 'env_id' : 
                          fieldName === 'clientId' ? 'client_id' : 'client_secret');
  }
}

// State management
function restoreSavedState() {
  // Restore credentials
  const envId = localStorage.getItem('env_id');
  const clientId = localStorage.getItem('client_id');
  const clientSecret = localStorage.getItem('client_secret');
  
  if (envId) document.getElementById('envId').value = envId;
  if (clientId) document.getElementById('clientId').value = clientId;
  if (clientSecret) document.getElementById('clientSecret').value = clientSecret;
  
  // Restore checkboxes
  const rememberSecret = localStorage.getItem('remember_client_secret');
  const saveAllCredentials = localStorage.getItem('save_all_credentials');
  
  if (rememberSecret) {
    document.getElementById('rememberClientSecret').checked = rememberSecret === 'true';
  }
  if (saveAllCredentials) {
    document.getElementById('saveAllCredentials').checked = saveAllCredentials === 'true';
  }
  
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