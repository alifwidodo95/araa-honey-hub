import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/biteship/search-area')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const searchInput = url.searchParams.get('input') || '';
          const customApiKey = url.searchParams.get('apiKey') || '';
          
          if (!searchInput.trim()) {
            return new Response(JSON.stringify({ areas: [] }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          let biteshipKey = customApiKey || process.env.BITESHIP_API_KEY;

          // If no key passed and not in env, check app_settings in DB
          if (!biteshipKey && process.env.DATABASE_URL) {
            try {
              const { Pool } = await import('pg');
              const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
              const configRes = await pool.query("SELECT value FROM app_settings WHERE key = 'meta_ai_settings'");
              await pool.end();
              biteshipKey = configRes.rows[0]?.value?.biteship_api_key;
            } catch (dbErr) {
              console.warn('[Biteship Search Area] DB lookup failed:', dbErr);
            }
          }

          if (!biteshipKey) {
            console.error('[Biteship Search Area] BITESHIP_API_KEY is not configured');
            return new Response(JSON.stringify({ error: 'Biteship API Key is not configured', areas: [] }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          console.log(`[Biteship Search Area] Searching for: "${searchInput}"`);
          const response = await fetch(`https://api.biteship.com/v1/maps/areas?countries=ID&input=${encodeURIComponent(searchInput)}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${biteshipKey}`,
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Biteship API failed: ${response.status} - ${errText}`);
          }

          const data = await response.json() as any;
          return new Response(JSON.stringify({ areas: data.areas || [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error: any) {
          console.error('[Biteship Search Area Error]:', error);
          return new Response(JSON.stringify({
            message: error.message || 'Internal Server Error',
            areas: []
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }
  }
});
