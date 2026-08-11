const { execFile } = require('child_process');

const APP_CATALOG = require('./app-catalog');
const { SILENT_LOGGER } = require('../logger');

const PROCESS_TIMEOUT_MS = 5000;
const IGNORED_PROCESS_PATTERN = /(?:XPCService|Helper(?:Tool)?|\.appex\/|\/PlugIns\/|\.framework\/|\/Frameworks\/)/i;

class ProcessDetector {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.execFile = options.execFile || execFile;
    this.appCatalog = options.appCatalog || APP_CATALOG;
    this.logger = options.logger || SILENT_LOGGER;
  }

  async getRunningProcesses() {
    if (this.platform === 'darwin') {
      try {
        return await this.getMacApplicationProcesses();
      } catch (error) {
        this.logger.warn(`Native macOS app detection failed; using ps: ${error.message}`);
      }
    }

    const { command, args } = this.getProcessCommand();
    return this.parseProcessOutput(await this.runCommand(command, args));
  }

  async getMacApplicationProcesses() {
    const script = `
      ObjC.import('AppKit');
      $.NSWorkspace.sharedWorkspace.runningApplications.js
        .filter(app => Number(app.activationPolicy) === 0)
        .map(app => ObjC.unwrap(app.localizedName))
        .filter(Boolean)
        .join('\\n');
    `;
    const stdout = await this.runCommand('osascript', ['-l', 'JavaScript', '-e', script]);
    return this.parseProcessOutput(stdout);
  }

  runCommand(command, args) {
    return new Promise((resolve, reject) => {
      this.execFile(command, args, {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        timeout: PROCESS_TIMEOUT_MS
      }, (error, stdout) => {
        if (error) {
          reject(new Error(`${command} failed: ${error.message}`));
          return;
        }
        resolve(stdout);
      });
    });
  }

  getProcessCommand() {
    if (this.platform === 'win32') {
      return {
        command: 'powershell.exe',
        args: ['-NoProfile', '-NonInteractive', '-Command', 'Get-Process | ForEach-Object { $_.ProcessName }']
      };
    }

    return {
      command: 'ps',
      args: this.platform === 'darwin' ? ['-axo', 'command='] : ['-eo', 'command=']
    };
  }

  parseProcessOutput(stdout) {
    return stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !/^(COMM|COMMAND|NAME)$/i.test(line));
  }

  extractAppName(processPath) {
    const trimmed = processPath.trim();
    const appBundle = trimmed.match(/\/([^/]+)\.app/);
    if (appBundle) {
      return appBundle[1];
    }

    if (!/[\\/]/.test(trimmed)) {
      return trimmed.replace(/\.(exe|app)$/i, '');
    }

    const executable = trimmed.match(/^(?:"([^"]+)"|'([^']+)'|(\S+))/);
    const executablePath = executable ? executable[1] || executable[2] || executable[3] : trimmed;
    return executablePath.split(/[\\/]/).pop().replace(/\.(exe|app)$/i, '');
  }

  isIgnoredProcess(processName) {
    return IGNORED_PROCESS_PATTERN.test(processName);
  }

  getDisplayApp(processName) {
    if (typeof processName !== 'string' || !processName || this.isIgnoredProcess(processName)) {
      return null;
    }

    const extractedName = this.extractAppName(processName).trim();
    const candidates = [extractedName];
    if (!/[\\/]/.test(processName) && /\s/.test(extractedName)) {
      candidates.push(extractedName.split(/\s+/)[0].replace(/\.(exe|app)$/i, ''));
    }

    for (const candidate of candidates) {
      const priority = this.appCatalog.findIndex(({ pattern }) => pattern.test(candidate));
      if (priority !== -1) {
        const catalogEntry = this.appCatalog[priority];
        return {
          name: catalogEntry.displayName || candidate,
          priority
        };
      }
    }

    return null;
  }

  getDisplayAppName(processName) {
    return this.getDisplayApp(processName)?.name || null;
  }

  isProfessionalApp(processName) {
    return this.getDisplayApp(processName) !== null;
  }

  async getInterestingApps() {
    const appsByName = new Map();

    for (const processName of await this.getRunningProcesses()) {
      const app = this.getDisplayApp(processName);
      if (!app) {
        continue;
      }

      const key = app.name.toLowerCase();
      const existing = appsByName.get(key);
      if (!existing || app.priority < existing.priority) {
        appsByName.set(key, app);
      }
    }

    return [...appsByName.values()]
      .sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name))
      .map(app => app.name);
  }
}

module.exports = ProcessDetector;
