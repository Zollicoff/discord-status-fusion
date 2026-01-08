require('dotenv').config();

const ProcessDetector = require('./src/core/detector');
const MusicDetector = require('./src/core/music');
const LLMClient = require('./src/core/llm');
const DiscordRPC = require('discord-rpc');

// Parse command line arguments
const args = process.argv.slice(2);
const isVerboseMode = args.includes('--verbose');

// Check if stdout is a TTY (not redirected to file)
const isTTY = process.stdout.isTTY;

// Log levels in order of verbosity
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  verbose: 4
};

// Get configured log level (default: info, verbose mode overrides to verbose)
const configuredLevel = isVerboseMode ? 'verbose' : (process.env.LOG_LEVEL || 'info').toLowerCase();
const currentLogLevel = LOG_LEVELS[configuredLevel] !== undefined ? LOG_LEVELS[configuredLevel] : LOG_LEVELS.info;

/**
 * Parse an integer from environment variable with validation
 * @param {string|undefined} value - Environment variable value
 * @param {number} defaultValue - Default value if parsing fails
 * @param {number} minValue - Minimum allowed value
 * @returns {number} Parsed integer or default value
 */
function parseEnvInt(value, defaultValue, minValue = 1) {
  if (value === undefined || value === '') return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < minValue) {
    console.warn(`[WARN] Invalid environment variable value "${value}", using default: ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
}

/**
 * Log a message if the level is at or below the configured level
 * @param {string} prefix - Log prefix (e.g., '[INFO]')
 * @param {string} message - Message to log
 * @param {string} level - Log level (error, warn, info, debug, verbose)
 */
function log(prefix, message, level = 'info') {
  const levelNum = LOG_LEVELS[level] !== undefined ? LOG_LEVELS[level] : LOG_LEVELS.info;
  if (levelNum <= currentLogLevel) {
    console.log(prefix, message);
  }
}

// Simple spinner for showing running status (only in TTY mode)
class Spinner {
  constructor() {
    this.frames = ['|', '/', '-', '\\'];
    this.current = 0;
    this.interval = null;
    this.isSpinning = false;
  }

  start(message = 'Running') {
    // Only show spinner in TTY mode and non-verbose mode
    if (this.isSpinning || isVerboseMode || !isTTY) return;
    this.isSpinning = true;

    process.stdout.write(`${this.frames[0]} ${message}...`);

    this.interval = setInterval(() => {
      this.current = (this.current + 1) % this.frames.length;
      process.stdout.write(`\r${this.frames[this.current]} ${message}...`);
    }, 120);
  }

  stop() {
    if (!this.isSpinning) return;
    this.isSpinning = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    process.stdout.write('\r\x1b[K');
  }

  update(message) {
    if (!this.isSpinning || isVerboseMode || !isTTY) return;
    process.stdout.write(`\r${this.frames[this.current]} ${message}...`);
  }
}

/**
 * Validate required configuration before starting
 * @returns {boolean} True if configuration is valid
 */
function validateConfig() {
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!clientId) {
    console.error('[ERROR] DISCORD_CLIENT_ID not found in environment variables');
    console.error('Please create a .env file with DISCORD_CLIENT_ID=your_application_id');
    return false;
  }

  if (clientId === 'your_discord_application_id_here') {
    console.error('[ERROR] DISCORD_CLIENT_ID is still set to the placeholder value');
    console.error('Please update .env with your actual Discord Application ID');
    return false;
  }

  // Basic format validation (Discord IDs are numeric strings)
  if (!/^\d{17,19}$/.test(clientId)) {
    console.error('[ERROR] DISCORD_CLIENT_ID appears to be invalid');
    console.error('Discord Application IDs should be 17-19 digit numbers');
    return false;
  }

  return true;
}

/**
 * Discord Status Fusion v1.0
 * AI-powered Discord Rich Presence with intelligent status generation
 * Features smart change detection, professional app filtering, and forced refresh
 */
class DiscordStatusFusion {
  constructor() {
    this.detector = new ProcessDetector();
    this.music = new MusicDetector();
    this.llm = new LLMClient();
    this.discord = new DiscordRPC.Client({ transport: 'ipc' });
    this.spinner = new Spinner();
    this.lastStatus = null;
    this.lastApps = [];
    this.lastMusic = null;
    this.isUpdating = false;
    this.updateTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;

    // Configurable intervals via environment variables (with validation)
    this.updateInterval = parseEnvInt(process.env.UPDATE_INTERVAL, 10000, 1000); // Default: 10s, min: 1s
    this.forceUpdateInterval = parseEnvInt(process.env.FORCE_UPDATE_INTERVAL, 300000, 10000); // Default: 5min, min: 10s
    this.lastForceUpdate = 0;
  }

  /**
   * Start the application
   */
  async start() {
    console.log('Discord Status Fusion v1.0');
    console.log('Starting application...');

    // Connect to Discord
    await this.connectDiscord();

    // Start the update loop
    this.startUpdateLoop();

    console.log('Discord Status Fusion is running');
    console.log('AI-powered status generation active');

    // Start spinner to show app is running (only in TTY mode)
    this.spinner.start('Running');
  }

  /**
   * Connect to Discord RPC with exponential backoff
   * @param {number} retryCount - Current retry attempt number
   */
  async connectDiscord(retryCount = 0) {
    const clientId = process.env.DISCORD_CLIENT_ID;

    console.log(`Connecting to Discord (Client ID: ${clientId})...`);

    return new Promise((resolve, reject) => {
      this.discord.on('ready', () => {
        console.log('Connected to Discord RPC');
        this.reconnectAttempts = 0; // Reset on successful connection
        resolve();
      });

      this.discord.on('disconnected', () => {
        console.log('Discord disconnected, attempting to reconnect...');
        this.reconnectWithBackoff();
      });

      this.discord.login({ clientId }).catch((error) => {
        if (retryCount < this.maxReconnectAttempts) {
          console.log(`Connection failed, will retry... (attempt ${retryCount + 1}/${this.maxReconnectAttempts})`);
          this.reconnectWithBackoff(retryCount);
        } else {
          reject(error);
        }
      });
    });
  }

  /**
   * Reconnect to Discord with exponential backoff
   * @param {number} retryCount - Current retry attempt number
   */
  reconnectWithBackoff(retryCount = 0) {
    if (retryCount >= this.maxReconnectAttempts) {
      console.error(`Failed to reconnect after ${this.maxReconnectAttempts} attempts`);
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
    const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
    console.log(`Reconnecting in ${delay / 1000}s (attempt ${retryCount + 1}/${this.maxReconnectAttempts})...`);

    setTimeout(() => {
      // Create new client for reconnection
      this.discord = new DiscordRPC.Client({ transport: 'ipc' });
      this.connectDiscord(retryCount + 1).catch((error) => {
        console.error(`[ERROR] Reconnection failed after ${this.maxReconnectAttempts} attempts:`, error.message);
      });
    }, delay);
  }

  /**
   * Start the main update loop
   */
  startUpdateLoop() {
    console.log(`Starting update loop (interval: ${this.updateInterval / 1000}s, forced refresh: ${this.forceUpdateInterval / 60000}min)`);

    // Initial update
    this.updateStatus();

    // Reset any previous timer before scheduling
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }

    // Schedule regular updates
    this.updateTimer = setInterval(() => {
      this.updateStatus();
    }, this.updateInterval);
  }

  /**
   * Check if apps or music have changed
   * @param {string[]} apps - Current apps
   * @param {string|null} music - Current music
   * @returns {boolean} True if anything changed
   */
  hasAppsOrMusicChanged(apps, music) {
    // Check if app list changed
    const appsChanged = JSON.stringify(apps.sort()) !== JSON.stringify(this.lastApps.sort());

    // Check if music changed
    const musicChanged = music !== this.lastMusic;

    return appsChanged || musicChanged;
  }

  /**
   * Update Discord status using AI (when apps/music change or forced refresh)
   */
  async updateStatus() {
    if (this.isUpdating) {
      log('[SKIP]', 'Status update already in progress', 'verbose');
      return;
    }

    this.isUpdating = true;

    try {
      // Get current state
      const apps = await this.detector.getInterestingApps();
      const music = await this.music.getCurrentMusic();

      // Debug music detection
      log('[MUSIC]', `Music detection result: ${music === null ? 'No music playing' : music}`, 'verbose');

      // Check if we need to force an update (every 5 minutes)
      const now = Date.now();
      const timeSinceLastForce = now - this.lastForceUpdate;
      const needsForceUpdate = timeSinceLastForce >= this.forceUpdateInterval;

      // Update if apps/music changed OR if it's time for forced refresh
      if (this.hasAppsOrMusicChanged(apps, music) || needsForceUpdate) {
        this.spinner.stop();

        if (needsForceUpdate) {
          console.log('Forced refresh (5 minutes elapsed), updating status...');
          this.lastForceUpdate = now;
        } else {
          console.log('Apps or music changed, generating new status...');
        }

        // Generate status with AI
        const status = await this.llm.generateStatus(apps, music);

        // Update Discord and cache the new state
        await this.discord.setActivity(status);
        this.lastStatus = status;
        this.lastApps = [...apps];
        this.lastMusic = music;

        console.log(`Updated Discord status: ${status.details}`);
        if (status.state && status.state !== 'Idle') {
          console.log(`   -> ${status.state}`);
        }

        // Restart spinner
        this.spinner.start('Running');
      } else {
        log('[SKIP]', 'No changes detected, skipping LLM call', 'verbose');
      }
    } catch (error) {
      console.error('[ERROR] Error updating status:', error.message);
    } finally {
      this.isUpdating = false;
      if (!this.spinner.isSpinning && !isVerboseMode && isTTY) {
        this.spinner.start('Running');
      }
    }
  }

}

// Validate configuration before starting
if (!validateConfig()) {
  process.exit(1);
}

// Start the application
const app = new DiscordStatusFusion();
app.start().catch(error => {
  console.error('[FATAL] Failed to start Discord Status Fusion:', error.message);
  process.exit(1);
});

// Global error handlers to catch unexpected errors
process.on('unhandledRejection', (reason, _promise) => {
  console.error('[ERROR] Unhandled Promise Rejection:', reason);
  // Don't exit - try to continue running
});

process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught Exception:', error.message);
  console.error(error.stack);
  // Clean up and exit for uncaught exceptions
  if (app) {
    if (app.spinner) app.spinner.stop();
    if (app.updateTimer) clearInterval(app.updateTimer);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  if (app) {
    if (app.spinner) {
      app.spinner.stop();
    }
    if (app.updateTimer) {
      clearInterval(app.updateTimer);
      app.updateTimer = null;
    }
  }
  console.log('\nShutting down Discord Status Fusion...');
  process.exit(0);
});
