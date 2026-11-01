const fs = require('fs');

const DaemonController = require('./daemon');
const { PidStore } = require('./pid-store');
const { ProcessInspector } = require('./process-inspector');
const { ServiceManager } = require('./service');
const { resolvePaths } = require('../paths');

const DEFAULT_LOG_LINES = 40;

function createDaemonController(options = {}) {
  const paths = options.paths || resolvePaths();
  const pidStore = options.pidStore || new PidStore(paths.pidFile, { legacyPath: paths.legacyPidFile });
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
  dsf start       Start the background daemon
  dsf stop        Stop the daemon
  dsf restart     Restart the daemon
  dsf status      Check daemon status
  dsf preview     Show what Discord would display right now
  dsf logs [n]    Print the last n log lines (default ${DEFAULT_LOG_LINES})
  dsf install     Start automatically at login
  dsf uninstall   Remove the login service
  dsf help        Show this help
`);
}

function tailFile(filePath, lineCount, fsImpl = fs) {
  const maxBytes = 256 * 1024;
  const { size } = fsImpl.statSync(filePath);
  const start = Math.max(0, size - maxBytes);
  const buffer = Buffer.alloc(size - start);
  const fd = fsImpl.openSync(filePath, 'r');
  try {
    fsImpl.readSync(fd, buffer, 0, buffer.length, start);
  } finally {
    fsImpl.closeSync(fd);
  }
  const lines = buffer.toString('utf8').split(/\r?\n/);
  if (lines.at(-1) === '') {
    lines.pop();
  }
  return lines.slice(-lineCount);
}

function showLogs(paths, rawCount, logger, fsImpl = fs) {
  const count = Number.parseInt(rawCount, 10) > 0 ? Number.parseInt(rawCount, 10) : DEFAULT_LOG_LINES;
  if (!fsImpl.existsSync(paths.logFile)) {
    logger.log(`No log file yet at ${paths.logFile}`);
    return true;
  }
  const lines = tailFile(paths.logFile, count, fsImpl);
  logger.log(lines.join('\n'));
  logger.log(`\n(${paths.logFile})`);
  return true;
}

async function install(controller, service, logger) {
  if (controller.status({ quiet: true })) {
    logger.log('Stopping the manually started daemon so the login service can take over...');
    if (!await controller.stop()) {
      return false;
    }
  }
  const file = service.install();
  logger.log(`Installed login service: ${file}`);
  logger.log('Discord Status Fusion will now start automatically when you log in.');
  return true;
}

function uninstall(service, logger) {
  if (!service.uninstall()) {
    logger.log('No login service is installed');
    return true;
  }
  logger.log(`Removed login service: ${service.serviceFile}`);
  return true;
}

async function runCli(options = {}) {
  const argv = options.argv || process.argv.slice(2);
  const command = options.command || argv[0];
  const processRef = options.processRef || process;
  const logger = options.logger || console;
  const paths = options.paths || resolvePaths();
  const controller = options.controller || createDaemonController({ logger, paths, processRef });
  const service = options.service || new ServiceManager({ logger, paths });
  let succeeded;

  try {
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
      if (service.isInstalled()) {
        logger.log(`Login service: installed (${service.serviceFile})`);
      }
      break;
    case 'preview': {
      const { preview } = options.previewModule || require('../preview');
      await preview({ output: logger });
      succeeded = true;
      break;
    }
    case 'logs':
      succeeded = showLogs(paths, argv[1], logger, options.fs);
      break;
    case 'install':
      succeeded = await install(controller, service, logger);
      break;
    case 'uninstall':
      succeeded = uninstall(service, logger);
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      showHelp(logger);
      succeeded = command !== undefined;
      break;
    default:
      logger.error(`Unknown command "${command}". Use "dsf help" for usage.`);
      succeeded = false;
    }
  } catch (error) {
    logger.error(`dsf ${command} failed: ${error.message}`);
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
  showHelp,
  showLogs,
  tailFile
};
