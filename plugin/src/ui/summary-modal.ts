import { App, Modal, TFile, Notice } from 'obsidian';
import GeminiSummaryPlugin from '../main';

export class SummaryModal extends Modal {
  private plugin: GeminiSummaryPlugin;
  private file: TFile;
  private summary: string | null = null;
  private isLoading = false;
  private error: string | null = null;

  constructor(app: App, plugin: GeminiSummaryPlugin, file: TFile) {
    super(app);
    this.plugin = plugin;
    this.file = file;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('gemini-modal');

    // Header
    contentEl.createEl('h2', { text: 'Image Summary' });

    // Image preview
    const previewContainer = contentEl.createDiv({ cls: 'gemini-modal-content' });

    const imgEl = previewContainer.createEl('img', { cls: 'gemini-modal-image' });
    const resourcePath = this.app.vault.getResourcePath(this.file);
    imgEl.src = resourcePath;
    imgEl.alt = this.file.name;

    // Summary container
    const summaryContainer = previewContainer.createDiv({ cls: 'gemini-modal-summary' });

    // Load summary
    this.loadSummary(summaryContainer);
  }

  private async loadSummary(container: HTMLElement) {
    this.isLoading = true;
    container.empty();

    // Loading state
    const loadingEl = container.createDiv({ cls: 'gemini-loading' });
    loadingEl.createDiv({ cls: 'gemini-loading-spinner' });
    loadingEl.createSpan({ text: 'Analyzing image...' });

    try {
      this.summary = await this.plugin.summaryManager.summarizeImage(this.file);
      this.isLoading = false;
      this.renderSummary(container);
    } catch (err) {
      this.isLoading = false;
      this.error = err instanceof Error ? err.message : 'Unknown error';
      this.renderError(container);
    }
  }

  private renderSummary(container: HTMLElement) {
    container.empty();

    if (!this.summary) {
      container.createSpan({ text: 'No summary available' });
      return;
    }

    container.createEl('p', { text: this.summary });

    // Actions
    const actionsEl = container.createDiv({ cls: 'gemini-modal-actions' });

    const copyBtn = actionsEl.createEl('button', { text: 'Copy' });
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(this.summary || '');
      new Notice('Summary copied to clipboard');
    });

    const insertBtn = actionsEl.createEl('button', { text: 'Insert in Note', cls: 'mod-cta' });
    insertBtn.addEventListener('click', () => {
      this.insertSummaryInActiveFile();
      this.close();
    });
  }

  private renderError(container: HTMLElement) {
    container.empty();

    const errorEl = container.createDiv({ cls: 'gemini-error' });
    errorEl.createSpan({ text: `Error: ${this.error}` });

    const retryBtn = container.createEl('button', { text: 'Retry' });
    retryBtn.addEventListener('click', () => {
      this.loadSummary(container);
    });
  }

  private async insertSummaryInActiveFile() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile || !this.summary) {
      new Notice('No active file to insert summary');
      return;
    }

    const editor = this.app.workspace.activeEditor?.editor;
    if (!editor) {
      new Notice('No active editor');
      return;
    }

    const cursor = editor.getCursor();
    const summaryText = `\n\n> [!summary] Image Summary\n> ${this.summary.split('\n').join('\n> ')}\n`;

    editor.replaceRange(summaryText, cursor);
    new Notice('Summary inserted');
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
