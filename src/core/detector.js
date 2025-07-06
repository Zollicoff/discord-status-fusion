const { exec } = require('child_process');

/**
 * Process Detector for Professional Applications
 * Detects running processes and filters to professional apps only
 */
class ProcessDetector {
  constructor() {
    this.lastProcesses = [];
  }

  /**
   * Get list of all running processes
   * @returns {Promise<string[]>} Array of process names
   */
  async getRunningProcesses() {
    return new Promise((resolve, reject) => {
      const command = this.getProcessCommand();

      exec(command, (error, stdout) => {
        if (error) {
          reject(new Error(`Failed to get processes: ${error.message}`));
          return;
        }

        const processes = this.parseProcessOutput(stdout);
        this.lastProcesses = processes;
        resolve(processes);
      });
    });
  }

  /**
   * Get platform-specific process command
   * @returns {string} Process listing command
   */
  getProcessCommand() {
    switch (process.platform) {
    case 'win32':
      return 'wmic process get Name /format:csv';
    case 'darwin':
      return 'ps -eo comm';
    case 'linux':
      return 'ps -eo comm';
    default:
      return 'ps -eo comm';
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
        .filter(line => !line.includes('COMM'))
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
    // Handle macOS .app bundle paths
    if (processPath.includes('.app/Contents/MacOS/')) {
      const parts = processPath.split('.app/Contents/MacOS/');
      if (parts.length > 1) {
        return parts[1];
      }
    }

    // Extract from .app directory name
    const appMatch = processPath.match(/\/([^/]+)\.app/);
    if (appMatch) {
      return appMatch[1];
    }

    // Remove file extensions
    return processPath.replace(/\.(exe|app)$/i, '');
  }

  /**
   * Check if a process is a professional app we want to show
   * @param {string} processName - Process name to check
   * @returns {boolean} True if it's a professional app worth showing
   */
  isProfessionalApp(processName) {
    // Filter out system paths first
    if (processName.startsWith('/System/') ||
        processName.startsWith('/usr/') ||
        processName.startsWith('/Library/') ||
        processName.includes('XPCService') ||
        processName.includes('HelperTool') ||
        processName.includes('npm exec') ||
        processName.includes('.framework/')) {
      return false;
    }

    const professionalApps = [
      // Development Tools & IDEs (exact matches)
      /^cursor$/i, /^zed$/i, /^code$/i, /^visual studio code$/i, /^xcode$/i,
      /^intellij idea$/i, /^pycharm$/i, /^webstorm$/i, /^phpstorm$/i,
      /^sublime text$/i, /^atom$/i, /^vim$/i, /^emacs$/i,
      /^stable$/i,  // Warp Terminal (exact match)
      /^iterm2?$/i, /^terminal$/i, /^hyper$/i,

      // Creative & Design Tools
      /^adobe photoshop/i, /^adobe illustrator/i, /^adobe after effects/i,
      /^adobe premiere pro/i, /^adobe lightroom/i, /^adobe indesign/i,
      /^adobe acrobat/i, /^adobe bridge/i, /^adobe audition/i,
      /^figma$/i, /^sketch$/i, /^canva$/i, /^affinity/i,
      /^final cut pro$/i, /^logic pro$/i, /^pro tools$/i,
      /^blender$/i, /^cinema 4d$/i, /^maya$/i, /^3ds max$/i,

      // Office & Productivity
      /^microsoft word$/i, /^microsoft excel$/i, /^microsoft powerpoint$/i,
      /^microsoft outlook$/i, /^microsoft project$/i, /^microsoft visio$/i,
      /^notion$/i, /^obsidian$/i, /^roam research$/i, /^logseq$/i,
      /^keynote$/i, /^pages$/i, /^numbers$/i,

      // Browsers (exact matches)
      /^google chrome$/i, /^chrome$/i, /^safari$/i, /^firefox$/i,
      /^microsoft edge$/i, /^brave browser$/i, /^opera$/i, /^arc$/i,

      // Database & API Tools
      /^tableplus$/i, /^sequel pro$/i, /^navicat$/i, /^dbeaver$/i,
      /^postman$/i, /^insomnia$/i, /^paw$/i,

      // Professional Software
      /^autocad$/i, /^solidworks$/i, /^fusion 360$/i,
      /^unity$/i, /^unreal engine$/i, /^godot$/i,
      /^docker desktop$/i, /^vmware fusion$/i, /^parallels desktop$/i,
      /^wireshark$/i, /^charles$/i,
      /^sourcetree$/i, /^github desktop$/i, /^gitkraken$/i
    ];

    return professionalApps.some(pattern => pattern.test(processName));
  }

  /**
   * Get professional applications currently running
   * @returns {Promise<string[]>} Array of professional app names
   */
  async getInterestingApps() {
    const processes = await this.getRunningProcesses();

    // Filter to only professional apps using whitelist
    const professionalApps = processes.filter(process => this.isProfessionalApp(process));

    // Remove duplicates and return unique apps
    return [...new Set(professionalApps)];
  }
}

module.exports = ProcessDetector;