/**
 * LLM Client for Discord Status Generation
 * Uses Gemini 2.5 Flash-Lite Preview for ultra-fast, intelligent status creation
 */
class LLMClient {
  constructor() {
    this.apiKey = null;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';
    this.keyLoaded = false;
    this.lastCallTime = 0;
    this.minCallInterval = 2000; // Minimum 2 seconds between API calls
    this.fetchFn = typeof globalThis.fetch === 'function' ? (...args) => globalThis.fetch(...args) : null;
  }

  /**
   * Ensure a fetch implementation is available in Node.js environments.
   */
  async ensureFetch() {
    if (!this.fetchFn) {
      const { default: fetch } = await import('node-fetch');
      this.fetchFn = fetch;
    }
    return this.fetchFn;
  }

  /**
   * Load API key from system keychain securely (cross-platform)
   */
  async loadApiKey() {
    if (this.keyLoaded) return;

    try {
      const { execFile } = require('child_process');
      const { promisify } = require('util');
      const execFileAsync = promisify(execFile);

      let result;
      switch (process.platform) {
      case 'darwin': // macOS
        try {
          result = await execFileAsync('security', [
            'find-generic-password',
            '-s', 'GOOGLE_AI_API_KEY',
            '-w'
          ]);
          this.apiKey = result.stdout.trim();
        } catch (error) {
          if (error.code === 44) {
            // Item not found in keychain
            console.warn('[WARN] GOOGLE_AI_API_KEY not found in macOS keychain');
            console.warn('[WARN] Run: security add-generic-password -s "GOOGLE_AI_API_KEY" -a "$(whoami)" -w "your-key"');
          } else {
            console.warn('[WARN] Failed to access macOS keychain:', error.message);
          }
        }
        break;

      case 'win32': // Windows
        try {
          // Windows credential retrieval is more complex, using PowerShell
          result = await execFileAsync('powershell', [
            '-Command',
            '(Get-StoredCredential -Target GOOGLE_AI_API_KEY).GetNetworkCredential().Password'
          ]);
          this.apiKey = result.stdout.trim();
        } catch (error) {
          console.warn('[WARN] GOOGLE_AI_API_KEY not found in Windows Credential Manager');
          console.warn('[WARN] Run: cmdkey /add:GOOGLE_AI_API_KEY /user:discord-status-fusion /pass:your-key');
        }
        break;

      case 'linux': // Linux
        try {
          result = await execFileAsync('secret-tool', [
            'lookup',
            'service', 'GOOGLE_AI_API_KEY',
            'username', 'discord-status-fusion'
          ]);
          this.apiKey = result.stdout.trim();
        } catch (error) {
          console.warn('[WARN] GOOGLE_AI_API_KEY not found in Linux secret storage');
          console.warn('[WARN] Run: secret-tool store --label="Google AI API Key" service "GOOGLE_AI_API_KEY" username "discord-status-fusion"');
        }
        break;

      default:
        console.error('[ERROR] Unsupported platform for keychain access:', process.platform);
      }

      this.keyLoaded = true;

      if (this.apiKey) {
        console.log(`[INFO] API key loaded from ${process.platform} keychain`);
      } else {
        console.warn('[WARN] No API key available, using fallback status generation');
      }
    } catch (error) {
      console.error('[ERROR] Unexpected error loading API key:', error.message);
      this.keyLoaded = true;
    }
  }

  /**
   * Generate Discord status using LLM
   * @param {string[]} apps - Array of running application names
   * @param {string|null} music - Current music playing or null
   * @returns {Promise<Object>} Discord status object
   */
  async generateStatus(apps, music) {
    await this.loadApiKey();

    if (!this.apiKey) {
      return this.fallbackStatus(apps, music);
    }

    // Rate limiting - don't call API too frequently
    const now = Date.now();
    if (now - this.lastCallTime < this.minCallInterval) {
      // Use fallback if called too recently
      return this.fallbackStatus(apps, music);
    }

    try {
      const prompt = this.buildPrompt(apps, music);
      const response = await this.callGemini(prompt);
      this.lastCallTime = now;
      return this.parseResponse(response);
    } catch (error) {
      console.error('[ERROR] LLM error:', error.message);
      if (error.message.includes('429')) {
        console.warn('[WARN] Rate limited - using fallback');
      }
      return this.fallbackStatus(apps, music);
    }
  }

  /**
   * Build the prompt for the LLM
   * @param {string[]} apps - Running applications
   * @param {string|null} music - Current music
   * @returns {string} Formatted prompt
   */
  buildPrompt(apps, music) {
    const appsText = apps.length > 0 ? apps.join(', ') : 'No applications detected';

    return `Create a Discord status from these apps: ${appsText}

Rules:
- Include ALL apps listed above
- Rename: "stable" to "Warp", "code" to "VS Code"
- Format: "Using App1 + App2 + App3"

Reply with exactly:
Line1: Using [all apps with + between them]
Line2: ${music !== 'No music playing' ? '# ' + music : 'Working on projects'}`;
  }

  /**
   * Call Gemini API
   * @param {string} prompt - The prompt to send
   * @returns {Promise<string>} LLM response
   */
  async callGemini(prompt) {
    const fetch = await this.ensureFetch();
    const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.0,  // Maximum consistency
          maxOutputTokens: 500,
          topP: 0.1  // Less randomness
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.candidates || !data.candidates[0]) {
      throw new Error('No candidates in API response');
    }

    const candidate = data.candidates[0];

    // Check if response was truncated
    if (candidate.finishReason === 'MAX_TOKENS') {
      throw new Error('Response truncated - increase maxOutputTokens');
    }

    if (!candidate.content || !candidate.content.parts || !candidate.content.parts[0]) {
      throw new Error('No content parts in response');
    }

    return candidate.content.parts[0].text || '';
  }

  /**
   * Parse LLM response into Discord status format
   * @param {string} response - Raw LLM response
   * @returns {Object} Discord status object
   */
  parseResponse(response) {
    try {
      const lines = response.split('\n').filter(line => line.trim());

      let details = 'Discord Status Fusion';
      let state = 'AI-powered status';

      for (const line of lines) {
        if (line.toLowerCase().includes('line1:')) {
          details = line.replace(/line1:\s*/i, '').trim();
        } else if (line.toLowerCase().includes('line2:')) {
          state = line.replace(/line2:\s*/i, '').trim();
        }
      }

      return {
        details: this.truncateText(details, 128),
        state: this.truncateText(state, 128),
        largeImageKey: 'fusion_idle',
        largeImageText: 'Discord Status Fusion',
        smallImageKey: 'active',
        smallImageText: 'AI-Generated',
        startTimestamp: Date.now()
      };
    } catch (error) {
      console.error('[ERROR] Failed to parse LLM response:', error.message);
      return this.fallbackStatus([], null);
    }
  }

  /**
   * Fallback status when LLM is unavailable
   * @param {string[]} apps - Running applications
   * @param {string|null} music - Current music
   * @returns {Object} Discord status object
   */
  fallbackStatus(apps, music) {
    // Simple fallback status when LLM is unavailable
    const details = 'Discord Status Fusion';
    let state = 'LLM temporarily unavailable';

    if (music) {
      state = `# ${music}`;
    }

    return {
      details: this.truncateText(details, 128),
      state: this.truncateText(state, 128),
      largeImageKey: 'fusion_idle',
      largeImageText: 'Discord Status Fusion',
      smallImageKey: 'active',
      smallImageText: 'Fallback Mode',
      startTimestamp: Date.now()
    };
  }

  /**
   * Truncate text to fit Discord limits
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated text
   */
  truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
}

module.exports = LLMClient;
