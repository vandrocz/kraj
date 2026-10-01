import { Hono } from 'hono';
import { newId } from '../auth.js';
import { logAudit } from '../audit.js';

export const bannersPublicRoutes = new Hono();
export const bannersAdminRoutes = new Hono();

// PUBLIC — aktívne bannery (viditeľné pre všetkých)
bannersPublicRoutes.get('/', async (c) => {
  const now = new Date().toISOString();
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT id, title, description, image_url, link_url, link_text, bg_color, text_color
       FROM banners
       WHERE active = 1
         AND (starts_at IS NULL OR starts_at <= ?)
         AND (ends_at IS NULL OR ends_at >= ?)
       ORDER BY sort_order ASC, created_at DESC
       LIMIT 5`,
    ).bind(now, now).all();
    return c.json({ banners: results || [] });
  } catch (err) {
    console.warn('[banners] tabuľka ešte neexistuje:', err.message);
    return c.json({ banners: [] });
  }
});

function requireAdmin(c) {
  const user = c.get('user');
  return user && user.role === 'admin';
}

// ADMIN LIST
bannersAdminRoutes.get('/', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM banners ORDER BY sort_order ASC, created_at DESC LIMIT 100`,
  ).all();
  return c.json({ banners: results || [] });
});

// ADMIN CREATE
bannersAdminRoutes.post('/', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const admin = c.get('user');
  const body = await c.req.json().catch(() => ({}));

  const title = (body.title || '').toString().trim().slice(0, 200);
  if (!title) return c.json({ error: 'Chýba titulok.' }, 400);

  const id = newId('banner');
  await c.env.DB.prepare(
    `INSERT INTO banners (id, title, description, image_url, link_url, link_text, bg_color, text_color, active, starts_at, ends_at, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, title,
    (body.description || '').toString().slice(0, 500) || null,
    (body.image_url || '').toString().slice(0, 500) || null,
    (body.link_url || '').toString().slice(0, 500) || null,
    (body.link_text || '').toString().slice(0, 60) || null,
    (body.bg_color || '#2FBF71').toString().slice(0, 20),
    (body.text_color || '#FFFFFF').toString().slice(0, 20),
    body.active === false || body.active === 0 ? 0 : 1,
    (body.starts_at || '').toString() || null,
    (body.ends_at || '').toString() || null,
    parseInt(body.sort_order, 10) || 0,
  ).run();

  await logAudit(c.env, { adminId: admin.sub, action: 'create_banner', targetType: 'banner', targetId: id });
  return c.json({ id, ok: true }, 201);
});

// ADMIN UPDATE
bannersAdminRoutes.patch('/:id', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const sets = [], params = [];
  for (const f of ['title', 'description', 'image_url', 'link_url', 'link_text', 'bg_color', 'text_color', 'starts_at', 'ends_at']) {
    if (f in body) { sets.push(`${f} = ?`); params.push(body[f] ?? null); }
  }
  if ('active' in body) { sets.push('active = ?'); params.push(body.active ? 1 : 0); }
  if ('sort_order' in body) { sets.push('sort_order = ?'); params.push(parseInt(body.sort_order, 10) || 0); }

  if (sets.length === 0) return c.json({ error: 'Žiadne polia.' }, 400);
  params.push(id);
  await c.env.DB.prepare(`UPDATE banners SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ ok: true });
});

// ADMIN DELETE
bannersAdminRoutes.delete('/:id', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const admin = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM banners WHERE id = ?`).bind(id).run();
  await logAudit(c.env, { adminId: admin.sub, action: 'delete_banner', targetType: 'banner', targetId: id });
  return c.json({ ok: true });
});
