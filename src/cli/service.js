const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { APP_NAME } = require('../paths');

const SERVICE_LABEL = 'io.github.zollicoff.discord-status-fusion';

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function quoteSystemd(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%')}"`;
}

function quoteVbs(value) {
  return `""${String(value).replace(/"/g, '""')}""`;
}

/**
 * Installs Discord Status Fusion as a per-user login service:
 * a launchd LaunchAgent on macOS, a systemd user unit on Linux, and a hidden
 * Startup-folder script on Windows.
 */
class ServiceManager {
  constructor(options) {
    this.platform = options.platform || process.platform;
    this.paths = options.paths;
    this.env = options.env || process.env;
    this.nodePath = options.nodePath || process.execPath;
    this.fs = options.fs || fs;
    this.execFileSync = options.execFileSync || execFileSync;
    this.logger = options.logger || console;
    this.uid = options.uid ?? (typeof process.getuid === 'function' ? process.getuid() : 0);
  }

  get serviceFile() {
    const { home } = this.paths;
    if (this.platform === 'darwin') {
      return path.posix.join(home, 'Library', 'LaunchAgents', `${SERVICE_LABEL}.plist`);
    }
    if (this.platform === 'win32') {
      const appData = this.env.APPDATA || path.win32.join(home, 'AppData', 'Roaming');
      return path.win32.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', `${APP_NAME}.vbs`);
    }
    const configHome = this.env.XDG_CONFIG_HOME || path.posix.join(home, '.config');
    return path.posix.join(configHome, 'systemd', 'user', `${APP_NAME}.service`);
  }

  get isSupported() {
    return ['darwin', 'linux', 'win32'].includes(this.platform);
  }

  isInstalled() {
    return this.isSupported && this.fs.existsSync(this.serviceFile);
  }

  render() {
    if (this.platform === 'darwin') {
      return this.renderLaunchAgent();
    }
    if (this.platform === 'win32') {
      return this.renderStartupScript();
    }
    return this.renderSystemdUnit();
  }

  renderLaunchAgent() {
    const { mainFile, projectRoot, logFile } = this.paths;
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${SERVICE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(this.nodePath)}</string>
    <string>${escapeXml(mainFile)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(projectRoot)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>30</integer>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${escapeXml(logFile)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(logFile)}</string>
</dict>
</plist>
`;
  }

  renderSystemdUnit() {
    const { mainFile, projectRoot, logFile } = this.paths;
    return `[Unit]
Description=Discord Status Fusion
Documentation=https://github.com/Zollicoff/discord-status-fusion

[Service]
Type=simple
ExecStart=${quoteSystemd(this.nodePath)} ${quoteSystemd(mainFile)}
WorkingDirectory=${quoteSystemd(projectRoot)}
Restart=on-failure
RestartSec=30
StandardOutput=append:${logFile.replace(/%/g, '%%')}
StandardError=append:${logFile.replace(/%/g, '%%')}

[Install]
WantedBy=default.target
`;
  }

  renderStartupScript() {
    const { mainFile, logFile } = this.paths;
    const command = [this.nodePath, mainFile, `--log-file=${logFile}`].map(quoteVbs).join(' ');
    return `' Discord Status Fusion login item. Remove with: dsf uninstall\r
CreateObject("WScript.Shell").Run "${command}", 0, False\r
`;
  }

  install() {
    if (!this.isSupported) {
      throw new Error(`Login services are not supported on ${this.platform}`);
    }
    const file = this.serviceFile;
    this.fs.mkdirSync(path.dirname(file), { recursive: true });
    this.fs.mkdirSync(path.dirname(this.paths.logFile), { recursive: true });
    this.fs.writeFileSync(file, this.render());

    if (this.platform === 'darwin') {
      const domain = `gui/${this.uid}`;
      this.tryRun('launchctl', ['bootout', `${domain}/${SERVICE_LABEL}`]);
      this.run('launchctl', ['bootstrap', domain, file]);
    } else if (this.platform === 'win32') {
      this.run('wscript.exe', [file]);
    } else {
      this.run('systemctl', ['--user', 'daemon-reload']);
      this.run('systemctl', ['--user', 'enable', '--now', `${APP_NAME}.service`]);
    }
    return file;
  }

  uninstall() {
    if (!this.isInstalled()) {
      return false;
    }
    const file = this.serviceFile;
    if (this.platform === 'darwin') {
      this.tryRun('launchctl', ['bootout', `gui/${this.uid}/${SERVICE_LABEL}`]);
    } else if (this.platform === 'linux') {
      this.tryRun('systemctl', ['--user', 'disable', '--now', `${APP_NAME}.service`]);
    }
    this.fs.unlinkSync(file);
    if (this.platform === 'linux') {
      this.tryRun('systemctl', ['--user', 'daemon-reload']);
    }
    return true;
  }

  run(command, args) {
    return this.execFileSync(command, args, { encoding: 'utf8', stdio: 'pipe', windowsHide: true });
  }

  tryRun(command, args) {
    try {
      return this.run(command, args);
    } catch {
      return null;
    }
  }
}

module.exports = {
  SERVICE_LABEL,
  ServiceManager,
  escapeXml,
  quoteSystemd,
  quoteVbs
};
