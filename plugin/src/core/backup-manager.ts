/**
 * バックアップ管理モジュール
 */

import type GeminiSummaryImagesPlugin from '../main';
import type { BackupData, BackupStorage } from '../types';

const MAX_BACKUPS = 5;
const BACKUP_KEY = 'backups';

export class BackupManager {
  private plugin: GeminiSummaryImagesPlugin;

  constructor(plugin: GeminiSummaryImagesPlugin) {
    this.plugin = plugin;
  }

  /**
   * バックアップを保存
   */
  async save(noteId: string, content: string): Promise<void> {
    const storage = await this.getStorage();

    const backup: BackupData = {
      noteId,
      originalContent: content,
      timestamp: Date.now(),
      injectedImages: [],
    };

    // 同じノートの古いバックアップを削除
    storage.backups = storage.backups.filter((b) => b.noteId !== noteId);

    // 新しいバックアップを追加
    storage.backups.unshift(backup);

    // 最大件数を維持
    if (storage.backups.length > MAX_BACKUPS) {
      storage.backups = storage.backups.slice(0, MAX_BACKUPS);
    }

    await this.saveStorage(storage);
  }

  /**
   * 生成した画像パスを記録
   */
  async recordInjectedImage(noteId: string, imagePath: string): Promise<void> {
    const storage = await this.getStorage();
    const backup = storage.backups.find((b) => b.noteId === noteId);

    if (backup) {
      backup.injectedImages.push(imagePath);
      await this.saveStorage(storage);
    }
  }

  /**
   * 最新のバックアップを取得
   */
  async getLatest(noteId: string): Promise<BackupData | null> {
    const storage = await this.getStorage();
    return storage.backups.find((b) => b.noteId === noteId) || null;
  }

  /**
   * 全バックアップを取得
   */
  async getAll(): Promise<BackupData[]> {
    const storage = await this.getStorage();
    return storage.backups;
  }

  /**
   * バックアップを削除
   */
  async remove(noteId: string): Promise<void> {
    const storage = await this.getStorage();
    storage.backups = storage.backups.filter((b) => b.noteId !== noteId);
    await this.saveStorage(storage);
  }

  /**
   * ストレージから読み込み
   */
  private async getStorage(): Promise<BackupStorage> {
    const data = await this.plugin.loadData();
    return data?.[BACKUP_KEY] || { backups: [] };
  }

  /**
   * ストレージに保存
   */
  private async saveStorage(storage: BackupStorage): Promise<void> {
    const data = (await this.plugin.loadData()) || {};
    data[BACKUP_KEY] = storage;
    await this.plugin.saveData(data);
  }
}
