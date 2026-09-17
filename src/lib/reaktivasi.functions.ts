import { createServerFn } from "@tanstack/react-start";
import pg from "pg";
import { sendWhatsAppMessage } from "@/lib/whatsapp-service";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres.saefgyiloalpiqfrglqo:Handayani01@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";

// Helper to normalize phone numbers to 628xxx format
export function normalizePhone(raw: string): string {
  let clean = String(raw || "").replace(/[^0-9]/g, "");
  if (clean.startsWith("0")) {
    clean = "62" + clean.slice(1);
  } else if (clean.startsWith("8")) {
    clean = "62" + clean;
  }
  return clean;
}

// 1. Process and import 2025 contacts with automatic 2026 deduplication
export const importReaktivasiContacts = createServerFn({ method: "POST" })
  .validator((data: {
    contacts: Array<{
      phone: string;
      name: string;
      product?: string;
      orderDate?: string;
      resi?: string;
    }>;
  }) => data)
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({
        connectionString: DB_URL,
        ssl: { rejectUnauthorized: false },
      });

      const rawList = data.contacts || [];
      if (rawList.length === 0) {
        throw new Error("Data kontak kosong.");
      }

      // Step 1: Normalize & Deduplicate input contacts
      const contactMap = new Map<string, {
        phone: string;
        name: string;
        product: string;
        orderDate: string;
        resi: string;
      }>();

      let sensorCount = 0;

      for (const item of rawList) {
        const rawPhone = String(item.phone || "");
        if (rawPhone.includes("*")) {
          sensorCount++;
          continue;
        }

        const normPhone = normalizePhone(rawPhone);
        if (normPhone.length < 10) continue;

        // Clean name
        let cleanName = String(item.name || "").trim();
        if (!cleanName || /^[0-9+-\s]{8,}$/.test(cleanName)) {
          cleanName = "Pelanggan";
        }
        const cleanProduct = String(item.product || "").trim() || "Madu Araa";
        const cleanDate = String(item.orderDate || "").trim();
        const cleanResi = String(item.resi || "").trim();

        // If duplicate in Excel, keep latest row
        contactMap.set(normPhone, {
          phone: normPhone,
          name: cleanName,
          product: cleanProduct,
          orderDate: cleanDate,
          resi: cleanResi,
        });
      }

      const uniqueInputContacts = Array.from(contactMap.values());

      // Step 2: Fetch all customer phones who already bought in 2026
      const existing2026Res = await pool.query(`
        SELECT DISTINCT
          CASE 
            WHEN REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g') LIKE '0%' 
              THEN '62' || SUBSTRING(REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g') FROM 2)
            WHEN REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g') LIKE '8%' 
              THEN '62' || REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g')
            ELSE REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g')
          END as phone
        FROM orders
        WHERE returned = false 
          AND created_at >= '2026-01-01'
          AND customer_phone IS NOT NULL
      `);

      const phones2026Set = new Set(existing2026Res.rows.map((r) => r.phone));

      // Step 3: Filter out contacts that already ordered in 2026
      const targetsToInsert: typeof uniqueInputContacts = [];
      let alreadyBought2026Count = 0;

      for (const contact of uniqueInputContacts) {
        if (phones2026Set.has(contact.phone)) {
          alreadyBought2026Count++;
        } else {
          targetsToInsert.push(contact);
        }
      }

      // Step 4: Batch upsert into crm_reaktivasi_2025
      if (targetsToInsert.length > 0) {
        // Upsert in chunks of 500 to avoid query size limits
        const chunkSize = 500;
        for (let i = 0; i < targetsToInsert.length; i += chunkSize) {
          const chunk = targetsToInsert.slice(i, i + chunkSize);
          const values: any[] = [];
          const placeholders: string[] = [];

          chunk.forEach((c, idx) => {
            const offset = idx * 5;
            placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
            values.push(c.phone, c.name, c.product, c.orderDate, c.resi);
          });

          const upsertQuery = `
            INSERT INTO crm_reaktivasi_2025 (phone, name, product_2025, order_date_2025, resi_2025)
            VALUES ${placeholders.join(", ")}
            ON CONFLICT (phone) DO UPDATE SET
              name = EXCLUDED.name,
              product_2025 = EXCLUDED.product_2025,
              order_date_2025 = EXCLUDED.order_date_2025,
              resi_2025 = EXCLUDED.resi_2025,
              updated_at = now();
          `;
          await pool.query(upsertQuery, values);
        }
      }

      await pool.end();

      return {
        ok: true,
        totalUploaded: rawList.length,
        sensorCount,
        uniqueValid: uniqueInputContacts.length,
        alreadyBought2026Count,
        insertedCount: targetsToInsert.length,
      };
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      console.error("[importReaktivasiContacts Error]:", err);
      throw new Error(err.message || "Gagal mengimpor data reaktivasi 2025");
    }
  });

