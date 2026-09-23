import { createServerFn } from "@tanstack/react-start";
import pg from "pg";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres.saefgyiloalpiqfrglqo:Handayani01@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";

export interface DailyOrderMatrixRow {
  tanggal: string;
  total_orders: number;
  total_net_revenue: number;
  total_cogs: number;
  total_profit: number;

  // 1. Pelanggan Baru
  baru_total_orders: number;
  baru_ads_orders: number;
  baru_organic_orders: number;
  baru_net_revenue: number;

  // 2. Repeat Order
  repeat_total_orders: number;
  repeat_ads_orders: number;
  repeat_ads_net_revenue: number;
  repeat_crm_orders: number; // Tanpa Iklan
  repeat_crm_net_revenue: number;

  // 3. Shopee
  shopee_orders: number;
  shopee_net_revenue: number;

  // 4. TikTok
  tiktok_orders: number;
  tiktok_net_revenue: number;

  // 5. Lainnya / Reseller
  other_orders: number;
  other_net_revenue: number;

  // Financial & Efficiency Comparison
  ad_spend: number;
  cpr_real_iklan: number;
  estimated_ad_savings: number; // Hemat biaya iklan karena CRM
  repeat_crm_share_pct: number; // % repeat tanpa iklan vs repeat iklan
}

export interface OrderMatrixSummary {
  total_orders: number;
  total_net_revenue: number;
  total_ad_spend: number;

  total_baru_orders: number;
  total_baru_net_revenue: number;

  total_repeat_crm_orders: number;
  total_repeat_crm_net_revenue: number;

  total_repeat_ads_orders: number;
  total_repeat_ads_net_revenue: number;

  total_shopee_orders: number;
  total_shopee_net_revenue: number;

  total_tiktok_orders: number;
  total_tiktok_net_revenue: number;

  total_other_orders: number;
  total_other_net_revenue: number;

  total_ad_savings_by_crm: number;
  overall_repeat_crm_share_pct: number;
  avg_daily_orders: number;
}

export interface OrderMatrixDetailItem {
  id: string;
  order_date: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  clean_phone: string;
  channel: string;
  customer_seq: number;
  category: "pelanggan_baru" | "repeat_ads" | "repeat_crm" | "shopee" | "tiktok" | "lainnya";
  category_label: string;
  subtotal_gross: number;
  net_revenue: number;
  shipping_fee: number;
  marketplace_fee: number;
  cogs_total: number;
  payment_method?: string;
  expedition?: string;
  has_scalev_lead: boolean;
}

