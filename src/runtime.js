const { StatusFusionApp } = require('./app');
const { loadConfig, validateConfig } = require('./config');
const DiscordConnection = require('./core/discord');
const ProcessDetector = require('./core/detector');
const MusicDetector = require('./core/music');
const StatusBuilder = require('./core/status');
const { Logger } = require('./logger');
const { Spinner } = require('./ui/spinner');

function createApplication(config, options = {}) {
  const logger = options.logger || new Logger({ level: config.logLevel });
  const stream = options.stream || process.stdout;
  const spinner = options.spinner || new Spinner({
    enabled: Boolean(stream.isTTY) && config.logLevel !== 'verbose',
    stream
  });
  const detector = options.detector || new ProcessDetector({ logger });
  const music = options.music || new MusicDetector({ logger });
  const statusBuilder = options.statusBuilder || new StatusBuilder();
  const discord = options.discord || new DiscordConnection({
    clientId: config.discordClientId,
    logger
  });

  return new StatusFusionApp({
    clearInterval: options.clearInterval,
    detector,
    discord,
    forceUpdateInterval: config.forceUpdateInterval,
    logger,
    music,
    now: options.now,
    setInterval: options.setInterval,
    spinner,
    statusBuilder,
    updateInterval: config.updateInterval
  });
}

function registerProcessHandlers(app, options = {}) {
  const processRef = options.processRef || process;
  const logger = options.logger || new Logger();
  let shuttingDown = false;

  const shutdown = async(signal, exitCode = 0) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info(`Shutting down after ${signal}`);
    try {
      await app.stop();
    } finally {
      processRef.exit(exitCode);
    }
  };

  processRef.on('unhandledRejection', reason => {
    const message = reason instanceof Error ? reason.stack || reason.message : String(reason);
    logger.error(`Unhandled promise rejection: ${message}`);
  });
  processRef.once('uncaughtException', error => {
    logger.error(`Uncaught exception: ${error.stack || error.message}`);
    void shutdown('uncaughtException', 1);
  });
  processRef.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  processRef.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  return shutdown;
}

async function run(options = {}) {
  const env = options.env || process.env;
  const argv = options.argv || process.argv.slice(2);
  const processRef = options.processRef || process;
  const loaded = loadConfig(env);
  const config = {
    ...loaded.config,
    logLevel: argv.includes('--verbose') ? 'verbose' : loaded.config.logLevel
  };
  const logger = options.logger || new Logger({ level: config.logLevel });

  for (const warning of loaded.warnings) {
    logger.warn(warning);
  }

  const errors = validateConfig(config);
  if (errors.length > 0) {
    for (const error of errors) {
      logger.error(error);
    }
    processRef.exitCode = 1;
    return null;
  }

  const app = createApplication(config, {
    ...options.dependencies,
    logger,
    stream: options.stream || processRef.stdout
  });
  registerProcessHandlers(app, { logger, processRef });

  try {
    await app.start();
    return app;
  } catch (error) {
    logger.error(`Startup failed: ${error.message}`);
    await app.stop();
    processRef.exitCode = 1;
    return null;
  }
}

module.exports = {
  createApplication,
  registerProcessHandlers,
  run
};
