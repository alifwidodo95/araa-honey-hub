import { createServerFn } from "@tanstack/react-start";
import pg from "pg";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres.saefgyiloalpiqfrglqo:Handayani01@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";

export interface ChannelStat {
  key: string;
  label: string;
  subLabel: string;
  color: string;
  darkColor: string;
  icon: string;
  total_paket: number;
  omzet: number;
  cogs: number;
  laba_kotor: number;
  margin: number;
  aov: number;
  percent_paket: number;
  percent_omzet: number;
  percent_laba: number;
}

export interface ChannelBreakdownResponse {
  period: "today" | "yesterday" | "7days" | "month";
  startDate: string;
  endDate: string;
  total_paket: number;
  total_omzet: number;
  total_cogs: number;
  total_laba_kotor: number;
  overall_margin: number;
  channels: ChannelStat[];
}

const CHANNEL_METADATA: Record<
  string,
  { label: string; subLabel: string; color: string; darkColor: string; icon: string }
> = {
  meta_ads: {
    label: "Meta Ads (Scalev)",
    subLabel: "Iklan Berbayar",
    color: "#3b82f6", // Blue
    darkColor: "#1d4ed8",
    icon: "🎯",
  },
  wa_direct: {
    label: "WA Direct / Organik",
    subLabel: "Chat Langsung & Repeat",
    color: "#06b6d4", // Cyan
    darkColor: "#0e7490",
    icon: "💬",
  },
  crm_waba: {
    label: "CRM WABA",
    subLabel: "Broadcast / Reaktivasi",
    color: "#10b981", // Emerald
    darkColor: "#047857",
    icon: "📱",
  },
  reseller: {
    label: "Reseller",
    subLabel: "Agen & Grosir",
    color: "#8b5cf6", // Violet
    darkColor: "#6d28d9",
    icon: "🤝",
  },
  tiktok: {
    label: "TikTok Shop",
    subLabel: "Marketplace",
    color: "#64748b", // Slate
    darkColor: "#334155",
    icon: "🎵",
  },
  shopee: {
    label: "Shopee",
    subLabel: "Marketplace",
    color: "#f97316", // Orange
    darkColor: "#c2410c",
    icon: "🟠",
  },
  offline: {
    label: "Offline / Toko",
    subLabel: "Penjualan Langsung",
    color: "#eab308", // Amber
    darkColor: "#a16207",
    icon: "🏪",
  },
  other: {
    label: "Lainnya",
    subLabel: "Saluran Lain",
    color: "#94a3b8",
    darkColor: "#475569",
    icon: "📦",
  },
};

export interface ChannelOrderItemDetail {
  qty: number;
  honey_type: string;
  unit_price: number;
  size_name: string;
}

export interface ChannelOrderRow {
  id: string;
  customer_name: string;
  customer_phone: string;
  shipping_address?: string;
  tracking_number?: string;
  expedition?: string;
  payment_method?: string;
  subtotal_gross: number;
  amount_received: number;
  net_revenue: number;
  cogs: number;
  created_at: string;
  cat_key: string;
  items: ChannelOrderItemDetail[];
}

export interface ChannelOrderListResponse {
  period: string;
  channelKey: string;
  channelLabel: string;
  channelIcon: string;
  channelColor: string;
  totalOrders: number;
  totalOmzet: number;
  orders: ChannelOrderRow[];
}

