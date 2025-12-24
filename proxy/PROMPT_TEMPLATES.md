# プロンプトテンプレート設計

## 1. Plan生成プロンプト（Gemini Flash用）

### システムプロンプト

```
You are an expert at analyzing documents and planning visual summaries.
Your task is to analyze the given note content and create a plan for generating
{{imageCount}} summary images that will help readers understand the key concepts.

## Output Requirements
- Generate exactly {{imageCount}} image plans
- Each image should capture a distinct aspect of the content
- Images should be placed after relevant headings
- Generate prompts suitable for an AI image generator

## Output Format (JSON only, no markdown)
{
  "items": [
    {
      "id": "img1",
      "title": "Brief title for the image",
      "afterHeading": "# Exact heading text from the note",
      "prompt": "Detailed image generation prompt...",
      "description": "Alt text description of what the image shows"
    }
  ]
}

## Image Prompt Guidelines
- Be specific about layout, colors, and visual elements
- Include "infographic style", "diagram", "visual summary", etc. based on style
- Avoid text-heavy images (AI image generators struggle with text)
- Focus on visual metaphors, icons, and diagrams
- Always specify: clean, professional, modern design

## Style-specific instructions
{{styleInstructions}}
```

### スタイル別インストラクション

```typescript
const STYLE_INSTRUCTIONS: Record<ImageStyle, string> = {
  infographic: `
    - Create data visualization focused images
    - Use charts, graphs, statistics bubbles
    - Color-coded sections with clear hierarchy
    - Icons representing key metrics
    - Modern flat design aesthetic
  `,

  diagram: `
    - Create structural/flow diagrams
    - Use boxes, arrows, connections
    - Show relationships between concepts
    - Hierarchical or network layouts
    - Minimal text, focus on visual structure
  `,

  card: `
    - Create clean summary cards
    - 3-5 key points with icons
    - Bold visual hierarchy
    - Gradient or solid color backgrounds
    - Modern UI card design
  `,

  whiteboard: `
    - Hand-drawn sketch style
    - Informal arrows and connectors
    - Doodles and simple icons
    - Warm, approachable aesthetic
    - Mind-map like organization
  `,

  slide: `
    - Professional presentation style
    - Title + 3-4 bullet points layout
    - Corporate color scheme
    - Clean typography focus
    - Suitable for business context
  `,
};
```

### ユーザープロンプト

```
Analyze the following note and create a plan for {{imageCount}} summary images.
Use {{language}} language for titles and descriptions.

## Note Content
{{noteContent}}

## Available Headings
{{headingsList}}

Generate the image plan now. Output JSON only.
```

---

## 2. 画像生成プロンプト（Imagen用）

### ベーステンプレート

```
{{stylePrefix}}

{{userPrompt}}

Style specifications:
- Clean, professional design
- High contrast, readable from small size
- No watermarks or logos
- Modern aesthetic
- Aspect ratio: {{aspectRatio}}

{{stylePostfix}}
```

### スタイル別プレフィックス/ポストフィックス

```typescript
const IMAGE_PROMPT_STYLES: Record<ImageStyle, { prefix: string; postfix: string }> = {
  infographic: {
    prefix: "Create a modern infographic visualization.",
    postfix: "Use flat design, data-driven icons, clean color palette. No photographs."
  },

  diagram: {
    prefix: "Create a clear conceptual diagram.",
    postfix: "Use geometric shapes, connecting arrows, hierarchical layout. Minimal style."
  },

  card: {
    prefix: "Create a summary card design.",
    postfix: "Use bold typography placeholders, icon grid, gradient background. UI/UX style."
  },

  whiteboard: {
    prefix: "Create a hand-drawn whiteboard sketch.",
    postfix: "Use loose sketchy lines, warm colors, informal doodle style. Educational feel."
  },

  slide: {
    prefix: "Create a professional presentation slide design.",
    postfix: "Use corporate color scheme, structured layout, subtle gradients. Business style."
  },
};
```

---

## 3. プロンプト構築関数

