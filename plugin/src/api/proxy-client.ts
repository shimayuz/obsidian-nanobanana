/**
 * プロキシサーバーとの通信クライアント
 *
 * 画像生成: kie.ai (nano-banana-pro) ポーリング方式
 * - POST /v1/image/create → job_id を取得
 * - GET /v1/image/status/:jobId → ステータス確認（ポーリング）
 * - 完了時: imageUrl から画像をダウンロード
 */

import { requestUrl, RequestUrlResponse } from 'obsidian';
import type {
  PlanRequest,
  PlanResponse,
  ImageCreateRequest,
  ImageCreateResponse,
  ImageStatusResponse,
  ErrorResponse,
} from '../../../shared/api-types';
import type { PluginSettings, ParsedNote } from '../types';

/** ポーリング設定 */
const POLLING_INTERVAL_MS = 5000;  // 5秒間隔
const POLLING_MAX_ATTEMPTS = 60;   // 最大60回（5分）

/** 進捗コールバック */
export type ProgressCallback = (progress: {
  status: string;
  message: string;
  progress?: number;
}) => void;

export class ProxyClient {
  private baseUrl: string;
  private token: string;

  constructor(settings: PluginSettings) {
    this.baseUrl = settings.proxyUrl.replace(/\/$/, '');
    this.token = settings.proxyToken;
  }

  /**
   * Plan生成APIを呼び出す
   */
  async generatePlan(parsed: ParsedNote, settings: PluginSettings): Promise<PlanResponse> {
    const compressedContent = this.compressContent(parsed, settings.maxCharacters);

    const request: PlanRequest = {
      noteContent: compressedContent,
      settings: {
        imageCount: settings.maxImageCount,
        style: settings.imageStyle,
        language: settings.language,
      },
    };

    const response = await this.post<PlanResponse>('/v1/plan', request);
    return response;
  }

  /**
   * 画像生成（ポーリング方式）
   * 完了まで待機し、画像のArrayBufferを返す
   */
  async generateImage(
    prompt: string,
    settings: PluginSettings,
    onProgress?: ProgressCallback
  ): Promise<ArrayBuffer> {
    // 1. タスク作成
    onProgress?.({ status: 'creating', message: 'Creating image task...' });

    const createRequest: ImageCreateRequest = {
      prompt,
      style: settings.imageStyle,
      aspectRatio: settings.aspectRatio,
      resolution: '1K',
      outputFormat: 'png',
    };

    const createResponse = await this.post<ImageCreateResponse>(
      '/v1/image/create',
      createRequest
    );

    const { jobId } = createResponse;

    // 2. ポーリングで完了を待つ
    const imageUrl = await this.pollForCompletion(jobId, onProgress);

    // 3. 画像をダウンロード
    onProgress?.({ status: 'downloading', message: 'Downloading image...' });
    const imageData = await this.downloadImage(imageUrl);

    return imageData;
  }

  /**
   * ジョブ完了をポーリングで待機
   */
  private async pollForCompletion(
    jobId: string,
    onProgress?: ProgressCallback
  ): Promise<string> {
    for (let attempt = 0; attempt < POLLING_MAX_ATTEMPTS; attempt++) {
      const status = await this.get<ImageStatusResponse>(
        `/v1/image/status/${jobId}`
      );

      onProgress?.({
        status: status.status,
        message: this.getStatusMessage(status.status),
        progress: status.progress,
      });

      if (status.status === 'completed') {
        if (!status.imageUrl) {
          throw new ProxyError('GENERATION_FAILED', 'No image URL in completed response');
        }
        return status.imageUrl;
      }

      if (status.status === 'failed') {
        throw new ProxyError(
          'GENERATION_FAILED',
          status.errorMessage || 'Image generation failed'
        );
      }

      // 待機
      await this.sleep(POLLING_INTERVAL_MS);
    }

    throw new ProxyError('TIMEOUT', `Image generation timed out after ${POLLING_MAX_ATTEMPTS * POLLING_INTERVAL_MS / 1000} seconds`);
  }

  /**
   * 画像をダウンロード
   */
  private async downloadImage(url: string): Promise<ArrayBuffer> {
    try {
      const response = await requestUrl({
        url,
        method: 'GET',
      });

      if (response.status >= 400) {
        throw new ProxyError('GENERATION_FAILED', `Failed to download image: ${response.status}`);
      }

      return response.arrayBuffer;
    } catch (error) {
      if (error instanceof ProxyError) throw error;
      throw new ProxyError('NETWORK_ERROR', `Failed to download image: ${error}`);
    }
  }

  /**
   * ステータスメッセージを取得
   */
  private getStatusMessage(status: string): string {
    switch (status) {
      case 'pending':
        return 'Waiting in queue...';
      case 'processing':
        return 'Generating image...';
      case 'completed':
        return 'Image generated!';
      case 'failed':
        return 'Generation failed';
      default:
        return `Status: ${status}`;
    }
  }

  /**
   * ノート内容を圧縮してトークンを節約
   */
  private compressContent(parsed: ParsedNote, maxChars: number): string {
    // frontmatterを除外した内容
    let content = parsed.rawContent;

    // frontmatter除去
    content = content.replace(/^---[\s\S]*?---\n/, '');

    // コードブロックを圧縮
    content = content.replace(
      /```(\w+)?\n[\s\S]*?```/g,
      (_match, lang) => `[code block: ${lang || 'code'}]`
    );

    // 長すぎる場合はセクションごとに圧縮
    if (content.length > maxChars) {
      const charPerSection = Math.floor(maxChars / parsed.sections.length);
      content = parsed.sections
        .map((section) => {
          const sectionContent = section.content.slice(0, charPerSection);
          return `${section.heading}\n${sectionContent}${section.content.length > charPerSection ? '...' : ''}`;
        })
        .join('\n\n');
    }

    // 最終トリミング
    if (content.length > maxChars) {
      content = content.slice(0, maxChars) + '\n\n[truncated]';
    }

    return content;
  }

  /**
   * JSON GETリクエスト
   */
  private async get<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await requestUrl({
        url,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (response.status >= 400) {
        throw this.handleErrorResponse(response);
      }

      return response.json as T;
    } catch (error) {
      if (error instanceof ProxyError) {
        throw error;
      }
      throw new ProxyError('NETWORK_ERROR', `Network error: ${error}`);
    }
  }

  /**
   * JSON POSTリクエスト
   */
  private async post<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await requestUrl({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(body),
      });

      if (response.status >= 400) {
        throw this.handleErrorResponse(response);
      }

      return response.json as T;
    } catch (error) {
      if (error instanceof ProxyError) {
        throw error;
      }
      throw new ProxyError('NETWORK_ERROR', `Network error: ${error}`);
    }
  }

  /**
   * エラーレスポンスを処理
   */
  private handleErrorResponse(response: RequestUrlResponse): ProxyError {
    try {
      const errorBody = response.json as ErrorResponse;
      return new ProxyError(
        errorBody.error.code,
        errorBody.error.message,
        errorBody.error.retryable,
        errorBody.error.retryAfter
      );
    } catch {
      return new ProxyError(
        'UNKNOWN_ERROR',
        `HTTP ${response.status}: ${response.text || 'Unknown error'}`
      );
    }
  }

  /**
   * スリープ
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * プロキシエラークラス
 */
export class ProxyError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable = false,
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'ProxyError';
  }
}
