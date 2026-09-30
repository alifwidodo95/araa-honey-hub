import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';
import { sendWhatsAppMessage, WhatsAppChannel } from '@/lib/whatsapp-service';

/**
 * Hermes Agent External API Gateway
 * Endpoint: /api/hermes (Supports GET & POST)
 * Protected by: Authorization: Bearer <HERMES_API_KEY> or ?api_key=<HERMES_API_KEY>
 */

const DB_URL =
  process.env.DATABASE_URL ||
  'postgres://postgres.saefgyiloalpiqfrglqo:Handayani01@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres';

function getJakartaTodayStr(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function handleHermesRequest(request: Request, method: 'GET' | 'POST') {
  let pool: pg.Pool | null = null;
  try {
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());

    let body: any = {};
    if (method === 'POST') {
      try {
        body = await request.json();
      } catch {
        body = {};
      }
    }

    // 1. Authenticate with Hermes API Key
    const authHeader = request.headers.get('authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
    const providedKey = bearerToken || queryParams.api_key || body.api_key || body.apiKey || '';

    pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

    // Fetch Hermes Config from app_settings
    const cfgRes = await pool.query("SELECT value FROM app_settings WHERE key = 'hermes_config'");
    const hermesCfg = cfgRes.rows[0]?.value || {};

    const configuredKey = hermesCfg.api_key || process.env.HERMES_API_KEY || '';
    const isEnabled = hermesCfg.enabled !== false; // default true if configured

    if (!configuredKey) {
      await pool.end();
      return new Response(JSON.stringify({
        success: false,
        error: 'Hermes API Key belum dibuat. Silakan buat token terlebih dahulu di menu Pengaturan Profil Araa Honey Hub.'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!isEnabled) {
      await pool.end();
      return new Response(JSON.stringify({
        success: false,
        error: 'Akses Hermes Agent dinonaktifkan oleh administrator di Pengaturan Profil Araa Honey Hub.'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!providedKey || providedKey !== configuredKey) {
      await pool.end();
      return new Response(JSON.stringify({
        success: false,
        error: 'Unauthorized: Hermes API Key tidak valid. Pastikan header "Authorization: Bearer <API_KEY>" disertakan.'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Action Routing
    const action = (queryParams.action || body.action || 'help').toLowerCase();

    // ACTION: HELP / DISCOVERY (Auto-Documentation for Hermes LLM)
    if (action === 'help' || action === 'info') {
      await pool.end();
      return new Response(JSON.stringify({
        success: true,
        gateway: 'Araa Honey Hub - Hermes Agent Gateway',
        version: '1.0',
        today_wib: getJakartaTodayStr(),
        description: 'Gateway resmi untuk Hermes AI Agent membaca dan mengontrol sistem Araa Honey Hub via Telegram.',
        endpoints: {
          url: 'https://app.araahoney.my.id/api/hermes',
          auth: 'Bearer <HERMES_API_KEY>'
        },
        actions: {
          summary: {
            method: 'GET',
            description: 'Melihat ringkasan omset penjualan hari ini, jumlah order belum selesai, unread chat, dan leads.',
            example: 'GET /api/hermes?action=summary'
          },
          orders: {
            method: 'GET',
            description: 'Melihat daftar obrolan berlabel order/selesai.',
            params: { status: 'order | done | all (default: order)', limit: 'number (default: 20)' },
            example: 'GET /api/hermes?action=orders&status=order'
          },
          update_order: {
            method: 'POST',
            description: 'Mengubah status pesanan konsumen (misal menandai Selesai atau mengembalikan ke Order).',
            body: { phone: '6281901942233', tag: 'order | done | clear' },
            example: 'POST /api/hermes { "action": "update_order", "phone": "628...", "tag": "done" }'
          },
          stock: {
            method: 'GET',
            description: 'Melihat ringkasan sisa stok kemasan botol dan bahan baku madu curah.',
            example: 'GET /api/hermes?action=stock'
          },
          customer: {
            method: 'GET',
            description: 'Melihat riwayat belanja dan obrolan konsumen berdasarkan nomor WhatsApp.',
            params: { phone: 'Nomor HP' },
            example: 'GET /api/hermes?action=customer&phone=628123456789'
          },
          send_whatsapp: {
            method: 'POST',
            description: 'Mengirimkan pesan resmi WhatsApp WABA ke konsumen atas nama Araa Honey.',
            body: { to: '628...', message: 'Halo kak...', channel: 'waba (default) | waha_main' },
            example: 'POST /api/hermes { "action": "send_whatsapp", "to": "628...", "message": "Pesanan sedang diproses!" }'
          }
        }
      }, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ACTION: SUMMARY (Dashboard Executive Brief)
    if (action === 'summary' || action === 'dashboard') {
      const todayStr = getJakartaTodayStr();

      // Today's Sales
      const salesRes = await pool.query(
        `SELECT 
           COUNT(*)::int as total_orders, 
           COALESCE(SUM(subtotal_gross), 0)::numeric as total_omset
         FROM orders 
         WHERE (created_at AT TIME ZONE 'Asia/Jakarta')::date = $1::date
           AND COALESCE(returned, false) = false`,
        [todayStr]
      );
      const todayOmset = Number(salesRes.rows[0]?.total_omset || 0);
      const todayOrdersCount = Number(salesRes.rows[0]?.total_orders || 0);

      // Order Tags count (Pending vs Done)
      let pendingOrders = 0;
      let completedOrders = 0;
      try {
        const tagsRes = await pool.query(
          `SELECT tag, COUNT(*)::int as count 
           FROM whatsapp_chat_tags 
           GROUP BY tag`
        );
        tagsRes.rows.forEach(r => {
          if (r.tag === 'order') pendingOrders = r.count;
          if (r.tag === 'done') completedOrders = r.count;
        });
      } catch (e) {}

      // Unread WhatsApp Chats
      let unreadChats = 0;
      try {
        const unreadRes = await pool.query(
          `SELECT COUNT(DISTINCT chat_id)::int as unread_count 
           FROM whatsapp_chat_logs 
           WHERE direction = 'incoming' AND is_read = false`
        );
        unreadChats = Number(unreadRes.rows[0]?.unread_count || 0);
      } catch (e) {}

      // Today's Scalev Leads
      let todayLeads = 0;
      try {
        const leadsRes = await pool.query(
          `SELECT COUNT(*)::int as leads_count 
           FROM scalev_leads 
           WHERE (created_at AT TIME ZONE 'Asia/Jakarta')::date = $1::date`,
          [todayStr]
        );
        todayLeads = Number(leadsRes.rows[0]?.leads_count || 0);
      } catch (e) {
        // Table might not exist or empty
      }

      await pool.end();
      return new Response(JSON.stringify({
        success: true,
        action: 'summary',
        date_wib: todayStr,
        summary: {
          today_omset: todayOmset,
          today_omset_formatted: `Rp ${todayOmset.toLocaleString('id-ID')}`,
          today_sales_count: todayOrdersCount,
          pending_orders: pendingOrders,
          completed_orders: completedOrders,
          unread_chats_waba: unreadChats,
          today_scalev_leads: todayLeads
        },
        executive_message: `Laporan Araa Honey (${todayStr}): Omset hari ini Rp ${todayOmset.toLocaleString('id-ID')} dari ${todayOrdersCount} penjualan. Terdapat ${pendingOrders} orderan pending perlu dikerjakan, ${completedOrders} order selesai, ${unreadChats} chat WABA belum dibalas, dan ${todayLeads} leads iklan masuk.`
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ACTION: ORDERS (List active orders)
    if (action === 'orders') {
      const statusFilter = (queryParams.status || body.status || 'order').toLowerCase();
      const limit = Math.min(Math.max(Number(queryParams.limit || body.limit || 20), 1), 100);

      let sql = `
        SELECT 
          t.phone,
          t.tag,
          t.updated_at,
          (
            SELECT json_build_object(
              'customer_name', l.customer_name,
              'message', l.message,
              'direction', l.direction,
              'created_at', l.created_at
            )
            FROM whatsapp_chat_logs l
            WHERE l.customer_phone = t.phone OR l.chat_id LIKE '%' || t.phone || '%'
            ORDER BY l.created_at DESC
            LIMIT 1
          ) as latest_log
        FROM whatsapp_chat_tags t
      `;

      const params: any[] = [];
      if (statusFilter !== 'all') {
        sql += ` WHERE t.tag = $1`;
        params.push(statusFilter);
      }
      sql += ` ORDER BY t.updated_at DESC LIMIT ${limit}`;

      const ordersRes = await pool.query(sql, params);
      const orders = ordersRes.rows.map(r => ({
        phone: r.phone,
        tag: r.tag,
        status_label: r.tag === 'order' ? '🛒 Order (Perlu Dikerjakan)' : r.tag === 'done' ? '✅ Selesai' : r.tag,
        customer_name: r.latest_log?.customer_name || 'Pelanggan',
        latest_message: r.latest_log?.message || '',
        latest_time: r.latest_log?.created_at || r.updated_at,
        updated_at: r.updated_at
      }));

      await pool.end();
      return new Response(JSON.stringify({
        success: true,
        action: 'orders',
        filter: statusFilter,
        total: orders.length,
        orders
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ACTION: UPDATE ORDER STATUS (e.g. mark done or revert)
    if (action === 'update_order' || action === 'mark_order') {
      const rawPhone = body.phone || queryParams.phone || '';
      const tag = body.tag !== undefined ? body.tag : queryParams.tag;
      const cleanPhone = String(rawPhone).replace(/[^0-9]/g, '');

      if (!cleanPhone) {
        await pool.end();
        return new Response(JSON.stringify({
          success: false,
          error: 'Nomor telepon (phone) wajib diisi untuk mengubah status order.'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (tag === null || tag === 'clear' || tag === 'hapus' || tag === '') {
        await pool.query('DELETE FROM whatsapp_chat_tags WHERE phone = $1', [cleanPhone]);
        await pool.end();
        return new Response(JSON.stringify({
          success: true,
          action: 'update_order',
          phone: cleanPhone,
          tag: null,
          message: `Label order untuk nomor ${cleanPhone} berhasil dilepas.`
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const validTag = tag === 'done' ? 'done' : 'order';
      await pool.query(
        `INSERT INTO whatsapp_chat_tags (phone, tag, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (phone) DO UPDATE 
         SET tag = EXCLUDED.tag, updated_at = NOW()`,
        [cleanPhone, validTag]
      );

      await pool.end();
      const statusIndo = validTag === 'done' ? '✅ Selesai Dikerjakan' : '🛒 Order Aktif';
      return new Response(JSON.stringify({
        success: true,
        action: 'update_order',
        phone: cleanPhone,
        tag: validTag,
        status_label: statusIndo,
        message: `Status pesanan ${cleanPhone} berhasil diubah menjadi: ${statusIndo}!`
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ACTION: STOCK (Warehouse stock overview)
    if (action === 'stock') {
      let packagingItems: any[] = [];
      try {
        const packRes = await pool.query(
          `SELECT name as item_name, current_stock as quantity, unit, min_stock 
           FROM packaging_items 
           ORDER BY current_stock ASC`
        );
        packagingItems = packRes.rows;
      } catch (e) {
        // Table fallback
      }

      let dandangItems: any[] = [];
      try {
        const dandangRes = await pool.query(
          `SELECT id, honey_type, kg_remaining as remaining_kg, min_kg, avg_cost_per_kg 
           FROM dandang_balance 
           ORDER BY honey_type ASC`
        );
        dandangItems = dandangRes.rows;
      } catch (e) {
        // Table fallback
      }

      await pool.end();
      return new Response(JSON.stringify({
        success: true,
        action: 'stock',
        dandang_madu_curah: dandangItems,
        packaging_items: packagingItems
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ACTION: CUSTOMER DETAILS (Order history & contact info)
    if (action === 'customer') {
      const rawPhone = queryParams.phone || body.phone || '';
      const cleanPhone = String(rawPhone).replace(/[^0-9]/g, '');

      if (!cleanPhone) {
        await pool.end();
        return new Response(JSON.stringify({
          success: false,
          error: 'Nomor telepon (phone) wajib diisi untuk melihat data konsumen.'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Customer orders
      let customerOrders: any[] = [];
      try {
        const ordersRes = await pool.query(
          `SELECT id, subtotal_gross as total_amount, net_revenue, tracking_number, created_at 
           FROM orders 
           WHERE customer_phone LIKE '%' || $1 || '%'
           ORDER BY created_at DESC 
           LIMIT 10`,
          [cleanPhone]
        );
        customerOrders = ordersRes.rows;
      } catch (e) {}

      // Current Tag
      const tagRes = await pool.query(
        `SELECT tag, updated_at FROM whatsapp_chat_tags WHERE phone = $1`,
        [cleanPhone]
      );

      // Recent 5 chat messages
      let recentChats: any[] = [];
      try {
        const chatRes = await pool.query(
          `SELECT customer_name, message, direction, created_at 
           FROM whatsapp_chat_logs 
           WHERE customer_phone = $1 OR chat_id LIKE '%' || $1 || '%'
           ORDER BY created_at DESC 
           LIMIT 5`,
          [cleanPhone]
        );
        recentChats = chatRes.rows.reverse();
      } catch (e) {}

      await pool.end();
      return new Response(JSON.stringify({
        success: true,
        action: 'customer',
        phone: cleanPhone,
        current_tag: tagRes.rows[0]?.tag || null,
        recent_chats: recentChats,
        recent_orders: customerOrders
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ACTION: SEND WHATSAPP
    if (action === 'send_whatsapp' || action === 'send_wa') {
      const to = body.to || body.phone || queryParams.to || queryParams.phone;
      const message = body.message || queryParams.message;
      const channel = (body.channel || queryParams.channel || 'waba') as WhatsAppChannel;

      if (!to || !message) {
        await pool.end();
        return new Response(JSON.stringify({
          success: false,
          error: 'Nomor tujuan (to) dan pesan (message) wajib diisi.'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Fetch WAHA config if needed
      let wahaConfig = undefined;
      if (channel === 'waha_main' || channel === 'waha_campaign') {
        const wahaRes = await pool.query("SELECT value FROM app_settings WHERE key = 'waha_config'");
        wahaConfig = wahaRes.rows[0]?.value;
      }

      const result = await sendWhatsAppMessage({
        to,
        message,
        channel,
        wahaConfig
      });

      if (!result.success) {
        await pool.end();
        return new Response(JSON.stringify({
          success: false,
          error: result.error || 'Gagal mengirim pesan WhatsApp'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Record to chat logs so it appears in web monitor
      const cleanPhone = String(to).replace(/[^0-9]/g, '');
      const chatId = `${cleanPhone}@c.us`;
      await pool.query(
        `INSERT INTO whatsapp_chat_logs (
           chat_id, customer_phone, customer_name, message, direction, channel, replied_by, is_read, created_at
         ) VALUES ($1, $2, $3, $4, 'outgoing', $5, 'manual', true, NOW())`,
        [chatId, cleanPhone, 'Pelanggan', message, channel]
      );

      await pool.end();
      return new Response(JSON.stringify({
        success: true,
        action: 'send_whatsapp',
        to: cleanPhone,
        channel,
        message: 'Pesan berhasil dikirim via WhatsApp dan dicatat di monitor chat Araa Honey.'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Default: Unknown action
    await pool.end();
    return new Response(JSON.stringify({
      success: false,
      error: `Aksi "${action}" tidak dikenali. Gunakan ?action=help untuk melihat daftar aksi yang tersedia.`
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    if (pool) {
      try { await pool.end(); } catch {}
    }
    return new Response(JSON.stringify({
      success: false,
      error: 'Hermes Gateway Internal Error: ' + (err.message || 'Unknown error')
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const Route = createFileRoute('/api/hermes')({
  server: {
    handlers: {
      GET: async ({ request }) => handleHermesRequest(request, 'GET'),
      POST: async ({ request }) => handleHermesRequest(request, 'POST'),
    },
  },
});
