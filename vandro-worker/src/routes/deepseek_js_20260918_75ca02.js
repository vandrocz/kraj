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

async function isFollowing(env, followerId, type, id) {
  if (!followerId) return false;
  const row = await env.DB.prepare(
    `SELECT 1 FROM follows WHERE follower_id = ? AND target_type = ? AND target_id = ?`,
  ).bind(followerId, type, id).first();
  return !!row;
}

async function getFollowCount(env, type, id) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM follows WHERE target_type = ? AND target_id = ?`,
  ).bind(type, id).first();
  return row?.n || 0;
}

// ---- GET /api/profile/:type/:id ----
profileRoutes.get('/:type/:id', async (c) => {
  const type = normalizeType(c.req.param('type'));
  const id = c.req.param('id');
  const table = TYPE_TO_TABLE[type];
  if (!table) return c.json({ error: 'Neznámý typ profilu.' }, 400);

  const viewerId = (() => {
    const h = c.req.header('Authorization') || '';
    return h.startsWith('Bearer ') ? null : null; // anonymný GET; is_following vráti false
  })();

  if (table === 'users') {
    const user = await c.env.DB.prepare(
      `SELECT id, display_name, bio, avatar_url, cover_url, location, website, role, created_at
       FROM users WHERE id = ?`,
    ).bind(id).first();
    if (!user) return c.json({ error: 'Užívateľ nenájdený.' }, 404);

    // Ak je to business účet, vráť aj jeho podniky
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

    const contributionsCount = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM contributions WHERE user_id = ?`,
    ).bind(id).first();

    return c.json({
      type: 'user',
      profile: user,
      businesses,
      stats: { contributions: contributionsCount?.n || 0 },
    });
  }

  // Business
  const business = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  if (!business) return c.json({ error: 'Profil nenájdený.' }, 404);

  const { results: posts } = await c.env.DB.prepare(
    `SELECT id, text_content, image_url, created_at FROM posts
     WHERE business_id = ? AND status = 'published' ORDER BY created_at DESC LIMIT 60`,
  ).bind(id).all();

  // Fetch media for posts
  const ids = posts.map((p) => p.id);
  let mediaMap = {};
  if (ids.length > 0) {
    const ph = ids.map(() => '?').join(',');
    const { results: mediaRows } = await c.env.DB.prepare(
      `SELECT post_id, image_url FROM post_media WHERE post_id IN (${ph}) ORDER BY sort_order`,
    ).bind(...ids).all();
    for (const r of mediaRows) {
      if (!mediaMap[r.post_id]) mediaMap[r.post_id] = [];
      mediaMap[r.post_id].push(r.image_url);
    }
  }

  const postsWithMedia = posts.map((p) => ({
    ...p,
    media: mediaMap[p.id] || (p.image_url ? [p.image_url] : []),
  }));

  const followers = await getFollowCount(c.env, type, id);
  const kind = bizKindFromType(table);

  return c.json({
    type: 'business',
    kind,
    profile: business,
    posts: postsWithMedia,
    stats: { followers, posts: posts.length },
    is_following: false, // doplní sa nižšie cez /follow/status ak treba
  });
});

// ---- GET /api/profile/me/settings ----
profileRoutes.get('/me/settings', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(`SELECT settings_json FROM users WHERE id = ?`).bind(user.sub).first();
  let settings = {
    push_notifications: true,
    email_notifications: true,
    public_profile: true,
    show_contributions: true,
  };
  if (row?.settings_json) {
    try { settings = { ...settings, ...JSON.parse(row.settings_json) }; } catch {}
  }
  return c.json({ settings });
});

// ---- PATCH /api/profile/me/settings ----
profileRoutes.patch('/me/settings', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const allowed = ['push_notifications', 'email_notifications', 'public_profile', 'show_contributions'];
  const settings = {};
  for (const k of allowed) if (k in body) settings[k] = !!body[k];
  await c.env.DB.prepare(`UPDATE users SET settings_json = ? WHERE id = ?`)
    .bind(JSON.stringify(settings), user.sub).run();
  return c.json({ ok: true, settings });
});

// ---- PATCH /api/profile/me/user - aktualizácia vlastného users profilu ----
profileRoutes.patch('/me/user', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const fields = ['display_name', 'bio', 'location', 'website', 'phone'];
  const sets = [];
  const params = [];
  for (const f of fields) {
    if (f in body) { sets.push(`${f} = ?`); params.push(body[f] ?? null); }
  }
  if (sets.length === 0) return c.json({ error: 'Žiadne polia na aktualizáciu.' }, 400);
  params.push(user.sub);
  await c.env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
  const updated = await c.env.DB.prepare(
    `SELECT id, email, role, display_name, bio, avatar_url, cover_url, location, website, phone FROM users WHERE id = ?`,
  ).bind(user.sub).first();
  return c.json({ user: updated });
});

// ---- PATCH /api/profile/me/:type/:id - aktualizácia vlastného business profilu ----
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
  const sets = [];
  const params = [];
  for (const f of allowedFields) {
    if (f in body) { sets.push(`${f} = ?`); params.push(body[f] ?? null); }
  }
  if (sets.length === 0) return c.json({ error: 'Žiadne polia.' }, 400);
  params.push(id);
  await c.env.DB.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
  const updated = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  return c.json({ business: updated });
});

// ---- POST /api/profile/me/upload (avatar/cover pre usera alebo business) ----
profileRoutes.post('/me/upload', async (c) => {
  const user = c.get('user');
  const form = await c.req.parseBody();
  const file = form.file;
  const target = (form.target || 'user').toString(); // 'user' | 'organizations' | 'accommodation' | 'restaurants'
  const targetId = (form.target_id || '').toString();
  const field = (form.field || 'avatar').toString(); // 'avatar' | 'cover'

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
  if (!owned || (owned.user_id !== user.sub && user.role !== 'admin')) {
    return c.json({ error: 'Nemáš oprávnenie.' }, 403);
  }
  const col = field === 'cover' ? 'cover_url' : (table === 'organizations' ? 'logo_url' : 'image_url');
  await c.env.DB.prepare(`UPDATE ${table} SET ${col} = ? WHERE id = ?`).bind(url, targetId).run();
  return c.json({ url, field: col });
});

// ---- POST /api/profile/follow - toggle follow ----
profileRoutes.post('/follow', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const type = normalizeType(body.type);
  const id = body.id;
  if (!TYPE_TO_TABLE[type] || !id) return c.json({ error: 'Neplatný cieľ.' }, 400);
  if (type === 'users' && id === user.sub) return c.json({ error: 'Nemôžeš sledovať sám seba.' }, 400);

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
  return c.json({ following: true, followers });
});

// ---- GET /api/profile/follow/status?type=...&id=... ----
profileRoutes.get('/follow/status', async (c) => {
  const user = c.get('user');
  const type = normalizeType(c.req.query('type') || '');
  const id = c.req.query('id') || '';
  if (!TYPE_TO_TABLE[type] || !id) return c.json({ following: false, followers: 0 });
  const following = await isFollowing(c.env, user.sub, type, id);
  const followers = await getFollowCount(c.env, type, id);
  return c.json({ following, followers });
});