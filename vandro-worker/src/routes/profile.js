import { Hono } from 'hono';
import { newId, normalizeHandle, validateHandle } from '../auth.js';
import { escapeLike } from '../moderation.js';
import { getUserBadges } from '../badges.js';

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

function feedKeyFromType(table) {
  if (table === 'organizations') return 'organization';
  if (table === 'accommodation') return 'accommodation';
  if (table === 'restaurants') return 'gastro';
  return null;
}

async function getFollowCount(env, type, id) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM follows WHERE target_type = ? AND target_id = ?`,
  ).bind(type, id).first();
  return row?.n || 0;
}

function escapePlain(t) {
  return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================================
// SEARCH
// ============================================================
profileRoutes.get('/search', async (c) => {
  const user = c.get('user');
  const q = (c.req.query('q') || '').trim();
  if (!q || q.length < 2) return c.json({ results: [] });

  const like = `%${escapeLike(q)}%`;
  const qRaw = q.startsWith('@') ? q.slice(1) : q;
  const likeHandle = `%${escapeLike(qRaw.toLowerCase())}%`;

  const blocked = new Set();
  try {
    const { results: b1 } = await c.env.DB.prepare(`SELECT blocked_id AS id FROM blocks WHERE blocker_id = ?`).bind(user.sub).all();
    const { results: b2 } = await c.env.DB.prepare(`SELECT blocker_id AS id FROM blocks WHERE blocked_id = ?`).bind(user.sub).all();
    for (const r of b1) blocked.add(r.id);
    for (const r of b2) blocked.add(r.id);
  } catch {}

  const { results } = await c.env.DB.prepare(
    `SELECT 'organizations' AS kind, id, name, type, region, district, city, description, is_verified, NULL AS handle
       FROM organizations WHERE name LIKE ? ESCAPE '\\'
     UNION ALL
     SELECT 'accommodation', id, name, type, region, district, city, description, is_verified, NULL
       FROM accommodation WHERE name LIKE ? ESCAPE '\\'
     UNION ALL
     SELECT 'restaurants', id, name, type, region, district, city, description, is_verified, NULL
       FROM restaurants WHERE name LIKE ? ESCAPE '\\'
     UNION ALL
     SELECT 'users', id, display_name AS name, role AS type, NULL AS region, NULL AS district, NULL AS city,
            bio AS description, email_verified AS is_verified, handle
       FROM users
       WHERE deleted_at IS NULL AND (display_name LIKE ? ESCAPE '\\' OR handle LIKE ? ESCAPE '\\')
     LIMIT 50`,
  ).bind(like, like, like, like, likeHandle).all();

  const filtered = results.filter((r) => !blocked.has(r.id));
  return c.json({ results: filtered });
});

// ============================================================
// FOLLOW
// ============================================================
profileRoutes.post('/follow', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const type = normalizeType((body.type || '').toString());
  const id = (body.id || '').toString();
  const table = TYPE_TO_TABLE[type];

  if (!table || !id) return c.json({ error: 'Neplatný cieľ.' }, 400);
  if (type === 'users' && id === user.sub) return c.json({ error: 'Nemůžeš sledovat sám sebe.' }, 400);

  try {
    const blocked = await c.env.DB.prepare(
      `SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`,
    ).bind(user.sub, id, id, user.sub).first();
    if (blocked) return c.json({ error: 'Nelze sledovat.' }, 403);
  } catch {}

  const existing = await c.env.DB.prepare(
    `SELECT 1 FROM follows WHERE follower_id = ? AND target_type = ? AND target_id = ?`,
  ).bind(user.sub, type, id).first();

  if (existing) {
    await c.env.DB.prepare(
      `DELETE FROM follows WHERE follower_id = ? AND target_type = ? AND target_id = ?`,
    ).bind(user.sub, type, id).run();
    const followers = await getFollowCount(c.env, type, id);
    return c.json({ following: false, followers });
  }

  await c.env.DB.prepare(
    `INSERT INTO follows (id, follower_id, target_type, target_id) VALUES (?, ?, ?, ?)`,
  ).bind(newId('fol'), user.sub, type, id).run();
  const followers = await getFollowCount(c.env, type, id);
  return c.json({ following: true, followers }, 201);
});

// ============================================================
// FOLLOW STATUS
// ============================================================
profileRoutes.get('/follow/status', async (c) => {
  const user = c.get('user');
  const type = normalizeType((c.req.query('type') || '').toString());
  const id = (c.req.query('id') || '').toString();
  if (!type || !id) return c.json({ following: false });
  const row = await c.env.DB.prepare(
    `SELECT 1 FROM follows WHERE follower_id = ? AND target_type = ? AND target_id = ?`,
  ).bind(user.sub, type, id).first();
  const followers = await getFollowCount(c.env, type, id);
  return c.json({ following: !!row, followers });
});

// ============================================================
// FOLLOWERS / FOLLOWING
// ============================================================
profileRoutes.get('/:type/:id/followers', async (c) => {
  const type = normalizeType(c.req.param('type'));
  const id = c.req.param('id');
  if (type !== 'users') return c.json({ users: [] });
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.display_name, u.handle, u.avatar_url
       FROM follows f JOIN users u ON u.id = f.follower_id
      WHERE f.target_type = 'users' AND f.target_id = ?
      ORDER BY f.created_at DESC LIMIT 200`,
  ).bind(id).all();
  return c.json({ users: results });
});