export const getSalesChannelBreakdown = createServerFn({ method: "POST" })
  .validator((d: { period?: "today" | "yesterday" | "7days" | "month" }) => d)
  .handler(async ({ data }): Promise<ChannelBreakdownResponse> => {
    let pool: pg.Pool | null = null;
    const period = data?.period || "today";

    try {
      pool = new pg.Pool({
        connectionString: DB_URL,
        ssl: { rejectUnauthorized: false },
      });

      // Calculate date boundaries in WIB (UTC+7)
      const nowWib = new Date(Date.now() + 7 * 3600 * 1000);
      const year = nowWib.getUTCFullYear();
      const month = String(nowWib.getUTCMonth() + 1).padStart(2, "0");
      const day = String(nowWib.getUTCDate()).padStart(2, "0");
      const todayStr = `${year}-${month}-${day}`;

      let startIso = `${todayStr} 00:00:00+07`;
      let endIso = `${todayStr} 23:59:59.999+07`;

      if (period === "yesterday") {
        const yesterdayWib = new Date(nowWib.getTime() - 24 * 3600 * 1000);
        const yYear = yesterdayWib.getUTCFullYear();
        const yMonth = String(yesterdayWib.getUTCMonth() + 1).padStart(2, "0");
        const yDay = String(yesterdayWib.getUTCDate()).padStart(2, "0");
        const yStr = `${yYear}-${yMonth}-${yDay}`;
        startIso = `${yStr} 00:00:00+07`;
        endIso = `${yStr} 23:59:59.999+07`;
      } else if (period === "7days") {
        const past7Wib = new Date(nowWib.getTime() - 6 * 24 * 3600 * 1000);
        const pYear = past7Wib.getUTCFullYear();
        const pMonth = String(past7Wib.getUTCMonth() + 1).padStart(2, "0");
        const pDay = String(past7Wib.getUTCDate()).padStart(2, "0");
        startIso = `${pYear}-${pMonth}-${pDay} 00:00:00+07`;
        endIso = `${todayStr} 23:59:59.999+07`;
      } else if (period === "month") {
        startIso = `${year}-${month}-01 00:00:00+07`;
        endIso = `${todayStr} 23:59:59.999+07`;
      }

      const query = `
        WITH period_orders AS (
          SELECT 
            o.id,
            o.channel,
            o.customer_name,
            o.customer_phone,
            COALESCE(o.net_revenue, o.amount_received, o.subtotal_gross) as net_revenue,
            COALESCE(o.cogs_total, 0) as cogs,
            o.created_at,
            CASE 
              WHEN REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g') LIKE '0%' 
                THEN '62' || SUBSTRING(REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g') FROM 2)
              WHEN REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g') LIKE '8%' 
                THEN '62' || REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g')
              ELSE REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g')
            END as norm_phone
          FROM orders o
          WHERE o.created_at >= $1 
            AND o.created_at <= $2
            AND o.returned = false
        ),
        scalev_matches AS (
          SELECT DISTINCT matched_order_id 
          FROM scalev_leads 
          WHERE matched_order_id IS NOT NULL
        ),
        crm_sent AS (
          SELECT 
            CASE 
              WHEN REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g') LIKE '0%' 
                THEN '62' || SUBSTRING(REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g') FROM 2)
              WHEN REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g') LIKE '8%' 
                THEN '62' || REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g')
              ELSE REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g')
            END as phone,
            channel as crm_channel,
            sent_at
          FROM crm_reminders
          WHERE status = 'sent' AND sent_at IS NOT NULL
        ),
        recent_crm AS (
          SELECT DISTINCT ON (phone) phone, crm_channel, sent_at
          FROM crm_sent
          ORDER BY phone, sent_at DESC
        ),
        categorized AS (
          SELECT 
            t.*,
            CASE 
              WHEN t.channel = 'shopee' THEN 'shopee'
              WHEN t.channel = 'tiktok' THEN 'tiktok'
              WHEN t.channel = 'reseller' THEN 'reseller'
              WHEN t.channel = 'offline' THEN 'offline'
              WHEN t.channel = 'whatsapp' THEN 
                CASE 
                  WHEN sm.matched_order_id IS NOT NULL THEN 'meta_ads'
                  WHEN rc.phone IS NOT NULL AND t.created_at >= rc.sent_at AND t.created_at <= rc.sent_at + INTERVAL '30 days' THEN 'crm_waba'
                  ELSE 'wa_direct'
                END
              ELSE 'other'
            END as cat_key
          FROM period_orders t
          LEFT JOIN scalev_matches sm ON sm.matched_order_id = t.id
          LEFT JOIN recent_crm rc ON rc.phone = t.norm_phone
        )
        SELECT 
          cat_key,
          count(*)::int as total_paket,
          sum(net_revenue)::numeric as omzet,
          sum(cogs)::numeric as total_cogs,
          sum(net_revenue - cogs)::numeric as laba_kotor
        FROM categorized
        GROUP BY cat_key
        ORDER BY total_paket DESC;
      `;

      const res = await pool.query(query, [startIso, endIso]);

      let total_paket = 0;
      let total_omzet = 0;
      let total_cogs = 0;
      let total_laba_kotor = 0;

      res.rows.forEach((r) => {
        total_paket += Number(r.total_paket || 0);
        total_omzet += Number(r.omzet || 0);
        total_cogs += Number(r.total_cogs || 0);
        total_laba_kotor += Number(r.laba_kotor || 0);
      });

      const overall_margin = total_omzet > 0 ? (total_laba_kotor / total_omzet) * 100 : 0;

      const channels: ChannelStat[] = res.rows.map((r) => {
        const key = r.cat_key || "other";
        const meta = CHANNEL_METADATA[key] || CHANNEL_METADATA.other;
        const paket = Number(r.total_paket || 0);
        const omzet = Number(r.omzet || 0);
        const cogs = Number(r.total_cogs || 0);
        const laba = Number(r.laba_kotor || 0);
        const margin = omzet > 0 ? (laba / omzet) * 100 : 0;
        const aov = paket > 0 ? omzet / paket : 0;
        const percent_paket = total_paket > 0 ? (paket / total_paket) * 100 : 0;
        const percent_omzet = total_omzet > 0 ? (omzet / total_omzet) * 100 : 0;
        const percent_laba = total_laba_kotor > 0 ? (laba / total_laba_kotor) * 100 : 0;

        return {
          key,
          label: meta.label,
          subLabel: meta.subLabel,
          color: meta.color,
          darkColor: meta.darkColor,
          icon: meta.icon,
          total_paket: paket,
          omzet,
          cogs,
          laba_kotor: laba,
          margin,
          aov,
          percent_paket,
          percent_omzet,
          percent_laba,
        };
      });

      return {
        period,
        startDate: startIso,
        endDate: endIso,
        total_paket,
        total_omzet,
        total_cogs,
        total_laba_kotor,
        overall_margin,
        channels,
      };
    } catch (err) {
      console.error("[getSalesChannelBreakdown Error]:", err);
      return {
        period,
        startDate: "",
        endDate: "",
        total_paket: 0,
        total_omzet: 0,
        total_cogs: 0,
        total_laba_kotor: 0,
        overall_margin: 0,
        channels: [],
      };
    } finally {
      if (pool) {
        try {
          await pool.end();
        } catch (e) {}
      }
    }
  });

