const axios = require('axios');

exports.createApiClient = (config) => {
  const client = axios.create({
    baseURL: config.apiBaseUrl,
    timeout: config.requestTimeoutMs,
    headers: {
      'Content-Type': 'application/json',
      'x-biometric-token': config.deviceToken
    }
  });

  return {
    async pushLogs(payload) {
      const response = await client.post('/api/biometric/agent/logs', payload);
      return response.data;
    }
  };
};
