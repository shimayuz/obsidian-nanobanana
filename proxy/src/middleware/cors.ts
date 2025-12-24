const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Access-Control-Max-Age': '86400'
};

export function handleCors(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

export function corsMiddleware(response: Response): Response {
  const newHeaders = new Headers(response.headers);

  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    newHeaders.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}
