const { defineConfig } = require('cypress');
require('dotenv').config();

module.exports = defineConfig({
  defaultCommandTimeout: 20000,
  chromeWebSecurity: false,
  reporter: 'cypress-mochawesome-reporter',

  retries: {
    runMode: 1,
  },

  e2e: {
    //specPattern: 'cypress/e2e/**/*.cy.js',
    specPattern: 'cypress/e2e/load/**/*.js',
    supportFile: 'cypress/support/e2e.js',

    requestTimeout: 15000,
    responseTimeout: 30000,
    pageLoadTimeout: 30000,

    viewportWidth: 1280,
    viewportHeight: 720,

    video: false,
    screenshotOnRunFailure: true,
    screenshotsFolder: 'cypress/screenshots',
    videosFolder: 'cypress/videos',

    env: {
      apiBaseUrl: process.env.API_BASE_URL,
      apiVersion: process.env.API_VERSION,
      consumerKey: process.env.CONSUMER_KEY,
      consumerSecret: process.env.CONSUMER_SECRET,
      // companyId is pre-seeded from .env for DB queries, then overwritten by login response
      companyId: process.env.COMPANY_ID,
    },

    setupNodeEvents(on, config) {
      require('cypress-mochawesome-reporter/plugin')(on);

      on('task', {
        async queryDb(query) {
          const { Client } = require('pg');
          const pgConfig = {
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            host: process.env.DB_HOST,
            database: process.env.DB_NAME,
            ssl: false,
            port: parseInt(process.env.DB_PORT, 10),
          };
          const client = new Client(pgConfig);
          await client.connect();
          const res = typeof query === 'string'
            ? await client.query(query)
            : await client.query(query.text, query.values);
          await client.end();
          return res.rows;
        },
      });

      return config;
    },
  },
});
