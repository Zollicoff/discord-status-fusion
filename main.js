const fs = require('fs');

const { resolvePaths } = require('./src/paths');
const { run } = require('./src/runtime');

/**
 * Load `.env` from the project (or DSF_ENV_FILE) regardless of the working
 * directory. Values already present in the environment take precedence.
 */
function loadEnvironment(envFile = resolvePaths().envFile) {
  if (fs.existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}

if (require.main === module) {
  loadEnvironment();
  run().catch(error => {
    console.error(`[FATAL] ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { loadEnvironment, run };
