// Shared API types between plugin and proxy

export interface GeminiRequest {
  image: string; // base64 encoded image
  mimeType: string;
  prompt?: string;
}

export interface GeminiResponse {
  success: boolean;
  summary?: string;
  error?: string;
}

export interface ProxyConfig {
  apiKey: string;
  model?: string;
}

export interface ImageAnalysisResult {
  summary: string;
  timestamp: number;
  model: string;
}

export const DEFAULT_PROMPT = "この画像を詳細に説明してください。画像に含まれるテキスト、オブジェクト、シーン、重要な詳細を含めてください。";

export const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
] as const;

export type SupportedMimeType = typeof SUPPORTED_MIME_TYPES[number];
