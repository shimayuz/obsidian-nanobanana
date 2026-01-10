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
  TFolder,
  Modal,
  Editor,
  Menu,
  MarkdownView,
  AbstractInputSuggest,
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
    this.registerContextMenu();
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

    // カーソル位置の画像を再生成
    this.addCommand({
      id: 'regenerate-image-at-cursor',
      name: 'Regenerate Image at Cursor',
      editorCallback: (editor) => this.regenerateImageAtCursor(editor),
    });

    // Manual Mode: 選択テキストから画像生成
    this.addCommand({
      id: 'generate-image-from-selection',
      name: 'Generate Image from Selection (Manual Mode)',
      editorCallback: (editor, view) => {
        if (view instanceof MarkdownView) {
          this.generateImageFromSelection(editor, view);
        }
      },
    });
  }

  /**
   * 右クリックコンテキストメニューを登録
   */
  private registerContextMenu() {
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
        const cursor = editor.getCursor();
        const content = editor.getValue();
        const blockInfo = this.findImageBlockAtCursor(content, cursor.line);

        // 既存の画像ブロック上での再生成オプション
        if (blockInfo && blockInfo.prompt) {
          menu.addItem((item) => {
            item
              .setTitle('🔄 Regenerate This Image')
              .setIcon('refresh-cw')
              .onClick(() => {
                this.regenerateImageAtCursor(editor);
              });
          });
        }

        // Manual Mode: テキスト選択時に画像生成オプションを表示
        const selection = editor.getSelection();
        if (selection && selection.trim().length > 0 && this.settings.manualMode.enabled) {
          menu.addItem((item) => {
            item
              .setTitle('🖼️ Generate Image from Selection')
              .setIcon('image-plus')
              .onClick(() => {
                this.generateImageFromSelection(editor, view);
              });
          });
        }
      })
    );
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
      const generatedImages: Array<{ id: string; path: string; item: typeof plan.items[0]; prompt?: string }> = [];

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
          const imagePath = await this.imageInjector.saveImage(file, item.id, imageData, item.title);
          generatedImages.push({ id: item.id, path: imagePath, item, prompt: item.prompt });
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
   * カーソル位置の画像を再生成
   */
  async regenerateImageAtCursor(editor: Editor) {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('Please open a note first');
      return;
    }

    const cursor = editor.getCursor();
    const content = editor.getValue();
    
    // カーソル位置を含む画像ブロックを検索
    const blockInfo = this.findImageBlockAtCursor(content, cursor.line);
    
    if (!blockInfo) {
      new Notice('No AI image block found at cursor position');
      return;
    }

    const { id, prompt, blockStart, blockEnd } = blockInfo;

    if (!prompt) {
      new Notice('No prompt found in this image block. Cannot regenerate.');
      return;
    }

    // 再生成開始
    const loadingNotice = new Notice('Regenerating image...', 0);

    try {
      // 画像生成
      const imageData = await this.apiClient.generateImage(
        decodeURIComponent(prompt),
        this.settings,
        (progress: { status: string; message: string; progress?: number }) => {
          loadingNotice.setMessage(`Regenerating: ${progress.message}`);
        }
      );

      // 画像保存（同じIDで上書き）
      const imagePath = await this.imageInjector.saveImage(file, id, imageData);

      // 新しいブロックを生成
      const timestamp = new Date().toISOString();
      const decodedPrompt = decodeURIComponent(prompt);
      const newBlock = [
        `<!-- ai-summary:start id="${id}" generated="${timestamp}" prompt="${prompt}" -->`,
        `![[${imagePath}]]`,
        `*Regenerated image*`,
        `<!-- ai-summary:end id="${id}" -->`,
      ].join('\n');

      // エディタ内のブロックを置換
      const lines = content.split('\n');
      const newContent = [
        ...lines.slice(0, blockStart),
        newBlock,
        ...lines.slice(blockEnd + 1),
      ].join('\n');

      editor.setValue(newContent);

      loadingNotice.hide();
      new Notice('Image regenerated successfully!');
    } catch (error) {
      loadingNotice.hide();
      console.error('Regeneration failed:', error);
      new Notice(`Failed to regenerate: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Manual Mode: 選択テキストから画像を生成
   */
  async generateImageFromSelection(editor: Editor, view: MarkdownView) {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md') {
      new Notice('Please open a markdown note first');
      return;
    }

    const selection = editor.getSelection();
    if (!selection || selection.trim().length === 0) {
      new Notice('Please select some text first');
      return;
    }

    // API設定チェック
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

    // 選択テキストの長さチェック
    let textToProcess = selection;
    if (selection.length > 5000) {
      textToProcess = selection.substring(0, 5000);
      new Notice('Selection truncated to 5000 characters');
    }

    // 選択終了位置を取得
    const selectionEnd = editor.getCursor('to');

    // ローディング通知を表示
    const loadingNotice = new Notice('Generating image from selection...', 0);

    try {
      // 1. 選択テキストからプロンプト・タイトル・説明を生成
      loadingNotice.setMessage('Creating image prompt...');
      const result = await this.apiClient.generatePromptFromSelection(
        textToProcess,
        this.settings
      );

      console.log('Manual Mode: Generated result:', result);

      // 2. 使用する設定を決定（Full-autoと同じか個別設定か）
      const imageSettings = this.getManualModeSettings();

      // 3. 画像生成
      loadingNotice.setMessage('Generating image...');
      const imageData = await this.apiClient.generateImage(
        result.prompt,
        imageSettings,
        (progress: { status: string; message: string; progress?: number }) => {
          loadingNotice.setMessage(`Generating: ${progress.message}`);
        }
      );

      // 4. 画像を保存（タイトルをファイル名に使用）
      loadingNotice.setMessage('Saving image...');
      const imageId = `manual-${Date.now()}`;
      const imagePath = await this.imageInjector.saveImage(
        file,
        imageId,
        imageData,
        result.title
      );

      // 5. 選択の直下に画像ブロックを挿入
      loadingNotice.setMessage('Inserting image...');
      const imageBlock = this.createManualModeImageBlock(imageId, imagePath, result.prompt, result.description);

      // カーソルを選択終了位置に移動し、次の行に挿入
      editor.setCursor(selectionEnd);
      const currentLine = editor.getLine(selectionEnd.line);
      const insertPosition = {
        line: selectionEnd.line,
        ch: currentLine.length
      };

      editor.replaceRange('\n' + imageBlock, insertPosition);

      loadingNotice.hide();
      new Notice('Image generated and inserted successfully!');

    } catch (error) {
      loadingNotice.hide();
      console.error('Manual Mode generation failed:', error);
      new Notice(`Failed to generate image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Manual Mode用の設定を取得
   */
  private getManualModeSettings(): PluginSettings {
    if (this.settings.manualMode.useFullAutoSettings) {
      return this.settings;
    }

    // Manual Mode固有の設定を適用
    return {
      ...this.settings,
      imageStyle: this.settings.manualMode.imageStyle,
      aspectRatio: this.settings.manualMode.aspectRatio,
      resolution: this.settings.manualMode.resolution,
    };
  }

  /**
   * Manual Mode用の画像ブロックを作成
   * プロンプトは保存しない（シンプルなフォーマット）
   */
  private createManualModeImageBlock(id: string, path: string, _prompt: string, description: string): string {
    const filename = path.split('/').pop() || path;

    return [
      '',
      `![[${filename}]]`,
      `*${description}*`,
      '',
    ].join('\n');
  }

  /**
   * カーソル位置の画像ブロックを検索
   */
  private findImageBlockAtCursor(content: string, cursorLine: number): {
    id: string;
    prompt: string | null;
    blockStart: number;
    blockEnd: number;
  } | null {
    const lines = content.split('\n');
    const startRegex = /<!-- ai-summary:start id="([^"]+)" generated="([^"]+)"(?: prompt="([^"]*)")? -->/;
    const endRegex = /<!-- ai-summary:end id="([^"]+)" -->/;

    let blockStart = -1;
    let currentId = '';
    let currentPrompt: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const startMatch = lines[i].match(startRegex);
      if (startMatch) {
        blockStart = i;
        currentId = startMatch[1];
        currentPrompt = startMatch[3] || null;
      }

      const endMatch = lines[i].match(endRegex);
      if (endMatch && endMatch[1] === currentId) {
        // ブロック終了
        if (cursorLine >= blockStart && cursorLine <= i) {
          return {
            id: currentId,
            prompt: currentPrompt,
            blockStart,
            blockEnd: i,
          };
        }
        blockStart = -1;
        currentId = '';
        currentPrompt = null;
      }
    }

    return null;
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
      .setDesc('Folder to save generated images (type to search folders)')
      .addText((text) => {
        text
          .setPlaceholder('attachments/ai-summary')
          .setValue(this.plugin.settings.attachmentFolder)
          .onChange(async (value) => {
            this.plugin.settings.attachmentFolder = value;
            await this.plugin.saveSettings();
          });
        // フォルダ候補を表示
        new FolderSuggest(this.app, text.inputEl);
      });

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

    // Manual Mode設定
    containerEl.createEl('h3', { text: 'Manual Mode' });

    containerEl.createEl('p', {
      text: 'Generate images from selected text via right-click context menu.',
      cls: 'setting-item-description',
    });

    new Setting(containerEl)
      .setName('Enable Manual Mode')
      .setDesc('Show "Generate Image from Selection" in right-click menu')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.manualMode.enabled)
          .onChange(async (value) => {
            this.plugin.settings.manualMode.enabled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Use Full-Auto Settings')
      .setDesc('Use the same image style, aspect ratio, and resolution as Full-Auto mode')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.manualMode.useFullAutoSettings)
          .onChange(async (value) => {
            this.plugin.settings.manualMode.useFullAutoSettings = value;
            await this.plugin.saveSettings();
            this.display(); // 再描画してManual固有設定を表示/非表示
          })
      );

    // Manual Mode固有設定（Full-Auto設定を使用しない場合のみ表示）
    if (!this.plugin.settings.manualMode.useFullAutoSettings) {
      const manualSettingsContainer = containerEl.createDiv({ cls: 'manual-mode-settings' });

      new Setting(manualSettingsContainer)
        .setName('Manual Mode - Image Style')
        .setDesc('Visual style for manually generated images')
        .addDropdown((dropdown) =>
          dropdown
            .addOption('infographic', 'Infographic')
            .addOption('diagram', 'Diagram')
            .addOption('card', 'Summary Card')
            .addOption('whiteboard', 'Whiteboard')
            .addOption('slide', 'Slide')
            .setValue(this.plugin.settings.manualMode.imageStyle)
            .onChange(async (value) => {
              this.plugin.settings.manualMode.imageStyle = value as any;
              await this.plugin.saveSettings();
            })
        );

      new Setting(manualSettingsContainer)
        .setName('Manual Mode - Aspect Ratio')
        .setDesc('Aspect ratio for manually generated images')
        .addDropdown((dropdown) =>
          dropdown
            .addOption('16:9', '16:9 (Widescreen)')
            .addOption('4:3', '4:3 (Standard)')
            .addOption('1:1', '1:1 (Square)')
            .setValue(this.plugin.settings.manualMode.aspectRatio)
            .onChange(async (value) => {
              this.plugin.settings.manualMode.aspectRatio = value as any;
              await this.plugin.saveSettings();
            })
        );

      new Setting(manualSettingsContainer)
        .setName('Manual Mode - Resolution')
        .setDesc('Image resolution for manually generated images')
        .addDropdown((dropdown) =>
          dropdown
            .addOption('1K', '1K')
            .addOption('2K', '2K')
            .addOption('4K', '4K ⚠️ High Price')
            .setValue(this.plugin.settings.manualMode.resolution)
            .onChange(async (value) => {
              this.plugin.settings.manualMode.resolution = value as any;
              await this.plugin.saveSettings();
            })
        );
    }
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

