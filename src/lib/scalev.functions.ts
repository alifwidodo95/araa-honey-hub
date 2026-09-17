import { createServerFn } from "@tanstack/react-start";
import pg from "pg";
import { sendWhatsAppMessage } from "@/lib/whatsapp-service";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres.saefgyiloalpiqfrglqo:Handayani01@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";

// Normalize phone number helper
export function normalizePhone(raw: string): string {
  let clean = String(raw || "").replace(/[^0-9]/g, "");
  if (clean.startsWith("0")) {
    clean = "62" + clean.slice(1);
  } else if (clean.startsWith("8")) {
    clean = "62" + clean;
  }
  return clean;
}

function getPhoneVariants(phone: string): string[] {
  const norm = normalizePhone(phone);
  const zero = norm.startsWith("62") ? "0" + norm.slice(2) : norm;
  return Array.from(new Set([norm, zero, phone]));
}

function formatWibFilterStart(dateStr: string): string {
  const clean = dateStr.trim();
  if (clean.includes("T") || clean.includes("+")) return clean;
  return `${clean} 00:00:00+07`;
}

function formatWibFilterEnd(dateStr: string): string {
  const clean = dateStr.trim();
  if (clean.includes("T") || clean.includes("+")) return clean;
  return `${clean} 23:59:59.999+07`;
}

// 1. Get Scalev Lead Metrics & Closing Rate
export const getScalevMetrics = createServerFn({ method: "GET" })
  .validator((data?: { startDate?: string; endDate?: string }) => data || {})
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

      let whereClause = "WHERE 1=1";
      const params: any[] = [];

      if (data.startDate) {
        params.push(formatWibFilterStart(data.startDate));
        whereClause += ` AND created_at >= $${params.length}`;
      }
      if (data.endDate) {
        params.push(formatWibFilterEnd(data.endDate));
        whereClause += ` AND created_at <= $${params.length}`;
      }

      const query = `
        SELECT 
          COUNT(*)::int AS total_leads,
          COUNT(*) FILTER (WHERE is_closed = true)::int AS closed_count,
          COUNT(*) FILTER (WHERE is_closed = false)::int AS unclosed_count,
          COUNT(*) FILTER (WHERE followed_up_at IS NOT NULL)::int AS followed_up_count,
          COALESCE(SUM(gross_revenue), 0)::numeric AS total_revenue,
          COALESCE(SUM(gross_revenue) FILTER (WHERE is_closed = true), 0)::numeric AS closed_revenue,
          COALESCE(SUM(gross_revenue) FILTER (WHERE is_closed = false), 0)::numeric AS unclosed_revenue
        FROM scalev_leads
        ${whereClause}
      `;

      const res = await pool.query(query, params);
      const row = res.rows[0] || {};

      const totalLeads = Number(row.total_leads || 0);
      const closedCount = Number(row.closed_count || 0);
      const unclosedCount = Number(row.unclosed_count || 0);
      const followedUpCount = Number(row.followed_up_count || 0);
      const closedRevenue = Number(row.closed_revenue || 0);
      const unclosedRevenue = Number(row.unclosed_revenue || 0);
      const totalRevenue = Number(row.total_revenue || 0);

      const closingRate = totalLeads > 0 ? Number(((closedCount / totalLeads) * 100).toFixed(1)) : 0;

      await pool.end();
      return {
        totalLeads,
        closedCount,
        unclosedCount,
        followedUpCount,
        closingRate,
        closedRevenue,
        unclosedRevenue,
        totalRevenue,
      };
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      console.error("[getScalevMetrics Error]:", err);
      throw new Error(err.message || "Gagal memuat metrik Scalev");
    }
  });