// 2. Fetch Reaktivasi Stats & Customer List with 2026 Conversion Detection
export const getReaktivasiData = createServerFn({ method: "GET" }).handler(async () => {
  let pool: pg.Pool | null = null;
  try {
    pool = new pg.Pool({
      connectionString: DB_URL,
      ssl: { rejectUnauthorized: false },
    });

    // Query 2025 contacts combined with 2026 conversion tracking
    const query = `
      WITH orders_2026 AS (
        SELECT 
          CASE 
            WHEN REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g') LIKE '0%' 
              THEN '62' || SUBSTRING(REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g') FROM 2)
            WHEN REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g') LIKE '8%' 
              THEN '62' || REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g')
            ELSE REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g')
          END as phone,
          COUNT(*)::int as orders_2026_count,
          SUM(subtotal_gross)::numeric as total_2026_spent,
          MIN(created_at) as first_order_2026,
          MAX(created_at) as last_order_2026
        FROM orders
        WHERE returned = false 
          AND created_at >= '2026-01-01'
        GROUP BY 1
      ),
      reaktivasi_enriched AS (
        SELECT 
          r.id,
          r.phone,
          r.name,
          r.product_2025,
          r.order_date_2025,
          r.resi_2025,
          r.status,
          r.sent_at,
          r.sent_by,
          r.notes,
          r.created_at,
          COALESCE(o.orders_2026_count, 0) as orders_2026_count,
          COALESCE(o.total_2026_spent, 0) as total_2026_spent,
          o.last_order_2026,
          CASE 
            WHEN o.orders_2026_count > 0 AND r.sent_at IS NOT NULL AND o.last_order_2026 >= r.sent_at THEN true
            WHEN o.orders_2026_count > 0 AND r.sent_at IS NULL THEN true
            ELSE false
          END as has_converted
        FROM crm_reaktivasi_2025 r
        LEFT JOIN orders_2026 o ON r.phone = o.phone
        ORDER BY 
          CASE WHEN r.status = 'uncontacted' THEN 0 ELSE 1 END,
          r.created_at DESC
      )
      SELECT 
        json_agg(r) as contacts,
        COUNT(*)::int as total_target,
        COUNT(*) FILTER (WHERE r.status = 'uncontacted')::int as uncontacted_count,
        COUNT(*) FILTER (WHERE r.status = 'sent')::int as sent_count,
        COUNT(*) FILTER (WHERE r.status = 'failed')::int as failed_count,
        COUNT(*) FILTER (WHERE r.has_converted = true)::int as converted_count,
        COALESCE(SUM(r.total_2026_spent) FILTER (WHERE r.has_converted = true), 0)::numeric as converted_revenue
      FROM reaktivasi_enriched r;
    `;

    const res = await pool.query(query);
    const row = res.rows[0] || {};
    const contacts = row.contacts || [];

    // Distinct products for dropdown filter
    const productSet = new Set<string>();
    contacts.forEach((c: any) => {
      if (c.product_2025) productSet.add(c.product_2025);
    });

    await pool.end();

    return {
      contacts,
      summary: {
        totalTarget: Number(row.total_target) || 0,
        uncontactedCount: Number(row.uncontacted_count) || 0,
        sentCount: Number(row.sent_count) || 0,
        failedCount: Number(row.failed_count) || 0,
        convertedCount: Number(row.converted_count) || 0,
        convertedRevenue: Number(row.converted_revenue) || 0,
        conversionRate:
          (Number(row.sent_count) || 0) > 0
            ? Number((((Number(row.converted_count) || 0) / Number(row.sent_count)) * 100).toFixed(1))
            : 0,
      },
      products: Array.from(productSet).sort(),
    };
  } catch (err: any) {
    if (pool) try { await pool.end(); } catch (e) {}
    console.error("[getReaktivasiData Error]:", err);
    throw new Error(err.message || "Gagal memuat data reaktivasi 2025");
  }
});

