/**
 * Direct API Client - OpenAIとkie.aiを直接呼び出す
 */

import { requestUrl, RequestUrlResponse } from 'obsidian';
import type {
  PlanRequest,
  PlanResponse,
  ImageCreateRequest,
  ImageCreateResponse,
  ImageStatusResponse,
} from '../../../shared/api-types';
import type { PluginSettings, ParsedNote } from '../types';

/** 進捗コールバック */
export type ProgressCallback = (progress: {
  status: string;
  message: string;
  progress?: number;
}) => void;

export class DirectApiClient {
  private openaiApiKey: string;
  private kieApiKey: string;

  constructor(settings: PluginSettings) {
    this.openaiApiKey = settings.openaiApiKey;
    this.kieApiKey = settings.kieApiKey;
  }

  /**
   * Plan生成APIを呼び出す（OpenAI gpt-5-mini）
   */
  async generatePlan(parsed: ParsedNote, settings: PluginSettings): Promise<PlanResponse> {
    if (!this.openaiApiKey) {
      throw new Error('OpenAI API key is required');
    }

    const compressedContent = this.compressContent(parsed, settings.maxCharacters);

    const systemPrompt = `あなたは画像生成プランを作成するエキスパートです。以下の指示に従って、ノート記事の内容を要約し、見出しの数だけ画像生成プランを作成してください（最大${settings.maxImageCount}枚まで）。

## Liquid Glass (Apple-like) + List Infographic Style (16:9)

### Visual Theme (Liquid Glass)
- Use translucent frosted-glass panels (layered cards) with soft blur, subtle refraction feel, and specular highlights.
- Glass panels should feel "tinted" by accent colors, but keep high legibility and ample whitespace.

### Recommended Color Palette (Apple System Colors as Liquid Glass tints)
- Base / Background:
  - Light neutral background: #F2F2F7 (soft gray-white)
  - Primary text: #000000
  - Separator / hairline: rgba(120,120,128,0.20)
- Accent tints (use 1–2 per slide, do NOT rainbow everything):
  - systemTeal:   #5AC8FA
  - systemBlue:   #007AFF
  - systemIndigo: #5856D6
  - systemPurple: #AF52DE
  - systemPink:   #FF2D55
  - Optional for emphasis only:
    - systemGreen:  #34C759
    - systemOrange: #FF9500
    - systemYellow: #FFCC00
    - systemRed:    #FF3B30
- If you use gradients, prefer "teal → blue → purple" as the main Liquid Glass gradient accent.

### Layout Rule (List-style Infographic)
- Each slide must be a LIST infographic:
  - Vertical stack of 4–7 items (cards or rows).
  - Each item: icon/bullet → short label → optional micro-sublabel (very short).
  - Use consistent spacing, alignment, and repeating rhythm (grid).
- Allow variants across images while staying list-based:
  - numbered list, checklist, steps list, pros/cons list, timeline-as-list, glossary list.

### Typography (M PLUS 1)
- Use "M PLUS 1" for all text (title, labels, captions).
- Minimum font size: 24px (no small text).
- Keep text minimal: short labels only (3–6 words max per label). Avoid paragraphs.

### Shape & Components
- Rounded corners everywhere (cards, pills, chips): large radius (16–24px).
- Use subtle shadows, soft inner highlights on glass cards, and consistent icon stroke weight.

### Quality / Negative Constraints
- No dense text blocks, no tiny legends, no screenshots, no watermarks/logos.
- Prioritize clarity: strong contrast between text and glass surface.

必ず以下のJSON形式のみで出力してください。説明文は不要です。
{
  "items": [
    {
      "id": "img1",
      "title": "画像のタイトル",
      "afterHeading": "挿入位置の見出し（ノート内の実際の見出しテキスト）",
      "prompt": "画像生成プロンプト（${settings.imageStyle}スタイル、${settings.language}言語、上記Liquid Glassスタイル指示を含む詳細なプロンプト）",
      "description": "画像の説明"
    }
  ]
}`;

    const userPrompt = `以下のノート記事の内容を最初から最後まで熟読し、その内容を要約したうえで、見出しの数だけ画像生成プランを作成してください。

ノート内容:
${compressedContent}`;

    try {
      const requestBody = {
        model: 'gpt-5-mini-2025-08-07',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: 16384,
        response_format: { type: 'json_object' }
      };
      
      console.log('� OpenAI API: Generating plan...');
      
      const fetchResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify(requestBody)
      });

      const responseData = await fetchResponse.json();

      if (!fetchResponse.ok) {
        console.error('❌ OpenAI API error:', responseData?.error?.message);
        throw new Error(`OpenAI API error: ${fetchResponse.status} - ${responseData?.error?.message || JSON.stringify(responseData)}`);
      }

      const text = responseData.choices[0].message.content;
      
      if (!text || text.trim() === '') {
        console.error('❌ Empty response from OpenAI');
        throw new Error('OpenAI returned empty response. Try again.');
      }
      
      console.log('✅ OpenAI API: Plan generated successfully');
      
      const plan = JSON.parse(text);
      
