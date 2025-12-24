import { Env } from '../index';
import { callGeminiApi } from '../services/gemini';

interface SummarizeRequest {
  image: string;
  mimeType: string;
  prompt?: string;
  model?: string;
}

export async function handleSummarize(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get API key from header or environment
  const headerApiKey = request.headers.get('X-API-Key');
  const apiKey = headerApiKey || env.GEMINI_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'API key not configured' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: SummarizeRequest;
  try {
    body = await request.json() as SummarizeRequest;
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { image, mimeType, prompt, model } = body;

  if (!image || !mimeType) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing required fields: image, mimeType' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const result = await callGeminiApi({
    apiKey,
    image,
    mimeType,
    prompt: prompt || 'この画像を詳細に説明してください。',
    model: model || 'gemini-2.0-flash'
  });

  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 500,
    headers: { 'Content-Type': 'application/json' }
  });
}
