const { execFile } = require('child_process');
const { SILENT_LOGGER } = require('../logger');

const SCRIPT_TIMEOUT_MS = 3000;
const FIELD_SEPARATOR = '\x1f';

const MAC_PLAYERS = Object.freeze([
  { appName: 'Music', service: 'Apple Music' },
  { appName: 'Spotify', service: 'Spotify' }
]);

// MPRIS players reported by playerctl. Browsers are deliberately excluded so a
// muted video tab is never shown as music.
const LINUX_PLAYERS = Object.freeze({
  amberol: 'Amberol',
  audacious: 'Audacious',
  cider: 'Cider',
  clementine: 'Clementine',
  elisa: 'Elisa',
  lollypop: 'Lollypop',
  rhythmbox: 'Rhythmbox',
  spotify: 'Spotify',
  strawberry: 'Strawberry',
  'tidal-hifi': 'TIDAL',
  youtubemusic: 'YouTube Music'
});

/**
 * AppleScript that reports "title<US>artist" only when the player is already
 * running and playing, so querying never launches it.
 */
function buildMacPlayerScript(appName) {
  return `
    if application "${appName}" is running then
      tell application "${appName}"
        if player state is playing then
          return (name of current track) & (character id 31) & (artist of current track)
        end if
      end tell
    end if
    return ""
  `;
}

function parseTrack(text, service) {
  const [title = '', artist = ''] = String(text).trim().split(FIELD_SEPARATOR);
  if (!title.trim()) {
    return null;
  }
  return { title: title.trim(), artist: artist.trim() || null, service };
}

/**
 * Detects the currently playing track. Players are only queried when they are
 * already running, so detection never launches an app.
 */
class MusicDetector {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.execFile = options.execFile || execFile;
    this.logger = options.logger || SILENT_LOGGER;
    this.playerctlMissing = false;
  }

  /**
   * @returns {Promise<{title: string, artist: string|null, service: string}|null>}
   */
  async getCurrentMusic() {
    if (this.platform === 'darwin') {
      const tracks = await Promise.all(MAC_PLAYERS.map(player => this.getMacTrack(player)));
      return tracks.find(Boolean) || null;
    }
    if (this.platform === 'linux') {
      return this.getMprisTrack();
    }
    return null;
  }

  async getMacTrack({ appName, service }) {
    try {
      return parseTrack(await this.run('osascript', ['-e', buildMacPlayerScript(appName)]), service);
    } catch {
      // Players can quit or change state while AppleScript is querying them.
      return null;
    }
  }

  async getMprisTrack() {
    if (this.playerctlMissing) {
      return null;
    }

    let stdout;
    try {
      stdout = await this.run('playerctl', [
        '--all-players',
        'metadata',
        '--format',
        `{{playerName}}${FIELD_SEPARATOR}{{status}}${FIELD_SEPARATOR}{{title}}${FIELD_SEPARATOR}{{artist}}`
      ]);
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.playerctlMissing = true;
        this.logger.debug('playerctl is not installed; music detection is disabled');
      }
      return null;
    }

    for (const line of stdout.split(/\r?\n/)) {
      const [player = '', status = '', ...track] = line.split(FIELD_SEPARATOR);
      const service = LINUX_PLAYERS[player.split('.')[0].toLowerCase()];
      if (service && status === 'Playing') {
        const parsed = parseTrack(track.join(FIELD_SEPARATOR), service);
        if (parsed) {
          return parsed;
        }
      }
    }
    return null;
  }

  run(command, args) {
    return new Promise((resolve, reject) => {
      this.execFile(command, args, {
        encoding: 'utf8',
        timeout: SCRIPT_TIMEOUT_MS,
        windowsHide: true
      }, (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout || '');
      });
    });
  }
}

/**
 * Format a track for display.
 * @param {{title: string, artist: string|null}} music
 */
function formatTrack(music) {
  return music.artist ? `${music.title} — ${music.artist}` : music.title;
}

module.exports = {
  FIELD_SEPARATOR,
  LINUX_PLAYERS,
  MAC_PLAYERS,
  MusicDetector,
  buildMacPlayerScript,
  formatTrack,
  parseTrack
};
