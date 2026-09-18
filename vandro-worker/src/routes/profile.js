import { Hono } from 'hono';
import { newId } from '../auth.js';

export const profileRoutes = new Hono();

const TYPE_TO_TABLE = {
  user: 'users',
  organizations: 'organizations',
  organization: 'organizations',
  accommodation: 'accommodation',
  restaurants: 'restaurants',
  gastro: 'restaurants',
};

function normalizeType(t) {
  if (t === 'organization') return 'organizations';
  if (t === 'gastro') return 'restaurants';
  return t;
}

function bizKindFromType(table) {
  if (table === 'organizations') return 'organization';
  if (table === 'accommodation') return 'accommodation';
  if (table === 'restaurants') return 'gastro';
  return null;
}

async function getFollowCount(env, type, id) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM follows WHERE target_type = ? AND target_id = ?`).bind(type, id).first();
  return row?.n || 0;
}

// ---- GET /api/profile/:type/:id ----
profileRoutes.get('/:type/:id', async (c) => {
  const type = normalizeType(c.req.param('type'));
  const id = c.req.param('id');
  const table = TYPE_TO_TABLE[type];
  if (!table) return c.json({ error: 'Neznámý typ profilu.' }, 400);

  if (table === 'users') {
    const user = await c.env.DB.prepare(
      `SELECT id, display_name, bio, avatar_url, cover_url, location, website, role, created_at, email_verified
       FROM users WHERE id = ? AND deleted_at IS NULL`,
    ).bind(id).first();
    if (!user) return c.json({ error: 'Užívateľ nenájdený.' }, 404);

    let businesses = [];
    if (user.role === 'organization') {
      const { results } = await c.env.DB.prepare('SELECT id, name, type, region, district, city, is_verified FROM organizations WHERE user_id = ?').bind(id).all();
      businesses = results.map((r) => ({ ...r, kind: 'organizations' }));
    } else if (user.role === 'hotelier') {
      const acc = await c.env.DB.prepare('SELECT id, name, type, region, district, city, is_verified FROM accommodation WHERE user_id = ?').bind(id).all();
      const rest = await c.env.DB.prepare('SELECT id, name, type, region, district, city, is_verified FROM restaurants WHERE user_id = ?').bind(id).all();
      businesses = [
        ...acc.results.map((r) => ({ ...r, kind: 'accommodation' })),
        ...rest.results.map((r) => ({ ...r, kind: 'restaurants' })),
      ];
    }

    const contrib = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM contributions WHERE user_id = ?`).bind(id).first();
    const followers = await getFollowCount(c.env, 'users', id);

    return c.json({
      type: 'user',
      profile: user,
      businesses,
      stats: { contributions: contrib?.n || 0, followers },
      is_following: false,
    });
  }

  const business = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  if (!business) return c.json({ error: 'Profil nenájdený.' }, 404);

  const { results: posts } = await c.env.DB.prepare(
    `SELECT id, text_content, image_url, created_at FROM posts
     WHERE business_id = ? AND status = 'published' ORDER BY created_at DESC LIMIT 60`,
  ).bind(id).all();

  const ids = posts.map((p) => p.id);
  let mediaMap = {};
  if (ids.length > 0) {
    const ph = ids.map(() => '?').join(',');
    const { results: mrows } = await c.env.DB.prepare(
      `SELECT post_id, image_url FROM post_media WHERE post_id IN (${ph}) ORDER BY sort_order`,
    ).bind(...ids).all();
    for (const r of mrows) {
      if (!mediaMap[r.post_id]) mediaMap[r.post_id] = [];
      mediaMap[r.post_id].push(r.image_url);
    }
  }

  const postsWithMedia = posts.map((p) => ({
    ...p, media: mediaMap[p.id] || (p.image_url ? [p.image_url] : []),
  }));

  const followers = await getFollowCount(c.env, type, id);
  const kind = bizKindFromType(table);

  return c.json({
    type: 'business',
    kind,
    profile: business,
    posts: postsWithMedia,
    stats: { followers, posts: posts.length },
    is_following: false,
  });
});

