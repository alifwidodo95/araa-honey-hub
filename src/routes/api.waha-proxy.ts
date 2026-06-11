import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/waha-proxy')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { url, method, headers, body } = await request.json() as any;

          if (!url) {
            return new Response(JSON.stringify({ error: 'Target URL is required' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          const fetchOptions: RequestInit = {
            method: method || 'GET',
            headers: headers || {},
          };

          if (body) {
            fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
          }

          console.log(`[WAHA Proxy] Fetching ${method || 'GET'} -> ${url}`);
          const response = await fetch(url, fetchOptions);

          const contentType = response.headers.get('Content-Type') || '';
          
          if (contentType.includes('image') || contentType.includes('octet-stream')) {
            const blob = await response.blob();
            return new Response(blob, {
              status: response.status,
              headers: {
                'Content-Type': contentType || 'image/png',
              },
            });
          }

          const responseText = await response.text();
          return new Response(responseText, {
            status: response.status,
            headers: {
              'Content-Type': contentType || 'application/json',
            },
          });
        } catch (error: any) {
          console.error('[WAHA Proxy Error]:', error);
          return new Response(JSON.stringify({
            message: error.message || 'Internal Server Error',
            statusCode: 500,
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }
  }
});
