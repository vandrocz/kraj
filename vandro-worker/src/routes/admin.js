import { Hono } from 'hono';
import { newId, generateUniqueHandle } from '../auth.js';
import { runDailyDistribution } from '../cron.js';
import { sendPushToUser } from '../push.js';

export const adminRoutes = new Hono();

function requireAdmin(c) {
  const user = c.get('user');
  return user && user.role === 'admin';
}

const BUSINESS_TABLES = ['organizations', 'accommodation', 'restaurants'];

// ============================================================
// PENDING / VERIFY
// ============================================================
adminRoutes.get('/pending', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const [orgs, acc, rest] = await Promise.all([
    c.env.DB.prepare(`SELECT id, name, type, region, district FROM organizations WHERE is_verified = 0`).all(),
    c.env.DB.prepare(`SELECT id, name, type, region, district FROM accommodation WHERE is_verified = 0`).all(),
    c.env.DB.prepare(`SELECT id, name, type, region, district FROM restaurants WHERE is_verified = 0`).all(),
  ]);
  return c.json({ organizations: orgs.results, accommodation: acc.results, restaurants: rest.results });
});

adminRoutes.post('/verify/:kind/:id', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const kind = c.req.param('kind');
  const id = c.req.param('id');
  if (!BUSINESS_TABLES.includes(kind)) return c.json({ error: 'Neznámy typ podniku.' }, 400);
  await c.env.DB.prepare(`UPDATE ${kind} SET is_verified = 1, verification_status = 'verified' WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

adminRoutes.post('/unverify/:kind/:id', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const kind = c.req.param('kind');
  const id = c.req.param('id');
  if (!BUSINESS_TABLES.includes(kind)) return c.json({ error: 'Neznámy typ podniku.' }, 400);
  await c.env.DB.prepare(`UPDATE ${kind} SET is_verified = 0, verification_status = 'unverified' WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

// ============================================================
// VERIFIKAČNÉ ŽIADOSTI
// ============================================================
adminRoutes.get('/verifications', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const status = c.req.query('status') || 'pending';
  const { results } = await c.env.DB.prepare(
    `SELECT verification_requests.*,
            users.display_name AS user_name, users.email AS user_email, users.handle AS user_handle,
            COALESCE(o.name, a.name, r.name) AS business_name
     FROM verification_requests
     JOIN users ON users.id = verification_requests.user_id
     LEFT JOIN organizations o ON o.id = verification_requests.business_id AND verification_requests.business_kind = 'organizations'
     LEFT JOIN accommodation a ON a.id = verification_requests.business_id AND verification_requests.business_kind = 'accommodation'
     LEFT JOIN restaurants r ON r.id = verification_requests.business_id AND verification_requests.business_kind = 'restaurants'
     WHERE verification_requests.status = ?
     ORDER BY verification_requests.created_at DESC LIMIT 200`,
  ).bind(status).all();
  return c.json({ requests: results });
});

adminRoutes.post('/verifications/:id/approve', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const admin = c.get('user');
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
  }

  try {
    await c.env.DB.prepare(
      `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, text)
       VALUES (?, ?, 'verification_approved', ?, 'business', ?, 'Byl(a) jsi ověřen(a)! ✓')`,
    ).bind(newId('notif'), req.user_id, admin.sub, req.business_id).run();
  } catch {}

  try {
    await sendPushToUser(c.env, req.user_id, {
      title: 'Účet ověřen',
      body: 'Tvůj podnik byl úspěšně ověřen.',
      url: '/?tab=account',
    });
  } catch {}

  return c.json({ ok: true });
});

adminRoutes.post('/verifications/:id/reject', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const admin = c.get('user');
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
    ).bind(newId('notif'), req.user_id, admin.sub, req.business_id).run();
  } catch {}

  return c.json({ ok: true });
});

