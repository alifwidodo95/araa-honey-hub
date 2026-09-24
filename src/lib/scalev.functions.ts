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

// Helper: Auto-delete older duplicate unclosed leads when a customer fills form multiple times within 7 days (Pilihan 3)
export async function cleanDuplicateScalevLeadsWithPool(pool: pg.Pool): Promise<number> {
  // Preserve notes or follow-up status to newer lead if exists
  try {
    await pool.query(`
      UPDATE scalev_leads sl_newer
      SET notes = COALESCE(sl_newer.notes, sl_older.notes),
          followed_up_at = COALESCE(sl_newer.followed_up_at, sl_older.followed_up_at),
          follow_up_step = COALESCE(sl_newer.follow_up_step, sl_older.follow_up_step),
          fu1_at = COALESCE(sl_newer.fu1_at, sl_older.fu1_at),
          fu2_at = COALESCE(sl_newer.fu2_at, sl_older.fu2_at),
          fu3_at = COALESCE(sl_newer.fu3_at, sl_older.fu3_at)
      FROM scalev_leads sl_older
      WHERE sl_older.id != sl_newer.id
        AND sl_older.is_closed = false
        AND LENGTH(regexp_replace(sl_older.customer_phone, '[^0-9]', '', 'g')) >= 8
        AND (
          sl_older.customer_phone = sl_newer.customer_phone
          OR regexp_replace(sl_older.customer_phone, '[^0-9]', '', 'g') = regexp_replace(sl_newer.customer_phone, '[^0-9]', '', 'g')
        )
        AND sl_newer.created_at > sl_older.created_at
        AND sl_older.created_at >= (sl_newer.created_at - INTERVAL '7 days')
        AND (sl_older.notes IS NOT NULL OR sl_older.followed_up_at IS NOT NULL);
    `);
  } catch (mergeErr) {
    console.error("[cleanDuplicateScalevLeads Preserve Notes Error]:", mergeErr);
  }

  const deleteSql = `
    DELETE FROM scalev_leads sl_older
    USING scalev_leads sl_newer
    WHERE sl_older.id != sl_newer.id
      AND sl_older.is_closed = false
      AND LENGTH(regexp_replace(sl_older.customer_phone, '[^0-9]', '', 'g')) >= 8
      AND (
        sl_older.customer_phone = sl_newer.customer_phone
        OR regexp_replace(sl_older.customer_phone, '[^0-9]', '', 'g') = regexp_replace(sl_newer.customer_phone, '[^0-9]', '', 'g')
      )
      AND sl_newer.created_at > sl_older.created_at
      AND sl_older.created_at >= (sl_newer.created_at - INTERVAL '7 days')
    RETURNING sl_older.id;
  `;
  const res = await pool.query(deleteSql);
  return res.rowCount || 0;
}

