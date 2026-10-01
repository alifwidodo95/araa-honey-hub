process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';

const DB_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres.saefgyiloalpiqfrglqo:Handayani01@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";

export const Route = createFileRoute('/api/cron/sync-meta-ads')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        let pool: pg.Pool | null = null;
        try {
          const url = new URL(request.url);
          const queryKey = url.searchParams.get('key');
          const authHeader = request.headers.get('authorization');

          // Verify Auth: Allow if Vercel CRON_SECRET matches, or key=araahoney123 is provided, or internal request
          if (process.env.CRON_SECRET) {
            const isCronSecretValid = authHeader === `Bearer ${process.env.CRON_SECRET}`;
            const isKeyValid = queryKey === 'araahoney123';
            const isInternal = request.headers.get('x-internal-trigger') === '1';
            if (!isCronSecretValid && !isKeyValid && !isInternal) {
              return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
              });
            }
          }

          // 2. Connect directly to Postgres
          pool = new pg.Pool({
            connectionString: DB_URL,
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

          // 4. Calculate rolling 7 days range in Western Indonesian Time (WIB, UTC+7)
          const daysBack = parseInt(url.searchParams.get('days') || '7', 10);
          const now = new Date();
          const wibNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
          const todayStr = wibNow.toISOString().split('T')[0];
          const pastDate = new Date(wibNow.getTime() - daysBack * 24 * 60 * 60 * 1000);
          const pastStr = pastDate.toISOString().split('T')[0];

          console.log(`[Cron Meta Ads] Syncing range: ${pastStr} s/d ${todayStr}`);

          // 5. Fetch daily spend from Facebook Graph API (with time_increment=1)
          const fbUrl = `https://graph.facebook.com/v19.0/${defaultAccountId}/insights?time_range=%7B%22since%22%3A%22${pastStr}%22%2C%22until%22%3A%22${todayStr}%22%7D&time_increment=1&fields=spend,date_start,account_name&access_token=${token}`;
          const fbRes = await fetch(fbUrl);
          if (!fbRes.ok) {
            const errText = await fbRes.text();
            throw new Error(`Facebook API error: ${fbRes.status} - ${errText}`);
          }

          const fbJson = (await fbRes.json()) as any;
          const insights = fbJson.data || [];

          if (insights.length === 0) {
            await pool.end();
            return new Response(JSON.stringify({ message: `No spend data found for range ${pastStr} - ${todayStr}`, synced: false }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          let updated = 0;
          let inserted = 0;
          const syncedItems: any[] = [];

          for (const item of insights) {
            const date = item.date_start;
            const spend = Number(item.spend || 0);
            if (spend <= 0) continue;

            const accountName = item.account_name || defaultAccountId;
            const note = `Auto-sync dari Meta Ads API (BM: ${accountName})`;

            // Check if record exists
            const existRes = await pool.query(
              "SELECT id, amount FROM public.expenses_business WHERE category = 'meta_ads' AND occurred_on = $1 LIMIT 1",
              [date]
            );

            if (existRes.rowCount && existRes.rowCount > 0) {
              const record = existRes.rows[0];
              if (Number(record.amount) !== spend) {
                await pool.query(
                  "UPDATE public.expenses_business SET amount = $1, note = $2 WHERE id = $3",
                  [spend, note, record.id]
                );
                updated++;
                syncedItems.push({ date, spend, action: 'updated' });
              } else {
                syncedItems.push({ date, spend, action: 'match' });
              }
            } else {
              await pool.query(
                "INSERT INTO public.expenses_business (category, amount, occurred_on, note) VALUES ('meta_ads', $1, $2, $3)",
                [spend, date, note]
              );
              inserted++;
              syncedItems.push({ date, spend, action: 'inserted' });
            }
          }

          await pool.end();

          return new Response(JSON.stringify({ 
            success: true,
            message: `Successfully synced Meta Ads spend for last ${daysBack} days (${pastStr} s/d ${todayStr})`, 
            syncedItems,
            updated,
            inserted,
            totalDays: insights.length
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
