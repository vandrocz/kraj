import { Hono } from 'hono';
import { normalizeHashtag } from '../hashtags.js';

export const hashtagsRoutes = new Hono();

// GET /api/hashtags/trending?limit=10
hashtagsRoutes.get('/trending', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '10', 10), 30);
  const { results } = await c.env.DB.prepare(
    `SELECT hashtag, COUNT(*) AS count
     FROM post_hashtags
     WHERE created_at >= datetime('now', '-30 days')
     GROUP BY hashtag
     ORDER BY count DESC
     LIMIT ?`,
  ).bind(limit).all();
  return c.json({ hashtags: results });
});

// GET /api/hashtags/:tag/posts?limit=30&cursor=...
hashtagsRoutes.get('/:tag/posts', async (c) => {
  const tag = normalizeHashtag(c.req.param('tag'));
  if (!tag) return c.json({ posts: [] });
  const limit = Math.min(parseInt(c.req.query('limit') || '30', 10), 60);

  const { results } = await c.env.DB.prepare(
    `SELECT posts.id, posts.text_content, posts.content_html, posts.image_url, posts.created_at,
            posts.target_feed, posts.user_id,
            COALESCE(o.id, a.id, r.id) AS business_id,
            COALESCE(o.name, a.name, r.name) AS business_name,
            COALESCE(o.type, a.type, r.type) AS business_type,
            COALESCE(o.region, a.region, r.region) AS region,
            COALESCE(o.district, a.district, r.district) AS district,
            COALESCE(o.city, a.city, r.city) AS city,
            COALESCE(o.is_verified, a.is_verified, r.is_verified) AS is_verified,
            COALESCE(o.logo_url, a.image_url, r.image_url) AS logo_url
     FROM post_hashtags
     JOIN posts ON posts.id = post_hashtags.post_id
     LEFT JOIN organizations o ON o.id = posts.business_id AND posts.target_feed = 'organization'
     LEFT JOIN accommodation a ON a.id = posts.business_id AND posts.target_feed = 'accommodation'
     LEFT JOIN restaurants r ON r.id = posts.business_id AND posts.target_feed = 'gastro'
     WHERE post_hashtags.hashtag = ? AND posts.status = 'published'
     ORDER BY posts.created_at DESC
     LIMIT ?`,
  ).bind(tag, limit).all();

  // Doplň media
  const ids = results.map((r) => r.id);
  const mediaMap = {};
  if (ids.length > 0) {
    const ph = ids.map(() => '?').join(',');
    const { results: mrows } = await c.env.DB.prepare(
      `SELECT post_id, image_url FROM post_media WHERE post_id IN (${ph}) ORDER BY sort_order`,
    ).bind(...ids).all();
    for (const r of mrows) {
      if (!mediaMap[r.post_id]) mediaMap[r.post_id] = [];
      mediaMap[r.post_id].push(r.image_url);
    }
  }

  // Likes
  const out = await Promise.all(results.map(async (p) => {
    const likesRaw = await c.env.NASKRAJ_LAJKY.get(`likecount:post:${p.id}`);
    const cc = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM comments WHERE post_id = ?`).bind(p.id).first();
    return {
      id: p.id,
      text: p.text_content,
      html: p.content_html || p.text_content,
      image_url: p.image_url,
      media: mediaMap[p.id] || (p.image_url ? [p.image_url] : []),
      created_at: p.created_at,
      comment_count: cc?.n || 0,
      likes: likesRaw ? parseInt(likesRaw, 10) : 0,
      business: {
        id: p.business_id,
        name: p.business_name,
        type: p.business_type,
        region: p.region,
        district: p.district,
        city: p.city,
        is_verified: !!p.is_verified,
        logo_url: p.logo_url,
      },
    };
  }));

  return c.json({ tag, posts: out });
});

// GET /api/hashtags/suggest?q=...
hashtagsRoutes.get('/suggest', async (c) => {
  const q = normalizeHashtag(c.req.query('q') || '');
  if (!q || q.length < 1) return c.json({ suggestions: [] });
  const { results } = await c.env.DB.prepare(
    `SELECT hashtag, COUNT(*) AS count FROM post_hashtags
     WHERE hashtag LIKE ?
     GROUP BY hashtag ORDER BY count DESC LIMIT 8`,
  ).bind(`${q}%`).all();
  return c.json({ suggestions: results });
});
