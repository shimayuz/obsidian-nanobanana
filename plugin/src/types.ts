// Plugin-specific types

export interface GeminiPluginSettings {
  apiKey: string;
  proxyUrl: string;
  useProxy: boolean;
  model: string;
  defaultPrompt: string;
  autoSummarize: boolean;
  insertPosition: 'above' | 'below';
  showNotifications: boolean;
  maxImageSize: number; // in MB
}

export const DEFAULT_SETTINGS: GeminiPluginSettings = {
  apiKey: '',
  proxyUrl: '',
  useProxy: false,
  model: 'gemini-2.0-flash',
  defaultPrompt: 'この画像を詳細に説明してください。画像に含まれるテキスト、オブジェクト、シーン、重要な詳細を含めてください。',
  autoSummarize: false,
  insertPosition: 'below',
  showNotifications: true,
  maxImageSize: 10
};

export interface ImageInfo {
  path: string;
  name: string;
  extension: string;
  mimeType: string;
  base64?: string;
}

export interface SummaryCache {
  [imagePath: string]: {
    summary: string;
    timestamp: number;
    model: string;
  };
}
