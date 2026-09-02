process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';

const VPS_DELETE_URL = 'https://waha.araahoney.my.id/media-delete';
const VPS_SECRET_KEY = 'araahoney_vps_media_key_123';

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

          // 1. Delete file from VPS disk via HTTP endpoint
          if (fileName) {
            try {
              console.log(`[Media Delete API] Removing ${fileName} from VPS...`);
              await fetch(VPS_DELETE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  secretKey: VPS_SECRET_KEY,
                  fileName
                })
              });
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