// 2. Get List of Scalev Leads with Search & Filters
export const getScalevLeads = createServerFn({ method: "GET" })
  .validator((data?: {
    status?: "all" | "unclosed" | "closed";
    search?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) => data || {})
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

      let whereClauses = ["1=1"];
      const params: any[] = [];

      if (data.status === "closed") {
        whereClauses.push("is_closed = true");
      } else if (data.status === "unclosed") {
        whereClauses.push("is_closed = false");
      }

      if (data.startDate) {
        params.push(formatWibFilterStart(data.startDate));
        whereClauses.push(`created_at >= $${params.length}`);
      }

      if (data.endDate) {
        params.push(formatWibFilterEnd(data.endDate));
        whereClauses.push(`created_at <= $${params.length}`);
      }

      if (data.search && data.search.trim()) {
        params.push(`%${data.search.trim().toLowerCase()}%`);
        whereClauses.push(`(
          LOWER(customer_name) LIKE $${params.length} OR 
          customer_phone LIKE $${params.length} OR 
          LOWER(scalev_order_id) LIKE $${params.length} OR 
          LOWER(product_name) LIKE $${params.length}
        )`);
      }

      const whereStr = whereClauses.join(" AND ");
      const limit = data.limit || 50;
      const offset = data.offset || 0;

      params.push(limit);
      const limitParamIdx = params.length;

      params.push(offset);
      const offsetParamIdx = params.length;

      const leadsQuery = `
        SELECT 
          id, scalev_order_id, customer_name, customer_phone, customer_raw_phone,
          product_name, gross_revenue, scalev_status, payment_status, store_name,
          is_closed, matched_order_id, closed_at, followed_up_at, follow_up_count,
          follow_up_session, created_at, updated_at
        FROM scalev_leads
        WHERE ${whereStr}
        ORDER BY created_at DESC
        LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
      `;

      const res = await pool.query(leadsQuery, params);

      // Get total count for pagination
      const countParams = params.slice(0, params.length - 2);
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS total FROM scalev_leads WHERE ${whereStr}`,
        countParams
      );
      const totalCount = countRes.rows[0]?.total || 0;

      await pool.end();
      return {
        leads: res.rows || [],
        total: totalCount,
      };
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      console.error("[getScalevLeads Error]:", err);
      throw new Error(err.message || "Gagal memuat daftar lead Scalev");
    }
  });

// 3. Auto-Match Unclosed Leads with Orders Table
export const runAutoMatchScalev = createServerFn({ method: "POST" }).handler(async () => {
  let pool: pg.Pool | null = null;
  try {
    pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

    // Find all unclosed leads
    const unclosedRes = await pool.query(
      `SELECT id, customer_phone, created_at FROM scalev_leads WHERE is_closed = false`
    );
    const unclosedLeads = unclosedRes.rows || [];

    if (unclosedLeads.length === 0) {
      await pool.end();
      return { newlyClosedCount: 0, totalChecked: 0 };
    }

    let newlyClosedCount = 0;

    for (const lead of unclosedLeads) {
      const variants = getPhoneVariants(lead.customer_phone);
      const match = await pool.query(
        `SELECT id, created_at FROM orders 
         WHERE customer_phone = ANY($1) 
           AND created_at >= ($2::timestamptz - INTERVAL '30 minutes')
         ORDER BY created_at DESC LIMIT 1`,
        [variants, lead.created_at]
      );

      if (match.rowCount && match.rowCount > 0) {
        const order = match.rows[0];
        await pool.query(
          `UPDATE scalev_leads 
           SET is_closed = true, 
               matched_order_id = $1, 
               closed_at = $2, 
               updated_at = now() 
           WHERE id = $3`,
          [order.id, order.created_at, lead.id]
        );
        newlyClosedCount++;
      }
    }

    await pool.end();
    return { newlyClosedCount, totalChecked: unclosedLeads.length };
  } catch (err: any) {
    if (pool) try { await pool.end(); } catch (e) {}
    console.error("[runAutoMatchScalev Error]:", err);
    throw new Error(err.message || "Gagal menjalankan pencocokan otomatis");
  }
});

// 4. Manual Sync Orders from Scalev API v3 using API Key
export const syncScalevHistory = createServerFn({ method: "POST" })
  .validator((data?: { maxOrders?: number }) => data || {})
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

      const cfgRes = await pool.query("SELECT value FROM app_settings WHERE key = 'scalev_config'");
      const cfg = cfgRes.rows[0]?.value || {};
      const apiKey = cfg.apiKey || "sk_FfryIIwpcKb06crEkQEyjiC3jppr3pEySHs3QoBvvdjfPxZ7kXm9qa22sBfvX8RK";

      if (!apiKey) {
        throw new Error("API Key Scalev belum dikonfigurasi.");
      }

      const limitTarget = data.maxOrders || 100;
      let nextCursor: string | null = null;
      let totalSynced = 0;
      let newlyInserted = 0;
      let newlyClosed = 0;

      while (totalSynced < limitTarget) {
        const url: string = nextCursor
          ? `https://api.scalev.com/v3/orders?page_size=25&cursor=${nextCursor}`
          : `https://api.scalev.com/v3/orders?page_size=25`;

        const apiRes = await fetch(url, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        });

        if (!apiRes.ok) {
          const errText = await apiRes.text().catch(() => "");
          throw new Error(`Scalev API Error (${apiRes.status}): ${errText.substring(0, 100)}`);
        }

        const json = await apiRes.json();
        const orders = Array.isArray(json.data) ? json.data : [];

        if (orders.length === 0) break;

        for (const order of orders) {
          const scalevOrderId = String(order.order_id || order.id || "").trim();
          if (!scalevOrderId) continue;

          const rawPhone = String(order.customer?.phone || order.destination_address?.phone || "");
          const customerPhone = normalizePhone(rawPhone);
          if (!customerPhone) continue;

          const customerName = String(order.customer?.name || order.destination_address?.name || "Pelanggan Scalev").trim();

          let productName = "Madu Araa";
          if (Array.isArray(order.orderlines) && order.orderlines.length > 0) {
            productName = order.orderlines.map((ol: any) => ol.product_name || ol.variant_name).filter(Boolean).join(", ") || productName;
          } else if (order.final_variants && typeof order.final_variants === "object") {
            productName = Object.keys(order.final_variants).join(", ") || productName;
          }

          const grossRevenue = parseFloat(String(order.gross_revenue || order.net_revenue || order.product_price || 0)) || 0;
          const scalevStatus = String(order.status || "draft").toLowerCase();
          const paymentStatus = String(order.payment_status || "unpaid").toLowerCase();
          const storeName = String(order.store?.name || "ALEEKA STORE");
          const createdAtStr = order.created_at || order.draft_time || new Date().toISOString();

          // Check if order already in orders table (must be created AFTER or at the time lead arrived)
          const variants = getPhoneVariants(customerPhone);
          const matchRes = await pool.query(
            `SELECT id, created_at FROM orders 
             WHERE customer_phone = ANY($1) 
               AND created_at >= ($2::timestamptz - INTERVAL '30 minutes')
             ORDER BY created_at DESC LIMIT 1`,
            [variants, createdAtStr]
          );
          const isClosed = matchRes.rowCount ? matchRes.rowCount > 0 : false;
          const matchedOrderId = isClosed ? matchRes.rows[0].id : null;
          const closedAt = isClosed ? matchRes.rows[0].created_at : null;

          const insertRes = await pool.query(
            `INSERT INTO scalev_leads (
              scalev_order_id, customer_name, customer_phone, customer_raw_phone,
              product_name, gross_revenue, scalev_status, payment_status, store_name,
              is_closed, matched_order_id, closed_at, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
            ON CONFLICT (scalev_order_id) DO UPDATE SET
              scalev_status = EXCLUDED.scalev_status,
              payment_status = EXCLUDED.payment_status,
              gross_revenue = EXCLUDED.gross_revenue,
              is_closed = CASE WHEN scalev_leads.is_closed = true THEN true ELSE EXCLUDED.is_closed END,
              matched_order_id = COALESCE(scalev_leads.matched_order_id, EXCLUDED.matched_order_id),
              closed_at = COALESCE(scalev_leads.closed_at, EXCLUDED.closed_at),
              updated_at = now()
            RETURNING (xmax = 0) AS is_inserted`,
            [
              scalevOrderId,
              customerName,
              customerPhone,
              rawPhone,
              productName,
              grossRevenue,
              scalevStatus,
              paymentStatus,
              storeName,
              isClosed,
              matchedOrderId,
              closedAt,
              createdAtStr,
            ]
          );

          if (insertRes.rows[0]?.is_inserted) newlyInserted++;
          if (isClosed) newlyClosed++;
          totalSynced++;
        }

        if (!json.has_next || !json.next_cursor) break;
        nextCursor = json.next_cursor;
      }

      await pool.end();
      return { totalSynced, newlyInserted, newlyClosed };
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      console.error("[syncScalevHistory Error]:", err);
      throw new Error(err.message || "Gagal menyinkronkan data Scalev");
    }
  });

