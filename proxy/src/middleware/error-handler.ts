/**
 * エラーハンドリングミドルウェア
 */

import { Context, Next } from 'hono';
import type { ErrorResponse } from '../../../shared/api-types';

/**
 * グローバルエラーハンドラー
 */
export function errorHandler() {
  return async (c: Context, next: Next) => {
    try {
      await next();
    } catch (error) {
      console.error('Unhandled error:', error);

      // Gemini APIエラーの特別処理
      if (error instanceof Error) {
        // レート制限エラー
        if (error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED')) {
          const errorResponse: ErrorResponse = {
            error: {
              code: 'RATE_LIMITED',
              message: 'Gemini API rate limit exceeded',
              retryable: true,
              retryAfter: 60,
            },
          };
          return c.json(errorResponse, 429);
        }

        // 認証エラー
        if (error.message.includes('401') || error.message.includes('UNAUTHENTICATED')) {
          const errorResponse: ErrorResponse = {
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: 'Gemini API authentication failed',
            },
          };
          return c.json(errorResponse, 503);
        }

        // モデル利用不可
        if (error.message.includes('503') || error.message.includes('UNAVAILABLE')) {
          const errorResponse: ErrorResponse = {
            error: {
              code: 'MODEL_UNAVAILABLE',
              message: 'Gemini model is temporarily unavailable',
              retryable: true,
              retryAfter: 30,
            },
          };
          return c.json(errorResponse, 503);
        }
      }

      // 一般的なエラー
      const errorResponse: ErrorResponse = {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'An unexpected error occurred',
          details: error instanceof Error ? error.message : String(error),
        },
      };
      return c.json(errorResponse, 500);
    }
  };
}
