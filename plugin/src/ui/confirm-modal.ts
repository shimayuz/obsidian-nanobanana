/**
 * 確認ダイアログモーダル
 */

import { App, Modal, Setting } from 'obsidian';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

export class ConfirmModal extends Modal {
  private options: ConfirmOptions;
  private resolve: (value: boolean) => void;

  constructor(app: App, options: ConfirmOptions, resolve: (value: boolean) => void) {
    super(app);
    this.options = options;
    this.resolve = resolve;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl('h2', { text: this.options.title });
    contentEl.createEl('p', { text: this.options.message });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText(this.options.cancelText || 'Cancel')
          .onClick(() => {
            this.resolve(false);
            this.close();
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText(this.options.confirmText || 'Confirm')
          .setCta()
          .onClick(() => {
            this.resolve(true);
            this.close();
          })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}

/**
 * 確認ダイアログを表示してユーザーの回答を待つ
 */
export function showConfirmModal(app: App, options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    new ConfirmModal(app, options, resolve).open();
  });
}
