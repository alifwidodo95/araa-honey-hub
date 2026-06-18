process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';

export const Route = createFileRoute('/api/webhooks/whatsapp')({
  server: {
    handlers: {
      GET: async () => {
        return new Response('WhatsApp Webhook Active', { status: 200 });
      },
      POST: async ({ request }) => {
        let pool: pg.Pool | null = null;
        try {
          const body = await request.json() as any;
          console.log('[WA Webhook] Received payload:', JSON.stringify(body));

          // 1. Verify it is a message event and not sent by ourselves (to prevent loops)
          if (body.event !== 'message') {
            return new Response('Ignored event', { status: 200 });
          }

          const payload = body.payload || {};
          const isFromMe = payload.fromMe === true;
          if (isFromMe) {
            console.log('[WA Webhook] Ignored outgoing message (fromMe = true)');
            return new Response('Ignored outgoing message', { status: 200 });
          }

          const session = body.session || 'default';
          const chatId = payload.from; // e.g. "628xxx@c.us"
          const customerPhone = chatId.split('@')[0];
          const customerName = payload.sender?.name || 'Pelanggan WA';
          const incomingMessageText = payload.body || '';
          const messageType = payload.type || 'chat'; // 'chat', 'image', 'voice', 'audio', etc.
          const messageId = payload.id;

          if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL is not configured');
          }

          pool = new pg.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
          });

          // 2. Lookup AI settings for this WAHA session
          const settingsRes = await pool.query(
            'SELECT * FROM public.whatsapp_ai_settings WHERE waha_session = $1 LIMIT 1',
            [session]
          );

          if (settingsRes.rowCount === 0) {
            console.log(`[WA Webhook] Session ${session} is not registered in AI settings.`);
            await pool.end();
            return new Response('Session not configured', { status: 200 });
          }

          const settings = settingsRes.rows[0];
          const { 
            user_id: userId, 
            deepseek_api_key: deepseekApiKey, 
            system_prompt: systemPrompt, 
            is_active: isActive,
            waha_url: customWahaUrl,
            waha_api_key: customWahaApiKey
          } = settings;

          if (!isActive || !deepseekApiKey) {
            console.log(`[WA Webhook] Bot for session ${session} is disabled or missing API Key.`);
            await pool.end();
            return new Response('Bot inactive', { status: 200 });
          }

          // Fetch global WAHA url and token fallback if custom is not set
          const globalConfigRes = await pool.query("SELECT value FROM public.app_settings WHERE key = 'waha_config'");
          const globalConfig = globalConfigRes.rows[0]?.value || {};
          
          const wahaUrl = customWahaUrl || globalConfig.wahaUrl || 'https://waha.araahoney.my.id';
          const wahaApiKey = customWahaApiKey || globalConfig.apiKey || '';

          // Fetch OpenAI API Key for Whisper (Voice) and Vision fallback if needed
          const metaConfigRes = await pool.query("SELECT value FROM public.app_settings WHERE key = 'meta_ai_settings'");
          const metaConfig = metaConfigRes.rows[0]?.value || {};
          const openaiApiKey = process.env.OPENAI_API_KEY || metaConfig.openai_api_key || '';

          let processedInputText = incomingMessageText;
          let voiceLogText = '';
          let imageAnalysisText = '';

          // Helper headers for WAHA
          const getWahaHeaders = () => {
            const h: Record<string, string> = { 'Content-Type': 'application/json' };
            if (wahaApiKey) {
              h['X-Api-Key'] = wahaApiKey;
            }
            return h;
          };

          // 3. Handle Multimodal Input (Voice / Image)
          if (payload.hasMedia) {
            const mediaUrl = `${wahaUrl}/api/${session}/files/${encodeURIComponent(messageId)}/download`;
            console.log(`[WA Webhook] Fetching media file from WAHA: ${mediaUrl}`);
            
            try {
              const mediaRes = await fetch(mediaUrl, { headers: getWahaHeaders() });
              if (mediaRes.ok) {
                const mimeType = mediaRes.headers.get('Content-Type') || '';
                const buffer = await mediaRes.arrayBuffer();

                // Case A: Voice Note / Audio Transcription (using OpenAI Whisper)
                if ((messageType === 'voice' || messageType === 'audio' || mimeType.includes('audio')) && openaiApiKey) {
                  console.log('[WA Webhook] Processing voice note transcription...');
                  const formData = new FormData();
                  const file = new File([buffer], 'voice.ogg', { type: mimeType || 'audio/ogg' });
                  formData.append('file', file);
                  formData.append('model', 'whisper-1');
                  formData.append('language', 'id');

                  const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${openaiApiKey}` },
                    body: formData
                  });

                  if (whisperRes.ok) {
                    const whisperData = await whisperRes.json() as any;
                    processedInputText = whisperData.text || '';
                    voiceLogText = `[Pesan Suara (Transkripsi)]: ${processedInputText}`;
                    console.log(`[WA Webhook] Transcribed Voice: "${processedInputText}"`);
                  } else {
                    console.error('[WA Webhook] Whisper API failed:', await whisperRes.text());
                  }
                }

                // Case B: Image analysis (using OpenAI GPT-4o-mini Vision)
                if ((messageType === 'image' || mimeType.includes('image')) && openaiApiKey) {
                  console.log('[WA Webhook] Processing image analysis...');
                  const base64Image = Buffer.from(buffer).toString('base64');
                  const dataUrl = `data:${mimeType || 'image/png'};base64,${base64Image}`;

                  const visionRes = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${openaiApiKey}`
                    },
                    body: JSON.stringify({
                      model: 'gpt-4o-mini',
                      messages: [
                        {
                          role: 'user',
                          content: [
                            { 
                              type: 'text', 
                              text: 'Analisis gambar yang dikirim oleh pelanggan WhatsApp ini. Jika ini adalah bukti transfer pembayaran (resi transfer), identifikasi nama bank, nama pengirim, tanggal transfer, dan nominal uang yang ditransfer secara singkat. Jika ini gambar lain, jelaskan singkat apa gambarnya.' 
                            },
                            {
                              type: 'image_url',
                              image_url: { url: dataUrl }
                            }
                          ]
                        }
                      ],
                      max_tokens: 150
                    })
                  });

                  if (visionRes.ok) {
                    const visionData = await visionRes.json() as any;
                    imageAnalysisText = visionData.choices?.[0]?.message?.content || '';
                    console.log(`[WA Webhook] Image analysis result: "${imageAnalysisText}"`);
                    // We append the image description so DeepSeek knows what the customer sent
                    processedInputText = `${incomingMessageText}\n\n[Analisis Gambar/Bukti Transfer]: ${imageAnalysisText}`.trim();
                  } else {
                    console.error('[WA Webhook] Vision API failed:', await visionRes.text());
                  }
                }
              } else {
                console.error('[WA Webhook] Failed to download media from WAHA:', await mediaRes.text());
              }
            } catch (mediaErr) {
              console.error('[WA Webhook] Media processing exception:', mediaErr);
            }
          }

          // If it is just a media message with no text and we couldn't parse it, ignore
          if (!processedInputText && !voiceLogText && !imageAnalysisText) {
            console.log('[WA Webhook] Empty message text and no media parsed, ignoring.');
            await pool.end();
            return new Response('No content', { status: 200 });
          }

          // 4. Fetch last 5 messages for conversation memory/history (fetch before inserting current message to avoid duplicates)
          const historyRes = await pool.query(`
            SELECT message, direction FROM public.whatsapp_chat_logs
            WHERE user_id = $1 AND chat_id = $2
            ORDER BY created_at DESC
            LIMIT 5
          `, [userId, chatId]);

          const chatHistory = (historyRes.rows || []).reverse().map((r: any) => ({
            role: r.direction === 'incoming' ? 'user' : 'assistant',
            content: r.message
          }));

          // Log the incoming message to database
          const incomingLoggedText = voiceLogText || incomingMessageText || (imageAnalysisText ? `[Mengirim Gambar] ${imageAnalysisText}` : '');
          await pool.query(`
            INSERT INTO public.whatsapp_chat_logs (user_id, chat_id, customer_phone, customer_name, message, direction, created_at)
            VALUES ($1, $2, $3, $4, $5, 'incoming', now())
          `, [userId, chatId, customerPhone, customerName, incomingLoggedText]);

          // Fetch current retail prices to inject into AI prompt context
          const pricesRes = await pool.query(`
            SELECT rp.honey_type, ps.name as size_name, rp.price
            FROM public.retail_prices rp
            JOIN public.product_sizes ps ON rp.size_id = ps.id
            ORDER BY rp.honey_type, ps.sort_order
          `);
          
          let pricesText = 'DAFTAR HARGA RETAIL MADU ARAA:\n';
          pricesRes.rows.forEach((r: any) => {
            pricesText += `- Madu ${r.honey_type} ${r.size_name}: Rp ${Number(r.price).toLocaleString('id-ID')}\n`;
          });

          // Compile final system instruction
          const finalSystemInstruction = `${systemPrompt}\n\n${pricesText}`;

          // 5. Ask DeepSeek for the response
          console.log(`[WA Webhook] Querying DeepSeek V3 for ${chatId}...`);
          const deepseekMessages = [
            { role: 'system', content: finalSystemInstruction },
            ...chatHistory,
            { role: 'user', content: processedInputText }
          ];

          const deepseekRes = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${deepseekApiKey}`
            },
            body: JSON.stringify({
              model: 'deepseek-chat',
              messages: deepseekMessages,
              temperature: 0.5,
              max_tokens: 200
            })
          });

          if (!deepseekRes.ok) {
            const errText = await deepseekRes.text();
            throw new Error(`DeepSeek API failed: ${deepseekRes.status} - ${errText}`);
          }

          const deepseekData = await deepseekRes.json() as any;
          const replyText = deepseekData.choices?.[0]?.message?.content?.trim();

          if (!replyText) {
            console.log('[WA Webhook] Empty response from DeepSeek, ignoring.');
            await pool.end();
            return new Response('No AI response', { status: 200 });
          }

          console.log(`[WA Webhook] DeepSeek generated reply: "${replyText}". Sending via WAHA...`);

          // 6. Send message back via WAHA
          const sendRes = await fetch(`${wahaUrl}/api/messages/sendText`, {
            method: 'POST',
            headers: getWahaHeaders(),
            body: JSON.stringify({
              session: session,
              chatId: chatId,
              text: replyText
            })
          });

          if (sendRes.ok) {
            console.log('[WA Webhook] Reply sent successfully via WAHA.');
            // Log outgoing reply to database
            await pool.query(`
              INSERT INTO public.whatsapp_chat_logs (user_id, chat_id, customer_phone, customer_name, message, direction, replied_by, created_at)
              VALUES ($1, $2, $3, $4, $5, 'outgoing', 'ai', now())
            `, [userId, chatId, customerPhone, customerName, replyText]);
          } else {
            console.error('[WA Webhook] Failed to send message via WAHA:', await sendRes.text());
          }

          await pool.end();
          return new Response('OK', { status: 200 });

        } catch (error: any) {
          console.error('[WA Webhook Error]:', error);
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
