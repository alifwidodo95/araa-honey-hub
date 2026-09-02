process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { createFileRoute } from '@tanstack/react-router';
import { Client } from 'ssh2';
import pg from 'pg';

const VPS_HOST = '43.133.136.171';
const VPS_USER = 'ubuntu';
const VPS_PASS = 'quantum-49#-matrix';
const VPS_MEDIA_DIR = '/var/www/media';
const PUBLIC_MEDIA_BASE_URL = 'https://waha.araahoney.my.id/media';

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
          const targetVpsPath = `${VPS_MEDIA_DIR}/${finalFileName}`;
          const publicUrl = `${PUBLIC_MEDIA_BASE_URL}/${finalFileName}`;

          // Decode base64 to buffer
          const base64Clean = fileBase64.replace(/^data:[^;]+;base64,/, '');
          const buffer = Buffer.from(base64Clean, 'base64');
          const fileSize = buffer.length;

          const fileType = (mimeType || '').startsWith('video/') ? 'video' : 'image';

          // 1. Upload to VPS via SSH
          console.log(`[Media Upload API] Uploading ${finalFileName} (${fileSize} bytes) to VPS ${VPS_HOST}...`);

          const conn = new Client();
          await new Promise<void>((resolve, reject) => {
            conn.on('ready', () => {
              conn.exec(`cat > "${targetVpsPath}"`, (err, stream) => {
                if (err) return reject(err);
                stream.on('close', (code) => {
                  if (code === 0) resolve();
                  else reject(new Error(`SSH exit code: ${code}`));
                });
                stream.on('error', reject);
                stream.write(buffer);
                stream.end();
              });
            });
            conn.on('error', reject);
            conn.connect({
              host: VPS_HOST,
              port: 22,
              username: VPS_USER,
              password: VPS_PASS,
              readyTimeout: 30000,
            });
          });

          conn.end();
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
