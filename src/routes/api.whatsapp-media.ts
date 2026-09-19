import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/whatsapp-media')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const mediaId = url.searchParams.get('media_id');

          if (!mediaId || !mediaId.trim()) {
            return new Response('Parameter media_id wajib disertakan', {
              status: 400,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
          }

          const fallbackToken =
            'EAAPbL3R0Y60BSWTiTBjrFuy9WJQEdZAc8HqCZCgdik8cq9ZB0wJ06glKZCEgy3fCUZBYZCwhW58V9rMzmXAFkqatSZA0pHPQ3tl3ZBQKQUMzOzUhvcx8ig7CpNZB4Kj0MWJJxZBH7BZCLyd8ZAWU2Lbol44ZAZAqi9XDniZAgQzmiEVIwmslqHBGcFjKwZCKX4zitM9VyPBuFQZDZD';

          let token = process.env.WHATSAPP_PERMANENT_TOKEN;

          // Check database settings if not in env
          if (!token && process.env.DATABASE_URL) {
            try {
              const { Pool } = await import('pg');
              const pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: { rejectUnauthorized: false },
              });
              const configRes = await pool.query(
                "SELECT value FROM app_settings WHERE key IN ('whatsapp_settings', 'meta_ai_settings')"
              );
              await pool.end();
              for (const row of configRes.rows || []) {
                if (row.value?.permanent_token) {
                  token = row.value.permanent_token;
                  break;
                }
              }
            } catch (dbErr) {
              console.warn('[WhatsApp Media] DB lookup failed:', dbErr);
            }
          }

          if (!token) {
            token = fallbackToken;
          }

          // Step 1: Request media download URL from Meta Graph API
          const metaGraphUrl = `https://graph.facebook.com/v20.0/${encodeURIComponent(mediaId.trim())}`;
          const metaRes = await fetch(metaGraphUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!metaRes.ok) {
            const errText = await metaRes.text();
            console.error(`[WhatsApp Media] Meta Graph error for media ${mediaId}:`, errText);
            return new Response('Gambar tidak dapat diakses atau sudah kedaluwarsa dari server WhatsApp', {
              status: metaRes.status,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
          }

          const metaData = await metaRes.json();
          const downloadUrl = metaData.url;
          const mimeType = metaData.mime_type || 'image/jpeg';

          if (!downloadUrl) {
            return new Response('Download URL tidak ditemukan dari respon Meta', {
              status: 404,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
          }

          // Step 2: Fetch binary media content from Meta CDN using Bearer auth
          const mediaFetchRes = await fetch(downloadUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!mediaFetchRes.ok) {
            console.error(`[WhatsApp Media] Download error from CDN (${mediaFetchRes.status})`);
            return new Response('Gagal mengunduh media dari server Meta CDN', {
              status: mediaFetchRes.status,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
          }

          const arrayBuffer = await mediaFetchRes.arrayBuffer();

          return new Response(arrayBuffer, {
            status: 200,
            headers: {
              'Content-Type': mimeType,
              'Content-Disposition': 'inline',
              'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
            },
          });
        } catch (err: any) {
          console.error('[WhatsApp Media] Exception while proxying media:', err);
          return new Response('Internal server error saat mengambil gambar WhatsApp', {
            status: 500,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      },
    },
  },
});
