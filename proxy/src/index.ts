import { handleSummarize } from './routes/summarize';
import { handleHealth } from './routes/health';
import { corsMiddleware, handleCors } from './middleware/cors';

export interface Env {
  GEMINI_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCors();
    }

    const url = new URL(request.url);
    const path = url.pathname;

    let response: Response;

    try {
      switch (path) {
        case '/api/summarize':
          response = await handleSummarize(request, env);
          break;
        case '/api/health':
          response = handleHealth();
          break;
        default:
          response = new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
      }
    } catch (error) {
      console.error('Error:', error);
      response = new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return corsMiddleware(response);
  }
};
