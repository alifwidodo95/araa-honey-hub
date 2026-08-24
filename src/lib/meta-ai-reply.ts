import { getBiteshipShippingRates, ShippingDiscountConfig } from './biteship';

export interface MetaAiCommentContext {
  commentId: string;
  username: string;
  commentMessage: string;
  csWhatsappNumber: string;
  systemInstruction?: string;
  openaiApiKey: string;
  retailPricesText?: string;
  // Biteship settings
  biteshipEnabled?: boolean;
  biteshipApiKey?: string;
  biteshipOriginAreaId?: string;
  biteshipOriginName?: string;
  biteshipDefaultWeight?: number;
  discountConfig?: ShippingDiscountConfig;
}

/**
 * Generates an intelligent, high-converting AI reply for Meta Comments with dynamic Biteship shipping rates
 */
export async function generateAiCommentReply(ctx: MetaAiCommentContext): Promise<string> {
  const {
    username,
    commentMessage,
    csWhatsappNumber,
    systemInstruction = '',
    openaiApiKey,
    retailPricesText = '',
    biteshipEnabled = false,
    biteshipApiKey = '',
    biteshipOriginAreaId = '',
    biteshipOriginName = '',
    biteshipDefaultWeight = 1000,
    discountConfig = { discountType: 'fixed', discountValue: 10000, discountNote: 'Subsidi ongkir promo toko' }
  } = ctx;

  let shippingInfoPrompt = '';

  // 1. Detect if the user is asking about shipping / ongkir / delivery location
  const asksForShipping = /ongkir|ongkos|kirim|tarif|biaya\s*kirim|sampai\s*ke|ongkos\s*ke|bisa\s*ke/i.test(commentMessage);

  if (asksForShipping && biteshipEnabled && biteshipApiKey && biteshipOriginAreaId) {
    try {
      // Extract destination location using OpenAI
      const locRes = await fetch('https://api.openai.com/v1/chat/completions', {
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
              content: 'Tugasmu: Ekstrak HANYA nama KECAMATAN / KOTA / KABUPATEN tujuan pengiriman dari komentar ini. Jawab HANYA dengan nama lokasi tersebut (contoh: "Surabaya" atau "Kudus"). Jika tidak ada nama lokasi spesifik, balas "NONE".'
            },
            { role: 'user', content: commentMessage }
          ],
          max_tokens: 25,
          temperature: 0.1
        })
      });

      if (locRes.ok) {
        const locData = await locRes.json() as any;
        const locName = (locData.choices?.[0]?.message?.content || '').trim();

        if (locName && locName.toUpperCase() !== 'NONE') {
          console.log(`[Meta AI Reply] Extracted location for Biteship: "${locName}"`);
          const ratesResult = await getBiteshipShippingRates(
            biteshipOriginAreaId,
            locName,
            biteshipDefaultWeight,
            biteshipApiKey,
            discountConfig
          );

          if (ratesResult.success && ratesResult.cheapestRate) {
            const ch = ratesResult.cheapestRate;
            shippingInfoPrompt = `
[DATA ONGKIR BITESHIP REAL-TIME DARI GUDANG ${biteshipOriginName || 'UTAMA'}]
- Tujuan Terdeteksi: ${ratesResult.destinationAreaName}
- Kurir Termurah: ${ch.courierName} ${ch.courierService}
- Ongkir Asli Normal: Rp ${Number(ch.originalPrice).toLocaleString('id-ID')}
- Subsidi/Diskon Toko: Rp ${Number(ch.discountAmount).toLocaleString('id-ID')} (${discountConfig.discountNote || 'Promo Subsidi Ongkir'})
- ONGKIR SETELAH DISKON KONSUMEN: Rp ${Number(ch.discountedPrice).toLocaleString('id-ID')} (Estimasi ${ch.etd})

[INSTRUKSI KHUSUS ONGKIR]
Sampaikan estimasi ongkir normal dan ongkir setelah subsidi toko di atas kepada konsumen dengan ramah, dan ajak untuk order via WhatsApp CS agar mendapatkan subsidi ongkir tersebut.
`;
            console.log('[Meta AI Reply] Injected Biteship Rates info into prompt');
          }
        }
      }
    } catch (err) {
      console.warn('[Meta AI Reply] Failed to lookup Biteship rates:', err);
    }
  }

  const csCleanPhone = (csWhatsappNumber || '087837035470').replace(/[^0-9]/g, '');
  const waLink = `wa.me/${csCleanPhone}`;

  const fullSystemPrompt = `
Kamu adalah Asisten Customer Service AI ramah bernama Jarvis untuk toko Madu Araa (Araa Honey).
Tugasmu adalah menjawab komentar konsumen di Facebook Page atau Instagram dengan santun, singkat (maksimal 2-3 kalimat), dan solutif.

[KONTAK RESMI TOKO]
Nomor WhatsApp CS: ${csWhatsappNumber || '0878-3703-5470'} (Arahkan konsumen untuk klik link ${waLink} jika ingin memesan/konsultasi).

[DAFTAR HARGA RETAIL MADU ARAA HARI INI]
${retailPricesText || '- Madu Akasia 1KG: Rp 125.000'}

${shippingInfoPrompt}

[PANDUAN KHUSUS DARI OWNER]
${systemInstruction || 'Jawab dengan ramah, singkat, dan jelaskan bahwa madu Araa 100% murni bergaransi uang kembali.'}

[ATURAN PENTING]
1. Jangan berasumsi tentang harga reseller, hanya gunakan daftar harga di atas untuk eceran/retail.
2. Jika ada informasi ongkir di atas, sebutkan ongkir promo/diskonnya secara jelas dan menarik.
3. Jawab dengan singkat, padat, dan ramah dalam Bahasa Indonesia yang santun.
`;

  const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: fullSystemPrompt },
        { role: 'user', content: `Nama Pengirim: ${username}\nKomentar: "${commentMessage}"` }
      ],
      temperature: 0.7,
      max_tokens: 150
    })
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    throw new Error(`OpenAI API failed: ${errText}`);
  }

  const aiData = await aiRes.json() as any;
  const reply = aiData.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error('AI generated an empty reply text');
  }

  return reply;
}
