process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/telegram-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json() as any;
          
          // Telegram webhook updates contain a message object
          const message = body.message;
          if (!message || !message.text) {
            return new Response('OK', { status: 200 });
          }

          const chatId = message.chat.id;
          const userId = message.from.id;
          const text = message.text.trim();
          
          const authorizedUserId = process.env.TELEGRAM_AUTHORIZED_USER_ID;
          const botToken = process.env.TELEGRAM_BOT_TOKEN;
          
          if (!botToken) {
            console.error('[Telegram webhook] TELEGRAM_BOT_TOKEN is missing');
            return new Response('OK', { status: 200 });
          }

          // Helper to send a message back to Telegram
          const sendTelegramMessage = async (cId: number, msgText: string) => {
            try {
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: cId,
                  text: msgText,
                  parse_mode: 'Markdown'
                })
              });
            } catch (e) {
              console.error('[Telegram webhook] Failed to send message:', e);
            }
          };

          // 1. Security Check: Validate Sender User ID
          if (!authorizedUserId || String(userId) !== String(authorizedUserId)) {
            const replyText = `🔒 *Akses Ditolak*\n\nID Telegram Anda: \`${userId}\`\n\nUntuk mengizinkan ID ini mencatat data, silakan masukkan ID tersebut ke variabel lingkungan \`TELEGRAM_AUTHORIZED_USER_ID\` di panel pengaturan Vercel Anda, lalu redeploy/restart.`;
            await sendTelegramMessage(chatId, replyText);
            return new Response('OK', { status: 200 });
          }

          // 2. Handle /start or /help /info
          if (text === '/start' || text.toLowerCase() === '/help' || text === '/info') {
            const helpText = `👋 *Halo Big Bos!*\n\nJarvis siap mencatat pengeluaran pribadi Anda secara otomatis.\n\n*Format Input:*\n\`[Kategori] [Nominal] [Catatan]\`\n\n*Contoh:*\n\`Belanja 150000 Susu anak\`\n\`Makan 50000 Nasi goreng\`\n\nKategori pertama otomatis akan dikapitalisasi. Jarvis akan mendeteksi angka pertama sebagai nominal, dan sisa teks sebagai catatan.`;
            await sendTelegramMessage(chatId, helpText);
            return new Response('OK', { status: 200 });
          }

          // 3. Parsing Format: "Kategori Nominal Catatan"
          // Matches: category (letters and spaces, no digits), followed by space, digits (amount), followed by optional space and note
          const match = text.match(/^([a-zA-Z\-_]+)\s+(\d+)(?:\s+(.+))?$/i);
          if (!match) {
            const invalidText = `⚠️ *Format Tidak Sesuai*\n\nHarap gunakan format:\n\`[Kategori] [Nominal] [Catatan]\`\n\n*Contoh:*\n\`Belanja 200000 Susu anak\`\n\n*(Catatan: Kategori tidak boleh mengandung spasi langsung sebelum nominal. Gunakan tanda hubung jika ingin menggabung kata, contoh: Belanja-Bulanan)*`;
            await sendTelegramMessage(chatId, invalidText);
            return new Response('OK', { status: 200 });
          }

          const rawCategory = match[1].trim();
          const category = rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1);
          const amount = parseInt(match[2], 10);
          const note = match[3] ? match[3].trim() : '';

          // 4. Database Config Validation
          const dbUrl = process.env.DATABASE_URL;
          if (!dbUrl) {
            console.error('[Telegram webhook] DATABASE_URL is missing');
            await sendTelegramMessage(chatId, '❌ *Error:* Kredensial database `DATABASE_URL` belum dikonfigurasi di Vercel.');
            return new Response('OK', { status: 200 });
          }

                    // 5. Connect and Write to Supabase via Postgres client
          const { default: pg } = await import('pg');
          const cleanedDbUrl = dbUrl.split('?')[0];
          const pool = new pg.Pool({
            connectionString: cleanedDbUrl,
            ssl: { rejectUnauthorized: false }
          });

          try {
            // Query Owner user_id from database
            const ownerRes = await pool.query("SELECT user_id FROM user_roles WHERE role = 'owner' LIMIT 1");
            if (ownerRes.rows.length === 0) {
              await sendTelegramMessage(chatId, '❌ *Error:* Akun pengguna dengan peran `owner` tidak ditemukan di database.');
              return new Response('OK', { status: 200 });
            }
            const ownerId = ownerRes.rows[0].user_id;

            // Calculate Date in Jakarta/WIB (GMT+7) Timezone
            const now = new Date();
            const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
            const wibTime = new Date(utc + (3600000 * 7));
            const occurredOn = wibTime.toISOString().slice(0, 10); // YYYY-MM-DD

            // Insert row
            await pool.query(
              `INSERT INTO expenses_personal (category, amount, note, occurred_on, owner_id) 
               VALUES ($1, $2, $3, $4, $5)`,
              [category, amount, note, occurredOn, ownerId]
            );

            // Confirmation Format
            const formattedAmount = new Intl.NumberFormat('id-ID', { 
              style: 'currency', 
              currency: 'IDR', 
              maximumFractionDigits: 0 
            }).format(amount);
            
            const successText = `✅ *Pengeluaran Berhasil Dicatat!*\n\n📅 *Tanggal:* ${occurredOn}\n🏷️ *Kategori:* ${category}\n🪙 *Nominal:* ${formattedAmount}\n📝 *Catatan:* ${note || '—'}`;
            await sendTelegramMessage(chatId, successText);

          } catch (dbErr: any) {
            console.error('[Telegram webhook] Database query error:', dbErr);
            await sendTelegramMessage(chatId, `❌ *Gagal Menyimpan ke Database:*\n\`${dbErr.message}\``);
          } finally {
            await pool.end();
          }

          return new Response('OK', { status: 200 });

        } catch (err: any) {
          console.error('[Telegram webhook] Webhook error:', err);
          return new Response('OK', { status: 200 });
        }
      }
    }
  }
});
