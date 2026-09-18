import { Hono } from 'hono';
import { newId } from '../auth.js';
import { ensureActiveProjectRotation } from '../cron.js';
import { checkText, flagContent } from '../moderation.js';
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
  for (const r of results) { if (!map[r.post_id]) map[r.post_id] = []; map[r.post_id].push(r.image_url); }
  return map;
}

// ---- Zbierky ----
feedRoutes.get('/collections', async (c) => {
  await ensureActiveProjectRotation(c.env);
  const active = await c.env.DB.prepare(
    `SELECT projects.*, organizations.name AS org_name, organizations.logo_url AS org_logo
     FROM projects JOIN organizations ON organizations.id = projects.organization_id
     WHERE projects.status IN ('active', 'completed')
     ORDER BY projects.activated_at DESC LIMIT 1`,
  ).first();
  const { results: waitingRaw } = await c.env.DB.prepare(
    `SELECT projects.*, organizations.name AS org_name, organizations.logo_url AS org_logo
     FROM projects JOIN organizations ON organizations.id = projects.organization_id
     WHERE projects.status = 'waiting' ORDER BY projects.created_at DESC`,
  ).all();
  const waitingWithLikes = await attachLikes(c.env, waitingRaw);
  waitingWithLikes.sort((a, b) => b.likes - a.likes);
  const waitingTop10 = waitingWithLikes.slice(0, 10);
  const activeOut = active ? { ...(await attachLikes(c.env, [active]))[0], phase: projectPhase(active) } : null;
  return c.json({ active: activeOut, waiting: waitingTop10.map((p) => ({ ...p, phase: 'waiting' })) });
});

feedRoutes.post('/collections/:id/like', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('id');
  const project = await c.env.DB.prepare('SELECT id, status FROM projects WHERE id = ?').bind(projectId).first();
  if (!project) return c.json({ error: 'Projekt nenájdený.' }, 404);
  if (project.status !== 'waiting') return c.json({ error: 'Lajkovať sa dá len projekt v poradovníku.' }, 400);
  const likeKey = `like:${projectId}:${user.sub}`;
  if (await c.env.NASKRAJ_LAJKY.get(likeKey)) return c.json({ liked: true, message: 'Už si lajkol.' });
  await c.env.NASKRAJ_LAJKY.put(likeKey, '1');
  const countKey = `likecount:${projectId}`;
  const current = await c.env.NASKRAJ_LAJKY.get(countKey);
  const newCount = (current ? parseInt(current, 10) : 0) + 1;
  await c.env.NASKRAJ_LAJKY.put(countKey, String(newCount));
  return c.json({ liked: true, likes: newCount }, 201);
});

// ---- Business feed ----
async function loadSocialFeed(c, { targetFeed, table, extraFilterCols }) {
  const search = (c.req.query('search') || '').trim();
  const region = c.req.query('region') || '';
  const district = c.req.query('district') || '';
  const type = c.req.query('type') || '';
  const cuisine = c.req.query('cuisine') || '';
  const businessId = c.req.query('business_id') || '';
  const sort = c.req.query('sort') || 'recent'; // recent | trending | for_you

  const conditions = [`posts.target_feed = ?`, `posts.status = 'published'`];
  const params = [targetFeed];

  if (businessId) { conditions.push(`posts.business_id = ?`); params.push(businessId); }
  if (search) { conditions.push(`${table}.name LIKE ?`); params.push(`%${search}%`); }
  if (region) { conditions.push(`${table}.region = ?`); params.push(region); }
  if (district) { conditions.push(`${table}.district = ?`); params.push(district); }
  if (type) { conditions.push(`${table}.type = ?`); params.push(type); }
  if (cuisine && extraFilterCols?.includes('cuisine_type')) { conditions.push(`${table}.cuisine_type = ?`); params.push(cuisine); }

  const sql = `
    SELECT posts.id, posts.text_content, posts.image_url, posts.created_at,
           ${table}.id AS business_id, ${table}.name AS business_name, ${table}.type AS business_type,
           ${table}.region, ${table}.district, ${table}.city, ${table}.is_verified
           ${extraFilterCols?.includes('cuisine_type') ? `, ${table}.cuisine_type` : ''}
    FROM posts JOIN ${table} ON ${table}.id = posts.business_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY posts.created_at DESC LIMIT 50
  `;

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  const mediaMap = await fetchMediaForPosts(c.env, results.map((r) => r.id));

  let withStats = await Promise.all(results.map(async (post) => {
    const cc = await c.env.DB.prepare('SELECT COUNT(*) as n FROM comments WHERE post_id = ?').bind(post.id).first();
    const likesRaw = await c.env.NASKRAJ_LAJKY.get(`likecount:post:${post.id}`);
    const likes = likesRaw ? parseInt(likesRaw, 10) : 0;
    return {
      id: post.id, text: post.text_content, image_url: post.image_url,
      media: mediaMap[post.id] || (post.image_url ? [post.image_url] : []),
      created_at: post.created_at, comment_count: cc?.n || 0, likes,
      business: {
        id: post.business_id, name: post.business_name, type: post.business_type,
        region: post.region, district: post.district, city: post.city,
        is_verified: !!post.is_verified, cuisine_type: post.cuisine_type || null,
      },
    };
  }));

  if (sort === 'trending' || sort === 'for_you') {
    const now = Date.now();
    withStats = withStats.map((p) => {
      const created = new Date(p.created_at.replace(' ', 'T') + 'Z').getTime();
      const ageH = (now - created) / 3600000;
      // jednoduché scoring: lajky*3 + komentáre*5 - vek
      const score = p.likes * 3 + p.comment_count * 5 - ageH * 0.5;
      return { ...p, __score: score };
    }).sort((a, b) => b.__score - a.__score);
  }

  return c.json({ feed: withStats });
}

