process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';
import { sendWhatsAppMessage } from '@/lib/whatsapp-service';

export const Route = createFileRoute('/api/webhooks/whatsapp')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const mode = url.searchParams.get('hub.mode');
          const token = url.searchParams.get('hub.verify_token');
          const challenge = url.searchParams.get('hub.challenge');

          const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || 'araahoney123';

          if (mode === 'subscribe' && token === verifyToken) {
            console.log('[WhatsApp Webhook] Verification successful');
            return new Response(challenge, { status: 200 });
          }
          return new Response('WhatsApp Webhook Active', { status: 200 });
        } catch (error: any) {
          console.error('[WhatsApp Webhook Verification Error]:', error);
          return new Response('Internal Server Error', { status: 500 });
        }
      },
      POST: async ({ request }) => {
        let pool: pg.Pool | null = null;
        try {
          const body = await request.json() as any;
          console.log('[WA Webhook] Received payload:', JSON.stringify(body));

          const dbUrl = process.env.DATABASE_URL || "postgres://postgres.saefgyiloalpiqfrglqo:Handayani01@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";
          pool = new pg.Pool({
            connectionString: dbUrl,
            ssl: { rejectUnauthorized: false }
          });

          // =========================================================================
          // CASE 1: META CLOUD API (WABA) WEBHOOK
          // =========================================================================
          if (body.object === 'whatsapp_business_account') {
            const entries = body.entry || [];
            
            for (const entry of entries) {
              const changes = entry.changes || [];
              for (const change of changes) {
                const val = change.value || {};
                
                // Lookup AI settings & fallback user_id early
                const aiSettingsRes = await pool.query('SELECT * FROM public.whatsapp_ai_settings ORDER BY updated_at DESC LIMIT 1');
                const aiSettings = aiSettingsRes.rows[0] || {};
                let userId = aiSettings.user_id;

                if (!userId) {
                  const fallbackUser = await pool.query('SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1');
                  userId = fallbackUser.rows[0]?.id;
                }

                // Handle delivery receipts / statuses (sent, delivered, read, failed)
                if (val.statuses && (!val.messages || val.messages.length === 0)) {
                  for (const st of val.statuses) {
                    console.log(`[Meta Webhook] Status update: recipient=${st.recipient_id}, status=${st.status}, id=${st.id}`);
                    if (st.status === 'failed' || (st.errors && st.errors.length > 0)) {
                      const errDetails = (st.errors || []).map((e: any) => `[Error ${e.code}]: ${e.title || ''} - ${e.message || ''} (${e.error_data?.details || ''})`).join('; ') || `Status: ${st.status}`;
                      console.error(`[Meta Webhook] Message DELIVERY FAILED: ${errDetails}`);
                      try {
                        let recipientName = `+${st.recipient_id}`;
                        const nameRes = await pool.query(
                          "SELECT customer_name FROM public.whatsapp_chat_logs WHERE customer_phone = $1 AND customer_name IS NOT NULL AND customer_name != 'Meta Status' ORDER BY created_at DESC LIMIT 1",
                          [st.recipient_id]
                        );
                        if (nameRes.rows[0]?.customer_name) {
                          recipientName = nameRes.rows[0].customer_name;
                        } else {
                          const custRes = await pool.query("SELECT name FROM public.customers WHERE phone = $1 OR phone = $2 LIMIT 1", [st.recipient_id, '+' + st.recipient_id]);
                          if (custRes.rows[0]?.name) {
                            recipientName = custRes.rows[0].name;
                          }
                        }

                        await pool.query(`
                          INSERT INTO public.whatsapp_chat_logs (user_id, chat_id, customer_phone, customer_name, message, direction, replied_by, channel, created_at)
                          VALUES ($1, $2, $3, $4, $5, 'outgoing', 'meta_error', 'waba', now())
                        `, [userId, `${st.recipient_id}@c.us`, st.recipient_id, recipientName, `❌ Gagal Terkirim via Meta WABA: ${errDetails}`]);
                      } catch (dbErr) {
                        console.error('[Meta Webhook] Failed to write status error log:', dbErr);
                      }
                    }
                  }
                  continue;
                }

                const contacts = val.contacts || [];
                const messages = val.messages || [];

                for (const msg of messages) {
                  const customerPhone = msg.from; // e.g. "6281901942233"
                  const chatId = `${customerPhone}@c.us`;

                  // Resolve customer name properly
                  let customerName = contacts[0]?.profile?.name;
                  if (!customerName || customerName === 'Pelanggan WA') {
                    const existingNameRes = await pool.query(
                      "SELECT customer_name FROM public.whatsapp_chat_logs WHERE customer_phone = $1 AND customer_name IS NOT NULL AND customer_name != 'Meta Status' AND customer_name != 'Pelanggan' AND customer_name != 'Pelanggan WA' ORDER BY created_at DESC LIMIT 1",
                      [customerPhone]
                    );
                    if (existingNameRes.rows[0]?.customer_name) {
                      customerName = existingNameRes.rows[0].customer_name;
                    } else {
                      const custRes = await pool.query("SELECT name FROM public.customers WHERE phone = $1 OR phone = $2 LIMIT 1", [customerPhone, '+' + customerPhone]);
                      if (custRes.rows[0]?.name) {
                        customerName = custRes.rows[0].name;
                      }
                    }
                  }
                  if (!customerName) customerName = 'Pelanggan';

                  const messageType = msg.type || 'text';
                  let incomingText = '';

                  if (messageType === 'text') {
                    incomingText = msg.text?.body || '';
                  } else if (messageType === 'image') {
                    incomingText = msg.image?.caption || '[Pelanggan Mengirim Gambar]';
                  } else if (messageType === 'audio' || messageType === 'voice') {
                    incomingText = '[Pesan Suara]';
                  } else if (messageType === 'interactive') {
                    incomingText = msg.interactive?.button_reply?.title || msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.title || '';
                  } else if (messageType === 'button') {
                    incomingText = msg.button?.text || msg.button?.payload || '';
                  } else {
                    incomingText = msg.text?.body || `[Pesan ${messageType}]`;
                  }

                  if (!incomingText) continue;

                  console.log(`[Meta Webhook] Inbound WABA message from ${customerPhone} (${customerName}): "${incomingText}"`);

                  // Fetch last 5 messages for history context
                  const historyRes = await pool.query(`
                    SELECT message, direction FROM public.whatsapp_chat_logs
                    WHERE (chat_id = $1 OR customer_phone = $2)
                    ORDER BY created_at DESC
                    LIMIT 5
                  `, [chatId, customerPhone]);

                  const chatHistory = (historyRes.rows || []).reverse().map((r: any) => ({
                    role: r.direction === 'incoming' ? 'user' : 'assistant',
                    content: r.message
                  }));

                  // Save incoming message to database with channel='waba'
                  await pool.query(`
                    INSERT INTO public.whatsapp_chat_logs (user_id, chat_id, customer_phone, customer_name, message, direction, channel, created_at)
                    VALUES ($1, $2, $3, $4, $5, 'incoming', 'waba', now())
                  `, [userId, chatId, customerPhone, customerName, incomingText]);

                  // Check if AI auto-reply is active
                  const {
                    deepseek_api_key: deepseekApiKey,
                    system_prompt: systemPrompt,
                    is_active: isActive,
                    biteship_origin_area_id: biteshipOriginAreaId,
                    biteship_origin_name: biteshipOriginName
                  } = aiSettings;

                  if (isActive) {
                    let biteshipRatesText = '';
                    const lowercaseInput = incomingText.toLowerCase();
                    const asksForOngkir = 
                      lowercaseInput.includes('ongkir') || 
                      lowercaseInput.includes('ongkos kirim') || 
                      lowercaseInput.includes('tarif kirim') || 
                      lowercaseInput.includes('biaya kirim') || 
                      lowercaseInput.includes('kirim ke') || 
                      lowercaseInput.includes('ongkos ke');

                    // Check Biteship if asking for ongkir
                    if (asksForOngkir && process.env.BITESHIP_API_KEY && biteshipOriginAreaId) {
                      try {
                        const biteshipKey = process.env.BITESHIP_API_KEY;
                        // Search destination
                        const searchAreaRes = await fetch(`https://api.biteship.com/v1/maps/areas?countries=ID&input=${encodeURIComponent(incomingText)}`, {
                          method: 'GET',
                          headers: {
                            'Authorization': `Bearer ${biteshipKey}`,
                            'Content-Type': 'application/json'
                          }
                        });

                        if (searchAreaRes.ok) {
                          const searchAreaData = await searchAreaRes.json() as any;
                          const areas = searchAreaData.areas || [];
                          if (areas.length > 0) {
                            const destinationAreaId = areas[0].id;
                            const destinationAreaName = areas[0].name;

                            const ratesRes = await fetch('https://api.biteship.com/v1/rates/couriers', {
                              method: 'POST',
                              headers: {
                                'Authorization': `Bearer ${biteshipKey}`,
                                'Content-Type': 'application/json'
                              },
                              body: JSON.stringify({
                                origin_area_id: biteshipOriginAreaId,
                                destination_area_id: destinationAreaId,
                                items: [{ name: 'Madu Araa', value: 50000, weight: 1000, quantity: 1 }]
                              })
                            });

                            if (ratesRes.ok) {
                              const ratesData = await ratesRes.json() as any;
                              const pricing = ratesData.pricing || [];
                              if (pricing.length > 0) {
                                biteshipRatesText = `\n\n[INFO ONGKIR LIVE BITESHIP]\nTujuan: ${destinationAreaName}\nTarif: ` + 
                                  pricing.slice(0, 3).map((p: any) => `${p.company.toUpperCase()} (${p.type}): Rp ${Number(p.price).toLocaleString('id-ID')}`).join(', ');
                              }
                            }
                          }
                        }
                      } catch (bErr) {
                        console.error('[Meta Webhook] Biteship lookup error:', bErr);
                      }
                    }

                    // Query AI (DeepSeek with seamless fallback to OpenAI gpt-4o-mini)
                    const finalSystemInstruction = `${systemPrompt || 'Kamu adalah Asisten Customer Service AI ramah bernama Jarvis untuk toko Madu Araa (Araa Honey). Jawablah dengan sopan, solutif, dan ramah.'}${biteshipRatesText}`;
                    const promptMessages = [
                      { role: 'system', content: finalSystemInstruction },
                      ...chatHistory,
                      { role: 'user', content: incomingText }
                    ];

                    let replyText = '';

                    // 1. Try DeepSeek first if key provided
                    if (deepseekApiKey) {
                      try {
                        const deepseekRes = await fetch('https://api.deepseek.com/chat/completions', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${deepseekApiKey}`
                          },
                          body: JSON.stringify({
                            model: 'deepseek-chat',
                            messages: promptMessages,
                            temperature: 0.5,
                            max_tokens: 200
                          })
                        });

                        if (deepseekRes.ok) {
                          const deepseekData = await deepseekRes.json() as any;
                          replyText = deepseekData.choices?.[0]?.message?.content?.trim() || '';
                        } else {
                          console.warn('[Meta Webhook] DeepSeek call returned status:', deepseekRes.status);
                        }
                      } catch (dsErr) {
                        console.error('[Meta Webhook] DeepSeek error:', dsErr);
                      }
                    }

                    // 2. Seamless Fallback to OpenAI gpt-4o-mini if DeepSeek failed or has no key
                    if (!replyText) {
                      try {
                        const metaConfigRes = await pool.query("SELECT value FROM public.app_settings WHERE key = 'meta_ai_settings'");
                        const metaConfig = metaConfigRes.rows[0]?.value || {};
                        const openaiApiKey = process.env.OPENAI_API_KEY || metaConfig.openai_api_key;

                        if (openaiApiKey) {
                          console.log('[Meta Webhook] Using OpenAI gpt-4o-mini for WABA auto-reply...');
                          const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'Authorization': `Bearer ${openaiApiKey}`
                            },
                            body: JSON.stringify({
                              model: 'gpt-4o-mini',
                              messages: promptMessages,
                              temperature: 0.5,
                              max_tokens: 200
                            })
                          });

                          if (oaiRes.ok) {
                            const oaiData = await oaiRes.json() as any;
                            replyText = oaiData.choices?.[0]?.message?.content?.trim() || '';
                          } else {
                            console.error('[Meta Webhook] OpenAI error status:', oaiRes.status, await oaiRes.text());
                          }
                        }
                      } catch (oaiErr) {
                        console.error('[Meta Webhook] OpenAI fallback error:', oaiErr);
                      }
                    }

                    if (replyText) {
                      console.log(`[Meta Webhook] AI generated reply: "${replyText}". Dispatching via WABA...`);
                      const sendResult = await sendWhatsAppMessage({
                        to: customerPhone,
                        message: replyText,
                        channel: 'waba'
                      });

                      if (sendResult.success) {
                        await pool.query(`
                          INSERT INTO public.whatsapp_chat_logs (user_id, chat_id, customer_phone, customer_name, message, direction, replied_by, channel, created_at)
                          VALUES ($1, $2, $3, $4, $5, 'outgoing', 'ai', 'waba', now())
                        `, [userId, chatId, customerPhone, customerName, replyText]);
                      }
                    }
                  }
                }
              }
            }

            await pool.end();
            return new Response('EVENT_RECEIVED', { status: 200 });
          }

          // =========================================================================
          // CASE 2: WAHA WEBHOOK (SESSION BASED)
          // =========================================================================
          if (body.event !== 'message') {
            if (pool) await pool.end();
            return new Response('Ignored non-message event', { status: 200 });
          }

          const payload = body.payload || {};
          const isFromMe = payload.fromMe === true;
          if (isFromMe) {
            console.log('[WA Webhook] Ignored outgoing message (fromMe = true)');
            if (pool) await pool.end();
            return new Response('Ignored outgoing message', { status: 200 });
          }

          const session = body.session || 'default';
          const chatId = payload.from; // e.g. "628xxx@c.us"
          const customerPhone = chatId.split('@')[0];
          const customerName = payload.sender?.name || 'Pelanggan WA';
          const incomingMessageText = payload.body || '';
          const messageType = payload.type || 'chat';
          const messageId = payload.id;
          const channelName = session === 'campaign' ? 'waha_campaign' : 'waha_main';

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
            waha_api_key: customWahaApiKey,
            biteship_origin_area_id: biteshipOriginAreaId,
            biteship_origin_name: biteshipOriginName
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

          const getWahaHeaders = () => {
            const h: Record<string, string> = { 'Content-Type': 'application/json' };
            if (wahaApiKey) {
              h['X-Api-Key'] = wahaApiKey;
            }
            return h;
          };

          // Handle Multimodal Input (Voice / Image)
          if (payload.hasMedia) {
            const mediaUrl = `${wahaUrl}/api/${session}/files/${encodeURIComponent(messageId)}/download`;
            try {
              const mediaRes = await fetch(mediaUrl, { headers: getWahaHeaders() });
              if (mediaRes.ok) {
                const mimeType = mediaRes.headers.get('Content-Type') || '';
                const buffer = await mediaRes.arrayBuffer();

                // Case A: Voice Note / Audio Transcription (using OpenAI Whisper)
                if ((messageType === 'voice' || messageType === 'audio' || mimeType.includes('audio')) && openaiApiKey) {
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
                  }
                }

                // Case B: Image analysis (using OpenAI GPT-4o-mini Vision)
                if ((messageType === 'image' || mimeType.includes('image')) && openaiApiKey) {
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
                    processedInputText = `${incomingMessageText}\n\n[Analisis Gambar/Bukti Transfer]: ${imageAnalysisText}`.trim();
                  }
                }
              }
            } catch (mediaErr) {
              console.error('[WA Webhook] Media processing exception:', mediaErr);
            }
          }

          if (!processedInputText && !voiceLogText && !imageAnalysisText) {
            await pool.end();
            return new Response('No content', { status: 200 });
          }

          // Fetch last 5 messages for conversation memory
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
            INSERT INTO public.whatsapp_chat_logs (user_id, chat_id, customer_phone, customer_name, message, direction, channel, created_at)
            VALUES ($1, $2, $3, $4, $5, 'incoming', $6, now())
          `, [userId, chatId, customerPhone, customerName, incomingLoggedText, channelName]);

          // Biteship Ongkir Check
          let biteshipRatesText = '';
          const lowercaseInput = (processedInputText || '').toLowerCase();
          const asksForOngkir = 
            lowercaseInput.includes('ongkir') || 
            lowercaseInput.includes('ongkos kirim') || 
            lowercaseInput.includes('tarif kirim') || 
            lowercaseInput.includes('biaya kirim') || 
            lowercaseInput.includes('kirim ke') || 
            lowercaseInput.includes('ongkos ke');

          if (asksForOngkir && process.env.BITESHIP_API_KEY && biteshipOriginAreaId) {
            try {
              let extractedLocation = '';
              if (openaiApiKey) {
                const extractionRes = await fetch('https://api.openai.com/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`
                  },
                  body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                      {
                        role: 'system',
                        content: 'Tugas Anda adalah mengekstrak nama KECAMATAN dan KABUPATEN/KOTA tujuan pengiriman dari chat pelanggan WhatsApp. Jawab HANYA dengan nama kecamatan dan kabupaten/kota tersebut (Contoh: "Blimbing, Malang" atau "Dawe, Kudus"). Jika tidak ada lokasi spesifik yang disebutkan, balas dengan kata "NONE".'
                      },
                      { role: 'user', content: processedInputText }
                    ],
                    max_tokens: 30,
                    temperature: 0.1
                  })
                });

                if (extractionRes.ok) {
                  const extractionData = await extractionRes.json() as any;
                  const locationText = (extractionData.choices?.[0]?.message?.content || '').trim();
                  if (locationText && locationText.toUpperCase() !== 'NONE') {
                    extractedLocation = locationText;
                  }
                }
              }

              if (extractedLocation) {
                const biteshipKey = process.env.BITESHIP_API_KEY;
                const searchAreaRes = await fetch(`https://api.biteship.com/v1/maps/areas?countries=ID&input=${encodeURIComponent(extractedLocation)}`, {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${biteshipKey}`,
                    'Content-Type': 'application/json'
                  }
                });

                if (searchAreaRes.ok) {
                  const searchAreaData = await searchAreaRes.json() as any;
                  const areas = searchAreaData.areas || [];
                  if (areas.length > 0) {
                    const destinationAreaId = areas[0].id;
                    const destinationAreaName = areas[0].name;

                    const ratesRes = await fetch('https://api.biteship.com/v1/rates/couriers', {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${biteshipKey}`,
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        origin_area_id: biteshipOriginAreaId,
                        destination_area_id: destinationAreaId,
                        items: [{ name: 'Paket Jualan', value: 50000, weight: 1000, quantity: 1 }]
                      })
                    });

                    if (ratesRes.ok) {
                      const ratesData = await ratesRes.json() as any;
                      const pricing = ratesData.pricing || [];
                      if (pricing.length > 0) {
                        biteshipRatesText = `\n\n[INFORMASI ONGKIR LIVE VIA BITESHIP]\nGudang Asal: ${biteshipOriginName || 'Gudang Utama'}\nKecamatan Tujuan: ${destinationAreaName}\nBerat Paket: 1 kg\n\nDaftar Tarif Kurir:`;
                        const popularCouriers = ['jne', 'jnt', 'sicepat', 'spx', 'tiki', 'pos'];
                        const added = new Set<string>();

                        for (const priceObj of pricing) {
                          const code = priceObj.company.toLowerCase();
                          if (popularCouriers.includes(code)) {
                            const name = priceObj.company.toUpperCase();
                            const service = priceObj.type;
                            const cost = priceObj.price;
                            const etd = priceObj.duration;
                            const keyStr = `${code}-${service}`;
                            if (!added.has(keyStr) && added.size < 5) {
                              biteshipRatesText += `\n- ${name} ${service.toUpperCase()}: Rp ${Number(cost).toLocaleString('id-ID')} (Estimasi ${etd})`;
                              added.add(keyStr);
                            }
                          }
                        }
                        biteshipRatesText += `\n\nCatatan: Beritahukan ongkir ini kepada pelanggan dengan sopan.`;
                      }
                    }
                  }
                }
              }
            } catch (biteshipErr) {
              console.error('[WA Webhook] Biteship rates lookup exception:', biteshipErr);
            }
          }

          const finalSystemInstruction = `${systemPrompt || ''}${biteshipRatesText}`;
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
            await pool.end();
            return new Response('No AI response', { status: 200 });
          }

          // Send message back via WAHA
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
            await pool.query(`
              INSERT INTO public.whatsapp_chat_logs (user_id, chat_id, customer_phone, customer_name, message, direction, replied_by, channel, created_at)
              VALUES ($1, $2, $3, $4, $5, 'outgoing', 'ai', $6, now())
            `, [userId, chatId, customerPhone, customerName, replyText, channelName]);
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
