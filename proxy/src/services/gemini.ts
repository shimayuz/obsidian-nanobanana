interface GeminiCallParams {
  apiKey: string;
  image: string;
  mimeType: string;
  prompt: string;
  model: string;
}

interface GeminiResponse {
  success: boolean;
  summary?: string;
  error?: string;
}

export async function callGeminiApi(params: GeminiCallParams): Promise<GeminiResponse> {
  const { apiKey, image, mimeType, prompt, model } = params;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inline_data: {
            mime_type: mimeType,
            data: image
          }
        }
      ]
    }]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Gemini API error: ${response.status} - ${errorText}`
      };
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return {
        success: false,
        error: 'No response from Gemini API'
      };
    }

    return {
      success: true,
      summary: text
    };
  } catch (error) {
    return {
      success: false,
      error: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}
