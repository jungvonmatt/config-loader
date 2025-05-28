export default {
  name: "test-app",
  version: "1.0.0",
  database: {
    host: "localhost",
    port: 5432,
    name: "testdb",
  },
  api: {
    timeout: 5000,
    retries: 3,
  },
  features: {
    enableLogging: true,
    enableMetrics: false,
  },
};
