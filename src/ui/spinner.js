/**
 * Single-line TTY indicator showing the current status. Disabled automatically
 * when output is not a terminal (daemon logs, pipes).
 */
class Spinner {
  constructor(options = {}) {
    this.stream = options.stream || process.stdout;
    this.enabled = options.enabled ?? Boolean(this.stream.isTTY);
    this.frames = options.frames || ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.intervalMs = options.intervalMs || 100;
    this.frameIndex = 0;
    this.timer = null;
    this.message = '';
  }

  get isSpinning() {
    return this.timer !== null;
  }

  start(message = 'Running') {
    if (!this.enabled) {
      return;
    }
    this.message = message;
    if (this.isSpinning) {
      return;
    }
    this.render();
    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this.render();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  render() {
    const columns = this.stream.columns || 80;
    const line = `${this.frames[this.frameIndex]} ${this.message}`;
    this.stream.write(`\r\x1b[K${Array.from(line).slice(0, Math.max(1, columns - 1)).join('')}`);
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
