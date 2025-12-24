/**
 * ハッシュ計算ユーティリティ
 * 競合検出に使用
 */

/**
 * 文字列のシンプルなハッシュを計算
 * （暗号学的に安全である必要はない、競合検出用）
 */
export function computeHash(content: string): string {
  let hash = 0;
  if (content.length === 0) return hash.toString(16);

  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash).toString(16);
}

/**
 * 2つのハッシュが一致するかチェック
 */
export function hashesMatch(hash1: string, hash2: string): boolean {
  return hash1 === hash2;
}