// ============================================================
// USERS MANAGEMENT
// ============================================================
adminRoutes.get('/users', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const search = (c.req.query('q') || '').trim();
  const role = c.req.query('role') || '';
  const status = c.req.query('status') || '';

  const conds = [`deleted_at IS NULL`];
  const params = [];

  if (search) {
    conds.push(`(email LIKE ? OR display_name LIKE ? OR handle LIKE ?)`);
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (role) { conds.push(`role = ?`); params.push(role); }
  if (status) { conds.push(`status = ?`); params.push(status); }

  const { results } = await c.env.DB.prepare(
    `SELECT id, email, display_name, handle, role, status, credit_balance, email_verified, created_at, last_login_at
     FROM users WHERE ${conds.join(' AND ')}
     ORDER BY created_at DESC LIMIT 200`,
  ).bind(...params).all();

  const counts = await c.env.DB.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) AS users,
       SUM(CASE WHEN role = 'organization' THEN 1 ELSE 0 END) AS organizations,
       SUM(CASE WHEN role = 'hotelier' THEN 1 ELSE 0 END) AS hoteliers,
       SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended
     FROM users WHERE deleted_at IS NULL`,
  ).first();

  return c.json({ users: results, counts });
});

adminRoutes.post('/users/:id/suspend', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const reason = (body.reason || '').slice(0, 500);

  await c.env.DB.prepare(`UPDATE users SET status = 'suspended' WHERE id = ?`).bind(id).run();
  try {
    await c.env.DB.prepare(
      `INSERT INTO notifications (id, user_id, type, entity_type, entity_id, text)
       VALUES (?, ?, 'account_suspended', 'user', ?, ?)`,
    ).bind(newId('notif'), id, id, `Tvůj účet byl pozastaven.${reason ? ' Důvod: ' + reason : ''}`).run();
  } catch {}
  return c.json({ ok: true });
});

adminRoutes.post('/users/:id/unsuspend', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare(`UPDATE users SET status = 'active' WHERE id = ?`).bind(id).run();
  try {
    await c.env.DB.prepare(
      `INSERT INTO notifications (id, user_id, type, entity_type, entity_id, text)
       VALUES (?, ?, 'account_restored', 'user', ?, 'Tvůj účet byl obnoven.')`,
    ).bind(newId('notif'), id, id).run();
  } catch {}
  return c.json({ ok: true });
});

adminRoutes.post('/users/:id/role', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const admin = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const role = body.role;
  const validRoles = ['user', 'organization', 'hotelier', 'admin'];

  if (!validRoles.includes(role)) return c.json({ error: 'Neplatná role.' }, 400);
  if (id === admin.sub) return c.json({ error: 'Nemůžeš změnit svoju vlastní roli.' }, 400);

  await c.env.DB.prepare(`UPDATE users SET role = ? WHERE id = ?`).bind(role, id).run();
  return c.json({ ok: true, role });
});

adminRoutes.post('/users/:id/force-verify-email', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

adminRoutes.get('/users/:id/detail', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const id = c.req.param('id');

  const user = await c.env.DB.prepare(
    `SELECT id, email, display_name, handle, role, status, credit_balance, email_verified, bio, location, avatar_url, created_at, last_login_at, last_login_ip
     FROM users WHERE id = ?`,
  ).bind(id).first();
  if (!user) return c.json({ error: 'Nenalezeno.' }, 404);

  const [postsCount, commentsCount, checkinsCount, followersCount, posts] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND status = 'published'`).bind(id).first(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM comments WHERE user_id = ?`).bind(id).first(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM checkins WHERE user_id = ?`).bind(id).first(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM follows WHERE target_type = 'users' AND target_id = ?`).bind(id).first(),
    c.env.DB.prepare(
      `SELECT id, target_feed, text_content, image_url, created_at, status FROM posts WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
    ).bind(id).all(),
  ]);

  return c.json({
    user,
    stats: {
      posts: postsCount?.n || 0,
      comments: commentsCount?.n || 0,
      checkins: checkinsCount?.n || 0,
      followers: followersCount?.n || 0,
    },
    recent_posts: posts.results,
  });
});

adminRoutes.delete('/users/:id', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const admin = c.get('user');
  const id = c.req.param('id');
  if (id === admin.sub) return c.json({ error: 'Nemůžeš smazat sám sebe.' }, 400);

  const now = new Date().toISOString();
  const anonEmail = `deleted+${id}@naskraj.local`;
  await c.env.DB.prepare(
    `UPDATE users SET deleted_at = ?, status = 'deleted', email = ?, display_name = 'Smazaný účet',
      bio = NULL, avatar_url = NULL, cover_url = NULL, location = NULL, website = NULL, phone = NULL,
      password_hash = 'deleted', password_salt = 'deleted', totp_secret = NULL, totp_enabled = 0
     WHERE id = ?`,
  ).bind(now, anonEmail, id).run();
  await c.env.DB.prepare(`UPDATE posts SET status = 'removed' WHERE user_id = ?`).bind(id).run();
  return c.json({ ok: true });
});

// ============================================================
// REPORTS (posts + users)
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

