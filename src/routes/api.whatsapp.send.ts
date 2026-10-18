import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';
import { sendWhatsAppMessage, WhatsAppChannel } from '@/lib/whatsapp-service';

export const Route = createFileRoute('/api/whatsapp/send')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json() as any;
          const { to, message, imageUrl, mediaUrl, mediaType, channel, wahaConfig } = body || {};

          const finalMediaUrl = (mediaUrl || imageUrl || '').trim();

          if (!to || (!message && !finalMediaUrl)) {
            return new Response(JSON.stringify({ 
              success: false, 
              error: 'Nomor tujuan (to) dan pesan atau media wajib diisi.' 
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
            message: message || '',
            imageUrl: finalMediaUrl,
            mediaUrl: finalMediaUrl,
            mediaType: mediaType,
            channel: (channel as WhatsAppChannel) || 'waba',
            wahaConfig: resolvedWahaConfig
          });

          if (!result.success) {
            return new Response(JSON.stringify(result), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // Automatically record outgoing message in whatsapp_chat_logs for Live Chat Monitor
          if (!body?.skipLog) {
            try {
              const dbUrl = process.env.DATABASE_URL || "postgres://postgres.saefgyiloalpiqfrglqo:Handayani01@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";
              const logPool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
              const cleanPhone = String(to).replace(/[^0-9]/g, '');
              const chatId = `${cleanPhone}@c.us`;
              let custName = body.customerName;
              if (!custName) {
                const nameRes = await logPool.query(
                  "SELECT customer_name FROM public.whatsapp_chat_logs WHERE customer_phone = $1 AND customer_name IS NOT NULL AND customer_name != 'Meta Status' ORDER BY created_at DESC LIMIT 1",
                  [cleanPhone]
                );
                custName = nameRes.rows[0]?.customer_name;
                if (!custName) {
                  const custRes = await logPool.query("SELECT name FROM public.customers WHERE phone = $1 OR phone = $2 LIMIT 1", [cleanPhone, '+' + cleanPhone]);
                  custName = custRes.rows[0]?.name || 'Pelanggan';
                }
              }
              const msgId = result.messageId || null;
              const isVideo = mediaType === 'video' || /\.(mp4|mov|webm|avi|m4v)(\?.*)?$/i.test(finalMediaUrl);
              const defaultMediaText = finalMediaUrl
                ? (isVideo ? '[Video Dikirim]' : '[Foto Dikirim]')
                : '';
              const finalLogMessage = (message && message.trim()) ? message.trim() : defaultMediaText;

              await logPool.query(
                `INSERT INTO public.whatsapp_chat_logs (chat_id, customer_phone, customer_name, message, direction, replied_by, channel, wamid, delivery_status, media_url, created_at)
                 VALUES ($1, $2, $3, $4, 'outgoing', $5, $6, $7, 'sent', $8, now())`,
                [chatId, cleanPhone, custName, finalLogMessage, body.replied_by || 'manual', (channel as WhatsAppChannel) || 'waba', msgId, finalMediaUrl || null]
              );
              await logPool.end();
            } catch (logErr) {
              console.warn('[API Send WhatsApp] Could not record to whatsapp_chat_logs:', logErr);
            }
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