profileRoutes.get('/me/following', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT f.target_type, f.target_id,
            u.display_name AS user_name, u.handle AS user_handle, u.avatar_url AS user_avatar,
            o.name AS org_name, a.name AS acc_name, r.name AS rest_name
       FROM follows f
       LEFT JOIN users u ON u.id = f.target_id AND f.target_type = 'users'
       LEFT JOIN organizations o ON o.id = f.target_id AND f.target_type = 'organizations'
       LEFT JOIN accommodation a ON a.id = f.target_id AND f.target_type = 'accommodation'
       LEFT JOIN restaurants r ON r.id = f.target_id AND f.target_type = 'restaurants'
      WHERE f.follower_id = ?
      ORDER BY f.created_at DESC LIMIT 200`,
  ).bind(user.sub).all();
  return c.json({ items: results });
});

// ============================================================
// BLOCK / UNBLOCK
// ============================================================
profileRoutes.post('/block/:id', async (c) => {
  const user = c.get('user');
  const targetId = c.req.param('id');
  if (targetId === user.sub) return c.json({ error: 'Nelze blokovat sám sebe.' }, 400);
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO blocks (id, blocker_id, blocked_id) VALUES (?, ?, ?)`,
  ).bind(newId('blk'), user.sub, targetId).run();
  await c.env.DB.prepare(
    `DELETE FROM follows WHERE (follower_id = ? AND target_type = 'users' AND target_id = ?)
        OR (follower_id = ? AND target_type = 'users' AND target_id = ?)`,
  ).bind(user.sub, targetId, targetId, user.sub).run();
  return c.json({ ok: true }, 201);
});

profileRoutes.delete('/block/:id', async (c) => {
  const user = c.get('user');
  const targetId = c.req.param('id');
  await c.env.DB.prepare(
    `DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?`,
  ).bind(user.sub, targetId).run();
  return c.json({ ok: true });
});

