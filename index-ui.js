// index-ui.js
// UI logic for PingOne User Management main page

// Sidebar navigation
function initializeSidebar() {
  // Set current page as active
  const currentPage = 'main';
  const navLinks = document.querySelectorAll('.nav-link');
  
  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === 'index.html' || link.id === 'mainPageLink') {
      link.classList.add('active');
    }
  });
  
  // Expand User Actions section by default
  const userActionsGroup = document.querySelector('.nav-group[data-section="user-actions"]');
  if (userActionsGroup) {
    const section = userActionsGroup.parentElement;
    const subLinks = section.querySelector('.nav-sub-links');
    const caret = userActionsGroup.querySelector('.nav-caret');
    
    if (subLinks) {
      subLinks.style.display = 'block';
      userActionsGroup.classList.add('open');
      if (caret) caret.textContent = '▲';
    }
  }
  
  // Setup accordion functionality
  setupSidebarAccordion();
}

function setupSidebarAccordion() {
  const navGroups = document.querySelectorAll('.nav-group');
  
  navGroups.forEach(group => {
    group.addEventListener('click', function() {
      const section = group.parentElement;
      const subLinks = section.querySelector('.nav-sub-links');
      const caret = group.querySelector('.nav-caret');
      
      if (subLinks) {
        const isOpen = subLinks.style.display === 'block';
        
        // Close all other sections
        document.querySelectorAll('.nav-sub-links').forEach(s => s.style.display = 'none');
        document.querySelectorAll('.nav-group').forEach(g => {
          g.classList.remove('open');
          const c = g.querySelector('.nav-caret');
          if (c) c.textContent = '▼';
        });
        
        // Toggle current section
        if (!isOpen) {
          subLinks.style.display = 'block';
          group.classList.add('open');
          if (caret) caret.textContent = '▲';
        }
      }
    });
  });
}

// Action status display
function showActionStatus(actionType) {
  const statusBox = document.getElementById('actionStatusBox');
  const statusText = document.getElementById('actionStatusText');
  const progressText = document.getElementById('actionProgressText');
  const spinner = document.getElementById('actionSpinner');
  const checkIcon = document.getElementById('actionCheckIcon');
  
  if (!statusBox) return;
  
  // Set action-specific text
  let actionText = '';
  switch (actionType) {
    case 'import':
      actionText = 'Importing Users';
      break;
    case 'modify':
      actionText = 'Modifying Users';
      break;
    case 'delete':
      actionText = 'Deleting Users';
      break;
    default:
      actionText = 'Processing';
  }
  
  if (statusText) statusText.textContent = actionText;
  if (progressText) progressText.textContent = 'Starting operation...';
  
  // Show spinner, hide check icon
  if (spinner) spinner.style.display = 'inline-block';
  if (checkIcon) checkIcon.style.display = 'none';
  
  statusBox.style.display = 'block';
}

function hideActionStatus() {
  const statusBox = document.getElementById('actionStatusBox');
  if (statusBox) {
    statusBox.style.display = 'none';
  }
}

function updateActionProgress(progress, total, actionType) {
  const progressText = document.getElementById('actionProgressText');
  if (progressText) {
    const percentage = total > 0 ? Math.round((progress / total) * 100) : 0;
    progressText.textContent = `${progress} of ${total} processed (${percentage}%)`;
  }
}

function showActionComplete(success, message) {
  const statusBox = document.getElementById('actionStatusBox');
  const statusText = document.getElementById('actionStatusText');
  const progressText = document.getElementById('actionProgressText');
  const spinner = document.getElementById('actionSpinner');
  const checkIcon = document.getElementById('actionCheckIcon');
  
  if (!statusBox) return;
  
  if (success) {
    if (statusText) statusText.textContent = 'Operation Complete';
    if (progressText) progressText.textContent = message || 'All items processed successfully';
    if (spinner) spinner.style.display = 'none';
    if (checkIcon) checkIcon.style.display = 'inline-block';
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      hideActionStatus();
    }, 3000);
  } else {
    if (statusText) statusText.textContent = 'Operation Failed';
    if (progressText) progressText.textContent = message || 'An error occurred during processing';
    if (spinner) spinner.style.display = 'none';
    if (checkIcon) checkIcon.style.display = 'none';
    
    // Show error styling
    statusBox.style.background = '#fee2e2';
    statusBox.style.borderColor = '#fca5a5';
  }
}

