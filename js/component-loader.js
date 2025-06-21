/**
 * Component Loader Utility
 * Handles dynamic loading of HTML components
 */

class ComponentLoader {
  constructor() {
    this.loadedComponents = new Set();
  }

  /**
   * Load a component by its name
   * @param {string} componentName - The name of the component file (without .html)
   * @param {string} targetId - The ID of the element where the component should be inserted
   * @returns {Promise} - Promise that resolves when component is loaded
   */
  async loadComponent(componentName, targetId) {
    if (this.loadedComponents.has(componentName)) {
      return Promise.resolve();
    }

    try {
      const response = await fetch(`components/${componentName}.html`);
      if (!response.ok) {
        throw new Error(`Failed to load component: ${componentName}`);
      }
      
      const html = await response.text();
      const targetElement = document.getElementById(targetId);
      
      if (targetElement) {
        targetElement.innerHTML = html;
        this.loadedComponents.add(componentName);
        
        // Trigger any initialization scripts
        this.initializeComponent(componentName);
      } else {
        console.warn(`Target element with ID '${targetId}' not found`);
      }
    } catch (error) {
      console.error(`Error loading component ${componentName}:`, error);
      throw error;
    }
  }

  /**
   * Initialize component-specific functionality
   * @param {string} componentName - The name of the component
   */
  initializeComponent(componentName) {
    switch (componentName) {
      case 'sidebar':
        this.initializeSidebar();
        break;
      case 'credentials-section':
        this.initializeCredentialsSection();
        break;
      case 'file-upload-section':
        this.initializeFileUploadSection();
        break;
      case 'status-section':
        this.initializeStatusSection();
        break;
      case 'modal-spinner':
        this.initializeModalSpinner();
        break;
      default:
        // Component doesn't need specific initialization
        break;
    }
  }

