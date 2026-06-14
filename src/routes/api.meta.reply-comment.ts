process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';

export const Route = createFileRoute('/api/meta/reply-comment')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let pool: pg.Pool | null = null;
        try {
          const body = await request.json() as any;
          const { commentId, replyText: inputReplyText, channel, repliedBy = 'manual', triggerAi = false } = body;

          if (!commentId || !channel) {
            return new Response(JSON.stringify({ error: 'Missing commentId or channel' }), {
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
            return new Response(JSON.stringify({ error: 'Page Access Token is not configured. Go to settings tab.' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          let replyText = inputReplyText;
          let finalRepliedBy = repliedBy;

          // If triggerAi is true, fetch the comment text and generate response using OpenAI
          if (triggerAi) {
            const commentDbRes = await pool.query("SELECT message, username FROM meta_comments WHERE id = $1", [commentId]);
            if (commentDbRes.rows.length === 0) {
              await pool.end();
              return new Response(JSON.stringify({ error: 'Comment not found in database to generate AI response.' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              });
            }
            const commentMsg = commentDbRes.rows[0].message;
            const commentUsername = commentDbRes.rows[0].username;

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

            console.log(`[Meta Reply API] Requesting OpenAI reply for comment ${commentId}`);
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
                  { role: 'user', content: `Nama Pengirim: ${commentUsername}\nKomentar: "${commentMsg}"` }
                ],
                temperature: 0.7,
                max_tokens: 150
              })
            });

            if (aiRes.ok) {
              const aiData = await aiRes.json() as any;
              replyText = aiData.choices?.[0]?.message?.content?.trim();
              finalRepliedBy = 'ai';
              if (!replyText) {
                throw new Error('AI generated an empty reply text');
              }
            } else {
              const aiErrText = await aiRes.text();
              throw new Error(`OpenAI API failed: ${aiErrText}`);
            }
          }

          if (!replyText) {
            await pool.end();
            return new Response(JSON.stringify({ error: 'Reply text is required' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          console.log(`[Meta Reply API] Posting reply to comment ${commentId}: "${replyText}"`);

          // Post to Meta Graph API
          let metaReplyUrl = `https://graph.facebook.com/v20.0/${commentId}/comments`;
          if (channel === 'instagram') {
            metaReplyUrl = `https://graph.facebook.com/v20.0/${commentId}/replies`;
          }

          const metaRes = await fetch(metaReplyUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${page_access_token}`
            },
            body: JSON.stringify({ message: replyText })
          });

          if (metaRes.ok) {
            const metaData = await metaRes.json() as any;
            console.log(`[Meta Reply API] Reply posted successfully: ${JSON.stringify(metaData)}`);

            // Update Database with reply details
            await pool.query(`
              UPDATE meta_comments
              SET replied = true, reply_message = $1, replied_at = now(), replied_by = $2
              WHERE id = $3
            `, [replyText, finalRepliedBy, commentId]);

            await pool.end();
            return new Response(JSON.stringify({ success: true, replyText, id: metaData.id || metaData.comment_id }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          } else {
            const errText = await metaRes.text();
            console.error(`[Meta Reply API Error] Meta call failed:`, errText);
            await pool.end();
            return new Response(JSON.stringify({ error: `Meta API Error: ${errText}` }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        } catch (error: any) {
          console.error('[Meta Reply API Error]:', error);
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
