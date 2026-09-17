import { createFileRoute } from '@tanstack/react-router';
import { sendWhatsAppMessage, WhatsAppChannel } from '@/lib/whatsapp-service';

export const Route = createFileRoute('/api/whatsapp/send')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json() as any;
          const { to, message, imageUrl, channel } = body || {};

          if (!to || !message) {
            return new Response(JSON.stringify({ 
              success: false, 
              error: 'Nomor tujuan (to) dan pesan (message) wajib diisi.' 
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          const result = await sendWhatsAppMessage({
            to,
            message,
            imageUrl,
            channel: (channel as WhatsAppChannel) || 'waba'
          });

          if (!result.success) {
            return new Response(JSON.stringify(result), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });

        } catch (error: any) {
          console.error('[API Send WhatsApp Error]:', error);
          return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Internal Server Error'
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }
  }
});
