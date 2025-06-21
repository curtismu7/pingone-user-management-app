/**
 * Authentication Service for PingOne User Management Application
 * 
 * This service handles all authentication-related operations including:
 * - Token management
 * - Credential validation
 * - Secure token storage
 * - Token refresh
 */

const axios = require('axios');
const { config } = require('../config');

class AuthService {
  constructor() {
    this.tokenCache = new Map();
    this.tokenExpiry = new Map();
    this.requestQueue = [];
    this.isProcessing = false;
    this.lastRequestTime = 0;
    this.minRequestInterval = 100; // Minimum 100ms between requests
  }

  /**
   * Throttle requests to avoid rate limiting
   * @param {Function} requestFn - The request function to throttle
   * @returns {Promise} Throttled request result
   */
  async throttleRequest(requestFn) {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const delay = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
    return requestFn();
  }

  /**
   * Get worker token from PingOne with throttling and retry logic
   * @param {string} environmentId - PingOne environment ID
   * @param {string} clientId - PingOne client ID
   * @param {string} clientSecret - PingOne client secret
   * @param {number} retryCount - Current retry attempt
   * @returns {Promise<string>} Access token
   */
  async getWorkerToken(environmentId, clientId, clientSecret, retryCount = 0) {
    const cacheKey = `${environmentId}:${clientId}:${clientSecret}`;
    const now = Date.now();

    // Check cache first
    if (this.tokenCache.has(cacheKey)) {
      const expiry = this.tokenExpiry.get(cacheKey);
      if (expiry && expiry > now) {
        return this.tokenCache.get(cacheKey);
      }
    }

    return this.throttleRequest(async () => {
      try {
        const tokenUrl = `${config.pingone.authUri}/${environmentId}/as/token`;
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('scope', config.pingone.scopes);

        const response = await axios.post(tokenUrl, params, {
          auth: {
            username: clientId,
            password: clientSecret
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 10000 // 10 second timeout
        });

        const { access_token, expires_in } = response.data;
        
        if (!access_token) {
          throw new Error('No access token received from PingOne');
        }

        // Cache the token with expiry
        this.tokenCache.set(cacheKey, access_token);
        this.tokenExpiry.set(cacheKey, now + (expires_in * 1000) - 60000); // Expire 1 minute early

        return access_token;
      } catch (error) {
        // Handle 429 errors with exponential backoff
        if (error.response && error.response.status === 429 && retryCount < 3) {
          const backoffDelay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
          console.warn(`Rate limited (429). Retrying in ${backoffDelay}ms (attempt ${retryCount + 1}/3)`);
          
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          return this.getWorkerToken(environmentId, clientId, clientSecret, retryCount + 1);
        }
        
        this.clearCache(cacheKey);
        throw this.handleAuthError(error);
      }
    });
  }

  /**
   * Validate PingOne credentials
   * @param {string} environmentId - PingOne environment ID
   * @param {string} clientId - PingOne client ID
   * @param {string} clientSecret - PingOne client secret
   * @returns {Promise<boolean>} True if credentials are valid
   */
  async validateCredentials(environmentId, clientId, clientSecret) {
    try {
      await this.getWorkerToken(environmentId, clientId, clientSecret);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get environment details using credentials
   * @param {string} environmentId - PingOne environment ID
   * @param {string} clientId - PingOne client ID
   * @param {string} clientSecret - PingOne client secret
   * @returns {Promise<Object>} Environment details
   */
  async getEnvironmentDetails(environmentId, clientId, clientSecret) {
    try {
      const token = await this.getWorkerToken(environmentId, clientId, clientSecret);
      
      const response = await axios.get(`${config.pingone.apiUri}/v1/environments/${environmentId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return {
        id: response.data.id,
        name: response.data.name,
        description: response.data.description,
        type: response.data.type,
        region: response.data.region,
        status: response.data.status
      };
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Clear token cache for specific credentials
   * @param {string} cacheKey - Cache key to clear
   */
  clearCache(cacheKey) {
    this.tokenCache.delete(cacheKey);
    this.tokenExpiry.delete(cacheKey);
  }

  /**
   * Clear all cached tokens
   */
  clearAllCache() {
    this.tokenCache.clear();
    this.tokenExpiry.clear();
  }

  /**
   * Handle authentication errors
   * @param {Error} error - The error to handle
   * @returns {Error} Enhanced error with user-friendly message
   */
  handleAuthError(error) {
    if (error.response) {
      const { status, data } = error.response;
      
      switch (status) {
        case 401:
          return new Error('Invalid credentials. Please check your Client ID and Client Secret.');
        case 403:
          return new Error('Access denied. Please check your application permissions.');
        case 404:
          return new Error('Environment not found. Please check your Environment ID.');
        case 400:
          return new Error('Invalid request. Please check your credentials format.');
        case 429:
          return new Error('Rate limit exceeded. Please try again later.');
        case 500:
          return new Error('PingOne service error. Please try again later.');
        default:
          return new Error(`PingOne API error: ${status} - ${data?.message || 'Unknown error'}`);
      }
    } else if (error.code === 'ENOTFOUND') {
      return new Error('Network error. Please check your internet connection.');
    } else if (error.code === 'ECONNREFUSED') {
      return new Error('Connection refused. Please try again later.');
    } else if (error.code === 'ETIMEDOUT') {
      return new Error('Request timeout. Please try again later.');
    } else {
      return error;
    }
  }

  /**
   * Validate environment ID format
   * @param {string} environmentId - Environment ID to validate
   * @returns {boolean} True if valid format
   */
  validateEnvironmentId(environmentId) {
    if (!environmentId || typeof environmentId !== 'string') {
      return false;
    }
    
    // Allow both UUID format and alphanumeric format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const alphanumericRegex = /^[a-zA-Z0-9]{8,}$/;
    
    return uuidRegex.test(environmentId) || alphanumericRegex.test(environmentId);
  }

  /**
   * Validate client ID format
   * @param {string} clientId - Client ID to validate
   * @returns {boolean} True if valid format
   */
  validateClientId(clientId) {
    if (!clientId || typeof clientId !== 'string') {
      return false;
    }
    
    // Allow both UUID format and alphanumeric format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const alphanumericRegex = /^[a-zA-Z0-9]{8,}$/;
    
    return uuidRegex.test(clientId) || alphanumericRegex.test(clientId);
  }

  /**
   * Validate client secret format
   * @param {string} clientSecret - Client secret to validate
   * @returns {boolean} True if valid format
   */
  validateClientSecret(clientSecret) {
    // PingOne client secrets can vary in length and format
    return clientSecret && typeof clientSecret === 'string' && clientSecret.length >= 8;
  }

  /**
   * Validate all credentials with detailed error messages
   * @param {string} environmentId - Environment ID
   * @param {string} clientId - Client ID
   * @param {string} clientSecret - Client secret
   * @returns {Object} Validation result with detailed errors
   */
  validateAllCredentials(environmentId, clientId, clientSecret) {
    const errors = [];

    if (!environmentId) {
      errors.push('Environment ID is required');
    } else if (!this.validateEnvironmentId(environmentId)) {
      errors.push('Environment ID must be a valid UUID format (e.g., 12345678-1234-1234-1234-123456789012) or alphanumeric string');
    }

    if (!clientId) {
      errors.push('Client ID is required');
    } else if (!this.validateClientId(clientId)) {
      errors.push('Client ID must be a valid UUID format (e.g., 12345678-1234-1234-1234-123456789012) or alphanumeric string');
    }

    if (!clientSecret) {
      errors.push('Client Secret is required');
    } else if (!this.validateClientSecret(clientSecret)) {
      errors.push('Client Secret must be at least 8 characters long');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = new AuthService(); 