// ---- Follow ----
profileRoutes.post('/follow', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const type = normalizeType(body.type);
  const id = body.id;
  if (!TYPE_TO_TABLE[type] || !id) return c.json({ error: 'Neplatný cieľ.' }, 400);
  if (type === 'users' && id === user.sub) return c.json({ error: 'Nemôžeš sledovať sám seba.' }, 400);

  // Skontroluj, či nie sme blokovaní
  const blocked = await c.env.DB.prepare(
    `SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?`,
  ).bind(id, user.sub).first();
  if (blocked && type === 'users') return c.json({ error: 'Tento uživatel tě zablokoval.' }, 403);

  const existing = await c.env.DB.prepare(
    `SELECT 1 FROM follows WHERE follower_id = ? AND target_type = ? AND target_id = ?`,
  ).bind(user.sub, type, id).first();

  if (existing) {
    await c.env.DB.prepare(`DELETE FROM follows WHERE follower_id = ? AND target_type = ? AND target_id = ?`)
      .bind(user.sub, type, id).run();
    const followers = await getFollowCount(c.env, type, id);
    return c.json({ following: false, followers });
  }
  await c.env.DB.prepare(`INSERT INTO follows (follower_id, target_type, target_id) VALUES (?, ?, ?)`)
    .bind(user.sub, type, id).run();
  const followers = await getFollowCount(c.env, type, id);

  // Notifikácia (len pre usera)
  if (type === 'users') {
    try {
      await c.env.DB.prepare(
        `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, text)
         VALUES (?, ?, 'follow', ?, 'user', ?, 'tě začal sledovat')`,
      ).bind(newId('notif'), id, user.sub, user.sub).run();
    } catch {}
  }

  return c.json({ following: true, followers });
});

profileRoutes.get('/follow/status', async (c) => {
  const user = c.get('user');
  const type = normalizeType(c.req.query('type') || '');
  const id = c.req.query('id') || '';
  if (!TYPE_TO_TABLE[type] || !id) return c.json({ following: false, followers: 0 });
  const row = await c.env.DB.prepare(
    `SELECT 1 FROM follows WHERE follower_id = ? AND target_type = ? AND target_id = ?`,
  ).bind(user.sub, type, id).first();
  const followers = await getFollowCount(c.env, type, id);
  return c.json({ following: !!row, followers });
});

// ---- Followers / Following listy ----
profileRoutes.get('/:type/:id/followers', async (c) => {
  const type = normalizeType(c.req.param('type'));
  const id = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    `SELECT users.id, users.display_name, users.avatar_url, users.role, follows.created_at
     FROM follows JOIN users ON users.id = follows.follower_id
     WHERE follows.target_type = ? AND follows.target_id = ? AND users.deleted_at IS NULL
     ORDER BY follows.created_at DESC LIMIT 200`,
  ).bind(type, id).all();
  return c.json({ users: results });
});

profileRoutes.get('/me/following', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT follows.target_type, follows.target_id, follows.created_at,
            users.display_name AS user_name, users.avatar_url AS user_avatar,
            organizations.name AS org_name, accommodation.name AS acc_name, restaurants.name AS rest_name
     FROM follows
     LEFT JOIN users ON users.id = follows.target_id AND follows.target_type = 'users'
     LEFT JOIN organizations ON organizations.id = follows.target_id AND follows.target_type = 'organizations'
     LEFT JOIN accommodation ON accommodation.id = follows.target_id AND follows.target_type = 'accommodation'
     LEFT JOIN restaurants ON restaurants.id = follows.target_id AND follows.target_type = 'restaurants'
     WHERE follows.follower_id = ?
     ORDER BY follows.created_at DESC LIMIT 200`,
  ).bind(user.sub).all();
  return c.json({ items: results });
});

// ---- Bloky ----
profileRoutes.post('/block/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (id === user.sub) return c.json({ error: 'Nemůžeš blokovat sám sebe.' }, 400);
  await c.env.DB.prepare(`INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)`)
    .bind(user.sub, id).run();
  // Zruš follow obojsmerne
  await c.env.DB.prepare(`DELETE FROM follows WHERE follower_id = ? AND target_type = 'users' AND target_id = ?`)
    .bind(user.sub, id).run();
  await c.env.DB.prepare(`DELETE FROM follows WHERE follower_id = ? AND target_type = 'users' AND target_id = ?`)
    .bind(id, user.sub).run();
  return c.json({ ok: true, blocked: true });
});

profileRoutes.delete('/block/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?`).bind(user.sub, id).run();
  return c.json({ ok: true, blocked: false });
});

