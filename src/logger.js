const { LOG_LEVELS } = require('./config');

class Logger {
  constructor(options = {}) {
    this.level = Object.hasOwn(LOG_LEVELS, options.level) ? options.level : 'info';
    this.sink = options.sink || console;
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

  write(level, message) {
    if (LOG_LEVELS[level] > LOG_LEVELS[this.level]) {
      return;
    }

    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    const output = typeof this.sink[method] === 'function' ? this.sink[method] : this.sink.log;
    if (typeof output !== 'function') {
      return;
    }
    output.call(this.sink, `[${level.toUpperCase()}] ${message}`);
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
  SILENT_LOGGER
};
