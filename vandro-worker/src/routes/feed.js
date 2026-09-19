import { Hono } from 'hono';
import { verify } from 'hono/jwt';
import { newId } from '../auth.js';
import { ensureActiveProjectRotation } from '../cron.js';
import { checkText, flagContent, escapeLike } from '../moderation.js';
import { rateLimit } from '../ratelimit.js';

export const feedRoutes = new Hono();

const PROTECTION_MS = 30 * 60 * 1000;

function projectPhase(project) {
  if (project.status === 'waiting') return 'waiting';
  if (project.status === 'completed') return 'completed';
  if (!project.activated_at) return 'preparing';
  const activatedMs = new Date(project.activated_at + 'Z').getTime();
  return Date.now() - activatedMs < PROTECTION_MS ? 'preparing' : 'running';
}

async function attachLikes(env, projects) {
  return Promise.all(projects.map(async (p) => {
    const raw = await env.NASKRAJ_LAJKY.get(`likecount:${p.id}`);
    return { ...p, likes: raw ? parseInt(raw, 10) : 0 };
  }));
}

async function fetchMediaForPosts(env, postIds) {
  if (postIds.length === 0) return {};
  const ph = postIds.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT post_id, image_url FROM post_media WHERE post_id IN (${ph}) ORDER BY sort_order ASC`,
  ).bind(...postIds).all();
  const map = {};
  for (const r of results) {
    if (!map[r.post_id]) map[r.post_id] = [];
    map[r.post_id].push(r.image_url);
  }
  return map;
}

function escapePlain(t) {
  return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---- Block helper: zisti blokovaných pre daného diváka ----
async function getBlockedIds(env, viewerId) {
  if (!viewerId) return new Set();
  try {
    const { results: a } = await env.DB.prepare(`SELECT blocked_id AS id FROM blocks WHERE blocker_id = ?`).bind(viewerId).all();
    const { results: b } = await env.DB.prepare(`SELECT blocker_id AS id FROM blocks WHERE blocked_id = ?`).bind(viewerId).all();
    return new Set([...a.map((r) => r.id), ...b.map((r) => r.id)]);
  } catch {
    return new Set();
  }
}

async function getViewerId(c, env) {
  const h = c.req.header('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  try {
    const payload = await verify(h.slice(7), env.JWT_SECRET, 'HS256');
    return payload.sub;
  } catch { return null; }
}

// ---- Cursor helpers ----
function encodeCursor(createdAt, id) {
  return btoa(`${createdAt}|${id}`);
}
function decodeCursor(cursor) {
  try {
    const [createdAt, id] = atob(cursor).split('|');
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch { return null; }
}

// ---- Zbierky (ostávajú v kóde, len sa nezobrazujú) ----
feedRoutes.get('/collections', async (c) => {
  await ensureActiveProjectRotation(c.env);
  const active = await c.env.DB.prepare(
    `SELECT projects.*, organizations.name AS org_name, organizations.logo_url AS org_logo
     FROM projects JOIN organizations ON organizations.id = projects.organization_id
     WHERE projects.status IN ('active', 'completed') ORDER BY projects.activated_at DESC LIMIT 1`,
  ).first();
  const { results: waitingRaw } = await c.env.DB.prepare(
    `SELECT projects.*, organizations.name AS org_name, organizations.logo_url AS org_logo
     FROM projects JOIN organizations ON organizations.id = projects.organization_id
     WHERE projects.status = 'waiting' ORDER BY projects.created_at DESC`,
  ).all();
  const waitingWithLikes = await attachLikes(c.env, waitingRaw);
  waitingWithLikes.sort((a, b) => b.likes - a.likes);
  const activeOut = active ? { ...(await attachLikes(c.env, [active]))[0], phase: projectPhase(active) } : null;
  return c.json({ active: activeOut, waiting: waitingWithLikes.slice(0, 10).map((p) => ({ ...p, phase: 'waiting' })) });
});

feedRoutes.post('/collections/:id/like', async (c) => {
  const user = c.get('user'); const projectId = c.req.param('id');
  const project = await c.env.DB.prepare('SELECT id, status FROM projects WHERE id = ?').bind(projectId).first();
  if (!project) return c.json({ error: 'Nenájdené.' }, 404);
  if (project.status !== 'waiting') return c.json({ error: 'Lajkovať sa dá len v poradovníku.' }, 400);
  const likeKey = `like:${projectId}:${user.sub}`;
  if (await c.env.NASKRAJ_LAJKY.get(likeKey)) return c.json({ liked: true });
  await c.env.NASKRAJ_LAJKY.put(likeKey, '1');
  const cur = await c.env.NASKRAJ_LAJKY.get(`likecount:${projectId}`);
  const n = (cur ? parseInt(cur, 10) : 0) + 1;
  await c.env.NASKRAJ_LAJKY.put(`likecount:${projectId}`, String(n));
  return c.json({ liked: true, likes: n }, 201);
});

// ---- Personalizovaný algoritmus ----
function scorePostForUser(post, { followedIds, userCity, userRegion, verifiedBoost = true }) {
  const now = Date.now();
  const created = new Date(post.created_at.replace(' ', 'T') + 'Z').getTime();
  const ageHours = (now - created) / 3600000;

  let score = 100 * Math.pow(0.5, ageHours / 24);
  score += (post.likes || 0) * 2;
  score += (post.comment_count || 0) * 5;
  if (verifiedBoost && post.business?.is_verified) score *= 1.3;
  if (followedIds?.has(post.business?.id)) score *= 2.5;
  if (userCity && post.business?.city === userCity) score *= 1.8;
  else if (userRegion && post.business?.region === userRegion) score *= 1.3;
  score *= 0.9 + Math.random() * 0.2;
  return score;
}

async function loadSocialFeed(c, { targetFeed, table, extraFilterCols }) {
  const search = (c.req.query('search') || '').trim();
  const region = c.req.query('region') || '';
  const district = c.req.query('district') || '';
  const type = c.req.query('type') || '';
  const cuisine = c.req.query('cuisine') || '';
  const businessId = c.req.query('business_id') || '';
  const sort = c.req.query('sort') || 'for_you';
  const cursorRaw = c.req.query('cursor') || null;
  const limit = Math.min(parseInt(c.req.query('limit') || '12', 10), 30);

  const viewerId = await getViewerId(c, c.env);
  const blockedIds = await getBlockedIds(c.env, viewerId);

  const conditions = [`posts.target_feed = ?`, `posts.status = 'published'`];
  const params = [targetFeed];

  if (businessId) { conditions.push('posts.business_id = ?'); params.push(businessId); }
  if (search) { conditions.push(`${table}.name LIKE ? ESCAPE '\\'`); params.push(`%${escapeLike(search)}%`); }
  if (region) { conditions.push(`${table}.region = ?`); params.push(region); }
  if (district) { conditions.push(`${table}.district = ?`); params.push(district); }
  if (type) { conditions.push(`${table}.type = ?`); params.push(type); }
  if (cuisine && extraFilterCols?.includes('cuisine_type')) { conditions.push(`${table}.cuisine_type = ?`); params.push(cuisine); }

  // Block filter: vylúč autorov príspevkov, ktorých mám blokovaných
  if (blockedIds.size > 0) {
    const placeholders = [...blockedIds].map(() => '?').join(',');
    conditions.push(`posts.user_id NOT IN (${placeholders})`);
    for (const id of blockedIds) params.push(id);
  }

  // Cursor pre "recent" sortovanie (created_at DESC, id DESC)
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
  if (cursor && sort === 'recent') {
    conditions.push(`(posts.created_at < ? OR (posts.created_at = ? AND posts.id < ?))`);
    params.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }

  // Pre "for_you" a "trending" nemôžeme použiť cursor jednoducho, takže aplikujeme len limit + pri "recent" cursor
  const sql = `
    SELECT posts.id, posts.user_id, posts.text_content, posts.content_html, posts.image_url, posts.created_at,
           posts.geo_lat, posts.geo_lng, posts.geo_place, posts.view_count,
           ${table}.id AS business_id, ${table}.name AS business_name, ${table}.type AS business_type,
           ${table}.region, ${table}.district, ${table}.city, ${table}.is_verified
           ${extraFilterCols?.includes('cuisine_type') ? `, ${table}.cuisine_type` : ''}
    FROM posts JOIN ${table} ON ${table}.id = posts.business_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY posts.created_at DESC
    LIMIT ${sort === 'recent' ? limit + 1 : 60}
  `;

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  const mediaMap = await fetchMediaForPosts(c.env, results.map((r) => r.id));

  // Personalizácia
  let followedIds = new Set(), userCity = null, userRegion = null;
  if (viewerId && sort !== 'recent') {
    try {
      const { results: fol } = await c.env.DB.prepare(
        `SELECT target_id FROM follows WHERE follower_id = ? AND target_type = ?`,
      ).bind(viewerId, table).all();
      followedIds = new Set(fol.map((r) => r.target_id));
      const u = await c.env.DB.prepare('SELECT geo_city FROM users WHERE id = ?').bind(viewerId).first();
      userCity = u?.geo_city || null;
      if (userCity) {
        const cRow = await c.env.DB.prepare(`SELECT region FROM ${table} WHERE city = ? LIMIT 1`).bind(userCity).first();
        userRegion = cRow?.region || null;
      }
    } catch {}
  }

  let out = await Promise.all(results.map(async (post) => {
    const cc = await c.env.DB.prepare('SELECT COUNT(*) as n FROM comments WHERE post_id = ?').bind(post.id).first();
    const likesRaw = await c.env.NASKRAJ_LAJKY.get(`likecount:post:${post.id}`);
    const likes = likesRaw ? parseInt(likesRaw, 10) : 0;
    return {
      id: post.id,
      text: post.text_content,
      html: post.content_html || escapePlain(post.text_content),
      image_url: post.image_url,
      media: mediaMap[post.id] || (post.image_url ? [post.image_url] : []),
      created_at: post.created_at,
      comment_count: cc?.n || 0,
      likes,
      views: post.view_count || 0,
      geo: post.geo_place ? { place: post.geo_place, lat: post.geo_lat, lng: post.geo_lng } : null,
      business: {
        id: post.business_id,
        name: post.business_name,
        type: post.business_type,
        region: post.region,
        district: post.district,
        city: post.city,
        is_verified: !!post.is_verified,
        cuisine_type: post.cuisine_type || null,
      },
    };
  }));

  // Aplikuj sort
  if (sort === 'trending') {
    out = out.map((p) => ({ ...p, __score: scorePostForUser(p, {}) })).sort((a, b) => b.__score - a.__score);
    out = out.slice(0, limit);
  } else if (sort === 'for_you') {
    out = out.map((p) => ({ ...p, __score: scorePostForUser(p, { followedIds, userCity, userRegion }) })).sort((a, b) => b.__score - a.__score);
    out = out.slice(0, limit);
  } else {
    // recent — cursor pagination
    const hasMore = out.length > limit;
    out = out.slice(0, limit);
    const last = out[out.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.created_at, last.id) : null;
    return c.json({ feed: out, next_cursor: nextCursor });
  }

  return c.json({ feed: out, next_cursor: null });
}

feedRoutes.get('/organization', (c) => loadSocialFeed(c, { targetFeed: 'organization', table: 'organizations' }));
feedRoutes.get('/accommodation', (c) => loadSocialFeed(c, { targetFeed: 'accommodation', table: 'accommodation' }));
feedRoutes.get('/gastro', (c) => loadSocialFeed(c, { targetFeed: 'gastro', table: 'restaurants', extraFilterCols: ['cuisine_type'] }));

// ---- View count ----
feedRoutes.post('/:id/view', async (c) => {
  const postId = c.req.param('id');
  try {
    await c.env.DB.prepare(`UPDATE posts SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ? AND status = 'published'`).bind(postId).run();
  } catch {}
  return c.json({ ok: true });
});

// ---- Like ----
feedRoutes.post('/:id/like', async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');
  const post = await c.env.DB.prepare(`SELECT id, user_id FROM posts WHERE id = ? AND status = 'published'`).bind(postId).first();
  if (!post) return c.json({ error: 'Nenalezeno.' }, 404);
  const likeKey = `like:post:${postId}:${user.sub}`;
  if (await c.env.NASKRAJ_LAJKY.get(likeKey)) {
    const r = await c.env.NASKRAJ_LAJKY.get(`likecount:post:${postId}`);
    return c.json({ liked: true, likes: r ? parseInt(r, 10) : 0 });
  }
  await c.env.NASKRAJ_LAJKY.put(likeKey, '1');
  const cur = await c.env.NASKRAJ_LAJKY.get(`likecount:post:${postId}`);
  const n = (cur ? parseInt(cur, 10) : 0) + 1;
  await c.env.NASKRAJ_LAJKY.put(`likecount:post:${postId}`, String(n));
  if (post.user_id && post.user_id !== user.sub) {
    try {
      await c.env.DB.prepare(`INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, text) VALUES (?, ?, 'like', ?, 'post', ?, 'dal(a) like tvému příspěvku')`).bind(newId('notif'), post.user_id, user.sub, postId).run();
    } catch {}
  }
  return c.json({ liked: true, likes: n }, 201);
});

// ---- Bookmarks ----
feedRoutes.get('/bookmarks', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT posts.id, posts.text_content, posts.content_html, posts.image_url, posts.created_at, posts.target_feed,
            organizations.name AS org_name, accommodation.name AS acc_name, restaurants.name AS rest_name
     FROM bookmarks
     JOIN posts ON posts.id = bookmarks.post_id
     LEFT JOIN organizations ON organizations.id = posts.business_id AND posts.target_feed = 'organization'
     LEFT JOIN accommodation ON accommodation.id = posts.business_id AND posts.target_feed = 'accommodation'
     LEFT JOIN restaurants ON restaurants.id = posts.business_id AND posts.target_feed = 'gastro'
     WHERE bookmarks.user_id = ? AND posts.status = 'published'
     ORDER BY bookmarks.created_at DESC LIMIT 100`,
  ).bind(user.sub).all();
  return c.json({ bookmarks: results });
});

