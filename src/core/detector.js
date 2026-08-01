const { execFile } = require('child_process');

/**
 * Process Detector for Professional Applications
 * Detects running processes and filters to professional apps only
 */
class ProcessDetector {
  constructor() {
    this.lastProcesses = [];
    this.professionalApps = [
      // Development Tools & IDEs
      { pattern: /^cursor$/i, displayName: 'Cursor' },
      { pattern: /^zed$/i, displayName: 'Zed' },
      { pattern: /^code$/i, displayName: 'VS Code' },
      { pattern: /^visual studio code$/i, displayName: 'VS Code' },
      { pattern: /^codex$/i, displayName: 'Codex' },
      { pattern: /^xcode$/i, displayName: 'Xcode' },
      { pattern: /^intellij idea$/i, displayName: 'IntelliJ IDEA' },
      { pattern: /^pycharm$/i, displayName: 'PyCharm' },
      { pattern: /^webstorm$/i, displayName: 'WebStorm' },
      { pattern: /^phpstorm$/i, displayName: 'PhpStorm' },
      { pattern: /^sublime text$/i, displayName: 'Sublime Text' },
      { pattern: /^atom$/i, displayName: 'Atom' },
      { pattern: /^vim$/i, displayName: 'Vim' },
      { pattern: /^emacs$/i, displayName: 'Emacs' },
      { pattern: /^warp$/i, displayName: 'Warp' },
      { pattern: /^iterm2?$/i, displayName: 'iTerm' },
      { pattern: /^terminal$/i, displayName: 'Terminal' },
      { pattern: /^ghostty$/i, displayName: 'Ghostty' },
      { pattern: /^hyper$/i, displayName: 'Hyper' },

      // Creative & Design Tools
      { pattern: /^adobe photoshop/i },
      { pattern: /^adobe illustrator/i },
      { pattern: /^adobe after effects/i },
      { pattern: /^adobe premiere pro/i },
      { pattern: /^adobe lightroom/i },
      { pattern: /^adobe indesign/i },
      { pattern: /^adobe acrobat/i },
      { pattern: /^adobe bridge/i },
      { pattern: /^adobe audition/i },
      { pattern: /^figma$/i, displayName: 'Figma' },
      { pattern: /^sketch$/i, displayName: 'Sketch' },
      { pattern: /^canva$/i, displayName: 'Canva' },
      { pattern: /^affinity/i },
      { pattern: /^final cut pro$/i, displayName: 'Final Cut Pro' },
      { pattern: /^logic pro$/i, displayName: 'Logic Pro' },
      { pattern: /^pro tools$/i, displayName: 'Pro Tools' },
      { pattern: /^blender$/i, displayName: 'Blender' },
      { pattern: /^cinema 4d$/i, displayName: 'Cinema 4D' },
      { pattern: /^maya$/i, displayName: 'Maya' },
      { pattern: /^3ds max$/i, displayName: '3ds Max' },

      // Office & Productivity
      { pattern: /^microsoft word$/i, displayName: 'Microsoft Word' },
      { pattern: /^microsoft excel$/i, displayName: 'Microsoft Excel' },
      { pattern: /^microsoft powerpoint$/i, displayName: 'Microsoft PowerPoint' },
      { pattern: /^microsoft outlook$/i, displayName: 'Microsoft Outlook' },
      { pattern: /^microsoft project$/i, displayName: 'Microsoft Project' },
      { pattern: /^microsoft visio$/i, displayName: 'Microsoft Visio' },
      { pattern: /^notion$/i, displayName: 'Notion' },
      { pattern: /^obsidian$/i, displayName: 'Obsidian' },
      { pattern: /^roam research$/i, displayName: 'Roam Research' },
      { pattern: /^logseq$/i, displayName: 'Logseq' },
      { pattern: /^keynote$/i, displayName: 'Keynote' },
      { pattern: /^pages$/i, displayName: 'Pages' },
      { pattern: /^numbers$/i, displayName: 'Numbers' },

      // Browsers
      { pattern: /^google chrome$/i, displayName: 'Google Chrome' },
      { pattern: /^chrome$/i, displayName: 'Chrome' },
      { pattern: /^safari$/i, displayName: 'Safari' },
      { pattern: /^firefox$/i, displayName: 'Firefox' },
      { pattern: /^microsoft edge$/i, displayName: 'Microsoft Edge' },
      { pattern: /^brave browser$/i, displayName: 'Brave Browser' },
      { pattern: /^opera$/i, displayName: 'Opera' },
      { pattern: /^arc$/i, displayName: 'Arc' },

      // Database & API Tools
      { pattern: /^tableplus$/i, displayName: 'TablePlus' },
      { pattern: /^sequel pro$/i, displayName: 'Sequel Pro' },
      { pattern: /^navicat$/i, displayName: 'Navicat' },
      { pattern: /^dbeaver$/i, displayName: 'DBeaver' },
      { pattern: /^postman$/i, displayName: 'Postman' },
      { pattern: /^insomnia$/i, displayName: 'Insomnia' },
      { pattern: /^paw$/i, displayName: 'Paw' },

      // Professional Software
      { pattern: /^autocad$/i, displayName: 'AutoCAD' },
      { pattern: /^solidworks$/i, displayName: 'SolidWorks' },
      { pattern: /^fusion 360$/i, displayName: 'Fusion 360' },
      { pattern: /^unity$/i, displayName: 'Unity' },
      { pattern: /^unreal engine$/i, displayName: 'Unreal Engine' },
      { pattern: /^godot$/i, displayName: 'Godot' },
      { pattern: /^docker desktop$/i, displayName: 'Docker Desktop' },
      { pattern: /^vmware fusion$/i, displayName: 'VMware Fusion' },
      { pattern: /^parallels desktop$/i, displayName: 'Parallels Desktop' },
      { pattern: /^wireshark$/i, displayName: 'Wireshark' },
      { pattern: /^charles$/i, displayName: 'Charles' },
      { pattern: /^sourcetree$/i, displayName: 'Sourcetree' },
      { pattern: /^github desktop$/i, displayName: 'GitHub Desktop' },
      { pattern: /^gitkraken$/i, displayName: 'GitKraken' }
    ];
  }

