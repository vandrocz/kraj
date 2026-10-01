import { Hono } from 'hono';
import { verify } from 'hono/jwt';
import { newId } from '../auth.js';
import { ensureActiveProjectRotation } from '../cron.js';
import { checkText, flagContent, sanitizeHtml, htmlToPlain, escapeLike } from '../moderation.js';
import { rateLimit } from '../ratelimit.js';
import { extractHashtags } from '../hashtags.js';
import { sendPushToUser } from '../push.js';

export const feedRoutes = new Hono();

const PROTECTION_MS = 30 * 60 * 1000;

// ============================================================
// KRITICKÉ: cache-control hlavičky pro všechny feed odpovědi
// Bez tohoto prohlížeč/Cloudflare cachuje odpověď jako anonymní
// a po reloadu dostaneš cached verzi bez __liked: true
// ============================================================
feedRoutes.use('*', async (c, next) => {
  await next();
  try {
    c.res.headers.set('Cache-Control', 'private, no-store, no-cache, max-age=0, must-revalidate');
    c.res.headers.set('Pragma', 'no-cache');
    c.res.headers.set('Vary', 'Authorization, Origin');
  } catch {}
});

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

// ============================================================
// Batch fetch likes z D1 — pro celou stránku jeden query
// Vrací: { likesMap: { postId: count }, likedSet: Set(postId) }
// ============================================================
async function fetchLikesForPosts(env, postIds, viewerId) {
  const likesMap = {};
  const likedSet = new Set();
  if (!postIds || postIds.length === 0) return { likesMap, likedSet };

  const ph = postIds.map(() => '?').join(',');
  try {
    const { results } = await env.DB.prepare(
      `SELECT post_id, COUNT(*) AS n FROM post_likes WHERE post_id IN (${ph}) GROUP BY post_id`,
    ).bind(...postIds).all();
    for (const r of results) likesMap[r.post_id] = Number(r.n) || 0;
  } catch (err) {
    console.warn('[likes] batch count failed:', err.message);
  }

  if (viewerId) {
    try {
      const { results } = await env.DB.prepare(
        `SELECT post_id FROM post_likes WHERE user_id = ? AND post_id IN (${ph})`,
      ).bind(viewerId, ...postIds).all();
      for (const r of results) likedSet.add(r.post_id);
      if (results.length > 0) {
        console.log(`[likes] user ${viewerId} has ${results.length} likes in this batch`);
      }
    } catch (err) {
      // === FIX ===: pri zlyhaní dotazu radšej zalogujeme ako error (nie warn)
      // a vrátime prázdny likedSet — frontend si to vyžiada pri ďalšom requeste
      console.error('[likes] batch viewer lookup FAILED:', err.message);
    }
  } else {
    console.log('[likes] viewerId is NULL — skipping user likes lookup');
  }

  return { likesMap, likedSet };
}

