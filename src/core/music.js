const { exec } = require('child_process');

/**
 * Music Detection Service
 * Detects currently playing music from Apple Music and Spotify
 */
class MusicDetector {
  /**
   * Get currently playing music from all sources
   * @returns {Promise<string|null>} Music description or null
   */
  async getCurrentMusic() {
    try {
      // Try Apple Music first (native macOS)
      const appleMusic = await this.getAppleMusic();
      if (appleMusic) return appleMusic;

      // Try Spotify
      const spotify = await this.getSpotify();
      if (spotify) return spotify;

      return null;
    } catch (error) {
      console.log('🎵 Music detection error:', error.message);
      return null;
    }
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

    return new Promise((resolve) => {
      exec(`osascript -e '${script}'`, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(null);
          return;
        }
        
        // Clean up the output and ensure consistent format
        let result = stdout.trim();
        if (result && !result.includes(' on Apple Music')) {
          result += ' on Apple Music';
        }
        resolve(result);
      });
    });
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

    return new Promise((resolve) => {
      exec(`osascript -e '${script}'`, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(null);
          return;
        }
        resolve(stdout.trim());
      });
    });
  }
}

module.exports = MusicDetector;