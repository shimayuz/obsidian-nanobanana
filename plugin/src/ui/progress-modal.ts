/**
 * 進捗表示モーダル
 */

import { App, Modal } from 'obsidian';
import type { GenerationProgress } from '../types';

export class ProgressModal extends Modal {
  private progressEl: HTMLElement | null = null;
  private messageEl: HTMLElement | null = null;
  private barEl: HTMLElement | null = null;

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('gemini-summary-progress-modal');

    // タイトル
    contentEl.createEl('h2', { text: 'Generating Summary Images' });

    // 進捗バー
    const barContainer = contentEl.createDiv({ cls: 'progress-bar-container' });
    this.barEl = barContainer.createDiv({ cls: 'progress-bar' });
    this.barEl.style.width = '0%';

    // メッセージ
    this.messageEl = contentEl.createEl('p', { cls: 'progress-message' });
    this.messageEl.setText('Initializing...');

    // プログレス表示
    this.progressEl = contentEl.createEl('p', { cls: 'progress-status' });
  }

  onClose() {
    this.contentEl.empty();
  }

  /**
   * 進捗を更新
   */
  update(progress: GenerationProgress): void {
    if (this.messageEl) {
      this.messageEl.setText(progress.message);
    }

    if (this.progressEl && progress.totalItems > 0) {
      this.progressEl.setText(`${progress.currentItem} / ${progress.totalItems}`);
    }

    if (this.barEl && progress.totalItems > 0) {
      const percent = (progress.currentItem / progress.totalItems) * 100;
      this.barEl.style.width = `${percent}%`;
    }

    // フェーズに応じてスタイル変更
    this.contentEl.removeClass('phase-planning', 'phase-generating', 'phase-done', 'phase-error');
    this.contentEl.addClass(`phase-${progress.phase}`);
  }
}
