const { execFile } = require('child_process');
const { SILENT_LOGGER } = require('../logger');

const SCRIPT_TIMEOUT_MS = 3000;

/**
 * Detects currently playing music from Apple Music and Spotify on macOS.
 */
class MusicDetector {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.execFile = options.execFile || execFile;
    this.logger = options.logger || SILENT_LOGGER;
    this.platformWarningShown = false;
  }

  /**
   * Get currently playing music from supported sources.
   * @returns {Promise<string|null>} Music description or null
   */
  async getCurrentMusic() {
    if (this.platform !== 'darwin') {
      if (!this.platformWarningShown) {
        this.logger.info('Music detection is only available on macOS');
        this.platformWarningShown = true;
      }
      return null;
    }

    const [appleMusic, spotify] = await Promise.all([
      this.getAppleMusic(),
      this.getSpotify()
    ]);

    return appleMusic || spotify || null;
  }

  /**
   * Get Apple Music track info without launching Music.
   * @returns {Promise<string|null>} Apple Music track or null
   */
  getAppleMusic() {
    return this.getPlayerTrack('Music', 'Apple Music');
  }

  /**
   * Get Spotify track info without launching Spotify.
   * @returns {Promise<string|null>} Spotify track or null
   */
  getSpotify() {
    return this.getPlayerTrack('Spotify', 'Spotify');
  }

  /**
   * Query a supported player only when it is already running and playing.
   * @param {'Music'|'Spotify'} appName - macOS application name
   * @param {string} serviceName - Name shown in Discord
   * @returns {Promise<string|null>} Current track or null
   */
  async getPlayerTrack(appName, serviceName) {
    const script = `
      if application "${appName}" is running then
        tell application "${appName}"
          if player state is playing then
            set trackName to name of current track
            set artistName to artist of current track
            return trackName & " by " & artistName & " on ${serviceName}"
          end if
        end tell
      end if
      return ""
    `;

    try {
      const stdout = await this.runAppleScript(script);
      return stdout.trim() || null;
    } catch {
      // Players can close or change state while AppleScript is querying them.
      return null;
    }
  }

  runAppleScript(script) {
    return new Promise((resolve, reject) => {
      this.execFile('osascript', ['-e', script], { timeout: SCRIPT_TIMEOUT_MS }, (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(stdout || '');
      });
    });
  }
}

module.exports = MusicDetector;