// Helper: Auto-match unclosed leads with orders (Nearest order within -2 hours to +30 days, anti-double claim)
export async function autoMatchScalevLeadsWithPool(pool: pg.Pool): Promise<number> {
  // Pre-clean older unclosed duplicate leads
  try {
    await cleanDuplicateScalevLeadsWithPool(pool);
  } catch (cleanErr) {
    console.error("[cleanDuplicateScalevLeads Pre-Match Error]:", cleanErr);
  }

  const matchSql = `
    WITH matched AS (
      SELECT DISTINCT ON (sl.id)
        sl.id AS lead_id,
        o.id AS order_id,
        o.created_at AS order_created_at
      FROM scalev_leads sl
      JOIN orders o ON (
        o.customer_phone IS NOT NULL AND length(regexp_replace(o.customer_phone, '[^0-9]', '', 'g')) >= 8 AND (
          regexp_replace(o.customer_phone, '[^0-9]', '', 'g') = sl.customer_phone 
          OR regexp_replace(o.customer_phone, '[^0-9]', '', 'g') = ('0' || SUBSTRING(sl.customer_phone FROM 3))
          OR ('62' || SUBSTRING(regexp_replace(o.customer_phone, '[^0-9]', '', 'g') FROM 2)) = sl.customer_phone
          OR ('62' || regexp_replace(o.customer_phone, '[^0-9]', '', 'g')) = sl.customer_phone
          OR regexp_replace(o.customer_phone, '[^0-9]', '', 'g') = regexp_replace(COALESCE(sl.customer_raw_phone, ''), '[^0-9]', '', 'g')
        )
        AND (o.returned IS NULL OR o.returned = false)
        AND o.created_at >= (sl.created_at - INTERVAL '2 hours')
        AND o.created_at <= (sl.created_at + INTERVAL '30 days')
      )
      WHERE (sl.is_closed = false OR sl.matched_order_id IS NULL)
        AND NOT EXISTS (
          SELECT 1 FROM scalev_leads other_sl
          WHERE other_sl.matched_order_id = o.id
            AND other_sl.id != sl.id
        )
      ORDER BY sl.id, o.created_at ASC
    )
    UPDATE scalev_leads
    SET is_closed = true,
        matched_order_id = matched.order_id,
        closed_at = matched.order_created_at,
        updated_at = now()
    FROM matched
    WHERE scalev_leads.id = matched.lead_id
    RETURNING scalev_leads.id
  `;
  const res = await pool.query(matchSql);

  // Post-clean duplicate leads that might remain for newly closed leads
  try {
    await cleanDuplicateScalevLeadsWithPool(pool);
  } catch (cleanErr) {
    console.error("[cleanDuplicateScalevLeads Post-Match Error]:", cleanErr);
  }

  return res.rowCount || 0;
}

