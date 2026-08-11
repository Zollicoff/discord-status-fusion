class Spinner {
  constructor(options = {}) {
    this.stream = options.stream || process.stdout;
    this.enabled = options.enabled ?? Boolean(this.stream.isTTY);
    this.frames = options.frames || ['|', '/', '-', '\\'];
    this.intervalMs = options.intervalMs || 120;
    this.frameIndex = 0;
    this.timer = null;
  }

  get isSpinning() {
    return this.timer !== null;
  }

  start(message = 'Running') {
    if (!this.enabled || this.isSpinning) {
      return;
    }

    this.stream.write(`${this.frames[0]} ${message}...`);
    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this.stream.write(`\r${this.frames[this.frameIndex]} ${message}...`);
    }, this.intervalMs);
  }

  stop() {
    if (!this.isSpinning) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
    this.stream.write('\r\x1b[K');
  }
}

const SILENT_SPINNER = Object.freeze({
  isSpinning: false,
  start() {},
  stop() {}
});

module.exports = {
  SILENT_SPINNER,
  Spinner
};
