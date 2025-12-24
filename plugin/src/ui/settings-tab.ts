import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import GeminiSummaryPlugin from '../main';

export class GeminiSettingTab extends PluginSettingTab {
  plugin: GeminiSummaryPlugin;

  constructor(app: App, plugin: GeminiSummaryPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Gemini Summary Images Settings' });

    // API Configuration Section
    containerEl.createEl('h3', { text: 'API Configuration' });

    new Setting(containerEl)
      .setName('API Key')
      .setDesc('Your Google Gemini API key')
      .addText(text => text
        .setPlaceholder('Enter your API key')
        .setValue(this.plugin.settings.apiKey)
        .onChange(async (value) => {
          this.plugin.settings.apiKey = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Model')
      .setDesc('Gemini model to use for image analysis')
      .addDropdown(dropdown => dropdown
        .addOption('gemini-2.0-flash', 'Gemini 2.0 Flash')
        .addOption('gemini-1.5-flash', 'Gemini 1.5 Flash')
        .addOption('gemini-1.5-pro', 'Gemini 1.5 Pro')
        .setValue(this.plugin.settings.model)
        .onChange(async (value) => {
          this.plugin.settings.model = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Test Connection')
      .setDesc('Test the connection to Gemini API')
      .addButton(button => button
        .setButtonText('Test')
        .onClick(async () => {
          button.setButtonText('Testing...');
          button.setDisabled(true);

          const result = await this.plugin.summaryManager.testConnection();

          if (result.success) {
            new Notice('Connection successful!');
          } else {
            new Notice(`Connection failed: ${result.message}`);
          }

          button.setButtonText('Test');
          button.setDisabled(false);
        })
      );

    // Proxy Configuration Section
    containerEl.createEl('h3', { text: 'Proxy Configuration (Optional)' });

    new Setting(containerEl)
      .setName('Use Proxy')
      .setDesc('Route API calls through a proxy server')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useProxy)
        .onChange(async (value) => {
          this.plugin.settings.useProxy = value;
          await this.plugin.saveSettings();
          this.display(); // Refresh to show/hide proxy URL field
        })
      );

    if (this.plugin.settings.useProxy) {
      new Setting(containerEl)
        .setName('Proxy URL')
        .setDesc('URL of your Cloudflare Workers proxy')
        .addText(text => text
          .setPlaceholder('https://your-worker.workers.dev')
          .setValue(this.plugin.settings.proxyUrl)
          .onChange(async (value) => {
            this.plugin.settings.proxyUrl = value;
            await this.plugin.saveSettings();
          })
        );
    }

    // Summary Options Section
    containerEl.createEl('h3', { text: 'Summary Options' });

    new Setting(containerEl)
      .setName('Default Prompt')
      .setDesc('Default prompt used when summarizing images')
      .addTextArea(text => text
        .setPlaceholder('Enter your default prompt')
        .setValue(this.plugin.settings.defaultPrompt)
        .onChange(async (value) => {
          this.plugin.settings.defaultPrompt = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Insert Position')
      .setDesc('Where to insert the summary relative to the image')
      .addDropdown(dropdown => dropdown
        .addOption('below', 'Below the image')
        .addOption('above', 'Above the image')
        .setValue(this.plugin.settings.insertPosition)
        .onChange(async (value: 'above' | 'below') => {
          this.plugin.settings.insertPosition = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Show Notifications')
      .setDesc('Show notifications when analyzing images')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showNotifications)
        .onChange(async (value) => {
          this.plugin.settings.showNotifications = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Maximum Image Size (MB)')
      .setDesc('Maximum file size for images to analyze')
      .addSlider(slider => slider
        .setLimits(1, 20, 1)
        .setValue(this.plugin.settings.maxImageSize)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.maxImageSize = value;
          await this.plugin.saveSettings();
        })
      );

    // Cache Section
    containerEl.createEl('h3', { text: 'Cache' });

    const cacheStats = this.plugin.summaryManager.getCacheStats();

    new Setting(containerEl)
      .setName('Cached Summaries')
      .setDesc(`${cacheStats.count} summaries cached`)
      .addButton(button => button
        .setButtonText('Clear Cache')
        .onClick(() => {
          this.plugin.summaryManager.clearCache();
          new Notice('Cache cleared');
          this.display();
        })
      );
  }
}
