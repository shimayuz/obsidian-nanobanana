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
import type { ManualModePromptResult } from './api-client';

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

    const systemPrompt = `あなたは視覚的に魅力的なインフォグラフィックを設計するエキスパートです。ノート記事の各セクションの**核心的なメッセージ**を抽出し、それを**図解・ダイアグラム・フローチャート**などで視覚的に表現する画像生成プランを作成してください（最大${settings.maxImageCount}枚まで）。

## 重要：プロンプト作成の原則

### 1. コンテンツの本質を抽出する
- 単なる箇条書きの羅列ではなく、セクションの**中心的なコンセプト**や**関係性**を視覚化する
- 「何が重要か」「どう繋がっているか」「どんな構造か」を図で表現する
- 読者が一目で理解できる**ビジュアルサマリー**を目指す

### 2. 適切な図解タイプを選択する（セクション内容に応じて）
- **フローチャート**: プロセス、手順、ワークフローの説明
- **マインドマップ/放射状図**: 中心概念と関連要素の関係
- **比較図/対比表**: 2つ以上の選択肢やアプローチの比較
- **階層図/ピラミッド**: 重要度、レベル、カテゴリの構造
- **サイクル図**: 循環するプロセスや相互作用
- **タイムライン**: 時系列の流れ、ステップ
- **ベン図**: 重複する概念や共通点
- **アイコングリッド**: 複数の独立した要素の概要（最後の手段）

### 3. ペーパークラフト風デザインスタイル（必須）
全てのプロンプトに以下のスタイル指示を含めること：

**トーン**: 初心者ユーザー向け、優しい、手作り感、立体、ファンシー

**カラーパレット**:
- 背景色: #E0FFFF (Light Cyan / 水色)
- 文字色: #5F9EA0 (Cadet Blue / 青緑)
- アクセントカラー: #FFB6C1 (Light Pink / ピンク)、#FFFACD (Lemon Chiffon / レモン色)

**ビジュアルスタイル**:
- 色画用紙を切り抜いて重ねたような表現 (paper cutout collage style)
- 紙の重なりによる影 (drop shadow on layered paper)
- フリーハンドのようなわずかな歪み (slightly irregular hand-cut edges)
- 画用紙のテクスチャ (construction paper texture)

**タイポグラフィ**:
- 丸みのある手書き風フォント (rounded handwritten font)
- 紙から切り出したような文字 (letters cut out from paper)

### 4. プロンプト構成（必須要素）
各プロンプトには以下を含めること：
1. **図解タイプ**の明示（例: "flowchart showing...", "mind map centered on..."）
2. **中心概念**と**主要な要素**（3-7個）
3. **要素間の関係性**（矢印、接続、グループ化など）
4. **ペーパークラフト風スタイル指示**（上記スタイルを英語で記述）
5. **言語指定**: ${settings.language === 'ja' ? '日本語テキスト' : 'English text'}

必ず以下のJSON形式のみで出力してください。説明文は不要です。
{
  "items": [
    {
      "id": "img1",
      "title": "画像のタイトル（図解の内容を端的に）",
      "afterHeading": "挿入位置の見出し（ノート内の実際の見出しテキスト、完全一致）",
      "prompt": "図解タイプ + 中心概念 + 主要要素と関係性 + ペーパークラフト風スタイル指示 + 言語指定を含む詳細なプロンプト",
      "description": "この図解が伝えるメッセージ（1文）"
    }
  ]
}`;

    const userPrompt = `以下のノート記事を熟読し、各セクションの**核心的なメッセージ**を抽出してください。

各セクションについて：
1. そのセクションが伝えたい**最も重要なポイント**は何か？
2. 概念間の**関係性・構造・流れ**はどうなっているか？
3. それを**どの図解タイプ**で最も効果的に表現できるか？

単なる箇条書きリストではなく、**概念の関係性を視覚化**する図解プロンプトを生成してください。
必ず**ペーパークラフト風（色画用紙を切り抜いて重ねた）スタイル**で表現してください。

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
            resolution: settings.resolution || '1K',
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
   * 選択テキストから画像生成プロンプトを作成（Manual Mode用）
   * Full-autoのgeneratePlanと同じロジック・システムプロンプトを使用（1枚のみ生成）
   */
  async generatePromptFromSelection(
    selectedText: string,
    settings: PluginSettings
  ): Promise<ManualModePromptResult> {
    if (!this.openaiApiKey) {
      throw new Error('OpenAI API key is required');
    }

    // Full-autoと同じシステムプロンプト（1枚のみ生成するよう指定）
    const systemPrompt = `あなたは視覚的に魅力的なインフォグラフィックを設計するエキスパートです。与えられたテキストの**核心的なメッセージ**を抽出し、それを**図解・ダイアグラム・フローチャート**などで視覚的に表現する画像生成プロンプトを**1つだけ**作成してください。

