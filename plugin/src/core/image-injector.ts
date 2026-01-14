/**
 * 画像保存・埋め込みモジュール
 */

import { App, TFile, normalizePath } from 'obsidian';
import type { PluginSettings, ParsedNote } from '../types';
import { AI_SUMMARY_MARKER } from '../types';
import type { PlanItem } from '../../../shared/api-types';
import { computeHash } from '../utils/hash';
import { sanitizeFilename } from '../utils/filename';

interface GeneratedImage {
  id: string;
  path: string;
  item: PlanItem;
  prompt?: string;  // 再生成用にプロンプトを保持
}

export class ImageInjector {
  private app: App;
  private settings: PluginSettings;
  private lastReadHash: string | null = null;

  constructor(app: App, settings: PluginSettings) {
    this.app = app;
    this.settings = settings;
  }

  /**
   * 画像をVaultに保存
   * ファイル名形式: YYYYMMDD_サマリー.png
   */
  async saveImage(
    noteFile: TFile,
    imageId: string,
    imageData: ArrayBuffer,
    title?: string
  ): Promise<string> {
    // 保存先フォルダを確保
    const folder = normalizePath(this.settings.attachmentFolder);
    await this.ensureFolder(folder);

    // 日付を取得（YYYYMMDD形式）
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    
    // サマリー部分を生成（タイトルがあれば使用、なければimageId）
    const summaryPart = title ? sanitizeFilename(title) : imageId;
    
    // ファイル名: YYYYMMDD_サマリー.png
    const filename = `${dateStr}_${summaryPart}.png`;
    const path = normalizePath(`${folder}/${filename}`);

    // 既存ファイルがあれば削除
    const existingFile = this.app.vault.getAbstractFileByPath(path);
    if (existingFile instanceof TFile) {
      await this.app.vault.delete(existingFile);
    }

    // バイナリ保存
    await this.app.vault.adapter.writeBinary(path, imageData);

    return path;
  }

  /**
   * 生成した画像をノートに埋め込む
   */
  async injectImages(
    file: TFile,
    parsed: ParsedNote,
    images: GeneratedImage[]
  ): Promise<void> {
    // 現在の内容を取得
    const content = await this.app.vault.read(file);
    const currentHash = computeHash(content);

    // 競合チェック
    if (this.lastReadHash && this.lastReadHash !== currentHash) {
      throw new Error('Note was modified externally. Please try again.');
    }

    // 挿入位置でソート（下から上へ挿入するため逆順）
    const insertions = this.calculateInsertions(parsed, images);
    insertions.sort((a, b) => b.lineNumber - a.lineNumber);

    // 行単位で処理
    const lines = content.split('\n');

    for (const insertion of insertions) {
      const block = this.createImageBlock(insertion.image);
      // 見出しの次の行に挿入
      lines.splice(insertion.lineNumber + 1, 0, block);
    }

    // ノートを更新
    const newContent = lines.join('\n');
    await this.app.vault.modify(file, newContent);
  }

  /**
   * 挿入位置を計算
   * 画像はセクションの末尾（次の見出しの直前）に挿入される
   */
  private calculateInsertions(
    parsed: ParsedNote,
    images: GeneratedImage[]
  ): Array<{ lineNumber: number; image: GeneratedImage }> {
    const result: Array<{ lineNumber: number; image: GeneratedImage }> = [];

    for (const image of images) {
      const targetHeading = this.normalizeHeading(image.item.afterHeading);
      const lineNumber = this.findSectionEndLine(parsed, targetHeading);
      result.push({ lineNumber, image });
    }

    return result;
  }

  /**
   * 画像埋め込みブロックを生成
   * 表示: ![[画像名]] → 画像 → キャプション（1行）
   */
  private createImageBlock(image: GeneratedImage): string {
    const timestamp = new Date().toISOString();
    const { id, path, item } = image;
    
    // パスからファイル名のみを抽出
    const filename = path.split('/').pop() || path;

    return [
      '',
      `<!-- ai-summary id="${id}" generated="${timestamp}" -->`,
      `![[${filename}]]`,
      `*${item.description}*`,
      '',
    ].join('\n');
  }

  /**
   * フォルダが存在することを確認（なければ作成）
   */
  private async ensureFolder(path: string): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(path);
    if (!folder) {
      await this.app.vault.createFolder(path);
    }
  }

  /**
   * 読み取りハッシュを記録（競合検出用）
   */
  setLastReadHash(content: string): void {
    this.lastReadHash = computeHash(content);
  }

  /**
   * 見出しテキストを正規化
   * - 先頭の#や数字付きナンバリングを除去
   * - 前後スペースと大小文字を吸収
   */
  private normalizeHeading(rawHeading: string): string {
    return rawHeading
      .replace(/^#+\s*/, '')
      .replace(/^\d+[\.\-、）]\s*/, '')
      .trim()
      .toLowerCase();
  }

  /**
   * 対象見出しのセクション末尾行を取得（次の見出し直前）
   * - 完全一致を最優先
   * - 次点で先頭一致（例: "2. 準備" と "準備"）
   * - 見つからなければ最後のセクション末尾
   */
  private findSectionEndLine(parsed: ParsedNote, normalizedTarget: string): number {
    const sections = parsed.sections;
    if (!sections.length) return 0;

    // frontmatterを除去した本文ラインに合わせる（NoteParserと同じ基準）
    const bodyContent = parsed.rawContent.replace(/^---\n[\s\S]*?\n---\n/, '');
    const lines = bodyContent.split('\n');

    const matchIndex = sections.findIndex(
      (section) =>
        this.normalizeHeading(section.heading) === normalizedTarget ||
        this.normalizeHeading(section.heading).startsWith(normalizedTarget)
    );

    if (matchIndex !== -1) {
      const matchSection = sections[matchIndex];
      const nextSection = sections[matchIndex + 1];

      // 次の見出しがある場合、その直前までを探索範囲にする
      const searchStart = Math.min(lines.length - 1, Math.max(0, matchSection.lineStart + 1));
      const searchEnd = nextSection ? Math.max(0, nextSection.lineStart - 1) : lines.length - 1;

      // 範囲内に区切り線（---）があれば、その直前に挿入
      for (let i = searchStart; i <= searchEnd; i++) {
        if (lines[i]?.trim() === '---') {
          return Math.max(matchSection.lineStart, i - 1);
        }
      }

      // 区切り線がなければ従来どおりセクション末尾
      return matchSection.lineEnd;
    }

    const lastSection = sections[sections.length - 1];
    return lastSection ? lastSection.lineEnd : 0;
  }
}