// Modal system
function showModal(title, content, buttons = []) {
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modalTitle');
  const modalContent = document.getElementById('modalContent');
  const modalButtons = document.getElementById('modalButtons');
  
  if (!modal) return;
  
  if (modalTitle) modalTitle.textContent = title;
  if (modalContent) modalContent.innerHTML = content;
  
  // Clear existing buttons
  if (modalButtons) {
    modalButtons.innerHTML = '';
    
    // Add buttons
    buttons.forEach(button => {
      const btn = document.createElement('button');
      btn.textContent = button.text;
      btn.className = button.primary ? 'unified-button' : 'unified-button secondary';
      btn.onclick = () => {
        if (button.onClick) button.onClick();
        hideModal();
      };
      modalButtons.appendChild(btn);
    });
  }
  
  modal.style.display = 'block';
}

function hideModal() {
  const modal = document.getElementById('modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// Notification system
function showSuccess(message) {
  showNotification(message, 'success');
}

function showError(message) {
  showNotification(message, 'error');
}

function showInfo(message) {
  showNotification(message, 'info');
}

function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    z-index: 10000;
    max-width: 400px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transform: translateX(100%);
    transition: transform 0.3s ease;
  `;
  
  // Set background color based on type
  switch (type) {
    case 'success':
      notification.style.background = '#16a34a';
      break;
    case 'error':
      notification.style.background = '#dc2626';
      break;
    case 'info':
    default:
      notification.style.background = '#0033a0';
      break;
  }
  
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
  }, 100);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 5000);
}

// Tooltip system
function initializeTooltips() {
  // Custom tooltip functionality for elements with data-tooltip
  const tooltipElements = document.querySelectorAll('[data-tooltip]');
  
  tooltipElements.forEach(element => {
    element.addEventListener('mouseenter', showCustomTooltip);
    element.addEventListener('mouseleave', hideCustomTooltip);
  });
  
  // Info icon tooltips
  const infoIcons = document.querySelectorAll('.info-icon');
  infoIcons.forEach(icon => {
    icon.addEventListener('mouseenter', showInfoTooltip);
    icon.addEventListener('mouseleave', hideInfoTooltip);
  });
}

function showCustomTooltip(event) {
  const tooltip = event.target.getAttribute('data-tooltip');
  if (!tooltip) return;
  
  const tooltipElement = document.createElement('div');
  tooltipElement.className = 'custom-tooltip-popup';
  tooltipElement.textContent = tooltip;
  tooltipElement.style.cssText = `
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
  
  document.body.appendChild(tooltipElement);
  
  // Position tooltip
  const rect = event.target.getBoundingClientRect();
  tooltipElement.style.left = rect.left + (rect.width / 2) - (tooltipElement.offsetWidth / 2) + 'px';
  tooltipElement.style.top = rect.top - tooltipElement.offsetHeight - 8 + 'px';
  
  event.target.tooltipElement = tooltipElement;
}

function hideCustomTooltip(event) {
  if (event.target.tooltipElement) {
    event.target.tooltipElement.remove();
    event.target.tooltipElement = null;
  }
}

function showInfoTooltip(event) {
  const tooltip = event.target.getAttribute('data-tippy-content');
  if (!tooltip) return;
  
  const tooltipElement = document.createElement('div');
  tooltipElement.className = 'info-tooltip-popup';
  tooltipElement.innerHTML = tooltip;
  tooltipElement.style.cssText = `
    position: absolute;
    background: white;
    color: black;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 0.9rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border: 1px solid #e5e7eb;
    z-index: 1000;
    max-width: 200px;
    white-space: normal;
    pointer-events: none;
  `;
  
  document.body.appendChild(tooltipElement);
  
  // Position tooltip
  const rect = event.target.getBoundingClientRect();
  tooltipElement.style.left = rect.left + (rect.width / 2) - (tooltipElement.offsetWidth / 2) + 'px';
  tooltipElement.style.top = rect.top - tooltipElement.offsetHeight - 8 + 'px';
  
  event.target.tooltipElement = tooltipElement;
}

function hideInfoTooltip(event) {
  if (event.target.tooltipElement) {
    event.target.tooltipElement.remove();
    event.target.tooltipElement = null;
  }
}

// Progress update handler
function handleProgressUpdate(data, actionType) {
  if (data.progress) {
    updateActionProgress(data.processed || 0, data.total || 0, actionType);
  }
  
  if (data.progress === 'cancelled') {
    showActionComplete(false, 'Operation was cancelled');
  } else if (data.progress === 'complete') {
    const successCount = data.success || 0;
    const errorCount = data.error || 0;
    const skippedCount = data.skipped || 0;
    const modifiedCount = data.modified || 0;
    
    let message = '';
    switch (actionType) {
      case 'import':
        message = `Successfully imported ${successCount} users`;
        if (skippedCount > 0) message += `, skipped ${skippedCount}`;
        if (errorCount > 0) message += `, ${errorCount} errors`;
        break;
      case 'modify':
        message = `Successfully modified ${modifiedCount} users`;
        if (skippedCount > 0) message += `, skipped ${skippedCount}`;
        if (errorCount > 0) message += `, ${errorCount} errors`;
        break;
      case 'delete':
        message = `Successfully deleted ${successCount} users`;
        if (errorCount > 0) message += `, ${errorCount} errors`;
        break;
    }
    
    showActionComplete(true, message);
  }
}

// Initialize UI when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  initializeTooltips();
  
  // Close modal when clicking outside
  const modal = document.getElementById('modal');
  if (modal) {
    modal.addEventListener('click', function(event) {
      if (event.target === modal) {
        hideModal();
      }
    });
  }
  
  // Setup modify attributes checkboxes
  setupModifyAttributesCheckboxes();
});

