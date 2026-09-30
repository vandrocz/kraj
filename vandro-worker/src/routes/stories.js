import { Hono } from 'hono';
import { newId } from '../auth.js';
import { rateLimit } from '../ratelimit.js';
import { checkText } from '../moderation.js';
import { sendPushToUser } from '../push.js';
import { validateUpload } from '../moderation.js';
import { deleteExpiredStories } from '../cron.js';

export const storiesRoutes = new Hono();

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeStory(s, likesMap) {
  let mediaUrls = null;
  if (s.media_urls_json) {
    try {
      const parsed = JSON.parse(s.media_urls_json);
      if (Array.isArray(parsed)) mediaUrls = parsed;
    } catch (err) {
      console.warn('[stories] invalid media_urls_json for', s.id, err.message);
    }
  }
  return {
    id: s.id,
    image_url: s.image_url,
    caption: s.caption,
    media_type: s.media_type || 'photo',
    media_urls: mediaUrls,
    created_at: s.created_at,
    likes: (likesMap && likesMap[s.id]) || 0,
  };
}

// Batch fetch story likes
async function fetchStoryLikes(env, storyIds) {
  const map = {};
  if (!storyIds || storyIds.length === 0) return map;
  const ph = storyIds.map(() => '?').join(',');
  try {
    const { results } = await env.DB.prepare(
      `SELECT story_id, COUNT(*) AS n FROM story_likes WHERE story_id IN (${ph}) GROUP BY story_id`,
    ).bind(...storyIds).all();
    for (const r of results) map[r.story_id] = r.n;
  } catch (err) {
    console.warn('[stories] likes fetch failed:', err.message);
  }
  return map;
}

