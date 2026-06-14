process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';

export const Route = createFileRoute('/api/meta/sync-comments')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let pool: pg.Pool | null = null;
        try {
          // 1. Database Connection
          if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL is not configured');
          }

          pool = new pg.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
          });

          // Fetch Settings
          const configRes = await pool.query("SELECT value FROM app_settings WHERE key = 'meta_ai_settings'");
          const aiConfig = configRes.rows[0]?.value || {};
          const { 
            page_access_token = '',
            facebook_page_id = '',
            instagram_account_id = ''
          } = aiConfig;

          if (!page_access_token) {
            await pool.end();
            return new Response(JSON.stringify({ error: 'Page Access Token is not configured.' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          const syncSummary = {
            facebookPostsSynced: 0,
            instagramMediaSynced: 0,
            commentsSynced: 0,
            errors: [] as string[]
          };

          // 2. Sync Facebook Page Posts & Comments
          if (facebook_page_id) {
            try {
              console.log(`[Meta Sync] Fetching FB Page posts for page ${facebook_page_id}...`);
              // Fetch last 15 published posts
              const fbPostsRes = await fetch(
                `https://graph.facebook.com/v20.0/${facebook_page_id}/published_posts?fields=id,message,permalink_url,created_time&limit=15`,
                {
                  headers: { 'Authorization': `Bearer ${page_access_token}` }
                }
              );

              if (fbPostsRes.ok) {
                const fbPostsData = await fbPostsRes.json() as any;
                const posts = fbPostsData.data || [];
                syncSummary.facebookPostsSynced = posts.length;

                for (const post of posts) {
                  // Register post in database
                  await pool.query(`
                    INSERT INTO meta_posts (id, permalink, is_ad, last_synced_at)
                    VALUES ($1, $2, false, now())
                    ON CONFLICT (id) DO UPDATE
                    SET permalink = EXCLUDED.permalink, last_synced_at = now()
                  `, [post.id, post.permalink_url]);

                  // Fetch comments for this post
                  const commentsRes = await fetch(
                    `https://graph.facebook.com/v20.0/${post.id}/comments?fields=id,message,from,created_time,parent_id&limit=25`,
                    {
                      headers: { 'Authorization': `Bearer ${page_access_token}` }
                    }
                  );

                  if (commentsRes.ok) {
                    const commentsData = await commentsRes.json() as any;
                    for (const comment of commentsData.data || []) {
                      const commentId = comment.id;
                      const senderId = comment.from ? comment.from.id : '';
                      const username = comment.from ? comment.from.name : 'Facebook User';
                      const message = comment.message;
                      const parentId = comment.parent_id || null;
                      const createdAt = new Date(comment.created_time);

                      // Skip self-comments
                      if (senderId === facebook_page_id || username.toLowerCase().includes('araa honey')) {
                        continue;
                      }

                      // Insert comment as unreplied if not exists
                      const insComment = await pool.query(`
                        INSERT INTO meta_comments (id, post_id, parent_id, username, message, replied, channel, created_at)
                        VALUES ($1, $2, $3, $4, $5, false, 'facebook', $6)
                        ON CONFLICT (id) DO NOTHING
                        RETURNING id
                      `, [commentId, post.id, parentId, username, message, createdAt]);

                      if (insComment.rowCount && insComment.rowCount > 0) {
                        syncSummary.commentsSynced++;
                      }
                    }
                  }
                }
              } else {
                const errText = await fbPostsRes.text();
                syncSummary.errors.push(`FB posts fetch failed: ${errText}`);
              }
            } catch (fbErr: any) {
              console.error('[Meta Sync] FB Sync Error:', fbErr);
              syncSummary.errors.push(`FB Sync Error: ${fbErr.message}`);
            }
          }

          // 3. Sync Instagram Business Media & Comments
          if (instagram_account_id) {
            try {
              console.log(`[Meta Sync] Fetching IG media for account ${instagram_account_id}...`);
              // Fetch last 15 Instagram media
              const igMediaRes = await fetch(
                `https://graph.facebook.com/v20.0/${instagram_account_id}/media?fields=id,caption,permalink,timestamp&limit=15`,
                {
                  headers: { 'Authorization': `Bearer ${page_access_token}` }
                }
              );

              if (igMediaRes.ok) {
                const igMediaData = await igMediaRes.json() as any;
                const mediaItems = igMediaData.data || [];
                syncSummary.instagramMediaSynced = mediaItems.length;

                for (const media of mediaItems) {
                  // Register media as post in database
                  await pool.query(`
                    INSERT INTO meta_posts (id, permalink, is_ad, last_synced_at)
                    VALUES ($1, $2, false, now())
                    ON CONFLICT (id) DO UPDATE
                    SET permalink = EXCLUDED.permalink, last_synced_at = now()
                  `, [media.id, media.permalink]);

                  // Fetch comments for this media
                  const commentsRes = await fetch(
                    `https://graph.facebook.com/v20.0/${media.id}/comments?fields=id,text,from,timestamp,parent_id&limit=25`,
                    {
                      headers: { 'Authorization': `Bearer ${page_access_token}` }
                    }
                  );

                  if (commentsRes.ok) {
                    const commentsData = await commentsRes.json() as any;
                    for (const comment of commentsData.data || []) {
                      const commentId = comment.id;
                      const senderId = comment.from ? comment.from.id : '';
                      const username = comment.from ? comment.from.username : 'ig_user';
                      const message = comment.text;
                      const parentId = comment.parent_id || null;
                      const createdAt = comment.timestamp ? new Date(comment.timestamp) : new Date();

                      // Skip self-comments
                      if (senderId === instagram_account_id || username.toLowerCase().includes('araahoney')) {
                        continue;
                      }

                      // Insert comment as unreplied if not exists
                      const insComment = await pool.query(`
                        INSERT INTO meta_comments (id, post_id, parent_id, username, message, replied, channel, created_at)
                        VALUES ($1, $2, $3, $4, $5, false, 'instagram', $6)
                        ON CONFLICT (id) DO NOTHING
                        RETURNING id
                      `, [commentId, media.id, parentId, username, message, createdAt]);

                      if (insComment.rowCount && insComment.rowCount > 0) {
                        syncSummary.commentsSynced++;
                      }
                    }
                  }
                }
              } else {
                const errText = await igMediaRes.text();
                syncSummary.errors.push(`IG media fetch failed: ${errText}`);
              }
            } catch (igErr: any) {
              console.error('[Meta Sync] IG Sync Error:', igErr);
              syncSummary.errors.push(`IG Sync Error: ${igErr.message}`);
            }
          }

          await pool.end();
          return new Response(JSON.stringify({ 
            message: 'Sync completed successfully.', 
            summary: syncSummary 
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error: any) {
          console.error('[Meta Comments Sync Error]:', error);
          if (pool) await pool.end();
          return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }
  }
});
