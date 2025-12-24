/**
 * プラグイン内部型定義
 */

import type { ImageStyle, AspectRatio, Language } from '../../shared/api-types';

/** プラグイン設定 */
export interface PluginSettings {
  // 接続モード
  connectionMode: 'direct' | 'proxy';
  
  // Direct APIモード用
  geminiApiKey: string;
  kieApiKey: string;
  
  // Proxyモード用
  proxyUrl: string;
  proxyToken: string;

  // 生成設定
  imageCount: 4 | 5;
  imageStyle: ImageStyle;
  aspectRatio: AspectRatio;
  language: Language;

  // 保存設定
  attachmentFolder: string;

  // 送信設定
  sendMode: SendMode;
  maxCharacters: number;

  // 安全設定
  createBackup: boolean;
  backupLocation: BackupLocation;
}

export type SendMode = 'full' | 'headings' | 'summary';
export type BackupLocation = 'plugin' | 'vault';

/** デフォルト設定 */
export const DEFAULT_SETTINGS: PluginSettings = {
  connectionMode: 'direct',  // デフォルトは直接API
  
  // Direct API用
  geminiApiKey: '',
  kieApiKey: '',
  
  // Proxy用
  proxyUrl: 'https://gemini-image-proxy.your-domain.workers.dev',
  proxyToken: '',

  imageCount: 4,
  imageStyle: 'infographic',
  aspectRatio: '16:9',
  language: 'ja',

  attachmentFolder: 'attachments/ai-summary',

  sendMode: 'headings',
  maxCharacters: 30000,

  createBackup: true,
  backupLocation: 'plugin',
};

/** 解析済みノート */
export interface ParsedNote {
  frontmatter: string | null;
  sections: Section[];
  rawContent: string;
}

export interface Section {
  heading: string;
  level: number;
  content: string;
  lineStart: number;
  lineEnd: number;
}

/** バックアップデータ */
export interface BackupData {
  noteId: string;
  originalContent: string;
  timestamp: number;
  injectedImages: string[];
}

/** バックアップストレージ（最大5件保持） */
export interface BackupStorage {
  backups: BackupData[];
}

/** 生成進捗状態 */
export interface GenerationProgress {
  phase: 'planning' | 'generating' | 'saving' | 'injecting' | 'done' | 'error';
  currentItem: number;
  totalItems: number;
  message: string;
}

/** 画像挿入マーカー */
export const AI_SUMMARY_MARKER = {
  START: (id: string, timestamp: string) =>
    `<!-- ai-summary:start id="${id}" generated="${timestamp}" -->`,
  END: (id: string) =>
    `<!-- ai-summary:end id="${id}" -->`,
  REGEX: {
    BLOCK: /<!-- ai-summary:start id="([^"]+)"[^>]*-->[\s\S]*?<!-- ai-summary:end id="\1" -->\n?/g,
    START: /<!-- ai-summary:start id="([^"]+)" generated="([^"]+)" -->/,
  },
};