storiesRoutes.get('/feed', async (c) => {
  const user = c.get('user');

  try { await deleteExpiredStories(c.env); } catch (err) {
    console.warn('[stories] cleanup on feed failed:', err.message);
  }

  const meRow = await c.env.DB.prepare(
    `SELECT display_name, avatar_url, geo_city FROM users WHERE id = ?`,
  ).bind(user.sub).first();
  const myCity = meRow?.geo_city || null;

  const myPersonal = await c.env.DB.prepare(
    `SELECT id, user_id, business_id, image_url, caption, media_type, media_urls_json, created_at, expires_at
     FROM stories
     WHERE user_id = ? AND business_id IS NULL AND expires_at > datetime('now')
     ORDER BY created_at ASC`,
  ).bind(user.sub).all();

  const { results: myBiz } = await c.env.DB.prepare(
    `SELECT s.id, s.user_id, s.business_id, s.image_url, s.caption, s.media_type, s.media_urls_json, s.created_at, s.expires_at,
            COALESCE(o.name, a.name, r.name) AS business_name,
            COALESCE(o.logo_url, a.image_url, r.image_url) AS business_logo,
            CASE
              WHEN o.id IS NOT NULL THEN 'organizations'
              WHEN a.id IS NOT NULL THEN 'accommodation'
              WHEN r.id IS NOT NULL THEN 'restaurants'
              ELSE NULL
            END AS business_kind
     FROM stories s
     LEFT JOIN organizations o ON o.id = s.business_id
     LEFT JOIN accommodation a ON a.id = s.business_id
     LEFT JOIN restaurants r ON r.id = s.business_id
     WHERE s.user_id = ? AND s.business_id IS NOT NULL AND s.expires_at > datetime('now')
     ORDER BY s.created_at ASC`,
  ).bind(user.sub).all();

  const { results: followedUser } = await c.env.DB.prepare(
    `SELECT s.id, s.user_id, s.business_id, s.image_url, s.caption, s.media_type, s.media_urls_json, s.created_at, s.expires_at,
            u.display_name AS author_name, u.avatar_url AS author_avatar
     FROM stories s JOIN users u ON u.id = s.user_id
     WHERE s.expires_at > datetime('now') AND s.business_id IS NULL
       AND s.user_id != ?
       AND s.user_id IN (
         SELECT target_id FROM follows WHERE follower_id = ? AND target_type = 'users'
       )
     ORDER BY s.created_at ASC`,
  ).bind(user.sub, user.sub).all();

  const { results: followedBiz } = await c.env.DB.prepare(
    `SELECT s.id, s.user_id, s.business_id, s.image_url, s.caption, s.media_type, s.media_urls_json, s.created_at, s.expires_at,
            COALESCE(o.name, a.name, r.name) AS business_name,
            COALESCE(o.logo_url, a.image_url, r.image_url) AS business_logo,
            CASE
              WHEN o.id IS NOT NULL THEN 'organizations'
              WHEN a.id IS NOT NULL THEN 'accommodation'
              WHEN r.id IS NOT NULL THEN 'restaurants'
              ELSE NULL
            END AS business_kind
     FROM stories s
     LEFT JOIN organizations o ON o.id = s.business_id
     LEFT JOIN accommodation a ON a.id = s.business_id
     LEFT JOIN restaurants r ON r.id = s.business_id
     WHERE s.expires_at > datetime('now') AND s.business_id IS NOT NULL
       AND s.business_id IN (
         SELECT target_id FROM follows
         WHERE follower_id = ? AND target_type IN ('organizations','accommodation','restaurants')
       )
     ORDER BY s.created_at ASC`,
  ).bind(user.sub).all();

  const { results: suggestedUser } = await c.env.DB.prepare(
    `SELECT s.id, s.user_id, s.business_id, s.image_url, s.caption, s.media_type, s.media_urls_json, s.created_at, s.expires_at,
            u.display_name AS author_name, u.avatar_url AS author_avatar
     FROM stories s JOIN users u ON u.id = s.user_id
     WHERE s.expires_at > datetime('now') AND s.business_id IS NULL
       AND s.user_id != ?
       AND s.user_id NOT IN (
         SELECT target_id FROM follows WHERE follower_id = ? AND target_type = 'users'
       )
       ${myCity ? 'AND u.geo_city = ?' : ''}
     ORDER BY s.created_at DESC
     LIMIT 10`,
  ).bind(...(myCity ? [user.sub, user.sub, myCity] : [user.sub, user.sub])).all();

  const { results: suggestedBiz } = await c.env.DB.prepare(
    `SELECT s.id, s.user_id, s.business_id, s.image_url, s.caption, s.media_type, s.media_urls_json, s.created_at, s.expires_at,
            COALESCE(o.name, a.name, r.name) AS business_name,
            COALESCE(o.logo_url, a.image_url, r.image_url) AS business_logo,
            COALESCE(o.city, a.city, r.city) AS business_city,
            CASE
              WHEN o.id IS NOT NULL THEN 'organizations'
              WHEN a.id IS NOT NULL THEN 'accommodation'
              WHEN r.id IS NOT NULL THEN 'restaurants'
              ELSE NULL
            END AS business_kind
     FROM stories s
     LEFT JOIN organizations o ON o.id = s.business_id
     LEFT JOIN accommodation a ON a.id = s.business_id
     LEFT JOIN restaurants r ON r.id = s.business_id
     WHERE s.expires_at > datetime('now') AND s.business_id IS NOT NULL
       AND s.business_id NOT IN (
         SELECT target_id FROM follows
         WHERE follower_id = ? AND target_type IN ('organizations','accommodation','restaurants')
       )
       ${myCity ? 'AND COALESCE(o.city, a.city, r.city) = ?' : ''}
     ORDER BY s.created_at DESC
     LIMIT 10`,
  ).bind(...(myCity ? [user.sub, myCity] : [user.sub])).all();

  // Batch fetch likes pro všechny stories
  const allStoryIds = [
    ...myPersonal.results.map((s) => s.id),
    ...myBiz.map((s) => s.id),
    ...followedUser.map((s) => s.id),
    ...followedBiz.map((s) => s.id),
    ...suggestedUser.map((s) => s.id),
    ...suggestedBiz.map((s) => s.id),
  ];
  const likesMap = await fetchStoryLikes(c.env, allStoryIds);

  const groups = [];

  if (myPersonal.results.length > 0) {
    groups.push({
      key: 'me',
      is_me: true,
      author_id: user.sub,
      author_kind: 'user',
      author_name: meRow?.display_name || 'Já',
      author_avatar: meRow?.avatar_url || null,
      stories: myPersonal.results.map((s) => normalizeStory(s, likesMap)),
    });
  }

  const myBizMap = new Map();
  for (const s of myBiz) {
    if (!myBizMap.has(s.business_id)) {
      myBizMap.set(s.business_id, {
        key: `mybiz_${s.business_id}`,
        is_my_business: true,
        business_id: s.business_id,
        business_kind: s.business_kind,
        author_id: s.business_id,
        author_kind: s.business_kind,
        author_name: s.business_name || 'Podnik',
        author_avatar: s.business_logo || null,
        stories: [],
      });
    }
    myBizMap.get(s.business_id).stories.push(normalizeStory(s, likesMap));
  }
  groups.push(...myBizMap.values());

  const userMap = new Map();
  for (const s of followedUser) {
    if (!userMap.has(s.user_id)) {
      userMap.set(s.user_id, {
        key: `user_${s.user_id}`,
        author_id: s.user_id,
        author_kind: 'user',
        author_name: s.author_name || 'Profil',
        author_avatar: s.author_avatar || null,
        stories: [],
      });
    }
    userMap.get(s.user_id).stories.push(normalizeStory(s, likesMap));
  }
  groups.push(...userMap.values());

  const fBizMap = new Map();
  for (const s of followedBiz) {
    if (!fBizMap.has(s.business_id)) {
      fBizMap.set(s.business_id, {
        key: `biz_${s.business_id}`,
        business_id: s.business_id,
        business_kind: s.business_kind,
        author_id: s.business_id,
        author_kind: s.business_kind,
        author_name: s.business_name || 'Podnik',
        author_avatar: s.business_logo || null,
        stories: [],
      });
    }
    fBizMap.get(s.business_id).stories.push(normalizeStory(s, likesMap));
  }
  groups.push(...fBizMap.values());

  const sugUserMap = new Map();
  for (const s of suggestedUser) {
    if (!sugUserMap.has(s.user_id)) {
      sugUserMap.set(s.user_id, {
        key: `user_${s.user_id}`,
        author_id: s.user_id,
        author_kind: 'user',
        author_name: s.author_name || 'Profil',
        author_avatar: s.author_avatar || null,
        suggested: true,
        stories: [],
      });
    }
    sugUserMap.get(s.user_id).stories.push(normalizeStory(s, likesMap));
  }
  groups.push(...sugUserMap.values());

  const sugBizMap = new Map();
  for (const s of suggestedBiz) {
    if (!sugBizMap.has(s.business_id)) {
      sugBizMap.set(s.business_id, {
        key: `biz_${s.business_id}`,
        business_id: s.business_id,
        business_kind: s.business_kind,
        author_id: s.business_id,
        author_kind: s.business_kind,
        author_name: s.business_name || 'Podnik',
        author_avatar: s.business_logo || null,
        suggested: true,
        stories: [],
      });
    }
    sugBizMap.get(s.business_id).stories.push(normalizeStory(s, likesMap));
  }
  groups.push(...sugBizMap.values());

  return c.json({ groups });
});