profileRoutes.get('/me/blocks', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT users.id, users.display_name, users.avatar_url, blocks.created_at
     FROM blocks JOIN users ON users.id = blocks.blocked_id
     WHERE blocks.blocker_id = ? ORDER BY blocks.created_at DESC`,
  ).bind(user.sub).all();
  return c.json({ users: results });
});

// ---- Nastavenia ----
profileRoutes.get('/me/settings', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(`SELECT settings_json FROM users WHERE id = ?`).bind(user.sub).first();
  let settings = { push_notifications: true, email_notifications: true, public_profile: true, show_contributions: true };
  if (row?.settings_json) { try { settings = { ...settings, ...JSON.parse(row.settings_json) }; } catch {} }
  return c.json({ settings });
});

profileRoutes.patch('/me/settings', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const allowed = ['push_notifications', 'email_notifications', 'public_profile', 'show_contributions'];
  const settings = {};
  for (const k of allowed) if (k in body) settings[k] = !!body[k];
  await c.env.DB.prepare(`UPDATE users SET settings_json = ? WHERE id = ?`).bind(JSON.stringify(settings), user.sub).run();
  return c.json({ ok: true, settings });
});

// ---- Update user profilu ----
profileRoutes.patch('/me/user', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const fields = ['display_name', 'bio', 'location', 'website', 'phone'];
  const sets = [], params = [];
  for (const f of fields) { if (f in body) { sets.push(`${f} = ?`); params.push(body[f] ?? null); } }
  if (sets.length === 0) return c.json({ error: 'Žiadne polia.' }, 400);
  params.push(user.sub);
  await c.env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
  const updated = await c.env.DB.prepare(
    `SELECT id, email, role, display_name, bio, avatar_url, cover_url, location, website, phone, email_verified FROM users WHERE id = ?`,
  ).bind(user.sub).first();
  return c.json({ user: updated });
});

// ---- Update business profilu ----
profileRoutes.patch('/me/:type/:id', async (c) => {
  const user = c.get('user');
  const table = TYPE_TO_TABLE[normalizeType(c.req.param('type'))];
  const id = c.req.param('id');
  if (!table || table === 'users') return c.json({ error: 'Neplatný typ.' }, 400);

  const owned = await c.env.DB.prepare(`SELECT user_id FROM ${table} WHERE id = ?`).bind(id).first();
  if (!owned) return c.json({ error: 'Profil nenájdený.' }, 404);
  if (owned.user_id !== user.sub && user.role !== 'admin') return c.json({ error: 'Nemáš oprávnenie.' }, 403);

  const allowedFields = table === 'restaurants'
    ? ['name', 'description', 'region', 'district', 'city', 'website', 'phone', 'cuisine_type', 'type']
    : table === 'accommodation'
      ? ['name', 'description', 'region', 'district', 'city', 'website', 'phone', 'capacity', 'type']
      : ['name', 'description', 'region', 'district', 'city', 'website', 'phone', 'type'];

  const body = await c.req.json().catch(() => ({}));
  const sets = [], params = [];
  for (const f of allowedFields) { if (f in body) { sets.push(`${f} = ?`); params.push(body[f] ?? null); } }
  if (sets.length === 0) return c.json({ error: 'Žiadne polia.' }, 400);
  params.push(id);
  await c.env.DB.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
  const updated = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  return c.json({ business: updated });
});

// ---- Upload avatar/cover ----
profileRoutes.post('/me/upload', async (c) => {
  const user = c.get('user');
  const form = await c.req.parseBody();
  const file = form.file;
  const target = (form.target || 'user').toString();
  const targetId = (form.target_id || '').toString();
  const field = (form.field || 'avatar').toString();
  if (!file || typeof file === 'string') return c.json({ error: 'Chýba súbor.' }, 400);

  const publicBase = c.env.R2_PUBLIC_BASE || 'https://media.vandro.cz';
  const ext = ((file.name || 'x.jpg').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = `profile/${newId()}.${ext}`;
  await c.env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || 'image/jpeg' } });
  const url = `${publicBase}/${key}`;

  if (target === 'user') {
    const col = field === 'cover' ? 'cover_url' : 'avatar_url';
    await c.env.DB.prepare(`UPDATE users SET ${col} = ? WHERE id = ?`).bind(url, user.sub).run();
    return c.json({ url, field: col });
  }
  const table = TYPE_TO_TABLE[normalizeType(target)];
  if (!table || !targetId) return c.json({ error: 'Neplatný cieľ.' }, 400);
  const owned = await c.env.DB.prepare(`SELECT user_id FROM ${table} WHERE id = ?`).bind(targetId).first();
  if (!owned || (owned.user_id !== user.sub && user.role !== 'admin')) return c.json({ error: 'Nemáš oprávnenie.' }, 403);
  const col = field === 'cover' ? 'cover_url' : (table === 'organizations' ? 'logo_url' : 'image_url');
  await c.env.DB.prepare(`UPDATE ${table} SET ${col} = ? WHERE id = ?`).bind(url, targetId).run();
  return c.json({ url, field: col });
});

// ---- Zmazanie účtu (soft delete + anonymizácia, GDPR) ----
profileRoutes.delete('/me/account', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  if (body.confirm !== 'SMAZAT') return c.json({ error: 'Pro potvrzení napiš "SMAZAT".' }, 400);

  const now = new Date().toISOString();
  const anonEmail = `deleted+${user.sub}@naskraj.local`;
  await c.env.DB.prepare(
    `UPDATE users SET deleted_at = ?, status = 'deleted', email = ?, display_name = 'Smazaný účet',
      bio = NULL, avatar_url = NULL, cover_url = NULL, location = NULL, website = NULL, phone = NULL,
      password_hash = 'deleted', password_salt = 'deleted'
     WHERE id = ?`,
  ).bind(now, anonEmail, user.sub).run();

  // Skry jeho príspevky + komentáre (soft-remove)
  await c.env.DB.prepare(`UPDATE posts SET status = 'removed' WHERE user_id = ?`).bind(user.sub).run();
  await c.env.DB.prepare(`DELETE FROM follows WHERE follower_id = ? OR (target_type = 'users' AND target_id = ?)`).bind(user.sub, user.sub).run();

  return c.json({ ok: true });
});

// ---- Export mojich dát (GDPR) ----
profileRoutes.get('/me/export', async (c) => {
  const user = c.get('user');
  const profile = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(user.sub).first();
  if (profile) { delete profile.password_hash; delete profile.password_salt; }

  const [contrib, businesses, posts, comments] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM contributions WHERE user_id = ?`).bind(user.sub).all(),
    c.env.DB.prepare(
      `SELECT 'organization' AS kind, id, name, type, region, district, city, description, is_verified, created_at FROM organizations WHERE user_id = ?
       UNION ALL
       SELECT 'accommodation', id, name, type, region, district, city, description, is_verified, created_at FROM accommodation WHERE user_id = ?
       UNION ALL
       SELECT 'gastro', id, name, type, region, district, city, description, is_verified, created_at FROM restaurants WHERE user_id = ?`,
    ).bind(user.sub, user.sub, user.sub).all(),
    c.env.DB.prepare(`SELECT id, target_feed, business_id, text_content, image_url, created_at FROM posts WHERE user_id = ?`).bind(user.sub).all(),
    c.env.DB.prepare(`SELECT id, post_id, comment_text, created_at FROM comments WHERE user_id = ?`).bind(user.sub).all(),
  ]);

  const settings = await c.env.DB.prepare(`SELECT settings_json FROM users WHERE id = ?`).bind(user.sub).first();

  return c.json({
    exported_at: new Date().toISOString(),
    profile,
    settings: settings?.settings_json ? JSON.parse(settings.settings_json) : {},
    contributions: contrib.results,
    businesses: businesses.results,
    posts: posts.results,
    comments: comments.results,
  });
});

