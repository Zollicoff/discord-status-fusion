const LOG_LEVELS = Object.freeze({
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  verbose: 4
});

const STATUS_DISPLAY_OPTIONS = Object.freeze(['name', 'details', 'state']);

const DEFAULTS = Object.freeze({
  updateInterval: 10000,
  idleTimeout: 600000,
  focusHalfLife: 600000,
  maxApps: 3,
  showMusic: true,
  hideApps: Object.freeze([]),
  statusDisplay: 'details',
  largeImage: '',
  appIconUrl: '',
  logLevel: 'info'
});

const RETIRED_SETTINGS = Object.freeze({
  LLM_ENABLED: 'AI curation was replaced by local focus tracking',
  GEMINI_MODEL: 'AI curation was replaced by local focus tracking',
  GEMINI_API_KEY: 'AI curation was replaced by local focus tracking; you can delete the key',
  GOOGLE_AI_API_KEY: 'AI curation was replaced by local focus tracking; you can delete the key',
  FORCE_UPDATE_INTERVAL: 'presence is re-sent automatically after Discord reconnects'
});

const BOOLEAN_VALUES = Object.freeze({
  true: true,
  '1': true,
  yes: true,
  on: true,
  false: false,
  '0': false,
  no: false,
  off: false
});

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function parseEnvInteger(name, rawValue, defaultValue, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  if (isBlank(rawValue)) {
    return { value: defaultValue, warning: null };
  }

  const parsed = Number(String(rawValue).trim());
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    const range = maximum === Number.MAX_SAFE_INTEGER ?
      `at least ${minimum}` :
      `between ${minimum} and ${maximum}`;
    return {
      value: defaultValue,
      warning: `${name} must be an integer ${range}; using ${defaultValue}`
    };
  }

  return { value: parsed, warning: null };
}

function parseEnvBoolean(name, rawValue, defaultValue) {
  if (isBlank(rawValue)) {
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

function parseEnvChoice(name, rawValue, choices, defaultValue) {
  if (isBlank(rawValue)) {
    return { value: defaultValue, warning: null };
  }
  const normalized = String(rawValue).trim().toLowerCase();
  if (!choices.includes(normalized)) {
    return {
      value: defaultValue,
      warning: `${name} must be one of ${choices.join(', ')}; using ${defaultValue}`
    };
  }
  return { value: normalized, warning: null };
}

function parseEnvList(rawValue) {
  if (isBlank(rawValue)) {
    return [];
  }
  return String(rawValue).split(',').map(item => item.trim()).filter(Boolean);
}

function parseImage(name, rawValue, { requireIdPlaceholder = false } = {}) {
  if (isBlank(rawValue)) {
    return { value: '', warning: null };
  }
  const value = String(rawValue).trim();
  const isUrl = /^https:\/\/\S+$/i.test(value);
  if (requireIdPlaceholder && (!isUrl || !value.includes('{id}'))) {
    return { value: '', warning: `${name} must be an https URL containing {id}; ignoring it` };
  }
  if (!isUrl && !/^[a-z0-9_-]{1,256}$/i.test(value)) {
    return { value: '', warning: `${name} must be an https URL or a Discord asset key; ignoring it` };
  }
  return { value, warning: null };
}

function loadConfig(env = process.env) {
  const results = {
    updateInterval: parseEnvInteger('UPDATE_INTERVAL', env.UPDATE_INTERVAL, DEFAULTS.updateInterval, 1000),
    idleTimeout: parseEnvInteger('IDLE_TIMEOUT', env.IDLE_TIMEOUT, DEFAULTS.idleTimeout, 0),
    focusHalfLife: parseEnvInteger('FOCUS_HALF_LIFE', env.FOCUS_HALF_LIFE, DEFAULTS.focusHalfLife, 10000),
    maxApps: parseEnvInteger('MAX_APPS', env.MAX_APPS, DEFAULTS.maxApps, 1, 6),
    showMusic: parseEnvBoolean('SHOW_MUSIC', env.SHOW_MUSIC, DEFAULTS.showMusic),
    statusDisplay: parseEnvChoice('STATUS_DISPLAY', env.STATUS_DISPLAY, STATUS_DISPLAY_OPTIONS, DEFAULTS.statusDisplay),
    logLevel: parseEnvChoice('LOG_LEVEL', env.LOG_LEVEL, Object.keys(LOG_LEVELS), DEFAULTS.logLevel),
    largeImage: parseImage('LARGE_IMAGE', env.LARGE_IMAGE),
    appIconUrl: parseImage('APP_ICON_URL', env.APP_ICON_URL, { requireIdPlaceholder: true })
  };

  const warnings = Object.values(results).map(result => result.warning).filter(Boolean);
  for (const [name, reason] of Object.entries(RETIRED_SETTINGS)) {
    if (!isBlank(env[name])) {
      warnings.push(`${name} is no longer used (${reason})`);
    }
  }

  const config = Object.fromEntries(
    Object.entries(results).map(([key, result]) => [key, result.value])
  );
  config.discordClientId = String(env.DISCORD_CLIENT_ID || '').trim();
  config.hideApps = parseEnvList(env.HIDE_APPS);

  return { config, warnings };
}

function validateConfig(config) {
  if (!config.discordClientId) {
    return ['DISCORD_CLIENT_ID is required. Create an application at https://discord.com/developers/applications and copy its Application ID.'];
  }

  if (config.discordClientId === 'your_discord_application_id_here') {
    return ['DISCORD_CLIENT_ID still contains the example placeholder'];
  }

  if (!/^\d{17,20}$/.test(config.discordClientId)) {
    return ['DISCORD_CLIENT_ID must be a 17-20 digit Discord application ID'];
  }

  return [];
}

module.exports = {
  DEFAULTS,
  LOG_LEVELS,
  RETIRED_SETTINGS,
  STATUS_DISPLAY_OPTIONS,
  loadConfig,
  parseEnvBoolean,
  parseEnvChoice,
  parseEnvInteger,
  parseEnvList,
  validateConfig
};
