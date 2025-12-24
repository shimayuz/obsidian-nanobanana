/**
 * API Client Factory - 接続モードに応じて適切なクライアントを返す
 */

import type { PluginSettings } from '../types';
import { DirectApiClient } from './direct-api-client';
import { ProxyClient } from './proxy-client';

/** APIクライアントの抽象インターフェース */
export interface ApiClient {
  generatePlan(parsed: any, settings: PluginSettings): Promise<any>;
  generateImage(prompt: string, settings: PluginSettings, onProgress?: any): Promise<ArrayBuffer>;
}

/**
 * 接続モードに応じたAPIクライアントを生成
 */
export function createApiClient(settings: PluginSettings): ApiClient {
  switch (settings.connectionMode) {
    case 'direct':
      return new DirectApiClient(settings);
    case 'proxy':
      return new ProxyClient(settings);
    default:
      throw new Error(`Unknown connection mode: ${settings.connectionMode}`);
  }
}
