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
  const kind = c.req.param('kind');
  const id = c.req.param('id');
  if (!BUSINESS_TABLES.includes(kind)) return c.json({ error: 'Neznámy typ podniku.' }, 400);

  await c.env.DB.prepare(`UPDATE ${kind} SET is_verified = 1 WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

// ============================================================
// ŽIADOSTI O VERIFIKÁCIU
// ============================================================

adminRoutes.get('/verifications', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT verification_requests.*,
            users.display_name AS user_name, users.email AS user_email
     FROM verification_requests
     JOIN users ON users.id = verification_requests.user_id
     WHERE verification_requests.status = 'pending'
     ORDER BY verification_requests.created_at DESC LIMIT 100`,
  ).all();
  return c.json({ requests: results });
});

adminRoutes.post('/verifications/:id/approve', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const note = (body.note || '').slice(0, 500);

  const req = await c.env.DB.prepare(`SELECT * FROM verification_requests WHERE id = ?`).bind(id).first();
  if (!req) return c.json({ error: 'Nenalezeno.' }, 404);

  await c.env.DB.prepare(
    `UPDATE verification_requests SET status = 'approved', admin_note = ?, resolved_at = datetime('now') WHERE id = ?`,
  ).bind(note, id).run();

  if (BUSINESS_TABLES.includes(req.business_kind)) {
    await c.env.DB.prepare(`UPDATE ${req.business_kind} SET is_verified = 1, verification_status = 'verified' WHERE id = ?`).bind(req.business_id).run();
    try {
      await c.env.DB.prepare(
        `UPDATE organizations SET verification_status = 'verified' WHERE id = ?`,
      ).bind(req.business_id).run();
    } catch {}
  }

  try {
    await c.env.DB.prepare(
      `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, text)
       VALUES (?, ?, 'verification_approved', ?, 'business', ?, 'Byl(a) jsi ověřen(a)! ✓')`,
    ).bind(newId('notif'), req.user_id, user.sub, req.business_id).run();
  } catch {}

  return c.json({ ok: true });
});

adminRoutes.post('/verifications/:id/reject', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const note = (body.note || '').slice(0, 500);

  const req = await c.env.DB.prepare(`SELECT * FROM verification_requests WHERE id = ?`).bind(id).first();
  if (!req) return c.json({ error: 'Nenalezeno.' }, 404);

  await c.env.DB.prepare(
    `UPDATE verification_requests SET status = 'rejected', admin_note = ?, resolved_at = datetime('now') WHERE id = ?`,
  ).bind(note, id).run();

  if (BUSINESS_TABLES.includes(req.business_kind)) {
    await c.env.DB.prepare(`UPDATE ${req.business_kind} SET verification_status = 'rejected' WHERE id = ?`).bind(req.business_id).run();
  }

  try {
    await c.env.DB.prepare(
      `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, text)
       VALUES (?, ?, 'verification_rejected', ?, 'business', ?, 'Žádost o ověření byla zamítnuta')`,
    ).bind(newId('notif'), req.user_id, user.sub, req.business_id).run();
  } catch {}

  return c.json({ ok: true });
});

// ============================================================
// TEST CONTENT — seed & cleanup
// ============================================================

adminRoutes.post('/seed-test-content', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const { seedTestContent } = await import('../seed.js');
  const result = await seedTestContent(c.env);
  return c.json(result);
});

adminRoutes.post('/cleanup-test-content', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const { cleanupTestContent } = await import('../seed.js');
  const result = await cleanupTestContent(c.env);
  return c.json(result);
});

// ============================================================
// Reports + posts + cron (pôvodné)
// ============================================================

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

adminRoutes.post('/run-distribution-now', async (c) => {
  const key = c.req.header('X-Cron-Secret');
  if (!key || key !== c.env.CRON_SECRET) return c.json({ error: 'Neautorizované.' }, 401);
  const summary = await runDailyDistribution(c.env);
  return c.json(summary);
});