// 3. Send Single WhatsApp Message for Reaktivasi via WABA (Meta Cloud API) or WAHA
export const sendDirectReaktivasiWhatsApp = createServerFn({ method: "POST" })
  .validator((data: {
    phone: string;
    customerName: string;
    message: string;
    product?: string;
    imageUrl?: string;
    senderSession?: string;
    templateName?: string;
    templateLanguage?: string;
    namedParameters?: Record<string, string>;
    headerImageUrl?: string;
  }) => data)
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

      const rawPhone = normalizePhone(data.phone);
      const chatId = `${rawPhone}@c.us`;

      // 1. DISPATCH VIA WABA (Official Meta Cloud API - 100% Anti-Banned)
      if (data.senderSession === "waba") {
        const wabaConfigRes = await pool.query("SELECT value FROM app_settings WHERE key = 'waba_config'");
        const wabaConfig = wabaConfigRes.rows[0]?.value || {};

        let res;
        if (data.templateName) {
          // Official Meta Template (HSM) Dispatch
          let headerImageUrl = data.headerImageUrl || data.imageUrl;
          if (!headerImageUrl) {
            try {
              const imgRes = await pool.query("SELECT value FROM app_settings WHERE key = 'waba_template_images'");
              const imgMap = imgRes.rows[0]?.value || {};
              if (imgMap[data.templateName]?.url) {
                headerImageUrl = imgMap[data.templateName].url;
              }
            } catch (e) {}
            if (!headerImageUrl) {
              headerImageUrl = "https://waha.araahoney.my.id/media/1788438796747-chatgpt-image-sep-3-2026-07_32_54-pm.png";
            }
          }

          res = await sendWhatsAppMessage({
            to: rawPhone,
            message: `[Template: ${data.templateName}]`,
            channel: "waba",
            template: {
              name: data.templateName,
              language: data.templateLanguage || "id",
              namedParameters: data.namedParameters,
              headerImageUrl,
            },
            wabaConfig: {
              phoneNumberId: wabaConfig.phone_number_id || wabaConfig.phoneNumberId || "1289613457572802",
              permanentToken: wabaConfig.permanent_token || wabaConfig.permanentToken,
            },
          });
        } else {
          // Free-form message
          res = await sendWhatsAppMessage({
            to: rawPhone,
            message: data.message,
            imageUrl: data.imageUrl,
            channel: "waba",
            wabaConfig: {
              phoneNumberId: wabaConfig.phone_number_id || wabaConfig.phoneNumberId || "1289613457572802",
              permanentToken: wabaConfig.permanent_token || wabaConfig.permanentToken,
            },
          });
        }

        if (!res.success) {
          console.error("[sendDirectReaktivasiWhatsApp WABA Error]:", res.error);
          throw new Error(`Gagal mengirim via WABA Resmi Meta: ${res.error}`);
        }

        // Update status in crm_reaktivasi_2025
        await pool.query(
          `UPDATE crm_reaktivasi_2025 
           SET status = 'sent', sent_at = now(), notes = 'Terkirim via WABA (+62 856-4540-6949)', updated_at = now() 
           WHERE phone = $1`,
          [rawPhone]
        );

        // Record in crm_reminders as sent for cross-module sync
        await pool.query(
          `INSERT INTO crm_reminders (customer_name, customer_phone, honey_type, scheduled_for, status, sent_at, created_at, updated_at)
           VALUES ($1, $2, $3, CURRENT_DATE, 'sent', now(), now(), now())`,
          [data.customerName, rawPhone, data.product || "Madu Araa"]
        );

        // Record outgoing message in whatsapp_chat_logs for Live Chat Monitor
        try {
          const custName = data.customerName || "Pelanggan";
          const orderDate = data.namedParameters?.tanggal_order || "Tahun 2025";
          const logMessage = data.templateName
            ? `[Template Resmi Meta: ${data.templateName}]\n\nHalo Bapak/Ibu ${custName}, salam hangat dari Araa Honey 🍯✨\n\nMengingat pesanan terakhir Bapak/Ibu pada tanggal ${orderDate}, sudah cukup lama belum stok Madu Araa-nya lagi nih 😊\n\n_Kebetulan kami baru saja selesai panen dan minggu ini ada promo khusus pelanggan setia:_\n\n🚚 *Subsidi ongkir*\n🎁 *1 Kg Madu Araa + BONUS 100 gr*\n\nKalau stok madu di rumah sudah habis, tinggal klik “*Order Lagi*” di bawah ya Kak. Kami bantu proses pengirimannya 😊\n\nAraa Honey • Solusi Madu yang Terjamin Murni\n[Tombol Respon: ORDER LAGI]`
            : data.message;
          await pool.query(
            `INSERT INTO whatsapp_chat_logs (chat_id, customer_phone, customer_name, message, direction, channel, replied_by, created_at)
             VALUES ($1, $2, $3, $4, 'outgoing', 'waba', $5, now())`,
            [chatId, rawPhone, custName, logMessage, data.templateName ? "template" : "system"]
          );
        } catch (chatLogErr) {
          console.warn("Could not write outgoing to whatsapp_chat_logs:", chatLogErr);
        }

        await pool.end();
        return { ok: true, recipient: chatId, channel: "waba", messageId: res.messageId, sentAt: new Date().toISOString() };
      }

      // 2. DISPATCH VIA WAHA (Slot 1 Default or Slot 2 Campaign)
      const wahaConfigRes = await pool.query("SELECT value FROM app_settings WHERE key = 'waha_config'");
      const wahaConfig = wahaConfigRes.rows[0]?.value || {};
      const { wahaUrl, sessionName, apiKey, campaignSessionName } = wahaConfig;

      if (!wahaUrl) {
        throw new Error("Konfigurasi server WAHA belum diatur.");
      }

      // Determine active sender session: prefer data.senderSession, then campaignSessionName, then sessionName
      const activeSession = data.senderSession || campaignSessionName || "campaign";

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["x-api-key"] = apiKey;

      // Fast pre-check: verify if number exists on WhatsApp via WAHA
      try {
        const checkUrl = `${wahaUrl}/api/contacts/check-exists?phone=${rawPhone}&session=${activeSession}`;
        const checkRes = await fetch(checkUrl, { headers, signal: AbortSignal.timeout(4000) }).catch(() => null);
        if (checkRes && checkRes.ok) {
          const checkJson = await checkRes.json().catch(() => null);
          if (checkJson && checkJson.numberExists === false) {
            await pool.query(
              `UPDATE crm_reaktivasi_2025 
               SET status = 'failed', notes = 'Nomor tidak terdaftar di WhatsApp', updated_at = now() 
               WHERE phone = $1`,
              [rawPhone]
            );
            await pool.end();
            return { ok: false, reason: "no_whatsapp", message: "Nomor tidak terdaftar di WhatsApp" };
          }
        }
      } catch (checkErr) {
        // Continue to send if check fails
      }

      const hasImage = !!(data.imageUrl && data.imageUrl.trim().startsWith("http"));
      let response: Response | null = null;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      if (hasImage) {
        const imagePayload = {
          session: activeSession,
          chatId,
          file: {
            url: data.imageUrl!.trim(),
            mimetype: "image/jpeg",
            filename: "promo-reaktivasi-araa.jpg",
          },
          caption: data.message,
        };

        response = await fetch(`${wahaUrl}/api/sendImage`, {
          method: "POST",
          headers,
          body: JSON.stringify(imagePayload),
          signal: controller.signal,
        }).catch(() => null);

        if (!response || !response.ok) {
          response = await fetch(`${wahaUrl}/api/sendFile`, {
            method: "POST",
            headers,
            body: JSON.stringify(imagePayload),
            signal: controller.signal,
          }).catch(() => null);
        }
      }

      if (!response || !response.ok) {
        const textPayload = {
          session: activeSession,
          chatId,
          text: data.message,
        };

        response = await fetch(`${wahaUrl}/api/sendText`, {
          method: "POST",
          headers,
          body: JSON.stringify(textPayload),
          signal: controller.signal,
        }).catch(() => null);

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
        
        // Auto-mark if number is not registered on WhatsApp
        const isNotRegistered = 
          errBody.includes("No LID for user") || 
          errBody.includes("does not exist") || 
          errBody.includes("not registered") ||
          errBody.includes("invalid jid") ||
          (response && response.status === 422);

        if (isNotRegistered) {
          await pool.query(
            `UPDATE crm_reaktivasi_2025 
             SET status = 'failed', notes = 'Nomor tidak terdaftar di WhatsApp', updated_at = now() 
             WHERE phone = $1`,
            [rawPhone]
          );
          await pool.end();
          return { ok: false, reason: "no_whatsapp", message: "Nomor tidak terdaftar di WhatsApp" };
        }

        throw new Error(`Gagal mengirim via WAHA: ${errBody.substring(0, 150)}`);
      }

      // Update status in crm_reaktivasi_2025
      await pool.query(
        `UPDATE crm_reaktivasi_2025 
         SET status = 'sent', sent_at = now(), updated_at = now() 
         WHERE phone = $1`,
        [rawPhone]
      );

      // Record in crm_reminders as sent for cross-module sync
      await pool.query(
        `INSERT INTO crm_reminders (customer_name, customer_phone, honey_type, scheduled_for, status, sent_at, created_at, updated_at)
         VALUES ($1, $2, $3, CURRENT_DATE, 'sent', now(), now(), now())`,
        [data.customerName, rawPhone, data.product || "Madu Araa"]
      );

      // Record outgoing message in whatsapp_chat_logs for Live Chat Monitor
      try {
        await pool.query(
          `INSERT INTO whatsapp_chat_logs (chat_id, customer_phone, customer_name, message, direction, channel, created_at)
           VALUES ($1, $2, $3, $4, 'outgoing', $5, now())`,
          [chatId, rawPhone, data.customerName, data.message, activeSession === "default" ? "waha_main" : "waha_campaign"]
        );
      } catch (chatLogErr) {
        console.warn("Could not write outgoing to whatsapp_chat_logs:", chatLogErr);
      }

      await pool.end();

      return { ok: true, recipient: chatId, channel: activeSession === "default" ? "waha_main" : "waha_campaign", sentAt: new Date().toISOString() };
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      console.error("[sendDirectReaktivasiWhatsApp Error]:", err);
      throw new Error(err.message || "Gagal mengirim pesan Reaktivasi");
    }
  });

