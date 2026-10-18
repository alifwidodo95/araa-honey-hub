import { createFileRoute } from '@tanstack/react-router';

// Default write API Key provided by user
const DEFAULT_LINCAH_API_KEY = 'tgOeYAZmBArCYlKfGxCOAsNLDIbYpkLm';

export const Route = createFileRoute('/api/lincah/customer')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const rawPhone = url.searchParams.get('phone') || '';
          const customApiKey = url.searchParams.get('apiKey') || '';

          if (!rawPhone.trim()) {
            return new Response(JSON.stringify({ 
              success: false, 
              error: 'Nomor telepon (phone) wajib diisi.', 
              orders: [] 
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // Normalize phone number to Indonesian format: 628...
          let digits = rawPhone.replace(/[^0-9]/g, '');
          if (digits.startsWith('0')) {
            digits = '62' + digits.slice(1);
          } else if (digits.startsWith('8')) {
            digits = '62' + digits;
          }

          const apiKey = customApiKey || process.env.LINCAH_API_KEY || DEFAULT_LINCAH_API_KEY;

          // Helper to fetch orders from Lincah API v2
          const fetchOrders = async (phoneQuery: string) => {
            const endpoint = `https://api-v2.lincah.id/openapi/order?phone=${encodeURIComponent(phoneQuery)}`;
            const res = await fetch(endpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json',
              },
              signal: AbortSignal.timeout(10000),
            });

            if (!res.ok) {
              const errBody = await res.text().catch(() => '');
              throw new Error(`Lincah API HTTP ${res.status}: ${errBody}`);
            }

            const json = await res.json();
            return json?.data?.data || [];
          };

          // 1. Try with 628... format
          let rawOrders = await fetchOrders(digits);

          // 2. If 0 orders found and number starts with 62, try fallback with 08... format
          if ((!rawOrders || rawOrders.length === 0) && digits.startsWith('62')) {
            const fallback08 = '0' + digits.slice(2);
            try {
              const fallbackOrders = await fetchOrders(fallback08);
              if (fallbackOrders && fallbackOrders.length > 0) {
                rawOrders = fallbackOrders;
              }
            } catch (fallbackErr) {
              console.warn('[API Lincah Customer] Fallback 08 query failed:', fallbackErr);
            }
          }

          // Map and clean order data for frontend consumption
          const orders = (rawOrders || []).map((o: any) => {
            const scoreVal = typeof o.score === 'object' && o.score?.score 
              ? o.score.score 
              : (typeof o.score === 'string' ? o.score : null);

            const destination = o.destination_text || '';
            const address = o.address || '';
            const fullAddress = address && destination 
              ? `${address}, ${destination}` 
              : (address || destination || '-');

            return {
              id: o._id || o.no_order || Math.random().toString(36).substring(7),
              no_order: o.no_order || null,
              resi: o.resi || null,
              name: o.name || 'Pelanggan',
              phone: o.phone || digits,
              address: address,
              destination: destination,
              full_address: fullAddress,
              product_name: o.product_name || '-',
              quantity: o.quantity || 1,
              type: o.type || 'cod',
              cod_price: Number(o.cod_price) || 0,
              courier: (o.courier || '').toUpperCase(),
              courier_service: o.courier_service || '',
              status: o.status || 'unknown',
              lastStatus: o.lastStatus || null,
              score: scoreVal,
              createdAt: o.date?.create || o.picked_up_time || null,
              completedAt: o.date?.complete || o.date?.done || null,
            };
          });

          // Summary for customer
          const latestOrder = orders[0] || null;
          const customerSummary = latestOrder ? {
            name: latestOrder.name,
            phone: latestOrder.phone,
            address: latestOrder.address,
            destination: latestOrder.destination,
            full_address: latestOrder.full_address,
            score: orders.find((o: any) => o.score)?.score || null,
            total_orders: orders.length,
            latest_resi: latestOrder.resi,
            latest_status: latestOrder.status,
            latest_product: latestOrder.product_name,
          } : null;

          return new Response(JSON.stringify({
            success: true,
            found: orders.length > 0,
            query_phone: digits,
            customer: customerSummary,
            orders,
          }), {
            status: 200,
            headers: { 
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store, max-age=0'
            },
          });

        } catch (error: any) {
          console.error('[API Lincah Customer Error]:', error);
          return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Terjadi kesalahan saat memproses data Lincah.',
            orders: [],
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }
  }
});
