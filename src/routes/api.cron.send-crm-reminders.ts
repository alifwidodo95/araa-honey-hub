process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';

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

          if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL environment variable is not defined.');
          }

          // 2. Connect directly to Postgres
          pool = new pg.Pool({
            connectionString: process.env.DATABASE_URL,
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
          const { enabled, delayDays, template: crmTemplate, maxDailyLimit } = crmConfig || {};
          const dailyLimit = Number(maxDailyLimit) || 50;

          // If CRM reminders are disabled, do not run the cron job
          if (enabled === false) {
            await pool.end();
            return new Response(JSON.stringify({ message: 'CRM Auto-Reminders feature is disabled', count: 0 }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // 4. Fetch WAHA configuration
          const wahaConfigRes = await pool.query("SELECT value FROM app_settings WHERE key = 'waha_config'");
          if (wahaConfigRes.rowCount === 0) {
            await pool.end();
            return new Response(JSON.stringify({ message: 'WAHA configuration not found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          const wahaConfig = wahaConfigRes.rows[0].value;
          const { wahaUrl, sessionName, apiKey } = wahaConfig || {};

          if (!wahaUrl || !sessionName) {
            await pool.end();
            return new Response(JSON.stringify({ message: 'WAHA URL or Session Name is not configured' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

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

          // 6. Fetch oldest 1 pending reminder due today or earlier
          const remindersRes = await pool.query(`
            SELECT r.id, r.order_id, r.customer_name, r.customer_phone, r.honey_type, o.created_at as last_order_date
            FROM crm_reminders r
            JOIN orders o ON r.order_id = o.id
            WHERE r.status = 'pending' 
              AND r.scheduled_for <= CURRENT_DATE
            ORDER BY r.scheduled_for ASC
            LIMIT 1
          `);

          const pendingReminders = remindersRes.rows;
          if (pendingReminders.length === 0) {
            await pool.end();
            return new Response(JSON.stringify({ message: 'No pending CRM reminders to send today', count: 0 }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          const reminder = pendingReminders[0];
          const results = [];
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (apiKey) {
            headers['X-Api-Key'] = apiKey;
          }

          // Helper to format phone number
          const formatPhoneNumber = (phone: string): string => {
            let clean = phone.replace(/[^0-9]/g, '');
            if (clean.startsWith('0')) {
              clean = '62' + clean.slice(1);
            } else if (clean.startsWith('8')) {
              clean = '62' + clean;
            }
            return `${clean}@c.us`;
          };

          // Helper to format date in Indonesian style
          const formatDateIndo = (dateStr: string): string => {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            const day = date.getDate();
            const monthIdx = date.getMonth();
            const year = date.getFullYear();
            const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
            return `${day} ${months[monthIdx]} ${year}`;
          };

          // Helper to send message via WAHA
          const sendMessage = async (to: string, text: string) => {
            const chatId = formatPhoneNumber(to);
            try {
              const res = await fetch(`${wahaUrl}/api/sendText`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  session: sessionName,
                  chatId,
                  text
                })
              });
              if (res.ok) return true;

              // Fallback
              const fallbackRes = await fetch(`${wahaUrl}/api/messages/sendText`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  session: sessionName,
                  chatId,
                  text
                })
              });
              return fallbackRes.ok;
            } catch (err) {
              console.error('[Cron CRM] Error sending message via WAHA:', err);
              return false;
            }
          };

          const defaultTemplate = `Halo Kak {customer_name},\n\nSemoga sehat selalu ya Kak. 🍯😊\n\nSekadar mengingatkan, Kakak terakhir kali memesan {honey_type} pada sekitar 45 hari yang lalu.\n\nJika persediaan madu Araa Honey di rumah sudah mulai menipis, Kakak bisa langsung membalas chat ini untuk memesan kembali ya. Terima kasih banyak Kak!`;
          const template = crmTemplate || defaultTemplate;

          if (!reminder.customer_phone) {
            await pool.query("UPDATE crm_reminders SET status = 'failed', error_message = 'Nomor HP kosong', updated_at = now() WHERE id = $1", [reminder.id]);
            results.push({ id: reminder.id, customer: reminder.customer_name, status: 'SKIPPED', reason: 'Phone number is empty' });
          } else {
            const formattedMessage = template
              .replace(/{customer_name}/g, reminder.customer_name || '')
              .replace(/{honey_type}/g, reminder.honey_type || 'Madu Araa')
              .replace(/{last_order_date}/g, formatDateIndo(reminder.last_order_date) || '');

            const success = await sendMessage(reminder.customer_phone, formattedMessage);

            if (success) {
              await pool.query("UPDATE crm_reminders SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = $1", [reminder.id]);
              results.push({ id: reminder.id, customer: reminder.customer_name, status: 'SUCCESS' });
            } else {
              await pool.query("UPDATE crm_reminders SET status = 'failed', error_message = 'Gagal mengirim dari gateway WAHA', updated_at = now() WHERE id = $1", [reminder.id]);
              results.push({ id: reminder.id, customer: reminder.customer_name, status: 'FAILED' });
            }
          }

          await pool.end();

          return new Response(JSON.stringify({ 
            message: 'CRM Auto-Reminders cron execution completed (single message)', 
            processed: 1,
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
