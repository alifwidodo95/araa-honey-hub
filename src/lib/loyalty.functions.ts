import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import pg from "pg";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres.saefgyiloalpiqfrglqo:Handayani01@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";

// 1. Server function to get loyalty analytics
export const getLoyaltyStats = createServerFn({ method: "GET" }).handler(async () => {
  let pool: pg.Pool | null = null;
  try {
    pool = new pg.Pool({
      connectionString: DB_URL,
      ssl: { rejectUnauthorized: false },
    });

    const query = `
      WITH cleaned_orders AS (
        SELECT 
          o.id,
          o.customer_name,
          REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g') as raw_phone,
          o.subtotal_gross,
          o.created_at,
          TO_CHAR(o.created_at, 'YYYY-MM') as order_month,
          COALESCE(
            (SELECT oi.honey_type FROM order_items oi WHERE oi.order_id = o.id LIMIT 1),
            'Madu Araa'
          ) as honey_type
        FROM orders o
        WHERE o.returned = false 
          AND o.customer_phone IS NOT NULL 
          AND TRIM(o.customer_phone) != ''
      ),
      normalized_orders AS (
        SELECT 
          id,
          customer_name,
          CASE 
            WHEN raw_phone LIKE '0%' THEN '62' || SUBSTRING(raw_phone FROM 2)
            WHEN raw_phone LIKE '8%' THEN '62' || raw_phone
            ELSE raw_phone
          END as phone,
          subtotal_gross,
          created_at,
          order_month,
          honey_type
        FROM cleaned_orders
        WHERE LENGTH(raw_phone) >= 9
      ),
      first_orders AS (
        SELECT phone, MIN(created_at) as first_date
        FROM normalized_orders
        GROUP BY phone
      ),
      customer_agg AS (
        SELECT 
          n.phone,
          MAX(n.customer_name) as name,
          COUNT(*)::int as order_count,
          SUM(n.subtotal_gross)::numeric as total_spent,
          MIN(n.created_at) as first_order_date,
          MAX(n.created_at) as last_order_date,
          EXTRACT(DAY FROM (NOW() - MAX(n.created_at)))::int as days_since_last_order,
          MODE() WITHIN GROUP (ORDER BY n.honey_type) as favorite_honey
        FROM normalized_orders n
        GROUP BY n.phone
      ),
      monthly_summary AS (
        SELECT 
          n.order_month as month,
          COUNT(*)::int as total_orders,
          COUNT(*) FILTER (WHERE TO_CHAR(f.first_date, 'YYYY-MM') = n.order_month)::int as new_orders,
          COUNT(*) FILTER (WHERE TO_CHAR(f.first_date, 'YYYY-MM') != n.order_month)::int as repeat_orders,
          COALESCE(SUM(n.subtotal_gross) FILTER (WHERE TO_CHAR(f.first_date, 'YYYY-MM') = n.order_month), 0)::numeric as new_omzet,
          COALESCE(SUM(n.subtotal_gross) FILTER (WHERE TO_CHAR(f.first_date, 'YYYY-MM') != n.order_month), 0)::numeric as repeat_omzet
        FROM normalized_orders n
        JOIN first_orders f ON n.phone = f.phone
        GROUP BY n.order_month
        ORDER BY n.order_month DESC
        LIMIT 6
      )
      SELECT 
        (SELECT json_agg(c) FROM customer_agg c) as all_customers,
        (SELECT json_agg(m) FROM monthly_summary m) as monthly_trends;
    `;

    const res = await pool.query(query);
    await pool.end();

    const allCustomers = res.rows[0]?.all_customers || [];
    const monthlyTrends = res.rows[0]?.monthly_trends || [];

    return {
      customers: allCustomers,
      trends: monthlyTrends,
    };
  } catch (error: any) {
    console.error("[getLoyaltyStats Error]:", error);
    if (pool) {
      try {
        await pool.end();
      } catch (e) {
        /* ignore */
      }
    }
    throw new Error(error.message || "Gagal memproses data loyalitas");
  }
});