export const getChannelOrderList = createServerFn({ method: "POST" })
  .validator((d: { period?: "today" | "yesterday" | "7days" | "month"; channelKey: string }) => d)
  .handler(async ({ data }): Promise<ChannelOrderListResponse> => {
    let pool: pg.Pool | null = null;
    const period = data?.period || "today";
    const channelKey = data?.channelKey || "meta_ads";

    try {
      pool = new pg.Pool({
        connectionString: DB_URL,
        ssl: { rejectUnauthorized: false },
      });

      // Calculate date boundaries in WIB (UTC+7)
      const nowWib = new Date(Date.now() + 7 * 3600 * 1000);
      const year = nowWib.getUTCFullYear();
      const month = String(nowWib.getUTCMonth() + 1).padStart(2, "0");
      const day = String(nowWib.getUTCDate()).padStart(2, "0");
      const todayStr = `${year}-${month}-${day}`;

      let startIso = `${todayStr} 00:00:00+07`;
      let endIso = `${todayStr} 23:59:59.999+07`;

      if (period === "yesterday") {
        const yesterdayWib = new Date(nowWib.getTime() - 24 * 3600 * 1000);
        const yYear = yesterdayWib.getUTCFullYear();
        const yMonth = String(yesterdayWib.getUTCMonth() + 1).padStart(2, "0");
        const yDay = String(yesterdayWib.getUTCDate()).padStart(2, "0");
        const yStr = `${yYear}-${yMonth}-${yDay}`;
        startIso = `${yStr} 00:00:00+07`;
        endIso = `${yStr} 23:59:59.999+07`;
      } else if (period === "7days") {
        const past7Wib = new Date(nowWib.getTime() - 6 * 24 * 3600 * 1000);
        const pYear = past7Wib.getUTCFullYear();
        const pMonth = String(past7Wib.getUTCMonth() + 1).padStart(2, "0");
        const pDay = String(past7Wib.getUTCDate()).padStart(2, "0");
        startIso = `${pYear}-${pMonth}-${pDay} 00:00:00+07`;
        endIso = `${todayStr} 23:59:59.999+07`;
      } else if (period === "month") {
        startIso = `${year}-${month}-01 00:00:00+07`;
        endIso = `${todayStr} 23:59:59.999+07`;
      }

      const query = `
        WITH period_orders AS (
          SELECT 
            o.id,
            o.channel,
            o.customer_name,
            o.customer_phone,
            o.shipping_address,
            o.tracking_number,
            o.expedition,
            o.payment_method,
            COALESCE(o.subtotal_gross, 0) as subtotal_gross,
            COALESCE(o.amount_received, 0) as amount_received,
            COALESCE(o.net_revenue, o.amount_received, o.subtotal_gross, 0) as net_revenue,
            COALESCE(o.cogs_total, 0) as cogs,
            o.created_at,
            CASE 
              WHEN REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g') LIKE '0%' 
                THEN '62' || SUBSTRING(REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g') FROM 2)
              WHEN REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g') LIKE '8%' 
                THEN '62' || REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g')
              ELSE REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g')
            END as norm_phone
          FROM orders o
          WHERE o.created_at >= $1 
            AND o.created_at <= $2
            AND o.returned = false
        ),
        scalev_matches AS (
          SELECT DISTINCT matched_order_id 
          FROM scalev_leads 
          WHERE matched_order_id IS NOT NULL
        ),
        crm_sent AS (
          SELECT 
            CASE 
              WHEN REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g') LIKE '0%' 
                THEN '62' || SUBSTRING(REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g') FROM 2)
              WHEN REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g') LIKE '8%' 
                THEN '62' || REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g')
              ELSE REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g')
            END as phone,
            channel as crm_channel,
            sent_at
          FROM crm_reminders
          WHERE status = 'sent' AND sent_at IS NOT NULL
        ),
        recent_crm AS (
          SELECT DISTINCT ON (phone) phone, crm_channel, sent_at
          FROM crm_sent
          ORDER BY phone, sent_at DESC
        ),
        categorized AS (
          SELECT 
            t.*,
            CASE 
              WHEN t.channel = 'shopee' THEN 'shopee'
              WHEN t.channel = 'tiktok' THEN 'tiktok'
              WHEN t.channel = 'reseller' THEN 'reseller'
              WHEN t.channel = 'offline' THEN 'offline'
              WHEN t.channel = 'whatsapp' THEN 
                CASE 
                  WHEN sm.matched_order_id IS NOT NULL THEN 'meta_ads'
                  WHEN rc.phone IS NOT NULL AND t.created_at >= rc.sent_at AND t.created_at <= rc.sent_at + INTERVAL '30 days' THEN 'crm_waba'
                  ELSE 'wa_direct'
                END
              ELSE 'other'
            END as cat_key
          FROM period_orders t
          LEFT JOIN scalev_matches sm ON sm.matched_order_id = t.id
          LEFT JOIN recent_crm rc ON rc.phone = t.norm_phone
        )
        SELECT 
          c.id, c.customer_name, c.customer_phone, c.shipping_address, c.tracking_number, c.expedition, c.payment_method,
          c.subtotal_gross::numeric, c.amount_received::numeric, c.net_revenue::numeric, c.cogs::numeric, c.created_at, c.cat_key,
          COALESCE(
            json_agg(
              json_build_object(
                'qty', oi.qty,
                'honey_type', oi.honey_type,
                'unit_price', oi.unit_price,
                'size_name', ps.name
              )
            ) FILTER (WHERE oi.id IS NOT NULL), '[]'::json
          ) as items
        FROM categorized c
        LEFT JOIN order_items oi ON oi.order_id = c.id
        LEFT JOIN product_sizes ps ON ps.id = oi.size_id
        WHERE ($3 = 'all' OR c.cat_key = $3)
        GROUP BY c.id, c.customer_name, c.customer_phone, c.shipping_address, c.tracking_number, c.expedition, c.payment_method, c.subtotal_gross, c.amount_received, c.net_revenue, c.cogs, c.created_at, c.cat_key
        ORDER BY c.created_at DESC;
      `;

      const res = await pool.query(query, [startIso, endIso, channelKey]);
      const meta = CHANNEL_METADATA[channelKey] || CHANNEL_METADATA.other;

      let totalOmzet = 0;
      const orders: ChannelOrderRow[] = res.rows.map((r) => {
        const net = Number(r.net_revenue || 0);
        totalOmzet += net;
        return {
          id: r.id,
          customer_name: r.customer_name || "Pelanggan",
          customer_phone: r.customer_phone || "-",
          shipping_address: r.shipping_address || "",
          tracking_number: r.tracking_number || "",
          expedition: r.expedition || "",
          payment_method: r.payment_method || "",
          subtotal_gross: Number(r.subtotal_gross || 0),
          amount_received: Number(r.amount_received || 0),
          net_revenue: net,
          cogs: Number(r.cogs || 0),
          created_at: r.created_at,
          cat_key: r.cat_key,
          items: Array.isArray(r.items) ? r.items : [],
        };
      });

      return {
        period,
        channelKey,
        channelLabel: meta.label,
        channelIcon: meta.icon,
        channelColor: meta.color,
        totalOrders: orders.length,
        totalOmzet,
        orders,
      };
    } catch (err) {
      console.error("[getChannelOrderList Error]:", err);
      const meta = CHANNEL_METADATA[channelKey] || CHANNEL_METADATA.other;
      return {
        period,
        channelKey,
        channelLabel: meta.label,
        channelIcon: meta.icon,
        channelColor: meta.color,
        totalOrders: 0,
        totalOmzet: 0,
        orders: [],
      };
    } finally {
      if (pool) {
        try {
          await pool.end();
        } catch (e) {}
      }
    }
  });
