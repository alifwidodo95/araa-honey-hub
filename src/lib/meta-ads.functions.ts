import { createServerFn } from "@tanstack/react-start";
import pg from "pg";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres.saefgyiloalpiqfrglqo:Handayani01@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";

export interface DailyAdsCprMetric {
  tanggal: string;
  ad_spend: number;
  total_leads: number;
  closed_orders: number;
  verified_orders: number;
  manual_shopee_orders: number;
  cpr_real_closing: number;
  cpl_real: number;
  closing_rate_pct: number;
  avg_kg_per_order: number;
  total_kg: number;
  omzet_kotor: number;
  omzet_murni: number; // Nilai Bersih Riil (net_revenue setelah dipotong admin & ongkir)
  hpp_total: number;
  admin_aggregator: number;
  net_profit_iklan: number;
  real_poas: number;
  is_live_today?: boolean;
}

export interface RealAdsCprSummary {
  total_ad_spend: number;
  total_leads: number;
  total_closing_orders: number;
  total_verified_orders: number;
  total_manual_shopee_orders: number;
  overall_cpr_real: number;
  overall_cpl_real: number;
  overall_closing_rate_pct: number;
  overall_basket_size: number;
  total_volume_kg: number;
  total_omzet_kotor: number;
  total_omzet_murni: number;
  total_hpp: number;
  total_admin_aggregator: number;
  total_net_profit_iklan: number;
  overall_poas: number;
}

export interface RealAdsClosingDetail {
  lead_id: string;
  lead_name: string;
  lead_phone: string;
  lead_created_at: string;
  order_id: string | null;
  customer_name: string;
  customer_phone: string;
  subtotal_gross: number;
  net_revenue: number;
  shipping_fee: number;
  marketplace_fee: number;
  honey_kg_used: number;
  cogs_total: number;
  channel?: string;
  payment_method?: string;
  expedition?: string;
  is_manual_closing: boolean;
  order_created_at: string | null;
}

