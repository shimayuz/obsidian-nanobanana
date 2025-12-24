/**
 * 認証ミドルウェア
 */

import { Context, Next } from 'hono';
import type { Env, Variables } from '../index';

/**
 * Bearer Token認証ミドルウェア
 */
export function authMiddleware() {
  return async (c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader) {
      return c.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authorization header is required',
          },
        },
        401
      );
    }

    // Bearer トークン形式をチェック
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return c.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid authorization format. Use: Bearer <token>',
          },
        },
        401
      );
    }

    const token = match[1];

    // トークン検証
    const validTokens = c.env.AUTH_TOKENS?.split(',').map((t) => t.trim()) || [];

    if (!validTokens.includes(token)) {
      return c.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired token',
          },
        },
        401
      );
    }

    // ユーザーIDをトークンから抽出（形式: ogsip_<userId>_<random>）
    const tokenParts = token.split('_');
    const userId = tokenParts.length >= 2 ? tokenParts[1] : token;

    // コンテキストにユーザーIDを設定
    c.set('userId', userId);

    await next();
  };
}
