const { buildDecisionPrompt, buildDecisionSchema } = require('./status-decision');
const { DEFAULTS } = require('../config');
const { SILENT_LOGGER } = require('../logger');

const DEFAULT_GEMINI_MODEL = DEFAULTS.geminiModel;
const REQUEST_TIMEOUT_MS = 10000;

class GeminiClient {
  constructor(options) {
    this.apiKeyProvider = options.apiKeyProvider;
    this.fetch = options.fetch || globalThis.fetch;
    this.logger = options.logger || SILENT_LOGGER;
    this.model = options.model || DEFAULT_GEMINI_MODEL;
    this.requestTimeoutMs = options.requestTimeoutMs || REQUEST_TIMEOUT_MS;
    this.signalFactory = options.signalFactory || (timeout => AbortSignal.timeout(timeout));
  }

  async generateDecision(context) {
    const apiKey = await this.apiKeyProvider.getApiKey();
    if (!apiKey) {
      return null;
    }
    if (typeof this.fetch !== 'function') {
      throw new Error('Fetch is unavailable in this Node.js runtime');
    }

    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const response = await this.fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: buildDecisionPrompt(context) }]
        }],
        generationConfig: {
          maxOutputTokens: 256,
          responseMimeType: 'application/json',
          responseSchema: buildDecisionSchema(context),
          temperature: 0.7,
          topP: 0.9
        }
      }),
      signal: this.signalFactory(this.requestTimeoutMs)
    });

    if (!response.ok) {
      const detail = await this.getErrorDetail(response);
      throw new Error(
        `Gemini API request failed with status ${response.status}${detail ? `: ${detail}` : ''}`
      );
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate?.content?.parts?.length) {
      throw new Error('Gemini API returned no decision content');
    }
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      throw new Error(`Gemini API stopped with reason ${candidate.finishReason}`);
    }

    const text = candidate.content.parts
      .map(part => part.text || '')
      .join('')
      .trim();
    try {
      const decision = JSON.parse(text);
      this.logger.debug(`Gemini decision generated with ${this.model}`);
      return decision;
    } catch {
      throw new Error('Gemini API returned invalid JSON');
    }
  }

  async getErrorDetail(response) {
    if (typeof response.json !== 'function') {
      return '';
    }
    try {
      const data = await response.json();
      const message = data?.error?.message;
      return typeof message === 'string' ?
        message.replace(/\s+/g, ' ').trim().slice(0, 300) :
        '';
    } catch {
      return '';
    }
  }
}

module.exports = {
  DEFAULT_GEMINI_MODEL,
  GeminiClient,
  REQUEST_TIMEOUT_MS
};