// 1. Get CPR Real Closing & Pure Ads Economics
export const getRealAdsCprAnalytics = createServerFn({ method: "GET" })
  .validator((data?: { startDate?: string; endDate?: string; limit?: number }) => data || {})
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

      let dateFilterClause = "";
      const params: any[] = [];

      if (data.startDate) {
        params.push(data.startDate);
        dateFilterClause += ` AND (sl.created_at AT TIME ZONE 'Asia/Jakarta')::date >= $${params.length}::date`;
      }
      if (data.endDate) {
        params.push(data.endDate);
        dateFilterClause += ` AND (sl.created_at AT TIME ZONE 'Asia/Jakarta')::date <= $${params.length}::date`;
      }

      const limit = data.limit && data.limit > 0 ? data.limit : 30;

      const mainQuery = `
        WITH matched_leads AS (
          SELECT 
            sl.id AS lead_id,
            (sl.created_at AT TIME ZONE 'Asia/Jakarta')::date AS tanggal_lead,
            sl.customer_phone,
            sl.is_closed,
            sl.gross_revenue AS lead_gross_revenue,
            o.id AS order_id,
            o.subtotal_gross,
            o.net_revenue,
            o.cogs_total,
            o.marketplace_fee,
            o.shipping_fee,
            o.honey_kg_used,
            o.returned,
            ROW_NUMBER() OVER (PARTITION BY o.id ORDER BY sl.created_at ASC) as order_dup_rank
          FROM scalev_leads sl
          LEFT JOIN LATERAL (
            SELECT o.*
            FROM orders o
            WHERE o.returned = false
              AND (
                o.id = sl.matched_order_id
                OR (
                  (o.customer_phone = sl.customer_phone OR o.customer_phone = sl.customer_raw_phone OR '62' || LTRIM(o.customer_phone, '0') = sl.customer_phone)
                  AND o.created_at >= (sl.created_at - INTERVAL '1 hour')
                  AND o.created_at <= (sl.created_at + INTERVAL '5 days')
                )
              )
            ORDER BY 
              CASE WHEN o.id = sl.matched_order_id THEN 0 ELSE 1 END,
              o.created_at ASC
            LIMIT 1
          ) o ON true
          WHERE 1=1 ${dateFilterClause}
        ),
        deduped_lead_orders AS (
          SELECT 
            lead_id,
            tanggal_lead,
            customer_phone,
            is_closed,
            -- Status closing valid (deduplikasi 1 order hanya dihitung 1x closing)
            CASE 
              WHEN order_id IS NOT NULL AND order_dup_rank = 1 THEN true
              WHEN order_id IS NULL AND is_closed = true THEN true
              ELSE false
            END AS is_effective_closing,
            -- Tipe closing
            CASE 
              WHEN order_id IS NOT NULL AND order_dup_rank = 1 THEN 'verified_order'
              WHEN order_id IS NULL AND is_closed = true THEN 'manual_or_shopee'
              ELSE 'unclosed'
            END AS closing_type,
            -- Nilai Bersih Riil (net_revenue)
            CASE 
              WHEN order_id IS NOT NULL AND order_dup_rank = 1 THEN COALESCE(net_revenue, subtotal_gross)
              WHEN order_id IS NULL AND is_closed = true THEN (COALESCE(lead_gross_revenue::numeric, 111000) * 0.90)
              ELSE 0
            END AS effective_net_revenue,
            -- Omzet Kotor
            CASE 
              WHEN order_id IS NOT NULL AND order_dup_rank = 1 THEN subtotal_gross
              WHEN order_id IS NULL AND is_closed = true THEN COALESCE(lead_gross_revenue::numeric, 111000)
              ELSE 0
            END AS effective_gross_revenue,
            -- HPP Total
            CASE 
              WHEN order_id IS NOT NULL AND order_dup_rank = 1 THEN COALESCE(cogs_total, 45140)
              WHEN order_id IS NULL AND is_closed = true THEN 45140
              ELSE 0
            END AS effective_cogs,
            -- Biaya Admin / Marketplace Fee
            CASE 
              WHEN order_id IS NOT NULL AND order_dup_rank = 1 THEN COALESCE(marketplace_fee, 0)
              WHEN order_id IS NULL AND is_closed = true THEN (COALESCE(lead_gross_revenue::numeric, 111000) * 0.10)
              ELSE 0
            END AS effective_admin_fee,
            -- Volume Madu (Kg)
            CASE 
              WHEN order_id IS NOT NULL AND order_dup_rank = 1 THEN COALESCE(honey_kg_used, 1.0)
              WHEN order_id IS NULL AND is_closed = true THEN 1.0
              ELSE 0
            END AS effective_kg
          FROM matched_leads
        ),
        daily_stats AS (
          SELECT 
            tanggal_lead AS tanggal,
            COUNT(lead_id) AS total_leads,
            COUNT(lead_id) FILTER (WHERE is_effective_closing = true) AS closed_orders,
            COUNT(lead_id) FILTER (WHERE closing_type = 'verified_order') AS verified_orders,
            COUNT(lead_id) FILTER (WHERE closing_type = 'manual_or_shopee') AS manual_shopee_orders,
            COALESCE(SUM(effective_gross_revenue) FILTER (WHERE is_effective_closing = true), 0) AS omzet_kotor,
            COALESCE(SUM(effective_net_revenue) FILTER (WHERE is_effective_closing = true), 0) AS omzet_murni,
            COALESCE(SUM(effective_cogs) FILTER (WHERE is_effective_closing = true), 0) AS hpp_total,
            COALESCE(SUM(effective_admin_fee) FILTER (WHERE is_effective_closing = true), 0) AS admin_aggregator,
            COALESCE(SUM(effective_kg) FILTER (WHERE is_effective_closing = true), 0) AS total_kg
          FROM deduped_lead_orders
          GROUP BY tanggal_lead
        ),
        daily_ads AS (
          SELECT 
            occurred_on AS tanggal, 
            amount AS ad_spend
          FROM expenses_business
          WHERE category = 'meta_ads'
        )
        SELECT 
          ds.tanggal,
          COALESCE(da.ad_spend, 0) AS ad_spend,
          ds.total_leads,
          ds.closed_orders,
          ds.verified_orders,
          ds.manual_shopee_orders,
          CASE 
            WHEN ds.closed_orders > 0 AND COALESCE(da.ad_spend, 0) > 0 
            THEN ROUND(da.ad_spend / ds.closed_orders)
            ELSE 0 
          END AS cpr_real_closing,
          CASE 
            WHEN ds.total_leads > 0 AND COALESCE(da.ad_spend, 0) > 0 
            THEN ROUND(da.ad_spend / ds.total_leads)
            ELSE 0 
          END AS cpl_real,
          CASE 
            WHEN ds.total_leads > 0 
            THEN ROUND((ds.closed_orders::numeric / ds.total_leads) * 100, 1)
            ELSE 0 
          END AS closing_rate_pct,
          CASE 
            WHEN ds.closed_orders > 0 
            THEN ROUND((ds.total_kg / ds.closed_orders)::numeric, 2)
            ELSE 0 
          END AS avg_kg_per_order,
          ds.total_kg,
          ds.omzet_kotor,
          ds.omzet_murni,
          ds.hpp_total,
          ds.admin_aggregator,
          (ds.omzet_murni - ds.hpp_total - COALESCE(da.ad_spend, 0)) AS net_profit_iklan,
          CASE 
            WHEN COALESCE(da.ad_spend, 0) > 0 
            THEN ROUND(((ds.omzet_murni - ds.hpp_total) / da.ad_spend)::numeric, 2)
            ELSE 0 
          END AS real_poas
        FROM daily_stats ds
        LEFT JOIN daily_ads da ON ds.tanggal = da.tanggal
        ORDER BY ds.tanggal DESC
        LIMIT ${limit};
      `;

      const result = await pool.query(mainQuery, params);
      const rows: DailyAdsCprMetric[] = result.rows.map((r: any) => {
        const d = new Date(r.tanggal);
        const dateStr = !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : String(r.tanggal);
        return {
          tanggal: dateStr,
          ad_spend: Number(r.ad_spend || 0),
          total_leads: Number(r.total_leads || 0),
          closed_orders: Number(r.closed_orders || 0),
          verified_orders: Number(r.verified_orders || 0),
          manual_shopee_orders: Number(r.manual_shopee_orders || 0),
          cpr_real_closing: Number(r.cpr_real_closing || 0),
          cpl_real: Number(r.cpl_real || 0),
          closing_rate_pct: Number(r.closing_rate_pct || 0),
          avg_kg_per_order: Number(r.avg_kg_per_order || 0),
          total_kg: Number(r.total_kg || 0),
          omzet_kotor: Number(r.omzet_kotor || 0),
          omzet_murni: Number(r.omzet_murni || 0),
          hpp_total: Number(r.hpp_total || 0),
          admin_aggregator: Number(r.admin_aggregator || 0),
          net_profit_iklan: Number(r.net_profit_iklan || 0),
          real_poas: Number(r.real_poas || 0),
        };
      });

      // Check if today's ad spend is missing, optionally fetch live from Meta if configured
      const todayWib = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
      const todayRow = rows.find((r) => r.tanggal === todayWib);

      if (todayRow && todayRow.ad_spend === 0) {
        try {
          const configRes = await pool.query(
            "SELECT value FROM public.app_settings WHERE key = 'meta_ads_config'"
          );
          const metaConfig = configRes.rows[0]?.value;
          if (metaConfig?.token && metaConfig?.defaultAccountId) {
            const fbUrl = `https://graph.facebook.com/v19.0/${metaConfig.defaultAccountId}/insights?time_range=%7B%22since%22%3A%22${todayWib}%22%2C%22until%22%3A%22${todayWib}%22%7D&fields=spend&access_token=${metaConfig.token}`;
            const fbRes = await fetch(fbUrl, { signal: AbortSignal.timeout(4000) }).catch(() => null);
            if (fbRes && fbRes.ok) {
              const fbJson = (await fbRes.json().catch(() => null)) as any;
              const liveSpend = Number(fbJson?.data?.[0]?.spend || 0);
              if (liveSpend > 0) {
                todayRow.ad_spend = liveSpend;
                todayRow.is_live_today = true;
                todayRow.cpl_real =
                  todayRow.total_leads > 0 ? Math.round(liveSpend / todayRow.total_leads) : 0;
                todayRow.cpr_real_closing =
                  todayRow.closed_orders > 0 ? Math.round(liveSpend / todayRow.closed_orders) : 0;
                todayRow.net_profit_iklan =
                  todayRow.omzet_murni - todayRow.hpp_total - liveSpend;
                todayRow.real_poas =
                  liveSpend > 0
                    ? Number(
                        (
                          (todayRow.omzet_murni - todayRow.hpp_total) /
                          liveSpend
                        ).toFixed(2)
                      )
                    : 0;
              }
            }
          }
        } catch (fbErr) {
          // Ignore live spend error, fallback to 0
        }
      }

      // Calculate aggregated summary
      const summary: RealAdsCprSummary = rows.reduce(
        (acc, row) => {
          acc.total_ad_spend += row.ad_spend;
          acc.total_leads += row.total_leads;
          acc.total_closing_orders += row.closed_orders;
          acc.total_verified_orders += row.verified_orders;
          acc.total_manual_shopee_orders += row.manual_shopee_orders;
          acc.total_volume_kg += row.total_kg;
          acc.total_omzet_kotor += row.omzet_kotor;
          acc.total_omzet_murni += row.omzet_murni;
          acc.total_hpp += row.hpp_total;
          acc.total_admin_aggregator += row.admin_aggregator;
          acc.total_net_profit_iklan += row.net_profit_iklan;
          return acc;
        },
        {
          total_ad_spend: 0,
          total_leads: 0,
          total_closing_orders: 0,
          total_verified_orders: 0,
          total_manual_shopee_orders: 0,
          overall_cpr_real: 0,
          overall_cpl_real: 0,
          overall_closing_rate_pct: 0,
          overall_basket_size: 0,
          total_volume_kg: 0,
          total_omzet_kotor: 0,
          total_omzet_murni: 0,
          total_hpp: 0,
          total_admin_aggregator: 0,
          total_net_profit_iklan: 0,
          overall_poas: 0,
        }
      );

      if (summary.total_closing_orders > 0 && summary.total_ad_spend > 0) {
        summary.overall_cpr_real = Math.round(summary.total_ad_spend / summary.total_closing_orders);
      }
      if (summary.total_leads > 0 && summary.total_ad_spend > 0) {
        summary.overall_cpl_real = Math.round(summary.total_ad_spend / summary.total_leads);
        summary.overall_closing_rate_pct = Number(
          ((summary.total_closing_orders / summary.total_leads) * 100).toFixed(1)
        );
      }
      if (summary.total_closing_orders > 0) {
        summary.overall_basket_size = Number(
          (summary.total_volume_kg / summary.total_closing_orders).toFixed(2)
        );
      }
      if (summary.total_ad_spend > 0) {
        const grossProfit = summary.total_omzet_murni - summary.total_hpp;
        summary.overall_poas = Number((grossProfit / summary.total_ad_spend).toFixed(2));
      }

      await pool.end();
      return {
        daily: rows,
        summary,
      };
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      console.error("[getRealAdsCprAnalytics Error]:", err);
      throw new Error(err?.message || "Gagal memuat analitik CPR real iklan");
    }
  });

