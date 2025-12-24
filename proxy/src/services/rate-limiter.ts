/**
 * レート制限サービス
 */

import { API_LIMITS } from '../../../shared/api-types';

interface RateLimitCheck {
  allowed: boolean;
  reason?: 'minute' | 'daily';
  retryAfter?: number;
}

export class RateLimiter {
  private kv?: KVNamespace;

  constructor(kv?: KVNamespace) {
    this.kv = kv;
  }

  /**
   * Plan APIのレート制限をチェック
   */
  async checkPlanLimit(userId: string): Promise<RateLimitCheck> {
    if (!this.kv) {
      return { allowed: true };
    }

    const minuteKey = `plan:minute:${userId}:${this.getMinuteKey()}`;
    const count = await this.getCount(minuteKey);

    if (count >= API_LIMITS.PLAN_RATE_LIMIT_PER_MINUTE) {
      return {
        allowed: false,
        reason: 'minute',
        retryAfter: 60 - new Date().getSeconds(),
      };
    }

    return { allowed: true };
  }

  /**
   * Image APIのレート制限をチェック
   */
  async checkImageLimit(userId: string): Promise<RateLimitCheck> {
    if (!this.kv) {
      return { allowed: true };
    }

    // 分単位のチェック
    const minuteKey = `image:minute:${userId}:${this.getMinuteKey()}`;
    const minuteCount = await this.getCount(minuteKey);

    if (minuteCount >= API_LIMITS.IMAGE_RATE_LIMIT_PER_MINUTE) {
      return {
        allowed: false,
        reason: 'minute',
        retryAfter: 60 - new Date().getSeconds(),
      };
    }

    // 日単位のチェック
    const dailyKey = `image:daily:${userId}:${this.getDayKey()}`;
    const dailyCount = await this.getCount(dailyKey);

    if (dailyCount >= API_LIMITS.IMAGE_RATE_LIMIT_PER_DAY) {
      return {
        allowed: false,
        reason: 'daily',
        retryAfter: this.getSecondsUntilMidnight(),
      };
    }

    return { allowed: true };
  }

  /**
   * Plan APIカウンターを増加
   */
  async incrementPlanCount(userId: string): Promise<void> {
    if (!this.kv) return;

    const minuteKey = `plan:minute:${userId}:${this.getMinuteKey()}`;
    await this.increment(minuteKey, 60); // 1分間有効
  }

  /**
   * Image APIカウンターを増加
   */
  async incrementImageCount(userId: string): Promise<void> {
    if (!this.kv) return;

    const minuteKey = `image:minute:${userId}:${this.getMinuteKey()}`;
    const dailyKey = `image:daily:${userId}:${this.getDayKey()}`;

    await Promise.all([
      this.increment(minuteKey, 60),         // 1分間有効
      this.increment(dailyKey, 86400),       // 24時間有効
    ]);
  }

  /**
   * カウント取得
   */
  private async getCount(key: string): Promise<number> {
    if (!this.kv) return 0;

    const value = await this.kv.get(key);
    return value ? parseInt(value, 10) : 0;
  }

  /**
   * カウンター増加
   */
  private async increment(key: string, ttlSeconds: number): Promise<void> {
    if (!this.kv) return;

    const current = await this.getCount(key);
    await this.kv.put(key, String(current + 1), { expirationTtl: ttlSeconds });
  }

  /**
   * 現在の分を示すキー
   */
  private getMinuteKey(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${now.getUTCMinutes()}`;
  }

  /**
   * 現在の日を示すキー
   */
  private getDayKey(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
  }

  /**
   * 深夜までの秒数
   */
  private getSecondsUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    return Math.floor((midnight.getTime() - now.getTime()) / 1000);
  }
}
