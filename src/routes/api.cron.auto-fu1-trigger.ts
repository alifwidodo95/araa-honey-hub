import { createFileRoute } from '@tanstack/react-router';
import { processPendingAutoFu1 } from '@/lib/scalev.functions';

/**
 * Auto-Follow-Up 1 Engine Endpoint
 * Trigger otomatis pesan FU 1 untuk lead yang tidak melakukan chat WA dalam 90 detik.
 *
 * Endpoint:
 * GET  /api/cron/auto-fu1-trigger
 * POST /api/cron/auto-fu1-trigger
 */
export const Route = createFileRoute('/api/cron/auto-fu1-trigger')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const result = await processPendingAutoFu1();
          return new Response(
            JSON.stringify({
              ok: true,
              message: 'Auto-FU1 trigger processed successfully',
              result,
              timestamp: new Date().toISOString(),
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        } catch (error: any) {
          console.error('[Auto-FU1 Trigger GET Error]:', error);
          return new Response(
            JSON.stringify({ ok: false, error: error?.message || 'Internal error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
      },
      POST: async () => {
        try {
          const result = await processPendingAutoFu1();
          return new Response(
            JSON.stringify({
              ok: true,
              message: 'Auto-FU1 trigger processed successfully',
              result,
              timestamp: new Date().toISOString(),
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        } catch (error: any) {
          console.error('[Auto-FU1 Trigger POST Error]:', error);
          return new Response(
            JSON.stringify({ ok: false, error: error?.message || 'Internal error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
      },
    },
  },
});
