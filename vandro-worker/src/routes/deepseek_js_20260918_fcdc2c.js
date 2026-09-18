import { Hono } from 'hono';
import { newId } from '../auth.js';
import { rateLimit } from '../ratelimit.js';

export const storiesRoutes = new Hono();

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

// GET /api/stories/feed — stories od sledovaných + moje
storiesRoutes.get('/feed', async (c) => {
  const user = c.get('user');
  // Vymaž expirované
  await c.env.DB.prepare(`DELETE FROM stories WHERE expires_at < datetime('now')`).run();

  // Moje stories
  const my = await c.env.DB.prepare(
    `SELECT id, user_id, business_id, image_url, caption, created_at, expires_at FROM stories
     WHERE user_id = ? AND expires_at > datetime('now') ORDER BY created_at ASC`,
  ).bind(user.sub).all();

  // Stories od sledovaných userov
  const { results: followedStories } = await c.env.DB.prepare(
    `SELECT s.id, s.user_id, s.business_id, s.image_url, s.caption, s.created_at, s.expires_at,
            u.display_name AS author_name, u.avatar_url AS author_avatar
     FROM stories s
     JOIN users u ON u.id = s.user_id
     WHERE s.expires_at > datetime('now') AND s.user_id != ? AND s.user_id IN (
       SELECT target_id FROM follows WHERE follower_id = ? AND target_type = 'users'
     )
     ORDER BY s.created_at ASC`,
  ).bind(user.sub, user.sub).all();

  // Stories od sledovaných businessov (autor je user s rovnakou rolou, ale zobrazíme business)
  const { results: bizStories } = await c.env.DB.prepare(
    `SELECT s.id, s.user_id, s.business_id, s.image_url, s.caption, s.created_at, s.expires_at,
            COALESCE(o.name, a.name, r.name) AS business_name
     FROM stories s
     LEFT JOIN organizations o ON o.id = s.business_id
     LEFT JOIN accommodation a ON a.id = s.business_id
     LEFT JOIN restaurants r ON r.id = s.business_id
     WHERE s.expires_at > datetime('now') AND s.business_id IS NOT NULL
       AND s.business_id IN (
         SELECT target_id FROM follows WHERE follower_id = ?
           AND target_type IN ('organizations','accommodation','restaurants')
       )
     ORDER BY s.created_at ASC`,
  ).bind(user.sub).all();

  // Zoskup podľa autora
  function groupBy(list) {
    const map = new Map();
    for (const s of list) {
      const key = s.business_id || s.user_id;
      if (!map.has(key)) map.set(key, { key, author_name: s.business_name || s.author_name || 'Profil', author_avatar: s.author_avatar || null, stories: [] });
      map.get(key).stories.push({ id: s.id, image_url: s.image_url, caption: s.caption, created_at: s.created_at });
    }
    return Array.from(map.values());
  }

  const groups = [];
  if (my.results.length > 0) {
    const me = await c.env.DB.prepare(`SELECT display_name, avatar_url FROM users WHERE id = ?`).bind(user.sub).first();
    groups.push({
      key: 'me', is_me: true,
      author_name: me?.display_name || 'Já', author_avatar: me?.avatar_url || null,
      stories: my.results.map((s) => ({ id: s.id, image_url: s.image_url, caption: s.caption, created_at: s.created_at })),
    });
  }
  groups.push(...groupBy(followedStories), ...groupBy(bizStories));

  return c.json({ groups });
});

// POST /api/stories  { image_url, caption, business_id? }
storiesRoutes.post('/', async (c) => {
  const user = c.get('user');
  const rl = await rateLimit(c.env, 'story', user.sub, 10, 86400);
  if (!rl.ok) return c.json({ error: 'Denní limit stories vyčerpán.' }, 429);

  const body = await c.req.json().catch(() => ({}));
  const image_url = (body.image_url || '').toString();
  const caption = (body.caption || '').toString().slice(0, 200);
  const business_id = body.business_id ? body.business_id.toString() : null;
  if (!image_url) return c.json({ error: 'Chýba obrázek.' }, 400);

  const id = newId('story');
  const exp = new Date(Date.now() + STORY_TTL_MS).toISOString();
  await c.env.DB.prepare(
    `INSERT INTO stories (id, user_id, business_id, image_url, caption, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, user.sub, business_id, image_url, caption, exp).run();
  return c.json({ id, expires_at: exp }, 201);
});

// POST /api/stories/upload — multipart file → R2 → vráti URL
storiesRoutes.post('/upload', async (c) => {
  const user = c.get('user');
  const form = await c.req.parseBody();
  const file = form.file;
  if (!file || typeof file === 'string') return c.json({ error: 'Chýba soubor.' }, 400);
  const publicBase = c.env.R2_PUBLIC_BASE || 'https://media.vandro.cz';
  const ext = ((file.name || 'x.jpg').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = `stories/${newId()}.${ext}`;
  await c.env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || 'image/jpeg' } });
  return c.json({ url: `${publicBase}/${key}` }, 201);
});

// POST /api/stories/:id/view
storiesRoutes.post('/:id/view', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare(`INSERT OR IGNORE INTO story_views (story_id, viewer_id) VALUES (?, ?)`).bind(id, user.sub).run();
  return c.json({ ok: true });
});