// 4. Get and Save Reaktivasi CRM Template
export const getReaktivasiTemplate = createServerFn({ method: "GET" }).handler(async () => {
  let pool: pg.Pool | null = null;
  try {
    pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
    const res = await pool.query("SELECT value FROM app_settings WHERE key = 'reaktivasi_2025_template'");
    await pool.end();

    const defTpl = `Halo Kak {nama}, salam hangat dari Araa Honey! 🍯✨

Melihat catatan pesanan kami, Kakak sebelumnya pernah menikmati {produk} di tahun 2025 lalu. Semoga Kakak dan keluarga selalu dalam keadaan sehat walafiat ya Kak. 😊

Kabar baik Kak, kami baru saja panen madu murni segar musim ini dengan kualitas kental dan fresh langsung dari peternakan lebah kami.

Karena kami rindu menyapa Kakak kembali, khusus pemesanan minggu ini kami siapkan *PROMO SPESIAL REAKTIVASI* untuk Kakak:
🎁 Voucher Potongan Harga Rp 20.000
🚚 Subsidi Gratis Ongkir Khusus Pelanggan Setia

Balas pesan ini dengan ketik *"MAU"* ya Kak jika ingin kami aktifkan promonya hari ini. Terima kasih banyak Kak {nama}! 🙏🍯`;

    return (
      res.rows[0]?.value || {
        template: defTpl,
        imageUrl: "",
      }
    );
  } catch (err) {
    if (pool) try { await pool.end(); } catch (e) {}
    return {
      template: "",
      imageUrl: "",
    };
  }
});