profileRoutes.get('/me/blocks', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.display_name, u.handle, u.avatar_url
       FROM blocks b JOIN users u ON u.id = b.blocked_id
      WHERE b.blocker_id = ?
      ORDER BY b.created_at DESC LIMIT 200`,
  ).bind(user.sub).all();
  return c.json({ users: results });
});

// ============================================================
// SETTINGS
// ============================================================
profileRoutes.get('/me/settings', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(`SELECT settings_json FROM users WHERE id = ?`).bind(user.sub).first();
  let settings = {};
  try { settings = row?.settings_json ? JSON.parse(row.settings_json) : {}; } catch {}
  const defaults = { push_notifications: true, email_notifications: true, public_profile: true, show_contributions: true, public_checkins: true };
  return c.json({ settings: { ...defaults, ...settings } });
});

profileRoutes.patch('/me/settings', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const allowed = ['push_notifications', 'email_notifications', 'public_profile', 'show_contributions', 'public_checkins'];
  const row = await c.env.DB.prepare(`SELECT settings_json FROM users WHERE id = ?`).bind(user.sub).first();
  let settings = {};
  try { settings = row?.settings_json ? JSON.parse(row.settings_json) : {}; } catch {}
  for (const k of allowed) if (k in body) settings[k] = !!body[k];
  if ('public_checkins' in body) {
    try { await c.env.DB.prepare(`UPDATE users SET public_checkins = ? WHERE id = ?`).bind(body.public_checkins ? 1 : 0, user.sub).run(); } catch {}
  }
  await c.env.DB.prepare(`UPDATE users SET settings_json = ? WHERE id = ?`).bind(JSON.stringify(settings), user.sub).run();
  return c.json({ ok: true, settings });
});

// ============================================================
// UPDATE USER
// ============================================================
profileRoutes.patch('/me/user', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const sets = [], params = [];

  if ('handle' in body) {
    const normalized = normalizeHandle(body.handle);
    const valid = validateHandle(normalized);
    if (!valid.ok) {
      const messages = {
        empty: 'Handle nesmí být prázdný.',
        invalid_format: 'Handle musí mít 3–30 znaků (a–z, 0–9, tečka, podtržítko, pomlčka) a začínat písmenem nebo číslem.',
        reserved: 'Tento handle je rezervovaný.',
      };
      return c.json({ error: messages[valid.reason] || 'Neplatný handle.' }, 400);
    }
    const taken = await c.env.DB.prepare('SELECT 1 FROM users WHERE handle = ? AND id != ?').bind(normalized, user.sub).first();
    if (taken) return c.json({ error: 'Tento handle je již obsazený.' }, 409);
    sets.push('handle = ?'); params.push(normalized);
  }

  const fields = ['display_name', 'bio', 'location', 'website', 'phone'];
  for (const f of fields) if (f in body) { sets.push(`${f} = ?`); params.push(body[f] ?? null); }

  if ('onboarding_done' in body) { sets.push('onboarding_done = ?'); params.push(body.onboarding_done ? 1 : 0); }

  if (sets.length === 0) return c.json({ error: 'Žiadne polia.' }, 400);

  params.push(user.sub);
  await c.env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();

  const updated = await c.env.DB.prepare(
    `SELECT id, email, role, display_name, handle, bio, avatar_url, cover_url, location,
            website, phone, email_verified, totp_enabled, onboarding_done
       FROM users WHERE id = ?`,
  ).bind(user.sub).first();
  return c.json({ user: updated });
});

// ============================================================
// UPDATE BUSINESS — 🔑 ROZŠÍRENÉ O NOVÉ POLIA
// ============================================================
profileRoutes.patch('/me/:type/:id', async (c) => {
  const user = c.get('user');
  const table = TYPE_TO_TABLE[normalizeType(c.req.param('type'))];
  const id = c.req.param('id');

  if (!table || table === 'users') return c.json({ error: 'Neplatný typ.' }, 400);

  const owned = await c.env.DB.prepare(`SELECT user_id FROM ${table} WHERE id = ?`).bind(id).first();
  if (!owned) return c.json({ error: 'Nenájdené.' }, 404);
  if (owned.user_id !== user.sub && user.role !== 'admin') return c.json({ error: 'Nemáš oprávnenie.' }, 403);

  // 🔑 Rozšírené allowedFields o nové polia:
  // - opening_hours  → všetky typy (organizácie, ubytovanie, gastro)
  // - entrance_fee   → iba organizácie (hrady, zámky, ZOO...)
  // - price_range    → gastro a ubytovanie (€ / €€ / €€€ / €€€€)
  const allowedFields = table === 'restaurants'
    ? ['name', 'description', 'region', 'district', 'city', 'website', 'phone',
       'cuisine_type', 'type', 'opening_hours', 'price_range']
    : table === 'accommodation'
    ? ['name', 'description', 'region', 'district', 'city', 'website', 'phone',
       'capacity', 'type', 'opening_hours', 'price_range']
    : ['name', 'description', 'region', 'district', 'city', 'website', 'phone',
       'type', 'opening_hours', 'entrance_fee', 'price_range'];

  const body = await c.req.json().catch(() => ({}));
  const sets = [], params = [];

  for (const f of allowedFields) {
    if (f in body) {
      let v = body[f];
      // Normalizácia: price_range na integer alebo NULL
      if (f === 'price_range') {
        if (v === '' || v == null) v = null;
        else v = parseInt(v, 10);
        if (v !== null && (isNaN(v) || v < 1 || v > 4)) v = null;
      }
      // Prázdne stringy na NULL (aby sa v DB neukladalo "")
      if (typeof v === 'string' && v.trim() === '') v = null;
      sets.push(`${f} = ?`);
      params.push(v ?? null);
    }
  }

  if (sets.length === 0) return c.json({ error: 'Žiadne polia.' }, 400);

  params.push(id);
  await c.env.DB.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();

  const updated = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  return c.json({ business: updated });
});

// ============================================================
// UPLOAD
// ============================================================
profileRoutes.post('/me/upload', async (c) => {
  const user = c.get('user');
  const form = await c.req.parseBody();
  const file = form.file;
  const target = (form.target || 'user').toString();
  const targetId = (form.target_id || '').toString();
  const field = (form.field || 'avatar').toString();

  if (!file || typeof file === 'string') return c.json({ error: 'Chýba súbor.' }, 400);
  if (!c.env.MEDIA) return c.json({ error: 'Server nemá úložiště.' }, 500);

  const publicBase = c.env.R2_PUBLIC_BASE || '';
  const ext = ((file.name || 'x.jpg').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = `profile/${newId()}.${ext}`;
  await c.env.MEDIA.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || 'image/jpeg' },
  });
  const url = publicBase ? `${publicBase}/${key}` : key;

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

profileRoutes.post('/me/upload-verification-doc', async (c) => {
  const user = c.get('user');
  const form = await c.req.parseBody();
  const file = form.file;

  if (!file || typeof file === 'string') return c.json({ error: 'Chýba súbor.' }, 400);
  if (!c.env.MEDIA) return c.json({ error: 'Server nemá úložiště.' }, 500);
  if (file.size > 10 * 1024 * 1024) return c.json({ error: 'Soubor je příliš velký (max 10 MB).' }, 400);

  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) return c.json({ error: 'Povolené formáty: PDF, JPG, PNG, WebP.' }, 400);

  const publicBase = c.env.R2_PUBLIC_BASE || '';
  const ext = ((file.name || 'doc.pdf').split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = `verifications/${newId()}.${ext}`;
  await c.env.MEDIA.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });
  const url = publicBase ? `${publicBase}/${key}` : key;
  return c.json({ url }, 201);
});

// ============================================================
// VERIFICATION REQUEST
// ============================================================
profileRoutes.post('/me/request-verification', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const businessId = (body.business_id || '').toString();
  const businessKind = (body.business_kind || '').toString();
  const docUrl = (body.doc_url || '').toString();
  const note = (body.note || '').toString().slice(0, 1000);

  if (!businessId || !businessKind) return c.json({ error: 'Chýba podnik.' }, 400);
  if (!['organizations', 'accommodation', 'restaurants'].includes(businessKind)) return c.json({ error: 'Neplatný typ.' }, 400);
  if (!docUrl) return c.json({ error: 'Nahraj dokument.' }, 400);

  const biz = await c.env.DB.prepare(`SELECT user_id, is_verified FROM ${businessKind} WHERE id = ?`).bind(businessId).first();
  if (!biz) return c.json({ error: 'Podnik nenalezen.' }, 404);
  if (biz.user_id !== user.sub) return c.json({ error: 'Nemáš oprávnění.' }, 403);
  if (biz.is_verified) return c.json({ error: 'Podnik je již ověřen.' }, 400);

  const existing = await c.env.DB.prepare(
    `SELECT id FROM verification_requests WHERE business_id = ? AND status = 'pending'`,
  ).bind(businessId).first();
  if (existing) return c.json({ error: 'Žádost už čeká na schválení.' }, 400);

  const id = newId('vreq');
  await c.env.DB.prepare(
    `INSERT INTO verification_requests (id, business_id, business_kind, user_id, doc_url, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, businessId, businessKind, user.sub, docUrl, note || null).run();

  await c.env.DB.prepare(`UPDATE ${businessKind} SET verification_status = 'pending' WHERE id = ?`).bind(businessId).run();
  return c.json({ id, ok: true }, 201);
});

