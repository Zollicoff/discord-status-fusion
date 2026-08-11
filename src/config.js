const LOG_LEVELS = Object.freeze({
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  verbose: 4
});

const DEFAULTS = Object.freeze({
  updateInterval: 10000,
  forceUpdateInterval: 300000,
  logLevel: 'info',
  llmEnabled: true,
  geminiModel: 'gemini-2.5-flash-lite'
});

const BOOLEAN_VALUES = Object.freeze({
  true: true,
  '1': true,
  yes: true,
  false: false,
  '0': false,
  no: false
});

function parseEnvInteger(name, rawValue, defaultValue, minimum) {
  if (rawValue === undefined || rawValue === '') {
    return { value: defaultValue, warning: null };
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    return {
      value: defaultValue,
      warning: `${name} must be an integer of at least ${minimum}; using ${defaultValue}`
    };
  }

  return { value: parsed, warning: null };
}

function parseEnvBoolean(name, rawValue, defaultValue) {
  if (rawValue === undefined || rawValue === '') {
    return { value: defaultValue, warning: null };
  }

  const normalized = String(rawValue).trim().toLowerCase();
  if (!Object.hasOwn(BOOLEAN_VALUES, normalized)) {
    return {
      value: defaultValue,
      warning: `${name} must be true or false; using ${defaultValue}`
    };
  }

  return { value: BOOLEAN_VALUES[normalized], warning: null };
}

function loadConfig(env = process.env) {
  const update = parseEnvInteger(
    'UPDATE_INTERVAL',
    env.UPDATE_INTERVAL,
    DEFAULTS.updateInterval,
    1000
  );
  const forceUpdate = parseEnvInteger(
    'FORCE_UPDATE_INTERVAL',
    env.FORCE_UPDATE_INTERVAL,
    DEFAULTS.forceUpdateInterval,
    10000
  );
  const llmEnabled = parseEnvBoolean(
    'LLM_ENABLED',
    env.LLM_ENABLED,
    DEFAULTS.llmEnabled
  );

  const requestedLogLevel = (env.LOG_LEVEL || DEFAULTS.logLevel).toLowerCase();
  const logLevel = Object.hasOwn(LOG_LEVELS, requestedLogLevel) ?
    requestedLogLevel :
    DEFAULTS.logLevel;
  const requestedModel = (env.GEMINI_MODEL || DEFAULTS.geminiModel).trim();
  const geminiModel = /^[a-z0-9._-]+$/i.test(requestedModel) ?
    requestedModel :
    DEFAULTS.geminiModel;
  const warnings = [update.warning, forceUpdate.warning, llmEnabled.warning].filter(Boolean);

  if (logLevel !== requestedLogLevel) {
    warnings.push(`LOG_LEVEL must be one of ${Object.keys(LOG_LEVELS).join(', ')}; using ${logLevel}`);
  }
  if (geminiModel !== requestedModel) {
    warnings.push(`GEMINI_MODEL contains invalid characters; using ${geminiModel}`);
  }

  return {
    config: {
      discordClientId: env.DISCORD_CLIENT_ID || '',
      updateInterval: update.value,
      forceUpdateInterval: forceUpdate.value,
      logLevel,
      llmEnabled: llmEnabled.value,
      geminiModel
    },
    warnings
  };
}

function validateConfig(config) {
  if (!config.discordClientId) {
    return ['DISCORD_CLIENT_ID is required'];
  }

  if (config.discordClientId === 'your_discord_application_id_here') {
    return ['DISCORD_CLIENT_ID still contains the example placeholder'];
  }

  if (!/^\d{17,19}$/.test(config.discordClientId)) {
    return ['DISCORD_CLIENT_ID must be a 17-19 digit Discord application ID'];
  }

  return [];
}

module.exports = {
  DEFAULTS,
  LOG_LEVELS,
  loadConfig,
  parseEnvBoolean,
  parseEnvInteger,
  validateConfig
};