storiesRoutes.post('/', async (c) => {
  const user = c.get('user');
  const rl = await rateLimit(c.env, 'story', user.sub, 10, 86400);
  if (!rl.ok) return c.json({ error: 'Denní limit stories vyčerpán.' }, 429);

  const body = await c.req.json().catch(() => ({}));
  const image_url = (body.image_url || '').toString();
  const caption = (body.caption || '').toString().slice(0, 200);
  const business_id = body.business_id ? body.business_id.toString() : null;
  const media_type = (body.media_type || 'photo').toString();
  const media_urls = Array.isArray(body.media_urls) ? body.media_urls : null;
  if (!image_url) return c.json({ error: 'Chýba obrázek.' }, 400);

  const id = newId('story');
  const exp = new Date(Date.now() + STORY_TTL_MS).toISOString();
  await c.env.DB.prepare(
    `INSERT INTO stories (id, user_id, business_id, image_url, caption, media_type, media_urls_json, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, user.sub, business_id, image_url, caption, media_type, media_urls ? JSON.stringify(media_urls) : null, exp).run();

  return c.json({ id, expires_at: exp }, 201);
});

storiesRoutes.post('/upload', async (c) => {
  const user = c.get('user');
  const form = await c.req.parseBody();
  const file = form.file;
  if (!file || typeof file === 'string') return c.json({ error: 'Chýba soubor.' }, 400);
  if (!c.env.MEDIA) return c.json({ error: 'Server nemá úložiště.' }, 500);

  const v = await validateUpload(file, 'image');
  if (!v.ok) {
    const msgs = {
      bad_type: 'Povolené sú len JPG, PNG, WebP alebo GIF.',
      too_large: 'Fotka je príliš veľká (max 10 MB).',
      bad_magic: 'Súbor nie je platná fotka.',
      empty: 'Súbor je prázdny.',
      no_file: 'Chýba súbor.',
    };
    return c.json({ error: msgs[v.reason] || 'Neplatný súbor.' }, 400);
  }

  const publicBase = c.env.R2_PUBLIC_BASE || '';
  const ext = ((file.name || 'x.jpg').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = `stories/${newId()}.${ext}`;
  await c.env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || 'image/jpeg' } });
  const url = publicBase ? `${publicBase}/${key}` : key;
  return c.json({ url }, 201);
});

storiesRoutes.post('/upload-video', async (c) => {
  const user = c.get('user');
  const form = await c.req.parseBody();
  const file = form.file;
  if (!file || typeof file === 'string') return c.json({ error: 'Chýba súbor.' }, 400);
  if (!c.env.MEDIA) return c.json({ error: 'Server nemá úložiště.' }, 500);

  const v = await validateUpload(file, 'video');
  if (!v.ok) {
    const msgs = {
      bad_type: 'Povolené formáty: MP4, WebM, MOV.',
      too_large: 'Video je príliš veľké (max 30 MB).',
      bad_magic: 'Súbor nie je platné video.',
      empty: 'Súbor je prázdny.',
      no_file: 'Chýba súbor.',
    };
    return c.json({ error: msgs[v.reason] || 'Neplatný súbor.' }, 400);
  }

  const publicBase = c.env.R2_PUBLIC_BASE || '';
  const ext = ((file.name || 'video.mp4').split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = `stories/${newId()}.${ext}`;
  await c.env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  const url = publicBase ? `${publicBase}/${key}` : key;
  return c.json({ url, media_type: 'video' }, 201);
});

storiesRoutes.post('/:id/view', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare(`INSERT OR IGNORE INTO story_views (story_id, viewer_id) VALUES (?, ?)`).bind(id, user.sub).run();
  return c.json({ ok: true });
});

// ============================================================
// STORY LIKE — D1 atomicky
// ============================================================
storiesRoutes.post('/:id/like', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const story = await c.env.DB.prepare(`SELECT id, user_id FROM stories WHERE id = ?`).bind(id).first();
  if (!story) return c.json({ error: 'Story nenalezena.' }, 404);

  const existing = await c.env.DB.prepare(
    `SELECT 1 FROM story_likes WHERE user_id = ? AND story_id = ?`,
  ).bind(user.sub, id).first();

  let willBeLiked;
  try {
    if (existing) {
      await c.env.DB.prepare(`DELETE FROM story_likes WHERE user_id = ? AND story_id = ?`).bind(user.sub, id).run();
      willBeLiked = false;
    } else {
      await c.env.DB.prepare(`INSERT INTO story_likes (user_id, story_id) VALUES (?, ?)`).bind(user.sub, id).run();
      willBeLiked = true;
    }
  } catch (err) {
    console.error('[story-like] DB error:', err.message);
    return c.json({ error: 'Nepodařilo se uložit lajk.' }, 500);
  }

  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM story_likes WHERE story_id = ?`,
  ).bind(id).first();
  const likes = countRow?.n || 0;

  if (willBeLiked && story.user_id && story.user_id !== user.sub) {
    try {
      const actor = await c.env.DB.prepare('SELECT display_name FROM users WHERE id = ?').bind(user.sub).first();
      await c.env.DB.prepare(
        `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, text)
         VALUES (?, ?, 'story_like', ?, 'story', ?, 'dal(a) iskru tvé story')`,
      ).bind(newId('notif'), story.user_id, user.sub, id).run();
      await sendPushToUser(c.env, story.user_id, {
        title: 'Nová iskra',
        body: `${actor?.display_name || 'Někdo'} dal(a) iskru tvé story`,
        url: '/',
      });
    } catch {}
  }

  return c.json({ liked: willBeLiked, likes });
});

