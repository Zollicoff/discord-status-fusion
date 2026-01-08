const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

const LLMClient = require('../llm');

describe('LLMClient', () => {
  let client;

  beforeEach(() => {
    client = new LLMClient();
  });

  describe('constructor', () => {
    it('should initialize with correct defaults', () => {
      assert.strictEqual(client.apiKey, null);
      assert.strictEqual(client.keyLoaded, false);
      assert.strictEqual(client.minCallInterval, 2000);
    });

    it('should have correct base URL', () => {
      assert.ok(client.baseUrl.includes('gemini'));
      assert.ok(client.baseUrl.includes('generativelanguage.googleapis.com'));
    });
  });

  describe('error handling', () => {
    it('should return fallback status when API key is not loaded', async() => {
      client.keyLoaded = true; // Simulate key loading attempted
      client.apiKey = null; // But no key found

      const result = await client.generateStatus(['Cursor'], null);
      assert.strictEqual(result.details, 'Discord Status Fusion');
      assert.ok(result.state.includes('unavailable'));
    });

    it('should return fallback status when rate limited', async() => {
      client.keyLoaded = true;
      client.apiKey = 'test-key';
      client.lastCallTime = Date.now(); // Just called

      const result = await client.generateStatus(['Cursor'], null);
      // Should use fallback due to rate limiting
      assert.strictEqual(result.details, 'Discord Status Fusion');
    });

    it('should handle API errors gracefully', async() => {
      client.keyLoaded = true;
      client.apiKey = 'invalid-key';
      client.lastCallTime = 0; // Allow API call

      // Mock fetch to simulate API error
      client.fetchFn = async() => ({
        ok: false,
        status: 401
      });

      const result = await client.generateStatus(['Cursor'], null);
      // Should return fallback on API error
      assert.strictEqual(result.details, 'Discord Status Fusion');
    });

    it('should handle malformed API responses', async() => {
      client.keyLoaded = true;
      client.apiKey = 'test-key';
      client.lastCallTime = 0;

      // Mock fetch to return malformed response
      client.fetchFn = async() => ({
        ok: true,
        json: async() => ({ candidates: [] }) // Empty candidates
      });

      const result = await client.generateStatus(['Cursor'], null);
      // Should return fallback on malformed response
      assert.strictEqual(result.details, 'Discord Status Fusion');
    });

    it('should handle network errors gracefully', async() => {
      client.keyLoaded = true;
      client.apiKey = 'test-key';
      client.lastCallTime = 0;

      // Mock fetch to throw network error
      client.fetchFn = async() => {
        throw new Error('Network error');
      };

      const result = await client.generateStatus(['Cursor'], null);
      // Should return fallback on network error
      assert.strictEqual(result.details, 'Discord Status Fusion');
    });
  });

  describe('buildPrompt', () => {
    it('should include all apps in prompt', () => {
      const apps = ['Cursor', 'Chrome', 'Figma'];
      const prompt = client.buildPrompt(apps, null);

      assert.ok(prompt.includes('Cursor'));
      assert.ok(prompt.includes('Chrome'));
      assert.ok(prompt.includes('Figma'));
    });

    it('should handle empty apps array', () => {
      const prompt = client.buildPrompt([], null);
      assert.ok(prompt.includes('No applications detected'));
    });

    it('should include music when provided', () => {
      const prompt = client.buildPrompt(['Cursor'], 'Song by Artist on Spotify');
      assert.ok(prompt.includes('Song by Artist on Spotify'));
    });

    it('should show working message when no music', () => {
      const prompt = client.buildPrompt(['Cursor'], 'No music playing');
      assert.ok(prompt.includes('Working on projects'));
    });

    it('should include formatting rules', () => {
      const prompt = client.buildPrompt(['code'], null);
      assert.ok(prompt.includes('Rename'));
      assert.ok(prompt.includes('stable'));
      assert.ok(prompt.includes('Warp'));
      assert.ok(prompt.includes('VS Code'));
    });
  });

  describe('truncateText', () => {
    it('should not truncate short text', () => {
      const text = 'Short text';
      const result = client.truncateText(text, 128);
      assert.strictEqual(result, text);
    });

    it('should truncate long text with ellipsis', () => {
      const text = 'A'.repeat(150);
      const result = client.truncateText(text, 128);
      assert.strictEqual(result.length, 128);
      assert.ok(result.endsWith('...'));
    });

    it('should handle null input', () => {
      const result = client.truncateText(null, 128);
      assert.strictEqual(result, null);
    });

    it('should handle empty string', () => {
      const result = client.truncateText('', 128);
      assert.strictEqual(result, '');
    });
  });

  describe('parseResponse', () => {
    it('should parse valid LLM response', () => {
      const response = `Line1: Using Cursor + Chrome
Line2: Working on projects`;

      const result = client.parseResponse(response);

      assert.strictEqual(result.details, 'Using Cursor + Chrome');
      assert.strictEqual(result.state, 'Working on projects');
    });

    it('should handle case-insensitive line markers', () => {
      const response = `line1: Using VS Code
LINE2: Coding`;

      const result = client.parseResponse(response);

      assert.strictEqual(result.details, 'Using VS Code');
      assert.strictEqual(result.state, 'Coding');
    });

    it('should return default values for malformed response', () => {
      const response = 'Some random text without markers';
      const result = client.parseResponse(response);

      assert.strictEqual(result.details, 'Discord Status Fusion');
      assert.strictEqual(result.state, 'AI-powered status');
    });

    it('should include required Discord RPC fields', () => {
      const response = 'Line1: Test\nLine2: Test';
      const result = client.parseResponse(response);

      assert.ok(result.largeImageKey);
      assert.ok(result.largeImageText);
      assert.ok(result.smallImageKey);
      assert.ok(result.smallImageText);
      assert.ok(result.startTimestamp);
    });
  });

  describe('fallbackStatus', () => {
    it('should return valid status object', () => {
      const result = client.fallbackStatus([], null);

      assert.strictEqual(result.details, 'Discord Status Fusion');
      assert.ok(result.state);
      assert.ok(result.largeImageKey);
    });

    it('should include music when provided', () => {
      const result = client.fallbackStatus([], 'Song by Artist');
      assert.ok(result.state.includes('Song by Artist'));
    });

    it('should show unavailable message without music', () => {
      const result = client.fallbackStatus([], null);
      assert.ok(result.state.includes('unavailable'));
    });
  });
});
