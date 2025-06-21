const axios = require('axios');

// This file is deprecated - use services/auth.js instead
// All hardcoded credentials have been removed for security

async function getWorkerToken(environmentId, clientId, clientSecret) {
  const tokenUrl = `https://auth.pingone.com/${environmentId}/as/token`;
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  // Add required scopes for your use case, e.g. 'p1:admin:user:read p1:admin:user:write'
  params.append('scope', 'p1:admin:user:read p1:admin:user:write');

  try {
    const response = await axios.post(tokenUrl, params, {
      auth: {
        username: clientId,
        password: clientSecret
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    // console.log('Access Token:', response.data.access_token);
    return response.data.access_token;
  } catch (error) {
    console.error('Failed to get worker token:', error.response ? error.response.data : error.message);
    throw error;
  }
}

module.exports = getWorkerToken;