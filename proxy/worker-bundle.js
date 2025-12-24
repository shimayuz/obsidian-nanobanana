/**
 * Gemini Summary Images Proxy - Cloudflare Workers バンドル版
 *
 * Plan生成: Gemini API (gemini-2.5-flash)
 * 画像生成: kie.ai API (nano-banana-pro) - ポーリング方式
 */

// CORSミドルウェア
function addCorsHeaders(response) {
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin', '*');
  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// 認証ミドルウェア
function authenticate(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7);
  const validTokens = env.AUTH_TOKENS.split(',');
  return validTokens.includes(token);
}

// Gemini APIでPlan生成
async function generatePlan(noteContent, settings, env) {
  const prompt = `以下のノート内容を要約し、${settings.imageCount}個の画像生成プランを作成してください。

各画像について以下の情報を生成してください：
- id: img1, img2, ... の形式
- title: 画像のタイトル
- afterHeading: 挿入位置の見出し
- prompt: 画像生成プロンプト（${settings.style}スタイル、${settings.language}言語）
- description: 画像の説明

ノート内容:
${noteContent}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
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

  if (!response.ok) {
    throw new Error('Gemini API error');
  }

  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;
  
  // JSON部分を抽出
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse plan');
  }

  const plan = JSON.parse(jsonMatch[0]);
  return {
    version: '1',
    items: plan.items || [],
    metadata: {
      noteHash: btoa(noteContent).slice(0, 16),
      generatedAt: new Date().toISOString(),
    }
  };
}

// kie.aiで画像生成タスク作成
async function createImageTask(prompt, settings, env) {
  const requestBody = {
    model: 'nano-banana-pro',
    input: {
      prompt: prompt,
      aspect_ratio: settings.aspectRatio || '1:1',
      resolution: settings.resolution || '1K',
      output_format: settings.outputFormat || 'png'
    }
  };

  const response = await fetch('https://api.kie.ai/v1/tasks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.KIE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error('kie.ai API error');
  }

  return response.json();
}

// kie.aiでジョブステータス確認
async function getJobStatus(jobId, env) {
  const response = await fetch(`https://api.kie.ai/v1/tasks/${jobId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${env.KIE_API_KEY}`,
    }
  });

  if (!response.ok) {
    throw new Error('kie.ai API error');
  }

  return response.json();
}

// メインハンドラー
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORSプリフライト
    if (request.method === 'OPTIONS') {
      return addCorsHeaders(new Response(null, { status: 200 }));
    }

    try {
      // ヘルスチェック
      if (url.pathname === '/health') {
        const response = new Response(JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString(),
          services: {
            plan: 'gemini-2.5-flash',
            image: 'kie.ai/nano-banana-pro',
          },
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
        return addCorsHeaders(response);
      }

      // API v1ルート
      if (url.pathname.startsWith('/v1/')) {
        // 認証チェック
        if (!authenticate(request, env)) {
          const response = new Response(JSON.stringify({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Invalid or missing authentication token',
            }
          }), { status: 401, headers: { 'Content-Type': 'application/json' } });
          return addCorsHeaders(response);
        }

        // Plan生成
        if (url.pathname === '/v1/plan' && request.method === 'POST') {
          const body = await request.json();
          const plan = await generatePlan(body.noteContent, body.settings, env);
          const response = new Response(JSON.stringify(plan), {
            headers: { 'Content-Type': 'application/json' }
          });
          return addCorsHeaders(response);
        }

        // 画像生成タスク作成
        if (url.pathname === '/v1/image/create' && request.method === 'POST') {
          const body = await request.json();
          const task = await createImageTask(body.prompt, body, env);
          const response = new Response(JSON.stringify({
            jobId: task.job_id,
            estimatedWaitSeconds: 30
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
          return addCorsHeaders(response);
        }

        // ジョブステータス確認
        if (url.pathname.startsWith('/v1/image/status/') && request.method === 'GET') {
          const jobId = url.pathname.split('/').pop();
          const status = await getJobStatus(jobId, env);
          const response = new Response(JSON.stringify({
            jobId: status.job_id,
            status: status.status,
            imageUrl: status.output?.image_url,
            errorMessage: status.error?.message,
            progress: status.progress
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
          return addCorsHeaders(response);
        }
      }

      // 404
      const response = new Response(JSON.stringify({
        error: {
          code: 'NOT_FOUND',
          message: 'Endpoint not found',
        }
      }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      return addCorsHeaders(response);

    } catch (error) {
      console.error('Worker error:', error);
      const response = new Response(JSON.stringify({
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Internal server error',
        }
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      return addCorsHeaders(response);
    }
  }
};