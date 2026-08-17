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

          // 3.5. Enforce working hours (09:00 WIB to 20:00 WIB)
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

          // Helper to extract just the phone digits for checkNumberStatus
          const extractPhoneDigits = (phone: string): string => {
            let clean = phone.replace(/[^0-9]/g, '');
            if (clean.startsWith('0')) {
              clean = '62' + clean.slice(1);
            } else if (clean.startsWith('8')) {
              clean = '62' + clean;
            }
            return clean;
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

          const wahaHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
          if (apiKey) {
            wahaHeaders['X-Api-Key'] = apiKey;
          }

          // Helper to check if phone number exists on WhatsApp
          const checkNumberExists = async (phone: string): Promise<boolean> => {
            try {
              const phoneDigits = extractPhoneDigits(phone);
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 6000);
              const res = await fetch(`${wahaUrl}/api/checkNumberStatus?session=${sessionName}&phone=${phoneDigits}`, {
                headers: wahaHeaders,
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              if (!res.ok) return true; // If check fails, assume exists and try sending
              const data = await res.json();
              return data.numberExists !== false;
            } catch {
              return true; // If check errors, assume exists and try sending
            }
          };

          // Helper to send message via WAHA with 6 seconds timeout
          const sendMessage = async (to: string, text: string): Promise<{ success: boolean; error?: string; isNumberError?: boolean }> => {
            const chatId = formatPhoneNumber(to);
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 6000);

              const res = await fetch(`${wahaUrl}/api/sendText`, {
                method: 'POST',
                headers: wahaHeaders,
                body: JSON.stringify({
                  session: sessionName,
                  chatId,
                  text
                }),
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              if (res.ok) return { success: true };

              // Check if it's a number-specific error (not a gateway error)
              const errText = await res.text().catch(() => '');
              const isNumberError = errText.includes('No LID for user') || 
                                    errText.includes('number does not exist') ||
                                    errText.includes('not registered') ||
                                    errText.includes('invalid phone');
              
              if (isNumberError) {
                return { success: false, error: errText.substring(0, 200), isNumberError: true };
              }

              // Try fallback endpoint
              const fallbackController = new AbortController();
              const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), 6000);

              const fallbackRes = await fetch(`${wahaUrl}/api/messages/sendText`, {
                method: 'POST',
                headers: wahaHeaders,
                body: JSON.stringify({
                  session: sessionName,
                  chatId,
                  text
                }),
                signal: fallbackController.signal
              });
              clearTimeout(fallbackTimeoutId);
              if (fallbackRes.ok) return { success: true };
              
              const fallbackErrText = await fallbackRes.text().catch(() => '');
              return { success: false, error: `WAHA returned status ${fallbackRes.status}: ${fallbackErrText.substring(0, 200)}` };
            } catch (err: any) {
              console.error('[Cron CRM] Error sending message via WAHA:', err);
              return { success: false, error: err.name === 'AbortError' ? 'Request timed out after 6 seconds' : (err.message || 'Connection failed') };
            }
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

            // Check if number exists on WhatsApp before sending
            const numberExists = await checkNumberExists(reminder.customer_phone);
            if (!numberExists) {
              await pool.query("UPDATE crm_reminders SET status = 'failed', error_message = 'Nomor tidak terdaftar di WhatsApp', updated_at = now() WHERE id = $1", [reminder.id]);
              results.push({ id: reminder.id, customer: reminder.customer_name, phone: reminder.customer_phone, status: 'SKIPPED', reason: 'Number not registered on WhatsApp' });
              continue;
            }

            const formattedMessage = template
              .replace(/{customer_name}/g, reminder.customer_name || '')
              .replace(/{honey_type}/g, reminder.honey_type || 'Madu Araa')
              .replace(/{last_order_date}/g, formatDateIndo(reminder.last_order_date) || '');

            const sendResult = await sendMessage(reminder.customer_phone, formattedMessage);

            if (sendResult.success) {
              await pool.query("UPDATE crm_reminders SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = $1", [reminder.id]);
              results.push({ id: reminder.id, customer: reminder.customer_name, status: 'SUCCESS' });
              successCount++;
            } else if (sendResult.isNumberError) {
              // Number-specific error (e.g., "No LID for user") — mark as failed, move on
              await pool.query("UPDATE crm_reminders SET status = 'failed', error_message = $2, updated_at = now() WHERE id = $1", [reminder.id, (sendResult.error || 'Nomor tidak valid di WhatsApp').substring(0, 500)]);
              results.push({ id: reminder.id, customer: reminder.customer_name, status: 'FAILED_NUMBER', reason: sendResult.error });
            } else {
              // Actual WAHA Gateway/Session Error — stop processing, leave as pending for retry
              gatewayError = true;
              results.push({ id: reminder.id, customer: reminder.customer_name, status: 'GATEWAY_ERROR', reason: sendResult.error });
              break;
            }
          }

          if (gatewayError && successCount === 0) {
            await pool.end();
            return new Response(JSON.stringify({ 
              error: `WAHA Gateway Error. Reminders left as pending for retry.`,
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
