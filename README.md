# Obsidian NanoBanana Plugin

An Obsidian plugin that automatically generates AI-powered summary images for your Markdown documents using OpenAI GPT and kie.ai's nano-banana-pro model.

## Features

- 🎨 Analyze Obsidian document content and auto-generate up to 8 beautiful summary images
- 🤖 Intelligent plan generation powered by OpenAI GPT-5-mini (optimal image planning per heading)
- 🖼️ High-quality image generation from kie.ai's nano-banana-pro model
- 🔄 Two connection modes: Direct API (simple) or Proxy Server (advanced)
- 💾 Automatic backup with Undo support
- 🎯 Smart positioning of images after headings
- 📊 Real-time progress display (including polling status)
- 🗑️ Bulk delete AI images command

## Quick Start (Direct API Mode)

Recommended setup for most users - no server required!

### 1. Install the Plugin

1. Download the latest release from the [Releases page](https://github.com/shimayuz/obsidian-nanobanana/releases)
2. Extract to `YourVault/.obsidian/plugins/obsidian-nanobanana/`
3. Enable the plugin in Obsidian's Community Plugins settings

### 2. Get API Keys

#### OpenAI API Key (for plan generation)
1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Click "Create new secret key"
3. Copy the API key (starts with `sk-...`)

#### kie.ai API Key (for image generation)
1. Visit [kie.ai](https://kie.ai) and sign up
2. Navigate to your account settings or API section
3. Generate a new API key
4. Copy the API key

### 3. Configure the Plugin

1. Open Obsidian Settings → Community Plugins → Gemini Summary Images → Settings
2. Keep **Connection Mode** as "Direct API (Recommended)"
3. Enter your API keys:
   - **OpenAI API Key**: For plan generation (`sk-...`)
   - **kie.ai API Key**: For image generation
4. Adjust other settings as needed

### 4. Generate Images!

1. Open any Obsidian document (.md)
2. Press `Cmd/Ctrl + P` and search for "Generate Summary Images"
3. Watch the real-time progress in the modal
4. Images will be automatically inserted after headings

## Commands

| Command | Description |
|---------|-------------|
| Generate Summary Images | Generate summary images for current document |
| Undo Last Image Injection | Undo the last image injection |
| Remove All AI Images from Current Note | Remove all AI images from current document |
| Show Last Backup | Show the latest backup |

## Advanced Setup (Proxy Server Mode)

For users who want to:
- Share API keys across multiple devices
- Add rate limiting and usage tracking
- Keep API keys off local machines

### Using Cloudflare Workers

1. Deploy the proxy server:
   ```bash
   git clone https://github.com/shimayuz/obsidian-nanobanana.git
   cd obsidian-nanobanana/proxy
   
   npm install -g wrangler
   wrangler login
   wrangler deploy
   ```

2. Set environment variables in Cloudflare dashboard:
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `KIE_API_KEY`: Your kie.ai API key
   - `AUTH_TOKENS`: Auth token (e.g., `ogsip_user123_abc`)

3. Configure plugin:
   - **Connection Mode**: "Proxy Server (Advanced)"
   - **Proxy URL**: Your Worker URL
   - **Proxy Token**: The auth token you created

## Settings

### Connection Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Connection Mode | Direct API or Proxy Server | Direct API |
| OpenAI API Key | For plan generation (Direct API mode) | - |
| kie.ai API Key | For image generation (Direct API mode) | - |
| Proxy URL | Proxy server URL (Proxy mode) | - |
| Proxy Token | Auth token (Proxy mode) | - |

### Generation Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Max Image Count | Maximum number of images (1-8) | 8 |
| Image Style | Visual style for images | Infographic |
| Aspect Ratio | Image aspect ratio | 16:9 |
| Language | Language for titles/descriptions | Japanese |

### Content Processing

| Setting | Description | Default |
|---------|-------------|---------|
| Send Mode | Amount of content to send to AI | Headings + excerpts |
| Max Characters | Maximum characters to send | 30000 |

### Storage Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Attachment Folder | Where to save images | attachments/ai-summary |
| Create Backup | Backup document before changes | ON |
| Backup Location | Plugin data or Vault | Plugin data |

## Image Styles

- **Infographic**: Modern data visualization with clean design
- **Diagram**: Clear conceptual diagrams with geometric shapes
- **Summary Card**: Summary cards with bold visual hierarchy
- **Whiteboard**: Hand-drawn educational style
- **Slide**: Professional presentation design

## Generation Flow

1. **Plan Generation**: OpenAI GPT-5-mini analyzes the document and creates optimal image plans for each heading
2. **Image Generation**: kie.ai nano-banana-pro generates images based on each plan (async polling)
3. **Save**: Generated images are saved to the specified folder
4. **Inject**: Images are automatically inserted at appropriate positions in the document

## Troubleshooting

### "Please configure your API keys in settings"
- Check that both OpenAI and kie.ai API keys are entered
- Verify keys don't have extra spaces
- Ensure connection mode is set to "Direct API"

### "OpenAI API error"
- Verify your OpenAI API key is valid
- Check if you have remaining API credits
- Regenerate key from [OpenAI Platform](https://platform.openai.com/)

### "kie.ai API error"
- Confirm your kie.ai account is active
- Check if you've hit rate limits
- Verify the API key has correct permissions

### "Failed to generate image"
- The prompt might be too complex - try with shorter documents
- Check your internet connection
- kie.ai might be experiencing high demand - try again later

### Images not generating
- Check max image count setting
- Verify document has headings (#, ##, ###)
- Check console logs for errors (Cmd/Ctrl + Shift + I)

## Development

```bash
# Clone the repository
git clone https://github.com/shimayuz/obsidian-nanobanana.git
cd obsidian-nanobanana

# Install plugin dependencies
cd plugin && npm install

# Build the plugin
npm run build

# Development mode (with file watching)
npm run dev
```

### Directory Structure

```
obsidian-nanobanana/
├── plugin/           # Obsidian plugin
│   ├── src/
│   │   ├── main.ts          # Entry point
│   │   ├── types.ts         # Type definitions
│   │   ├── api/             # API clients
│   │   ├── core/            # Core logic
│   │   └── ui/              # UI components
│   └── manifest.json
├── proxy/            # Cloudflare Workers proxy
└── shared/           # Shared type definitions
```

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

- 🐛 [Report Issues](https://github.com/shimayuz/obsidian-nanobanana/issues)
- 💬 [Discussions](https://github.com/shimayuz/obsidian-nanobanana/discussions)
