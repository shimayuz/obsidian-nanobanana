/**
 * Gemini API サービス（Plan生成専用）
 *
 * 画像生成は kie.ai API (nano-banana-pro) を使用
 * → kie-ai.ts を参照
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { PlanRequest, PlanItem, ImageStyle } from '../../../shared/api-types';

// Plan生成の出力スキーマ
interface PlanOutput {
  items: PlanItem[];
}

// スタイル別のプロンプト指示
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

// Liquid Glassスタイルの詳細指示（infographicの拡張版として使用）
const LIQUID_GLASS_INSTRUCTIONS = `
## Liquid Glass (Apple-like) + List Infographic Style (16:9)

### Visual Theme (Liquid Glass)
- Use translucent frosted-glass panels (layered cards) with soft blur, subtle refraction feel, and specular highlights.
- Glass panels should feel "tinted" by accent colors, but keep high legibility and ample whitespace.

### Recommended Color Palette (Apple System Colors as Liquid Glass tints)
- Base / Background:
  - Light neutral background: #F2F2F7 (soft gray-white)
  - Primary text: #000000
  - Separator / hairline: #787880 at 20% opacity (rgba(120,120,128,0.20))
- Accent tints (use 1-2 per slide, do NOT rainbow everything):
  - systemTeal:  #5AC8FA
  - systemBlue:  #007AFF
  - systemIndigo:#5856D6
  - systemPurple:#AF52DE
  - systemPink:  #FF2D55
  - (Optional for emphasis only) systemGreen #34C759, systemOrange #FF9500, systemYellow #FFCC00, systemRed #FF3B30
- If you use gradients, prefer "teal → blue → purple" as the main Liquid Glass gradient accent.

### Layout Rule (List-style Infographic)
- Each slide must be a LIST infographic:
  - Vertical stack of 4-7 items (cards or rows).
  - Each item: icon/bullet → short label → optional micro-sublabel (very short).
  - Use consistent spacing, alignment, and repeating rhythm (grid).
- Allow variants across images while staying list-based:
  - numbered list, checklist, "steps" list, pros/cons list, timeline-as-list, glossary list.

### Typography
- Use clean, modern sans-serif typography for all text (title, labels, captions).
- Minimum font size: 24px (no small text).
- Keep text minimal: short labels only (3-6 words max per label). Avoid paragraphs.

### Shape & Components
- Rounded corners everywhere (cards, pills, chips): large radius (e.g., 16-24px).
- Use subtle shadows, soft inner highlights on glass cards, and clean icon style (consistent stroke weight).

### Quality / Negative Constraints
- No dense text blocks, no tiny legends, no screenshots, no watermarks/logos.
- Prioritize clarity: strong contrast between text and glass surface.
`;

export class GeminiService {
  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Plan生成（テキストモデル使用）
   */
  async generatePlan(request: PlanRequest): Promise<PlanOutput> {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-05-20' });

    const systemPrompt = this.buildPlanSystemPrompt(request);
    const userPrompt = this.buildPlanUserPrompt(request);

    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] },
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 4096,
      },
    });

    const response = result.response;
    const text = response.text();

    // JSONを抽出（コードブロックで囲まれている場合も対応）
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from response');
    }

    const json = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(json) as PlanOutput;

    // バリデーション
    if (!parsed.items || !Array.isArray(parsed.items)) {
      throw new Error('Invalid plan output structure');
    }

    // 件数制限
    parsed.items = parsed.items.slice(0, request.settings.imageCount);

    return parsed;
  }

  /**
   * Plan生成用システムプロンプトを構築
   */
  private buildPlanSystemPrompt(request: PlanRequest): string {
    const { imageCount, style, language } = request.settings;
    // infographicスタイルの場合はLiquid Glassの詳細指示を使用
    const styleInstructions = style === 'infographic' ? LIQUID_GLASS_INSTRUCTIONS : STYLE_INSTRUCTIONS[style];

    return `You are a document analyst and visual storyboarder for 16:9 infographic slides.
You will read the provided note content (Markdown) and plan ${imageCount} summary images.
Each planned image must help readers quickly grasp key concepts of a specific section.

## Core Goal
Create exactly ${imageCount} distinct image plans that:
- cover the most important ideas across the whole note
- map each image to ONE relevant H1/H2 section
- are suitable prompts for an AI image generator (kie.ai nano-banana-pro / Gemini Nano Banana Pro)

## What the input looks like
- The note is Markdown.
- Major section headings are H1 (# ...) or H2 (## ...).
- Content under a heading belongs to that section until the next H1/H2.

## Required Output (JSON only)
Return a single valid JSON object and nothing else (no markdown, no commentary).
Use this exact schema:
{
  "items": [
    {
      "id": "img1",
      "title": "Brief title for the image",
      "afterHeading": "# Exact heading line from the note (including leading # or ##)",
      "prompt": "Detailed image generation prompt...",
      "description": "Alt text description of what the image shows"
    }
  ]
}

## Hard Constraints
- Output EXACTLY ${imageCount} items in "items".
- "id" must be sequential: img1, img2, ... img${imageCount}.
- "afterHeading" MUST be copied EXACTLY from the note content:
  - include the leading # or ## and the exact spacing/punctuation.
  - do NOT invent headings.
  - If the note contains no H1/H2 at all, set afterHeading to an empty string "".
- Each item must represent a DISTINCT aspect (no duplicates, no near-duplicates).
- Prefer coverage across the full article (beginning/middle/end), not only the intro.

## Selection Logic (how to choose sections)
- If the note has more sections than ${imageCount}, pick the most conceptually important sections.
- If the note has fewer sections than ${imageCount}, reuse the most important headings but change the angle:
  (e.g., overview → process → framework → examples → checklist), while keeping each image distinct.

## Image Prompt Guidelines (Nano Banana Pro friendly)
Each "prompt" must describe a single 16:9 wide slide infographic.
Include ALL of the following in every prompt:
- Aspect ratio: 16:9, wide slide, clean margins, grid-based layout
- Visual style: clean, professional, modern design
- Composition: clear hierarchy, large shapes, simple icons, minimal text
- Text policy: avoid paragraphs; allow only short labels (max ~3-6 words per label)
- Output feel: crisp vector/infographic look, high legibility, not photo-heavy
- Avoid: watermarks, logos, UI screenshots, dense text blocks, illegible small text, chaotic clutter

Also include:
- "${style}" style visual elements
- a cohesive color palette and consistent icon style
- clear visual metaphor or diagram type (e.g., flowchart, timeline, pyramid, quadrant, layered stack, map, checklist)

## Prompt Content Structure (recommended)
- Background + layout (16:9, grid, whitespace)
- Main diagram type + key visual elements
- Supporting icons/illustrations
- Minimal labels (language-dependent) + callouts
- Final quality cues (sharp edges, balanced spacing)

## Style-specific instructions
${styleInstructions}

## Language Rules
- "title" and "description" must be in ${language === 'ja' ? 'Japanese' : 'English'}.
- "prompt" should be written in English-friendly generator language, but any label text you ask to appear in the image should be in ${language === 'ja' ? 'Japanese' : 'English'} (keep it minimal).`;
  }

  /**
   * Plan生成用ユーザープロンプトを構築
   */
  private buildPlanUserPrompt(request: PlanRequest): string {
    return `## Note Content
${request.noteContent}

Now output the JSON.`;
  }
}
