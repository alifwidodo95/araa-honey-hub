import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import pg from "pg";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres.saefgyiloalpiqfrglqo:Handayani01@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";

// 1. Server function to get loyalty analytics (with synced CRM sent timestamps)
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
      sent_crm AS (
        SELECT 
          CASE 
            WHEN REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g') LIKE '0%' 
              THEN '62' || SUBSTRING(REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g') FROM 2)
            WHEN REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g') LIKE '8%' 
              THEN '62' || REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g')
            ELSE REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g')
          END as phone,
          MAX(sent_at) as last_crm_sent_at
        FROM crm_reminders
        WHERE status = 'sent' AND sent_at IS NOT NULL
        GROUP BY 1
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
          MODE() WITHIN GROUP (ORDER BY n.honey_type) as favorite_honey,
          MAX(s.last_crm_sent_at) as last_crm_sent_at
        FROM normalized_orders n
        LEFT JOIN sent_crm s ON n.phone = s.phone
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

// 2. Server function to get loyalty CRM message templates (including image URLs)
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
      vip_image_url: "",
      potential_image_url: "",
      at_risk_image_url: "",
      all_repeat_image_url: "",
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
      vip_image_url: "",
      potential_image_url: "",
      at_risk_image_url: "",
      all_repeat_image_url: "",
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
        vip_image_url: z.string().optional().default(""),
        potential_image_url: z.string().optional().default(""),
        at_risk_image_url: z.string().optional().default(""),
        all_repeat_image_url: z.string().optional().default(""),
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

// 4. Server function to send 1-click WhatsApp message (Text OR Image + Caption) directly via WAHA Gateway
export const sendDirectLoyaltyWhatsApp = createServerFn({ method: "POST" })
  .validator((data) =>
    z
      .object({
        phone: z.string(),
        customerName: z.string(),
        message: z.string(),
        favoriteHoney: z.string().optional(),
        imageUrl: z.string().optional().default(""),
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

      const hasImage = !!(data.imageUrl && data.imageUrl.trim().startsWith("http"));
      console.log(`[Direct WAHA Send] Sending ${hasImage ? "IMAGE + CAPTION" : "TEXT"} to ${chatId} via ${wahaUrl}...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      let response: Response | null = null;

      if (hasImage) {
        // Send Image with Caption
        const imagePayload = {
          session: sessionName,
          chatId,
          file: {
            url: data.imageUrl.trim(),
            mimetype: "image/jpeg",
            filename: "promo-madu-araa.jpg",
          },
          caption: data.message,
        };

        // Try /api/sendImage first
        response = await fetch(`${wahaUrl}/api/sendImage`, {
          method: "POST",
          headers,
          body: JSON.stringify(imagePayload),
          signal: controller.signal,
        }).catch((e) => {
          console.warn("[WAHA /api/sendImage failed, trying /api/sendFile]:", e);
          return null;
        });

        if (!response || !response.ok) {
          // Fallback to /api/sendFile
          response = await fetch(`${wahaUrl}/api/sendFile`, {
            method: "POST",
            headers,
            body: JSON.stringify(imagePayload),
            signal: controller.signal,
          }).catch(() => null);
        }

        if (!response || !response.ok) {
          // Fallback to /api/messages/sendFile
          response = await fetch(`${wahaUrl}/api/messages/sendFile`, {
            method: "POST",
            headers,
            body: JSON.stringify(imagePayload),
            signal: controller.signal,
          }).catch(() => null);
        }
      }

      // If no image or if image dispatch failed, send text message
      if (!response || !response.ok) {
        if (hasImage) {
          console.warn("[Image dispatch failed, falling back to text only message]");
        }

        const textPayload = {
          session: sessionName,
          chatId,
          text: data.message,
        };

        response = await fetch(`${wahaUrl}/api/sendText`, {
          method: "POST",
          headers,
          body: JSON.stringify(textPayload),
          signal: controller.signal,
        }).catch((e) => {
          console.warn("[WAHA Primary Endpoint failed, trying /api/messages/sendText]:", e);
          return null;
        });

        if (!response || !response.ok) {
          response = await fetch(`${wahaUrl}/api/messages/sendText`, {
            method: "POST",
            headers,
            body: JSON.stringify(textPayload),
          });
        }
      }

      clearTimeout(timeoutId);

      if (!response || !response.ok) {
        const errBody = response ? await response.text().catch(() => "") : "Koneksi gateway terputus";
        throw new Error(`WAHA Gateway error (${response?.status || 500}): ${errBody.substring(0, 150)}`);
      }

      // SINKRONISASI ANTI-DOUBLE-CHAT:
      // 1. Mark any pending cron reminders for this phone as 'sent'
      await pool.query(
        `UPDATE crm_reminders 
         SET status = 'sent', sent_at = now(), updated_at = now() 
         WHERE (
           customer_phone = $1 
           OR customer_phone = $2 
           OR REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g') = $1
         ) AND status = 'pending'`,
        [rawPhone, "0" + rawPhone.slice(2)]
      );

      // 2. Insert or update the sent history
      await pool.query(
        `INSERT INTO crm_reminders (customer_name, customer_phone, honey_type, scheduled_for, status, sent_at, created_at, updated_at)
         VALUES ($1, $2, $3, CURRENT_DATE, 'sent', now(), now(), now())`,
        [data.customerName, rawPhone, data.favoriteHoney || "Madu Araa"]
      );

      await pool.end();

      return { ok: true, recipient: chatId, sentAt: new Date().toISOString() };
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      console.error("[sendDirectLoyaltyWhatsApp Error]:", err);
      throw new Error(err.message || "Gagal mengirim pesan WhatsApp via WAHA");
    }
  });
