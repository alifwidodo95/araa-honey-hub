/**
 * Hermes FU Intent Classifier
 * Fase 1: Autonomous Follow-Up Loop Agent
 *
 * Mengklasifikasikan intent reply customer WhatsApp terhadap pesan follow-up Scalev leads.
 * Intent yang terdeteksi:
 *   - 'interested'   → Pelanggan menyatakan minat / ingin lanjut
 *   - 'price_ask'    → Pelanggan tanya harga / rekening / cara bayar
 *   - 'paid'         → Pelanggan klaim sudah transfer / bayar
 *   - 'cancel'       → Pelanggan tidak jadi beli / batalkan
 *   - 'reschedule'   → Pelanggan minta tunda / akan beli nanti
 *   - 'question'     → Pelanggan tanya soal produk (bukan harga)
 *   - 'neutral'      → Tidak dapat diklasifikasi / sapaan biasa
 */

import pg from 'pg';
import { sendWhatsAppMessage } from '@/lib/whatsapp-service';

const DB_URL =
  process.env.DATABASE_URL ||
  'postgres://postgres.saefgyiloalpiqfrglqo:Handayani01@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres';

export type FUIntent =
  | 'interested'
  | 'price_ask'
  | 'paid'
  | 'cancel'
  | 'reschedule'
  | 'question'
  | 'neutral';

export interface FUClassifyResult {
  intent: FUIntent;
  confidence: 'high' | 'medium' | 'low';
  rawResponse?: string;
}

/**
 * Rule-based fast classifier (no LLM cost, handles 80% of cases)
 */
export function classifyIntentRuleBased(message: string): FUClassifyResult | null {
  const m = message.toLowerCase().trim();

  // --- CANCEL signals ---
  const cancelKeywords = [
    'tidak jadi', 'gak jadi', 'ga jadi', 'batal', 'cancel', 'tidak minat',
    'gak minat', 'ga minat', 'tidak tertarik', 'gak tertarik', 'sudah ada',
    'tidak perlu', 'gak perlu', 'no thanks', 'tidak mau', 'gak mau',
    'skip', 'tidak butuh', 'ga butuh', 'hapus', 'unsubscribe', 'stop',
    'tidak usah', 'jangan', 'lewat dulu', 'belum bisa', 'tobat', 'salah kirim'
  ];
  if (cancelKeywords.some(k => m.includes(k))) {
    return { intent: 'cancel', confidence: 'high' };
  }

  // --- PAID signals ---
  const paidKeywords = [
    'sudah transfer', 'udah transfer', 'sdh transfer', 'sudah bayar',
    'udah bayar', 'sdh bayar', 'bukti transfer', 'bukti bayar', 'tf sudah',
    'sudah tf', 'sudah kirim uang', 'udah kirim uang', 'sudah dp', 'sudah lunas',
    'pembayaran sudah', 'sudah konfirmasi', 'ini buktinya', 'ini tfnya',
    'ini trf', 'tolong cek', 'cek ya', 'sudah saya bayar', 'barusan transfer'
  ];
  if (paidKeywords.some(k => m.includes(k))) {
    return { intent: 'paid', confidence: 'high' };
  }

  // --- PRICE ASK signals ---
  const priceAskKeywords = [
    'harganya berapa', 'berapa harga', 'berapa harganya', 'berapa harga',
    'nomor rekening', 'no rek', 'rekening', 'cara bayar', 'bayar gimana',
    'transfer ke mana', 'transfer kemana', 'transfer ke apa', 'bayar ke mana',
    'no rekening', 'nomor rek', 'rek nya', 'reknya', 'mandiri', 'bca', 'bri',
    'bni', 'gopay', 'ovo', 'dana', 'qris', 'bayar lewat apa', 'bisa cod',
    'berapa total', 'total berapa', 'ongkirnya', 'ongkir berapa', 'biaya kirim'
  ];
  if (priceAskKeywords.some(k => m.includes(k))) {
    return { intent: 'price_ask', confidence: 'high' };
  }

  // --- RESCHEDULE signals ---
  const rescheduleKeywords = [
    'nanti aja', 'nanti dulu', 'minggu depan', 'bulan depan', 'belum ada uang',
    'tunggu gajian', 'gajian dulu', 'gajian tanggal', 'nanti ya', 'nanti saja',
    'wait dulu', 'hold dulu', 'tunda dulu', 'minta waktu', 'besok aja',
    'lusa', 'sebentar lagi', 'masih mikir', 'lagi pikir', 'pertimbangkan dulu'
  ];
  if (rescheduleKeywords.some(k => m.includes(k))) {
    return { intent: 'reschedule', confidence: 'high' };
  }

  // --- INTERESTED signals ---
  const interestedKeywords = [
    'mau pesan', 'mau beli', 'mau order', 'saya mau', 'iya mau', 'ya mau',
    'oke mau', 'ok mau', 'lanjut', 'jadi', 'deal', 'setuju', 'siap',
    'konfirmasi', 'iya kak', 'oke kak', 'ok kak', 'lanjutkan', 'proses',
    'kirim aja', 'kirimkan', 'tolong proses', 'tolong kirim', 'oke lanjut',
    'minat', 'tertarik', 'bisa', 'ayo', 'yuk', 'siap kak', 'oke siap',
    'mau dong', 'mau nih', 'boleh', 'boleh dong', '✅', '👍'
  ];
  if (interestedKeywords.some(k => m.includes(k))) {
    return { intent: 'interested', confidence: 'high' };
  }

  // --- PRODUCT QUESTION signals ---
  const questionKeywords = [
    'manfaat', 'khasiat', 'untuk apa', 'bisa untuk', 'cocok untuk',
    'kandungan', 'expired', 'kadaluarsa', 'halal', 'bpom', 'sertifikat',
    'aman', 'testimoni', 'review', 'rasa', 'warna', 'ukuran', 'varian',
    'beda', 'bedanya', 'perbedaan', 'mana yang bagus', 'rekomendasi',
    'penjelasan', 'jelaskan', 'informasi', 'info produk'
  ];
  if (questionKeywords.some(k => m.includes(k))) {
    return { intent: 'question', confidence: 'medium' };
  }

  return null; // Tidak dapat diklasifikasi dengan rules → perlu LLM
}