```typescript
import type { ImageStyle, Language } from '../shared/api-types';

interface BuildPlanPromptOptions {
  noteContent: string;
  headings: string[];
  imageCount: number;
  style: ImageStyle;
  language: Language;
}

export function buildPlanPrompt(options: BuildPlanPromptOptions): {
  system: string;
  user: string;
} {
  const { noteContent, headings, imageCount, style, language } = options;

  const system = PLAN_SYSTEM_PROMPT
    .replace('{{imageCount}}', String(imageCount))
    .replace('{{styleInstructions}}', STYLE_INSTRUCTIONS[style]);

  const user = PLAN_USER_PROMPT
    .replace('{{imageCount}}', String(imageCount))
    .replace('{{language}}', language === 'ja' ? 'Japanese' : 'English')
    .replace('{{noteContent}}', noteContent)
    .replace('{{headingsList}}', headings.map(h => `- ${h}`).join('\n'));

  return { system, user };
}

interface BuildImagePromptOptions {
  userPrompt: string;
  style: ImageStyle;
  aspectRatio: string;
}

export function buildImagePrompt(options: BuildImagePromptOptions): string {
  const { userPrompt, style, aspectRatio } = options;
  const { prefix, postfix } = IMAGE_PROMPT_STYLES[style];

  return IMAGE_BASE_TEMPLATE
    .replace('{{stylePrefix}}', prefix)
    .replace('{{userPrompt}}', userPrompt)
    .replace('{{aspectRatio}}', aspectRatio)
    .replace('{{stylePostfix}}', postfix);
}
```

---

## 4. JSONバリデーション

```typescript
import { z } from 'zod';

export const PlanItemSchema = z.object({
  id: z.string().regex(/^img[1-5]$/),
  title: z.string().min(1).max(100),
  afterHeading: z.string().min(1),
  prompt: z.string().min(10).max(1000),
  description: z.string().min(1).max(500),
});

export const PlanOutputSchema = z.object({
  items: z.array(PlanItemSchema).min(1).max(5),
});

export function validatePlanOutput(raw: unknown): z.infer<typeof PlanOutputSchema> {
  return PlanOutputSchema.parse(raw);
}
```

---

## 5. エラーハンドリング

### Gemini APIエラー時のフォールバック

```typescript
async function generatePlanWithRetry(
  options: BuildPlanPromptOptions,
  maxRetries = 2
): Promise<PlanResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await callGeminiFlash(options);
      const parsed = JSON.parse(result);
      return validatePlanOutput(parsed);
    } catch (error) {
      lastError = error as Error;

      // JSON解析エラーの場合、プロンプトを厳格化してリトライ
      if (error instanceof SyntaxError && attempt < maxRetries) {
        options = {
          ...options,
          // より厳格なJSONのみ出力を要求
          noteContent: options.noteContent + '\n\nIMPORTANT: Output ONLY valid JSON, no markdown formatting.',
        };
        continue;
      }

      // レート制限の場合は待機
      if (isRateLimitError(error) && attempt < maxRetries) {
        await sleep(2000 * (attempt + 1)); // exponential backoff
        continue;
      }
    }
  }

  throw lastError;
}
```

---

## 6. トークン最適化

### ノート圧縮戦略

```typescript
interface CompressOptions {
  maxChars: number;
  preserveHeadings: boolean;
  summarizeCode: boolean;
}

export function compressNoteContent(
  content: string,
  options: CompressOptions
): string {
  const { maxChars, preserveHeadings, summarizeCode } = options;

  let result = content;

  // 1. Frontmatter除去
  result = result.replace(/^---[\s\S]*?---\n/, '');

  // 2. コードブロック圧縮
  if (summarizeCode) {
    result = result.replace(
      /```(\w+)?\n[\s\S]*?```/g,
      (match, lang) => `[code block: ${lang || 'unknown'}]`
    );
  }

  // 3. 見出し保持で本文を圧縮
  if (preserveHeadings && result.length > maxChars) {
    const sections = splitByHeadings(result);
    const charPerSection = Math.floor(maxChars / sections.length);

    result = sections
      .map(section => {
        if (section.content.length <= charPerSection) {
          return section.full;
        }
        return `${section.heading}\n${section.content.slice(0, charPerSection)}...`;
      })
      .join('\n\n');
  }

  // 4. 最終トリミング
  if (result.length > maxChars) {
    result = result.slice(0, maxChars) + '\n\n[truncated]';
  }

  return result;
}
```
