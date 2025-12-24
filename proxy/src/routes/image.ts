/**
 * 画像生成ルート（kie.ai ポーリング方式）
 *
 * POST /v1/image/create - タスク作成、job_idを返す
 * GET /v1/image/status/:jobId - ステータス確認
 */

import { Hono } from 'hono';
import { z } from 'zod';

import type { Env, Variables } from '../index';
import { KieAiService, KieAiError } from '../services/kie-ai';
import { RateLimiter } from '../services/rate-limiter';
import type {
  ImageCreateRequest,
  ImageCreateResponse,
  ImageStatusResponse,
  ErrorResponse,
} from '../../../shared/api-types';

// リクエストバリデーション
const ImageCreateRequestSchema = z.object({
  prompt: z.string().min(10).max(1000),
  style: z.enum(['infographic', 'diagram', 'card', 'whiteboard', 'slide']),
  aspectRatio: z.enum(['16:9', '4:3', '1:1', '9:16', '3:4']).optional().default('1:1'),
  resolution: z.enum(['1K', '2K', '4K']).optional().default('1K'),
  outputFormat: z.enum(['png', 'jpg', 'webp']).optional().default('png'),
});

export const imageRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * POST /create - 画像生成タスクを作成
 */
imageRoute.post('/create', async (c) => {
  // リクエストボディ取得
  const body = await c.req.json<ImageCreateRequest>();

  // バリデーション
  const parseResult = ImageCreateRequestSchema.safeParse(body);
  if (!parseResult.success) {
    const errorResponse: ErrorResponse = {
      error: {
        code: 'INVALID_REQUEST',
        message: 'Invalid request body',
        details: parseResult.error.errors,
      },
    };
    return c.json(errorResponse, 400);
  }

  const request = parseResult.data;

  // レート制限チェック
  const userId = c.get('userId') as string;
  const rateLimiter = new RateLimiter(c.env.RATE_LIMIT);

  const rateCheck = await rateLimiter.checkImageLimit(userId);
  if (!rateCheck.allowed) {
    const errorResponse: ErrorResponse = {
      error: {
        code: rateCheck.reason === 'daily' ? 'QUOTA_EXCEEDED' : 'RATE_LIMITED',
        message: rateCheck.reason === 'daily'
          ? 'Daily quota exceeded'
          : 'Rate limit exceeded',
        retryable: rateCheck.reason !== 'daily',
        retryAfter: rateCheck.retryAfter,
      },
    };
    return c.json(errorResponse, 429);
  }

  try {
    // kie.ai APIでタスク作成
    const kieAi = new KieAiService(c.env.KIE_API_KEY);
    const jobId = await kieAi.createImageTask(request);

    // レート制限カウンターを増加
    await rateLimiter.incrementImageCount(userId);

    // レスポンス
    const response: ImageCreateResponse = {
      jobId,
      estimatedWaitSeconds: 30, // nano-banana-proの平均処理時間
    };

    return c.json(response, 201);
  } catch (error) {
    console.error('Image task creation failed:', error);

    if (error instanceof KieAiError) {
      if (error.isRateLimited()) {
        const errorResponse: ErrorResponse = {
          error: {
            code: 'RATE_LIMITED',
            message: 'kie.ai API rate limit exceeded',
            retryable: true,
            retryAfter: 60,
          },
        };
        return c.json(errorResponse, 429);
      }

      if (error.isServerError()) {
        const errorResponse: ErrorResponse = {
          error: {
            code: 'MODEL_UNAVAILABLE',
            message: 'Image generation model is temporarily unavailable',
            retryable: true,
            retryAfter: 30,
          },
        };
        return c.json(errorResponse, 503);
      }
    }

    const errorResponse: ErrorResponse = {
      error: {
        code: 'GENERATION_FAILED',
        message: error instanceof Error ? error.message : 'Failed to create image task',
      },
    };
    return c.json(errorResponse, 500);
  }
});

/**
 * GET /status/:jobId - ジョブステータスを確認
 */
imageRoute.get('/status/:jobId', async (c) => {
  const jobId = c.req.param('jobId');

  if (!jobId) {
    const errorResponse: ErrorResponse = {
      error: {
        code: 'INVALID_REQUEST',
        message: 'Job ID is required',
      },
    };
    return c.json(errorResponse, 400);
  }

  try {
    const kieAi = new KieAiService(c.env.KIE_API_KEY);
    const status = await kieAi.getJobStatus(jobId);

    const response: ImageStatusResponse = {
      jobId,
      status: status.status,
      imageUrl: status.imageUrl,
      errorMessage: status.errorMessage,
      progress: status.progress,
    };

    return c.json(response);
  } catch (error) {
    console.error('Job status check failed:', error);

    if (error instanceof KieAiError) {
      if (error.isNotFound()) {
        const errorResponse: ErrorResponse = {
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'Job not found or expired',
          },
        };
        return c.json(errorResponse, 404);
      }
    }

    const errorResponse: ErrorResponse = {
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: error instanceof Error ? error.message : 'Failed to check job status',
      },
    };
    return c.json(errorResponse, 500);
  }
});