  /**
   * Initialize sidebar functionality
   */
  initializeSidebar() {
    // Add active class to current page link
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href === currentPage) {
        link.classList.add('active');
      }
    });
  }

  /**
   * Initialize credentials section functionality
   */
  initializeCredentialsSection() {
    // Initialize tooltips for credential inputs
    this.initializeTooltips();
    
    // Initialize clear buttons
    this.initializeClearButtons();
    
    // Initialize password toggle
    this.initializePasswordToggle();
  }

  /**
   * Initialize file upload section functionality
   */
  initializeFileUploadSection() {
    // Initialize file input handlers
    this.initializeFileInput();
    
    // Initialize tooltips
    this.initializeTooltips();
    
    // Initialize action buttons with proper event listeners
    this.initializeActionButtons();
  }

  /**
   * Initialize status section functionality
   */
  initializeStatusSection() {
    // Status section doesn't need specific initialization
    // It's controlled by the main application logic
  }

  /**
   * Initialize modal spinner functionality
   */
  initializeModalSpinner() {
    // Modal spinner is controlled by show/hide functions
    // No specific initialization needed
  }

  /**
   * Initialize tooltips for enhanced inputs
   */
  initializeTooltips() {
    // Initialize tippy.js tooltips if available
    if (typeof tippy !== 'undefined') {
      tippy('[data-tippy-content]', {
        placement: 'top',
        arrow: true,
        theme: 'light-border'
      });
    }
  }

  /**
   * Initialize clear buttons for input fields
   */
  initializeClearButtons() {
    const clearButtons = document.querySelectorAll('[id$="Btn"]');
    clearButtons.forEach(button => {
      if (button.id.includes('clear')) {
        const inputId = button.id.replace('clear', '').replace('Btn', '');
        const input = document.getElementById(inputId);
        if (input) {
          button.addEventListener('click', () => {
            input.value = '';
            input.focus();
          });
        }
      }
    });
  }

  /**
   * Initialize password toggle functionality
   */
  initializePasswordToggle() {
    const toggleBtn = document.getElementById('toggleSecretBtn');
    const passwordInput = document.getElementById('clientSecret');
    const eyeIcon = document.getElementById('eyeIcon');
    
    if (toggleBtn && passwordInput && eyeIcon) {
      toggleBtn.addEventListener('click', () => {
        const type = passwordInput.type === 'password' ? 'text' : 'password';
        passwordInput.type = type;
        
        // Update eye icon
        if (type === 'text') {
          eyeIcon.innerHTML = `
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          `;
        } else {
          eyeIcon.innerHTML = `
            <circle cx="12" cy="12" r="3" />
            <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
          `;
        }
      });
    }
  }

  /**
   * Initialize file input functionality
   */
  initializeFileInput() {
    const fileInput = document.getElementById('csvFile');
    const clearFileBtn = document.getElementById('clearFileBtn');
    const selectedFileNameDisplay = document.getElementById('selectedFileNameDisplay');
    const selectedFileNameText = document.getElementById('selectedFileNameText');
    
    // Restore file name from localStorage on load
    const savedFileName = localStorage.getItem('selectedFileName');
    if (savedFileName && selectedFileNameText && selectedFileNameDisplay) {
      selectedFileNameText.textContent = savedFileName + ' (please re-select)';
      selectedFileNameDisplay.style.display = 'block';
    }

    if (fileInput && clearFileBtn) {
      // File selection handler
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          localStorage.setItem('selectedFileName', file.name);
          selectedFileNameText.textContent = file.name;
          selectedFileNameDisplay.style.display = 'block';
        } else {
          selectedFileNameDisplay.style.display = 'none';
          localStorage.removeItem('selectedFileName');
        }
      });
      
      // Clear file handler
      clearFileBtn.addEventListener('click', () => {
        fileInput.value = '';
        selectedFileNameDisplay.style.display = 'none';
        localStorage.removeItem('selectedFileName');
      });
    }
  }

  /**
   * Initialize action buttons with event listeners
   */
  initializeActionButtons() {
    console.log('Initializing action buttons...');
    
    // Import Users button
    const importBtn = document.getElementById('importUsersBtn');
    if (importBtn) {
      console.log('Found import button, attaching event listener');
      importBtn.addEventListener('click', () => {
        console.log('Import button clicked');
        if (typeof window.uploadCSV === 'function') {
          window.uploadCSV();
        } else {
          console.error('uploadCSV function not found');
          alert('Import functionality not available');
        }
      });
    } else {
      console.warn('Import button not found');
    }

    // Delete Users button
    const deleteBtn = document.getElementById('deleteUsersBtn');
    if (deleteBtn) {
      console.log('Found delete button, attaching event listener');
      deleteBtn.addEventListener('click', () => {
        console.log('Delete button clicked');
        if (typeof window.deleteCSVUsers === 'function') {
          window.deleteCSVUsers();
        } else {
          console.error('deleteCSVUsers function not found');
          alert('Delete functionality not available');
        }
      });
    } else {
      console.warn('Delete button not found');
    }

    // Modify Users button
    const modifyBtn = document.getElementById('modifyUsersBtn');
    if (modifyBtn) {
      console.log('Found modify button, attaching event listener');
      modifyBtn.addEventListener('click', () => {
        console.log('Modify button clicked');
        if (typeof window.modifyCSVUsers === 'function') {
          window.modifyCSVUsers();
        } else {
          console.error('modifyCSVUsers function not found');
          alert('Modify functionality not available');
        }
      });
    } else {
      console.warn('Modify button not found');
    }

    // Settings button
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
      console.log('Found settings button, attaching event listener');
      settingsBtn.addEventListener('click', () => {
        console.log('Settings button clicked');
        window.open('settings.html', '_blank');
      });
    } else {
      console.warn('Settings button not found');
    }
  }

  /**
   * Load multiple components at once
   * @param {Array} components - Array of {name, targetId} objects
   * @returns {Promise} - Promise that resolves when all components are loaded
   */
  async loadComponents(components) {
    const promises = components.map(comp => 
      this.loadComponent(comp.name, comp.targetId)
    );
    return Promise.all(promises);
  }
}

// Create global instance
window.componentLoader = new ComponentLoader();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ComponentLoader;
} 