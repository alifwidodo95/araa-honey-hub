import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';

export const Route = createFileRoute('/api/cron/send-resi')({
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

          // 3. Fetch WAHA configuration
          const configRes = await pool.query("SELECT value FROM app_settings WHERE key = 'waha_config'");
          if (configRes.rowCount === 0) {
            await pool.end();
            return new Response(JSON.stringify({ message: 'WAHA configuration not found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          const wahaConfig = configRes.rows[0].value;
          const { wahaUrl, sessionName, apiKey, messageTemplate, autoSchedule } = wahaConfig || {};

          // If automatic sending is toggled off, do not run the cron job
          if (autoSchedule === false) {
            await pool.end();
            return new Response(JSON.stringify({ message: 'Automatic scheduling is disabled', count: 0 }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (!wahaUrl || !sessionName) {
            await pool.end();
            return new Response(JSON.stringify({ message: 'WAHA URL or Session Name is not configured' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // 4. Fetch pending orders
          const ordersRes = await pool.query(`
            SELECT id, customer_name, customer_phone, tracking_number, expedition 
            FROM orders 
            WHERE channel = 'whatsapp' 
              AND tracking_number IS NOT NULL 
              AND resi_shared_via_wa = false
            ORDER BY created_at ASC
          `);

          const pendingOrders = ordersRes.rows;
          if (pendingOrders.length === 0) {
            await pool.end();
            return new Response(JSON.stringify({ message: 'No pending resi orders to send', count: 0 }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          console.log(`[Cron Resi] Found ${pendingOrders.length} pending orders to process.`);

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

          // Helper to send message
          const sendMessage = async (to: string, text: string) => {
            const chatId = formatPhoneNumber(to);
            // Try sendText first
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
              console.error('[Cron Resi] Error sending message via WAHA:', err);
              return false;
            }
          };

          // 5. Process each order
          const template = messageTemplate || `Halo Kak {customer_name},\n\nPaket madu Araa Honey pesanan Kakak telah dikirim menggunakan {expedition}.\n\n*Resi Pengiriman:* {tracking_number}\n\nKakak bisa melacak status pengiriman secara berkala di aplikasi pelacakan ekspedisi terkait. Terima kasih banyak telah berbelanja di Araa Honey! 🍯🐝`;

          for (const order of pendingOrders) {
            if (!order.customer_phone || !order.tracking_number) {
              results.push({ id: order.id, status: 'SKIPPED', reason: 'Phone or tracking number is empty' });
              continue;
            }

            const formattedMessage = template
              .replace(/{customer_name}/g, order.customer_name || '')
              .replace(/{tracking_number}/g, order.tracking_number || '')
              .replace(/{expedition}/g, order.expedition || '');

            const success = await sendMessage(order.customer_phone, formattedMessage);

            if (success) {
              // Update database status
              await pool.query('UPDATE orders SET resi_shared_via_wa = true WHERE id = $1', [order.id]);
              results.push({ id: order.id, customer: order.customer_name, status: 'SUCCESS' });
            } else {
              // Log failure error
              await pool.query("UPDATE orders SET wa_share_error = 'Gagal mengirim dari cron gateway WAHA' WHERE id = $1", [order.id]);
              results.push({ id: order.id, customer: order.customer_name, status: 'FAILED' });
            }

            // Optional: Small delay to prevent spamming
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          await pool.end();

          return new Response(JSON.stringify({ 
            message: 'Cron job execution completed', 
            processed: pendingOrders.length,
            results 
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });

        } catch (error: any) {
          console.error('[Cron Resi Error]:', error);
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