adminRoutes.get('/user-reports', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT ur.id, ur.reason, ur.created_at, ur.resolved,
            ur.target_user_id,
            target.display_name AS target_name, target.handle AS target_handle, target.email AS target_email,
            reporter.display_name AS reporter_name, reporter.handle AS reporter_handle
     FROM user_reports ur
     JOIN users target ON target.id = ur.target_user_id
     JOIN users reporter ON reporter.id = ur.reporter_id
     WHERE ur.resolved = 0
     ORDER BY ur.created_at DESC`,
  ).all();
  return c.json({ reports: results });
});

adminRoutes.post('/user-reports/:id/resolve', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare('UPDATE user_reports SET resolved = 1 WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ============================================================
// POSTS MANAGEMENT
// ============================================================
adminRoutes.get('/posts', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const search = (c.req.query('q') || '').trim();
  const feed = c.req.query('feed') || '';

  const conds = [`posts.status = 'published'`];
  const params = [];
  if (search) { conds.push(`posts.text_content LIKE ?`); params.push(`%${search}%`); }
  if (feed) { conds.push(`posts.target_feed = ?`); params.push(feed); }

  const { results } = await c.env.DB.prepare(
    `SELECT posts.id, posts.text_content, posts.image_url, posts.target_feed, posts.business_id, posts.created_at,
            COALESCE(o.name, a.name, r.name) AS business_name,
            users.display_name AS author_name
     FROM posts
     LEFT JOIN organizations o ON o.id = posts.business_id AND posts.target_feed = 'organization'
     LEFT JOIN accommodation a ON a.id = posts.business_id AND posts.target_feed = 'accommodation'
     LEFT JOIN restaurants r ON r.id = posts.business_id AND posts.target_feed = 'gastro'
     LEFT JOIN users ON users.id = posts.user_id
     WHERE ${conds.join(' AND ')}
     ORDER BY posts.created_at DESC LIMIT 100`,
  ).bind(...params).all();
  return c.json({ posts: results });
});

adminRoutes.delete('/posts/:id', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare(`UPDATE posts SET status = 'removed' WHERE id = ?`).bind(id).run();
  await c.env.DB.prepare(`UPDATE reports SET resolved = 1 WHERE post_id = ?`).bind(id).run();
  return c.json({ ok: true });
});

adminRoutes.delete('/comments/:id', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ============================================================
// PLATFORM STATS
// ============================================================
adminRoutes.get('/stats', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);

  const [users, orgs, acc, rest, posts, events, comments, checkins, reviews] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NULL`).first(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM organizations`).first(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM accommodation`).first(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM restaurants`).first(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE status = 'published'`).first(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM events WHERE status = 'published'`).first(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM comments`).first(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM checkins`).first(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM reviews WHERE status = 'published'`).first(),
  ]);

  const { results: last30Users } = await c.env.DB.prepare(
    `SELECT DATE(created_at) AS day, COUNT(*) AS n FROM users WHERE created_at >= datetime('now','-30 days') GROUP BY day ORDER BY day ASC`,
  ).all();

  const { results: last30Posts } = await c.env.DB.prepare(
    `SELECT DATE(created_at) AS day, COUNT(*) AS n FROM posts WHERE status = 'published' AND created_at >= datetime('now','-30 days') GROUP BY day ORDER BY day ASC`,
  ).all();

  const { results: topOrgs } = await c.env.DB.prepare(
    `SELECT organizations.id, organizations.name,
            (SELECT COUNT(*) FROM posts WHERE business_id = organizations.id AND status = 'published') AS post_count
     FROM organizations
     ORDER BY post_count DESC LIMIT 5`,
  ).all();

  return c.json({
    totals: {
      users: users?.n || 0,
      organizations: orgs?.n || 0,
      accommodation: acc?.n || 0,
      restaurants: rest?.n || 0,
      posts: posts?.n || 0,
      events: events?.n || 0,
      comments: comments?.n || 0,
      checkins: checkins?.n || 0,
      reviews: reviews?.n || 0,
    },
    last_30_days: { users: last30Users, posts: last30Posts },
    top_organizations: topOrgs,
  });
});

// ============================================================
// UTILITIES
// ============================================================
adminRoutes.post('/backfill-handles', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT id, email, display_name FROM users WHERE (handle IS NULL OR handle = '') AND deleted_at IS NULL`,
  ).all();
  let updated = 0, failed = 0;
  for (const u of results) {
    try {
      const base = (u.email || '').split('@')[0] || u.display_name || 'user';
      const handle = await generateUniqueHandle(c.env, base);
      await c.env.DB.prepare('UPDATE users SET handle = ? WHERE id = ?').bind(handle, u.id).run();
      updated++;
    } catch { failed++; }
  }
  return c.json({ ok: true, total: results.length, updated, failed });
});

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

adminRoutes.post('/run-distribution-now', async (c) => {
  const key = c.req.header('X-Cron-Secret');
  if (!key || key !== c.env.CRON_SECRET) return c.json({ error: 'Neautorizované.' }, 401);
  const summary = await runDailyDistribution(c.env);
  return c.json(summary);
});

adminRoutes.post('/broadcast-push', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Len pre administrátorov.' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const title = (body.title || '').slice(0, 100);
  const message = (body.message || '').slice(0, 200);
  const url = (body.url || '/').slice(0, 500);
  if (!title || !message) return c.json({ error: 'Chýba title alebo message.' }, 400);

  const { results } = await c.env.DB.prepare(`SELECT DISTINCT user_id FROM push_subscriptions`).all();
  let sent = 0;
  for (const r of results) {
    try { await sendPushToUser(c.env, r.user_id, { title, body: message, url }); sent++; } catch {}
  }
  return c.json({ ok: true, users_targeted: results.length, sent });
});
