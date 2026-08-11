const { SILENT_LOGGER } = require('../logger');
const {
  createDecisionContext,
  validateDecision
} = require('./status-decision');

class StatusGenerator {
  constructor(options) {
    this.client = options.client || null;
    this.enabled = options.enabled !== false;
    this.fallbackBuilder = options.fallbackBuilder;
    this.logger = options.logger || SILENT_LOGGER;
    this.cachedKey = null;
    this.cachedActivity = null;
  }

  async generateActivity(apps, music, startTimestamp) {
    const fallback = this.fallbackBuilder.buildActivity(apps, music, startTimestamp);
    if (!this.enabled || !this.client) {
      return fallback;
    }

    const context = createDecisionContext(apps, music, this.fallbackBuilder);
    const cacheKey = JSON.stringify(context);
    if (this.cachedKey === cacheKey && this.cachedActivity) {
      return {
        ...this.cachedActivity,
        startTimestamp: startTimestamp ?? this.cachedActivity.startTimestamp
      };
    }

    try {
      const rawDecision = await this.client.generateDecision(context);
      if (!rawDecision) {
        return fallback;
      }

      const decision = validateDecision(rawDecision, context);
      const activity = {
        ...this.fallbackBuilder.buildActivity(
          decision.selectedApps,
          decision.state,
          startTimestamp
        ),
        smallImageText: 'AI-Curated'
      };
      this.cachedKey = cacheKey;
      this.cachedActivity = activity;
      this.logger.info(
        `Gemini selected ${decision.selectedApps.join(' + ') || 'no applications'}`
      );
      return activity;
    } catch (error) {
      this.logger.warn(`Gemini decision rejected; using fallback: ${error.message}`);
      return fallback;
    }
  }
}

module.exports = StatusGenerator;
