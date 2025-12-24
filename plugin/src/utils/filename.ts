/**
 * ファイル名サニタイズユーティリティ
 */

/**
 * ファイル名として安全な文字列に変換
 */
export function sanitizeFilename(name: string): string {
  // 危険な文字を置換
  let sanitized = name
    .replace(/[<>:"/\\|?*]/g, '-')  // ファイルシステムで禁止されている文字
    .replace(/\s+/g, '-')           // 空白をハイフンに
    .replace(/-+/g, '-')            // 連続するハイフンを1つに
    .replace(/^-|-$/g, '');         // 先頭と末尾のハイフンを削除

  // 長すぎる場合はトリミング
  if (sanitized.length > 100) {
    sanitized = sanitized.slice(0, 100);
  }

  // 空になった場合はデフォルト名
  if (!sanitized) {
    sanitized = 'unnamed';
  }

  return sanitized;
}

/**
 * 画像ファイル名を生成
 */
export function generateImageFilename(
  noteName: string,
  imageId: string,
  extension = 'png'
): string {
  const sanitizedNoteName = sanitizeFilename(noteName);
  return `${sanitizedNoteName}__${imageId}.${extension}`;
}