// 2. Get detailed list of customers who closed from ads on a specific date
export const getRealAdsClosingDetails = createServerFn({ method: "GET" })
  .validator((data: { date: string }) => data)
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

      const query = `
        WITH matched_leads AS (
          SELECT 
            sl.id AS lead_id,
            sl.customer_name AS lead_name,
            sl.customer_phone AS lead_phone,
            sl.created_at AS lead_created_at,
            sl.is_closed,
            sl.gross_revenue AS lead_gross_revenue,
            o.id AS order_id,
            o.customer_name,
            o.customer_phone,
            o.subtotal_gross,
            o.net_revenue,
            o.shipping_fee,
            o.marketplace_fee,
            o.honey_kg_used,
            o.cogs_total,
            o.channel,
            o.payment_method,
            o.expedition,
            o.created_at AS order_created_at,
            ROW_NUMBER() OVER (PARTITION BY o.id ORDER BY sl.created_at ASC) as order_dup_rank
          FROM scalev_leads sl
          LEFT JOIN LATERAL (
            SELECT o.*
            FROM orders o
            WHERE o.returned = false
              AND (
                o.id = sl.matched_order_id
                OR (
                  (o.customer_phone = sl.customer_phone OR o.customer_phone = sl.customer_raw_phone OR '62' || LTRIM(o.customer_phone, '0') = sl.customer_phone)
                  AND o.created_at >= (sl.created_at - INTERVAL '1 hour')
                  AND o.created_at <= (sl.created_at + INTERVAL '5 days')
                )
              )
            ORDER BY 
              CASE WHEN o.id = sl.matched_order_id THEN 0 ELSE 1 END,
              o.created_at ASC
            LIMIT 1
          ) o ON true
          WHERE (sl.created_at AT TIME ZONE 'Asia/Jakarta')::date = $1::date
        )
        SELECT 
          lead_id,
          lead_name,
          lead_phone,
          lead_created_at,
          order_id,
          COALESCE(customer_name, lead_name) as customer_name,
          COALESCE(customer_phone, lead_phone) as customer_phone,
          CASE 
            WHEN order_id IS NOT NULL AND order_dup_rank = 1 THEN subtotal_gross
            ELSE COALESCE(lead_gross_revenue::numeric, 111000)
          END AS subtotal_gross,
          CASE 
            WHEN order_id IS NOT NULL AND order_dup_rank = 1 THEN COALESCE(net_revenue, subtotal_gross)
            ELSE (COALESCE(lead_gross_revenue::numeric, 111000) * 0.90)
          END AS net_revenue,
          COALESCE(shipping_fee, 0) as shipping_fee,
          COALESCE(marketplace_fee, 0) as marketplace_fee,
          CASE 
            WHEN order_id IS NOT NULL AND order_dup_rank = 1 THEN COALESCE(honey_kg_used, 1.0)
            ELSE 1.0
          END AS honey_kg_used,
          CASE 
            WHEN order_id IS NOT NULL AND order_dup_rank = 1 THEN COALESCE(cogs_total, 45140)
            ELSE 45140
          END AS cogs_total,
          channel,
          payment_method,
          expedition,
          CASE 
            WHEN order_id IS NULL AND is_closed = true THEN true
            ELSE false
          END AS is_manual_closing,
          order_created_at
        FROM matched_leads
        WHERE (order_id IS NOT NULL AND order_dup_rank = 1) OR (order_id IS NULL AND is_closed = true)
        ORDER BY COALESCE(order_created_at, lead_created_at) DESC;
      `;

      const res = await pool.query(query, [data.date]);
      await pool.end();

      return res.rows.map((r: any) => ({
        lead_id: r.lead_id,
        lead_name: r.lead_name || "Pelanggan Scalev",
        lead_phone: r.lead_phone,
        lead_created_at: r.lead_created_at,
        order_id: r.order_id,
        customer_name: r.customer_name,
        customer_phone: r.customer_phone,
        subtotal_gross: Number(r.subtotal_gross || 0),
        net_revenue: Number(r.net_revenue || 0),
        shipping_fee: Number(r.shipping_fee || 0),
        marketplace_fee: Number(r.marketplace_fee || 0),
        honey_kg_used: Number(r.honey_kg_used || 0),
        cogs_total: Number(r.cogs_total || 0),
        channel: r.channel || null,
        payment_method: r.payment_method || null,
        expedition: r.expedition || null,
        is_manual_closing: r.is_manual_closing === true,
        order_created_at: r.order_created_at,
      })) as RealAdsClosingDetail[];
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      console.error("[getRealAdsClosingDetails Error]:", err);
      throw new Error(err?.message || "Gagal memuat detail closing iklan");
    }
  });
