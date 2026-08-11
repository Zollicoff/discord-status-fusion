const { execFile } = require('child_process');

const { SILENT_LOGGER } = require('../logger');

const MACOS_KEYCHAIN_SERVICES = Object.freeze([
  'GEMINI_API_KEY',
  'GOOGLE_AI_API_KEY'
]);
const KEYCHAIN_TIMEOUT_MS = 3000;

function runCommand(execFileImpl, command, args) {
  return new Promise((resolve, reject) => {
    execFileImpl(command, args, {
      encoding: 'utf8',
      timeout: KEYCHAIN_TIMEOUT_MS
    }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout || '');
    });
  });
}

class GeminiApiKeyProvider {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.platform = options.platform || process.platform;
    this.execFile = options.execFile || execFile;
    this.logger = options.logger || SILENT_LOGGER;
    this.loaded = false;
    this.apiKey = null;
    this.loadPromise = null;
  }

  getApiKey() {
    if (this.loaded) {
      return Promise.resolve(this.apiKey);
    }
    if (!this.loadPromise) {
      this.loadPromise = this.loadApiKey().finally(() => {
        this.loadPromise = null;
      });
    }
    return this.loadPromise;
  }

  async loadApiKey() {
    const environmentKey = this.normalizeKey(
      this.env.GEMINI_API_KEY || this.env.GOOGLE_AI_API_KEY
    );
    if (environmentKey) {
      this.apiKey = environmentKey;
      this.loaded = true;
      this.logger.info('Gemini API key loaded from the environment');
      return this.apiKey;
    }

    if (this.platform === 'darwin') {
      for (const service of MACOS_KEYCHAIN_SERVICES) {
        try {
          const output = await runCommand(this.execFile, 'security', [
            'find-generic-password',
            '-s', service,
            '-w'
          ]);
          const key = this.normalizeKey(output);
          if (key) {
            this.apiKey = key;
            this.loaded = true;
            this.logger.info('Gemini API key loaded from macOS Keychain');
            return this.apiKey;
          }
        } catch {
          // Try the legacy service name before reporting a missing key.
        }
      }
    }

    this.loaded = true;
    const setupHint = this.platform === 'darwin' ?
      'Set GEMINI_API_KEY or add it to macOS Keychain.' :
      'Set GEMINI_API_KEY in the environment.';
    this.logger.warn(`Gemini API key unavailable; using rule-based status fallback. ${setupHint}`);
    return null;
  }

  normalizeKey(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
}

module.exports = {
  GeminiApiKeyProvider,
  MACOS_KEYCHAIN_SERVICES,
  runCommand
};
