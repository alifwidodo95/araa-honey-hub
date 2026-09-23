import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        // Lightweight keep-alive ping to both Vercel lambda and WAHA gateway
        let wahaStatus = 'unknown';
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 3000);
          const wahaRes = await fetch('https://waha.araahoney.my.id/api/server/version', {
            headers: { 'x-api-key': 'araahoney123' },
            signal: controller.signal,
          }).catch(() => null);
          clearTimeout(timer);
          wahaStatus = wahaRes && wahaRes.ok ? 'connected' : 'standby';
        } catch {
          wahaStatus = 'standby';
        }

        return new Response(
          JSON.stringify({
            status: 'ok',
            time: new Date().toISOString(),
            waha: wahaStatus,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store, no-cache, must-revalidate',
            },
          }
        );
      },
    },
  },
});
