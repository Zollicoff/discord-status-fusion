const DEFAULT_MAX_TEXT_LENGTH = 128;

/**
 * Builds Discord Rich Presence payloads from trusted local app and music data.
 */
class StatusBuilder {
  constructor(options = {}) {
    this.maxTextLength = options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH;
  }

  /**
   * Build a complete Discord activity payload.
   * @param {string[]} apps - Detected application display names
   * @param {string|null} music - Current music description
   * @param {number} [startTimestamp] - Stable elapsed-time timestamp
   * @returns {Object} Discord activity payload
   */
  buildActivity(apps, music, startTimestamp) {
    const state = typeof music === 'string' && music.trim() ?
      music.trim() :
      'Working on projects';

    return {
      details: this.formatStatusDetails(apps),
      state: this.truncateText(state),
      largeImageKey: 'fusion_idle',
      largeImageText: 'Discord Status Fusion',
      smallImageKey: 'active',
      smallImageText: 'Active',
      startTimestamp: startTimestamp ?? Date.now()
    };
  }

  /**
   * Normalize and deduplicate application names without changing their order.
   * @param {string[]} apps - Detected application names
   * @returns {string[]} Normalized application names
   */
  normalizeApps(apps) {
    if (!Array.isArray(apps)) {
      return [];
    }

    const seen = new Set();
    const normalized = [];

    for (const app of apps) {
      if (typeof app !== 'string') {
        continue;
      }

      const name = app.trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) {
        continue;
      }

      seen.add(key);
      normalized.push(name);
    }

    return normalized;
  }

  /**
   * Fit detected apps into Discord's details field using complete app names.
   * @param {string[]} apps - Detected application names
   * @returns {string} Details field text
   */
  formatStatusDetails(apps) {
    const normalizedApps = this.normalizeApps(apps);
    if (normalizedApps.length === 0) {
      return 'Discord Status Fusion';
    }

    const fullDetails = `Using ${normalizedApps.join(' + ')}`;
    if (this.getTextLength(fullDetails) <= this.maxTextLength) {
      return fullDetails;
    }

    for (let visibleCount = normalizedApps.length - 1; visibleCount >= 1; visibleCount -= 1) {
      const hiddenCount = normalizedApps.length - visibleCount;
      const candidate = `Using ${normalizedApps.slice(0, visibleCount).join(' + ')} + ${hiddenCount} more`;
      if (this.getTextLength(candidate) <= this.maxTextLength) {
        return candidate;
      }
    }

    return this.truncateText(`Using ${normalizedApps[0]}`);
  }

  /**
   * Truncate text at Unicode character boundaries.
   * @param {string} text - Text to constrain
   * @returns {string} Text within the configured limit
   */
  truncateText(text) {
    if (typeof text !== 'string') {
      return '';
    }

    const characters = Array.from(text);
    if (characters.length <= this.maxTextLength) {
      return text;
    }

    if (this.maxTextLength <= 3) {
      return characters.slice(0, this.maxTextLength).join('');
    }

    return characters.slice(0, this.maxTextLength - 3).join('') + '...';
  }

  getTextLength(text) {
    return Array.from(text).length;
  }
}

module.exports = StatusBuilder;