      return {
        version: '1',
        items: plan.items || [],
        metadata: {
          noteHash: this.computeHash(parsed.rawContent),
          generatedAt: new Date().toISOString(),
        }
      };
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error(`Failed to generate plan: ${error}`);
    }
  }

  /**
   * 画像生成（kie.ai直接呼び出し）
   * kie.aiは非同期生成なのでポーリングが必要
   */
  async generateImage(
    prompt: string,
    settings: PluginSettings,
    onProgress?: ProgressCallback
  ): Promise<ArrayBuffer> {
    if (!this.kieApiKey) {
      throw new Error('kie.ai API key is required');
    }

    onProgress?.({ status: 'creating', message: 'Creating image generation task...' });

    console.log('🎨 kie.ai: Creating image task...');

    try {
      // 1. タスク作成
      const createResponse = await requestUrl({
        url: 'https://api.kie.ai/api/v1/jobs/createTask',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.kieApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'nano-banana-pro',
          input: {
            prompt: prompt,
            aspect_ratio: settings.aspectRatio || '1:1',
            resolution: '1K',
            output_format: 'png'
          }
        })
      });

      if (createResponse.status >= 400) {
        throw new Error(`kie.ai API error: ${createResponse.status}`);
      }

      const taskData = createResponse.json as any;
      const jobId = taskData.data?.taskId || taskData.taskId;

      if (!jobId) {
        throw new Error('No job_id in response');
      }

      console.log('🎨 kie.ai: Task created, polling for result...');
      onProgress?.({ status: 'generating', message: 'Generating image...' });

      // 2. ポーリング
      let attempts = 0;
      const maxAttempts = 60; // 最大5分

      // 最初のポーリングまで少し待機
      await new Promise(resolve => setTimeout(resolve, 2000));

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5秒待機

        // recordInfoエンドポイントでステータス確認
        const statusUrl = `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${jobId}`;
        
        const statusResponse = await requestUrl({
          url: statusUrl,
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.kieApiKey}`,
          }
        });
        
        if (statusResponse.status >= 400) {
          throw new Error(`Failed to check status: ${statusResponse.status}`);
        }
        
        const statusData = statusResponse.json as any;
        
        // state: waiting, queuing, generating, success, fail
        if (statusData.code === 200 && statusData.data?.state === 'success') {
          // resultJsonは文字列なのでパースが必要
          let resultUrls: string[] = [];
          if (statusData.data?.resultJson) {
            try {
              const resultData = JSON.parse(statusData.data.resultJson);
              resultUrls = resultData.resultUrls || [];
            } catch (e) {
              console.error('Failed to parse resultJson:', e);
            }
          }
          
          if (resultUrls.length > 0) {
            onProgress?.({ status: 'downloading', message: 'Downloading image...' });
            
            // 画像ダウンロード
            const imageResponse = await requestUrl({
              url: resultUrls[0],
              method: 'GET',
            });

            if (imageResponse.status >= 400) {
              throw new Error(`Failed to download image: ${imageResponse.status}`);
            }

            console.log('✅ kie.ai: Image generated successfully');
            return imageResponse.arrayBuffer;
          }
        }

        if (statusData.data?.state === 'fail') {
          console.error('❌ kie.ai: Image generation failed');
          throw new Error(`Image generation failed: ${statusData.data?.failMsg || 'Unknown error'}`);
        }

        attempts++;
        onProgress?.({ 
          status: 'generating', 
          message: `Generating image... (${attempts}/${maxAttempts})`,
          progress: (attempts / maxAttempts) * 100
        });
      }

      throw new Error('Image generation timed out');
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error(`Failed to generate image: ${error}`);
    }
  }

  /**
   * スタイルに基づいてプロンプトを強化
   */
  private enhancePrompt(prompt: string, style: string): string {
    const styleModifiers: Record<string, { prefix: string; suffix: string }> = {
      infographic: {
        prefix: 'Create a modern infographic visualization.',
        suffix: 'Use flat design, data-driven icons, clean color palette. Professional infographic style.',
      },
      diagram: {
        prefix: 'Create a clear conceptual diagram.',
        suffix: 'Use geometric shapes, connecting arrows, hierarchical layout. Minimal diagram style.',
      },
      card: {
        prefix: 'Create a summary card design.',
        suffix: 'Use bold visual hierarchy, icon grid, gradient background. Modern UI card style.',
      },
      whiteboard: {
        prefix: 'Create a hand-drawn whiteboard sketch.',
        suffix: 'Use loose sketchy lines, warm colors, informal doodle style. Educational whiteboard feel.',
      },
      slide: {
        prefix: 'Create a professional presentation slide design.',
        suffix: 'Use corporate color scheme, structured layout, subtle gradients. Business slide style.',
      },
    };

    const modifier = styleModifiers[style] || styleModifiers.infographic;
    return `${modifier.prefix}\n\n${prompt}\n\n${modifier.suffix}`;
  }

  /**
   * ノート内容を圧縮してトークンを節約
   */
  private compressContent(parsed: ParsedNote, maxChars: number): string {
    // frontmatterを除外した内容
    let content = parsed.rawContent;

    // frontmatter除去
    content = content.replace(/^---[\s\S]*?---\n/, '');

    // コードブロックを圧縮
    content = content.replace(
      /```(\w+)?\n[\s\S]*?```/g,
      (_match, lang) => `[code block: ${lang || 'code'}]`
    );

    // 長すぎる場合はセクションごとに圧縮
    if (content.length > maxChars) {
      const charPerSection = Math.floor(maxChars / parsed.sections.length);
      content = parsed.sections
        .map((section) => {
          const sectionContent = section.content.slice(0, charPerSection);
          return `${section.heading}\n${sectionContent}${section.content.length > charPerSection ? '...' : ''}`;
        })
        .join('\n\n');
    }

    // 最終トリミング
    if (content.length > maxChars) {
      content = content.slice(0, maxChars) + '\n\n[truncated]';
    }

    return content;
  }

  /**
   * シンプルなハッシュ計算
   */
  private computeHash(content: string): string {
    let hash = 0;
    if (content.length === 0) return hash.toString(16);

    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    return Math.abs(hash).toString(16);
  }
}
