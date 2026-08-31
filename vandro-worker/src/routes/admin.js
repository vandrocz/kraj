import { Hono } from 'hono';
import { newId } from '../auth.js';
import { runDailyDistribution } from '../cron.js';

export const adminRoutes = new Hono();

function requireAdmin(c) {
  const user = c.get('user');
  return user && user.role === 'admin';
}

const BUSINESS_TABLES = ['organizations', 'accommodation', 'restaurants'];

adminRoutes.get('/pending', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);

  const [orgs, acc, rest] = await Promise.all([
    c.env.DB.prepare(`SELECT id, name, type, region, district FROM organizations WHERE is_verified = 0`).all(),
    c.env.DB.prepare(`SELECT id, name, type, region, district FROM accommodation WHERE is_verified = 0`).all(),
    c.env.DB.prepare(`SELECT id, name, type, region, district FROM restaurants WHERE is_verified = 0`).all(),
  ]);

  return c.json({
    organizations: orgs.results,
    accommodation: acc.results,
    restaurants: rest.results,
  });
});

adminRoutes.post('/verify/:kind/:id', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const kind = c.req.param('kind'); // 'organizations' | 'accommodation' | 'restaurants'
  const id = c.req.param('id');
  if (!BUSINESS_TABLES.includes(kind)) return c.json({ error: 'Neznámy typ podniku.' }, 400);

  await c.env.DB.prepare(`UPDATE ${kind} SET is_verified = 1 WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

adminRoutes.post('/projects', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const { organization_id, title, description, cover_image_url, target_amount } = body;
  if (!organization_id || !title || !target_amount) {
    return c.json({ error: 'Vyžaduje sa organization_id, title a target_amount.' }, 400);
  }

  const id = newId('proj');
  await c.env.DB.prepare(
    `INSERT INTO projects (id, organization_id, title, description, cover_image_url, target_amount, current_amount, status)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'waiting')`,
  ).bind(id, organization_id, title, description || '', cover_image_url || null, target_amount).run();

  return c.json({ id }, 201);
});

adminRoutes.get('/reports', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT reports.id, reports.reason, reports.created_at, reports.resolved,
            posts.id AS post_id, posts.text_content, posts.image_url, posts.target_feed,
            users.display_name AS reporter_name
     FROM reports
     JOIN posts ON posts.id = reports.post_id
     JOIN users ON users.id = reports.reporter_id
     WHERE reports.resolved = 0
     ORDER BY reports.created_at DESC`,
  ).all();
  return c.json({ reports: results });
});

adminRoutes.post('/reports/:id/resolve', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare('UPDATE reports SET resolved = 1 WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

adminRoutes.delete('/posts/:id', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare(`UPDATE posts SET status = 'removed' WHERE id = ?`).bind(id).run();
  await c.env.DB.prepare(`UPDATE reports SET resolved = 1 WHERE post_id = ?`).bind(id).run();
  return c.json({ ok: true });
});

// Manuálne spustenie cronu na testovanie, chránené tajným kľúčom (nie JWT, pre jednoduchosť z CLI)
adminRoutes.post('/run-distribution-now', async (c) => {
  const key = c.req.header('X-Cron-Secret');
  if (!key || key !== c.env.CRON_SECRET) return c.json({ error: 'Neautorizované.' }, 401);
  const summary = await runDailyDistribution(c.env);
  return c.json(summary);
});