## 重要：プロンプト作成の原則

### 1. コンテンツの本質を抽出する
- 単なる箇条書きの羅列ではなく、テキストの**中心的なコンセプト**や**関係性**を視覚化する
- 「何が重要か」「どう繋がっているか」「どんな構造か」を図で表現する
- 読者が一目で理解できる**ビジュアルサマリー**を目指す

### 2. 適切な図解タイプを選択する（内容に応じて）
- **フローチャート**: プロセス、手順、ワークフローの説明
- **マインドマップ/放射状図**: 中心概念と関連要素の関係
- **比較図/対比表**: 2つ以上の選択肢やアプローチの比較
- **階層図/ピラミッド**: 重要度、レベル、カテゴリの構造
- **サイクル図**: 循環するプロセスや相互作用
- **タイムライン**: 時系列の流れ、ステップ
- **ベン図**: 重複する概念や共通点
- **アイコングリッド**: 複数の独立した要素の概要（最後の手段）

### 3. ペーパークラフト風デザインスタイル（必須）
プロンプトに以下のスタイル指示を含めること：

**トーン**: 初心者ユーザー向け、優しい、手作り感、立体、ファンシー

**カラーパレット**:
- 背景色: #E0FFFF (Light Cyan / 水色)
- 文字色: #5F9EA0 (Cadet Blue / 青緑)
- アクセントカラー: #FFB6C1 (Light Pink / ピンク)、#FFFACD (Lemon Chiffon / レモン色)

**ビジュアルスタイル**:
- 色画用紙を切り抜いて重ねたような表現 (paper cutout collage style)
- 紙の重なりによる影 (drop shadow on layered paper)
- フリーハンドのようなわずかな歪み (slightly irregular hand-cut edges)
- 画用紙のテクスチャ (construction paper texture)

**タイポグラフィ**:
- 丸みのある手書き風フォント (rounded handwritten font)
- 紙から切り出したような文字 (letters cut out from paper)

### 4. プロンプト構成（必須要素）
プロンプトには以下を含めること：
1. **図解タイプ**の明示（例: "flowchart showing...", "mind map centered on..."）
2. **中心概念**と**主要な要素**（3-7個）
3. **要素間の関係性**（矢印、接続、グループ化など）
4. **ペーパークラフト風スタイル指示**（上記スタイルを英語で記述）
5. **言語指定**: ${settings.language === 'ja' ? '日本語テキスト' : 'English text'}

必ず以下のJSON形式のみで出力してください。説明文は不要です。
{
  "items": [
    {
      "id": "manual1",
      "title": "画像のタイトル（図解の内容を端的に）",
      "prompt": "図解タイプ + 中心概念 + 主要要素と関係性 + ペーパークラフト風スタイル指示 + 言語指定を含む詳細なプロンプト",
      "description": "この図解が伝えるメッセージ（1文）"
    }
  ]
}`;

    const userPrompt = `以下のテキストの**核心的なメッセージ**を抽出してください。

1. このテキストが伝えたい**最も重要なポイント**は何か？
2. 概念間の**関係性・構造・流れ**はどうなっているか？
3. それを**どの図解タイプ**で最も効果的に表現できるか？

単なる箇条書きリストではなく、**概念の関係性を視覚化**する図解プロンプトを生成してください。
必ず**ペーパークラフト風（色画用紙を切り抜いて重ねた）スタイル**で表現してください。

テキスト内容:
${selectedText}`;

    try {
      // Full-autoと同じリクエスト形式
      const requestBody = {
        model: 'gpt-5-mini-2025-08-07',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: 4096,
        response_format: { type: 'json_object' }
      };

      console.log('📝 Manual Mode: Generating prompt from selection...');

      // Full-autoと同じfetchパターン
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

      console.log('✅ Manual Mode: Prompt generated successfully');

      // JSONをパースしてprompt, title, descriptionを取得
      const plan = JSON.parse(text);
      if (!plan.items || plan.items.length === 0) {
        throw new Error('No prompt generated. Try again.');
      }

      const item = plan.items[0];
      return {
        prompt: item.prompt,
        title: item.title || 'Manual Image',
        description: item.description || 'Generated from selection',
      };
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error(`Failed to generate prompt: ${error}`);
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
