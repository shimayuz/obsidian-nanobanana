import { requestUrl, RequestUrlParam } from 'obsidian';
import { GeminiPluginSettings } from '../types';

export interface GeminiApiResponse {
  success: boolean;
  summary?: string;
  error?: string;
}

export class GeminiClient {
  private settings: GeminiPluginSettings;

  constructor(settings: GeminiPluginSettings) {
    this.settings = settings;
  }

  updateSettings(settings: GeminiPluginSettings): void {
    this.settings = settings;
  }

  async summarizeImage(base64Image: string, mimeType: string, prompt?: string): Promise<GeminiApiResponse> {
    const effectivePrompt = prompt || this.settings.defaultPrompt;

    if (this.settings.useProxy && this.settings.proxyUrl) {
      return this.callViaProxy(base64Image, mimeType, effectivePrompt);
    } else {
      return this.callDirectly(base64Image, mimeType, effectivePrompt);
    }
  }

  private async callDirectly(base64Image: string, mimeType: string, prompt: string): Promise<GeminiApiResponse> {
    if (!this.settings.apiKey) {
      return { success: false, error: 'API key is not configured' };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.settings.model}:generateContent?key=${this.settings.apiKey}`;

    const requestBody = {
      contents: [{
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Image
            }
          }
        ]
      }]
    };

    try {
      const response = await requestUrl({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (response.status !== 200) {
        return {
          success: false,
          error: `API error: ${response.status} - ${response.text}`
        };
      }

      const data = response.json;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        return { success: false, error: 'No response from Gemini API' };
      }

      return { success: true, summary: text };
    } catch (error) {
      return {
        success: false,
        error: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async callViaProxy(base64Image: string, mimeType: string, prompt: string): Promise<GeminiApiResponse> {
    if (!this.settings.proxyUrl) {
      return { success: false, error: 'Proxy URL is not configured' };
    }

    try {
      const response = await requestUrl({
        url: `${this.settings.proxyUrl}/api/summarize`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.settings.apiKey ? { 'X-API-Key': this.settings.apiKey } : {})
        },
        body: JSON.stringify({
          image: base64Image,
          mimeType,
          prompt,
          model: this.settings.model
        })
      });

      if (response.status !== 200) {
        return {
          success: false,
          error: `Proxy error: ${response.status} - ${response.text}`
        };
      }

      return response.json as GeminiApiResponse;
    } catch (error) {
      return {
        success: false,
        error: `Proxy request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async testConnection(): Promise<GeminiApiResponse> {
    // Simple test with a small request
    const testPrompt = 'Reply with "OK" if you can read this.';

    if (this.settings.useProxy && this.settings.proxyUrl) {
      try {
        const response = await requestUrl({
          url: `${this.settings.proxyUrl}/api/health`,
          method: 'GET'
        });
        return {
          success: response.status === 200,
          summary: 'Proxy connection successful'
        };
      } catch (error) {
        return {
          success: false,
          error: `Proxy connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    } else {
      if (!this.settings.apiKey) {
        return { success: false, error: 'API key is not configured' };
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.settings.model}:generateContent?key=${this.settings.apiKey}`;

      try {
        const response = await requestUrl({
          url,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: testPrompt }]
            }]
          })
        });

        return {
          success: response.status === 200,
          summary: 'Direct API connection successful'
        };
      } catch (error) {
        return {
          success: false,
          error: `API connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }
  }
}
