/**
 * Plan生成ルート - POST /v1/plan
 */

import { Hono } from 'hono';
import { z } from 'zod';

import type { Env, Variables } from '../index';
import { GeminiService } from '../services/gemini';
import { RateLimiter } from '../services/rate-limiter';
import type { PlanRequest, PlanResponse, ErrorResponse } from '../../../shared/api-types';
import { API_LIMITS } from '../../../shared/api-types';

// リクエストバリデーション
const PlanRequestSchema = z.object({
  noteContent: z.string().min(1).max(API_LIMITS.MAX_NOTE_CHARACTERS),
  settings: z.object({
    imageCount: z.union([z.literal(4), z.literal(5)]),
    style: z.enum(['infographic', 'diagram', 'card', 'whiteboard', 'slide']),
    language: z.enum(['ja', 'en']),
  }),
});

export const planRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

planRoute.post('/', async (c) => {
  // リクエストボディ取得
  const body = await c.req.json<PlanRequest>();

  // バリデーション
  const parseResult = PlanRequestSchema.safeParse(body);
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

  // ノートサイズチェック
  if (request.noteContent.length > API_LIMITS.MAX_NOTE_CHARACTERS) {
    const errorResponse: ErrorResponse = {
      error: {
        code: 'NOTE_TOO_LARGE',
        message: `Note content exceeds maximum of ${API_LIMITS.MAX_NOTE_CHARACTERS} characters`,
      },
    };
    return c.json(errorResponse, 400);
  }

  // レート制限チェック
  const userId = c.get('userId') as string;
  const rateLimiter = new RateLimiter(c.env.RATE_LIMIT);

  const rateCheck = await rateLimiter.checkPlanLimit(userId);
  if (!rateCheck.allowed) {
    const errorResponse: ErrorResponse = {
      error: {
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded',
        retryable: true,
        retryAfter: rateCheck.retryAfter,
      },
    };
    return c.json(errorResponse, 429);
  }

  try {
    // Gemini APIでPlan生成
    const gemini = new GeminiService(c.env.GEMINI_API_KEY);
    const plan = await gemini.generatePlan(request);

    // レート制限カウンターを増加
    await rateLimiter.incrementPlanCount(userId);

    // レスポンス
    const response: PlanResponse = {
      version: '1',
      items: plan.items,
      metadata: {
        noteHash: computeSimpleHash(request.noteContent),
        generatedAt: new Date().toISOString(),
      },
    };

    return c.json(response);
  } catch (error) {
    console.error('Plan generation failed:', error);

    const errorResponse: ErrorResponse = {
      error: {
        code: 'GENERATION_FAILED',
        message: error instanceof Error ? error.message : 'Failed to generate plan',
      },
    };
    return c.json(errorResponse, 500);
  }
});

/**
 * シンプルなハッシュ計算
 */
function computeSimpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}
