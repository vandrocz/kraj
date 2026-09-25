import { Hono } from 'hono';
import { newId } from '../auth.js';
import { computeUserBadges } from '../badges.js';
import { rateLimit } from '../ratelimit.js';

export const checkinsRoutes = new Hono();

const VALID_KINDS = ['organizations', 'accommodation', 'restaurants'];

// POST /api/checkins
checkinsRoutes.post('/', async (c) => {
  const user = c.get('user');
  const rl = await rateLimit(c.env, 'checkin', user.sub, 20, 3600);
  if (!rl.ok) return c.json({ error: 'Příliš mnoho check-inů.' }, 429);

  const body = await c.req.json().catch(() => ({}));
  const businessId = (body.business_id || '').toString();
  const businessKind = (body.business_kind || '').toString();
  const note = (body.note || '').toString().slice(0, 500) || null;
  const imageUrl = (body.image_url || '').toString() || null;
  const geoLat = body.geo_lat ? parseFloat(body.geo_lat) : null;
  const geoLng = body.geo_lng ? parseFloat(body.geo_lng) : null;

  if (!VALID_KINDS.includes(businessKind)) return c.json({ error: 'Neplatný typ podniku.' }, 400);
  if (!businessId) return c.json({ error: 'Chýba business_id.' }, 400);

  const biz = await c.env.DB.prepare(`SELECT id FROM ${businessKind} WHERE id = ?`).bind(businessId).first();
  if (!biz) return c.json({ error: 'Podnik nenájdený.' }, 404);

  const recent = await c.env.DB.prepare(
    `SELECT id FROM checkins WHERE user_id = ? AND business_id = ? AND business_kind = ? AND visited_at >= datetime('now','-1 day') LIMIT 1`,
  ).bind(user.sub, businessId, businessKind).first();
  if (recent) return c.json({ ok: true, already: true, message: 'Už jsi tu byl(a) v posledních 24 hodinách.' });

  const id = newId('checkin');
  await c.env.DB.prepare(
    `INSERT INTO checkins (id, user_id, business_id, business_kind, note, image_url, geo_lat, geo_lng)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, user.sub, businessId, businessKind, note, imageUrl, geoLat, geoLng).run();

  let newBadges = [];
  try { newBadges = await computeUserBadges(c.env, user.sub); } catch (err) { console.error('badges:', err); }

  return c.json({ id, ok: true, new_badges: newBadges }, 201);
});

// GET /api/checkins/user/:id
checkinsRoutes.get('/user/:id', async (c) => {
  const id = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    `SELECT checkins.*,
            COALESCE(o.name, a.name, r.name) AS business_name,
            COALESCE(o.logo_url, a.image_url, r.image_url) AS business_logo,
            COALESCE(o.region, a.region, r.region) AS region,
            COALESCE(o.city, a.city, r.city) AS city
     FROM checkins
     LEFT JOIN organizations o ON o.id = checkins.business_id AND checkins.business_kind = 'organizations'
     LEFT JOIN accommodation a ON a.id = checkins.business_id AND checkins.business_kind = 'accommodation'
     LEFT JOIN restaurants r ON r.id = checkins.business_id AND checkins.business_kind = 'restaurants'
     WHERE checkins.user_id = ?
     ORDER BY checkins.visited_at DESC LIMIT 200`,
  ).bind(id).all();
  return c.json({ checkins: results });
});

// GET /api/checkins/business/:kind/:id
checkinsRoutes.get('/business/:kind/:id', async (c) => {
  const kind = c.req.param('kind');
  const id = c.req.param('id');
  if (!VALID_KINDS.includes(kind)) return c.json({ error: 'Neplatný typ.' }, 400);

  const { results } = await c.env.DB.prepare(
    `SELECT checkins.id, checkins.visited_at, checkins.note,
            users.id AS user_id, users.display_name, users.avatar_url
     FROM checkins JOIN users ON users.id = checkins.user_id
     WHERE checkins.business_id = ? AND checkins.business_kind = ?
     ORDER BY checkins.visited_at DESC LIMIT 50`,
  ).bind(id, kind).all();

  const count = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT user_id) AS n FROM checkins WHERE business_id = ? AND business_kind = ?`,
  ).bind(id, kind).first();

  return c.json({ checkins: results, unique_visitors: count?.n || 0 });
});

// GET /api/checkins/me/status/:kind/:id
checkinsRoutes.get('/me/status/:kind/:id', async (c) => {
  const user = c.get('user');
  const kind = c.req.param('kind');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT id, visited_at FROM checkins WHERE user_id = ? AND business_id = ? AND business_kind = ? ORDER BY visited_at DESC LIMIT 1`,
  ).bind(user.sub, id, kind).first();
  return c.json({ checked_in: !!row, last_visit: row?.visited_at || null });
});

// DELETE /api/checkins/:id
checkinsRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT id, user_id FROM checkins WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'Nenalezeno.' }, 404);
  if (row.user_id !== user.sub && user.role !== 'admin') return c.json({ error: 'Nemáš oprávnění.' }, 403);
  await c.env.DB.prepare('DELETE FROM checkins WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
