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
   */
  async saveImage(noteFile: TFile, imageId: string, imageData: ArrayBuffer): Promise<string> {
    // 保存先フォルダを確保
    const folder = normalizePath(this.settings.attachmentFolder);
    await this.ensureFolder(folder);

    // ファイル名を生成
    const noteName = sanitizeFilename(noteFile.basename);
    const filename = `${noteName}__${imageId}.png`;
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
   */
  private calculateInsertions(
    parsed: ParsedNote,
    images: GeneratedImage[]
  ): Array<{ lineNumber: number; image: GeneratedImage }> {
    const result: Array<{ lineNumber: number; image: GeneratedImage }> = [];

    for (const image of images) {
      const { afterHeading } = image.item;
      let lineNumber = -1;

      // 見出しを検索
      for (const section of parsed.sections) {
        if (section.heading === afterHeading || section.heading.includes(afterHeading)) {
          lineNumber = section.lineStart;
          break;
        }
      }

      // 見つからない場合は末尾
      if (lineNumber === -1) {
        const lastSection = parsed.sections[parsed.sections.length - 1];
        lineNumber = lastSection ? lastSection.lineEnd : 0;
      }

      result.push({ lineNumber, image });
    }

    return result;
  }

  /**
   * 画像埋め込みブロックを生成
   */
  private createImageBlock(image: GeneratedImage): string {
    const timestamp = new Date().toISOString();
    const { id, path, item, prompt } = image;

    return [
      '',
      AI_SUMMARY_MARKER.START(id, timestamp, prompt),
      `![[${path}]]`,
      `*${item.title}: ${item.description}*`,
      AI_SUMMARY_MARKER.END(id),
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
}
