import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';
import crypto from 'node:crypto';

const DB_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres.saefgyiloalpiqfrglqo:Handayani01@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";

// Normalize phone number to standard 628xxx format
function normalizePhone(raw: string): string {
  let clean = String(raw || "").replace(/[^0-9]/g, "");
  if (clean.startsWith("0")) {
    clean = "62" + clean.slice(1);
  } else if (clean.startsWith("8")) {
    clean = "62" + clean;
  }
  return clean;
}

// Generate variants of phone for database matching (08xxx, 628xxx)
function getPhoneVariants(phone: string): string[] {
  const norm = normalizePhone(phone);
  const zero = norm.startsWith("62") ? "0" + norm.slice(2) : norm;
  return Array.from(new Set([norm, zero, phone]));
}

export const Route = createFileRoute('/api/scalev-webhook')({
  server: {
    handlers: {
      GET: async () => {
        return new Response(JSON.stringify({
          status: 'ok',
          service: 'Scalev Webhook Receiver for Araa Honey Hub',
          timestamp: new Date().toISOString()
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      },
      POST: async ({ request }) => {
        let pool: pg.Pool | null = null;
        try {
          // 1. Read raw text body for HMAC verification
          const rawBody = await request.text();
          if (!rawBody || !rawBody.trim()) {
            return new Response(JSON.stringify({ error: 'Empty body' }), { status: 400 });
          }

          pool = new pg.Pool({
            connectionString: DB_URL,
            ssl: { rejectUnauthorized: false }
          });

          // Fetch scalev config for signing secret
          const cfgRes = await pool.query("SELECT value FROM app_settings WHERE key = 'scalev_config'");
          const cfg = cfgRes.rows[0]?.value || {};
          const signingSecret = cfg.signingSecret || "33FyqVrD2rek4DyENVLanafdxMjl9zBi";

          // 2. Validate HMAC Signature if header is provided
          const signature = request.headers.get('X-Scalev-Hmac-Sha256') || request.headers.get('x-scalev-hmac-sha256');
          if (signature && signingSecret) {
            try {
              const expected = crypto
                .createHmac('sha256', signingSecret)
                .update(rawBody)
                .digest();
              const received = Buffer.from(signature, 'base64');
              if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
                console.warn('[Scalev Webhook] Invalid HMAC signature received:', signature);
              }
            } catch (sigErr) {
              console.warn('[Scalev Webhook] Signature comparison error:', sigErr);
            }
          }

          // 3. Parse JSON event payload
          const body = JSON.parse(rawBody);
          const event = body.event || '';
          const data = body.data || body;

          console.log(`[Scalev Webhook] Event: ${event}, Order ID: ${data.order_id || data.id}`);

          // Extract fields
          const scalevOrderId = String(data.order_id || data.id || '').trim();
          if (!scalevOrderId) {
            await pool.end();
            return new Response(JSON.stringify({ message: 'No order_id found, skipped' }), { status: 200 });
          }

          const rawPhone = String(data.customer?.phone || data.destination_address?.phone || '');
          const customerPhone = normalizePhone(rawPhone);
          const customerName = String(data.customer?.name || data.destination_address?.name || 'Pelanggan Scalev').trim();

          // Extract product name
          let productName = 'Madu Araa';
          if (Array.isArray(data.orderlines) && data.orderlines.length > 0) {
            productName = data.orderlines.map((ol: any) => ol.product_name || ol.variant_name).filter(Boolean).join(', ') || productName;
          } else if (data.final_variants && typeof data.final_variants === 'object') {
            productName = Object.keys(data.final_variants).join(', ') || productName;
          }

          const grossRevenue = parseFloat(String(data.gross_revenue || data.net_revenue || data.product_price || 0)) || 0;
          const scalevStatus = String(data.status || 'draft').toLowerCase();
          const paymentStatus = String(data.payment_status || 'unpaid').toLowerCase();
          const storeName = String(data.store?.name || 'ALEEKA STORE');
          const createdAtStr = data.created_at || data.draft_time || body.timestamp || new Date().toISOString();

          // 4. Auto-match against orders table (must be created AFTER or around the time lead arrived)
          const phoneVariants = getPhoneVariants(customerPhone);
          const matchRes = await pool.query(
            `SELECT id, created_at FROM orders 
             WHERE (customer_phone = ANY($1) OR regexp_replace(customer_phone, '[^0-9]', '', 'g') = ANY($1))
               AND (returned IS NULL OR returned = false)
               AND created_at >= ($2::timestamptz - INTERVAL '2 hours')
               AND created_at <= ($2::timestamptz + INTERVAL '30 days')
             ORDER BY created_at ASC LIMIT 1`,
            [phoneVariants, createdAtStr]
          );

          const isClosed = matchRes.rowCount ? matchRes.rowCount > 0 : false;
          const matchedOrderId = isClosed ? matchRes.rows[0].id : null;
          const closedAt = isClosed ? matchRes.rows[0].created_at : null;

          // 5. Upsert into scalev_leads
          await pool.query(
            `INSERT INTO scalev_leads (
              scalev_order_id, customer_name, customer_phone, customer_raw_phone,
              product_name, gross_revenue, scalev_status, payment_status, store_name,
              is_closed, matched_order_id, closed_at, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
            ON CONFLICT (scalev_order_id) DO UPDATE SET
              customer_name = EXCLUDED.customer_name,
              customer_phone = CASE WHEN scalev_leads.is_phone_edited = true THEN scalev_leads.customer_phone ELSE EXCLUDED.customer_phone END,
              customer_raw_phone = CASE WHEN scalev_leads.is_phone_edited = true THEN scalev_leads.customer_raw_phone ELSE EXCLUDED.customer_raw_phone END,
              product_name = EXCLUDED.product_name,
              gross_revenue = EXCLUDED.gross_revenue,
              scalev_status = EXCLUDED.scalev_status,
              payment_status = EXCLUDED.payment_status,
              store_name = EXCLUDED.store_name,
              is_closed = CASE WHEN scalev_leads.is_closed = true THEN true ELSE EXCLUDED.is_closed END,
              matched_order_id = COALESCE(scalev_leads.matched_order_id, EXCLUDED.matched_order_id),
              closed_at = COALESCE(scalev_leads.closed_at, EXCLUDED.closed_at),
              updated_at = now()`,
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
              createdAtStr
            ]
          );

          // 6. Auto-delete older unclosed duplicate leads for this customer within 7 days (Pilihan 3)
          if (customerPhone && customerPhone.length >= 8) {
            try {
              const digits = customerPhone.replace(/[^0-9]/g, '');
              // Preserve notes / follow-up to newest lead if older had them
              await pool.query(
                `UPDATE scalev_leads
                 SET notes = COALESCE(scalev_leads.notes, sl_older.notes),
                     followed_up_at = COALESCE(scalev_leads.followed_up_at, sl_older.followed_up_at),
                     follow_up_step = COALESCE(scalev_leads.follow_up_step, sl_older.follow_up_step),
                     fu1_at = COALESCE(scalev_leads.fu1_at, sl_older.fu1_at),
                     fu2_at = COALESCE(scalev_leads.fu2_at, sl_older.fu2_at),
                     fu3_at = COALESCE(scalev_leads.fu3_at, sl_older.fu3_at)
                 FROM scalev_leads sl_older
                 WHERE scalev_leads.scalev_order_id = $1
                   AND sl_older.scalev_order_id != $1
                   AND (sl_older.customer_phone = $2 OR regexp_replace(sl_older.customer_phone, '[^0-9]', '', 'g') = $3)
                   AND sl_older.is_closed = false
                   AND sl_older.created_at < $4::timestamptz
                   AND sl_older.created_at >= ($4::timestamptz - INTERVAL '7 days')
                   AND (sl_older.notes IS NOT NULL OR sl_older.followed_up_at IS NOT NULL)`,
                [scalevOrderId, customerPhone, digits, createdAtStr]
              );

              // Delete older duplicate unclosed leads
              await pool.query(
                `DELETE FROM scalev_leads
                 WHERE (customer_phone = $1 OR regexp_replace(customer_phone, '[^0-9]', '', 'g') = $2)
                   AND scalev_order_id != $3
                   AND is_closed = false
                   AND created_at < $4::timestamptz
                   AND created_at >= ($4::timestamptz - INTERVAL '7 days')`,
                [customerPhone, digits, scalevOrderId, createdAtStr]
              );
            } catch (dupErr) {
              console.error('[Scalev Webhook Auto-Delete Duplicates Error]:', dupErr);
            }
          }

          await pool.end();

          return new Response(JSON.stringify({
            ok: true,
            order_id: scalevOrderId,
            customer_phone: customerPhone,
            is_closed: isClosed,
            matched_order_id: matchedOrderId
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (err: any) {
          if (pool) try { await pool.end(); } catch (e) {}
          console.error('[Scalev Webhook Error]:', err);
          return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }
  }
});
