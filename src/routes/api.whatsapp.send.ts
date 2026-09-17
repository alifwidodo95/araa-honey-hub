import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';
import { sendWhatsAppMessage, WhatsAppChannel } from '@/lib/whatsapp-service';

export const Route = createFileRoute('/api/whatsapp/send')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json() as any;
          const { to, message, imageUrl, channel, wahaConfig } = body || {};

          if (!to || !message) {
            return new Response(JSON.stringify({ 
              success: false, 
              error: 'Nomor tujuan (to) dan pesan (message) wajib diisi.' 
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          let resolvedWahaConfig = wahaConfig;
          if (!resolvedWahaConfig && (channel === 'waha_main' || channel === 'waha_campaign')) {
            try {
              const dbUrl = process.env.DATABASE_URL || "postgres://postgres.saefgyiloalpiqfrglqo:Handayani01@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";
              const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
              const cfgRes = await pool.query("SELECT value FROM app_settings WHERE key = 'waha_config'");
              await pool.end();
              if (cfgRes.rows[0]?.value) {
                resolvedWahaConfig = cfgRes.rows[0].value;
              }
            } catch (cfgErr) {
              console.warn('[API Send WhatsApp] Could not load waha_config from DB:', cfgErr);
            }
          }

          const result = await sendWhatsAppMessage({
            to,
            message,
            imageUrl,
            channel: (channel as WhatsAppChannel) || 'waba',
            wahaConfig: resolvedWahaConfig
          });

          if (!result.success) {
            return new Response(JSON.stringify(result), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });

        } catch (error: any) {
          console.error('[API Send WhatsApp Error]:', error);
          return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Internal Server Error'
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }
  }
});
