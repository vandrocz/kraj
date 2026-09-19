import { Hono } from 'hono';

export const seoRoutes = new Hono();

seoRoutes.get('/og', async (c) => {
  const type = c.req.query('type') || '';
  const kind = c.req.query('kind') || '';
  const id = c.req.query('id') || '';
  if (!type || !id) return c.json({ error: 'Chýba typ nebo id.' }, 400);

  const baseUrl = 'https://naskraj.vandro.cz';
  const defaultOg = {
    title: 'Náš kraj — regionální platforma',
    description: 'Objevuj hrady, zámky, ubytování a gastro v Česku.',
    image: `${baseUrl}/assets/og-default.jpg`,
    url: baseUrl,
  };

  try {
    if (type === 'profile') {
      const table = { organizations: 'organizations', accommodation: 'accommodation', restaurants: 'restaurants', user: 'users' }[kind];
      if (!table) return c.json(defaultOg);
      const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
      if (!row) return c.json(defaultOg);
      const name = row.name || row.display_name || 'Profil';
      const desc = row.description || row.bio || `Profil na Náš kraj`;
      const image = row.cover_url || row.logo_url || row.image_url || row.avatar_url || defaultOg.image;
      return c.json({ title: `${name} — Náš kraj`, description: desc.slice(0, 160), image, url: `${baseUrl}/?profile=${kind}:${id}` });
    }

    if (type === 'post') {
      const row = await c.env.DB.prepare(
        `SELECT posts.*, o.name AS org_name, a.name AS acc_name, r.name AS rest_name
         FROM posts
         LEFT JOIN organizations o ON o.id = posts.business_id AND posts.target_feed = 'organization'
         LEFT JOIN accommodation a ON a.id = posts.business_id AND posts.target_feed = 'accommodation'
         LEFT JOIN restaurants r ON r.id = posts.business_id AND posts.target_feed = 'gastro'
         WHERE posts.id = ?`,
      ).bind(id).first();
      if (!row) return c.json(defaultOg);
      const biz = row.org_name || row.acc_name || row.rest_name || '';
      const text = (row.text_content || '').slice(0, 160) || 'Příspěvek na Náš kraj';
      const image = row.image_url || defaultOg.image;
      return c.json({ title: `${biz} — Náš kraj`, description: text, image, url: `${baseUrl}/?post=${id}` });
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
      const desc = `${row.start_at || ''} · ${row.location_name || row.city || ''} — ${(row.description || '').slice(0, 120)}`;
      return c.json({
        title: `${row.title} — Akce`,
        description: desc,
        image: row.cover_image_url || defaultOg.image,
        url: `${baseUrl}/?event=${id}`,
      });
    }

    if (type === 'project') {
      const row = await c.env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
      if (!row) return c.json(defaultOg);
      const desc = `${row.current_amount} / ${row.target_amount} Kč — ${(row.description || '').slice(0, 120)}`;
      return c.json({ title: `${row.title} — Sbírka`, description: desc, image: row.cover_image_url || defaultOg.image, url: `${baseUrl}/?project=${id}` });
    }
  } catch (err) {
    console.error('OG error:', err);
  }

  return c.json(defaultOg);
});
