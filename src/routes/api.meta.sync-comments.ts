process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { createFileRoute } from '@tanstack/react-router';
import pg from 'pg';

interface SyncSummary {
  facebookPostsSynced: number;
  instagramMediaSynced: number;
  adsSynced: number;
  commentsSynced: number;
  errors: string[];
}

async function syncFbComments(
  pool: pg.Pool,
  page_access_token: string,
  facebook_page_id: string,
  postId: string,
  syncSummary: SyncSummary
) {
  let nextUrl: string | null = `https://graph.facebook.com/v20.0/${postId}/comments?fields=id,message,from,created_time,parent_id&limit=100&filter=stream&order=reverse_chronological&access_token=${page_access_token}`;
  let pageCount = 1;
  let commentsProcessed = 0;
  const maxCommentsToSync = 500; // safety ceiling per post

  while (nextUrl && commentsProcessed < maxCommentsToSync) {
    try {
      const res = await fetch(nextUrl);
      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Meta Sync] FB Comment fetch failed for post ${postId}:`, errText);
        syncSummary.errors.push(`FB post ${postId} comments fetch failed: ${errText}`);
        break;
      }

      const data = await res.json() as any;
      const comments = data.data || [];
      if (comments.length === 0) {
        break;
      }

      let hitExistingComment = false;

      for (const comment of comments) {
        const commentId = comment.id;
        const senderId = comment.from ? comment.from.id : '';
        const username = comment.from?.name || comment.from?.username || 'Facebook User';
        const message = comment.message;
        const parentId = comment.parent_id || null;
        const createdAt = new Date(comment.created_time);

        commentsProcessed++;

        // Skip self-comments
        if (senderId === facebook_page_id || username.toLowerCase().includes('araa honey')) {
          continue;
        }

        // Check if this comment ID already exists
        const existRes = await pool.query("SELECT id FROM meta_comments WHERE id = $1 LIMIT 1", [commentId]);
        if (existRes.rows.length > 0) {
          hitExistingComment = true;
          console.log(`[Meta Sync] Found existing comment ${commentId} for post ${postId}. Stopping pagination.`);
          break;
        }

        // Insert comment as unreplied if not exists
        const insComment = await pool.query(`
          INSERT INTO meta_comments (id, post_id, parent_id, username, message, replied, channel, created_at)
          VALUES ($1, $2, $3, $4, $5, false, 'facebook', $6)
          ON CONFLICT (id) DO NOTHING
          RETURNING id
        `, [commentId, postId, parentId, username, message, createdAt]);

        if (insComment.rowCount && insComment.rowCount > 0) {
          syncSummary.commentsSynced++;
        }
      }

      if (hitExistingComment) {
        break;
      }

      nextUrl = data.paging?.next || null;
      pageCount++;
    } catch (err: any) {
      console.error(`[Meta Sync] FB Comment fetch exception for post ${postId}:`, err);
      syncSummary.errors.push(`FB post ${postId} comments fetch error: ${err.message}`);
      break;
    }
  }
}

async function syncIgComments(
  pool: pg.Pool,
  page_access_token: string,
  instagram_account_id: string,
  mediaId: string,
  syncSummary: SyncSummary
) {
  let nextUrl: string | null = `https://graph.facebook.com/v20.0/${mediaId}/comments?fields=id,text,from,timestamp,parent_id&limit=100&access_token=${page_access_token}`;
  let pageCount = 1;
  let commentsProcessed = 0;
  const maxCommentsToSync = 300;

  while (nextUrl && commentsProcessed < maxCommentsToSync) {
    try {
      const res = await fetch(nextUrl);
      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Meta Sync] IG Comment fetch failed for media ${mediaId}:`, errText);
        syncSummary.errors.push(`IG media ${mediaId} comments fetch failed: ${errText}`);
        break;
      }

      const data = await res.json() as any;
      const comments = data.data || [];
      if (comments.length === 0) {
        break;
      }

      let hitExistingComment = false;

      for (const comment of comments) {
        const commentId = comment.id;
        const senderId = comment.from ? comment.from.id : '';
        const username = comment.from?.username || 'ig_user';
        const message = comment.text;
        const parentId = comment.parent_id || null;
        const createdAt = comment.timestamp ? new Date(comment.timestamp) : new Date();

        commentsProcessed++;

        // Skip self-comments
        if (senderId === instagram_account_id || username.toLowerCase().includes('araahoney')) {
          continue;
        }

        // Check if this comment ID already exists
        const existRes = await pool.query("SELECT id FROM meta_comments WHERE id = $1 LIMIT 1", [commentId]);
        if (existRes.rows.length > 0) {
          hitExistingComment = true;
          break;
        }

        // Insert comment as unreplied if not exists
        const insComment = await pool.query(`
          INSERT INTO meta_comments (id, post_id, parent_id, username, message, replied, channel, created_at)
          VALUES ($1, $2, $3, $4, $5, false, 'instagram', $6)
          ON CONFLICT (id) DO NOTHING
          RETURNING id
        `, [commentId, mediaId, parentId, username, message, createdAt]);

        if (insComment.rowCount && insComment.rowCount > 0) {
          syncSummary.commentsSynced++;
        }
      }

      if (hitExistingComment) {
        break;
      }

      nextUrl = data.paging?.next || null;
      pageCount++;
    } catch (err: any) {
      console.error(`[Meta Sync] IG Comment fetch exception for media ${mediaId}:`, err);
      syncSummary.errors.push(`IG media ${mediaId} comments fetch error: ${err.message}`);
      break;
    }
  }
}

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

          // Fetch Meta Ads config for dark posts sync
          const adsConfigRes = await pool.query("SELECT value FROM app_settings WHERE key = 'meta_ads_config'");
          const adsConfig = adsConfigRes.rows[0]?.value || {};
          const { token: adsToken = '', defaultAccountId = '' } = adsConfig;

          const syncSummary: SyncSummary = {
            facebookPostsSynced: 0,
            instagramMediaSynced: 0,
            adsSynced: 0,
            commentsSynced: 0,
            errors: []
          };

          // Collect unique FB posts to sync
          const fbPostsToSync = new Map<string, { permalink: string | null; isAd: boolean }>();

          // 2. Sync Facebook Page Posts (up to 50)
          if (facebook_page_id) {
            try {
              console.log(`[Meta Sync] Fetching FB Page posts for page ${facebook_page_id}...`);
              const fbPostsRes = await fetch(
                `https://graph.facebook.com/v20.0/${facebook_page_id}/feed?fields=id,message,permalink_url,created_time&limit=50`,
                {
                  headers: { 'Authorization': `Bearer ${page_access_token}` }
                }
              );

              if (fbPostsRes.ok) {
                const fbPostsData = await fbPostsRes.json() as any;
                const posts = fbPostsData.data || [];
                syncSummary.facebookPostsSynced = posts.length;

                for (const post of posts) {
                  fbPostsToSync.set(post.id, { permalink: post.permalink_url, isAd: false });
                }
              } else {
                const errText = await fbPostsRes.text();
                syncSummary.errors.push(`FB posts fetch failed: ${errText}`);
              }
            } catch (fbErr: any) {
              console.error('[Meta Sync] FB Feed Sync Error:', fbErr);
              syncSummary.errors.push(`FB Feed Sync Error: ${fbErr.message}`);
            }
          }

          // 3. Sync Active Ad Creatives (Dark Posts / Inline Ads - up to 150)
          if (defaultAccountId && adsToken) {
            try {
              console.log(`[Meta Sync] Fetching ad creatives for account ${defaultAccountId}...`);
              const adRes = await fetch(
                `https://graph.facebook.com/v20.0/${defaultAccountId}/adcreatives?fields=id,name,effective_object_story_id,permalink_url&limit=150&access_token=${adsToken}`
              );

              if (adRes.ok) {
                const adData = await adRes.json() as any;
                const creatives = adData.data || [];
                syncSummary.adsSynced = creatives.length;

                for (const creative of creatives) {
                  const postId = creative.effective_object_story_id;
                  if (postId) {
                    if (!fbPostsToSync.has(postId)) {
                      fbPostsToSync.set(postId, { permalink: creative.permalink_url, isAd: true });
                    }
                  }
                }
              } else {
                const errText = await adRes.text();
                console.error(`[Meta Sync] Fetching ad creatives failed:`, errText);
                syncSummary.errors.push(`Gagal memuat ad creatives dari Meta Ads: ${errText}`);
              }
            } catch (adErr: any) {
              console.error('[Meta Sync] Ad creatives Sync Error:', adErr);
              syncSummary.errors.push(`Ad Sync Error: ${adErr.message}`);
            }
          }

          // Register all unique FB posts/ads in the database
          console.log(`[Meta Sync] Registering ${fbPostsToSync.size} unique FB posts/ads...`);
          for (const [postId, info] of fbPostsToSync.entries()) {
            await pool.query(`
              INSERT INTO meta_posts (id, permalink, is_ad, last_synced_at)
              VALUES ($1, $2, $3, now())
              ON CONFLICT (id) DO UPDATE
              SET permalink = COALESCE(meta_posts.permalink, EXCLUDED.permalink), 
                  is_ad = EXCLUDED.is_ad,
                  last_synced_at = now()
            `, [postId, info.permalink, info.isAd]);
          }

          // Sync comments for all unique FB posts/ads with concurrency limit of 5
          const postIdsArray = Array.from(fbPostsToSync.keys());
          const concurrencyLimit = 5;
          console.log(`[Meta Sync] Syncing comments for FB posts/ads in batches of ${concurrencyLimit}...`);
          for (let i = 0; i < postIdsArray.length; i += concurrencyLimit) {
            const batch = postIdsArray.slice(i, i + concurrencyLimit);
            await Promise.all(
              batch.map(postId => syncFbComments(pool!, page_access_token, facebook_page_id, postId, syncSummary))
            );
          }

          // 4. Sync Instagram Business Media & Comments (up to 30)
          if (instagram_account_id) {
            try {
              console.log(`[Meta Sync] Fetching IG media for account ${instagram_account_id}...`);
              const igMediaRes = await fetch(
                `https://graph.facebook.com/v20.0/${instagram_account_id}/media?fields=id,caption,permalink,timestamp&limit=30`,
                {
                  headers: { 'Authorization': `Bearer ${page_access_token}` }
                }
              );

              if (igMediaRes.ok) {
                const igMediaData = await igMediaRes.json() as any;
                const mediaItems = igMediaData.data || [];
                syncSummary.instagramMediaSynced = mediaItems.length;

                // Register all IG posts
                for (const media of mediaItems) {
                  await pool.query(`
                    INSERT INTO meta_posts (id, permalink, is_ad, last_synced_at)
                    VALUES ($1, $2, false, now())
                    ON CONFLICT (id) DO UPDATE
                    SET permalink = EXCLUDED.permalink, last_synced_at = now()
                  `, [media.id, media.permalink]);
                }

                // Sync comments for IG posts in batches of 5
                const mediaIdsArray = mediaItems.map((m: any) => m.id);
                for (let i = 0; i < mediaIdsArray.length; i += concurrencyLimit) {
                  const batch = mediaIdsArray.slice(i, i + concurrencyLimit);
                  await Promise.all(
                    batch.map(mediaId => syncIgComments(pool!, page_access_token, instagram_account_id, mediaId, syncSummary))
                  );
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
