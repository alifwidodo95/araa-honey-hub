process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';

export const Route = createFileRoute('/api/meta/subscribe-page')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let pool: pg.Pool | null = null;
        try {
          // Parse request body for optional userAccessToken
          let userAccessToken = '';
          try {
            const body = await request.json() as any;
            userAccessToken = body.userAccessToken || '';
          } catch (e) {
            // No body or invalid JSON, ignore
          }

          if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL is not configured');
          }

          pool = new pg.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
          });

          // Fetch Current Settings
          const configRes = await pool.query("SELECT value FROM app_settings WHERE key = 'meta_ai_settings'");
          const aiConfig = configRes.rows[0]?.value || {};
          let { 
            page_access_token = '',
            facebook_page_id = ''
          } = aiConfig;

          if (!facebook_page_id) {
            await pool.end();
            return new Response(JSON.stringify({ error: 'Facebook Page ID belum dikonfigurasi di dashboard.' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          let pageAccessTokenToUse = page_access_token;

          // If User Access Token is provided, exchange it for the Page Access Token
          if (userAccessToken) {
            console.log('[Meta Subscribe] Fetching pages using User Access Token...');
            const accountsUrl = `https://graph.facebook.com/v20.0/me/accounts?limit=100&access_token=${userAccessToken}`;
            const accountsRes = await fetch(accountsUrl);
            
            if (!accountsRes.ok) {
              const errText = await accountsRes.text();
              console.error('[Meta Subscribe] Failed to fetch accounts with User Token:', errText);
              await pool.end();
              return new Response(JSON.stringify({ error: `Gagal memproses User Token: ${errText}` }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              });
            }

            const accountsData = await accountsRes.json() as any;
            const pagesList = accountsData.data || [];
            
            // Find our page
            const targetPage = pagesList.find((p: any) => String(p.id) === String(facebook_page_id));
            
            if (!targetPage || !targetPage.access_token) {
              console.warn('[Meta Subscribe] Madu Araa Page not found in user accounts list. Available pages:', pagesList.map((p: any) => `${p.name} (${p.id})`).join(', '));
              await pool.end();
              return new Response(JSON.stringify({ 
                error: `Halaman dengan ID ${facebook_page_id} tidak ditemukan dalam akun Facebook ini. Apakah Anda Admin dari halaman tersebut?` 
              }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              });
            }

            console.log(`[Meta Subscribe] Found target page: ${targetPage.name}. Saving Page Token to Database.`);
            pageAccessTokenToUse = targetPage.access_token;
            
            // Save new Page Access Token to DB
            aiConfig.page_access_token = pageAccessTokenToUse;
            await pool.query(
              "INSERT INTO app_settings (key, value) VALUES ('meta_ai_settings', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
              [aiConfig]
            );
          }

          if (!pageAccessTokenToUse) {
            await pool.end();
            return new Response(JSON.stringify({ error: 'Token Akses Halaman belum dikonfigurasi. Masukkan User Token atau Page Token.' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // Call Meta API to subscribe the page to the app's webhook
          const subUrl = `https://graph.facebook.com/v20.0/${facebook_page_id}/subscribed_apps?subscribed_fields=feed&access_token=${pageAccessTokenToUse}`;
          console.log(`[Meta Subscribe] Requesting subscription for page ${facebook_page_id}...`);
          
          const subRes = await fetch(subUrl, { method: 'POST' });
          const data = await subRes.json() as any;

          await pool.end();

          if (subRes.ok && data.success) {
            return new Response(JSON.stringify({ 
              success: true, 
              message: 'Halaman Facebook berhasil disambungkan ke Webhook aplikasi!' 
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          } else {
            const errorMsg = data.error?.message || 'Gagal menyambungkan halaman ke Webhook.';
            console.error('[Meta Subscribe Error]:', data.error);
            return new Response(JSON.stringify({ 
              error: errorMsg,
              details: data.error 
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        } catch (error: any) {
          console.error('[Meta Subscribe Handler Error]:', error);
          if (pool) await pool.end();
          return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }
  }
});
