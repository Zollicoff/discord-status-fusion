require('dotenv').config();

const ProcessDetector = require('./src/core/detector');
const MusicDetector = require('./src/core/music');
const LLMClient = require('./src/core/llm');
const DiscordRPC = require('discord-rpc');

/**
 * Discord Status Fusion v1.0
 * AI-powered Discord Rich Presence with intelligent status generation
 * Features smart change detection and professional app filtering
 */
class DiscordStatusFusion {
  constructor() {
    this.detector = new ProcessDetector();
    this.music = new MusicDetector();
    this.llm = new LLMClient();
    this.discord = new DiscordRPC.Client({ transport: 'ipc' });
    this.lastStatus = null;
    this.lastApps = [];
    this.lastMusic = null;
    this.updateInterval = 30000; // 30 seconds - optimized with change detection
  }

  /**
   * Start the application
   */
  async start() {
    console.log('🎮 Discord Status Fusion v1.0');
    console.log('🚀 Starting application...');

    // Connect to Discord
    await this.connectDiscord();

    // Start the update loop
    this.startUpdateLoop();

    console.log('✅ Discord Status Fusion is running!');
    console.log('🤖 AI-powered status generation active');
  }

  /**
   * Connect to Discord RPC
   */
  async connectDiscord() {
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!clientId) {
      throw new Error('DISCORD_CLIENT_ID not found in environment variables');
    }

    console.log(`🔌 Connecting to Discord (Client ID: ${clientId})...`);

    return new Promise((resolve, reject) => {
      this.discord.on('ready', () => {
        console.log('✅ Connected to Discord RPC');
        resolve();
      });

      this.discord.on('disconnected', () => {
        console.log('🔌 Discord disconnected, attempting to reconnect...');
        setTimeout(() => this.connectDiscord(), 5000);
      });

      this.discord.login({ clientId }).catch(reject);
    });
  }

  /**
   * Start the main update loop
   */
  startUpdateLoop() {
    console.log(`⏰ Starting update loop (interval: ${this.updateInterval / 1000}s)`);
    
    // Initial update
    this.updateStatus();

    // Schedule regular updates
    setInterval(() => {
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
   * Update Discord status using AI (only when apps/music change)
   */
  async updateStatus() {
    try {
      // Get current state
      const apps = await this.detector.getInterestingApps();
      const music = await this.music.getCurrentMusic();
      
      // Debug music detection
      console.log('🎵 Music detection result:', music === null ? 'No music playing' : music);

      // Only call LLM if apps or music changed
      if (this.hasAppsOrMusicChanged(apps, music)) {
        console.log('📱 Apps or music changed, generating new status...');
        
        // Generate status with AI
        const status = await this.llm.generateStatus(apps, music);

        // Update Discord and cache the new state
        await this.discord.setActivity(status);
        this.lastStatus = status;
        this.lastApps = [...apps];
        this.lastMusic = music;
        
        console.log(`🎯 Updated Discord status: ${status.details}`);
        if (status.state && status.state !== 'Idle') {
          console.log(`   └─ ${status.state}`);
        }
      } else {
        console.log('⏸️  No changes detected, skipping LLM call');
      }
    } catch (error) {
      console.error('❌ Error updating status:', error.message);
    }
  }

}

// Start the application
const app = new DiscordStatusFusion();
app.start().catch(error => {
  console.error('💥 Failed to start Discord Status Fusion:', error.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\\n👋 Shutting down Discord Status Fusion...');
  process.exit(0);
});