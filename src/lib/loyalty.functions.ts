import { createServerFn } from "@tanstack/react-start";
import pg from "pg";

export const getLoyaltyStats = createServerFn({ method: "GET" })
  .handler(async () => {
    let pool: pg.Pool | null = null;
    try {
      const connectionString =
        process.env.DATABASE_URL ||
        "postgres://postgres.saefgyiloalpiqfrglqo:Handayani01@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";

      pool = new pg.Pool({
        connectionString,
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
        customer_agg AS (
          SELECT 
            n.phone,
            MAX(n.customer_name) as name,
            COUNT(*)::int as order_count,
            SUM(n.subtotal_gross)::numeric as total_spent,
            MIN(n.created_at) as first_order_date,
            MAX(n.created_at) as last_order_date,
            EXTRACT(DAY FROM (NOW() - MAX(n.created_at)))::int as days_since_last_order,
            MODE() WITHIN GROUP (ORDER BY n.honey_type) as favorite_honey
          FROM normalized_orders n
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