function setupModifyAttributesCheckboxes() {
  const selectAllCheckbox = document.getElementById('modAttrSelectAll');
  const attributeCheckboxes = document.querySelectorAll('.modify-attr-list input[type="checkbox"]:not(#modAttrSelectAll)');
  
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', function() {
      attributeCheckboxes.forEach(checkbox => {
        checkbox.checked = this.checked;
      });
      saveModifyAttributes();
    });
  }
  
  attributeCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      updateSelectAllState();
      saveModifyAttributes();
    });
  });
}

function saveModifyAttributes() {
  const checkboxes = document.querySelectorAll('.modify-attr-list input[type="checkbox"]:checked');
  const attributes = Array.from(checkboxes)
    .filter(checkbox => checkbox.id !== 'modAttrSelectAll')
    .map(checkbox => checkbox.id);
  
  localStorage.setItem('modify_attributes', JSON.stringify(attributes));
}

// Modal Spinner Control Functions
function showSpinnerModal(action, totalItems = 0) {
  const modal = document.getElementById('spinnerModal');
  const title = document.getElementById('modalTitle');
  const subtitle = document.getElementById('modalSubtitle');
  const progress = document.getElementById('modalProgress');
  
  if (!modal) return;
  
  // Set action-specific text
  switch(action) {
    case 'Import':
      title.textContent = 'Importing Users...';
      subtitle.textContent = 'Please wait while we import users from your CSV file';
      break;
    case 'Delete':
      title.textContent = 'Deleting Users...';
      subtitle.textContent = 'Please wait while we delete users from your PingOne environment';
      break;
    case 'Modify':
      title.textContent = 'Modifying Users...';
      subtitle.textContent = 'Please wait while we update user attributes';
      break;
    default:
      title.textContent = 'Processing...';
      subtitle.textContent = 'Please wait while we process your request';
  }
  
  if (totalItems > 0) {
    progress.textContent = `Processing 0 of ${totalItems} items...`;
  } else {
    progress.textContent = '';
  }
  
  modal.style.display = 'block';
}

function hideSpinnerModal() {
  const modal = document.getElementById('spinnerModal');
  if (modal) {
    modal.style.display = 'none';
  }
  // Also hide worker token status when hiding spinner
  hideWorkerTokenStatus();
}

// Worker Token Status Functions
function showWorkerTokenStatus() {
  const workerTokenStatus = document.getElementById('workerTokenStatus');
  const workerTokenText = document.getElementById('workerTokenText');
  
  if (workerTokenStatus && workerTokenText) {
    workerTokenText.textContent = 'Getting Worker Token...';
    workerTokenStatus.style.display = 'block';
    workerTokenStatus.style.color = '#16a34a';
    workerTokenStatus.style.background = '#f0fdf4';
    workerTokenStatus.style.borderColor = '#bbf7d0';
  }
}

function updateWorkerTokenSuccess() {
  const workerTokenStatus = document.getElementById('workerTokenStatus');
  const workerTokenText = document.getElementById('workerTokenText');
  
  if (workerTokenStatus && workerTokenText) {
    workerTokenText.textContent = 'Getting Worker Token ✅';
    workerTokenStatus.style.color = '#16a34a';
    workerTokenStatus.style.background = '#f0fdf4';
    workerTokenStatus.style.borderColor = '#bbf7d0';
  }
}

function updateWorkerTokenError() {
  const workerTokenStatus = document.getElementById('workerTokenStatus');
  const workerTokenText = document.getElementById('workerTokenText');
  
  if (workerTokenStatus && workerTokenText) {
    workerTokenText.textContent = 'Failed to retrieve Worker Token ❌';
    workerTokenStatus.style.color = '#dc2626';
    workerTokenStatus.style.background = '#fef2f2';
    workerTokenStatus.style.borderColor = '#fecaca';
  }
}

function hideWorkerTokenStatus() {
  const workerTokenStatus = document.getElementById('workerTokenStatus');
  if (workerTokenStatus) {
    workerTokenStatus.style.display = 'none';
  }
}

