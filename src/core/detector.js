const { execFile } = require('child_process');

const { matchApp, getPriority } = require('./app-catalog');
const { SILENT_LOGGER } = require('../logger');

const PROCESS_TIMEOUT_MS = 5000;
const MAX_BUFFER = 4 * 1024 * 1024;
const IGNORED_PROCESS_PATTERN = /(?:XPCService|Helper(?:Tool)?|\.appex\/|\/PlugIns\/|\.framework\/|\/Frameworks\/)/i;

// Lists regular (Dock) apps and the frontmost app through NSWorkspace. Needs no
// Accessibility or Automation permission.
const MAC_WORKSPACE_SCRIPT = `
ObjC.import('AppKit');
const workspace = $.NSWorkspace.sharedWorkspace;
let front = '';
try {
  const app = workspace.frontmostApplication;
  if (app && !app.isNil()) {
    front = ObjC.unwrap(app.localizedName) || '';
  }
} catch (error) {
  front = '';
}
const apps = workspace.runningApplications.js
  .filter(app => Number(app.activationPolicy) === 0)
  .map(app => ObjC.unwrap(app.localizedName))
  .filter(Boolean);
JSON.stringify({ front, apps });
`;

// Lists processes that own a window, the foreground process, and seconds since
// the last keyboard or mouse input.
const WINDOWS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -Name Win -Namespace DSF -MemberDefinition @'
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
[StructLayout(LayoutKind.Sequential)] public struct LastInput { public uint cbSize; public uint dwTime; }
[DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LastInput info);
'@
$foregroundId = [uint32]0
[void][DSF.Win]::GetWindowThreadProcessId([DSF.Win]::GetForegroundWindow(), [ref]$foregroundId)
$foreground = Get-Process -Id $foregroundId
if ($foreground) { 'F:' + $foreground.ProcessName }
$lastInput = New-Object 'DSF.Win+LastInput'
$lastInput.cbSize = 8
if ([DSF.Win]::GetLastInputInfo([ref]$lastInput)) {
  $now = [int64][Environment]::TickCount -band 4294967295
  'I:' + [math]::Floor(((($now - $lastInput.dwTime) + 4294967296) % 4294967296) / 1000)
}
Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { 'A:' + $_.ProcessName }
if ('DSF.Win' -as [type]) { 'S:native' }
`;

function encodePowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

class MissingToolError extends Error {}

/**
 * Samples which approved apps are running, which one has focus, and how long
 * the user has been idle. Raw process data never leaves this module: callers
 * only receive catalog ids.
 */
class AppDetector {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.execFile = options.execFile || execFile;
    this.env = options.env || process.env;
    this.logger = options.logger || SILENT_LOGGER;
    this.hiddenIds = new Set(options.hiddenIds || []);
    this.missingTools = new Set();
    this.warnedNativeFailure = false;
  }

  /**
   * @returns {Promise<{running: string[], focused: string|null, focusSupported: boolean, idleSeconds: number|null}>}
   */
  async sample() {
    let raw;
    if (this.platform === 'darwin') {
      raw = await this.sampleMac();
    } else if (this.platform === 'win32') {
      raw = await this.sampleWindows();
    } else {
      raw = await this.sampleLinux();
    }

    const running = this.toIds(raw.processes);
    const focusedEntry = raw.focusSupported ? this.identify(raw.focused) : null;
    const focused = focusedEntry && !this.hiddenIds.has(focusedEntry.id) ? focusedEntry.id : null;
    if (focused && !running.includes(focused)) {
      running.push(focused);
      running.sort((left, right) => getPriority(left) - getPriority(right));
    }

    return {
      running,
      focused,
      focusSupported: raw.focusSupported,
      idleSeconds: Number.isFinite(raw.idleSeconds) ? raw.idleSeconds : null
    };
  }

  async sampleMac() {
    const [workspace, idleSeconds] = await Promise.all([
      this.runCommand('osascript', ['-l', 'JavaScript', '-e', MAC_WORKSPACE_SCRIPT])
        .then(stdout => {
          const parsed = JSON.parse(stdout.trim());
          if (!parsed || !Array.isArray(parsed.apps)) {
            throw new Error('unexpected workspace output');
          }
          return parsed;
        })
        .catch(error => {
          this.warnOnce(`Native macOS app detection failed; using ps: ${error.message}`);
          return null;
        }),
      this.getMacIdleSeconds()
    ]);

    if (workspace) {
      return {
        processes: workspace.apps,
        focused: typeof workspace.front === 'string' ? workspace.front : null,
        focusSupported: true,
        idleSeconds
      };
    }

    const stdout = await this.runCommand('ps', ['-axo', 'command=']);
    return { processes: this.parseLines(stdout), focused: null, focusSupported: false, idleSeconds };
  }

  async getMacIdleSeconds() {
    const stdout = await this.tryCommand('ioreg', ['-c', 'IOHIDSystem']);
    const match = stdout && stdout.match(/"HIDIdleTime"\s*=\s*(\d+)/);
    return match ? Math.floor(Number(match[1]) / 1e9) : null;
  }

  async sampleWindows() {
    const stdout = await this.runCommand('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-EncodedCommand', encodePowerShell(WINDOWS_SCRIPT)
    ]);
    return this.parseWindowsOutput(stdout);
  }

  parseWindowsOutput(stdout) {
    const processes = [];
    let focused = null;
    let idleSeconds = null;
    let native = false;
    for (const line of this.parseLines(stdout)) {
      const value = line.slice(2).trim();
      if (line.startsWith('A:')) {
        processes.push(value);
      } else if (line.startsWith('F:')) {
        focused = value || null;
      } else if (line.startsWith('I:') && /^\d+$/.test(value)) {
        idleSeconds = Number(value);
      } else if (line === 'S:native') {
        native = true;
      }
    }
    if (!native) {
      this.warnOnce('Windows focus and idle APIs are unavailable; showing open apps instead');
    }
    return { processes, focused, focusSupported: native, idleSeconds };
  }

  async sampleLinux() {
    const stdout = await this.runCommand('ps', ['-eo', 'pid=,command=']);
    const commandsByPid = new Map();
    for (const line of this.parseLines(stdout)) {
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (match) {
        commandsByPid.set(Number(match[1]), match[2]);
      }
    }

    const [focusedPid, idleSeconds] = await Promise.all([
      this.getX11FocusedPid(),
      this.getX11IdleSeconds()
    ]);
    return {
      processes: [...commandsByPid.values()],
      focused: focusedPid ? commandsByPid.get(focusedPid) || null : null,
      focusSupported: focusedPid !== undefined,
      idleSeconds
    };
  }

  /**
   * @returns {Promise<number|null|undefined>} PID, null when no window has
   * focus, or undefined when focus cannot be determined.
   */
  async getX11FocusedPid() {
    if (!this.env.DISPLAY) {
      return undefined;
    }
    const root = await this.tryCommand('xprop', ['-root', '_NET_ACTIVE_WINDOW']);
    if (root === null) {
      return undefined;
    }
    const windowId = root.match(/window id # (0x[0-9a-f]+)/i)?.[1];
    if (!windowId || /^0x0+$/i.test(windowId)) {
      return null;
    }
    const window = await this.tryCommand('xprop', ['-id', windowId, '_NET_WM_PID']);
    const pid = window && window.match(/=\s*(\d+)/)?.[1];
    return pid ? Number(pid) : null;
  }

  async getX11IdleSeconds() {
    if (!this.env.DISPLAY) {
      return null;
    }
    const stdout = await this.tryCommand('xprintidle', []);
    return stdout && /^\d+$/.test(stdout.trim()) ? Math.floor(Number(stdout.trim()) / 1000) : null;
  }

  toIds(processes) {
    const ids = new Set();
    for (const processName of processes) {
      const entry = this.identify(processName);
      if (entry && !this.hiddenIds.has(entry.id)) {
        ids.add(entry.id);
      }
    }
    return [...ids].sort((left, right) => getPriority(left) - getPriority(right));
  }

  /**
   * Map a process name, bundle path, or command line to a catalog entry.
   * @param {string} processName
   * @returns {object|null}
   */
  identify(processName) {
    if (typeof processName !== 'string' || !processName.trim() || IGNORED_PROCESS_PATTERN.test(processName)) {
      return null;
    }

    const extractedName = this.extractAppName(processName).trim();
    const candidates = [extractedName];
    if (!/[\\/]/.test(processName) && /\s/.test(extractedName)) {
      candidates.push(extractedName.split(/\s+/)[0].replace(/\.(exe|app)$/i, ''));
    }

    for (const candidate of candidates) {
      const entry = matchApp(candidate);
      if (entry) {
        return entry;
      }
    }
    return null;
  }

  extractAppName(processPath) {
    const trimmed = processPath.trim();
    const appBundle = trimmed.match(/\/([^/]+)\.app(?:\/|$)/);
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

  parseLines(stdout) {
    return String(stdout || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
  }

  runCommand(command, args) {
    return new Promise((resolve, reject) => {
      this.execFile(command, args, {
        encoding: 'utf8',
        maxBuffer: MAX_BUFFER,
        timeout: PROCESS_TIMEOUT_MS,
        windowsHide: true
      }, (error, stdout) => {
        if (error) {
          const failure = error.code === 'ENOENT' ?
            new MissingToolError(`${command} is not installed`) :
            new Error(`${command} failed: ${error.message}`);
          reject(failure);
          return;
        }
        resolve(stdout || '');
      });
    });
  }

  /**
   * Run an optional helper. Returns null on failure and stops calling tools
   * that are not installed.
   */
  async tryCommand(command, args) {
    if (this.missingTools.has(command)) {
      return null;
    }
    try {
      return await this.runCommand(command, args);
    } catch (error) {
      if (error instanceof MissingToolError) {
        this.missingTools.add(command);
        this.logger.debug(`${command} is unavailable; continuing without it`);
      }
      return null;
    }
  }

  warnOnce(message) {
    if (this.warnedNativeFailure) {
      this.logger.debug(message);
      return;
    }
    this.warnedNativeFailure = true;
    this.logger.warn(message);
  }
}

module.exports = {
  AppDetector,
  MAC_WORKSPACE_SCRIPT,
  WINDOWS_SCRIPT,
  encodePowerShell
};