profileRoutes.get('/me/verification-status/:kind/:id', async (c) => {
  const user = c.get('user');
  const kind = c.req.param('kind');
  const id = c.req.param('id');
  const req = await c.env.DB.prepare(
    `SELECT id, status, admin_note, created_at, resolved_at
       FROM verification_requests
      WHERE business_id = ? AND business_kind = ?
      ORDER BY created_at DESC LIMIT 1`,
  ).bind(id, kind).first();
  return c.json({ request: req || null });
});

// ============================================================
// DELETE ACCOUNT
// ============================================================
profileRoutes.delete('/me/account', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  if (body.confirm !== 'SMAZAT') return c.json({ error: 'Pro potvrzení napiš "SMAZAT".' }, 400);

  const now = new Date().toISOString();
  const anonEmail = `deleted+${user.sub}@naskraj.local`;

  await c.env.DB.prepare(
    `UPDATE users SET
       deleted_at = ?, status = 'deleted', email = ?, display_name = 'Smazaný účet',
       bio = NULL, avatar_url = NULL, cover_url = NULL, location = NULL,
       website = NULL, phone = NULL, password_hash = 'deleted',
       password_salt = 'deleted', totp_secret = NULL, totp_enabled = 0
     WHERE id = ?`,
  ).bind(now, anonEmail, user.sub).run();

  await c.env.DB.prepare(`UPDATE posts SET status = 'removed' WHERE user_id = ?`).bind(user.sub).run();
  await c.env.DB.prepare(
    `DELETE FROM follows WHERE follower_id = ? OR (target_type = 'users' AND target_id = ?)`,
  ).bind(user.sub, user.sub).run();

  return c.json({ ok: true });
});

