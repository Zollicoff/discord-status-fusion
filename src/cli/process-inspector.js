const { execFileSync } = require('child_process');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class ProcessInspector {
  constructor(options) {
    this.mainFile = options.mainFile;
    this.platform = options.platform || process.platform;
    this.processRef = options.processRef || process;
    this.execFileSync = options.execFileSync || execFileSync;
  }

  exists(pid) {
    try {
      this.processRef.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  getCommand(pid) {
    try {
      if (this.platform === 'win32') {
        return this.execFileSync('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine`
        ], { encoding: 'utf8' }).trim();
      }

      return this.execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
        encoding: 'utf8'
      }).trim();
    } catch {
      return '';
    }
  }

  matchesCommand(command) {
    const expectedPath = escapeRegExp(this.mainFile.toLowerCase());
    return new RegExp(`(?:^|[\\s"'])${expectedPath}(?=$|[\\s"'])`).test(command.toLowerCase());
  }

  isManagedProcess(record) {
    return Boolean(record && this.exists(record.pid) && this.matchesCommand(this.getCommand(record.pid)));
  }
}

module.exports = {
  ProcessInspector,
  escapeRegExp
};
