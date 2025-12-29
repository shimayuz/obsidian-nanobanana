/**
 * Gemini Summary Images Plugin - メインエントリポイント
 */

import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  TFile,
  Modal,
} from 'obsidian';

import type { PluginSettings, GenerationProgress } from './types';
import { DEFAULT_SETTINGS } from './types';
import { createApiClient, ApiClient } from './api/api-client';
import { NoteParser } from './core/note-parser';
import { ImageInjector } from './core/image-injector';
import { BackupManager } from './core/backup-manager';
import { UndoManager } from './core/undo-manager';
import { ProgressModal } from './ui/progress-modal';

export default class GeminiSummaryImagesPlugin extends Plugin {
  settings!: PluginSettings;
  private apiClient!: ApiClient;
  private noteParser!: NoteParser;
  private imageInjector!: ImageInjector;
  private backupManager!: BackupManager;
  private undoManager!: UndoManager;

  async onload() {
    await this.loadSettings();
    this.initializeServices();
    this.registerCommands();
    this.addSettingTab(new GeminiSettingTab(this.app, this));

    console.log('Gemini Summary Images Plugin loaded');
  }

  onunload() {
    console.log('Gemini Summary Images Plugin unloaded');
  }

  private initializeServices() {
    this.apiClient = createApiClient(this.settings);
    this.noteParser = new NoteParser();
    this.imageInjector = new ImageInjector(this.app, this.settings);
    this.backupManager = new BackupManager(this);
    this.undoManager = new UndoManager(this.app, this.settings);
  }

  private registerCommands() {
    // メインコマンド: 画像生成
    this.addCommand({
      id: 'generate-images',
      name: 'Generate Summary Images',
      callback: () => this.generateImagesForCurrentNote(),
    });

    // Undo: 直前の埋め込みを取消
    this.addCommand({
      id: 'undo-injection',
      name: 'Undo Last Image Injection',
      callback: () => this.undoLastInjection(),
    });

    // このノートのAI画像を全削除
    this.addCommand({
      id: 'clear-all-images',
      name: 'Remove All AI Images from Current Note',
      callback: () => this.clearAllImages(),
    });

    // バックアップ表示
    this.addCommand({
      id: 'show-backup',
      name: 'Show Last Backup',
      callback: () => this.showBackup(),
    });
  }

  /**
   * 現在のノートに対して画像生成を実行
   */
  async generateImagesForCurrentNote() {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md') {
      new Notice('Please open a markdown note first');
      return;
    }

    // 設定チェック
    if (this.settings.connectionMode === 'direct') {
      if (!this.settings.openaiApiKey || !this.settings.kieApiKey) {
        new Notice('Please configure your API keys in settings');
        return;
      }
    } else {
      if (!this.settings.proxyToken) {
        new Notice('Please configure your proxy token in settings');
        return;
      }
    }

    // 進捗モーダル表示
    const progressModal = new ProgressModal(this.app);
    progressModal.open();

    try {
      // 1. ノート読み込み
      progressModal.update({ phase: 'planning', currentItem: 0, totalItems: 0, message: 'Reading note...' });
      const content = await this.app.vault.read(file);
      const parsed = this.noteParser.parse(content);

      // 2. バックアップ作成
      if (this.settings.createBackup) {
        await this.backupManager.save(file.path, content);
      }

      // 3. Plan生成
      progressModal.update({ phase: 'planning', currentItem: 0, totalItems: 0, message: 'Generating plan...' });
      const plan = await this.apiClient.generatePlan(parsed, this.settings);
      
      console.log('Generated plan:', plan);

      // 4. 画像生成ループ
      const totalItems = plan.items.length;
      const generatedImages: Array<{ id: string; path: string; item: typeof plan.items[0] }> = [];

      for (let i = 0; i < totalItems; i++) {
        const item = plan.items[i];
        progressModal.update({
          phase: 'generating',
          currentItem: i + 1,
          totalItems,
          message: `Generating image ${i + 1}/${totalItems}: ${item.title}`,
        });

        try {
          // 画像生成（直接APIまたはプロキシ経由）
          const imageData = await this.apiClient.generateImage(
            item.prompt,
            this.settings,
            // ポーリング進捗コールバック
            (pollProgress: { status: string; message: string; progress?: number }) => {
              progressModal.update({
                phase: 'generating',
                currentItem: i + 1,
                totalItems,
                message: `Image ${i + 1}/${totalItems}: ${pollProgress.message}`,
              });
            }
          );

          // 画像保存
          progressModal.update({
            phase: 'saving',
            currentItem: i + 1,
            totalItems,
            message: `Saving image ${i + 1}/${totalItems}...`,
          });
          const imagePath = await this.imageInjector.saveImage(file, item.id, imageData);
          generatedImages.push({ id: item.id, path: imagePath, item });
        } catch (error) {
          console.error(`Failed to generate image ${item.id}:`, error);
          new Notice(`Failed to generate image: ${item.title}`);
          // 続行（スキップ）
        }
      }

      // 5. ノートに埋め込み
      if (generatedImages.length > 0) {
        progressModal.update({
          phase: 'injecting',
          currentItem: generatedImages.length,
          totalItems: generatedImages.length,
          message: 'Injecting images into note...',
        });

        await this.imageInjector.injectImages(file, parsed, generatedImages);

        progressModal.update({
          phase: 'done',
          currentItem: generatedImages.length,
          totalItems: generatedImages.length,
          message: `Successfully generated ${generatedImages.length} images!`,
        });
      } else {
        progressModal.update({
          phase: 'error',
          currentItem: 0,
          totalItems: 0,
          message: 'No images were generated',
        });
      }
    } catch (error) {
      console.error('Generation failed:', error);
      progressModal.update({
        phase: 'error',
        currentItem: 0,
        totalItems: 0,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }

    // モーダルは3秒後に自動で閉じる（成功時）
    setTimeout(() => progressModal.close(), 3000);
  }

  /**
   * 直前の画像埋め込みをUndoする
   */
  async undoLastInjection() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('Please open a note first');
      return;
    }

