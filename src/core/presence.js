const { describeActivity } = require('./activity');
const { formatTrack } = require('./music');

const MAX_TEXT_LENGTH = 128;
const MIN_TEXT_LENGTH = 2;
const MIN_MUSIC_BUDGET = 12;
const PRODUCT_NAME = 'Discord Status Fusion';
const DEFAULT_LARGE_IMAGE =
  'https://raw.githubusercontent.com/Zollicoff/discord-status-fusion/main/src/images/status-fusion-icon.png';

const ACTIVITY_TYPES = Object.freeze({ playing: 0, listening: 2 });
const STATUS_DISPLAY_TYPES = Object.freeze({ name: 0, state: 1, details: 2 });

function length(text) {
  return Array.from(text).length;
}

function truncate(text, maxLength = MAX_TEXT_LENGTH) {
  const characters = Array.from(text);
  if (characters.length <= maxLength) {
    return text;
  }
  if (maxLength <= 1) {
    return characters.slice(0, maxLength).join('');
  }
  return characters.slice(0, maxLength - 1).join('').trimEnd() + '…';
}

/**
 * Discord rejects text fields shorter than two characters.
 */
function fitText(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return undefined;
  }
  const fitted = truncate(text.trim().replace(/\s+/g, ' '));
  return length(fitted) < MIN_TEXT_LENGTH ? fitted.padEnd(MIN_TEXT_LENGTH, '​') : fitted;
}

/**
 * Join complete app names, collapsing the tail into "+ N more" when needed.
 * @param {string[]} names
 * @param {number} maxLength
 */
function formatAppList(names, maxLength = MAX_TEXT_LENGTH) {
  if (names.length === 0) {
    return '';
  }
  const full = names.join(' + ');
  if (length(full) <= maxLength) {
    return full;
  }
  for (let visible = names.length - 1; visible >= 1; visible -= 1) {
    const candidate = `${names.slice(0, visible).join(' + ')} + ${names.length - visible} more`;
    if (length(candidate) <= maxLength) {
      return candidate;
    }
  }
  return truncate(names[0], maxLength);
}

/**
 * Builds Discord activity payloads (RPC wire format) from focus-ranked catalog
 * apps and the current track. App names always come from the local catalog.
 */
class PresenceBuilder {
  constructor(options = {}) {
    this.largeImage = options.largeImage || DEFAULT_LARGE_IMAGE;
    this.appIconUrl = options.appIconUrl || null;
    this.statusDisplay = options.statusDisplay || 'details';
  }

  /**
   * @param {{apps: object[], music: object|null, startTimestamp: number}} input
   * @returns {object|null} Activity payload, or null to clear the presence
   */
  build({ apps = [], music = null, startTimestamp }) {
    if (apps.length > 0) {
      return this.buildAppActivity(apps, music, startTimestamp);
    }
    if (music) {
      return this.buildMusicActivity(music, startTimestamp);
    }
    return null;
  }

  buildAppActivity(apps, music, startTimestamp) {
    const [primary] = apps;
    const appList = formatAppList(apps.map(entry => entry.name));
    let state = appList;
    if (music) {
      const prefix = `${appList} · ♪ `;
      const budget = MAX_TEXT_LENGTH - length(prefix);
      if (budget >= MIN_MUSIC_BUDGET) {
        state = prefix + truncate(formatTrack(music), budget);
      }
    }

    const icon = this.getAppIcon(primary);
    const assets = icon ?
      {
        large_image: icon,
        large_text: fitText(primary.name),
        small_image: this.largeImage,
        small_text: PRODUCT_NAME
      } :
      {
        large_image: this.largeImage,
        large_text: fitText(primary.name)
      };

    return this.finalize({
      type: ACTIVITY_TYPES.playing,
      details: fitText(describeActivity(apps)),
      state: fitText(state),
      assets,
      timestamps: { start: startTimestamp }
    });
  }

  buildMusicActivity(music, startTimestamp) {
    return this.finalize({
      type: ACTIVITY_TYPES.listening,
      details: fitText(music.title),
      state: fitText(music.artist ? `by ${music.artist}` : `on ${music.service}`),
      assets: {
        large_image: this.largeImage,
        large_text: fitText(`Listening on ${music.service}`)
      },
      timestamps: { start: startTimestamp }
    });
  }

  finalize(activity) {
    const statusDisplayType = STATUS_DISPLAY_TYPES[this.statusDisplay];
    if (statusDisplayType !== undefined && statusDisplayType !== STATUS_DISPLAY_TYPES.name) {
      activity.status_display_type = statusDisplayType;
    }
    activity.instance = false;
    return activity;
  }

  getAppIcon(entry) {
    return this.appIconUrl ? this.appIconUrl.replaceAll('{id}', encodeURIComponent(entry.id)) : null;
  }
}

/**
 * One-line human summary of an activity payload for logs and previews.
 */
function describePresence(activity) {
  if (!activity) {
    return 'Presence cleared';
  }
  return [activity.details, activity.state].filter(Boolean).join(' — ');
}

module.exports = {
  ACTIVITY_TYPES,
  DEFAULT_LARGE_IMAGE,
  MAX_TEXT_LENGTH,
  PresenceBuilder,
  STATUS_DISPLAY_TYPES,
  describePresence,
  fitText,
  formatAppList,
  truncate
};
