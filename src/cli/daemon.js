const fs = require('fs');
const { spawn } = require('child_process');

const STARTUP_CHECK_MS = 400;
const STOP_TIMEOUT_MS = 5000;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class DaemonController {
  constructor(options) {
    this.pidStore = options.pidStore;
    this.inspector = options.inspector;
    this.mainFile = options.mainFile;
    this.logFile = options.logFile;
    this.projectRoot = options.projectRoot;
    this.nodePath = options.nodePath || process.execPath;
    this.processRef = options.processRef || process;
    this.fs = options.fs || fs;
    this.spawn = options.spawn || spawn;
    this.wait = options.wait || delay;
    this.logger = options.logger || console;
    this.startupCheckMs = options.startupCheckMs ?? STARTUP_CHECK_MS;
    this.stopTimeoutMs = options.stopTimeoutMs ?? STOP_TIMEOUT_MS;
  }

  async start() {
    const existingRecord = this.pidStore.read();
    if (this.inspector.isManagedProcess(existingRecord)) {
      this.logger.log(`Discord Status Fusion is already running (PID: ${existingRecord.pid})`);
      return true;
    }

    if (this.pidStore.exists()) {
      if (existingRecord && this.inspector.exists(existingRecord.pid)) {
        this.logger.warn(`Ignoring stale PID file for unrelated process ${existingRecord.pid}`);
      }
      this.pidStore.remove();
    }

    this.logger.log('Starting Discord Status Fusion...');
    this.fs.appendFileSync(this.logFile, `\n--- Start ${new Date().toISOString()} ---\n`);
    const logFd = this.fs.openSync(this.logFile, 'a');
    let child;
    let spawnError;

    try {
      child = this.spawn(this.nodePath, [this.mainFile], {
        cwd: this.projectRoot,
        detached: true,
        stdio: ['ignore', logFd, logFd]
      });
      child.once?.('error', error => {
        spawnError = error;
      });
    } catch (error) {
      this.logger.error(`Unable to spawn daemon: ${error.message}`);
      return false;
    } finally {
      this.fs.closeSync(logFd);
    }

    if (!child.pid) {
      this.logger.error(`Daemon failed to spawn. Check ${this.logFile}`);
      return false;
    }

    this.pidStore.write(child.pid, this.mainFile);
    child.unref();
    await this.wait(this.startupCheckMs);

    if (spawnError || !this.inspector.isManagedProcess(this.pidStore.read())) {
      this.pidStore.remove();
      const reason = spawnError ? `: ${spawnError.message}` : '';
      this.logger.error(`Daemon exited during startup${reason}. Check ${this.logFile}`);
      return false;
    }

    this.logger.log(`Discord Status Fusion started (PID: ${child.pid})`);
    this.logger.log(`Logs: ${this.logFile}`);
    return true;
  }

  async stop() {
    const record = this.pidStore.read();
    if (!record) {
      this.pidStore.remove();
      this.logger.log('Discord Status Fusion is not running');
      return true;
    }

    if (!this.inspector.exists(record.pid)) {
      this.pidStore.remove();
      this.logger.log('Discord Status Fusion is not running (removed stale PID file)');
      return true;
    }

    if (!this.inspector.isManagedProcess(record)) {
      this.pidStore.remove();
      this.logger.error(`Refusing to stop unrelated process ${record.pid}; removed stale PID file`);
      return false;
    }

    try {
      this.processRef.kill(record.pid, 'SIGTERM');
    } catch (error) {
      if (!this.inspector.exists(record.pid)) {
        this.pidStore.remove();
        this.logger.log('Discord Status Fusion stopped before it could be signaled');
        return true;
      }
      this.logger.error(`Unable to stop Discord Status Fusion: ${error.message}`);
      return false;
    }
    const deadline = Date.now() + this.stopTimeoutMs;
    while (Date.now() < deadline) {
      if (!this.inspector.isManagedProcess(record)) {
        this.pidStore.remove();
        this.logger.log(`Discord Status Fusion stopped (PID: ${record.pid})`);
        return true;
      }
      await this.wait(100);
    }

    this.logger.error(
      `Discord Status Fusion did not stop within ${this.stopTimeoutMs / 1000}s (PID: ${record.pid})`
    );
    return false;
  }

  status() {
    const record = this.pidStore.read();
    if (this.inspector.isManagedProcess(record)) {
      this.logger.log(`Discord Status Fusion is running (PID: ${record.pid})`);
      return true;
    }

    if (this.pidStore.exists()) {
      this.pidStore.remove();
      this.logger.log('Discord Status Fusion is not running (removed stale PID file)');
    } else {
      this.logger.log('Discord Status Fusion is not running');
    }
    return false;
  }

  async restart() {
    if (!await this.stop()) {
      return false;
    }
    return this.start();
  }
}

module.exports = DaemonController;
