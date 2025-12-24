import { Plugin, TFile, Menu, Editor, MarkdownView, Notice } from 'obsidian';
import { GeminiPluginSettings, DEFAULT_SETTINGS } from './types';
import { SummaryManager } from './core/summary-manager';
import { GeminiSettingTab } from './ui/settings-tab';
import { SummaryModal } from './ui/summary-modal';
import { isImageFile, parseImageFromMarkdown } from './utils/image-utils';

export default class GeminiSummaryPlugin extends Plugin {
  settings: GeminiPluginSettings = DEFAULT_SETTINGS;
  summaryManager!: SummaryManager;

  async onload() {
    await this.loadSettings();

    this.summaryManager = new SummaryManager(this.app.vault, this.settings);

    // Add settings tab
    this.addSettingTab(new GeminiSettingTab(this.app, this));

    // Add command: Summarize image under cursor
    this.addCommand({
      id: 'summarize-image-under-cursor',
      name: 'Summarize image under cursor',
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        await this.summarizeImageUnderCursor(editor, view);
      }
    });

    // Add command: Summarize all images in current note
    this.addCommand({
      id: 'summarize-all-images',
      name: 'Summarize all images in current note',
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        await this.summarizeAllImagesInNote(editor, view);
      }
    });

    // Register file menu for images
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu: Menu, file: TFile) => {
        if (file instanceof TFile && isImageFile(file)) {
          menu.addItem((item) => {
            item
              .setTitle('Summarize with Gemini')
              .setIcon('sparkles')
              .onClick(async () => {
                new SummaryModal(this.app, this, file).open();
              });
          });
        }
      })
    );

    // Register editor context menu
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const images = parseImageFromMarkdown(line);

        if (images.length > 0) {
          menu.addItem((item) => {
            item
              .setTitle('Summarize image with Gemini')
              .setIcon('sparkles')
              .onClick(async () => {
                await this.summarizeImageFromPath(images[0], editor);
              });
          });
        }
      })
    );

    console.log('Gemini Summary Images plugin loaded');
  }

  onunload() {
    console.log('Gemini Summary Images plugin unloaded');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.summaryManager?.updateSettings(this.settings);
  }

  private async summarizeImageUnderCursor(editor: Editor, view: MarkdownView) {
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    const images = parseImageFromMarkdown(line);

    if (images.length === 0) {
      new Notice('No image found on current line');
      return;
    }

    await this.summarizeImageFromPath(images[0], editor, cursor.line);
  }

  private async summarizeImageFromPath(imagePath: string, editor: Editor, lineNumber?: number) {
    // Resolve the image file
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('No active file');
      return;
    }

    const imageFile = this.app.metadataCache.getFirstLinkpathDest(imagePath, activeFile.path);

    if (!imageFile) {
      new Notice(`Image not found: ${imagePath}`);
      return;
    }

    if (!(imageFile instanceof TFile)) {
      new Notice('Invalid image file');
      return;
    }

    try {
      const summary = await this.summaryManager.summarizeImage(imageFile);

      // Insert summary
      const summaryText = `\n> [!summary] Image Summary\n> ${summary.split('\n').join('\n> ')}`;

      if (lineNumber !== undefined) {
        const line = editor.getLine(lineNumber);
        const insertPosition = this.settings.insertPosition === 'below'
          ? { line: lineNumber, ch: line.length }
          : { line: lineNumber, ch: 0 };

        if (this.settings.insertPosition === 'above') {
          editor.replaceRange(summaryText + '\n', insertPosition);
        } else {
          editor.replaceRange(summaryText, insertPosition);
        }
      }

      new Notice('Image summary added!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      new Notice(`Failed to summarize image: ${message}`);
    }
  }

  private async summarizeAllImagesInNote(editor: Editor, view: MarkdownView) {
    const content = editor.getValue();
    const images = parseImageFromMarkdown(content);

    if (images.length === 0) {
      new Notice('No images found in current note');
      return;
    }

    new Notice(`Found ${images.length} images. Starting analysis...`);

    let successCount = 0;
    let failCount = 0;

    for (const imagePath of images) {
      try {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) continue;

        const imageFile = this.app.metadataCache.getFirstLinkpathDest(imagePath, activeFile.path);
        if (!imageFile || !(imageFile instanceof TFile)) continue;

        await this.summaryManager.summarizeImage(imageFile);
        successCount++;
      } catch {
        failCount++;
      }
    }

    new Notice(`Analysis complete: ${successCount} succeeded, ${failCount} failed`);
  }
}
