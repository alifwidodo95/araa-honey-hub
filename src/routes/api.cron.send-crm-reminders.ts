process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';
import { sendWhatsAppMessage, WhatsAppChannel } from '@/lib/whatsapp-service';

export const Route = createFileRoute('/api/cron/send-crm-reminders')({
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

          const dbUrl = process.env.DATABASE_URL || "postgres://postgres.saefgyiloalpiqfrglqo:Handayani01@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";

          // 2. Connect directly to Postgres
          pool = new pg.Pool({
            connectionString: dbUrl,
            ssl: { rejectUnauthorized: false }
          });

          // 3. Fetch CRM Configuration
          const crmConfigRes = await pool.query("SELECT value FROM app_settings WHERE key = 'crm_config'");
          if (crmConfigRes.rowCount === 0) {
            await pool.end();
            return new Response(JSON.stringify({ message: 'CRM configuration not found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          const crmConfig = crmConfigRes.rows[0].value;
          const { enabled, template: crmTemplate, maxDailyLimit, imageUrl: crmImageUrl } = crmConfig || {};
          const crmChannel: WhatsAppChannel = (crmConfig?.channel as WhatsAppChannel) || 'waha_campaign';
          const dailyLimit = Number(maxDailyLimit) || 50;

          // If CRM reminders are disabled, do not run the cron job
          if (enabled === false) {
            await pool.end();
            return new Response(JSON.stringify({ message: 'CRM Auto-Reminders feature is disabled', count: 0 }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // Enforce working hours (09:00 WIB to 20:00 WIB)
          const nowJakarta = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
          const currentHour = nowJakarta.getHours();
          
          if (currentHour < 9 || currentHour >= 20) {
            await pool.end();
            return new Response(JSON.stringify({ 
              message: `Outside sending hours. Current Jakarta hour is ${currentHour}. CRM reminders only send between 09:00 WIB and 20:00 WIB.`, 
              count: 0 
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // 4. Fetch WAHA configuration fallback
          const wahaConfigRes = await pool.query("SELECT value FROM app_settings WHERE key = 'waha_config'");
          const wahaConfig = wahaConfigRes.rows[0]?.value || {};

          // 5. Check daily quota limits (based on Asia/Jakarta timezone)
          const quotaRes = await pool.query(`
            SELECT COUNT(*)::int as sent_today
            FROM crm_reminders
            WHERE status = 'sent'
              AND (sent_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date
          `);
          const sentToday = quotaRes.rows[0].sent_today || 0;

          if (sentToday >= dailyLimit) {
            await pool.end();
            return new Response(JSON.stringify({ 
              message: `Daily limit reached. ${sentToday}/${dailyLimit} reminders already sent today (Asia/Jakarta).`, 
              count: 0 
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // Helper to format Indonesian date (e.g. "12 Juli 2026")
          const formatDateIndo = (dateStr: string): string => {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            const day = date.getDate();
            const monthIdx = date.getMonth();
            const year = date.getFullYear();
            const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
            return `${day} ${months[monthIdx]} ${year}`;
          };

          const defaultTemplate = `Halo Kak {customer_name},\n\nSemoga sehat selalu ya Kak. 🍯😊\n\nSekadar mengingatkan, Kakak terakhir kali memesan {honey_type} pada sekitar 45 hari yang lalu.\n\nJika persediaan madu Araa Honey di rumah sudah mulai menipis, Kakak bisa langsung membalas chat ini untuk memesan kembali ya. Terima kasih banyak Kak!`;
          const template = crmTemplate || defaultTemplate;

          // 6. Fetch oldest pending reminders due today or earlier (batch of 3)
          const remindersRes = await pool.query(`
            SELECT r.id, r.order_id, r.customer_name, r.customer_phone, r.honey_type, o.created_at as last_order_date
            FROM crm_reminders r
            JOIN orders o ON r.order_id = o.id
            WHERE r.status = 'pending' 
              AND r.scheduled_for <= CURRENT_DATE
            ORDER BY r.scheduled_for ASC
            LIMIT 3
          `);

          const pendingReminders = remindersRes.rows;
          if (pendingReminders.length === 0) {
            await pool.end();
            return new Response(JSON.stringify({ message: 'No pending CRM reminders to send today', count: 0 }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          const results = [];
          let successCount = 0;
          let gatewayError = false;

          for (const reminder of pendingReminders) {
            // Check daily quota before each send
            if ((sentToday + successCount) >= dailyLimit) {
              results.push({ id: reminder.id, customer: reminder.customer_name, status: 'QUOTA_REACHED' });
              break;
            }

            if (!reminder.customer_phone) {
              await pool.query("UPDATE crm_reminders SET status = 'failed', error_message = 'Nomor HP kosong', updated_at = now() WHERE id = $1", [reminder.id]);
              results.push({ id: reminder.id, customer: reminder.customer_name, status: 'SKIPPED', reason: 'Phone number is empty' });
              continue;
            }

            // Double check: If customer has already placed a newer repeat order, cancel this reminder and skip
            let cleanPhone = reminder.customer_phone.replace(/[^0-9]/g, '');
            if (cleanPhone.startsWith('0')) cleanPhone = '62' + cleanPhone.slice(1);
            else if (cleanPhone.startsWith('8')) cleanPhone = '62' + cleanPhone;

            const newerOrderCheck = await pool.query(
              `SELECT id FROM orders 
               WHERE public.normalize_phone(customer_phone) = $1 
                 AND channel = 'whatsapp' 
                 AND returned = FALSE 
                 AND created_at > $2 
               LIMIT 1`,
              [cleanPhone, reminder.last_order_date]
            );

            if (newerOrderCheck.rows.length > 0) {
              await pool.query(
                "UPDATE crm_reminders SET status = 'cancelled', updated_at = now() WHERE id = $1",
                [reminder.id]
              );
              results.push({
                id: reminder.id,
                customer: reminder.customer_name,
                status: 'CANCELLED_REPEAT_ORDER',
                reason: 'Customer has already placed a newer order'
              });
              continue;
            }

            const formattedMessage = template
              .replace(/{customer_name}/g, reminder.customer_name || '')
              .replace(/{honey_type}/g, reminder.honey_type || 'Madu Araa')
              .replace(/{last_order_date}/g, formatDateIndo(reminder.last_order_date) || '');

            const sendResult = await sendWhatsAppMessage({
              to: reminder.customer_phone,
              message: formattedMessage,
              imageUrl: crmImageUrl,
              channel: crmChannel,
              wahaConfig
            });

            if (sendResult.success) {
              await pool.query("UPDATE crm_reminders SET status = 'sent', sent_at = now(), updated_at = now(), error_message = null WHERE id = $1", [reminder.id]);
              results.push({ id: reminder.id, customer: reminder.customer_name, status: 'SUCCESS', channel: crmChannel });
              successCount++;
              try {
                const cleanPhone = String(reminder.customer_phone || '').replace(/[^0-9]/g, '');
                if (cleanPhone) {
                  await pool.query(
                    `INSERT INTO public.whatsapp_chat_logs (chat_id, customer_phone, customer_name, message, direction, replied_by, channel, created_at)
                     VALUES ($1, $2, $3, $4, 'outgoing', 'cron_crm', $5, now())`,
                    [`${cleanPhone}@c.us`, cleanPhone, reminder.customer_name || 'Pelanggan', formattedMessage, crmChannel]
                  );
                }
              } catch (logErr) {
                console.warn('[Cron CRM] Failed to log to whatsapp_chat_logs:', logErr);
              }
            } else {
              const errMsg = sendResult.error || 'Gagal mengirim dari gateway WhatsApp';
              const isNumberError = errMsg.includes('No LID') || errMsg.includes('not registered') || errMsg.includes('invalid');

              if (isNumberError) {
                await pool.query("UPDATE crm_reminders SET status = 'failed', error_message = $2, updated_at = now() WHERE id = $1", [reminder.id, errMsg.substring(0, 500)]);
                results.push({ id: reminder.id, customer: reminder.customer_name, status: 'FAILED_NUMBER', reason: errMsg });
              } else {
                gatewayError = true;
                results.push({ id: reminder.id, customer: reminder.customer_name, status: 'GATEWAY_ERROR', reason: errMsg });
                break;
              }
            }

            // Delay 1.5 seconds between dispatches
            await new Promise(resolve => setTimeout(resolve, 1500));
          }

          if (gatewayError && successCount === 0) {
            await pool.end();
            return new Response(JSON.stringify({ 
              error: `WhatsApp Gateway Error. Reminders left as pending for retry.`,
              channelUsed: crmChannel,
              results
            }), {
              status: 502,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          await pool.end();

          return new Response(JSON.stringify({ 
            message: `CRM Auto-Reminders cron completed. Processed ${pendingReminders.length}, sent ${successCount}.`, 
            processed: pendingReminders.length,
            sent: successCount,
            channelUsed: crmChannel,
            results 
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });

        } catch (error: any) {
          console.error('[Cron CRM Error]:', error);
          if (pool) {
            try {
              await pool.end();
            } catch (e) {
              // ignore
            }
          }
          return new Response(JSON.stringify({
            error: error.message || 'Internal Server Error',
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }
  }
});
