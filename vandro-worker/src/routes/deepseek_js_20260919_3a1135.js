import { Hono } from 'hono';

export const wishlistRoutes = new Hono();

const VALID_KINDS = ['organizations', 'accommodation', 'restaurants'];

wishlistRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const businessId = (body.business_id || '').toString();
  const businessKind = (body.business_kind || '').toString();
  const note = (body.note || '').toString().slice(0, 500) || null;

  if (!VALID_KINDS.includes(businessKind)) return c.json({ error: 'Neplatný typ.' }, 400);
  if (!businessId) return c.json({ error: 'Chýba business_id.' }, 400);

  const existing = await c.env.DB.prepare(
    `SELECT 1 FROM wishlist WHERE user_id = ? AND business_id = ? AND business_kind = ?`,
  ).bind(user.sub, businessId, businessKind).first();

  if (existing) {
    await c.env.DB.prepare(
      `DELETE FROM wishlist WHERE user_id = ? AND business_id = ? AND business_kind = ?`,
    ).bind(user.sub, businessId, businessKind).run();
    return c.json({ in_wishlist: false });
  }

  await c.env.DB.prepare(
    `INSERT INTO wishlist (user_id, business_id, business_kind, note) VALUES (?, ?, ?, ?)`,
  ).bind(user.sub, businessId, businessKind, note).run();
  return c.json({ in_wishlist: true }, 201);
});

wishlistRoutes.get('/me', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT wishlist.business_id, wishlist.business_kind, wishlist.note, wishlist.created_at,
            COALESCE(o.name, a.name, r.name) AS business_name,
            COALESCE(o.logo_url, a.image_url, r.image_url) AS business_image,
            COALESCE(o.region, a.region, r.region) AS region,
            COALESCE(o.city, a.city, r.city) AS city
     FROM wishlist
     LEFT JOIN organizations o ON o.id = wishlist.business_id AND wishlist.business_kind = 'organizations'
     LEFT JOIN accommodation a ON a.id = wishlist.business_id AND wishlist.business_kind = 'accommodation'
     LEFT JOIN restaurants r ON r.id = wishlist.business_id AND wishlist.business_kind = 'restaurants'
     WHERE wishlist.user_id = ?
     ORDER BY wishlist.created_at DESC`,
  ).bind(user.sub).all();
  return c.json({ wishlist: results });
});

wishlistRoutes.get('/me/status/:kind/:id', async (c) => {
  const user = c.get('user');
  const kind = c.req.param('kind');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT 1 FROM wishlist WHERE user_id = ? AND business_id = ? AND business_kind = ?`,
  ).bind(user.sub, id, kind).first();
  return c.json({ in_wishlist: !!row });
});