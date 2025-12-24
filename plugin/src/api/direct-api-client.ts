/**
 * Direct API Client - Geminiとkie.aiを直接呼び出す
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
  private geminiApiKey: string;
  private kieApiKey: string;

  constructor(settings: PluginSettings) {
    this.geminiApiKey = settings.geminiApiKey;
    this.kieApiKey = settings.kieApiKey;
  }

  /**
   * Plan生成APIを呼び出す（Gemini直接）
   */
  async generatePlan(parsed: ParsedNote, settings: PluginSettings): Promise<PlanResponse> {
    if (!this.geminiApiKey) {
      throw new Error('Gemini API key is required');
    }

    const compressedContent = this.compressContent(parsed, settings.maxCharacters);

    const prompt = `以下のノート内容を要約し、${settings.imageCount}個の画像生成プランを作成してください。

各画像について以下のJSON形式で生成してください：
{
  "items": [
    {
      "id": "img1",
      "title": "画像のタイトル",
      "afterHeading": "挿入位置の見出し",
      "prompt": "画像生成プロンプト（${settings.imageStyle}スタイル、${settings.language}言語）",
      "description": "画像の説明"
    }
  ]
}

ノート内容:
${compressedContent}`;

    try {
      const response = await requestUrl({
        url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.geminiApiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        })
      });

      if (response.status >= 400) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = response.json as any;
      const text = data.candidates[0].content.parts[0].text;
      
      // JSON部分を抽出
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to parse plan from Gemini response');
      }

      const plan = JSON.parse(jsonMatch[0]);
      
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
            prompt: this.enhancePrompt(prompt, settings.imageStyle),
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
      const jobId = taskData.job_id;

      if (!jobId) {
        throw new Error('No job_id in response');
      }

      onProgress?.({ status: 'generating', message: 'Generating image...' });

      // 2. ポーリング
      let attempts = 0;
      const maxAttempts = 60; // 最大5分

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5秒待機

        const statusResponse = await requestUrl({
          url: `https://api.kie.ai/api/v1/jobs/${jobId}`,
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.kieApiKey}`,
          }
        });

        if (statusResponse.status >= 400) {
          throw new Error(`Failed to check status: ${statusResponse.status}`);
        }

        const statusData = statusResponse.json as any;
        
        if (statusData.status === 'completed' && statusData.output?.image_url) {
          onProgress?.({ status: 'downloading', message: 'Downloading image...' });
          
          // 3. 画像ダウンロード
          const imageResponse = await requestUrl({
            url: statusData.output.image_url,
            method: 'GET',
          });

          if (imageResponse.status >= 400) {
            throw new Error(`Failed to download image: ${imageResponse.status}`);
          }

          return imageResponse.arrayBuffer;
        }

        if (statusData.status === 'failed') {
          throw new Error(`Image generation failed: ${statusData.error?.message || 'Unknown error'}`);
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
