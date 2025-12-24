/**
 * Undo管理モジュール
 * AI画像ブロックの削除と復元
 */

import { App, TFile } from 'obsidian';
import type { PluginSettings } from '../types';
import { AI_SUMMARY_MARKER } from '../types';

interface UndoResult {
  success: boolean;
  message: string;
  removedCount: number;
}

export class UndoManager {
  private app: App;
  private settings: PluginSettings;

  constructor(app: App, settings: PluginSettings) {
    this.app = app;
    this.settings = settings;
  }

  /**
   * 直前の画像埋め込みをUndoする
   * （最新のタイムスタンプを持つブロックを全て削除）
   */
  async undoLastInjection(file: TFile): Promise<UndoResult> {
    const content = await this.app.vault.read(file);

    // 全てのAIサマリーブロックを検索
    const blocks = this.findAllBlocks(content);

    if (blocks.length === 0) {
      return {
        success: false,
        message: 'No AI image blocks found in this note',
        removedCount: 0,
      };
    }

    // 最新のタイムスタンプを特定
    const latestTimestamp = Math.max(...blocks.map((b) => b.timestamp));

    // 最新のタイムスタンプを持つブロックのみ削除
    const blocksToRemove = blocks.filter((b) => b.timestamp === latestTimestamp);
    let newContent = content;

    for (const block of blocksToRemove) {
      newContent = newContent.replace(block.fullMatch, '');
    }

    // 連続する空行を整理
    newContent = newContent.replace(/\n{3,}/g, '\n\n');

    await this.app.vault.modify(file, newContent);

    // 画像ファイルも削除（オプション）
    await this.removeImageFiles(blocksToRemove);

    return {
      success: true,
      message: `Removed ${blocksToRemove.length} image blocks`,
      removedCount: blocksToRemove.length,
    };
  }

  /**
   * このノートの全てのAI画像を削除
   */
  async clearAllImages(file: TFile): Promise<UndoResult> {
    const content = await this.app.vault.read(file);
    const blocks = this.findAllBlocks(content);

    if (blocks.length === 0) {
      return {
        success: false,
        message: 'No AI image blocks found in this note',
        removedCount: 0,
      };
    }

    // 全てのブロックを削除
    let newContent = content.replace(AI_SUMMARY_MARKER.REGEX.BLOCK, '');

    // 連続する空行を整理
    newContent = newContent.replace(/\n{3,}/g, '\n\n');

    await this.app.vault.modify(file, newContent);

    // 画像ファイルも削除
    await this.removeImageFiles(blocks);

    return {
      success: true,
      message: `Removed ${blocks.length} image blocks`,
      removedCount: blocks.length,
    };
  }

  /**
   * 全てのAIサマリーブロックを検索
   */
  private findAllBlocks(
    content: string
  ): Array<{ id: string; timestamp: number; fullMatch: string; imagePath: string | null }> {
    const blocks: Array<{
      id: string;
      timestamp: number;
      fullMatch: string;
      imagePath: string | null;
    }> = [];

    // グローバル検索
    let match;
    const regex = new RegExp(AI_SUMMARY_MARKER.REGEX.BLOCK.source, 'g');

    while ((match = regex.exec(content)) !== null) {
      const fullMatch = match[0];
      const id = match[1];

      // タイムスタンプを抽出
      const startMatch = fullMatch.match(AI_SUMMARY_MARKER.REGEX.START);
      const timestamp = startMatch?.[2] ? new Date(startMatch[2]).getTime() : 0;

      // 画像パスを抽出
      const imageMatch = fullMatch.match(/!\[\[([^\]]+)\]\]/);
      const imagePath = imageMatch ? imageMatch[1] : null;

      blocks.push({ id, timestamp, fullMatch, imagePath });
    }

    return blocks;
  }

  /**
   * 画像ファイルを削除
   */
  private async removeImageFiles(
    blocks: Array<{ imagePath: string | null }>
  ): Promise<void> {
    for (const block of blocks) {
      if (block.imagePath) {
        const file = this.app.vault.getAbstractFileByPath(block.imagePath);
        if (file instanceof TFile) {
          try {
            await this.app.vault.delete(file);
          } catch (error) {
            console.warn(`Failed to delete image file: ${block.imagePath}`, error);
          }
        }
      }
    }
  }
}
