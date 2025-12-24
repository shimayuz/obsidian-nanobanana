/**
 * プロキシサーバー内部型定義
 */

// Honoコンテキストに追加する変数
export interface ContextVariables {
  userId: string;
}

// Gemini APIレスポンスの型
export interface GeminiGenerateResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text?: string;
        inlineData?: {
          mimeType: string;
          data: string; // base64
        };
      }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
}

// トークン使用量
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}
