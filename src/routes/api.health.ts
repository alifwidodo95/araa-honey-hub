import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        let wahaStatus = 'unknown';
        let defaultSession = 'unknown';

        let campaignSession = 'unknown';

        try {
          const wahaRes = await fetch('https://waha.araahoney.my.id/api/sessions', {
            headers: { 'x-api-key': 'araahoney123' },
            signal: AbortSignal.timeout(4000),
          }).catch(() => null);

          if (wahaRes && wahaRes.ok) {
            wahaStatus = 'connected';
            const sessions = (await wahaRes.json().catch(() => [])) as Array<{ name: string; status: string }>;
            const main = sessions.find((s) => s.name === 'default');
            const camp = sessions.find((s) => s.name === 'campaign');

            if (main) {
              defaultSession = main.status;
              // Auto-Revive if main session stopped on VPS
              if (main.status === 'STOPPED' || main.status === 'FAILED') {
                console.log('[Auto-Healing WAHA] Session default is STOPPED, sending restart trigger...');
                fetch('https://waha.araahoney.my.id/api/sessions/start', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': 'araahoney123',
                  },
                  body: JSON.stringify({ name: 'default' }),
                  signal: AbortSignal.timeout(3000),
                }).catch(() => null);
              }
            }

            if (camp) {
              campaignSession = camp.status;
              // Auto-Revive if campaign session stopped on VPS
              if (camp.status === 'STOPPED' || camp.status === 'FAILED') {
                console.log('[Auto-Healing WAHA] Session campaign is STOPPED, sending restart trigger...');
                fetch('https://waha.araahoney.my.id/api/sessions/start', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': 'araahoney123',
                  },
                  body: JSON.stringify({ name: 'campaign' }),
                  signal: AbortSignal.timeout(3000),
                }).catch(() => null);
              }
            }
          } else {
            wahaStatus = 'standby';
          }
        } catch {
          wahaStatus = 'standby';
        }

        return new Response(
          JSON.stringify({
            status: 'ok',
            time: new Date().toISOString(),
            waha: wahaStatus,
            slot1: defaultSession,
            slot2: campaignSession,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store, no-cache, must-revalidate',
            },
          }
        );
      },
    },
  },
});