// ---- Notifikácie ----
profileRoutes.get('/me/notifications', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT notifications.*, users.display_name AS actor_name, users.avatar_url AS actor_avatar
     FROM notifications LEFT JOIN users ON users.id = notifications.actor_id
     WHERE notifications.user_id = ?
     ORDER BY notifications.created_at DESC LIMIT 100`,
  ).bind(user.sub).all();
  const unread = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL`,
  ).bind(user.sub).first();
  return c.json({ notifications: results, unread: unread?.n || 0 });
});

profileRoutes.post('/me/notifications/:id/read', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .bind(c.req.param('id'), user.sub).run();
  return c.json({ ok: true });
});

profileRoutes.post('/me/notifications/read-all', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`).bind(user.sub).run();
  return c.json({ ok: true });
});

// ---- Global search ----
profileRoutes.get('/search', async (c) => {
  const q = (c.req.query('q') || '').trim();
  if (!q || q.length < 2) return c.json({ results: [] });
  const like = `%${q}%`;
  const { results } = await c.env.DB.prepare(
    `SELECT 'organizations' AS kind, id, name, type, region, district, city, description, is_verified FROM organizations WHERE name LIKE ? AND is_verified = 1
     UNION ALL
     SELECT 'accommodation', id, name, type, region, district, city, description, is_verified FROM accommodation WHERE name LIKE ?
     UNION ALL
     SELECT 'restaurants', id, name, type, region, district, city, description, is_verified FROM restaurants WHERE name LIKE ?
     UNION ALL
     SELECT 'users', id, display_name AS name, role AS type, NULL AS region, NULL AS district, NULL AS city, bio AS description, email_verified AS is_verified
     FROM users WHERE deleted_at IS NULL AND display_name LIKE ?
     LIMIT 30`,
  ).bind(like, like, like, like).all();
  return c.json({ results });
});