storiesRoutes.post('/:id/reply', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const text = (body.text || '').toString().trim().slice(0, 500);
  if (!text) return c.json({ error: 'Prázdná odpověď.' }, 400);

  const rl = await rateLimit(c.env, 'story_reply', user.sub, 50, 3600);
  if (!rl.ok) return c.json({ error: 'Příliš mnoho odpovědí.' }, 429);

  const mod = checkText(text);
  if (!mod.clean && mod.severity >= 2) return c.json({ error: 'Zakázaný obsah.' }, 400);

  const story = await c.env.DB.prepare(`SELECT id, user_id FROM stories WHERE id = ?`).bind(id).first();
  if (!story) return c.json({ error: 'Story nenalezena.' }, 404);
  if (story.user_id === user.sub) return c.json({ error: 'Nemůžeš odpovídat sobě.' }, 400);

  const replyId = newId('sreply');
  await c.env.DB.prepare(
    `INSERT INTO story_replies (id, story_id, user_id, text) VALUES (?, ?, ?, ?)`,
  ).bind(replyId, id, user.sub, text).run();

  await c.env.DB.prepare(`UPDATE stories SET reply_count = reply_count + 1 WHERE id = ?`).bind(id).run();

  const [a, b] = user.sub < story.user_id ? [user.sub, story.user_id] : [story.user_id, user.sub];
  let thread = await c.env.DB.prepare(`SELECT id FROM dm_threads WHERE user_a = ? AND user_b = ?`).bind(a, b).first();
  if (!thread) {
    const tid = newId('thr');
    await c.env.DB.prepare(`INSERT INTO dm_threads (id, user_a, user_b) VALUES (?, ?, ?)`).bind(tid, a, b).run();
    thread = { id: tid };
  }
  const dmText = `📷 Odpověď na story: ${text}`;
  await c.env.DB.prepare(
    `INSERT INTO dm_messages (id, thread_id, sender_id, text) VALUES (?, ?, ?, ?)`,
  ).bind(newId('dm'), thread.id, user.sub, dmText).run();
  await c.env.DB.prepare(
    `UPDATE dm_threads SET last_message_at = datetime('now'), last_message_preview = ? WHERE id = ?`,
  ).bind(dmText.slice(0, 100), thread.id).run();

  try {
    await c.env.DB.prepare(
      `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, text)
       VALUES (?, ?, 'story_reply', ?, 'story', ?, 'odpověděl(a) na tvoji story')`,
    ).bind(newId('notif'), story.user_id, user.sub, id).run();
  } catch {}

  try {
    await sendPushToUser(c.env, story.user_id, {
      title: 'Nová odpověď na story',
      body: text.slice(0, 100),
      url: '/?tab=account',
    });
  } catch {}

  return c.json({ id: replyId, ok: true }, 201);
});

storiesRoutes.get('/:id/replies', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const story = await c.env.DB.prepare(`SELECT user_id FROM stories WHERE id = ?`).bind(id).first();
  if (!story) return c.json({ error: 'Nenalezena.' }, 404);
  if (story.user_id !== user.sub) return c.json({ error: 'Nemáš oprávnění.' }, 403);

  const { results } = await c.env.DB.prepare(
    `SELECT story_replies.id, story_replies.text, story_replies.created_at,
            users.id AS user_id, users.display_name, users.avatar_url
     FROM story_replies JOIN users ON users.id = story_replies.user_id
     WHERE story_replies.story_id = ?
     ORDER BY story_replies.created_at DESC LIMIT 100`,
  ).bind(id).all();
  return c.json({ replies: results });
});

storiesRoutes.post('/admin/cleanup-expired', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'Len pre administrátorov.' }, 403);
  const result = await deleteExpiredStories(c.env);
  return c.json(result);
});
