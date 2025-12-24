/**
 * Gemini Summary Images Proxy - Cloudflare Workers エントリポイント
 *
 * Plan生成: Gemini API (gemini-1.5-flash)
 * 画像生成: kie.ai API (nano-banana-pro) - ポーリング方式
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import { planRoute } from './routes/plan';
import { imageRoute } from './routes/image';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/error-handler';

// 環境変数の型定義
export interface Env {
  /** Gemini API キー（Plan生成用） */
  GEMINI_API_KEY: string;

  /** kie.ai API キー（画像生成用） */
  KIE_API_KEY: string;

  /** 認証トークン（カンマ区切り） */
  AUTH_TOKENS: string;

  /** レート制限用KV（オプション） */
  RATE_LIMIT?: KVNamespace;
}

// Hono Variables 型
export type Variables = {
  userId: string;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// グローバルミドルウェア
app.use('*', logger());
app.use('*', cors());
app.use('*', errorHandler());

// ヘルスチェック（認証不要）
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      plan: 'gemini-1.5-flash',
      image: 'kie.ai/nano-banana-pro',
    },
  });
});

// API v1 ルート（認証必要）
const v1 = new Hono<{ Bindings: Env }>();
v1.use('*', authMiddleware());
v1.route('/plan', planRoute);
v1.route('/image', imageRoute);

app.route('/v1', v1);

// 404ハンドラー
app.notFound((c) => {
  return c.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
      },
    },
    404
  );
});

export default app;
