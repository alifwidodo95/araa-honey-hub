process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';

export const Route = createFileRoute('/api/webhooks/meta-comments')({
  server: {
    handlers: {
      // 1. Meta Webhook Verification (GET)
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const mode = url.searchParams.get('hub.mode');
          const token = url.searchParams.get('hub.verify_token');
          const challenge = url.searchParams.get('hub.challenge');

          const verifyToken = process.env.META_VERIFY_TOKEN || 'araahoney123';

          if (mode === 'subscribe' && token === verifyToken) {
            console.log('[Meta Webhook] Verification successful');
            return new Response(challenge, { status: 200 });
          } else {
            console.warn('[Meta Webhook] Verification failed. Token mismatch.');
            return new Response('Forbidden', { status: 403 });
          }
        } catch (error: any) {
          console.error('[Meta Webhook Verification Error]:', error);
          return new Response('Internal Server Error', { status: 500 });
        }
      },

      // 2. Meta Webhook Event Handler (POST)
      POST: async ({ request }) => {
        let pool: pg.Pool | null = null;
        try {
          const body = await request.json() as any;
          console.log('[Meta Webhook] Received event payload:', JSON.stringify(body));

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
            auto_reply_enabled = true, 
            cs_whatsapp_number = '0878-3703-5470', 
            system_instruction = '',
            page_access_token = '',
            facebook_page_id = '',
            instagram_account_id = ''
          } = aiConfig;

          // Fetch retail prices from database to inject into context
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

          // Construct System Prompt
          const finalSystemInstruction = `
Kamu adalah Asisten Customer Service (CS) manusia yang ramah, hangat, dan santun bernama Jarvis untuk toko Madu Araa (Araa Honey).
Tugasmu adalah membalas komentar konsumen di Facebook/Instagram secara natural dan bervariasi agar tidak terkesan seperti robot/template.

[INFORMASI PENDUKUNG]
- Nomor WhatsApp Order: wa.me/${cs_whatsapp_number.replace(/[^0-9]/g, '')}
- Daftar Harga Retail:
${pricesText}
- Panduan Tambahan dari Owner: ${system_instruction}

[PANDUAN GAYA BAHASA & STRUKTUR BALASAN]
1. **Variasikan Balasan**: Jangan selalu memulai dengan kata "Halo!" atau mengakhiri dengan kalimat yang sama. Gunakan variasi sapaan (seperti "Hai kak,", "Halo kak,", "Selamat siang kak,", dll.) atau langsung jawab intinya dengan ramah.
2. **Sesuaikan dengan Komentar**:
   - **Tanya Harga/Beli/Pemesanan**: Sebutkan harga produk yang ditanyakan (jika ada di daftar) dan berikan link WhatsApp (wa.me) dengan ramah.
   - **Sekadar Testimoni/Pujian/Terima Kasih/Emotikon**: Jawab dengan ucapan terima kasih yang tulus dan mendoakan (contoh: "Sama-sama kak, sehat selalu ya!", "Terima kasih kembali kak, ditunggu orderan berikutnya!"). **JANGAN** sertakan daftar harga atau link WhatsApp di sini agar tidak terlihat seperti spam promosi.
   - **Pertanyaan Umum (Khasiat, Stok, dll.)**: Jawab pertanyaannya secara langsung dan padat (maksimal 2 kalimat). Baru arahkan ke WhatsApp jika mereka ingin memesan.
3. **Aturan Format**:
   - Tulis secara kasual namun tetap sopan. Hindari format markdown seperti tebal/miring atau tanda kurung tautan (seperti [link](url)) karena komentar media sosial tidak mendukungnya. Cukup tulis link WhatsApp secara mentah (misal: wa.me/087837035470).
   - Maksimal balasan adalah 2 kalimat pendek agar nyaman dibaca di kolom komentar.
`;

          // Iterate entries and changes
          for (const entryObj of body.entry || []) {
            const entryId = entryObj.id; // Page ID or Instagram Business Account ID
            
            for (const change of entryObj.changes || []) {
              let commentId = '';
              let postId = '';
              let parentId = null;
              let username = 'User';
              let senderId = '';
              let message = '';
              let channel = '';
              let createdAt = new Date();

              // Case A: Facebook Page webhook event
              if (body.object === 'page' && change.field === 'feed') {
                const val = change.value;
                if (val.item === 'comment' && val.verb === 'add') {
                  commentId = val.comment_id;
                  postId = val.post_id;
                  parentId = val.parent_id === val.post_id ? null : val.parent_id;
                  username = val.from?.name || val.sender_name || 'User Facebook';
                  senderId = String(val.from?.id || val.sender_id || '');
                  message = val.message || '';
                  channel = 'facebook';
                  createdAt = new Date(val.created_time * 1000);
                }
              }

              // Case B: Instagram webhook event
              if (body.object === 'instagram' && change.field === 'comments') {
                const val = change.value;
                if (val && val.id) {
                  commentId = val.id;
                  postId = val.media ? val.media.id : '';
                  parentId = val.parent_id || null;
                  username = val.from ? val.from.username : 'ig_user';
                  senderId = String(val.from ? val.from.id : '');
                  message = val.text || '';
                  channel = 'instagram';
                  createdAt = new Date();
                }
              }

              // Proceed if we parsed a valid comment ID
              if (commentId && message) {
                // Prevent replying to comments made by the Page or IG account itself (avoid loops!)
                const isPageOwner = senderId === String(entryId) || 
                                    senderId === String(facebook_page_id) || 
                                    senderId === String(instagram_account_id) ||
                                    username.toLowerCase().includes('araahoney') ||
                                    username.toLowerCase().includes('madu araa');

                if (isPageOwner) {
                  console.log(`[Meta Webhook] Ignored self comment ${commentId} from ${username}`);
                  continue;
                }

                // Check if post is registered in meta_posts, if not, auto-register it
                const postCheck = await pool.query("SELECT auto_reply_active FROM meta_posts WHERE id = $1", [postId]);
                let isAutoReplyActiveForPost = true;
                if (postCheck.rows.length === 0) {
                  await pool.query(
                    "INSERT INTO meta_posts (id, created_at, auto_reply_active) VALUES ($1, now(), true) ON CONFLICT (id) DO NOTHING", 
                    [postId]
                  );
                } else {
                  isAutoReplyActiveForPost = postCheck.rows[0].auto_reply_active;
                }

                // Insert comment into Database
                const insertRes = await pool.query(`
                  INSERT INTO meta_comments (id, post_id, parent_id, username, message, replied, channel, created_at)
                  VALUES ($1, $2, $3, $4, $5, false, $6, $7)
                  ON CONFLICT (id) DO UPDATE 
                  SET message = EXCLUDED.message -- Just update message if it exists
                  RETURNING replied, reply_message
                `, [commentId, postId, parentId, username, message, channel, createdAt]);

                const alreadyReplied = insertRes.rows[0]?.replied;

                // Process AI Auto-reply
                const openaiApiKey = process.env.OPENAI_API_KEY;

                if (auto_reply_enabled && isAutoReplyActiveForPost && !alreadyReplied && openaiApiKey && page_access_token) {
                  console.log(`[Meta Webhook] Generating AI reply for comment ${commentId}: "${message}"`);
                  
                  // Call OpenAI API
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
                        { role: 'user', content: `Nama Pengirim: ${username}\nKomentar: "${message}"` }
                      ],
                      temperature: 0.7,
                      max_tokens: 150
                    })
                  });

                  if (aiRes.ok) {
                    const aiData = await aiRes.json() as any;
                    const replyText = aiData.choices?.[0]?.message?.content?.trim();

                    if (replyText) {
                      console.log(`[Meta Webhook] AI generated response: "${replyText}". Posting to Meta...`);

                      // Post reply to Meta API
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
                        console.log(`[Meta Webhook] Posted reply successfully to Meta. Response ID: ${metaData.id || metaData.comment_id}`);
                        
                        // Update Database with reply details
                        await pool.query(`
                          UPDATE meta_comments
                          SET replied = true, reply_message = $1, replied_at = now(), replied_by = 'ai'
                          WHERE id = $2
                        `, [replyText, commentId]);
                      } else {
                        const metaErrText = await metaRes.text();
                        console.error(`[Meta Webhook Error] Failed to post reply to Meta:`, metaErrText);
                      }
                    }
                  } else {
                    const aiErrText = await aiRes.text();
                    console.error(`[Meta Webhook Error] OpenAI call failed:`, aiErrText);
                  }
                } else {
                  console.log(`[Meta Webhook] Auto-reply skipped for comment ${commentId}. Reason: auto_reply_enabled=${auto_reply_enabled}, isAutoReplyActiveForPost=${isAutoReplyActiveForPost}, alreadyReplied=${alreadyReplied}, hasOpenAIKey=${!!openaiApiKey}, hasPageToken=${!!page_access_token}`);
                }
              }
            }
          }

          await pool.end();
          return new Response('OK', { status: 200 });
        } catch (error: any) {
          console.error('[Meta Webhook Event Error]:', error);
          if (pool) await pool.end();
          return new Response('Internal Server Error', { status: 500 });
        }
      }
    }
  }
});