// 1. Get Scalev Lead Metrics & Closing Rate
export const getScalevMetrics = createServerFn({ method: "GET" })
  .validator((data?: { startDate?: string; endDate?: string }) => data || {})
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

      // Run auto-match silently for any pending unclosed leads
      try {
        await autoMatchScalevLeadsWithPool(pool);
      } catch (autoErr) {
        console.error("[autoMatch in getScalevMetrics Error]:", autoErr);
      }

      let whereClause = "WHERE 1=1";
      const params: any[] = [];

      if (data.startDate) {
        params.push(formatWibFilterStart(data.startDate));
        whereClause += ` AND sl.created_at >= $${params.length}`;
      }
      if (data.endDate) {
        params.push(formatWibFilterEnd(data.endDate));
        whereClause += ` AND sl.created_at <= $${params.length}`;
      }

      const query = `
        SELECT 
          COUNT(*)::int AS total_leads,
          COUNT(*) FILTER (WHERE sl.is_closed = true)::int AS closed_count,
          COUNT(*) FILTER (WHERE sl.is_closed = false)::int AS unclosed_count,
          COUNT(*) FILTER (WHERE sl.followed_up_at IS NOT NULL)::int AS followed_up_count,
          COALESCE(SUM(
            CASE 
              WHEN sl.is_closed = true AND (o.returned IS NULL OR o.returned = false) THEN COALESCE(o.net_revenue, o.amount_received, o.subtotal_gross, sl.gross_revenue, 0)
              WHEN sl.is_closed = true AND o.returned = true THEN 0
              ELSE COALESCE(sl.gross_revenue, 0)
            END
          ), 0)::numeric AS total_revenue,
          COALESCE(SUM(
            CASE
              WHEN (o.returned IS NULL OR o.returned = false) THEN COALESCE(o.net_revenue, o.amount_received, o.subtotal_gross, sl.gross_revenue, 0)
              ELSE 0
            END
          ) FILTER (WHERE sl.is_closed = true), 0)::numeric AS closed_revenue,
          COALESCE(SUM(sl.gross_revenue) FILTER (WHERE sl.is_closed = false), 0)::numeric AS unclosed_revenue
        FROM scalev_leads sl
        LEFT JOIN orders o ON sl.matched_order_id = o.id
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
        whereClauses.push("sl.is_closed = true");
      } else if (data.status === "unclosed") {
        whereClauses.push("sl.is_closed = false");
      }

      if (data.startDate) {
        params.push(formatWibFilterStart(data.startDate));
        whereClauses.push(`sl.created_at >= $${params.length}`);
      }

      if (data.endDate) {
        params.push(formatWibFilterEnd(data.endDate));
        whereClauses.push(`sl.created_at <= $${params.length}`);
      }

      if (data.search && data.search.trim()) {
        params.push(`%${data.search.trim().toLowerCase()}%`);
        whereClauses.push(`(
          LOWER(sl.customer_name) LIKE $${params.length} OR 
          sl.customer_phone LIKE $${params.length} OR 
          LOWER(sl.scalev_order_id) LIKE $${params.length} OR 
          LOWER(sl.product_name) LIKE $${params.length} OR
          LOWER(COALESCE(sl.notes, '')) LIKE $${params.length}
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
          sl.id, sl.scalev_order_id, sl.customer_name, sl.customer_phone, sl.customer_raw_phone,
          sl.product_name, sl.gross_revenue, sl.scalev_status, sl.payment_status, sl.store_name,
          sl.is_closed, sl.matched_order_id, sl.closed_at, sl.followed_up_at, sl.follow_up_count,
          sl.follow_up_session, sl.created_at, sl.updated_at, COALESCE(sl.is_phone_edited, false) AS is_phone_edited,
          COALESCE(sl.follow_up_step, sl.follow_up_count, 0) AS follow_up_step,
          sl.fu1_at, sl.fu2_at, sl.fu3_at, sl.last_fu_notes, sl.notes,
          o.net_revenue, o.subtotal_gross AS order_subtotal_gross, o.amount_received AS order_amount_received,
          o.tracking_number AS matched_tracking_number,
          COALESCE(o.returned, false) AS order_returned
        FROM scalev_leads sl
        LEFT JOIN orders o ON sl.matched_order_id = o.id
        WHERE ${whereStr}
        ORDER BY sl.created_at DESC
        LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
      `;

      const res = await pool.query(leadsQuery, params);

      // Get total count for pagination
      const countParams = params.slice(0, params.length - 2);
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS total FROM scalev_leads sl WHERE ${whereStr}`,
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
    const newlyClosedCount = await autoMatchScalevLeadsWithPool(pool);
    await pool.end();
    return { newlyClosedCount };
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
               AND created_at >= ($2::timestamptz - INTERVAL '2 hours')
               AND created_at <= ($2::timestamptz + INTERVAL '30 days')
               AND id NOT IN (SELECT matched_order_id FROM scalev_leads WHERE matched_order_id IS NOT NULL)
             ORDER BY created_at ASC LIMIT 1`,
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
              customer_phone = CASE WHEN scalev_leads.is_phone_edited = true THEN scalev_leads.customer_phone ELSE EXCLUDED.customer_phone END,
              customer_raw_phone = CASE WHEN scalev_leads.is_phone_edited = true THEN scalev_leads.customer_raw_phone ELSE EXCLUDED.customer_raw_phone END,
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

      // Run auto-match & auto-clean duplicates (Pilihan 3)
      try {
        await autoMatchScalevLeadsWithPool(pool);
      } catch (matchErr) {
        console.error("[autoMatch in syncScalevHistory Error]:", matchErr);
      }

      await pool.end();
      return { totalSynced, newlyInserted, newlyClosed };
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      console.error("[syncScalevHistory Error]:", err);
      throw new Error(err.message || "Gagal menyinkronkan data Scalev");
    }
  });

// 5. Send Personalized Follow-Up WhatsApp to Scalev Lead (Step 1, 2, 3 with Media & Interactive Buttons or Meta HSM Template)
export const sendScalevFollowUpWhatsApp = createServerFn({ method: "POST" })
  .validator((data: {
    leadId: string;
    phone: string;
    customerName: string;
    productName?: string;
    customMessage?: string;
    senderSession?: string;
    step?: number; // 1, 2, or 3
    mediaUrl?: string; // Direct image or video URL
    mediaType?: "image" | "video";
    template?: {
      name: string;
      language?: string;
      bodyParameters?: string[];
      headerImageUrl?: string;
      headerVideoUrl?: string;
    };
  }) => data)
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

      const scalevCfgRes = await pool.query("SELECT value FROM app_settings WHERE key = 'scalev_config'");
      const scalevCfg = scalevCfgRes.rows[0]?.value || {};

      const step = Math.min(Math.max(Number(data.step) || 1, 1), 3);
      const activeSession = data.senderSession || scalevCfg.senderSession || "waba";
      const rawPhone = normalizePhone(data.phone);
      const chatId = `${rawPhone}@c.us`;

      // Compose message text if not custom
      let messageText = (data.customMessage || "").trim();
      if (!messageText && !data.template) {
        let template = "";
        if (step === 1) {
          template = scalevCfg.fu1Template || scalevCfg.followUpTemplate ||
            `Halo Kak {nama}, salam hangat dari Araa Honey! 🍯🐝\n\nKami melihat Kakak baru saja mengisi data pemesanan untuk *{produk}* di website kami.\n\nApakah ada kendala saat proses konfirmasi atau ada yang ingin ditanyakan terkait pengiriman dan cara pembayarannya Kak? Boleh kami bantu yaa. 😊🙏`;
        } else if (step === 2) {
          template = scalevCfg.fu2Template ||
            `Halo Kak {nama}, pesanan *{produk}* Kakak saat ini masih kami simpankan di antrean khusus yaa. 🍯✨\n\nMadu Araa dipanen murni langsung dari nektar bunga alami tanpa campuran, kaya enzim & antioksidan untuk menjaga daya tahan tubuh keluarga.\n\nApakah pesanannya mau kami proses kirim hari ini Kak? Stok untuk batch panen ini sangat terbatas lho. 😊📦`;
        } else {
          template = scalevCfg.fu3Template ||
            `Pemberitahuan Terakhir untuk Kak {nama} 🙏\n\nMengenai pesanan *{produk}* yang Kakak ajukan sebelumnya, mohon maaf batas waktu reservasi paket akan segera berakhir sore ini.\n\nJika Kakak masih berminat, silakan konfirmasi sekarang agar langsung kami kirimkan. Namun jika berhalangan, slot ini akan kami alihkan ke antrean berikutnya ya Kak. Terima kasih! 🍯🐝`;
        }

        messageText = template
          .replace(/{nama}/g, data.customerName || "Pelanggan")
          .replace(/{produk}/g, data.productName || "Madu Araa");
      } else if (!messageText && data.template) {
        messageText = `[Meta Template: ${data.template.name}]`;
      }

      // Determine step buttons and footer
      let buttons: { id: string; title: string }[] = [];
      let footerText = "Araa Honey • Official Order";

      if (step === 1) {
        buttons = [
          { id: "btn_pay_now", title: "✅ Mau Bayar Sekarang" },
          { id: "btn_cs_help", title: "💬 Tanya CS / Rekening" },
        ];
        footerText = "Araa Honey • Konfirmasi Pesanan";
      } else if (step === 2) {
        buttons = [
          { id: "btn_secure_order", title: "🍯 Amankan Pesanan" },
          { id: "btn_promo_info", title: "💬 Tanya Stok / Promo" },
        ];
        footerText = "Araa Honey • Pengingat Pesanan";
      } else {
        buttons = [
          { id: "btn_confirm_send", title: "🔥 Konfirmasi Kirim" },
          { id: "btn_cancel_order", title: "❌ Batalkan Pesanan" },
        ];
        footerText = "Araa Honey • Batas Waktu Reservasi";
      }

      const mediaUrl = (data.mediaUrl || "").trim() ||
        (step === 1 ? scalevCfg.fu1MediaUrl : step === 2 ? scalevCfg.fu2MediaUrl : scalevCfg.fu3MediaUrl) || undefined;

      // Fetch configs for dispatcher
      const wabaConfigRes = await pool.query("SELECT value FROM app_settings WHERE key = 'waba_config'");
      const wabaConfig = wabaConfigRes.rows[0]?.value || {};

      const wahaConfigRes = await pool.query("SELECT value FROM app_settings WHERE key = 'waha_config'");
      const wahaConfig = wahaConfigRes.rows[0]?.value || {};

      const channel = activeSession === "waba" ? "waba" : (activeSession === "default" ? "waha_main" : "waha_campaign");

      const res = await sendWhatsAppMessage({
        to: rawPhone,
        message: messageText,
        mediaUrl: data.template?.headerImageUrl || data.template?.headerVideoUrl ? undefined : mediaUrl,
        mediaType: data.mediaType,
        channel,
        buttons: data.template ? undefined : buttons,
        footerText: data.template ? undefined : footerText,
        template: data.template,
        wabaConfig: {
          phoneNumberId: wabaConfig.phone_number_id || wabaConfig.phoneNumberId || "1289613457572802",
          permanentToken: wabaConfig.permanent_token || wabaConfig.permanentToken,
        },
        wahaConfig: {
          wahaUrl: wahaConfig.wahaUrl,
          apiKey: wahaConfig.apiKey,
          sessionName: activeSession,
        },
      });

      if (!res.success) {
        console.error("[sendScalevFollowUpWhatsApp Error]:", res.error);
        throw new Error(`Gagal mengirim via ${channel.toUpperCase()}: ${res.error}`);
      }

      // Update lead follow up step, timestamps and count
      const stepCol = step === 1 ? "fu1_at" : step === 2 ? "fu2_at" : "fu3_at";
      await pool.query(
        `UPDATE scalev_leads 
         SET followed_up_at = now(), 
             follow_up_count = follow_up_count + 1, 
             follow_up_step = $1,
             ${stepCol} = now(),
             follow_up_session = $2, 
             updated_at = now() 
         WHERE id = $3`,
        [step, activeSession, data.leadId]
      );

      // Record outgoing in whatsapp_chat_logs for Live Chat Monitor
      try {
        await pool.query(
          `INSERT INTO whatsapp_chat_logs (chat_id, customer_phone, customer_name, message, direction, channel, created_at)
           VALUES ($1, $2, $3, $4, 'outgoing', $5, now())`,
          [chatId, rawPhone, data.customerName, messageText, channel]
        );
      } catch (e) {
        console.warn("Could not insert chat log:", e);
      }

      await pool.end();
      return {
        ok: true,
        recipient: chatId,
        channel,
        step,
        messageId: res.messageId,
        sentAt: new Date().toISOString(),
      };
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
    const val = res.rows[0]?.value || {};
    return {
      apiKey: val.apiKey || "",
      clientId: val.clientId || "",
      signingSecret: val.signingSecret || "",
      senderSession: val.senderSession || "waba",
      followUpTemplate: val.followUpTemplate || "",
      fu1Template: val.fu1Template || val.followUpTemplate || `Halo Kak {nama}, salam hangat dari Araa Honey! 🍯🐝\n\nKami mendapati Kakak baru saja mengisi data pemesanan untuk *{produk}* di website kami.\n\nApakah ada kendala saat proses konfirmasi atau ada yang ingin ditanyakan terkait pengiriman dan cara pembayarannya Kak? Boleh kami bantu yaa. 😊🙏`,
      fu1MediaUrl: val.fu1MediaUrl || "",
      fu2Template: val.fu2Template || `Halo Kak {nama}, pesanan *{produk}* Kakak saat ini masih kami simpankan di antrean khusus yaa. 🍯✨\n\nMadu Araa dipanen murni langsung dari nektar bunga alami tanpa campuran, kaya enzim & antioksidan untuk menjaga daya tahan tubuh keluarga.\n\nApakah pesanannya mau kami proses kirim hari ini Kak? Stok untuk batch panen ini sangat terbatas lho. 😊📦`,
      fu2MediaUrl: val.fu2MediaUrl || "",
      fu3Template: val.fu3Template || `Pemberitahuan Terakhir untuk Kak {nama} 🙏\n\nMengenai pesanan *{produk}* yang Kakak ajukan sebelumnya, mohon maaf batas waktu reservasi paket akan segera berakhir sore ini.\n\nJika Kakak masih berminat, silakan konfirmasi sekarang agar langsung kami kirimkan. Namun jika berhalangan, slot ini akan kami alihkan ke antrean berikutnya ya Kak. Terima kasih! 🍯🐝`,
      fu3MediaUrl: val.fu3MediaUrl || "",
    };
  } catch (err: any) {
    if (pool) try { await pool.end(); } catch (e) {}
    return {
      apiKey: "",
      clientId: "",
      signingSecret: "",
      senderSession: "waba",
      followUpTemplate: "",
      fu1Template: "",
      fu1MediaUrl: "",
      fu2Template: "",
      fu2MediaUrl: "",
      fu3Template: "",
      fu3MediaUrl: "",
    };
  }
});

export const saveScalevConfig = createServerFn({ method: "POST" })
  .validator((data: {
    apiKey?: string;
    clientId?: string;
    signingSecret?: string;
    senderSession?: string;
    followUpTemplate?: string;
    fu1Template?: string;
    fu1MediaUrl?: string;
    fu2Template?: string;
    fu2MediaUrl?: string;
    fu3Template?: string;
    fu3MediaUrl?: string;
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
        } else {
          // Smart Auto-lookup: check if this customer has an order in orders table within [created_at - 2h, created_at + 30d]
          const leadRes = await pool.query(
            "SELECT customer_phone, customer_raw_phone, created_at FROM scalev_leads WHERE id = $1",
            [data.leadId]
          );
          if (leadRes.rowCount && leadRes.rowCount > 0) {
            const lead = leadRes.rows[0];
            const variants = getPhoneVariants(lead.customer_phone);
            if (lead.customer_raw_phone) variants.push(lead.customer_raw_phone);
            const autoMatch = await pool.query(
              `SELECT id, created_at FROM orders 
               WHERE customer_phone = ANY($1) 
                 AND created_at >= ($2::timestamptz - INTERVAL '2 hours')
                 AND created_at <= ($2::timestamptz + INTERVAL '30 days')
                 AND id NOT IN (SELECT matched_order_id FROM scalev_leads WHERE matched_order_id IS NOT NULL AND id != $3)
               ORDER BY created_at ASC LIMIT 1`,
              [variants, lead.created_at, data.leadId]
            );
            if (autoMatch.rowCount && autoMatch.rowCount > 0) {
              matchedOrderId = autoMatch.rows[0].id;
              closedAt = autoMatch.rows[0].created_at;
            }
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

        // Auto-clean any unclosed duplicate leads for this customer (Pilihan 3)
        try {
          await cleanDuplicateScalevLeadsWithPool(pool);
        } catch (cleanErr) {
          console.error("[cleanDuplicateScalevLeads in manualToggleScalevClosing Error]:", cleanErr);
        }
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
        const cleanQuery = `%${q.toLowerCase()}%`;
        const digitsOnly = q.replace(/[^0-9]/g, "");
        params.push(cleanQuery);
        let phoneCondition = "customer_phone LIKE $1";
        if (digitsOnly.length >= 4) {
          params.push(`%${digitsOnly}%`);
          phoneCondition = `(customer_phone LIKE $1 OR regexp_replace(customer_phone, '[^0-9]', '', 'g') LIKE $${params.length})`;
        }
        querySql = `
          SELECT id, customer_name, customer_phone, tracking_number, COALESCE(net_revenue, amount_received, subtotal_gross, 0) as net_revenue, subtotal_gross, created_at, COALESCE(returned, false) as returned
          FROM orders
          WHERE LOWER(customer_name) LIKE $1 
             OR ${phoneCondition}
             OR LOWER(COALESCE(tracking_number, '')) LIKE $1
          ORDER BY created_at DESC
          LIMIT 15
        `;
      } else {
        querySql = `
          SELECT id, customer_name, customer_phone, tracking_number, COALESCE(net_revenue, amount_received, subtotal_gross, 0) as net_revenue, subtotal_gross, created_at, COALESCE(returned, false) as returned
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

// 9. Update Customer Phone Number for a Lead (with immediate auto-matching check)
export const updateScalevLeadPhone = createServerFn({ method: "POST" })
  .validator((data: { leadId: string; newPhone: string }) => data)
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      const cleanPhone = normalizePhone(data.newPhone);
      if (!cleanPhone || cleanPhone.length < 9) {
        throw new Error("Format nomor WhatsApp tidak valid. Minimal 9 digit angka.");
      }

      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

      // 1. Fetch current lead
      const leadRes = await pool.query(
        "SELECT id, is_closed, created_at, customer_name FROM scalev_leads WHERE id = $1",
        [data.leadId]
      );
      if (!leadRes.rowCount || leadRes.rowCount === 0) {
        throw new Error("Data lead tidak ditemukan.");
      }
      const lead = leadRes.rows[0];

      // 2. Check if an order matches in orders table (if lead is not closed yet)
      let matchedOrder = false;
      let matchedOrderId: string | null = null;
      let closedAt: string | null = null;
      let isClosed = lead.is_closed === true;

      if (!isClosed) {
        const variants = getPhoneVariants(cleanPhone);
        const matchRes = await pool.query(
          `SELECT id, created_at FROM orders 
           WHERE (customer_phone = ANY($1) OR regexp_replace(customer_phone, '[^0-9]', '', 'g') = ANY($1))
             AND (returned IS NULL OR returned = false)
             AND created_at >= ($2::timestamptz - INTERVAL '2 hours')
             AND created_at <= ($2::timestamptz + INTERVAL '30 days')
           ORDER BY created_at ASC LIMIT 1`,
          [variants, lead.created_at]
        );

        if (matchRes.rowCount && matchRes.rowCount > 0) {
          matchedOrder = true;
          isClosed = true;
          matchedOrderId = matchRes.rows[0].id;
          closedAt = matchRes.rows[0].created_at;
        }
      }

      // 3. Update scalev_leads
      await pool.query(
        `UPDATE scalev_leads 
         SET customer_phone = $1, 
             customer_raw_phone = $2, 
             is_phone_edited = true,
             is_closed = $3,
             matched_order_id = COALESCE($4, matched_order_id),
             closed_at = COALESCE($5, closed_at),
             updated_at = now() 
         WHERE id = $6`,
        [cleanPhone, data.newPhone.trim(), isClosed, matchedOrderId, closedAt, data.leadId]
      );

      await pool.end();
      return { ok: true, matchedOrder, customerPhone: cleanPhone };
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      console.error("[updateScalevLeadPhone Error]:", err);
      throw new Error(err.message || "Gagal memperbarui nomor HP pelanggan");
    }
  });

