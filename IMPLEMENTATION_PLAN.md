# Obsidian Gemini Summary Images Plugin - Implementation Plan

## Overview

This plugin integrates Google Gemini AI with Obsidian to automatically summarize and describe images in your notes.

## Architecture

```
obsidian-nanobanana/
├── IMPLEMENTATION_PLAN.md
├── shared/
│   └── api-types.ts          # Shared types between plugin and proxy
├── plugin/
│   ├── package.json          # Plugin dependencies
│   ├── manifest.json         # Obsidian plugin manifest
│   ├── tsconfig.json         # TypeScript configuration
│   ├── esbuild.config.mjs    # Build configuration
│   ├── styles.css            # Plugin styles
│   └── src/
│       ├── main.ts           # Plugin entry point
│       ├── types.ts          # Plugin-specific types
│       ├── api/
│       │   └── gemini-client.ts    # Gemini API client
│       ├── core/
│       │   └── summary-manager.ts  # Summary management logic
│       ├── ui/
│       │   ├── settings-tab.ts     # Settings UI
│       │   └── summary-modal.ts    # Summary display modal
│       └── utils/
│           └── image-utils.ts      # Image processing utilities
└── proxy/
    ├── package.json          # Proxy dependencies
    ├── tsconfig.json         # TypeScript configuration
    ├── wrangler.toml         # Cloudflare Workers config
    └── src/
        ├── index.ts          # Worker entry point
        ├── routes/
        │   ├── health.ts     # Health check endpoint
        │   └── summarize.ts  # Image summarization endpoint
        ├── services/
        │   └── gemini.ts     # Gemini API service
        └── middleware/
            └── cors.ts       # CORS middleware
```

## Features

### Core Features
- [x] Summarize images using Gemini AI
- [x] Support multiple image formats (JPEG, PNG, GIF, WebP)
- [x] Context menu integration for images
- [x] Command palette commands
- [x] Customizable prompts
- [x] Summary caching

### Settings
- [x] API key configuration
- [x] Model selection (Gemini 2.0 Flash, 1.5 Flash, 1.5 Pro)
- [x] Proxy configuration (optional)
- [x] Default prompt customization
- [x] Insert position (above/below image)
- [x] Notification preferences
- [x] Maximum image size limit

### Proxy Server (Optional)
- [x] Cloudflare Workers deployment
- [x] CORS support
- [x] Health check endpoint
- [x] API key forwarding

## Setup Instructions

### Plugin Installation

1. Navigate to the plugin directory:
   ```bash
   cd plugin
   npm install
   ```

2. Build the plugin:
   ```bash
   npm run build
   ```

3. Copy the following files to your Obsidian vault's `.obsidian/plugins/gemini-summary-images/` folder:
   - `main.js`
   - `manifest.json`
   - `styles.css`

4. Enable the plugin in Obsidian settings

### Proxy Deployment (Optional)

The proxy is optional and only needed if you want to:
- Hide your API key from client-side code
- Add rate limiting or additional security

1. Navigate to the proxy directory:
   ```bash
   cd proxy
   npm install
   ```

2. Add your Gemini API key as a secret:
   ```bash
   wrangler secret put GEMINI_API_KEY
   ```

3. Deploy to Cloudflare Workers:
   ```bash
   npm run deploy
   ```

4. Configure the proxy URL in the plugin settings

## Usage

### Summarize Single Image
1. Right-click on an image in the file explorer
2. Select "Summarize with Gemini"
3. View the summary in the modal
4. Optionally insert the summary into your note

### Summarize Image in Editor
1. Place cursor on a line with an image
2. Open command palette (Cmd/Ctrl + P)
3. Run "Summarize image under cursor"

### Summarize All Images in Note
1. Open command palette
2. Run "Summarize all images in current note"

## API Models

| Model | Description | Best For |
|-------|-------------|----------|
| gemini-2.0-flash | Latest, fastest model | Quick summaries |
| gemini-1.5-flash | Fast and efficient | Balanced performance |
| gemini-1.5-pro | Most capable | Detailed analysis |

## Troubleshooting

### Common Issues

1. **"API key is not configured"**
   - Add your Gemini API key in plugin settings

2. **"Image exceeds maximum size"**
   - Increase the max image size in settings
   - Or compress the image before analysis

3. **"Connection failed"**
   - Check your internet connection
   - Verify API key is correct
   - Try the "Test Connection" button in settings

## License

MIT