// 2. Server function to get loyalty CRM message templates
export const getLoyaltyTemplates = createServerFn({ method: "GET" }).handler(async () => {
  let pool: pg.Pool | null = null;
  try {
    pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
    const res = await pool.query("SELECT value FROM app_settings WHERE key = 'loyalty_crm_templates'");
    await pool.end();

    const defaultTemplates = {
      vip: "Halo Kak {nama}, salam hangat dari Araa Honey! 🍯✨\n\nKami sangat berterima kasih atas kesetiaan Kakak yang sudah menjadi pelanggan prioritas kami ({total_order}x pemesanan).\n\nKami cek pesanan terakhir Kakak pada {tanggal_order} ({jeda_hari} hari lalu) untuk varian {madu_favorit}.\n\nKebetulan kami sedang ada stok panen segar terbaru. Khusus untuk Kakak ada penawaran spesial gratis ongkir ya Kak. Boleh kami bantu amankan pesanannya? Semoga sehat selalu sekeluarga! 😊",
      potential: "Halo Kak {nama}, semoga sehat selalu ya Kak! 🍯😊\n\nSekadar menyapa, bagaimana rasa {madu_favorit} yang dipesan pada {tanggal_order} ({jeda_hari} hari lalu) Kak? Semoga cocok dan bermanfaat untuk kesehatan keluarga ya.\n\nJika stok madunya di rumah sudah mulai menipis, Kakak bisa amankan pesanan kembali dengan promo spesial minggu ini ya Kak. Terima kasih banyak Kak!",
      at_risk: "Halo Kak {nama}, semoga sehat selalu sekeluarga ya! 🍯\n\nSudah lama tidak bersilaturahmi nih Kak sejak pesanan terakhir {madu_favorit} pada tanggal {tanggal_order} ({jeda_hari} hari lalu). Kami rindu menyapa Kakak pelanggan setia Araa Honey.\n\nKhusus minggu ini kami ada promo diskon spesial untuk pemesanan ulang. Boleh kami bantu amankan stoknya Kak? 😊",
      all_repeat: "Halo Kak {nama}, salam sehat dari Araa Honey! 🍯 Terima kasih sudah mempercayakan kebutuhan madu murni keluarga pada kami. Pesanan terakhir Kakak tercatat pada {tanggal_order} ({madu_favorit}). Jika stok di rumah mulai habis, kami siap kirimkan kembali ya Kak!",
    };

    if (res.rowCount === 0 || !res.rows[0].value) {
      return defaultTemplates;
    }

    return { ...defaultTemplates, ...res.rows[0].value };
  } catch (err: any) {
    if (pool) try { await pool.end(); } catch (e) {}
    console.error("[getLoyaltyTemplates Error]:", err);
    return {
      vip: "Halo Kak {nama}, terima kasih telah menjadi pelanggan setia Araa Honey! 🍯",
      potential: "Halo Kak {nama}, bagaimana kabar madu yang dipesan pada {tanggal_order}? 🍯",
      at_risk: "Halo Kak {nama}, rindu menyapa Kakak sejak pesanan {tanggal_order}! 🍯",
      all_repeat: "Halo Kak {nama}, salam hangat dari Araa Honey! 🍯",
    };
  }
});

// 3. Server function to save loyalty CRM templates
export const saveLoyaltyTemplates = createServerFn({ method: "POST" })
  .validator((data) =>
    z
      .object({
        vip: z.string(),
        potential: z.string(),
        at_risk: z.string(),
        all_repeat: z.string(),
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_at) 
         VALUES ('loyalty_crm_templates', $1, now()) 
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()`,
        [JSON.stringify(data)]
      );
      await pool.end();
      return { ok: true };
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      console.error("[saveLoyaltyTemplates Error]:", err);
      throw new Error(err.message || "Gagal menyimpan template pesan");
    }
  });

// 4. Server function to send 1-click WhatsApp message directly via WAHA Gateway
export const sendDirectLoyaltyWhatsApp = createServerFn({ method: "POST" })
  .validator((data) =>
    z
      .object({
        phone: z.string(),
        customerName: z.string(),
        message: z.string(),
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

      // Fetch WAHA configuration from app_settings
      let wahaUrl = "https://waha.araahoney.my.id";
      let sessionName = "default";
      let apiKey = "araahoney123";

      const wahaRes = await pool.query("SELECT value FROM app_settings WHERE key = 'waha_config'");
      if (wahaRes.rowCount && wahaRes.rows[0].value) {
        const val = wahaRes.rows[0].value;
        if (val.url) wahaUrl = val.url.replace(/\/$/, "");
        if (val.session) sessionName = val.session;
        if (val.apiKey) apiKey = val.apiKey;
      }
      await pool.end();

      // Normalize phone number
      let rawPhone = data.phone.replace(/[^0-9]/g, "");
      if (rawPhone.startsWith("0")) rawPhone = "62" + rawPhone.slice(1);
      else if (rawPhone.startsWith("8")) rawPhone = "62" + rawPhone;
      if (rawPhone.length < 9) {
        throw new Error("Nomor WhatsApp tidak valid (terlalu pendek)");
      }

      const chatId = `${rawPhone}@c.us`;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey) {
        headers["x-api-key"] = apiKey;
      }

      console.log(`[Direct WAHA Send] Sending message to ${chatId} via ${wahaUrl}...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      // Call WAHA sendText
      let response = await fetch(`${wahaUrl}/api/sendText`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          session: sessionName,
          chatId,
          text: data.message,
        }),
        signal: controller.signal,
      }).catch((e) => {
        console.warn("[WAHA Primary Endpoint failed, trying /api/messages/sendText]:", e);
        return null;
      });

      if (!response || !response.ok) {
        // Fallback endpoint
        response = await fetch(`${wahaUrl}/api/messages/sendText`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            session: sessionName,
            chatId,
            text: data.message,
          }),
        });
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        throw new Error(`WAHA Gateway error (${response.status}): ${errBody.substring(0, 150)}`);
      }

      return { ok: true, recipient: chatId };
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      console.error("[sendDirectLoyaltyWhatsApp Error]:", err);
      throw new Error(err.message || "Gagal mengirim pesan WhatsApp via WAHA");
    }
  });