// 5. Send Personalized Follow-Up WhatsApp to Scalev Lead via Slot 2 (Admin Ayumi)
export const sendScalevFollowUpWhatsApp = createServerFn({ method: "POST" })
  .validator((data: {
    leadId: string;
    phone: string;
    customerName: string;
    productName?: string;
    customMessage?: string;
    senderSession?: string;
  }) => data)
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

      // Get WAHA config
      const wahaConfigRes = await pool.query("SELECT value FROM app_settings WHERE key = 'waha_config'");
      const wahaConfig = wahaConfigRes.rows[0]?.value || {};
      const { wahaUrl, apiKey, campaignSessionName } = wahaConfig;

      if (!wahaUrl) throw new Error("Konfigurasi server WAHA belum diatur.");

      // Preferred session: explicit senderSession -> campaignSessionName -> "campaign"
      const activeSession = data.senderSession || campaignSessionName || "campaign";
      const rawPhone = normalizePhone(data.phone);
      const chatId = `${rawPhone}@c.us`;

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["x-api-key"] = apiKey;

      // Compose message text
      let messageText = data.customMessage;
      if (!messageText) {
        const scalevCfgRes = await pool.query("SELECT value FROM app_settings WHERE key = 'scalev_config'");
        const scalevCfg = scalevCfgRes.rows[0]?.value || {};
        const template = scalevCfg.followUpTemplate || `Halo Kak {nama}, salam dari Araa Honey! 🍯

Kami melihat Kakak baru saja mengisi data pemesanan untuk {produk}. Apakah ada yang bisa kami bantu terkait pembayaran atau pengirimannya Kak? 😊`;

        messageText = template
          .replace(/{nama}/g, data.customerName || "Pelanggan")
          .replace(/{produk}/g, data.productName || "Madu Araa");
      }

      // 1. DISPATCH VIA WABA (Official Meta Cloud API - 100% Anti-Banned with Interactive Buttons)
      if (activeSession === "waba") {
        const wabaConfigRes = await pool.query("SELECT value FROM app_settings WHERE key = 'waba_config'");
        const wabaConfig = wabaConfigRes.rows[0]?.value || {};

        const res = await sendWhatsAppMessage({
          to: rawPhone,
          message: messageText,
          channel: "waba",
          buttons: [
            { id: "btn_pay_now", title: "✅ Mau Bayar Sekarang" },
            { id: "btn_cs_help", title: "💬 Tanya CS / Rekening" },
          ],
          footerText: "Araa Honey • Official Order",
          wabaConfig: {
            phoneNumberId: wabaConfig.phone_number_id || wabaConfig.phoneNumberId || "1289613457572802",
            permanentToken: wabaConfig.permanent_token || wabaConfig.permanentToken,
          },
        });

        if (!res.success) {
          console.error("[sendScalevFollowUpWhatsApp WABA Error]:", res.error);
          throw new Error(`Gagal mengirim via WABA Resmi Meta: ${res.error}`);
        }

        // Update lead follow up timestamp and count
        await pool.query(
          `UPDATE scalev_leads 
           SET followed_up_at = now(), 
               follow_up_count = follow_up_count + 1, 
               follow_up_session = 'waba', 
               updated_at = now() 
           WHERE id = $1`,
          [data.leadId]
        );

        // Record outgoing in whatsapp_chat_logs for Live Chat Monitor
        try {
          await pool.query(
            `INSERT INTO whatsapp_chat_logs (chat_id, customer_phone, customer_name, message, direction, channel, created_at)
             VALUES ($1, $2, $3, $4, 'outgoing', 'waba', now())`,
            [chatId, rawPhone, data.customerName, messageText]
          );
        } catch (e) {
          console.warn("Could not insert chat log:", e);
        }

        await pool.end();
        return { ok: true, recipient: chatId, channel: "waba", messageId: res.messageId, sentAt: new Date().toISOString() };
      }

      // 2. DISPATCH VIA WAHA (Slot 1 Default or Slot 2 Campaign)
      const payload = {
        session: activeSession,
        chatId,
        text: messageText,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      let response = await fetch(`${wahaUrl}/api/sendText`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).catch(() => null);

      if (!response || !response.ok) {
        response = await fetch(`${wahaUrl}/api/messages/sendText`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        }).catch(() => null);
      }

      clearTimeout(timeoutId);

      if (!response || !response.ok) {
        const errText = response ? await response.text().catch(() => "") : "Koneksi gateway terputus";
        throw new Error(`Gagal mengirim via WAHA: ${errText.substring(0, 100)}`);
      }

      // Update lead follow up timestamp and count
      await pool.query(
        `UPDATE scalev_leads 
         SET followed_up_at = now(), 
             follow_up_count = follow_up_count + 1, 
             follow_up_session = $1, 
             updated_at = now() 
         WHERE id = $2`,
        [activeSession, data.leadId]
      );

      // Record outgoing in whatsapp_chat_logs for Live Chat Monitor
      try {
        await pool.query(
          `INSERT INTO whatsapp_chat_logs (chat_id, customer_phone, customer_name, message, direction, channel, created_at)
           VALUES ($1, $2, $3, $4, 'outgoing', $5, now())`,
          [chatId, rawPhone, data.customerName, messageText, activeSession === "default" ? "waha_main" : "waha_campaign"]
        );
      } catch (e) {
        console.warn("Could not insert chat log:", e);
      }

      await pool.end();
      return { ok: true, recipient: chatId, channel: activeSession === "default" ? "waha_main" : "waha_campaign", sentAt: new Date().toISOString() };
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      console.error("[sendScalevFollowUpWhatsApp Error]:", err);
      throw new Error(err.message || "Gagal mengirim pesan follow-up");
    }
  });

