const DaemonController = require('./daemon');
const paths = require('./paths');
const { PidStore } = require('./pid-store');
const { ProcessInspector } = require('./process-inspector');

function createDaemonController(options = {}) {
  const pidStore = options.pidStore || new PidStore(paths.pidFile);
  const inspector = options.inspector || new ProcessInspector({ mainFile: paths.mainFile });
  return new DaemonController({
    inspector,
    logFile: paths.logFile,
    mainFile: paths.mainFile,
    pidStore,
    projectRoot: paths.projectRoot,
    ...options
  });
}

function showHelp(logger = console) {
  logger.log(`
Discord Status Fusion CLI

Usage:
  dsf start    Start the daemon
  dsf stop     Stop the daemon
  dsf restart  Restart the daemon
  dsf status   Check daemon status
  dsf help     Show this help
`);
}

async function runCli(options = {}) {
  const command = options.command || process.argv[2];
  const processRef = options.processRef || process;
  const logger = options.logger || console;
  const controller = options.controller || createDaemonController({ logger, processRef });
  let succeeded;

  switch (command) {
  case 'start':
    succeeded = await controller.start();
    break;
  case 'stop':
    succeeded = await controller.stop();
    break;
  case 'restart':
    succeeded = await controller.restart();
    break;
  case 'status':
    succeeded = controller.status();
    break;
  case 'help':
  case '--help':
  case '-h':
    showHelp(logger);
    succeeded = true;
    break;
  default:
    logger.error('Unknown command. Use "dsf help" for usage.');
    succeeded = false;
  }

  if (!succeeded) {
    processRef.exitCode = 1;
  }
  return succeeded;
}

module.exports = {
  createDaemonController,
  runCli,
  showHelp
};