/**
 * フォルダ候補を表示するサジェスター
 */
class FolderSuggest extends AbstractInputSuggest<TFolder> {
  private inputEl: HTMLInputElement;

  constructor(app: App, inputEl: HTMLInputElement) {
    super(app, inputEl);
    this.inputEl = inputEl;
  }

  getSuggestions(inputStr: string): TFolder[] {
    const abstractFiles = this.app.vault.getAllLoadedFiles();
    const folders: TFolder[] = [];
    const lowerCaseInputStr = inputStr.toLowerCase();

    abstractFiles.forEach((folder) => {
      if (
        folder instanceof TFolder &&
        folder.path.toLowerCase().contains(lowerCaseInputStr)
      ) {
        folders.push(folder);
      }
    });

    // ルートフォルダも追加（空文字の場合）
    if (lowerCaseInputStr === '' || '/'.contains(lowerCaseInputStr)) {
      const rootFolder = this.app.vault.getRoot();
      if (!folders.includes(rootFolder)) {
        folders.unshift(rootFolder);
      }
    }

    return folders.slice(0, 20); // 最大20件
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.createEl('div', { text: folder.path || '/' });
  }

  selectSuggestion(folder: TFolder): void {
    this.inputEl.value = folder.path;
    this.inputEl.trigger('input');
    this.close();
  }
}
