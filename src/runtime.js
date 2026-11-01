const { StatusFusionApp } = require('./app');
const { PidStore } = require('./cli/pid-store');
const { ProcessInspector } = require('./cli/process-inspector');
const { loadConfig, validateConfig } = require('./config');
const { resolveApp } = require('./core/app-catalog');
const { AppDetector } = require('./core/detector');
const { DiscordPresence } = require('./core/discord');
const { FocusTracker } = require('./core/focus-tracker');
const { MusicDetector } = require('./core/music');
const { PresenceBuilder } = require('./core/presence');
const { Logger, createFileSink, rotateLog } = require('./logger');
const { resolvePaths } = require('./paths');
const { Spinner } = require('./ui/spinner');

function resolveHiddenApps(references, logger) {
  const ids = [];
  for (const reference of references) {
    const entry = resolveApp(reference);
    if (entry) {
      ids.push(entry.id);
    } else {
      logger.warn(`HIDE_APPS entry "${reference}" does not match a supported app`);
    }
  }
  return ids;
}

function parseArgs(argv) {
  const logFileArg = argv.find(arg => arg.startsWith('--log-file='));
  return {
    verbose: argv.includes('--verbose'),
    logFile: logFileArg ? logFileArg.slice('--log-file='.length) : null
  };
}

function createApplication(config, options = {}) {
  const logger = options.logger || new Logger({ level: config.logLevel });
  const stream = options.stream || process.stdout;
  const spinner = options.spinner || new Spinner({
    enabled: Boolean(stream.isTTY) && config.logLevel !== 'verbose' && config.logLevel !== 'debug',
    stream
  });
  if (logger instanceof Logger && spinner instanceof Spinner) {
    logger.beforeWrite = () => spinner.stop();
  }

  const hiddenIds = resolveHiddenApps(config.hideApps || [], logger);
  const detector = options.detector || new AppDetector({ hiddenIds, logger });
  const music = options.music || new MusicDetector({ logger });
  const tracker = options.tracker || new FocusTracker({ halfLifeMs: config.focusHalfLife });
  const presenceBuilder = options.presenceBuilder || new PresenceBuilder({
    appIconUrl: config.appIconUrl,
    largeImage: config.largeImage,
    statusDisplay: config.statusDisplay
  });
  const discord = options.discord || new DiscordPresence({
    clientId: config.discordClientId,
    logger
  });

  return new StatusFusionApp({
    clearInterval: options.clearInterval,
    detector,
    discord,
    idleTimeoutMs: config.idleTimeout,
    logger,
    maxApps: config.maxApps,
    music,
    now: options.now,
    presenceBuilder,
    setInterval: options.setInterval,
    showMusic: config.showMusic,
    spinner,
    tracker,
    updateInterval: config.updateInterval
  });
}

/**
 * Record this process as the running instance, unless another verified
 * instance already owns the PID file.
 * @returns {{acquired: boolean, owner?: number, release: Function}}
 */
function acquireInstanceLock({ pidStore, inspector, pid, mainFile }) {
  const existing = pidStore.read();
  if (existing && existing.pid !== pid && inspector.isManagedProcess(existing)) {
    return { acquired: false, owner: existing.pid, release() {} };
  }
  pidStore.write(pid, mainFile);
  return {
    acquired: true,
    release() {
      if (pidStore.read()?.pid === pid) {
        pidStore.remove();
      }
    }
  };
}

function registerProcessHandlers(app, options = {}) {
  const processRef = options.processRef || process;
  const logger = options.logger || new Logger();
  const onExit = options.onExit || (() => {});
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
      onExit();
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
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    processRef.once(signal, () => {
      void shutdown(signal);
    });
  }

  return shutdown;
}

async function run(options = {}) {
  const env = options.env || process.env;
  const argv = options.argv || process.argv.slice(2);
  const processRef = options.processRef || process;
  const stream = options.stream || processRef.stdout;
  const paths = options.paths || resolvePaths({ env });
  const args = parseArgs(argv);

  const loaded = loadConfig(env);
  const config = {
    ...loaded.config,
    logLevel: args.verbose ? 'verbose' : loaded.config.logLevel
  };

  if (args.logFile) {
    rotateLog(args.logFile);
  } else if (!stream?.isTTY) {
    rotateLog(paths.logFile);
  }
  const logger = options.logger || new Logger({
    level: config.logLevel,
    sink: args.logFile ? createFileSink(args.logFile) : console,
    timestamps: Boolean(args.logFile) || !stream?.isTTY
  });

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

  const lock = acquireInstanceLock({
    inspector: options.inspector || new ProcessInspector({ mainFile: paths.mainFile }),
    mainFile: paths.mainFile,
    pid: processRef.pid,
    pidStore: options.pidStore || new PidStore(paths.pidFile, { legacyPath: paths.legacyPidFile })
  });
  if (!lock.acquired) {
    logger.warn(`Discord Status Fusion is already running (PID: ${lock.owner})`);
    return null;
  }

  const app = createApplication(config, {
    ...options.dependencies,
    logger,
    stream
  });
  registerProcessHandlers(app, { logger, processRef, onExit: lock.release });

  try {
    await app.start();
    return app;
  } catch (error) {
    logger.error(`Startup failed: ${error.message}`);
    await app.stop();
    lock.release();
    processRef.exitCode = 1;
    return null;
  }
}

module.exports = {
  acquireInstanceLock,
  createApplication,
  parseArgs,
  registerProcessHandlers,
  resolveHiddenApps,
  run
};