// ============================================================
// EXPORT DATA
// ============================================================
profileRoutes.get('/me/export', async (c) => {
  const user = c.get('user');
  const profile = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(user.sub).first();
  if (profile) {
    delete profile.password_hash;
    delete profile.password_salt;
    delete profile.totp_secret;
    delete profile.recovery_codes_json;
  }

  const [contrib, businesses, posts, comments] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM contributions WHERE user_id = ?`).bind(user.sub).all(),
    c.env.DB.prepare(
      `SELECT 'organization' AS kind, id, name, type, region, district, city, description, is_verified, created_at FROM organizations WHERE user_id = ?
       UNION ALL
       SELECT 'accommodation', id, name, type, region, district, city, description, is_verified, created_at FROM accommodation WHERE user_id = ?
       UNION ALL
       SELECT 'gastro', id, name, type, region, district, city, description, is_verified, created_at FROM restaurants WHERE user_id = ?`,
    ).bind(user.sub, user.sub, user.sub).all(),
    c.env.DB.prepare(
      `SELECT id, target_feed, business_id, text_content, image_url, created_at FROM posts WHERE user_id = ?`,
    ).bind(user.sub).all(),
    c.env.DB.prepare(
      `SELECT id, post_id, comment_text, created_at FROM comments WHERE user_id = ?`,
    ).bind(user.sub).all(),
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

// ============================================================
// NOTIFICATIONS
// ============================================================
profileRoutes.get('/me/notifications', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT notifications.*, users.display_name AS actor_name, users.handle AS actor_handle, users.avatar_url AS actor_avatar
       FROM notifications
       LEFT JOIN users ON users.id = notifications.actor_id
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
  await c.env.DB.prepare(
    `UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?`,
  ).bind(c.req.param('id'), user.sub).run();
  return c.json({ ok: true });
});

profileRoutes.post('/me/notifications/read-all', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare(
    `UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`,
  ).bind(user.sub).run();
  return c.json({ ok: true });
});

// ============================================================
// REPORT USER
// ============================================================
profileRoutes.post('/report/:id', async (c) => {
  const user = c.get('user');
  const targetId = c.req.param('id');
  if (targetId === user.sub) return c.json({ error: 'Nemůžeš nahlásit sám sebe.' }, 400);

  const target = await c.env.DB.prepare('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL').bind(targetId).first();
  if (!target) return c.json({ error: 'Uživatel nenalezen.' }, 404);

  const body = await c.req.json().catch(() => ({}));
  const id = newId('ureport');
  await c.env.DB.prepare(
    `INSERT INTO user_reports (id, reporter_id, target_user_id, reason) VALUES (?, ?, ?, ?)`,
  ).bind(id, user.sub, targetId, (body.reason || '').toString().slice(0, 500) || null).run();
  return c.json({ ok: true, id }, 201);
});

// ============================================================
// CHANGE EMAIL
// ============================================================
profileRoutes.post('/me/change-email', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const newEmail = (body.email || '').toString().toLowerCase().trim();
  const password = (body.password || '').toString();

  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return c.json({ error: 'Neplatný e-mail.' }, 400);
  if (!password) return c.json({ error: 'Zadej své aktuální heslo.' }, 400);

  const row = await c.env.DB.prepare('SELECT password_hash, password_salt, auth_provider FROM users WHERE id = ?').bind(user.sub).first();
  if (!row) return c.json({ error: 'Uživatel nenalezen.' }, 404);
  if (row.auth_provider === 'google') return c.json({ error: 'E-mail u Google účtu nelze změnit.' }, 400);

  const { verifyPassword } = await import('../auth.js');
  const ok = await verifyPassword(password, row.password_hash, row.password_salt);
  if (!ok) return c.json({ error: 'Nesprávné heslo.' }, 401);

  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE email = ? AND id != ?').bind(newEmail, user.sub).first();
  if (exists) return c.json({ error: 'Tento e-mail je už použitý.' }, 409);

  await c.env.DB.prepare('UPDATE users SET email = ?, email_verified = 1 WHERE id = ?').bind(newEmail, user.sub).run();
  return c.json({ ok: true, email: newEmail });
});

// ============================================================
// BADGES
// ============================================================
profileRoutes.get('/:type/:id/badges', async (c) => {
  const type = c.req.param('type');
  const id = c.req.param('id');
  if (type !== 'user' && type !== 'users') return c.json({ error: 'Iba pre userov.' }, 400);
  const badges = await getUserBadges(c.env, id);
  return c.json({ badges });
});

// ============================================================
// CHECKINS
// ============================================================
profileRoutes.get('/:type/:id/checkins', async (c) => {
  const id = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    `SELECT checkins.*,
            COALESCE(o.name, a.name, r.name) AS business_name,
            COALESCE(o.logo_url, a.image_url, r.image_url) AS business_logo,
            COALESCE(o.region, a.region, r.region) AS region
       FROM checkins
       LEFT JOIN organizations o ON o.id = checkins.business_id AND checkins.business_kind = 'organizations'
       LEFT JOIN accommodation a ON a.id = checkins.business_id AND checkins.business_kind = 'accommodation'
       LEFT JOIN restaurants r ON r.id = checkins.business_id AND checkins.business_kind = 'restaurants'
      WHERE checkins.user_id = ?
      ORDER BY checkins.visited_at DESC LIMIT 200`,
  ).bind(id).all();
  return c.json({ checkins: results });
});

// ============================================================
// STATS
// ============================================================
profileRoutes.get('/:type/:id/stats', async (c) => {
  try {
    const type = normalizeType(c.req.param('type'));
    const id = c.req.param('id');
    const table = TYPE_TO_TABLE[type];
    if (!table || table === 'users') return c.json({ error: 'Neplatný typ.' }, 400);

    let user = c.get('user');
    if (!user || !user.sub) {
      const h = c.req.header('Authorization') || '';
      const token = h.startsWith('Bearer ') ? h.slice(7) : null;
      if (token) {
        try {
          const { verify } = await import('hono/jwt');
          user = await verify(token, c.env.JWT_SECRET, 'HS256');
        } catch (e) { console.warn('stats token verify:', e.message); }
      }
    }
    if (!user || !user.sub) return c.json({ error: 'Chýba prihlásenie.' }, 401);

    const biz = await c.env.DB.prepare(`SELECT user_id FROM ${table} WHERE id = ?`).bind(id).first();
    if (!biz) return c.json({ error: 'Nenalezeno.' }, 404);
    if (biz.user_id !== user.sub && user.role !== 'admin') {
      return c.json({ error: 'Nemáš oprávnění.' }, 403);
    }

    let posts = 0, events = 0, followers = 0, likes = 0, comments = 0;
    let recent = [];

    try { const r = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE business_id = ? AND status = 'published'`).bind(id).first(); posts = r?.n || 0; } catch {}
    try { const r = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM events WHERE business_id = ? AND status = 'published'`).bind(id).first(); events = r?.n || 0; } catch {}
    try { const r = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM follows WHERE target_type = ? AND target_id = ?`).bind(type, id).first(); followers = r?.n || 0; } catch {}

    try {
      const { results: postRows } = await c.env.DB.prepare(`SELECT id FROM posts WHERE business_id = ? AND status = 'published'`).bind(id).all();
      for (const p of postRows) {
        try { const raw = await c.env.NASKRAJ_LAJKY.get(`likecount:post:${p.id}`); likes += raw ? parseInt(raw, 10) : 0; } catch {}
        try { const cc = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM comments WHERE post_id = ?`).bind(p.id).first(); comments += cc?.n || 0; } catch {}
      }
    } catch {}

    try {
      const r = await c.env.DB.prepare(
        `SELECT DATE(created_at) AS day, COUNT(*) AS n
           FROM posts WHERE business_id = ? AND status = 'published'
            AND created_at >= datetime('now','-30 days')
          GROUP BY day ORDER BY day ASC`,
      ).bind(id).all();
      recent = r?.results || [];
    } catch {}

    return c.json({ posts, events, followers, likes, comments, last_30_days: recent });
  } catch (err) {
    console.error('stats fatal:', err);
    return c.json({ error: 'Chyba při načítání statistik.', detail: err.message }, 500);
  }
});

// ============================================================
// PROFILE DETAIL
// ============================================================
profileRoutes.get('/:type/:id', async (c) => {
  const type = normalizeType(c.req.param('type'));
  const id = c.req.param('id');
  const table = TYPE_TO_TABLE[type];
  if (!table) return c.json({ error: 'Neznámý typ.' }, 400);

  if (table === 'users') {
    const user = await c.env.DB.prepare(
      `SELECT id, display_name, handle, bio, avatar_url, cover_url, location, website,
              role, created_at, email_verified, totp_enabled, public_checkins
         FROM users WHERE id = ? AND deleted_at IS NULL`,
    ).bind(id).first();
    if (!user) return c.json({ error: 'Užívateľ nenájdený.' }, 404);

    let businesses = [];
    if (user.role === 'organization') {
      const { results } = await c.env.DB.prepare(
        'SELECT id, name, type, region, district, city, is_verified FROM organizations WHERE user_id = ?',
      ).bind(id).all();
      businesses = results.map((r) => ({ ...r, kind: 'organizations' }));
    } else if (user.role === 'hotelier') {
      const acc = await c.env.DB.prepare(
        'SELECT id, name, type, region, district, city, is_verified FROM accommodation WHERE user_id = ?',
      ).bind(id).all();
      const rest = await c.env.DB.prepare(
        'SELECT id, name, type, region, district, city, is_verified FROM restaurants WHERE user_id = ?',
      ).bind(id).all();
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
  if (!business) return c.json({ error: 'Nenájdené.' }, 404);

  const feedKey = feedKeyFromType(table);
  const logoUrl = business.logo_url || business.image_url || null;

  const { results: posts } = await c.env.DB.prepare(
    `SELECT id, text_content, content_html, image_url, geo_place, geo_lat, geo_lng, created_at
       FROM posts WHERE business_id = ? AND status = 'published'
       ORDER BY created_at DESC LIMIT 60`,
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

  const postsWithMedia = await Promise.all(posts.map(async (p) => {
    let likes = 0, commentCount = 0, views = 0;
    try { const raw = await c.env.NASKRAJ_LAJKY.get(`likecount:post:${p.id}`); likes = raw ? parseInt(raw, 10) : 0; } catch {}
    try { const cc = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM comments WHERE post_id = ?`).bind(p.id).first(); commentCount = cc?.n || 0; } catch {}
    try { const vr = await c.env.DB.prepare(`SELECT view_count FROM posts WHERE id = ?`).bind(p.id).first(); views = vr?.view_count || 0; } catch {}

    return {
      id: p.id,
      text: p.text_content,
      html: p.content_html || escapePlain(p.text_content),
      image_url: p.image_url,
      media: mediaMap[p.id] || (p.image_url ? [p.image_url] : []),
      created_at: p.created_at,
      likes,
      comment_count: commentCount,
      views,
      geo: p.geo_place ? { place: p.geo_place, lat: p.geo_lat, lng: p.geo_lng } : null,
      business: {
        id: business.id,
        name: business.name,
        type: business.type,
        region: business.region,
        district: business.district,
        city: business.city,
        is_verified: !!business.is_verified,
        logo_url: logoUrl,
        cuisine_type: business.cuisine_type || null,
      },
      __feedKey: feedKey,
    };
  }));

  const followers = await getFollowCount(c.env, type, id);
  const kind = bizKindFromType(table);

  return c.json({
    type: 'business',
    kind,
    feedKey,
    profile: business,
    posts: postsWithMedia,
    stats: { followers, posts: postsWithMedia.length },
    is_following: false,
  });
});
