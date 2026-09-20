process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';
import { normalizePhone } from '@/lib/scalev.functions';

const DB_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres.saefgyiloalpiqfrglqo:Handayani01@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";

function getPhoneVariants(phone: string): string[] {
  const norm = normalizePhone(phone);
  const zero = norm.startsWith("62") ? "0" + norm.slice(2) : norm;
  return Array.from(new Set([norm, zero, phone]));
}

export const Route = createFileRoute('/api/cron/sync-scalev')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        let pool: pg.Pool | null = null;
        try {
          const authHeader = request.headers.get('authorization');
          if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

          const cfgRes = await pool.query("SELECT value FROM app_settings WHERE key = 'scalev_config'");
          const cfg = cfgRes.rows[0]?.value || {};
          const apiKey = cfg.apiKey || "sk_FfryIIwpcKb06crEkQEyjiC3jppr3pEySHs3QoBvvdjfPxZ7kXm9qa22sBfvX8RK";

          if (!apiKey) {
            await pool.end();
            return new Response(JSON.stringify({ message: "No Scalev API Key configured" }), { status: 200 });
          }

          const apiRes = await fetch('https://api.scalev.com/v3/orders?page_size=50', {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          });

          if (!apiRes.ok) {
            const errText = await apiRes.text().catch(() => "");
            throw new Error(`Scalev API error: ${errText.substring(0, 100)}`);
          }

          const json = await apiRes.json();
          const orders = Array.isArray(json.data) ? json.data : [];
          let syncedCount = 0;

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

            await pool.query(
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
                createdAtStr,
              ]
            );

            syncedCount++;
          }

          await pool.end();
          return new Response(JSON.stringify({ ok: true, syncedCount, totalOrdersInPage: orders.length }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (err: any) {
          if (pool) try { await pool.end(); } catch (e) {}
          console.error('[Scalev Cron Sync Error]:', err);
          return new Response(JSON.stringify({ error: err.message || 'Cron error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }
  }
});
