process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';
import { generateAiCommentReply } from '@/lib/meta-ai-reply';

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

          const openaiApiKey = aiConfig.openai_api_key || process.env.OPENAI_API_KEY;
          if (!openaiApiKey) {
            await pool.end();
            return new Response(JSON.stringify({ error: 'OpenAI API Key belum dikonfigurasi. Silakan isi di Pengaturan AI Asisten.' }), {
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

          const maxBatchSize = 10;
          const commentsToProcess = unrepliedComments.slice(0, maxBatchSize);
          console.log(`[Batch Reply] Processing ${commentsToProcess.length} out of ${unrepliedComments.length} unreplied ${channel} comments sequentially...`);

          const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
          const results = [];

          for (const comment of commentsToProcess) {
            try {
              // Generate AI reply with Biteship check
              const replyText = await generateAiCommentReply({
                commentId: comment.id,
                username: comment.username,
                commentMessage: comment.message,
                csWhatsappNumber: cs_whatsapp_number,
                systemInstruction: system_instruction,
                openaiApiKey,
                retailPricesText: pricesText,
                biteshipEnabled: aiConfig.biteship_enabled ?? true,
                biteshipApiKey: aiConfig.biteship_api_key || process.env.BITESHIP_API_KEY || '',
                biteshipOriginAreaId: aiConfig.biteship_origin_area_id || 'IDNP10IDNC243IDND2494',
                biteshipOriginName: aiConfig.biteship_origin_name || 'Gudang Utama',
                biteshipDefaultWeight: aiConfig.biteship_default_weight || 1000,
                discountConfig: {
                  discountType: aiConfig.discount_type || 'fixed',
                  discountValue: aiConfig.discount_value !== undefined ? Number(aiConfig.discount_value) : 10000,
                  discountNote: aiConfig.discount_note || 'Subsidi ongkir promo toko'
                }
              });

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

              results.push({ id: comment.id, success: true });
              
              // Small delay between replies to prevent Facebook spam filter block
              await sleep(300);
            } catch (err: any) {
              console.error(`[Batch Reply Error] Failed for comment ${comment.id}:`, err.message);
              results.push({ id: comment.id, success: false, error: err.message });
            }
          }

          const succeeded = results.filter(r => r.success).length;
          const failed = results.filter(r => !r.success);

          await pool.end();

          const remainingCount = unrepliedComments.length - succeeded;
          let message = `Berhasil membalas ${succeeded} komentar menggunakan AI.`;
          if (remainingCount > 0) {
            message += ` Masih ada ${remainingCount} komentar tersisa. Silakan klik tombol kembali untuk memproses batch berikutnya.`;
          }

          return new Response(JSON.stringify({ 
            success: true, 
            count: succeeded,
            total: unrepliedComments.length,
            message: message,
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
