/**
 * Obsidian Gemini Summary Images Plugin
 * 共有API型定義（プラグイン ⇔ プロキシ）
 *
 * 画像生成: kie.ai API (nano-banana-pro) を使用
 * 方式: ポーリング（Obsidianローカル環境のためCallback不可）
 */

// ===== 共通型 =====

/** 画像スタイルプリセット */
export type ImageStyle =
  | 'infographic'  // インフォグラフィック（データ可視化）
  | 'diagram'      // 図解（フローチャート、構造図）
  | 'card'         // 要点カード（ポイント箇条書き）
  | 'whiteboard'   // ホワイトボード風（手書き風）
  | 'slide';       // スライド風（プレゼン調）

/** アスペクト比（kie.ai対応） */
export type AspectRatio = '16:9' | '4:3' | '1:1' | '9:16' | '3:4';

/** 解像度（kie.ai対応） */
export type Resolution = '1K' | '2K' | '4K';

/** 出力フォーマット */
export type OutputFormat = 'png' | 'jpg' | 'webp';

/** 対応言語 */
export type Language = 'ja' | 'en';

// ===== Plan API =====

/** Plan生成リクエスト */
export interface PlanRequest {
  /** ノート本文（または圧縮版） */
  noteContent: string;

  /** 生成設定 */
  settings: PlanSettings;
}

export interface PlanSettings {
  /** 生成する画像枚数（最大値、実際は見出し数による） */
  imageCount: number;

  /** 画像スタイル */
  style: ImageStyle;

  /** 出力言語 */
  language: Language;
}

/** Plan生成レスポンス */
export interface PlanResponse {
  /** APIバージョン */
  version: '1';

  /** 生成された画像計画 */
  items: PlanItem[];

  /** メタデータ */
  metadata: PlanMetadata;
}

export interface PlanItem {
  /** 一意ID（img1, img2, ...） */
  id: string;

  /** 画像タイトル（UI表示用） */
  title: string;

  /** 挿入位置（見出しテキスト、例: "# はじめに"） */
  afterHeading: string;

  /** 画像生成プロンプト */
  prompt: string;

  /** 画像の説明（alt属性用） */
  description: string;
}

export interface PlanMetadata {
  /** 入力ノートのハッシュ（検証用） */
  noteHash: string;

  /** 生成日時（ISO8601） */
  generatedAt: string;
}

// ===== Image API（kie.ai ポーリング方式） =====

/**
 * 画像生成タスク作成リクエスト
 * POST /v1/image/create
 */
export interface ImageCreateRequest {
  /** 画像生成プロンプト */
  prompt: string;

  /** 画像スタイル（プロンプト修飾に使用） */
  style: ImageStyle;

  /** アスペクト比（省略時: 1:1） */
  aspectRatio?: AspectRatio;

  /** 解像度（省略時: 1K） */
  resolution?: Resolution;

  /** 出力フォーマット（省略時: png） */
  outputFormat?: OutputFormat;
}

/**
 * 画像生成タスク作成レスポンス
 */
export interface ImageCreateResponse {
  /** kie.ai ジョブID */
  jobId: string;

  /** 推定待機時間（秒） */
  estimatedWaitSeconds?: number;
}

/**
 * 画像生成ステータス確認レスポンス
 * GET /v1/image/status/:jobId
 */
export interface ImageStatusResponse {
  /** ジョブID */
  jobId: string;

  /** ステータス */
  status: JobStatus;

  /** 完了時: 画像URL */
  imageUrl?: string;

  /** 失敗時: エラーメッセージ */
  errorMessage?: string;

  /** 進捗（0-100） */
  progress?: number;
}

export type JobStatus =
  | 'pending'     // キュー待ち
  | 'processing'  // 処理中
  | 'completed'   // 完了
  | 'failed';     // 失敗

// ===== kie.ai API 内部型（プロキシ側で使用） =====

/** kie.ai createTask リクエスト */
export interface KieCreateTaskRequest {
  model: 'nano-banana-pro';
  input: {
    prompt: string;
    aspect_ratio: string;
    resolution: Resolution;
    output_format: OutputFormat;
  };
  // callBackUrl は省略（Obsidianローカル環境では使用不可）
}

/** kie.ai createTask レスポンス */
export interface KieCreateTaskResponse {
  job_id: string;
  status?: string;
}

/** kie.ai ジョブステータス レスポンス */
export interface KieJobStatusResponse {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  output?: {
    image_url: string;
  };
  error?: {
    message: string;
  };
  progress?: number;
}

// ===== エラー =====

/** エラーレスポンス */
export interface ErrorResponse {
  error: {
    /** エラーコード */
    code: ErrorCode;

    /** 人間可読メッセージ */
    message: string;

    /** 追加情報（デバッグ用） */
    details?: unknown;

    /** リトライ可能か */
    retryable?: boolean;

    /** リトライまでの秒数（429時） */
    retryAfter?: number;
  };
}

export type ErrorCode =
  | 'UNAUTHORIZED'        // 401: 認証失敗
  | 'RATE_LIMITED'        // 429: レート制限
  | 'QUOTA_EXCEEDED'      // 429: クォータ超過（日次上限）
  | 'INVALID_REQUEST'     // 400: 不正リクエスト
  | 'NOTE_TOO_LARGE'      // 400: ノートサイズ超過
  | 'JOB_NOT_FOUND'       // 404: ジョブが見つからない
  | 'GENERATION_FAILED'   // 500: 生成失敗
  | 'MODEL_UNAVAILABLE'   // 503: モデル利用不可
  | 'SERVICE_UNAVAILABLE' // 503: サービス利用不可
  | 'TIMEOUT';            // 408: タイムアウト

// ===== 制限値（定数） =====

export const API_LIMITS = {
  /** ノート本文の最大文字数 */
  MAX_NOTE_CHARACTERS: 50_000,

  /** 最大セクション数 */
  MAX_SECTIONS: 20,

  /** 1ノートあたりの最大画像枚数 */
  MAX_IMAGES_PER_NOTE: 8,

  /** Plan APIレート制限（回/分） */
  PLAN_RATE_LIMIT_PER_MINUTE: 10,

  /** Image APIレート制限（回/分） */
  IMAGE_RATE_LIMIT_PER_MINUTE: 20,

  /** Image APIレート制限（回/日） */
  IMAGE_RATE_LIMIT_PER_DAY: 100,

  /** ポーリング設定 */
  POLLING: {
    /** ポーリング間隔（ミリ秒） */
    INTERVAL_MS: 5000,
    /** 最大試行回数（5秒 × 60回 = 5分） */
    MAX_ATTEMPTS: 60,
  },
} as const;

// ===== ユーティリティ型 =====

/** APIレスポンス（成功 or エラー） */
export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: ErrorResponse['error'] };
