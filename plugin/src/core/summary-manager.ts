import { TFile, Vault, Notice } from 'obsidian';
import { GeminiClient } from '../api/gemini-client';
import { GeminiPluginSettings, SummaryCache } from '../types';
import { getImageInfo, isImageFile, validateImageSize } from '../utils/image-utils';

export class SummaryManager {
  private client: GeminiClient;
  private settings: GeminiPluginSettings;
  private vault: Vault;
  private cache: SummaryCache = {};

  constructor(vault: Vault, settings: GeminiPluginSettings) {
    this.vault = vault;
    this.settings = settings;
    this.client = new GeminiClient(settings);
  }

  updateSettings(settings: GeminiPluginSettings): void {
    this.settings = settings;
    this.client.updateSettings(settings);
  }

  async summarizeImage(file: TFile, customPrompt?: string): Promise<string> {
    if (!isImageFile(file)) {
      throw new Error('Not a supported image file');
    }

    // Check file size
    if (!validateImageSize(file.stat.size, this.settings.maxImageSize)) {
      throw new Error(`Image exceeds maximum size of ${this.settings.maxImageSize}MB`);
    }

    // Check cache first
    const cached = this.cache[file.path];
    if (cached && cached.model === this.settings.model) {
      return cached.summary;
    }

    if (this.settings.showNotifications) {
      new Notice('Analyzing image with Gemini...');
    }

    const imageInfo = await getImageInfo(this.vault, file);

    if (!imageInfo.base64) {
      throw new Error('Failed to read image');
    }

    const response = await this.client.summarizeImage(
      imageInfo.base64,
      imageInfo.mimeType,
      customPrompt
    );

    if (!response.success || !response.summary) {
      throw new Error(response.error || 'Failed to get summary from Gemini');
    }

    // Cache the result
    this.cache[file.path] = {
      summary: response.summary,
      timestamp: Date.now(),
      model: this.settings.model
    };

    if (this.settings.showNotifications) {
      new Notice('Image analysis complete!');
    }

    return response.summary;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    const result = await this.client.testConnection();
    return {
      success: result.success,
      message: result.success ? (result.summary || 'Connection successful') : (result.error || 'Connection failed')
    };
  }

  clearCache(): void {
    this.cache = {};
  }

  getCacheStats(): { count: number; oldestTimestamp: number | null } {
    const entries = Object.values(this.cache);
    if (entries.length === 0) {
      return { count: 0, oldestTimestamp: null };
    }

    const timestamps = entries.map(e => e.timestamp);
    return {
      count: entries.length,
      oldestTimestamp: Math.min(...timestamps)
    };
  }
}
