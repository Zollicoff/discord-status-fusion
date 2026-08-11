require('dotenv').config({ quiet: true });

const { run } = require('./src/runtime');

if (require.main === module) {
  run().catch(error => {
    console.error(`[FATAL] ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { run };