feedRoutes.post('/:id/bookmark', async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');
  const post = await c.env.DB.prepare(`SELECT id FROM posts WHERE id = ? AND status = 'published'`).bind(postId).first();
  if (!post) return c.json({ error: 'Nenalezeno.' }, 404);
  const existing = await c.env.DB.prepare(`SELECT 1 FROM bookmarks WHERE user_id = ? AND post_id = ?`).bind(user.sub, postId).first();
  if (existing) {
    await c.env.DB.prepare(`DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?`).bind(user.sub, postId).run();
    return c.json({ bookmarked: false });
  }
  await c.env.DB.prepare(`INSERT INTO bookmarks (user_id, post_id) VALUES (?, ?)`).bind(user.sub, postId).run();
  return c.json({ bookmarked: true }, 201);
});

feedRoutes.get('/:id/bookmarked', async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT 1 FROM bookmarks WHERE user_id = ? AND post_id = ?`).bind(user.sub, postId).first();
  return c.json({ bookmarked: !!row });
});

// ---- Delete ----
feedRoutes.delete('/post/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const post = await c.env.DB.prepare('SELECT id, user_id FROM posts WHERE id = ?').bind(id).first();
  if (!post) return c.json({ error: 'Nenalezeno.' }, 404);
  if (post.user_id !== user.sub && user.role !== 'admin') return c.json({ error: 'Nemáš oprávnění.' }, 403);
  await c.env.DB.prepare(`UPDATE posts SET status = 'removed' WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

feedRoutes.delete('/comment/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT id, user_id FROM comments WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'Nenalezeno.' }, 404);
  if (row.user_id !== user.sub && user.role !== 'admin') return c.json({ error: 'Nemáš oprávnění.' }, 403);
  await c.env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ---- Comments (s reply) ----
feedRoutes.get('/:id/comments', async (c) => {
  const postId = c.req.param('id');
  const viewerId = await getViewerId(c, c.env);
  const blockedIds = await getBlockedIds(c.env, viewerId);

  const { results } = await c.env.DB.prepare(
    `SELECT comments.id, comments.comment_text, comments.created_at, comments.parent_id,
            users.id AS user_id, users.display_name AS user_name, users.avatar_url AS user_avatar
     FROM comments JOIN users ON users.id = comments.user_id
     WHERE post_id = ? ORDER BY comments.created_at ASC`,
  ).bind(postId).all();

  // Filtruj blokovaných
  const filtered = results.filter((r) => !blockedIds.has(r.user_id));

  // Organizuj do vlákien: root komentáre s replies[]
  const byId = {};
  const roots = [];
  for (const r of filtered) byId[r.id] = { ...r, replies: [] };
  for (const r of filtered) {
    if (r.parent_id && byId[r.parent_id]) {
      byId[r.parent_id].replies.push(byId[r.id]);
    } else {
      roots.push(byId[r.id]);
    }
  }
  return c.json({ comments: roots, total: filtered.length });
});

feedRoutes.post('/:id/comment', async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');
  const rl = await rateLimit(c.env, 'comment', user.sub, 60, 3600);
  if (!rl.ok) return c.json({ error: 'Příliš mnoho komentářů.' }, 429);

  const body = await c.req.json().catch(() => ({}));
  const text = (body.text || '').trim();
  const parentId = body.parent_id ? String(body.parent_id) : null;
  if (!text) return c.json({ error: 'Prázdný komentář.' }, 400);

  const mod = checkText(text);
  if (!mod.clean && mod.severity >= 2) {
    await flagContent(c.env, { userId: user.sub, reason: mod.reason, severity: mod.severity });
    return c.json({ error: 'Zakázaný obsah.' }, 400);
  }

  const post = await c.env.DB.prepare(`SELECT id, user_id FROM posts WHERE id = ? AND status = 'published'`).bind(postId).first();
  if (!post) return c.json({ error: 'Nenalezeno.' }, 404);

  // Ak je parent, over že patrí k tomuto postu
  let parentComment = null;
  if (parentId) {
    parentComment = await c.env.DB.prepare('SELECT id, user_id FROM comments WHERE id = ? AND post_id = ?').bind(parentId, postId).first();
    if (!parentComment) return c.json({ error: 'Nadřazený komentář nenalezen.' }, 400);
  }

  const id = newId('comment');
  await c.env.DB.prepare('INSERT INTO comments (id, post_id, user_id, comment_text, parent_id) VALUES (?, ?, ?, ?, ?)')
    .bind(id, postId, user.sub, text, parentId).run();

  // Notifikácia autorovi príspevku
  if (post.user_id && post.user_id !== user.sub) {
    try {
      await c.env.DB.prepare(
        `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, text)
         VALUES (?, ?, 'comment', ?, 'post', ?, 'okomentoval(a) tvůj příspěvek')`,
      ).bind(newId('notif'), post.user_id, user.sub, postId).run();
    } catch {}
  }

  // Notifikácia autorovi rodičovského komentáru (ak nie je ten istý ako autor príspevku)
  if (parentComment && parentComment.user_id !== user.sub && parentComment.user_id !== post.user_id) {
    try {
      await c.env.DB.prepare(
        `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, text)
         VALUES (?, ?, 'reply', ?, 'comment', ?, 'odpověděl(a) na tvůj komentář')`,
      ).bind(newId('notif'), parentComment.user_id, user.sub, id).run();
    } catch {}
  }

  return c.json({ id, post_id: postId, parent_id: parentId, text, created_at: new Date().toISOString() }, 201);
});

feedRoutes.post('/:id/report', async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const post = await c.env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(postId).first();
  if (!post) return c.json({ error: 'Nenalezeno.' }, 404);
  const id = newId('report');
  await c.env.DB.prepare('INSERT INTO reports (id, post_id, reporter_id, reason) VALUES (?, ?, ?, ?)')
    .bind(id, postId, user.sub, body.reason || null).run();
  return c.json({ id, ok: true }, 201);
});

// ---- Business feed pre profil ----
feedRoutes.get('/business/:kind/:id', async (c) => {
  const kind = c.req.param('kind');
  const id = c.req.param('id');
  const map = { organizations: 'organizations', accommodation: 'accommodation', restaurants: 'restaurants' };
  const table = map[kind];
  if (!table) return c.json({ error: 'Neznámý typ.' }, 400);
  const business = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  if (!business) return c.json({ error: 'Nenalezeno.' }, 404);
  const { results: posts } = await c.env.DB.prepare(
    `SELECT id, text_content, content_html, image_url, geo_place, created_at FROM posts WHERE business_id = ? AND status = 'published' ORDER BY created_at DESC LIMIT 30`,
  ).bind(id).all();
  const mediaMap = await fetchMediaForPosts(c.env, posts.map((p) => p.id));
  const postsWithMedia = posts.map((p) => ({
    ...p, html: p.content_html || escapePlain(p.text_content),
    media: mediaMap[p.id] || (p.image_url ? [p.image_url] : []),
  }));
  return c.json({ business, posts: postsWithMedia });
});
