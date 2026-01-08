const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

/**
 * Music Detection Service
 * Detects currently playing music from Apple Music and Spotify
 */
class MusicDetector {
  constructor() {
    this.platformWarningShown = false;
  }

  /**
   * Get currently playing music from all sources
   * @returns {Promise<string|null>} Music description or null
   */
  async getCurrentMusic() {
    if (process.platform !== 'darwin') {
      // Show warning once for unsupported platforms
      if (!this.platformWarningShown) {
        console.log('[INFO] Music detection is only available on macOS');
        console.log('[INFO] Windows and Linux music detection is not yet implemented');
        this.platformWarningShown = true;
      }
      return null;
    }

    // Try Apple Music first, then Spotify - handle each independently
    // so a failure in one doesn't prevent trying the other
    const appleMusic = await this.getAppleMusic();
    if (appleMusic) return appleMusic;

    const spotify = await this.getSpotify();
    if (spotify) return spotify;

    return null;
  }

  /**
   * Get Apple Music track info using AppleScript
   * @returns {Promise<string|null>} Apple Music track or null
   */
  async getAppleMusic() {
    const script = `
      tell application "Music"
        if player state is playing then
          set trackName to name of current track
          set artistName to artist of current track
          return trackName & " by " & artistName & " on Apple Music"
        end if
      end tell
    `;

    try {
      // Use execFile with array arguments to prevent command injection
      const { stdout } = await execFileAsync('osascript', ['-e', script]);
      if (!stdout || !stdout.trim()) {
        return null;
      }

      // Clean up the output and ensure consistent format
      let result = stdout.trim();
      if (result && !result.includes(' on Apple Music')) {
        result += ' on Apple Music';
      }
      return result;
    } catch {
      // AppleScript errors (app not running, not playing, etc.) are expected
      return null;
    }
  }

  /**
   * Get Spotify track info using AppleScript
   * @returns {Promise<string|null>} Spotify track or null
   */
  async getSpotify() {
    const script = `
      tell application "Spotify"
        if player state is playing then
          set trackName to name of current track
          set artistName to artist of current track
          return trackName & " by " & artistName & " on Spotify"
        end if
      end tell
    `;

    try {
      // Use execFile with array arguments to prevent command injection
      const { stdout } = await execFileAsync('osascript', ['-e', script]);
      if (!stdout || !stdout.trim()) {
        return null;
      }
      return stdout.trim();
    } catch {
      // AppleScript errors (app not running, not playing, etc.) are expected
      return null;
    }
  }
}

module.exports = MusicDetector;
