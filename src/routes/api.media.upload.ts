process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';

const VPS_UPLOAD_URL = 'https://waha.araahoney.my.id/media-upload';
const VPS_SECRET_KEY = 'araahoney_vps_media_key_123';

export const Route = createFileRoute('/api/media/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let pool: pg.Pool | null = null;
        try {
          const body = await request.json() as any;
          const { title, category, fileName, fileBase64, mimeType } = body;

          if (!title || !fileName || !fileBase64) {
            return new Response(JSON.stringify({ error: 'Title, fileName, dan fileBase64 wajib diisi.' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL is not configured');
          }

          // Clean & sanitize filename
          const cleanName = fileName
            .toLowerCase()
            .replace(/[^a-z0-9._-]/g, '-')
            .replace(/-+/g, '-');
          
          const timestamp = Date.now();
          const finalFileName = `${timestamp}-${cleanName}`;

          // 1. Upload to VPS via HTTP Proxy endpoint
          console.log(`[Media Upload API] Uploading ${finalFileName} to VPS...`);

          const vpsRes = await fetch(VPS_UPLOAD_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              secretKey: VPS_SECRET_KEY,
              fileName: finalFileName,
              fileBase64
            })
          });

          const vpsData = await vpsRes.json();
          if (!vpsRes.ok || !vpsData.success) {
            throw new Error(vpsData.error || 'Gagal mengunggah berkas ke VPS.');
          }

          const publicUrl = vpsData.publicUrl;
          const fileSize = vpsData.fileSize || 0;
          const fileType = (mimeType || '').startsWith('video/') ? 'video' : 'image';

          console.log(`[Media Upload API] Uploaded to VPS successfully: ${publicUrl}`);

          // 2. Insert record into Supabase PostgreSQL database
          pool = new pg.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
          });

          const insertRes = await pool.query(`
            INSERT INTO public.media_library (title, file_name, file_url, file_type, mime_type, file_size, category)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
          `, [title, finalFileName, publicUrl, fileType, mimeType || 'application/octet-stream', fileSize, category || 'Testimoni']);

          await pool.end();

          return new Response(JSON.stringify({
            success: true,
            media: insertRes.rows[0]
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });

        } catch (error: any) {
          console.error('[Media Upload API Error]:', error);
          if (pool) await pool.end();
          return new Response(JSON.stringify({ error: error.message || 'Gagal mengunggah media ke VPS.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }
  }
});
