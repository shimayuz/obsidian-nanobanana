# Gemini Summary Images Plugin

An Obsidian plugin that generates AI-powered summary images for your notes using Google's Gemini and kie.ai's nano-banana-pro model.

## Features

- 🎨 Generate 4-5 beautiful summary images per note
- 🤖 Powered by Gemini 2.5 Flash for intelligent content analysis
- 🖼️ High-quality images from kie.ai's nano-banana-pro model
- 🔄 Two connection modes: Direct API (simple) or Proxy Server (advanced)
- 💾 Automatic backup with undo support
- 🎯 Smart positioning of images after relevant headings
- 📊 Progress tracking during generation

## Quick Start (Direct API Mode)

This is the recommended setup for most users - no server required!

### 1. Install the Plugin

1. Download the latest release from the [Releases page](https://github.com/your-username/obsidian-gemini-plugin/releases)
2. Extract to `YourVault/.obsidian/plugins/obsidian-gemini-plugin/`
3. Enable the plugin in Obsidian's Community Plugins settings

### 2. Get API Keys

#### Gemini API Key
1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Select an existing project or create a new one
4. Copy the API key (starts with `AIzaSy...`)

#### kie.ai API Key
1. Visit [kie.ai](https://kie.ai) and sign up
2. Navigate to your account settings or API section
3. Generate a new API key
4. Copy the API key (starts with `kie-...`)

### 3. Configure the Plugin

1. Open Obsidian Settings → Community Plugins → Gemini Summary Images → Options
2. Keep **Connection Mode** as "Direct API (Recommended)"
3. Enter your API keys:
   - **Gemini API Key**: Paste your key from step 2
   - **kie.ai API Key**: Paste your key from step 2
4. Adjust other settings as desired (image style, count, etc.)

### 4. Generate Images!

1. Open any markdown note
2. Press `Cmd/Ctrl + P` and search for "Generate summary images"
3. Watch the progress modal as images are generated
4. Images will be automatically inserted into your note

## Advanced Setup (Proxy Server Mode)

For users who want to:
- Share API keys across multiple devices
- Add rate limiting and usage tracking
- Keep API keys off local machines

### Option 1: Use Cloudflare Workers (Recommended)

1. Deploy the proxy server:
   ```bash
   # Clone the repository
   git clone https://github.com/your-username/obsidian-gemini-plugin.git
   cd obsidian-gemini-plugin/proxy
   
   # Deploy to Cloudflare Workers
   npm install -g wrangler
   wrangler login
   wrangler deploy
   ```

2. Set environment variables in Cloudflare dashboard:
   - `GEMINI_API_KEY`: Your Gemini API key
   - `KIE_API_KEY`: Your kie.ai API key
   - `AUTH_TOKENS`: Create a token like `ogsip_user123_abc`

3. Configure plugin:
   - Set **Connection Mode** to "Proxy Server (Advanced)"
   - **Proxy URL**: Your Worker URL (e.g., `https://your-worker.workers.dev`)
   - **Proxy Token**: The auth token you created

### Option 2: Run Locally

```bash
cd obsidian-gemini-plugin/proxy
npm install
npm run dev
```

Then configure plugin with:
- Proxy URL: `http://localhost:8787`
- Proxy Token: Your configured token

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Connection Mode | Direct API or Proxy Server | Direct API |
| Image Count | Number of images to generate | 4 |
| Image Style | Visual style for images | Infographic |
| Aspect Ratio | Image aspect ratio | 16:9 |
| Language | Language for titles/descriptions | Japanese |
| Attachment Folder | Where to save images | attachments/ai-summary |
| Create Backup | Save original note before changes | ✅ |

## Image Styles

- **Infographic**: Modern data visualization with clean design
- **Diagram**: Clear conceptual diagrams with geometric shapes
- **Card**: Summary cards with bold visual hierarchy
- **Whiteboard**: Hand-drawn educational style
- **Slide**: Professional presentation design

## Troubleshooting

### "Please configure your API keys"
- Check that you've entered both Gemini and kie.ai API keys
- Verify the keys don't have extra spaces
- Ensure connection mode is set to "Direct API"

### "Gemini API error"
- Verify your Gemini API key is valid
- Check if you've exceeded the free tier limits
- Try regenerating the key from Google AI Studio

### "kie.ai API error"
- Confirm your kie.ai subscription is active
- Check if you've hit rate limits
- Verify the API key has correct permissions

### "Image generation failed"
- The prompt might be too complex - try with shorter notes
- Check your internet connection
- kie.ai might be experiencing high demand - try again later

### "Image generation timed out"
- This can happen with complex prompts
- Try reducing the image count from 5 to 4
- Check if kie.ai is experiencing delays

## Development

```bash
# Clone the repository
git clone https://github.com/your-username/obsidian-gemini-plugin.git
cd obsidian-gemini-plugin

# Install dependencies
cd plugin && npm install

# Build the plugin
npm run build

# Development mode (with file watching)
npm run dev
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

- 📖 [Documentation](https://github.com/your-username/obsidian-gemini-plugin/wiki)
- 🐛 [Report Issues](https://github.com/your-username/obsidian-gemini-plugin/issues)
- 💬 [Discussions](https://github.com/your-username/obsidian-gemini-plugin/discussions)