// 10. Delete Scalev Lead(s) - Single or Bulk
export const deleteScalevLeads = createServerFn({ method: "POST" })
  .validator((data: { leadIds: string[] }) => data)
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      if (!data?.leadIds || data.leadIds.length === 0) {
        return { ok: true, deletedCount: 0 };
      }

      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

      const res = await pool.query(
        `DELETE FROM scalev_leads WHERE id = ANY($1::uuid[]) RETURNING id`,
        [data.leadIds]
      );

      await pool.end();
      return { ok: true, deletedCount: res.rowCount || 0 };
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      console.error("[deleteScalevLeads Error]:", err);
      throw new Error(err.message || "Gagal menghapus data lead Scalev");
    }
  });

// 11. Update Notes / Unclosed Reason for a Lead (Seamless Auto-save)
export const updateScalevLeadNotes = createServerFn({ method: "POST" })
  .validator((data: { leadId: string; notes: string }) => data)
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      if (!data?.leadId) {
        throw new Error("ID lead tidak valid.");
      }

      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

      const res = await pool.query(
        `UPDATE scalev_leads 
         SET notes = $1, 
             updated_at = now() 
         WHERE id = $2 
         RETURNING id, notes`,
        [data.notes ?? null, data.leadId]
      );

      await pool.end();
      return { ok: true, leadId: data.leadId, notes: res.rows[0]?.notes ?? "" };
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      console.error("[updateScalevLeadNotes Error]:", err);
      throw new Error(err.message || "Gagal menyimpan catatan lead");
    }
  });



