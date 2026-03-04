const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4200',
    supportFile: false,
    env: {
      backendUrl: 'http://localhost:5000'
    },
    video: false,
    screenshotOnRunFailure: false
  }
});