function escapePlain(t) {
  return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function getBlockedIds(env, viewerId) {
  if (!viewerId) return new Set();
  try {
    const { results: a } = await env.DB.prepare(`SELECT blocked_id AS id FROM blocks WHERE blocker_id = ?`).bind(viewerId).all();
    const { results: b } = await env.DB.prepare(`SELECT blocker_id AS id FROM blocks WHERE blocked_id = ?`).bind(viewerId).all();
    return new Set([...a.map((r) => r.id), ...b.map((r) => r.id)]);
  } catch { return new Set(); }
}

async function getViewerId(c, env) {
  const h = c.req.header('Authorization') || '';
  if (!h.startsWith('Bearer ')) {
    console.log('[getViewerId] No Authorization header');
    return null;
  }
  try {
    const payload = await verify(h.slice(7), env.JWT_SECRET, 'HS256');
    if (!payload || !payload.sub) {
      console.warn('[getViewerId] Token verified but no sub');
      return null;
    }
    return payload.sub;
  } catch (err) {
    console.warn('[getViewerId] Verify failed:', err.message);
    return null;
  }
}

function encodeCursor(createdAt, id) { return btoa(`${createdAt}|${id}`); }
function decodeCursor(cursor) {
  try {
    const [createdAt, id] = atob(cursor).split('|');
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch { return null; }
}

async function deletePostMediaFromR2(env, urls) {
  if (!env.MEDIA || !urls || urls.length === 0) return;
  const publicBase = env.R2_PUBLIC_BASE || '';
  for (const url of urls) {
    if (!url) continue;
    try {
      let key = url;
      if (publicBase && url.startsWith(publicBase + '/')) {
        key = url.slice(publicBase.length + 1);
      }
      if (key && !key.startsWith('http')) {
        await env.MEDIA.delete(key);
      }
    } catch (err) {
      console.warn('[feed] R2 delete failed for', url, err.message);
    }
  }
}

async function saveHashtags(env, postId, text) {
  const tags = extractHashtags(text);
  if (tags.length === 0) return [];
  try {
    await env.DB.prepare(`DELETE FROM post_hashtags WHERE post_id = ?`).bind(postId).run();
    const stmt = env.DB.prepare(`INSERT OR IGNORE INTO post_hashtags (post_id, hashtag) VALUES (?, ?)`);
    await env.DB.batch(tags.map((t) => stmt.bind(postId, t)));
  } catch (err) { console.warn('saveHashtags:', err.message); }
  return tags;
}

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
  const user = c.get('user');
  const projectId = c.req.param('id');
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

function scorePostForUser(post, { followedIds, userCity, userRegion, userCountry, verifiedBoost = true }) {
  const now = Date.now();
  const createdStr = (post.created_at || '').replace(' ', 'T') + 'Z';
  const created = new Date(createdStr).getTime();
  if (isNaN(created)) return 0;
  const ageHours = (now - created) / 3600000;
  let score = 100 * Math.pow(0.5, ageHours / 24);
  score += (post.likes || 0) * 2;
  score += (post.comment_count || 0) * 5;
  if (verifiedBoost && post.business?.is_verified) score *= 1.3;

  if (userCountry && post.business?.country_code) {
    if (post.business.country_code === userCountry) score *= 2.0;
    else score *= 0.5;
  }

  if (followedIds?.has(post.business?.id)) score *= 2.5;
  if (userCity && post.business?.city === userCity) score *= 1.8;
  else if (userRegion && post.business?.region === userRegion) score *= 1.3;
  score *= 0.9 + Math.random() * 0.2;
  return score;
}

function logoColumnFor(table) {
  if (table === 'organizations') return 'logo_url';
  if (table === 'accommodation') return 'image_url';
  if (table === 'restaurants') return 'image_url';
  return null;
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

  if (blockedIds.size > 0) {
    const placeholders = [...blockedIds].map(() => '?').join(',');
    conditions.push(`posts.user_id NOT IN (${placeholders})`);
    for (const id of blockedIds) params.push(id);
  }

  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
  if (cursor && sort === 'recent') {
    conditions.push(`(posts.created_at < ? OR (posts.created_at = ? AND posts.id < ?))`);
    params.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }

  const logoCol = logoColumnFor(table);
  const logoSelect = logoCol ? `, ${table}.${logoCol} AS business_logo` : ', NULL AS business_logo';

  const sql = `
    SELECT posts.id, posts.user_id, posts.text_content, posts.content_html,
           posts.text_content_en, posts.content_html_en,
           posts.image_url, posts.created_at,
           posts.geo_lat, posts.geo_lng, posts.geo_place, posts.view_count,
           ${table}.id AS business_id, ${table}.name AS business_name, ${table}.type AS business_type,
           ${table}.region, ${table}.district, ${table}.city, ${table}.is_verified,
           ${table}.country_code AS business_country
           ${logoSelect}
           ${extraFilterCols?.includes('cuisine_type') ? `, ${table}.cuisine_type` : ''}
    FROM posts JOIN ${table} ON ${table}.id = posts.business_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY posts.created_at DESC
    LIMIT ${sort === 'recent' ? limit + 1 : 60}
  `;

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  const mediaMap = await fetchMediaForPosts(c.env, results.map((r) => r.id));

  const postIds = results.map((r) => r.id);
  const { likesMap, likedSet } = await fetchLikesForPosts(c.env, postIds, viewerId);

  let followedIds = new Set(), userCity = null, userRegion = null, userCountry = null;
  if (viewerId && sort !== 'recent') {
    try {
      const { results: fol } = await c.env.DB.prepare(
        `SELECT target_id FROM follows WHERE follower_id = ? AND target_type = ?`,
      ).bind(viewerId, table).all();
      followedIds = new Set(fol.map((r) => r.target_id));
      const u = await c.env.DB.prepare('SELECT geo_city, country_code FROM users WHERE id = ?').bind(viewerId).first();
      userCity = u?.geo_city || null;
      userCountry = u?.country_code || null;
      if (userCity) {
        const cRow = await c.env.DB.prepare(`SELECT region FROM ${table} WHERE city = ? LIMIT 1`).bind(userCity).first();
        userRegion = cRow?.region || null;
      }
    } catch {}
  }

  let bookmarkedSet = new Set();
  if (viewerId && results.length > 0) {
    try {
      const ids = results.map((r) => r.id);
      const ph = ids.map(() => '?').join(',');
      const { results: bms } = await c.env.DB.prepare(
        `SELECT post_id FROM bookmarks WHERE user_id = ? AND post_id IN (${ph})`,
      ).bind(viewerId, ...ids).all();
      bookmarkedSet = new Set(bms.map((r) => r.post_id));
    } catch {}
  }

  let out = await Promise.all(results.map(async (post) => {
    const cc = await c.env.DB.prepare('SELECT COUNT(*) as n FROM comments WHERE post_id = ?').bind(post.id).first();
    return {
      id: post.id,
      text: post.text_content,
      html: post.content_html || escapePlain(post.text_content),
      text_en: post.text_content_en || null,
      html_en: post.content_html_en || null,
      image_url: post.image_url,
      media: mediaMap[post.id] || (post.image_url ? [post.image_url] : []),
      created_at: post.created_at,
      comment_count: cc?.n || 0,
      likes: likesMap[post.id] || 0,
      views: post.view_count || 0,
      __liked: likedSet.has(post.id),
      __bookmarked: bookmarkedSet.has(post.id),
      geo: post.geo_place ? { place: post.geo_place, lat: post.geo_lat, lng: post.geo_lng } : null,
      business: {
        id: post.business_id,
        name: post.business_name,
        type: post.business_type,
        region: post.region,
        district: post.district,
        city: post.city,
        country_code: post.business_country || null,
        is_verified: !!post.is_verified,
        logo_url: post.business_logo || null,
        cuisine_type: post.cuisine_type || null,
      },
    };
  }));

  if (sort === 'trending') {
    out = out.map((p) => ({ ...p, __score: scorePostForUser(p, {}) })).sort((a, b) => b.__score - a.__score);
    out = out.slice(0, limit);
  } else if (sort === 'for_you') {
    out = out.map((p) => ({ ...p, __score: scorePostForUser(p, { followedIds, userCity, userRegion, userCountry }) })).sort((a, b) => b.__score - a.__score);
    out = out.slice(0, limit);
  } else {
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

feedRoutes.get('/post-by-id/:id', async (c) => {
  const id = c.req.param('id');
  const post = await c.env.DB.prepare(
    `SELECT posts.*,
            COALESCE(o.id, a.id, r.id) AS business_id,
            COALESCE(o.name, a.name, r.name) AS business_name,
            COALESCE(o.type, a.type, r.type) AS business_type,
            COALESCE(o.region, a.region, r.region) AS region,
            COALESCE(o.district, a.district, r.district) AS district,
            COALESCE(o.city, a.city, r.city) AS city,
            COALESCE(o.country_code, a.country_code, r.country_code) AS business_country,
            COALESCE(o.is_verified, a.is_verified, r.is_verified) AS is_verified,
            COALESCE(o.logo_url, a.image_url, r.image_url) AS logo_url
     FROM posts
     LEFT JOIN organizations o ON o.id = posts.business_id AND posts.target_feed = 'organization'
     LEFT JOIN accommodation a ON a.id = posts.business_id AND posts.target_feed = 'accommodation'
     LEFT JOIN restaurants r ON r.id = posts.business_id AND posts.target_feed = 'gastro'
     WHERE posts.id = ? AND posts.status = 'published'`,
  ).bind(id).first();
  if (!post) return c.json({ error: 'Nenalezeno.' }, 404);

  const viewerId = await getViewerId(c, c.env);
  const mediaMap = await fetchMediaForPosts(c.env, [post.id]);
  const { likesMap, likedSet } = await fetchLikesForPosts(c.env, [post.id], viewerId);
  const cc = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM comments WHERE post_id = ?`).bind(post.id).first();

  let bookmarked = false;
  if (viewerId) {
    try { bookmarked = !!(await c.env.DB.prepare(`SELECT 1 FROM bookmarks WHERE user_id = ? AND post_id = ?`).bind(viewerId, post.id).first()); } catch {}
  }

  return c.json({
    post: {
      id: post.id,
      text: post.text_content,
      html: post.content_html || escapePlain(post.text_content),
      text_en: post.text_content_en || null,
      html_en: post.content_html_en || null,
      image_url: post.image_url,
      media: mediaMap[post.id] || (post.image_url ? [post.image_url] : []),
      created_at: post.created_at,
      comment_count: cc?.n || 0,
      likes: likesMap[post.id] || 0,
      views: post.view_count || 0,
      __liked: likedSet.has(post.id),
      __bookmarked: bookmarked,
      geo: post.geo_place ? { place: post.geo_place, lat: post.geo_lat, lng: post.geo_lng } : null,
      business: {
        id: post.business_id,
        name: post.business_name,
        type: post.business_type,
        region: post.region,
        district: post.district,
        city: post.city,
        country_code: post.business_country || null,
        is_verified: !!post.is_verified,
        logo_url: post.logo_url,
      },
      __feedKey: post.target_feed === 'organization' ? 'organization' : post.target_feed === 'accommodation' ? 'accommodation' : 'gastro',
    },
  });
});

feedRoutes.post('/:id/view', async (c) => {
  const postId = c.req.param('id');
  try {
    await c.env.DB.prepare(`UPDATE posts SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ? AND status = 'published'`).bind(postId).run();
  } catch {}
  return c.json({ ok: true });
});

feedRoutes.post('/:id/like', async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');
  const post = await c.env.DB.prepare(`SELECT id, user_id FROM posts WHERE id = ? AND status = 'published'`).bind(postId).first();
  if (!post) return c.json({ error: 'Nenalezeno.' }, 404);

  const existing = await c.env.DB.prepare(
    `SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?`,
  ).bind(user.sub, postId).first();

  let willBeLiked;
  try {
    if (existing) {
      await c.env.DB.prepare(`DELETE FROM post_likes WHERE user_id = ? AND post_id = ?`).bind(user.sub, postId).run();
      willBeLiked = false;
    } else {
      await c.env.DB.prepare(`INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)`).bind(user.sub, postId).run();
      willBeLiked = true;
    }
  } catch (err) {
    console.error('[like] DB error:', err.message);
    return c.json({ error: 'Nepodařilo se uložit lísteček.' }, 500);
  }

  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM post_likes WHERE post_id = ?`,
  ).bind(postId).first();
  const likes = Number(countRow?.n) || 0;   // === FIX ===: explicit Number() (D1 niekedy vracia string)

  if (willBeLiked && post.user_id && post.user_id !== user.sub) {
    try {
      const actor = await c.env.DB.prepare('SELECT display_name FROM users WHERE id = ?').bind(user.sub).first();
      const actorName = actor?.display_name || 'Někdo';

      await c.env.DB.prepare(
        `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, text)
         VALUES (?, ?, 'like', ?, 'post', ?, 'poslal(a) lísteček tvému příspěvku')`,
      ).bind(newId('notif'), post.user_id, user.sub, postId).run();

      await sendPushToUser(c.env, post.user_id, {
        title: 'Nový lísteček',
        body: `${actorName} poslal(a) lísteček tvému příspěvku`,
        url: `/?post=${postId}`,
        tag: `like-${postId}`,
      });
    } catch (err) { console.warn('[like] notif/push zlyhal:', err.message); }
  }

  return c.json({ liked: willBeLiked, likes });
});

feedRoutes.get('/bookmarks', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT posts.id, posts.text_content, posts.content_html, posts.text_content_en, posts.content_html_en,
            posts.image_url, posts.created_at, posts.target_feed,
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

feedRoutes.patch('/post/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const contentHtml = typeof body.html === 'string' ? sanitizeHtml(body.html) : null;
  const plainText = contentHtml != null ? htmlToPlain(contentHtml) : null;

  const contentHtmlEn = typeof body.html_en === 'string' && body.html_en ? sanitizeHtml(body.html_en) : null;
  const plainTextEn = contentHtmlEn ? htmlToPlain(contentHtmlEn) : null;

  if (contentHtml == null && contentHtmlEn == null) return c.json({ error: 'Chýba text.' }, 400);
  if (plainText && plainText.length > 3000) return c.json({ error: 'Text je příliš dlouhý.' }, 400);
  if (plainTextEn && plainTextEn.length > 3000) return c.json({ error: 'Anglický text je příliš dlouhý.' }, 400);

  const post = await c.env.DB.prepare(`SELECT id, user_id, status FROM posts WHERE id = ?`).bind(id).first();
  if (!post) return c.json({ error: 'Nenalezeno.' }, 404);
  if (post.user_id !== user.sub && user.role !== 'admin') return c.json({ error: 'Nemáš oprávnění.' }, 403);
  if (post.status === 'removed') return c.json({ error: 'Příspěvek byl smazán.' }, 400);

  if (plainText) {
    const mod = checkText(plainText);
    if (!mod.clean && mod.severity >= 2) {
      await flagContent(c.env, { userId: user.sub, postId: id, reason: mod.reason, severity: mod.severity });
      return c.json({ error: 'Zakázaný obsah.' }, 400);
    }
  }
  if (plainTextEn) {
    const modEn = checkText(plainTextEn);
    if (!modEn.clean && modEn.severity >= 2) {
      await flagContent(c.env, { userId: user.sub, postId: id, reason: modEn.reason, severity: modEn.severity });
      return c.json({ error: 'Anglický text obsahuje zakázaný obsah.' }, 400);
    }
  }

  await c.env.DB.prepare(
    `UPDATE posts SET text_content = COALESCE(?, text_content),
                       content_html = COALESCE(?, content_html),
                       text_content_en = ?,
                       content_html_en = ?
     WHERE id = ?`,
  ).bind(plainText, contentHtml, plainTextEn, contentHtmlEn, id).run();

  if (plainText) await saveHashtags(c.env, id, plainText);

  return c.json({ ok: true, id, text: plainText, html: contentHtml, text_en: plainTextEn, html_en: contentHtmlEn });
});

feedRoutes.delete('/post/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const post = await c.env.DB.prepare(
    'SELECT id, user_id, image_url FROM posts WHERE id = ?',
  ).bind(id).first();
  if (!post) return c.json({ error: 'Nenalezeno.' }, 404);
  if (post.user_id !== user.sub && user.role !== 'admin') return c.json({ error: 'Nemáš oprávnění.' }, 403);

  const { results: mediaRows } = await c.env.DB.prepare(
    `SELECT image_url FROM post_media WHERE post_id = ?`,
  ).bind(id).all();

  const allUrls = [
    post.image_url,
    ...(mediaRows || []).map((m) => m.image_url),
  ].filter(Boolean);

  await c.env.DB.prepare(`UPDATE posts SET status = 'removed' WHERE id = ?`).bind(id).run();
  await c.env.DB.prepare(`DELETE FROM post_media WHERE post_id = ?`).bind(id).run();
  await c.env.DB.prepare(`DELETE FROM post_hashtags WHERE post_id = ?`).bind(id).run();
  await c.env.DB.prepare(`DELETE FROM post_likes WHERE post_id = ?`).bind(id).run();

  await deletePostMediaFromR2(c.env, allUrls);

  return c.json({ ok: true, deleted_media: allUrls.length });
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

feedRoutes.get('/:id/comments', async (c) => {
  const postId = c.req.param('id');
  const viewerId = await getViewerId(c, c.env);
  const blockedIds = await getBlockedIds(c.env, viewerId);

  const { results } = await c.env.DB.prepare(
    `SELECT comments.id, comments.comment_text, comments.created_at, comments.parent_id,
            users.id AS user_id, users.display_name AS user_name, users.handle AS user_handle, users.avatar_url AS user_avatar
     FROM comments JOIN users ON users.id = comments.user_id
     WHERE post_id = ? ORDER BY comments.created_at ASC`,
  ).bind(postId).all();

  const filtered = results.filter((r) => !blockedIds.has(r.user_id));
  const byId = {};
  const roots = [];
  for (const r of filtered) byId[r.id] = { ...r, replies: [] };
  for (const r of filtered) {
    if (r.parent_id && byId[r.parent_id]) byId[r.parent_id].replies.push(byId[r.id]);
    else roots.push(byId[r.id]);
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

  let parentComment = null;
  if (parentId) {
    parentComment = await c.env.DB.prepare('SELECT id, user_id FROM comments WHERE id = ? AND post_id = ?').bind(parentId, postId).first();
    if (!parentComment) return c.json({ error: 'Nadřazený komentář nenalezen.' }, 400);
  }

  const id = newId('comment');
  await c.env.DB.prepare('INSERT INTO comments (id, post_id, user_id, comment_text, parent_id) VALUES (?, ?, ?, ?, ?)')
    .bind(id, postId, user.sub, text, parentId).run();

  const actor = await c.env.DB.prepare('SELECT display_name FROM users WHERE id = ?').bind(user.sub).first();
  const actorName = actor?.display_name || 'Někdo';
  const preview = text.length > 80 ? text.slice(0, 77) + '…' : text;

  if (post.user_id && post.user_id !== user.sub) {
    try {
      await c.env.DB.prepare(
        `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, text)
         VALUES (?, ?, 'comment', ?, 'post', ?, 'okomentoval(a) tvůj příspěvek')`,
      ).bind(newId('notif'), post.user_id, user.sub, postId).run();

      await sendPushToUser(c.env, post.user_id, {
        title: 'Nový komentář',
        body: `${actorName}: ${preview}`,
        url: `/?post=${postId}`,
        tag: `comment-${postId}`,
      });
    } catch (err) { console.warn('[comment] notif/push zlyhal:', err.message); }
  }

  if (parentComment && parentComment.user_id !== user.sub && parentComment.user_id !== post.user_id) {
    try {
      await c.env.DB.prepare(
        `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, text)
         VALUES (?, ?, 'reply', ?, 'post', ?, 'odpověděl(a) na tvůj komentář')`,
      ).bind(newId('notif'), parentComment.user_id, user.sub, postId).run();

      await sendPushToUser(c.env, parentComment.user_id, {
        title: 'Odpověď na komentář',
        body: `${actorName}: ${preview}`,
        url: `/?post=${postId}`,
        tag: `reply-${id}`,
      });
    } catch (err) { console.warn('[reply] notif/push zlyhal:', err.message); }
  }

  return c.json({ id, post_id: postId, parent_id: parentId, text, created_at: new Date().toISOString() }, 201);
});

feedRoutes.post('/:id/report', async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const post = await c.env.DB.prepare('SELECT id, user_id, report_count, hidden_by_reports FROM posts WHERE id = ?').bind(postId).first();
  if (!post) return c.json({ error: 'Nenalezeno.' }, 404);

  const id = newId('report');
  await c.env.DB.prepare('INSERT INTO reports (id, post_id, reporter_id, reason) VALUES (?, ?, ?, ?)')
    .bind(id, postId, user.sub, body.reason || null).run();

  const newCount = (post.report_count || 0) + 1;
  await c.env.DB.prepare('UPDATE posts SET report_count = ? WHERE id = ?').bind(newCount, postId).run();

  const HIDE_THRESHOLD = 5;
  if (newCount >= HIDE_THRESHOLD && !post.hidden_by_reports) {
    await c.env.DB.prepare(
      `UPDATE posts SET status = 'hidden_by_reports', hidden_by_reports = 1 WHERE id = ?`
    ).bind(postId).run();

    try {
      await c.env.DB.prepare(
        `INSERT INTO notifications (id, user_id, type, entity_type, entity_id, text)
         VALUES (?, ?, 'moderation_hidden', 'post', ?, ?)`,
      ).bind(newId('notif'), post.user_id, postId,
        'Tvůj příspěvek byl dočasně skryt kvůli vyššímu počtu nahlášení. Provozovatel jej posoudí.').run();

      await sendPushToUser(c.env, post.user_id, {
        title: 'Příspěvek dočasně skryt',
        body: 'Tvůj příspěvek byl dočasně skryt kvůli nahlášením.',
        url: '/',
      });
    } catch (err) { console.warn('auto-hide notif failed:', err); }
  }

  return c.json({ id, ok: true, report_count: newCount }, 201);
});

export { saveHashtags, deletePostMediaFromR2 };
