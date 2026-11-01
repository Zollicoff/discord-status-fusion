const fs = require('fs');

const { LOG_LEVELS } = require('./config');

const MAX_LOG_BYTES = 5 * 1024 * 1024;

class Logger {
  constructor(options = {}) {
    this.level = Object.hasOwn(LOG_LEVELS, options.level) ? options.level : 'info';
    this.sink = options.sink || console;
    this.timestamps = Boolean(options.timestamps);
    this.now = options.now || (() => new Date());
    this.beforeWrite = options.beforeWrite || null;
  }

  error(message) {
    this.write('error', message);
  }

  warn(message) {
    this.write('warn', message);
  }

  info(message) {
    this.write('info', message);
  }

  debug(message) {
    this.write('debug', message);
  }

  verbose(message) {
    this.write('verbose', message);
  }

  isEnabled(level) {
    return LOG_LEVELS[level] <= LOG_LEVELS[this.level];
  }

  write(level, message) {
    if (!this.isEnabled(level)) {
      return;
    }

    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    const output = typeof this.sink[method] === 'function' ? this.sink[method] : this.sink.log;
    if (typeof output !== 'function') {
      return;
    }
    this.beforeWrite?.();
    const prefix = this.timestamps ? `${this.now().toISOString()} ` : '';
    output.call(this.sink, `${prefix}[${level.toUpperCase()}] ${message}`);
  }
}

/**
 * Console-compatible sink that appends lines to a file.
 */
function createFileSink(filePath, fsImpl = fs) {
  const append = line => {
    try {
      fsImpl.appendFileSync(filePath, `${line}\n`);
    } catch {
      // Logging must never take the daemon down.
    }
  };
  return { log: append, warn: append, error: append };
}

/**
 * Keep the most recent log segment. Copy-then-truncate works even while a
 * service manager holds the file open in append mode.
 */
function rotateLog(filePath, fsImpl = fs, maxBytes = MAX_LOG_BYTES) {
  try {
    if (fsImpl.statSync(filePath).size > maxBytes) {
      fsImpl.copyFileSync(filePath, `${filePath}.1`);
      fsImpl.truncateSync(filePath, 0);
    }
  } catch {
    // Missing or unwritable logs are not fatal.
  }
}

const SILENT_LOGGER = Object.freeze({
  error() {},
  warn() {},
  info() {},
  debug() {},
  verbose() {}
});

module.exports = {
  Logger,
  MAX_LOG_BYTES,
  SILENT_LOGGER,
  createFileSink,
  rotateLog
};