export const saveReaktivasiTemplate = createServerFn({ method: "POST" })
  .validator((data: { template: string; imageUrl?: string }) => data)
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('reaktivasi_2025_template', $1, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify(data)]
      );
      await pool.end();
      return { ok: true };
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      throw new Error(err.message || "Gagal menyimpan template reaktivasi");
    }
  });

// 5. Reset / Clear all 2025 reaktivasi contacts (if owner wants to start fresh)
export const clearReaktivasiContacts = createServerFn({ method: "POST" }).handler(async () => {
  let pool: pg.Pool | null = null;
  try {
    pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
    await pool.query("DELETE FROM crm_reaktivasi_2025");
    await pool.end();
    return { ok: true };
  } catch (err: any) {
    if (pool) try { await pool.end(); } catch (e) {}
    throw new Error(err.message || "Gagal mengosongkan data reaktivasi");
  }
});

// 6. Delete selected 2025 contacts
export const deleteSelectedReaktivasiContacts = createServerFn({ method: "POST" })
  .validator((data: { phones: string[] }) => data)
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
      const phones = data.phones || [];
      if (phones.length > 0) {
        await pool.query("DELETE FROM crm_reaktivasi_2025 WHERE phone = ANY($1)", [phones]);
      }
      await pool.end();
      return { ok: true, deletedCount: phones.length };
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      throw new Error(err.message || "Gagal menghapus kontak terpilih");
    }
  });

