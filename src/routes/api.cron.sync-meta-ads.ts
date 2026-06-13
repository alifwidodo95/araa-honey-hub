import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';

export const Route = createFileRoute('/api/cron/sync-meta-ads')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        let pool: pg.Pool | null = null;
        try {
          // 1. Verify Vercel Cron Secret (if set in env)
          const authHeader = request.headers.get('authorization');
          if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL environment variable is not defined.');
          }

          // 2. Connect directly to Postgres
          pool = new pg.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
          });

          // 3. Fetch Meta Ads Token and default account from app_settings
          const configRes = await pool.query("SELECT value FROM public.app_settings WHERE key = 'meta_ads_config'");
          if (configRes.rowCount === 0) {
            await pool.end();
            return new Response(JSON.stringify({ message: 'Meta Ads configuration not found in app_settings' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          const metaConfig = configRes.rows[0].value;
          const { token, defaultAccountId } = metaConfig || {};

          if (!token || !defaultAccountId) {
            await pool.end();
            return new Response(JSON.stringify({ message: 'Meta Ads Token or Account ID is not configured' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // 4. Calculate yesterday's date in Western Indonesian Time (WIB, UTC+7)
          const now = new Date();
          // Shift time to WIB (UTC+7)
          const wibTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
          // Subtract 24 hours to get yesterday
          const yesterday = new Date(wibTime.getTime() - 24 * 60 * 60 * 1000);
          const yesterdayStr = yesterday.toISOString().split('T')[0];

          console.log(`Syncing Meta Ads for date: ${yesterdayStr}`);

          // 5. Fetch daily spend from Facebook Graph API
          const fbUrl = `https://graph.facebook.com/v19.0/${defaultAccountId}/insights?time_range=%7B%22since%22%3A%22${yesterdayStr}%22%2C%22until%22%3A%22${yesterdayStr}%22%7D&fields=spend,date_start,account_name&access_token=${token}`;
          const fbRes = await fetch(fbUrl);
          if (!fbRes.ok) {
            const errText = await fbRes.text();
            throw new Error(`Facebook API error: ${fbRes.status} - ${errText}`);
          }

          const fbJson = await fbRes.json() as any;
          const insights = fbJson.data || [];
          
          if (insights.length === 0) {
            await pool.end();
            return new Response(JSON.stringify({ message: `No spend data found for ${yesterdayStr}`, synced: false }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          const spend = Number(insights[0].spend || 0);
          const accountName = insights[0].account_name || defaultAccountId;

          // 6. Check if an expense record already exists for category 'meta_ads' and date yesterdayStr
          const existRes = await pool.query(
            "SELECT id FROM public.expenses_business WHERE category = 'meta_ads' AND occurred_on = $1 LIMIT 1",
            [yesterdayStr]
          );

          const note = `Auto-sync dari Meta Ads API (BM: ${accountName})`;

          if (existRes.rowCount > 0) {
            // Update existing record
            const recordId = existRes.rows[0].id;
            await pool.query(
              "UPDATE public.expenses_business SET amount = $1, note = $2, updated_at = NOW() WHERE id = $3",
              [spend, note, recordId]
            );
            console.log(`Updated existing expense record for ${yesterdayStr} with spend: ${spend}`);
          } else {
            // Insert new record
            await pool.query(
              "INSERT INTO public.expenses_business (category, amount, occurred_on, note) VALUES ('meta_ads', $1, $2, $3)",
              [spend, yesterdayStr, note]
            );
            console.log(`Created new expense record for ${yesterdayStr} with spend: ${spend}`);
          }

          await pool.end();

          return new Response(JSON.stringify({ 
            message: `Successfully synced Meta Ads spend for ${yesterdayStr}`, 
            date: yesterdayStr,
            spend,
            account: accountName,
            synced: true 
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });

        } catch (err: any) {
          console.error('Error during Meta Ads sync:', err);
          if (pool) {
            try {
              await pool.end();
            } catch (e) {}
          }
          return new Response(JSON.stringify({ error: err?.message || 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }
  }
});