// 1. Get Daily Matrix Data
export const getDailyOrderMatrix = createServerFn({ method: "GET" })
  .validator((data?: { startDate?: string; endDate?: string; limit?: number }) => data || {})
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

      let dateFilterClause = "";
      const params: any[] = [];

      if (data.startDate) {
        params.push(data.startDate);
        dateFilterClause += ` AND (o.created_at AT TIME ZONE 'Asia/Jakarta')::date >= $${params.length}::date`;
      }
      if (data.endDate) {
        params.push(data.endDate);
        dateFilterClause += ` AND (o.created_at AT TIME ZONE 'Asia/Jakarta')::date <= $${params.length}::date`;
      }

      const limit = data.limit && data.limit > 0 ? data.limit : 90;

      const mainQuery = `
        WITH normalized_orders AS (
          SELECT 
            o.id,
            o.created_at,
            (o.created_at AT TIME ZONE 'Asia/Jakarta')::date as order_date,
            o.channel,
            COALESCE(o.net_revenue, o.subtotal_gross, 0) as net_revenue,
            COALESCE(o.cogs_total, 0) as cogs_total,
            o.returned,
            CASE 
              WHEN o.customer_phone IS NOT NULL AND LENGTH(REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g')) >= 8 THEN
                CASE 
                  WHEN REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g') LIKE '0%' 
                    THEN '62' || SUBSTRING(REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g') FROM 2)
                  WHEN REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g') LIKE '62%' 
                    THEN REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g')
                  ELSE '62' || REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g')
                END
              ELSE NULL
            END as clean_phone
          FROM orders o
          WHERE o.returned = false
        ),
        orders_with_seq AS (
          SELECT 
            *,
            ROW_NUMBER() OVER (
              PARTITION BY clean_phone 
              ORDER BY created_at ASC
            ) as customer_seq
          FROM normalized_orders
        ),
        orders_classified AS (
          SELECT 
            o.*,
            CASE 
              WHEN o.channel = 'shopee' THEN 'shopee'
              WHEN o.channel = 'tiktok' THEN 'tiktok'
              WHEN o.clean_phone IS NOT NULL AND o.customer_seq = 1 THEN 'pelanggan_baru'
              WHEN o.clean_phone IS NOT NULL AND o.customer_seq > 1 THEN 'repeat_order'
              ELSE 'lainnya'
            END as primary_category,
            EXISTS (
              SELECT 1 
              FROM scalev_leads sl 
              WHERE sl.customer_phone = o.clean_phone 
                OR sl.matched_order_id = o.id
                OR (
                  sl.customer_phone IS NOT NULL 
                  AND o.clean_phone IS NOT NULL
                  AND (sl.customer_phone = o.clean_phone OR '62' || LTRIM(sl.customer_phone, '0') = o.clean_phone)
                  AND sl.created_at >= (o.created_at - INTERVAL '7 days')
                  AND sl.created_at <= (o.created_at + INTERVAL '1 hour')
                )
            ) as has_scalev_lead
          FROM orders_with_seq o
          WHERE 1=1 ${dateFilterClause}
        ),
        daily_order_stats AS (
          SELECT 
            order_date as tanggal,
            count(*) as total_orders,
            sum(net_revenue) as total_net_revenue,
            sum(cogs_total) as total_cogs,
            (sum(net_revenue) - sum(cogs_total)) as total_profit,

            -- Pelanggan Baru
            count(CASE WHEN primary_category = 'pelanggan_baru' THEN 1 END) as baru_total_orders,
            count(CASE WHEN primary_category = 'pelanggan_baru' AND has_scalev_lead THEN 1 END) as baru_ads_orders,
            count(CASE WHEN primary_category = 'pelanggan_baru' AND NOT has_scalev_lead THEN 1 END) as baru_organic_orders,
            sum(CASE WHEN primary_category = 'pelanggan_baru' THEN net_revenue ELSE 0 END) as baru_net_revenue,

            -- Repeat Order Dari Iklan
            count(CASE WHEN primary_category = 'repeat_order' AND has_scalev_lead THEN 1 END) as repeat_ads_orders,
            sum(CASE WHEN primary_category = 'repeat_order' AND has_scalev_lead THEN net_revenue ELSE 0 END) as repeat_ads_net_revenue,

            -- Repeat Order Tanpa Iklan (CRM / WA Langsung)
            count(CASE WHEN primary_category = 'repeat_order' AND NOT has_scalev_lead THEN 1 END) as repeat_crm_orders,
            sum(CASE WHEN primary_category = 'repeat_order' AND NOT has_scalev_lead THEN net_revenue ELSE 0 END) as repeat_crm_net_revenue,

            -- Shopee
            count(CASE WHEN primary_category = 'shopee' THEN 1 END) as shopee_orders,
            sum(CASE WHEN primary_category = 'shopee' THEN net_revenue ELSE 0 END) as shopee_net_revenue,

            -- TikTok
            count(CASE WHEN primary_category = 'tiktok' THEN 1 END) as tiktok_orders,
            sum(CASE WHEN primary_category = 'tiktok' THEN net_revenue ELSE 0 END) as tiktok_net_revenue,

            -- Lainnya / Reseller
            count(CASE WHEN primary_category = 'lainnya' THEN 1 END) as other_orders,
            sum(CASE WHEN primary_category = 'lainnya' THEN net_revenue ELSE 0 END) as other_net_revenue
          FROM orders_classified
          GROUP BY order_date
        ),
        daily_ads AS (
          SELECT 
            occurred_on AS tanggal, 
            SUM(amount) AS ad_spend
          FROM expenses_business
          WHERE category = 'meta_ads'
          GROUP BY occurred_on
        )
        SELECT 
          dos.tanggal,
          dos.total_orders,
          dos.total_net_revenue,
          dos.total_cogs,
          dos.total_profit,
          dos.baru_total_orders,
          dos.baru_ads_orders,
          dos.baru_organic_orders,
          dos.baru_net_revenue,
          (dos.repeat_ads_orders + dos.repeat_crm_orders) as repeat_total_orders,
          dos.repeat_ads_orders,
          dos.repeat_ads_net_revenue,
          dos.repeat_crm_orders,
          dos.repeat_crm_net_revenue,
          dos.shopee_orders,
          dos.shopee_net_revenue,
          dos.tiktok_orders,
          dos.tiktok_net_revenue,
          dos.other_orders,
          dos.other_net_revenue,
          COALESCE(da.ad_spend, 0) as ad_spend,
          CASE 
            WHEN (dos.baru_ads_orders + dos.repeat_ads_orders) > 0 AND COALESCE(da.ad_spend, 0) > 0
            THEN ROUND(da.ad_spend / (dos.baru_ads_orders + dos.repeat_ads_orders))
            ELSE 0
          END as cpr_real_iklan,
          CASE 
            WHEN (dos.baru_ads_orders + dos.repeat_ads_orders) > 0 AND COALESCE(da.ad_spend, 0) > 0
            THEN ROUND(dos.repeat_crm_orders * (da.ad_spend / (dos.baru_ads_orders + dos.repeat_ads_orders)))
            ELSE 0
          END as estimated_ad_savings,
          CASE 
            WHEN (dos.repeat_ads_orders + dos.repeat_crm_orders) > 0
            THEN ROUND((dos.repeat_crm_orders::numeric / (dos.repeat_ads_orders + dos.repeat_crm_orders)) * 100, 1)
            ELSE 0
          END as repeat_crm_share_pct
        FROM daily_order_stats dos
        LEFT JOIN daily_ads da ON dos.tanggal = da.tanggal
        ORDER BY dos.tanggal DESC
        LIMIT ${limit};
      `;

      const result = await pool.query(mainQuery, params);

      const daily: DailyOrderMatrixRow[] = result.rows.map((r: any) => {
        const d = new Date(r.tanggal);
        const dateStr = !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : String(r.tanggal);
        return {
          tanggal: dateStr,
          total_orders: Number(r.total_orders || 0),
          total_net_revenue: Number(r.total_net_revenue || 0),
          total_cogs: Number(r.total_cogs || 0),
          total_profit: Number(r.total_profit || 0),
          baru_total_orders: Number(r.baru_total_orders || 0),
          baru_ads_orders: Number(r.baru_ads_orders || 0),
          baru_organic_orders: Number(r.baru_organic_orders || 0),
          baru_net_revenue: Number(r.baru_net_revenue || 0),
          repeat_total_orders: Number(r.repeat_total_orders || 0),
          repeat_ads_orders: Number(r.repeat_ads_orders || 0),
          repeat_ads_net_revenue: Number(r.repeat_ads_net_revenue || 0),
          repeat_crm_orders: Number(r.repeat_crm_orders || 0),
          repeat_crm_net_revenue: Number(r.repeat_crm_net_revenue || 0),
          shopee_orders: Number(r.shopee_orders || 0),
          shopee_net_revenue: Number(r.shopee_net_revenue || 0),
          tiktok_orders: Number(r.tiktok_orders || 0),
          tiktok_net_revenue: Number(r.tiktok_net_revenue || 0),
          other_orders: Number(r.other_orders || 0),
          other_net_revenue: Number(r.other_net_revenue || 0),
          ad_spend: Number(r.ad_spend || 0),
          cpr_real_iklan: Number(r.cpr_real_iklan || 0),
          estimated_ad_savings: Number(r.estimated_ad_savings || 0),
          repeat_crm_share_pct: Number(r.repeat_crm_share_pct || 0),
        };
      });

      // Aggregated Summary for the selected period
      const total_orders = daily.reduce((acc, row) => acc + row.total_orders, 0);
      const total_net_revenue = daily.reduce((acc, row) => acc + row.total_net_revenue, 0);
      const total_ad_spend = daily.reduce((acc, row) => acc + row.ad_spend, 0);
      const total_baru_orders = daily.reduce((acc, row) => acc + row.baru_total_orders, 0);
      const total_baru_net_revenue = daily.reduce((acc, row) => acc + row.baru_net_revenue, 0);
      const total_repeat_crm_orders = daily.reduce((acc, row) => acc + row.repeat_crm_orders, 0);
      const total_repeat_crm_net_revenue = daily.reduce((acc, row) => acc + row.repeat_crm_net_revenue, 0);
      const total_repeat_ads_orders = daily.reduce((acc, row) => acc + row.repeat_ads_orders, 0);
      const total_repeat_ads_net_revenue = daily.reduce((acc, row) => acc + row.repeat_ads_net_revenue, 0);
      const total_shopee_orders = daily.reduce((acc, row) => acc + row.shopee_orders, 0);
      const total_shopee_net_revenue = daily.reduce((acc, row) => acc + row.shopee_net_revenue, 0);
      const total_tiktok_orders = daily.reduce((acc, row) => acc + row.tiktok_orders, 0);
      const total_tiktok_net_revenue = daily.reduce((acc, row) => acc + row.tiktok_net_revenue, 0);
      const total_other_orders = daily.reduce((acc, row) => acc + row.other_orders, 0);
      const total_other_net_revenue = daily.reduce((acc, row) => acc + row.other_net_revenue, 0);
      const total_ad_savings_by_crm = daily.reduce((acc, row) => acc + row.estimated_ad_savings, 0);

      const total_repeat_all = total_repeat_crm_orders + total_repeat_ads_orders;
      const overall_repeat_crm_share_pct =
        total_repeat_all > 0 ? Number(((total_repeat_crm_orders / total_repeat_all) * 100).toFixed(1)) : 0;
      const avg_daily_orders = daily.length > 0 ? Number((total_orders / daily.length).toFixed(1)) : 0;

      const summary: OrderMatrixSummary = {
        total_orders,
        total_net_revenue,
        total_ad_spend,
        total_baru_orders,
        total_baru_net_revenue,
        total_repeat_crm_orders,
        total_repeat_crm_net_revenue,
        total_repeat_ads_orders,
        total_repeat_ads_net_revenue,
        total_shopee_orders,
        total_shopee_net_revenue,
        total_tiktok_orders,
        total_tiktok_net_revenue,
        total_other_orders,
        total_other_net_revenue,
        total_ad_savings_by_crm,
        overall_repeat_crm_share_pct,
        avg_daily_orders,
      };

      return { daily, summary };
    } catch (err: any) {
      console.error("Error in getDailyOrderMatrix:", err);
      throw new Error("Gagal mengambil matriks order harian: " + err.message);
    } finally {
      if (pool) await pool.end();
    }
  });

