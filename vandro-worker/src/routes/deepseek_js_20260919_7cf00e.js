import { Hono } from 'hono';
import { newId } from '../auth.js';
import { checkText, flagContent } from '../moderation.js';
import { computeUserBadges } from '../badges.js';
import { rateLimit } from '../ratelimit.js';

export const reviewsRoutes = new Hono();

const VALID_KINDS = ['organizations', 'accommodation', 'restaurants'];

reviewsRoutes.post('/', async (c) => {
  const user = c.get('user');
  const rl = await rateLimit(c.env, 'review', user.sub, 20, 3600);
  if (!rl.ok) return c.json({ error: 'Příliš mnoho recenzí.' }, 429);

  const body = await c.req.json().catch(() => ({}));
  const businessId = (body.business_id || '').toString();
  const businessKind = (body.business_kind || '').toString();
  const rating = parseInt(body.rating, 10);
  const title = (body.title || '').toString().slice(0, 200) || null;
  const text = (body.text || '').toString().slice(0, 3000) || null;

  if (!VALID_KINDS.includes(businessKind)) return c.json({ error: 'Neplatný typ podniku.' }, 400);
  if (!businessId) return c.json({ error: 'Chýba business_id.' }, 400);
  if (!rating || rating < 1 || rating > 5) return c.json({ error: 'Hodnocení musí být 1-5.' }, 400);

  const biz = await c.env.DB.prepare(`SELECT id FROM ${businessKind} WHERE id = ?`).bind(businessId).first();
  if (!biz) return c.json({ error: 'Podnik nenájdený.' }, 404);

  if (text) {
    const mod = checkText(text);
    if (!mod.clean && mod.severity >= 2) {
      await flagContent(c.env, { userId: user.sub, reason: mod.reason, severity: mod.severity });
      return c.json({ error: 'Text obsahuje zakázaný obsah.' }, 400);
    }
  }

  const existing = await c.env.DB.prepare(
    `SELECT id FROM reviews WHERE user_id = ? AND business_id = ? AND business_kind = ?`,
  ).bind(user.sub, businessId, businessKind).first();

  let reviewId;
  if (existing) {
    await c.env.DB.prepare(
      `UPDATE reviews SET rating = ?, title = ?, text = ?, updated_at = datetime('now'), status = 'published' WHERE id = ?`,
    ).bind(rating, title, text, existing.id).run();
    reviewId = existing.id;
  } else {
    reviewId = newId('review');
    await c.env.DB.prepare(
      `INSERT INTO reviews (id, user_id, business_id, business_kind, rating, title, text) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(reviewId, user.sub, businessId, businessKind, rating, title, text).run();
  }

  let newBadges = [];
  try { newBadges = await computeUserBadges(c.env, user.sub); } catch {}

  return c.json({ id: reviewId, ok: true, updated: !!existing, new_badges: newBadges }, existing ? 200 : 201);
});

reviewsRoutes.get('/business/:kind/:id', async (c) => {
  const kind = c.req.param('kind');
  const id = c.req.param('id');
  if (!VALID_KINDS.includes(kind)) return c.json({ error: 'Neplatný typ.' }, 400);

  const { results } = await c.env.DB.prepare(
    `SELECT reviews.id, reviews.rating, reviews.title, reviews.text, reviews.created_at, reviews.updated_at,
            users.id AS user_id, users.display_name, users.avatar_url
     FROM reviews JOIN users ON users.id = reviews.user_id
     WHERE reviews.business_id = ? AND reviews.business_kind = ? AND reviews.status = 'published'
     ORDER BY reviews.created_at DESC LIMIT 100`,
  ).bind(id, kind).all();

  const agg = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total, AVG(rating) AS avg_rating,
            SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) AS r5,
            SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) AS r4,
            SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) AS r3,
            SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) AS r2,
            SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) AS r1
     FROM reviews WHERE business_id = ? AND business_kind = ? AND status = 'published'`,
  ).bind(id, kind).first();

  return c.json({
    reviews: results,
    summary: {
      total: agg?.total || 0,
      average: agg?.avg_rating ? Math.round(agg.avg_rating * 10) / 10 : 0,
      distribution: { 5: agg?.r5 || 0, 4: agg?.r4 || 0, 3: agg?.r3 || 0, 2: agg?.r2 || 0, 1: agg?.r1 || 0 },
    },
  });
});

reviewsRoutes.get('/me/:kind/:id', async (c) => {
  const user = c.get('user');
  const kind = c.req.param('kind');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT * FROM reviews WHERE user_id = ? AND business_id = ? AND business_kind = ?`,
  ).bind(user.sub, id, kind).first();
  return c.json({ review: row });
});

reviewsRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT user_id FROM reviews WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'Nenalezeno.' }, 404);
  if (row.user_id !== user.sub && user.role !== 'admin') return c.json({ error: 'Nemáš oprávnění.' }, 403);
  await c.env.DB.prepare(`UPDATE reviews SET status = 'removed' WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});