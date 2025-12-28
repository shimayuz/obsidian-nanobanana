/**
 * 進捗表示モーダル
 */

import { App, Modal } from 'obsidian';
import type { GenerationProgress } from '../types';

// バナナアニメーションフレーム
const BANANA_FRAMES = [
  '🍌 generating banana...',
  '🍌. generating banana...',
  '🍌.. generating banana...',
  '🍌... generating banana...',
  '🍌.... generating banana...',
  '🍌..... generating banana...',
];

const ASCII_BANANA = `
    ___
   /   \\
  |  🍌 |
   \\___/
`;

export class ProgressModal extends Modal {
  private progressEl: HTMLElement | null = null;
  private messageEl: HTMLElement | null = null;
  private barEl: HTMLElement | null = null;
  private animationEl: HTMLElement | null = null;
  private animationInterval: number | null = null;
  private frameIndex = 0;

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('docs-summary-progress-modal');

    // バナナアニメーション
    this.animationEl = contentEl.createEl('pre', { cls: 'banana-animation' });
    this.animationEl.setText(BANANA_FRAMES[0]);
    this.startAnimation();

    // タイトル
    contentEl.createEl('h2', { text: '🍌 Generating Banana Images' });

    // 進捗バーコンテナ
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
    this.stopAnimation();
    this.contentEl.empty();
  }

  private startAnimation() {
    this.animationInterval = window.setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % BANANA_FRAMES.length;
      if (this.animationEl) {
        this.animationEl.setText(BANANA_FRAMES[this.frameIndex]);
      }
    }, 300);
  }

  private stopAnimation() {
    if (this.animationInterval !== null) {
      window.clearInterval(this.animationInterval);
      this.animationInterval = null;
    }
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

    // 完了時はアニメーション停止
    if (progress.phase === 'done' || progress.phase === 'error') {
      this.stopAnimation();
      if (this.animationEl) {
        this.animationEl.setText(progress.phase === 'done' ? '🍌 Done!' : '❌ Error');
      }
    }
  }
}