    const result = await this.undoManager.undoLastInjection(file);
    if (result.success) {
      new Notice(`Removed ${result.removedCount} images`);
    } else {
      new Notice(result.message);
    }
  }

  /**
   * 現在のノートから全てのAI画像を削除
   */
  async clearAllImages() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('Please open a note first');
      return;
    }

    const result = await this.undoManager.clearAllImages(file);
    if (result.success) {
      new Notice(`Removed ${result.removedCount} AI image blocks`);
    } else {
      new Notice(result.message);
    }
  }

  /**
   * 最新のバックアップを表示
   */
  async showBackup() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('Please open a note first');
      return;
    }

    const backup = await this.backupManager.getLatest(file.path);
    if (backup) {
      // バックアップ内容をモーダルで表示
      new BackupViewModal(this.app, backup).open();
    } else {
      new Notice('No backup found for this note');
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.initializeServices(); // 設定変更時にサービスを再初期化
  }
}

/**
 * 設定タブ
 */
class GeminiSettingTab extends PluginSettingTab {
  plugin: GeminiSummaryImagesPlugin;

  constructor(app: App, plugin: GeminiSummaryImagesPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Docs Summary to Image Settings' });

    // 接続モード
    containerEl.createEl('h3', { text: 'Connection Mode' });

    let directApiContainer: HTMLElement;
    let proxyContainer: HTMLElement;

    new Setting(containerEl)
      .setName('Connection Mode')
      .setDesc('Choose how to connect to AI services')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('direct', 'Direct API (Recommended)')
          .addOption('proxy', 'Proxy Server (Advanced)')
          .setValue(this.plugin.settings.connectionMode)
          .onChange(async (value) => {
            this.plugin.settings.connectionMode = value as 'direct' | 'proxy';
            await this.plugin.saveSettings();
            this.display(); // 再描画して設定を切り替え
          })
      );

    // Direct API設定
    directApiContainer = containerEl.createDiv();
    directApiContainer.createEl('h3', { text: 'Direct API Settings' });