// 7. Get status of both WAHA sessions (Slot 1: Default CS, Slot 2: Campaign)
export const getWahaSessionsInfo = createServerFn({ method: "GET" }).handler(async () => {
  let pool: pg.Pool | null = null;
  try {
    pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
    const res = await pool.query("SELECT value FROM app_settings WHERE key = 'waha_config'");
    const cfg = res.rows[0]?.value || {};
    const wahaUrl = cfg.wahaUrl || "https://waha.araahoney.my.id";
    const mainSessionName = cfg.sessionName || "default";
    const campaignSessionName = cfg.campaignSessionName || "campaign";

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.apiKey) headers["x-api-key"] = cfg.apiKey;

    const sessionRes = await fetch(`${wahaUrl}/api/sessions`, { headers }).catch(() => null);
    const sessionsList: any[] = sessionRes && sessionRes.ok ? await sessionRes.json().catch(() => []) : [];

    const mainSession = sessionsList.find((s: any) => s.name === mainSessionName) || null;
    const campaignSession = sessionsList.find((s: any) => s.name === campaignSessionName) || null;

    const wabaRes = await pool.query("SELECT value FROM app_settings WHERE key = 'waba_config'");
    const wabaConfig = wabaRes.rows[0]?.value || {};

    await pool.end();
    return {
      wahaUrl,
      mainSessionName,
      campaignSessionName,
      mainSession,
      campaignSession,
      waba: {
        phoneNumber: wabaConfig.display_phone_number || "+62 856-4540-6949",
        phoneNumberId: wabaConfig.phone_number_id || wabaConfig.phoneNumberId || "1289613457572802",
        status: "CONNECTED",
        name: wabaConfig.verified_name || "Araa Honey Official (Meta Cloud API)",
        provider: "meta_cloud_api",
      },
    };
  } catch (err: any) {
    if (pool) try { await pool.end(); } catch (e) {}
    return {
      wahaUrl: "",
      mainSessionName: "default",
      campaignSessionName: "campaign",
      mainSession: null,
      campaignSession: null,
      waba: {
        phoneNumber: "+62 856-4540-6949",
        phoneNumberId: "1289613457572802",
        status: "CONNECTED",
        name: "Araa Honey Official (Meta Cloud API)",
        provider: "meta_cloud_api",
      },
    };
  }
});
