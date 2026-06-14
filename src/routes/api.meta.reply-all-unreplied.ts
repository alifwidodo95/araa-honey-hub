process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';

export const Route = createFileRoute('/api/meta/reply-all-unreplied')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let pool: pg.Pool | null = null;
        try {
          const body = await request.json() as any;
          const { channel } = body;

          if (!channel || !['facebook', 'instagram'].includes(channel)) {
            return new Response(JSON.stringify({ error: 'Channel harus berupa facebook atau instagram' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL is not configured');
          }

          pool = new pg.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
          });

          // Fetch Settings
          const configRes = await pool.query("SELECT value FROM app_settings WHERE key = 'meta_ai_settings'");
          const aiConfig = configRes.rows[0]?.value || {};
          const { 
            cs_whatsapp_number = '0878-3703-5470', 
            system_instruction = '',
            page_access_token = ''
          } = aiConfig;

          if (!page_access_token) {
            await pool.end();
            return new Response(JSON.stringify({ error: 'Token Akses Halaman belum dikonfigurasi. Silakan hubungkan halaman Anda.' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          const openaiApiKey = process.env.OPENAI_API_KEY;
          if (!openaiApiKey) {
            await pool.end();
            return new Response(JSON.stringify({ error: 'OpenAI API Key is missing in environment variables.' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // Fetch retail prices
          const pricesRes = await pool.query(`
            SELECT rp.honey_type, ps.name as size_name, rp.price
            FROM public.retail_prices rp
            JOIN public.product_sizes ps ON rp.size_id = ps.id
            ORDER BY rp.honey_type, ps.sort_order
          `);
          
          let pricesText = '';
          pricesRes.rows.forEach((r: any) => {
            pricesText += `- Madu ${r.honey_type} ${r.size_name}: Rp ${Number(r.price).toLocaleString('id-ID')}\n`;
          });

          const finalSystemInstruction = `
Kamu adalah Asisten Customer Service AI ramah bernama Jarvis untuk toko Madu Araa (Araa Honey).
Tugasmu adalah menjawab komentar konsumen di Facebook Page atau Instagram dengan santun, singkat (maksimal 2 kalimat), dan solutif.

[KONTAK RESMI TOKO]
Nomor WhatsApp CS: ${cs_whatsapp_number} (Arahkan konsumen untuk klik link wa.me/${cs_whatsapp_number.replace(/[^0-9]/g, '')} jika ingin memesan).

[DAFTAR HARGA RETAIL MADU ARAA HARI INI]
${pricesText}

[PANDUAN KHUSUS DARI OWNER]
${system_instruction}

[ATURAN PENTING]
1. Jangan berasumsi tentang harga reseller, hanya gunakan daftar harga di atas untuk eceran/retail.
2. Jawab dengan singkat, padat, dan ramah dalam Bahasa Indonesia yang santun.
`;

          // Fetch all unreplied comments for this channel
          const commentsRes = await pool.query(`
            SELECT c.id, c.post_id, c.username, c.message, c.channel, COALESCE(p.auto_reply_active, true) as auto_reply_active
            FROM public.meta_comments c
            LEFT JOIN public.meta_posts p ON c.post_id = p.id
            WHERE c.replied = false AND c.channel = $1
          `, [channel]);

          const unrepliedComments = commentsRes.rows.filter(r => r.auto_reply_active);

          if (unrepliedComments.length === 0) {
            await pool.end();
            return new Response(JSON.stringify({ success: true, count: 0, message: 'Tidak ada komentar yang perlu dibalas.' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          console.log(`[Batch Reply] Starting batch reply for ${unrepliedComments.length} unreplied ${channel} comments...`);

          // Process in parallel to avoid Vercel 10s timeout
          const replyPromises = unrepliedComments.map(async (comment) => {
            try {
              // 1. Call OpenAI
              const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${openaiApiKey}`
                },
                body: JSON.stringify({
                  model: 'gpt-4o-mini',
                  messages: [
                    { role: 'system', content: finalSystemInstruction },
                    { role: 'user', content: `Nama Pengirim: ${comment.username}\nKomentar: "${comment.message}"` }
                  ],
                  temperature: 0.7,
                  max_tokens: 150
                })
              });

              if (!aiRes.ok) {
                const aiErrText = await aiRes.text();
                throw new Error(`OpenAI error: ${aiErrText}`);
              }

              const aiData = await aiRes.json() as any;
              const replyText = aiData.choices?.[0]?.message?.content?.trim();

              if (!replyText) {
                throw new Error('AI generated an empty reply');
              }

              // 2. Post to Meta
              let metaReplyUrl = `https://graph.facebook.com/v20.0/${comment.id}/comments`;
              if (comment.channel === 'instagram') {
                metaReplyUrl = `https://graph.facebook.com/v20.0/${comment.id}/replies`;
              }

              const metaRes = await fetch(metaReplyUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${page_access_token}`
                },
                body: JSON.stringify({ message: replyText })
              });

              if (!metaRes.ok) {
                const metaErrText = await metaRes.text();
                throw new Error(`Meta API error: ${metaErrText}`);
              }

              // 3. Update DB
              await pool!.query(`
                UPDATE meta_comments
                SET replied = true, reply_message = $1, replied_at = now(), replied_by = 'ai'
                WHERE id = $2
              `, [replyText, comment.id]);

              return { id: comment.id, success: true };
            } catch (err: any) {
              console.error(`[Batch Reply Error] Failed for comment ${comment.id}:`, err.message);
              return { id: comment.id, success: false, error: err.message };
            }
          });

          const results = await Promise.all(replyPromises);
          const succeeded = results.filter(r => r.success).length;
          const failed = results.filter(r => !r.success);

          await pool.end();

          return new Response(JSON.stringify({ 
            success: true, 
            count: succeeded,
            total: unrepliedComments.length,
            failed: failed
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });

        } catch (error: any) {
          console.error('[Batch Reply API Error]:', error);
          if (pool) await pool.end();
          return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }
  }
});