    new Setting(directApiContainer)
      .setName('OpenAI API Key')
      .setDesc('Get your key from OpenAI Platform (for plan generation)')
      .addText((text) => {
        text
          .setPlaceholder('sk-...')
          .setValue(this.plugin.settings.openaiApiKey)
          .onChange(async (value) => {
            this.plugin.settings.openaiApiKey = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
        return text;
      })
      .addExtraButton((button) =>
        button
          .setIcon('eye')
          .setTooltip('Show/Hide API Key')
          .onClick(() => {
            const input = button.extraSettingsEl.parentElement?.querySelector('input');
            if (input) {
              input.type = input.type === 'password' ? 'text' : 'password';
              button.setIcon(input.type === 'password' ? 'eye' : 'eye-off');
            }
          })
      );

    new Setting(directApiContainer)
      .setName('kie.ai API Key')
      .setDesc('Get your key from kie.ai (for image generation)')
      .addText((text) => {
        text
          .setPlaceholder('kie-...')
          .setValue(this.plugin.settings.kieApiKey)
          .onChange(async (value) => {
            this.plugin.settings.kieApiKey = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
        return text;
      })
      .addExtraButton((button) =>
        button
          .setIcon('eye')
          .setTooltip('Show/Hide API Key')
          .onClick(() => {
            const input = button.extraSettingsEl.parentElement?.querySelector('input');
            if (input) {
              input.type = input.type === 'password' ? 'text' : 'password';
              button.setIcon(input.type === 'password' ? 'eye' : 'eye-off');
            }
          })
      );

    // Proxy設定
    proxyContainer = containerEl.createDiv();
    proxyContainer.createEl('h3', { text: 'Proxy Server Settings' });

    new Setting(proxyContainer)
      .setName('Proxy URL')
      .setDesc('URL of the Gemini image proxy server')
      .addText((text) =>
        text
          .setPlaceholder('https://...')
          .setValue(this.plugin.settings.proxyUrl)
          .onChange(async (value) => {
            this.plugin.settings.proxyUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(proxyContainer)
      .setName('Proxy Token')
      .setDesc('Your authentication token for the proxy server')
      .addText((text) => {
        text
          .setPlaceholder('ogsip_...')
          .setValue(this.plugin.settings.proxyToken)
          .onChange(async (value) => {
            this.plugin.settings.proxyToken = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
        return text;
      })
      .addExtraButton((button) =>
        button
          .setIcon('eye')
          .setTooltip('Show/Hide Token')
          .onClick(() => {
            const input = button.extraSettingsEl.parentElement?.querySelector('input');
            if (input) {
              input.type = input.type === 'password' ? 'text' : 'password';
              button.setIcon(input.type === 'password' ? 'eye' : 'eye-off');
            }
          })
      );

    // モードに応じて表示/非表示
    if (this.plugin.settings.connectionMode === 'direct') {
      proxyContainer.style.display = 'none';
    } else {
      directApiContainer.style.display = 'none';
    }

    // 生成設定
    containerEl.createEl('h3', { text: 'Generation' });

    new Setting(containerEl)
      .setName('Max Image Count')
      .setDesc('Maximum number of images to generate (actual count depends on headings)')
      .addSlider((slider) =>
        slider
          .setLimits(1, 8, 1)
          .setValue(this.plugin.settings.maxImageCount)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxImageCount = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Image Style')
      .setDesc('Visual style for generated images')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('infographic', 'Infographic')
          .addOption('diagram', 'Diagram')
          .addOption('card', 'Summary Card')
          .addOption('whiteboard', 'Whiteboard')
          .addOption('slide', 'Slide')
          .setValue(this.plugin.settings.imageStyle)
          .onChange(async (value) => {
            this.plugin.settings.imageStyle = value as any;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Aspect Ratio')
      .setDesc('Aspect ratio for generated images')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('16:9', '16:9 (Widescreen)')
          .addOption('4:3', '4:3 (Standard)')
          .addOption('1:1', '1:1 (Square)')
          .setValue(this.plugin.settings.aspectRatio)
          .onChange(async (value) => {
            this.plugin.settings.aspectRatio = value as any;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Resolution')
      .setDesc('Image resolution (4K costs more credits)')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('1K', '1K')
          .addOption('2K', '2K')
          .addOption('4K', '4K ⚠️ High Price')
          .setValue(this.plugin.settings.resolution)
          .onChange(async (value) => {
            this.plugin.settings.resolution = value as any;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Language')
      .setDesc('Language for image titles and descriptions')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('ja', 'Japanese')
          .addOption('en', 'English')
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value as any;
            await this.plugin.saveSettings();
          })
      );

    // 保存設定
    containerEl.createEl('h3', { text: 'Storage' });

    new Setting(containerEl)
      .setName('Attachment Folder')
      .setDesc('Folder to save generated images (relative to vault root)')
      .addText((text) =>
        text
          .setPlaceholder('attachments/ai-summary')
          .setValue(this.plugin.settings.attachmentFolder)
          .onChange(async (value) => {
            this.plugin.settings.attachmentFolder = value;
            await this.plugin.saveSettings();
          })
      );

    // 送信設定
    containerEl.createEl('h3', { text: 'Content Processing' });

    new Setting(containerEl)
      .setName('Send Mode')
      .setDesc('How much of the note to send to the AI')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('full', 'Full content')
          .addOption('headings', 'Headings + excerpts')
          .addOption('summary', 'Summary only')
          .setValue(this.plugin.settings.sendMode)
          .onChange(async (value) => {
            this.plugin.settings.sendMode = value as any;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Max Characters')
      .setDesc('Maximum characters to send (for token optimization)')
      .addText((text) =>
        text
          .setPlaceholder('30000')
          .setValue(String(this.plugin.settings.maxCharacters))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.maxCharacters = num;
              await this.plugin.saveSettings();
            }
          })
      );

    // 安全設定
    containerEl.createEl('h3', { text: 'Safety' });

    new Setting(containerEl)
      .setName('Create Backup')
      .setDesc('Save a backup of the note before injecting images')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.createBackup)
          .onChange(async (value) => {
            this.plugin.settings.createBackup = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Backup Location')
      .setDesc('Where to store backups')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('plugin', 'Plugin data (lightweight)')
          .addOption('vault', 'Vault folder (robust)')
          .setValue(this.plugin.settings.backupLocation)
          .onChange(async (value) => {
            this.plugin.settings.backupLocation = value as any;
            await this.plugin.saveSettings();
          })
      );
  }
}

/**
 * バックアップ表示モーダル
 */
class BackupViewModal extends Modal {
  backup: { originalContent: string; timestamp: number };

  constructor(app: App, backup: { originalContent: string; timestamp: number }) {
    super(app);
    this.backup = backup;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Backup Content' });
    contentEl.createEl('p', {
      text: `Saved at: ${new Date(this.backup.timestamp).toLocaleString()}`,
    });

    const textarea = contentEl.createEl('textarea', {
      attr: {
        style: 'width: 100%; height: 400px; font-family: monospace;',
        readonly: 'true',
      },
    });
    textarea.value = this.backup.originalContent;

    new Setting(contentEl).addButton((btn) =>
      btn.setButtonText('Close').onClick(() => this.close())
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}