/**
 * LLM-based classifier (fallback for ambiguous messages)
 * Menggunakan DeepSeek / OpenAI sebagai fallback
 */
export async function classifyIntentWithLLM(
  message: string,
  customerName: string,
  apiKey: string,
  provider: 'deepseek' | 'openai' = 'deepseek'
): Promise<FUClassifyResult> {
  const systemPrompt = `Kamu adalah classifier intent untuk sistem CRM Araa Honey. 
Tugas kamu adalah mengklasifikasikan INTENT dari pesan pelanggan WhatsApp.

Pilihan intent yang tersedia:
- interested: Pelanggan menyatakan minat, mau beli, konfirmasi, setuju
- price_ask: Pelanggan tanya harga, rekening bank, cara bayar
- paid: Pelanggan klaim sudah transfer/bayar, kirim bukti transfer
- cancel: Pelanggan tidak jadi beli, batalkan, tidak minat
- reschedule: Pelanggan minta tunda, belum ada uang, nanti dulu
- question: Pelanggan tanya soal produk (bukan harga)
- neutral: Pesan biasa, sapaan, atau tidak jelas maksudnya

HANYA jawab dengan format JSON: {"intent": "<pilihan>", "confidence": "high"|"medium"|"low"}`;

  const userMessage = `Pesan dari pelanggan bernama ${customerName}:\n"${message}"\n\nKlasifikasikan intent pesan ini.`;

  try {
    const url = provider === 'deepseek'
      ? 'https://api.deepseek.com/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
    const model = provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini';

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        max_tokens: 60,
      }),
    });

    if (!res.ok) throw new Error(`LLM API error: ${res.status}`);
    const data = await res.json() as any;
    const raw = data.choices?.[0]?.message?.content?.trim() || '';

    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return {
      intent: (parsed.intent as FUIntent) || 'neutral',
      confidence: parsed.confidence || 'low',
      rawResponse: raw,
    };
  } catch (err) {
    console.error('[FU Classifier LLM Error]:', err);
    return { intent: 'neutral', confidence: 'low' };
  }
}

/**
 * Main classifier: rule-based first, LLM fallback
 */
export async function classifyFUReply(
  message: string,
  customerName: string,
  apiKey?: string,
  apiProvider: 'deepseek' | 'openai' = 'deepseek'
): Promise<FUClassifyResult> {
  // Step 1: Fast rule-based check
  const ruleResult = classifyIntentRuleBased(message);
  if (ruleResult && ruleResult.confidence === 'high') {
    return ruleResult;
  }

  // Step 2: LLM fallback if API key available
  if (apiKey) {
    return await classifyIntentWithLLM(message, customerName, apiKey, apiProvider);
  }

  return ruleResult || { intent: 'neutral', confidence: 'low' };
}

/**
 * Generate auto-reply text based on classified intent
 * Harga & rekening fetched from DB for price_ask intent
 */
