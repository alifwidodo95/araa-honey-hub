process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { createFileRoute } from '@tanstack/react-router';
import { Client } from 'ssh2';
import pg from 'pg';

const VPS_HOST = '43.133.136.171';
const VPS_USER = 'ubuntu';
const VPS_PASS = 'quantum-49#-matrix';
const VPS_MEDIA_DIR = '/var/www/media';

export const Route = createFileRoute('/api/media/delete')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let pool: pg.Pool | null = null;
        try {
          const body = await request.json() as any;
          const { id, fileName } = body;

          if (!id) {
            return new Response(JSON.stringify({ error: 'ID media wajib disertakan.' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL is not configured');
          }

          // 1. Delete file from VPS disk if fileName is provided
          if (fileName) {
            try {
              const targetVpsPath = `${VPS_MEDIA_DIR}/${fileName}`;
              console.log(`[Media Delete API] Removing ${targetVpsPath} from VPS...`);

              const conn = new Client();
              await new Promise<void>((resolve, reject) => {
                conn.on('ready', () => {
                  conn.exec(`rm -f "${targetVpsPath}"`, (err, stream) => {
                    if (err) return reject(err);
                    stream.on('close', () => resolve());
                  });
                });
                conn.on('error', (e) => {
                  console.warn('[Media Delete API] SSH error, continuing DB deletion:', e);
                  resolve(); // don't block DB deletion if file is missing
                });
                conn.connect({
                  host: VPS_HOST,
                  port: 22,
                  username: VPS_USER,
                  password: VPS_PASS,
                  readyTimeout: 15000,
                });
              });

              conn.end();
            } catch (vpsErr) {
              console.warn('[Media Delete API] Failed to delete file from VPS:', vpsErr);
            }
          }

          // 2. Delete record from Supabase database
          pool = new pg.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
          });

          await pool.query(`DELETE FROM public.media_library WHERE id = $1`, [id]);
          await pool.end();

          return new Response(JSON.stringify({ success: true, message: 'Media berhasil dihapus.' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });

        } catch (error: any) {
          console.error('[Media Delete API Error]:', error);
          if (pool) await pool.end();
          return new Response(JSON.stringify({ error: error.message || 'Gagal menghapus media.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }
  }
});