// 6. Get & Save Scalev Config
export const getScalevConfig = createServerFn({ method: "GET" }).handler(async () => {
  let pool: pg.Pool | null = null;
  try {
    pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
    const res = await pool.query("SELECT value FROM app_settings WHERE key = 'scalev_config'");
    await pool.end();
    return res.rows[0]?.value || {
      apiKey: "",
      clientId: "",
      signingSecret: "",
      followUpTemplate: "",
      senderSession: "campaign",
    };
  } catch (err: any) {
    if (pool) try { await pool.end(); } catch (e) {}
    return {
      apiKey: "",
      clientId: "",
      signingSecret: "",
      followUpTemplate: "",
      senderSession: "campaign",
    };
  }
});

export const saveScalevConfig = createServerFn({ method: "POST" })
  .validator((data: {
    apiKey?: string;
    clientId?: string;
    signingSecret?: string;
    followUpTemplate?: string;
    senderSession?: string;
  }) => data)
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('scalev_config', $1, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify(data)]
      );
      await pool.end();
      return { ok: true };
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      throw new Error(err.message || "Gagal menyimpan konfigurasi Scalev");
    }
  });

// 7. Manual Toggle Closing for a Lead (With optional Order linking)
export const manualToggleScalevClosing = createServerFn({ method: "POST" })
  .validator((data: {
    leadId: string;
    isClosed: boolean;
    orderId?: string | null;
  }) => data)
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

      if (data.isClosed) {
        let closedAt = new Date().toISOString();
        let matchedOrderId = data.orderId || null;

        if (matchedOrderId) {
          const orderRes = await pool.query(
            "SELECT id, created_at, subtotal_gross FROM orders WHERE id = $1",
            [matchedOrderId]
          );
          if (orderRes.rowCount && orderRes.rowCount > 0) {
            closedAt = orderRes.rows[0].created_at;
          }
        }

        await pool.query(
          `UPDATE scalev_leads 
           SET is_closed = true, 
               matched_order_id = $1, 
               closed_at = $2, 
               updated_at = now() 
           WHERE id = $3`,
          [matchedOrderId, closedAt, data.leadId]
        );
      } else {
        await pool.query(
          `UPDATE scalev_leads 
           SET is_closed = false, 
               matched_order_id = null, 
               closed_at = null, 
               updated_at = now() 
           WHERE id = $1`,
          [data.leadId]
        );
      }

      await pool.end();
      return { ok: true };
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      console.error("[manualToggleScalevClosing Error]:", err);
      throw new Error(err.message || "Gagal memperbarui status closing lead");
    }
  });

// 8. Search Orders in Penjualan to Link with a Lead
export const searchOrdersForLinking = createServerFn({ method: "GET" })
  .validator((data?: { query?: string }) => data || {})
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

      const q = (data?.query || "").trim();
      let querySql: string;
      let params: any[] = [];

      if (q) {
        params.push(`%${q.toLowerCase()}%`);
        querySql = `
          SELECT id, customer_name, customer_phone, tracking_number, subtotal_gross, created_at
          FROM orders
          WHERE LOWER(customer_name) LIKE $1 
             OR customer_phone LIKE $1 
             OR LOWER(COALESCE(tracking_number, '')) LIKE $1
          ORDER BY created_at DESC
          LIMIT 15
        `;
      } else {
        querySql = `
          SELECT id, customer_name, customer_phone, tracking_number, subtotal_gross, created_at
          FROM orders
          ORDER BY created_at DESC
          LIMIT 15
        `;
      }

      const res = await pool.query(querySql, params);
      await pool.end();
      return res.rows || [];
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      console.error("[searchOrdersForLinking Error]:", err);
      return [];
    }
  });

