import { Hono } from 'hono';

export const seoRoutes = new Hono();

const SITE_URL = 'https://naskraj.vandro.cz';
const DEFAULT_IMAGE = 'https://cdn.vandro.cz/Untitled15_20260522160351.png';

seoRoutes.get('/og', async (c) => {
  const type = c.req.query('type') || '';
  const kind = c.req.query('kind') || '';
  const id = c.req.query('id') || '';
  if (!type || !id) return c.json({ error: 'Chýba typ nebo id.' }, 400);

  const defaultOg = {
    title: 'Náš kraj — regionální platforma',
    description: 'Objevuj hrady, zámky, ubytování a gastro v Česku.',
    image: DEFAULT_IMAGE,
    url: SITE_URL,
  };

  try {
    if (type === 'profile') {
      const table = { organizations: 'organizations', accommodation: 'accommodation', restaurants: 'restaurants', user: 'users' }[kind];
      if (!table) return c.json(defaultOg);
      const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
      if (!row) return c.json(defaultOg);
      const name = row.name || row.display_name || 'Profil';
      const desc = row.description || row.bio || 'Profil na Náš kraj';
      const image = row.cover_url || row.logo_url || row.image_url || row.avatar_url || DEFAULT_IMAGE;
      const profilePath = kind === 'user' ? `?profile=user:${id}` : `?profile=${kind}:${id}`;
      return c.json({
        title: `${name} — Náš kraj`,
        description: desc.slice(0, 160),
        image,
        url: `${SITE_URL}/${profilePath}`,
      });
    }

    if (type === 'post') {
      const row = await c.env.DB.prepare(
        `SELECT posts.*, o.name AS org_name, a.name AS acc_name, r.name AS rest_name,
                COALESCE(o.logo_url, a.image_url, r.image_url) AS biz_logo
         FROM posts
         LEFT JOIN organizations o ON o.id = posts.business_id AND posts.target_feed = 'organization'
         LEFT JOIN accommodation a ON a.id = posts.business_id AND posts.target_feed = 'accommodation'
         LEFT JOIN restaurants r ON r.id = posts.business_id AND posts.target_feed = 'gastro'
         WHERE posts.id = ?`,
      ).bind(id).first();
      if (!row) return c.json(defaultOg);
      const biz = row.org_name || row.acc_name || row.rest_name || 'Náš kraj';
      const text = (row.text_content || '').slice(0, 160) || 'Příspěvek na Náš kraj';
      const image = row.image_url || row.biz_logo || DEFAULT_IMAGE;
      return c.json({
        title: `${biz} — Náš kraj`,
        description: text,
        image,
        url: `${SITE_URL}/?post=${id}`,
      });
    }

    if (type === 'event') {
      const row = await c.env.DB.prepare(
        `SELECT events.*, COALESCE(o.name, a.name, r.name) AS biz_name
         FROM events
         LEFT JOIN organizations o ON o.id = events.business_id AND events.business_kind = 'organizations'
         LEFT JOIN accommodation a ON a.id = events.business_id AND events.business_kind = 'accommodation'
         LEFT JOIN restaurants r ON r.id = events.business_id AND events.business_kind = 'restaurants'
         WHERE events.id = ?`,
      ).bind(id).first();
      if (!row) return c.json(defaultOg);
      const loc = row.location_name || row.city || '';
      const desc = `${row.start_at || ''} · ${loc} — ${(row.description || '').slice(0, 120)}`;
      return c.json({
        title: `${row.title} — Akce`,
        description: desc,
        image: row.cover_image_url || DEFAULT_IMAGE,
        url: `${SITE_URL}/?event=${id}`,
      });
    }
  } catch (err) {
    console.error('OG error:', err);
  }

  return c.json(defaultOg);
});
