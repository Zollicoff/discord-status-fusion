/**
 * LLM Client for Discord Status Generation
 * Uses Gemini 2.5 Flash-Lite Preview for ultra-fast, intelligent status creation
 */
class LLMClient {
  constructor() {
    this.apiKey = null;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent';
    this.keyLoaded = false;
    this.lastCallTime = 0;
    this.minCallInterval = 2000; // Minimum 2 seconds between API calls
  }

  /**
   * Load API key from system keychain securely (cross-platform)
   */
  async loadApiKey() {
    if (this.keyLoaded) return;
    
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      let command;
      switch (process.platform) {
        case 'darwin': // macOS
          command = 'security find-generic-password -s "GOOGLE_AI_API_KEY" -w 2>/dev/null';
          break;
        case 'win32': // Windows
          command = 'cmdkey /list | findstr "GOOGLE_AI_API_KEY" >nul && for /f "tokens=2 delims=:" %i in (\'cmdkey /list ^| findstr "GOOGLE_AI_API_KEY"\') do echo %i';
          break;
        case 'linux': // Linux
          command = 'secret-tool lookup service "GOOGLE_AI_API_KEY" username "discord-status-fusion" 2>/dev/null';
          break;
        default:
          throw new Error(`Unsupported platform: ${process.platform}`);
      }
      
      const { stdout } = await execAsync(command);
      this.apiKey = stdout.trim();
      this.keyLoaded = true;
      console.log(`🔑 API key loaded from ${process.platform} keychain`);
    } catch (error) {
      console.warn(`⚠️  No GOOGLE_AI_API_KEY found in ${process.platform} keychain, using fallback logic`);
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
      console.error('❌ LLM error:', error.message);
      if (error.message.includes('429')) {
        console.warn('⏳ Rate limited - using fallback');
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
    const musicText = music || 'No music playing';

    return `Generate Discord status from professional apps. Show exactly 4 apps when possible.

Professional apps detected: ${appsText}
Music: ${musicText}

Rules:
- Select exactly 4 most relevant apps from the professional apps list
- CRITICAL: NO DUPLICATE APPS - each app name must appear exactly once
- If less than 4 apps available, show all available apps (don't repeat any)
- Clean up app names: "stable" → "Warp", "zed" → "Zed", "code" → "VS Code", "Adobe Photoshop 2025" → "Photoshop", etc.
- Prioritize: Development tools > Office apps > Creative tools > Browsers  
- BE CONSISTENT - always pick the same apps for the same app list
- Line1: Using [app1] + [app2] + [app3] + [app4] (NO music apps here)
- Line2: If music detected → ♪ [exact music text], if "No music playing" → workflow description

Examples:
Professional apps: stable, zed, Microsoft Excel, Safari
Music: Song by Artist on Apple Music
→ Line1: Using Warp + Zed + Excel + Safari
→ Line2: ♪ Song by Artist on Apple Music

Professional apps: stable, Safari, Safari, Safari (duplicates detected)
Music: No music playing
→ Line1: Using Warp + Safari (NO DUPLICATES!)
→ Line2: Development workflow

Professional apps: Adobe Photoshop, Adobe Illustrator, Google Chrome, Figma
Music: No music playing
→ Line1: Using Photoshop + Illustrator + Chrome + Figma  
→ Line2: Creative design workflow

Respond exactly:
Line1: [your line]
Line2: [your line]`;
  }

  /**
   * Call Gemini API
   * @param {string} prompt - The prompt to send
   * @returns {Promise<string>} LLM response
   */
  async callGemini(prompt) {
    const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
          topP: 0.1,  // Less randomness
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
      console.error('❌ Failed to parse LLM response:', error.message);
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
    let details = 'Discord Status Fusion';
    let state = 'LLM temporarily unavailable';
    
    if (music) {
      state = `♪ ${music}`;
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