  /**
   * Get list of all running processes
   * @returns {Promise<string[]>} Array of process names
   */
  async getRunningProcesses() {
    if (process.platform === 'darwin') {
      try {
        const processes = await this.getMacApplicationProcesses();
        this.lastProcesses = processes;
        return processes;
      } catch (error) {
        console.warn(`[WARN] Failed to get macOS application list, falling back to ps: ${error.message}`);
      }
    }

    const processes = await new Promise((resolve, reject) => {
      const { command, args } = this.getProcessCommand();

      execFile(command, args, (error, stdout) => {
        if (error) {
          reject(new Error(`Failed to get processes: ${error.message}`));
          return;
        }

        const processes = this.parseProcessOutput(stdout);
        resolve(processes);
      });
    });

    this.lastProcesses = processes;
    return processes;
  }

  /**
   * Get foreground-capable macOS apps instead of widget and helper processes.
   * @returns {Promise<string[]>} Array of app process names
   */
  async getMacApplicationProcesses() {
    const script = `
      set appNames to {}
      tell application "System Events"
        repeat with appProcess in (application processes whose background only is false)
          set end of appNames to name of appProcess
        end repeat
      end tell
      set AppleScript's text item delimiters to linefeed
      return appNames as text
    `;

    return new Promise((resolve, reject) => {
      execFile('osascript', ['-e', script], (error, stdout) => {
        if (error) {
          reject(new Error(`Failed to get macOS applications: ${error.message}`));
          return;
        }

        resolve(this.parseProcessOutput(stdout));
      });
    });
  }