feedRoutes.get('/organization', (c) => loadSocialFeed(c, { targetFeed: 'organization', table: 'organizations' }));
feedRoutes.get('/accommodation', (c) => loadSocialFeed(c, { targetFeed: 'accommodation', table: 'accommodation' }));
feedRoutes.get('/gastro', (c) => loadSocialFeed(c, { targetFeed: 'gastro', table: 'restaurants', extraFilterCols: ['cuisine_type'] }));

// ---- Like post ----
feedRoutes.post('/:id/like', async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');
  const post = await c.env.DB.prepare(`SELECT id, user_id FROM posts WHERE id = ? AND status = 'published'`).bind(postId).first();
  if (!post) return c.json({ error: 'Nenalezeno.' }, 404);

  const likeKey = `like:post:${postId}:${user.sub}`;
  if (await c.env.NASKRAJ_LAJKY.get(likeKey)) {
    const raw = await c.env.NASKRAJ_LAJKY.get(`likecount:post:${postId}`);
    return c.json({ liked: true, likes: raw ? parseInt(raw, 10) : 0 });
  }
  await c.env.NASKRAJ_LAJKY.put(likeKey, '1');
  const current = await c.env.NASKRAJ_LAJKY.get(`likecount:post:${postId}`);
  const newCount = (current ? parseInt(current, 10) : 0) + 1;
  await c.env.NASKRAJ_LAJKY.put(`likecount:post:${postId}`, String(newCount));

  // Notifikácia autorovi
  if (post.user_id && post.user_id !== user.sub) {
    try {
      await c.env.DB.prepare(
        `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, text)
         VALUES (?, ?, 'like', ?, 'post', ?, 'dal(a) like tvému příspěvku')`,
      ).bind(newId('notif'), post.user_id, user.sub, postId).run();
    } catch {}
  }

  return c.json({ liked: true, likes: newCount }, 201);
});

// ---- Delete own post ----
feedRoutes.delete('/post/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const post = await c.env.DB.prepare('SELECT id, user_id FROM posts WHERE id = ?').bind(id).first();
  if (!post) return c.json({ error: 'Nenalezeno.' }, 404);
  if (post.user_id !== user.sub && user.role !== 'admin') return c.json({ error: 'Nemáš oprávnění.' }, 403);
  await c.env.DB.prepare(`UPDATE posts SET status = 'removed' WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

// ---- Delete own comment ----
feedRoutes.delete('/comment/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT id, user_id FROM comments WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'Nenalezeno.' }, 404);
  if (row.user_id !== user.sub && user.role !== 'admin') return c.json({ error: 'Nemáš oprávnění.' }, 403);
  await c.env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ---- Comments ----
feedRoutes.get('/:id/comments', async (c) => {
  const postId = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    `SELECT comments.id, comments.comment_text, comments.created_at,
            users.id AS user_id, users.display_name AS user_name, users.avatar_url AS user_avatar
     FROM comments JOIN users ON users.id = comments.user_id
     WHERE post_id = ? ORDER BY comments.created_at ASC`,
  ).bind(postId).all();
  return c.json({ comments: results });
});

feedRoutes.post('/:id/comment', async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');
  const rl = await rateLimit(c.env, 'comment', user.sub, 60, 3600);
  if (!rl.ok) return c.json({ error: 'Příliš mnoho komentářů.' }, 429);

  const body = await c.req.json().catch(() => ({}));
  const text = (body.text || '').trim();
  if (!text) return c.json({ error: 'Komentár nemôže byť prázdny.' }, 400);

  const mod = checkText(text);
  if (!mod.clean && mod.severity >= 2) {
    await flagContent(c.env, { userId: user.sub, reason: mod.reason, severity: mod.severity });
    return c.json({ error: 'Text obsahuje zakázaný obsah.' }, 400);
  }

  const post = await c.env.DB.prepare(`SELECT id, user_id FROM posts WHERE id = ? AND status = 'published'`).bind(postId).first();
  if (!post) return c.json({ error: 'Nenalezeno.' }, 404);

  const id = newId('comment');
  await c.env.DB.prepare('INSERT INTO comments (id, post_id, user_id, comment_text) VALUES (?, ?, ?, ?)')
    .bind(id, postId, user.sub, text).run();

  if (post.user_id && post.user_id !== user.sub) {
    try {
      await c.env.DB.prepare(
        `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, text)
         VALUES (?, ?, 'comment', ?, 'post', ?, 'okomentoval(a) tvůj příspěvek')`,
      ).bind(newId('notif'), post.user_id, user.sub, postId).run();
    } catch {}
  }

  return c.json({ id, post_id: postId, text, created_at: new Date().toISOString() }, 201);
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

// ---- Business profile feed (použité v /api/profile) ----
feedRoutes.get('/business/:kind/:id', async (c) => {
  const kind = c.req.param('kind');
  const id = c.req.param('id');
  const map = { organizations: 'organizations', accommodation: 'accommodation', restaurants: 'restaurants' };
  const table = map[kind];
  if (!table) return c.json({ error: 'Neznámý typ.' }, 400);
  const business = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  if (!business) return c.json({ error: 'Nenalezeno.' }, 404);
  const { results: posts } = await c.env.DB.prepare(
    `SELECT id, text_content, image_url, created_at FROM posts WHERE business_id = ? AND status = 'published' ORDER BY created_at DESC LIMIT 30`,
  ).bind(id).all();
  const mediaMap = await fetchMediaForPosts(c.env, posts.map((p) => p.id));
  const postsWithMedia = posts.map((p) => ({ ...p, media: mediaMap[p.id] || (p.image_url ? [p.image_url] : []) }));
  return c.json({ business, posts: postsWithMedia });
});