// 2. Get Detail Orders for a Specific Date & Filter
export const getDailyOrderMatrixDetails = createServerFn({ method: "GET" })
  .validator((data?: { date: string; category?: string }) => data || { date: "" })
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      if (!data.date) return [];
      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

      const query = `
        WITH normalized_orders AS (
          SELECT 
            o.id,
            o.customer_name,
            o.customer_phone,
            o.channel,
            o.payment_method,
            o.expedition,
            o.subtotal_gross,
            COALESCE(o.net_revenue, o.subtotal_gross, 0) as net_revenue,
            COALESCE(o.cogs_total, 0) as cogs_total,
            COALESCE(o.shipping_fee, 0) as shipping_fee,
            COALESCE(o.marketplace_fee, 0) as marketplace_fee,
            o.created_at,
            (o.created_at AT TIME ZONE 'Asia/Jakarta')::date as order_date,
            o.returned,
            CASE 
              WHEN o.customer_phone IS NOT NULL AND LENGTH(REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g')) >= 8 THEN
                CASE 
                  WHEN REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g') LIKE '0%' 
                    THEN '62' || SUBSTRING(REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g') FROM 2)
                  WHEN REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g') LIKE '62%' 
                    THEN REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g')
                  ELSE '62' || REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g')
                END
              ELSE NULL
            END as clean_phone
          FROM orders o
          WHERE o.returned = false
        ),
        orders_with_seq AS (
          SELECT 
            *,
            ROW_NUMBER() OVER (
              PARTITION BY clean_phone 
              ORDER BY created_at ASC
            ) as customer_seq
          FROM normalized_orders
        ),
        orders_classified AS (
          SELECT 
            o.*,
            CASE 
              WHEN o.channel = 'shopee' THEN 'shopee'
              WHEN o.channel = 'tiktok' THEN 'tiktok'
              WHEN o.clean_phone IS NOT NULL AND o.customer_seq = 1 THEN 'pelanggan_baru'
              WHEN o.clean_phone IS NOT NULL AND o.customer_seq > 1 THEN 'repeat_order'
              ELSE 'lainnya'
            END as primary_category,
            EXISTS (
              SELECT 1 
              FROM scalev_leads sl 
              WHERE sl.customer_phone = o.clean_phone 
                OR sl.matched_order_id = o.id
                OR (
                  sl.customer_phone IS NOT NULL 
                  AND o.clean_phone IS NOT NULL
                  AND (sl.customer_phone = o.clean_phone OR '62' || LTRIM(sl.customer_phone, '0') = o.clean_phone)
                  AND sl.created_at >= (o.created_at - INTERVAL '7 days')
                  AND sl.created_at <= (o.created_at + INTERVAL '1 hour')
                )
            ) as has_scalev_lead
          FROM orders_with_seq o
          WHERE o.order_date = $1::date
        )
        SELECT 
          id,
          order_date,
          created_at,
          customer_name,
          customer_phone,
          clean_phone,
          channel,
          customer_seq,
          CASE 
            WHEN primary_category = 'shopee' THEN 'shopee'
            WHEN primary_category = 'tiktok' THEN 'tiktok'
            WHEN primary_category = 'pelanggan_baru' THEN 'pelanggan_baru'
            WHEN primary_category = 'repeat_order' AND has_scalev_lead THEN 'repeat_ads'
            WHEN primary_category = 'repeat_order' AND NOT has_scalev_lead THEN 'repeat_crm'
            ELSE 'lainnya'
          END as category,
          CASE 
            WHEN primary_category = 'shopee' THEN 'Shopee'
            WHEN primary_category = 'tiktok' THEN 'TikTok Shop'
            WHEN primary_category = 'pelanggan_baru' AND has_scalev_lead THEN 'Pelanggan Baru (Iklan)'
            WHEN primary_category = 'pelanggan_baru' AND NOT has_scalev_lead THEN 'Pelanggan Baru (Organik/WA)'
            WHEN primary_category = 'repeat_order' AND has_scalev_lead THEN 'Repeat Order (Dari Iklan)'
            WHEN primary_category = 'repeat_order' AND NOT has_scalev_lead THEN 'Repeat Order (CRM / Tanpa Iklan)'
            ELSE 'Reseller / Offline'
          END as category_label,
          subtotal_gross,
          net_revenue,
          shipping_fee,
          marketplace_fee,
          cogs_total,
          payment_method,
          expedition,
          has_scalev_lead
        FROM orders_classified
        ORDER BY created_at DESC;
      `;

      const result = await pool.query(query, [data.date]);

      const items: OrderMatrixDetailItem[] = result.rows.map((r: any) => ({
        id: String(r.id),
        order_date: r.order_date ? new Date(r.order_date).toISOString().slice(0, 10) : "",
        created_at: r.created_at ? new Date(r.created_at).toISOString() : "",
        customer_name: r.customer_name || "Pelanggan Anonim",
        customer_phone: r.customer_phone || "-",
        clean_phone: r.clean_phone || "-",
        channel: r.channel || "-",
        customer_seq: Number(r.customer_seq || 1),
        category: r.category,
        category_label: r.category_label,
        subtotal_gross: Number(r.subtotal_gross || 0),
        net_revenue: Number(r.net_revenue || 0),
        shipping_fee: Number(r.shipping_fee || 0),
        marketplace_fee: Number(r.marketplace_fee || 0),
        cogs_total: Number(r.cogs_total || 0),
        payment_method: r.payment_method || "-",
        expedition: r.expedition || "-",
        has_scalev_lead: Boolean(r.has_scalev_lead),
      }));

      if (data.category && data.category !== "all") {
        return items.filter((it) => it.category === data.category);
      }

      return items;
    } catch (err: any) {
      console.error("Error in getDailyOrderMatrixDetails:", err);
      return [];
    } finally {
      if (pool) await pool.end();
    }
  });