  /**
   * Get platform-specific process command
   * @returns {{command: string, args: string[]}} Process listing command and arguments
   */
  getProcessCommand() {
    switch (process.platform) {
    case 'win32':
      return { command: 'wmic', args: ['process', 'get', 'Name', '/format:csv'] };
    case 'darwin':
      return { command: 'ps', args: ['-axo', 'command='] };
    case 'linux':
      return { command: 'ps', args: ['-eo', 'command='] };
    default:
      return { command: 'ps', args: ['-eo', 'command='] };
    }
  }

  /**
   * Parse process command output into clean app names
   * @param {string} stdout - Raw process output
   * @returns {string[]} Array of clean process names
   */
  parseProcessOutput(stdout) {
    const lines = stdout.split('\n').map(line => line.trim()).filter(Boolean);

    if (process.platform === 'win32') {
      // Windows CSV format: Node,Name
      return lines
        .filter(line => line.includes(',') && !line.includes('Name'))
        .map(line => line.split(',')[1])
        .filter(Boolean)
        .map(name => this.extractAppName(name));
    } else {
      // Unix format: one process per line
      return lines
        .filter(line => !/^(COMM|COMMAND)$/.test(line))
        .map(line => this.extractAppName(line))
        .filter(name => name);
    }
  }

  /**
   * Extract clean app name from process path
   * @param {string} processPath - Full process path or name
   * @returns {string} Clean app name
   */
  extractAppName(processPath) {
    const trimmed = processPath.trim();

    // Prefer the outer app bundle name so helper processes collapse to one app.
    const appMatch = trimmed.match(/\/([^/]+)\.app/);
    if (appMatch) {
      return appMatch[1];
    }

    if (!/[\\/]/.test(trimmed)) {
      return trimmed.replace(/\.(exe|app)$/i, '');
    }

    const executable = trimmed.split(/\s+/)[0];
    const basename = executable.split(/[\\/]/).pop();

    // Remove file extensions
    return basename.replace(/\.(exe|app)$/i, '');
  }

  /**
   * Check if a process should be ignored before app matching
   * @param {string} processName - Process name to check
   * @returns {boolean} True if the process should be ignored
   */
  isIgnoredProcess(processName) {
    return processName.startsWith('/System/') ||
        processName.startsWith('/usr/') ||
        processName.startsWith('/Library/') ||
        processName.includes('XPCService') ||
        processName.includes('HelperTool') ||
        processName.includes('npm exec') ||
        processName.includes('.appex/') ||
        processName.includes('/PlugIns/') ||
        processName.includes('.framework/');
  }

  /**
   * Convert a process name to app metadata used in Discord.
   * @param {string} processName - Process name to normalize
   * @returns {{name: string, priority: number}|null} App metadata, otherwise null
   */
  getDisplayApp(processName) {
    if (!processName || this.isIgnoredProcess(processName)) {
      return null;
    }

    const appName = this.extractAppName(processName).trim();
    if (!appName || this.isIgnoredProcess(appName)) {
      return null;
    }

    const priority = this.professionalApps.findIndex(({ pattern }) => pattern.test(appName));
    if (priority === -1) {
      return null;
    }

    const app = this.professionalApps[priority];
    return {
      name: app.displayName || appName,
      priority
    };
  }

  /**
   * Convert a process name to the display name used in Discord.
   * @param {string} processName - Process name to normalize
   * @returns {string|null} Display name for professional apps, otherwise null
   */
  getDisplayAppName(processName) {
    const app = this.getDisplayApp(processName);
    return app ? app.name : null;
  }

  /**
   * Check if a process is a professional app we want to show
   * @param {string} processName - Process name to check
   * @returns {boolean} True if it's a professional app worth showing
   */
  isProfessionalApp(processName) {
    return this.getDisplayAppName(processName) !== null;
  }

  /**
   * Get professional applications currently running
   * @returns {Promise<string[]>} Array of professional app names
   */
  async getInterestingApps() {
    const processes = await this.getRunningProcesses();

    const appsByName = new Map();

    for (const process of processes) {
      const app = this.getDisplayApp(process);
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
      .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
      .map(app => app.name);
  }
}

module.exports = ProcessDetector;
