/**
 * kie.ai API サービス
 * nano-banana-pro モデルを使用した画像生成
 */

import type {
  ImageCreateRequest,
  ImageStyle,
  KieCreateTaskRequest,
  KieCreateTaskResponse,
  KieJobStatusResponse,
  JobStatus,
} from '../../../shared/api-types';

const KIE_API_BASE = 'https://api.kie.ai/api/v1';

// スタイル別プロンプト修飾
const STYLE_MODIFIERS: Record<ImageStyle, { prefix: string; suffix: string }> = {
  infographic: {
    prefix: 'Create a modern infographic visualization.',
    suffix: 'Use flat design, data-driven icons, clean color palette. Professional infographic style.',
  },
  diagram: {
    prefix: 'Create a clear conceptual diagram.',
    suffix: 'Use geometric shapes, connecting arrows, hierarchical layout. Minimal diagram style.',
  },
  card: {
    prefix: 'Create a summary card design.',
    suffix: 'Use bold visual hierarchy, icon grid, gradient background. Modern UI card style.',
  },
  whiteboard: {
    prefix: 'Create a hand-drawn whiteboard sketch.',
    suffix: 'Use loose sketchy lines, warm colors, informal doodle style. Educational whiteboard feel.',
  },
  slide: {
    prefix: 'Create a professional presentation slide design.',
    suffix: 'Use corporate color scheme, structured layout, subtle gradients. Business slide style.',
  },
};

export class KieAiService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * 画像生成タスクを作成
   * @returns job_id
   */
  async createImageTask(request: ImageCreateRequest): Promise<string> {
    const enhancedPrompt = this.enhancePrompt(request.prompt, request.style);

    const kieRequest: KieCreateTaskRequest = {
      model: 'nano-banana-pro',
      input: {
        prompt: enhancedPrompt,
        aspect_ratio: request.aspectRatio || '1:1',
        resolution: request.resolution || '1K',
        output_format: request.outputFormat || 'png',
      },
      // callBackUrl は省略（Obsidianローカル環境では使用不可）
    };

    const response = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(kieRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new KieAiError(
        `Failed to create task: ${response.status}`,
        response.status,
        errorText
      );
    }

    const data = await response.json() as KieCreateTaskResponse;

    if (!data.job_id) {
      throw new KieAiError('No job_id in response', 500);
    }

    return data.job_id;
  }

  /**
   * ジョブステータスを確認
   */
  async getJobStatus(jobId: string): Promise<{
    status: JobStatus;
    imageUrl?: string;
    errorMessage?: string;
    progress?: number;
  }> {
    const response = await fetch(`${KIE_API_BASE}/jobs/${jobId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new KieAiError('Job not found', 404);
      }
      const errorText = await response.text();
      throw new KieAiError(
        `Failed to get job status: ${response.status}`,
        response.status,
        errorText
      );
    }

    const data = await response.json() as KieJobStatusResponse;

    return {
      status: data.status,
      imageUrl: data.output?.image_url,
      errorMessage: data.error?.message,
      progress: data.progress,
    };
  }

  /**
   * スタイルに基づいてプロンプトを強化
   */
  private enhancePrompt(prompt: string, style: ImageStyle): string {
    const modifier = STYLE_MODIFIERS[style];
    return `${modifier.prefix}\n\n${prompt}\n\n${modifier.suffix}`;
  }
}

/**
 * kie.ai API エラー
 */
export class KieAiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: string
  ) {
    super(message);
    this.name = 'KieAiError';
  }

  isRateLimited(): boolean {
    return this.statusCode === 429;
  }

  isNotFound(): boolean {
    return this.statusCode === 404;
  }

  isServerError(): boolean {
    return this.statusCode >= 500;
  }
}