export async function generateFUIntentReply(
  intent: FUIntent,
  customerName: string,
  productName: string,
  pool: pg.Pool
): Promise<string | null> {
  const name = customerName || 'Kakak';

  switch (intent) {
    case 'price_ask': {
      // Fetch rekening info from app_settings
      let rekeningInfo = '';
      try {
        const cfgRes = await pool.query(
          "SELECT value FROM app_settings WHERE key = 'payment_info' LIMIT 1"
        );
        const cfg = cfgRes.rows[0]?.value || {};
        if (cfg.bank_name && cfg.account_number) {
          rekeningInfo = `\n\n*Info Pembayaran:*\nBank: ${cfg.bank_name}\nNo. Rek: ${cfg.account_number}\nNama: ${cfg.account_name || 'Araa Honey'}\n\nSetelah transfer, mohon kirimkan buktinya ya Kak 🙏`;
        }
      } catch {}

      // Fetch harga produk dari product_sizes jika ada
      let hargaInfo = '';
      try {
        const hargaRes = await pool.query(
          `SELECT size_label, price_sell FROM product_sizes WHERE is_active = true ORDER BY price_sell ASC LIMIT 5`
        );
        if (hargaRes.rows.length > 0) {
          hargaInfo = '\n\n*Daftar Harga Madu Araa:*\n' +
            hargaRes.rows.map((r: any) => `• ${r.size_label}: Rp ${Number(r.price_sell).toLocaleString('id-ID')}`).join('\n');
        }
      } catch {}

      return `Halo Kak ${name}! Tentu kami bantu informasi harga dan cara pembayarannya ya 🍯${hargaInfo}${rekeningInfo || '\n\nUntuk info rekening, silakan hubungi CS kami ya Kak 😊'}`;
    }

    case 'paid':
      return `Terima kasih Kak ${name}! Bukti transfernya sudah kami terima 🙏\n\nCS kami akan segera memverifikasi pembayaran dan memproses pengiriman pesanan ${productName || 'Madu Araa'}-nya ya Kak. Mohon tunggu konfirmasi dari kami 📦✨`;

    case 'cancel':
      return `Baik Kak ${name}, kami mengerti 🙏\nTidak apa-apa, pesanan telah kami batalkan.\n\nKalau suatu saat Kakak berminat lagi dengan Madu Araa kami, jangan sungkan untuk menghubungi kami ya! Terima kasih sudah menghubungi kami 🍯🐝`;

    case 'reschedule':
      return `Baik Kak ${name}, tidak masalah 😊\nKami catat ya, Kakak akan menghubungi kami nanti.\n\nKami siap membantu kapanpun Kakak siap. Semoga segera bisa ya Kak! 🍯🙏`;

    case 'interested':
      return `Wah senang sekali Kak ${name}! 🎉\nSiap, pesanan ${productName || 'Madu Araa'} Kakak langsung kami proses.\n\nCS kami akan segera menghubungi Kakak untuk konfirmasi detail pengiriman dan pembayarannya ya Kak 📦✨`;

    case 'question':
      // Tidak di-auto-reply, biarkan CS atau AI umum yang tangani
      return null;

    default:
      return null;
  }
}

/**
 * Process incoming reply from a Scalev lead customer
 * Main entry point called from webhook handler
 */
