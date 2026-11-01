const { getApp } = require('./core/app-catalog');
const { formatTrack } = require('./core/music');
const { loadConfig } = require('./config');
const { SILENT_LOGGER } = require('./logger');
const { createApplication } = require('./runtime');

const OFFLINE_DISCORD = Object.freeze({
  start() {},
  setActivity() {
    return Promise.resolve(false);
  },
  stop() {
    return Promise.resolve();
  }
});

function names(ids) {
  return ids.map(id => getApp(id)?.name || id).join(', ') || 'none';
}

/**
 * Sample local activity once and describe what Discord would show, without
 * connecting to Discord. Useful for checking detection on a new machine.
 */
async function preview(options = {}) {
  const env = options.env || process.env;
  const output = options.output || console;
  const { config, warnings } = loadConfig(env);
  const app = createApplication(config, {
    discord: OFFLINE_DISCORD,
    logger: SILENT_LOGGER,
    spinner: { start() {}, stop() {} },
    ...options.dependencies
  });

  const { activity, sample, music, idle } = await app.compute();
  const lines = [
    `Running apps:  ${names(sample.running)}`,
    `Focused app:   ${sample.focusSupported ? names(sample.focused ? [sample.focused] : []) : 'not available on this platform'}`,
    `Idle:          ${sample.idleSeconds === null ? 'unknown' : `${sample.idleSeconds}s${idle ? ' (away)' : ''}`}`,
    `Music:         ${music ? `${formatTrack(music)} (${music.service})` : 'none'}`,
    '',
    activity ? 'Discord would show:' : 'Discord presence would be cleared.'
  ];
  if (activity) {
    lines.push(`  ${activity.details}`, `  ${activity.state}`);
  }
  for (const warning of warnings) {
    lines.push('', `Warning: ${warning}`);
  }
  output.log(lines.join('\n'));
  return { activity, sample, music, idle };
}

module.exports = {
  OFFLINE_DISCORD,
  preview
};
