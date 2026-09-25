import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';
import { getLeadsReadyForNextFU } from '@/lib/hermes-fu-classifier';
import { sendScalevFUWithPool } from '@/lib/scalev.functions';

/**
 * Hermes FU Loop Cron
 * Fase 1: Autonomous Follow-Up Loop Agent
 *
 * Otomatis melanjutkan step follow-up untuk leads yang belum direspon
 * atau yang sudah merespon dengan intent 'interested' / 'question'.
 *
 * Cron: every 2 hours (configured in vercel.json)
 * Endpoint: GET /api/cron/hermes-fu-loop
 */

const DB_URL =
  process.env.DATABASE_URL ||
  'postgres://postgres.saefgyiloalpiqfrglqo:Handayani01@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres';

export const Route = createFileRoute('/api/cron/hermes-fu-loop')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        let pool: pg.Pool | null = null;
        try {
          // Validate cron secret
          const authHeader = request.headers.get('authorization');
          if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
          }

          // Enforce working hours (08:00–21:00 WIB)
          const nowJakarta = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
          const currentHour = nowJakarta.getHours();
          if (currentHour < 8 || currentHour >= 21) {
            return new Response(JSON.stringify({
              message: `Outside FU hours (current WIB: ${currentHour}:00). Skipped.`,
              processed: 0,
            }), { status: 200 });
          }

          pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

          // Fetch Scalev config for sender session info
          const cfgRes = await pool.query("SELECT value FROM app_settings WHERE key = 'scalev_config'");
          const scalevCfg = cfgRes.rows[0]?.value || {};
          const senderSession = scalevCfg.senderSession || 'waba';

          // Get leads ready for next FU step (intent-aware, excludes cancel/paid)
          const leads = await getLeadsReadyForNextFU(pool);

          console.log(`[Hermes FU Cron] Found ${leads.length} leads ready for next FU step.`);

          let processed = 0;
          let skipped = 0;

          for (const lead of leads) {
            const nextStep = (lead.follow_up_step || 0) + 1;
            if (nextStep > 3) { skipped++; continue; }

            try {
              await sendScalevFollowUpWhatsApp({
                leadId: lead.id,
                phone: lead.customer_phone,
                customerName: lead.customer_name,
                productName: lead.product_name,
                senderSession,
                step: nextStep as 1 | 2 | 3,
              });
              processed++;
              console.log(`[Hermes FU Cron] Sent FU Step ${nextStep} to ${lead.customer_name} (${lead.customer_phone})`);

              // Small delay to avoid rate limit
              await new Promise(r => setTimeout(r, 500));
            } catch (sendErr: any) {
              console.error(`[Hermes FU Cron] Failed to send FU to lead ${lead.id}:`, sendErr?.message);
              skipped++;
            }
          }

          await pool.end();
          return new Response(JSON.stringify({
            ok: true,
            processed,
            skipped,
            total: leads.length,
            timestamp: new Date().toISOString(),
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });

        } catch (err: any) {
          if (pool) try { await pool.end(); } catch {}
          console.error('[Hermes FU Cron Error]:', err);
          return new Response(JSON.stringify({ error: err.message || 'Internal error' }), { status: 500 });
        }
      },
    },
  },
});