export async function processFUReply(opts: {
  customerPhone: string;
  customerName: string;
  message: string;
  channel: 'waba' | 'waha_main' | 'waha_campaign';
  pool: pg.Pool;
  deepseekApiKey?: string;
  openaiApiKey?: string;
  wabaConfig?: { phoneNumberId?: string; permanentToken?: string };
  wahaConfig?: { wahaUrl?: string; apiKey?: string; sessionName?: string };
}): Promise<{ handled: boolean; intent?: FUIntent; leadId?: string }> {
  const { customerPhone, customerName, message, channel, pool } = opts;

  // 1. Check if this phone belongs to an unclosed Scalev lead
  const leadRes = await pool.query(
    `SELECT id, customer_name, product_name, follow_up_step, fu1_at, fu2_at, fu3_at
     FROM scalev_leads
     WHERE (customer_phone = $1 OR regexp_replace(customer_phone, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g'))
       AND is_closed = false
       AND followed_up_at IS NOT NULL
     ORDER BY follow_up_step DESC, followed_up_at DESC
     LIMIT 1`,
    [customerPhone]
  );

  if (!leadRes.rowCount || leadRes.rowCount === 0) {
    return { handled: false }; // Bukan reply dari lead FU
  }

  const lead = leadRes.rows[0];

  // 2. Classify intent
  const apiKey = opts.deepseekApiKey || opts.openaiApiKey;
  const provider = opts.deepseekApiKey ? 'deepseek' : 'openai';
  const classified = await classifyFUReply(message, customerName, apiKey, provider);

  console.log(`[Hermes FU Loop] Lead ${lead.id} (${customerName}) replied: "${message}" → Intent: ${classified.intent} (${classified.confidence})`);

  // 3. Save reply to scalev_lead_replies table
  try {
    await pool.query(
      `INSERT INTO scalev_lead_replies 
       (lead_id, customer_phone, customer_name, message, intent, confidence, channel, replied_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT DO NOTHING`,
      [lead.id, customerPhone, customerName, message, classified.intent, classified.confidence, channel]
    );
  } catch (err) {
    console.error('[Hermes FU Loop] Failed to insert reply record:', err);
  }

  // 4. Handle based on intent
  if (classified.intent === 'cancel') {
    // Mark lead as explicitly won't buy
    await pool.query(
      `UPDATE scalev_leads 
       SET notes = COALESCE(notes || E'\\n', '') || $1, updated_at = now() 
       WHERE id = $2`,
      [`[Hermes FU] Customer replied CANCEL on ${new Date().toISOString()}. Message: "${message}"`, lead.id]
    );
    console.log(`[Hermes FU Loop] Lead ${lead.id} marked won't buy (cancel intent).`);
  }

  if (classified.intent === 'paid') {
    // Alert CS with notif in notes
    await pool.query(
      `UPDATE scalev_leads 
       SET notes = COALESCE(notes || E'\\n', '') || $1, updated_at = now() 
       WHERE id = $2`,
      [`[Hermes FU] ⚠️ CUSTOMER KLAIM SUDAH BAYAR! Cek bukti transfer. Pesan: "${message}" (${new Date().toISOString()})`, lead.id]
    );
    console.log(`[Hermes FU Loop] Lead ${lead.id} flagged as PAID - requires CS verification.`);
  }

  // 5. Generate and send auto-reply if intent warrants it
  const autoReplyText = await generateFUIntentReply(
    classified.intent,
    customerName,
    lead.product_name,
    pool
  );

  if (autoReplyText) {
    try {
      await sendWhatsAppMessage({
        to: customerPhone,
        message: autoReplyText,
        channel,
        wabaConfig: opts.wabaConfig,
        wahaConfig: opts.wahaConfig,
      });
      console.log(`[Hermes FU Loop] Auto-replied to ${customerPhone} with intent=${classified.intent}`);
    } catch (sendErr) {
      console.error('[Hermes FU Loop] Failed to send auto-reply:', sendErr);
    }
  }

  return {
    handled: true,
    intent: classified.intent,
    leadId: lead.id,
  };
}

/**
 * Get all unclosed leads that are ready for the next FU step
 * Used by cron job to trigger autonomous FU progression
 */
export async function getLeadsReadyForNextFU(pool: pg.Pool): Promise<Array<{
  id: string;
  customer_name: string;
  customer_phone: string;
  product_name: string;
  follow_up_step: number;
  fu1_at: string | null;
  fu2_at: string | null;
  fu3_at: string | null;
  followed_up_at: string | null;
  latest_reply_intent: string | null;
}>> {
  const res = await pool.query(`
    SELECT 
      sl.id,
      sl.customer_name,
      sl.customer_phone,
      sl.product_name,
      COALESCE(sl.follow_up_step, 0) as follow_up_step,
      sl.fu1_at,
      sl.fu2_at,
      sl.fu3_at,
      sl.followed_up_at,
      (
        SELECT slr.intent 
        FROM scalev_lead_replies slr 
        WHERE slr.lead_id = sl.id 
        ORDER BY slr.replied_at DESC 
        LIMIT 1
      ) as latest_reply_intent
    FROM scalev_leads sl
    WHERE sl.is_closed = false
      AND (sl.follow_up_step IS NULL OR sl.follow_up_step < 3)
      AND (
        -- Step 0 → 1: No FU yet, created > 1 hour ago
        (COALESCE(sl.follow_up_step, 0) = 0 AND sl.created_at < (now() - INTERVAL '1 hour'))
        OR
        -- Step 1 → 2: FU1 done, wait 24 hours, no cancel reply
        (sl.follow_up_step = 1 AND sl.fu1_at IS NOT NULL AND sl.fu1_at < (now() - INTERVAL '24 hours'))
        OR
        -- Step 2 → 3: FU2 done, wait 24 hours, no cancel reply
        (sl.follow_up_step = 2 AND sl.fu2_at IS NOT NULL AND sl.fu2_at < (now() - INTERVAL '24 hours'))
      )
    ORDER BY sl.created_at ASC
    LIMIT 100
  `);

  // Filter out leads with cancel or paid intents (these are done)
  return res.rows.filter((r: any) =>
    r.latest_reply_intent !== 'cancel' && r.latest_reply_intent !== 'paid'
  );
}
