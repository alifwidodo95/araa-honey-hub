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
  cpr_real_closing: number;
  cpl_real: number;
  closing_rate_pct: number;
  avg_kg_per_order: number;
  total_kg: number;
  omzet_murni: number;
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
  overall_cpr_real: number;
  overall_cpl_real: number;
  overall_closing_rate_pct: number;
  overall_basket_size: number;
  total_volume_kg: number;
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
  order_id: string;
  customer_name: string;
  customer_phone: string;
  subtotal_gross: number;
  honey_kg_used: number;
  cogs_total: number;
  order_created_at: string;
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
        WITH lead_orders AS (
          SELECT 
            sl.id AS lead_id,
            (sl.created_at AT TIME ZONE 'Asia/Jakarta')::date AS tanggal_lead,
            sl.customer_phone,
            o.id AS order_id,
            o.subtotal_gross,
            o.cogs_total,
            o.marketplace_fee,
            o.shipping_fee,
            o.honey_kg_used,
            o.amount_received
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
        daily_stats AS (
          SELECT 
            tanggal_lead AS tanggal,
            COUNT(lead_id) AS total_leads,
            COUNT(order_id) AS closed_orders,
            COALESCE(SUM(subtotal_gross), 0) AS omzet_murni,
            COALESCE(SUM(cogs_total), 0) AS hpp_total,
            COALESCE(SUM(marketplace_fee), 0) AS admin_aggregator,
            COALESCE(SUM(shipping_fee), 0) AS ongkir_total,
            COALESCE(SUM(honey_kg_used), 0) AS total_kg,
            COALESCE(SUM(amount_received), 0) AS total_dana_cair
          FROM lead_orders
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
          ds.omzet_murni,
          ds.hpp_total,
          ds.admin_aggregator,
          (ds.omzet_murni - ds.hpp_total - ds.admin_aggregator - COALESCE(da.ad_spend, 0)) AS net_profit_iklan,
          CASE 
            WHEN COALESCE(da.ad_spend, 0) > 0 
            THEN ROUND(((ds.omzet_murni - ds.hpp_total - ds.admin_aggregator) / da.ad_spend)::numeric, 2)
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
        // Format ISO date YYYY-MM-DD
        const dateStr = !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : String(r.tanggal);
        return {
          tanggal: dateStr,
          ad_spend: Number(r.ad_spend || 0),
          total_leads: Number(r.total_leads || 0),
          closed_orders: Number(r.closed_orders || 0),
          cpr_real_closing: Number(r.cpr_real_closing || 0),
          cpl_real: Number(r.cpl_real || 0),
          closing_rate_pct: Number(r.closing_rate_pct || 0),
          avg_kg_per_order: Number(r.avg_kg_per_order || 0),
          total_kg: Number(r.total_kg || 0),
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
                  todayRow.omzet_murni - todayRow.hpp_total - todayRow.admin_aggregator - liveSpend;
                todayRow.real_poas =
                  liveSpend > 0
                    ? Number(
                        (
                          (todayRow.omzet_murni - todayRow.hpp_total - todayRow.admin_aggregator) /
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
          acc.total_volume_kg += row.total_kg;
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
          overall_cpr_real: 0,
          overall_cpl_real: 0,
          overall_closing_rate_pct: 0,
          overall_basket_size: 0,
          total_volume_kg: 0,
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
        const grossProfit =
          summary.total_omzet_murni - summary.total_hpp - summary.total_admin_aggregator;
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
        SELECT 
          sl.id AS lead_id,
          sl.customer_name AS lead_name,
          sl.customer_phone AS lead_phone,
          sl.created_at AS lead_created_at,
          o.id AS order_id,
          o.customer_name,
          o.customer_phone,
          o.subtotal_gross,
          o.honey_kg_used,
          o.cogs_total,
          o.created_at AS order_created_at
        FROM scalev_leads sl
        JOIN LATERAL (
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
        ORDER BY o.created_at DESC;
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
        honey_kg_used: Number(r.honey_kg_used || 0),
        cogs_total: Number(r.cogs_total || 0),
        order_created_at: r.order_created_at,
      })) as RealAdsClosingDetail[];
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      console.error("[getRealAdsClosingDetails Error]:", err);
      throw new Error(err?.message || "Gagal memuat detail closing iklan");
    }
  });