function updateSpinnerProgress(completed, total, batchCounter = 0, summary = false, isComplete = false) {
  const progress = document.getElementById('modalProgress');
  if (progress && total > 0) {
    if (isComplete) {
      progress.textContent = 'Processing complete';
    } else {
      // Show batch counter if provided, otherwise use the completed count
      const displayCount = batchCounter > 0 ? batchCounter * 5 : Math.min(completed * 5, total);
      
      if (summary) {
        progress.textContent = `📊 Summary: ${displayCount} of ${total} completed so far...`;
      } else {
        progress.textContent = `${displayCount} of ${total} completed...`;
      }
    }
  }
}

// Action Status System
const actionStatus = {
  showCredentialsValidated: function() {
    const statusText = document.getElementById('credentialsStatusText');
    if (statusText) {
      statusText.textContent = '✅ Credentials validated';
      statusText.style.color = '#16a34a';
    }
  },
  
  showProgress: function(action, totalItems) {
    const statusText = document.getElementById('actionStatusText');
    if (statusText) {
      statusText.textContent = `${action} in progress...`;
    }
    showSpinnerModal(action, totalItems);
  },
  
  updateProgress: function(completed, total) {
    updateSpinnerProgress(completed, total);
  },
  
  showSuccess: function() {
    const statusText = document.getElementById('actionStatusText');
    if (statusText) {
      statusText.textContent = '✅ Operation completed successfully';
      statusText.style.color = '#16a34a';
    }
    hideSpinnerModal();
  },
  
  showError: function(message) {
    const statusText = document.getElementById('actionStatusText');
    if (statusText) {
      statusText.textContent = `❌ ${message}`;
      statusText.style.color = '#dc2626';
    }
    hideSpinnerModal();
  }
};

// Credential validation functions
async function validateCredentials() {
  // For now, return false since token manager was removed
  // This can be reimplemented later if needed
  console.warn('Token manager not available, skipping validation');
  return false;
}

function updateCredentialsStatus(message, color) {
  const statusText = document.getElementById('credentialsStatusText');
  if (statusText) {
    statusText.textContent = message;
    statusText.style.color = color;
  }
}

// Function to update last action status
function updateLastActionStatus(action, successCount, skippedCount) {
  const lastActionText = document.getElementById('lastActionText');
  if (lastActionText) {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    
    let message = '';
    if (action === 'import') {
      message = `Last imported ${successCount} items at ${timeString}`;
    } else if (action === 'delete') {
      message = `Last deleted ${successCount} items at ${timeString}`;
    } else if (action === 'modify') {
      message = `Last modified ${successCount} items at ${timeString}`;
    }
    
    if (skippedCount > 0) {
      message += ` (${skippedCount} skipped)`;
    }
    
    lastActionText.textContent = message;
  }
}

// Make UI functions globally available
window.showError = showError;
window.showSuccess = showSuccess;
window.showInfo = showInfo;
window.showNotification = showNotification;
window.showModal = showModal;
window.hideModal = hideModal;
window.showActionStatus = showActionStatus;
window.hideActionStatus = hideActionStatus;
window.updateActionProgress = updateActionProgress;
window.showActionComplete = showActionComplete;
window.showSpinnerModal = showSpinnerModal;
window.hideSpinnerModal = hideSpinnerModal;
window.showWorkerTokenStatus = showWorkerTokenStatus;
window.updateWorkerTokenSuccess = updateWorkerTokenSuccess;
window.updateWorkerTokenError = updateWorkerTokenError;
window.hideWorkerTokenStatus = hideWorkerTokenStatus;
window.updateSpinnerProgress = updateSpinnerProgress;
window.validateCredentials = validateCredentials;
window.updateCredentialsStatus = updateCredentialsStatus;
window.updateLastActionStatus = updateLastActionStatus;

// Initialize global UI object
window.indexUI = {
  showError: showError,
  showSuccess: showSuccess,
  showInfo: showInfo,
  showNotification: showNotification,
  showModal: showModal,
  hideModal: hideModal,
  showActionStatus: showActionStatus,
  hideActionStatus: hideActionStatus,
  updateActionProgress: updateActionProgress,
  showActionComplete: showActionComplete,
  showSpinnerModal: showSpinnerModal,
  hideSpinnerModal: hideSpinnerModal,
  showWorkerTokenStatus: showWorkerTokenStatus,
  updateWorkerTokenSuccess: updateWorkerTokenSuccess,
  updateWorkerTokenError: updateWorkerTokenError,
  hideWorkerTokenStatus: hideWorkerTokenStatus,
  updateSpinnerProgress: updateSpinnerProgress,
  validateCredentials: validateCredentials,
  updateCredentialsStatus: updateCredentialsStatus,
  updateLastActionStatus: updateLastActionStatus
};

// Initialize action status system
window.actionStatus = actionStatus; 