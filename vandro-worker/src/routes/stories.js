import { Hono } from 'hono';
import { newId } from '../auth.js';
import { rateLimit } from '../ratelimit.js';
import { checkText } from '../moderation.js';
import { sendPushToUser } from '../push.js';
import { validateUpload } from '../moderation.js';
import { deleteExpiredStories } from '../cron.js';

export const storiesRoutes = new Hono();

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

// Pomocná — normalizuj riadok zo stories tabuľky na API formát
function normalizeStory(s) {
  return {
    id: s.id,
    image_url: s.image_url,
    caption: s.caption,
    media_type: s.media_type || 'photo',
    media_urls: s.media_urls_json ? JSON.parse(s.media_urls_json) : null,
    created_at: s.created_at,
  };
}

// ============================================================
// GET /feed
// Vracia groups:
//   - { key: 'me', is_me: true }                 → osobné stories usera (business_id NULL)
//   - { key: 'mybiz_xxx', is_my_business: true } → business stories usera (business_id NOT NULL)
//   - { key: 'user_yyy' }                        → stories od sledovaných userov
//   - { key: 'biz_zzz' }                         → stories od sledovaných podnikov
// ============================================================
storiesRoutes.get('/feed', async (c) => {
  const user = c.get('user');

  // Priebežne čisti expirované stories (DB + R2)
  try { await deleteExpiredStories(c.env); } catch (err) {
    console.warn('[stories] cleanup on feed failed:', err.message);
  }

  // 1) Moje osobné stories (business_id NULL)
  const myPersonal = await c.env.DB.prepare(
    `SELECT id, user_id, business_id, image_url, caption, media_type, media_urls_json, created_at, expires_at
     FROM stories
     WHERE user_id = ? AND business_id IS NULL AND expires_at > datetime('now')
     ORDER BY created_at ASC`,
  ).bind(user.sub).all();

  // 2) Moje business stories (business_id NOT NULL) — groupované podľa business_id
  const { results: myBiz } = await c.env.DB.prepare(
    `SELECT s.id, s.user_id, s.business_id, s.image_url, s.caption, s.media_type, s.media_urls_json, s.created_at, s.expires_at,
            COALESCE(o.name, a.name, r.name) AS business_name,
            COALESCE(o.logo_url, a.image_url, r.image_url) AS business_logo
     FROM stories s
     LEFT JOIN organizations o ON o.id = s.business_id
     LEFT JOIN accommodation a ON a.id = s.business_id
     LEFT JOIN restaurants r ON r.id = s.business_id
     WHERE s.user_id = ? AND s.business_id IS NOT NULL AND s.expires_at > datetime('now')
     ORDER BY s.created_at ASC`,
  ).bind(user.sub).all();

  // 3) Stories od userov, ktorých sledujem (business_id NULL, iní)
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

  // 4) Stories od podnikov, ktoré sledujem (business_id NOT NULL)
  const { results: followedBiz } = await c.env.DB.prepare(
    `SELECT s.id, s.user_id, s.business_id, s.image_url, s.caption, s.media_type, s.media_urls_json, s.created_at, s.expires_at,
            COALESCE(o.name, a.name, r.name) AS business_name,
            COALESCE(o.logo_url, a.image_url, r.image_url) AS business_logo
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

  const groups = [];

  // Osobné "me" — len ak má osobné stories
  if (myPersonal.results.length > 0) {
    const me = await c.env.DB.prepare(
      `SELECT display_name, avatar_url FROM users WHERE id = ?`,
    ).bind(user.sub).first();
    groups.push({
      key: 'me',
      is_me: true,
      author_name: me?.display_name || 'Já',
      author_avatar: me?.avatar_url || null,
      stories: myPersonal.results.map(normalizeStory),
    });
  }

  // Moje business stories — groupované podľa business_id
  const myBizMap = new Map();
  for (const s of myBiz) {
    if (!myBizMap.has(s.business_id)) {
      myBizMap.set(s.business_id, {
        key: `mybiz_${s.business_id}`,
        is_my_business: true,
        business_id: s.business_id,
        author_name: s.business_name || 'Podnik',
        author_avatar: s.business_logo || null,
        stories: [],
      });
    }
    myBizMap.get(s.business_id).stories.push(normalizeStory(s));
  }
  groups.push(...myBizMap.values());

  // Sledovaní useri
  const userMap = new Map();
  for (const s of followedUser) {
    if (!userMap.has(s.user_id)) {
      userMap.set(s.user_id, {
        key: `user_${s.user_id}`,
        author_name: s.author_name || 'Profil',
        author_avatar: s.author_avatar || null,
        stories: [],
      });
    }
    userMap.get(s.user_id).stories.push(normalizeStory(s));
  }
  groups.push(...userMap.values());

  // Sledované podniky
  const fBizMap = new Map();
  for (const s of followedBiz) {
    if (!fBizMap.has(s.business_id)) {
      fBizMap.set(s.business_id, {
        key: `biz_${s.business_id}`,
        business_id: s.business_id,
        author_name: s.business_name || 'Podnik',
        author_avatar: s.business_logo || null,
        stories: [],
      });
    }
    fBizMap.get(s.business_id).stories.push(normalizeStory(s));
  }
  groups.push(...fBizMap.values());

  return c.json({ groups });
});

// ============================================================
// POST / — vytvorenie story
// ============================================================
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

// ============================================================
// Upload fotky
// ============================================================
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

// ============================================================
// Upload videa
// ============================================================
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

// ============================================================
// View
// ============================================================
storiesRoutes.post('/:id/view', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare(`INSERT OR IGNORE INTO story_views (story_id, viewer_id) VALUES (?, ?)`).bind(id, user.sub).run();
  return c.json({ ok: true });
});

// ============================================================
// Like
// ============================================================
storiesRoutes.post('/:id/like', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const story = await c.env.DB.prepare(`SELECT id, user_id FROM stories WHERE id = ?`).bind(id).first();
  if (!story) return c.json({ error: 'Story nenalezena.' }, 404);

  const likeKey = `like:story:${id}:${user.sub}`;
  const existing = await c.env.NASKRAJ_LAJKY.get(likeKey);
  const curRaw = await c.env.NASKRAJ_LAJKY.get(`likecount:story:${id}`);
  let cur = curRaw ? parseInt(curRaw, 10) : 0;

  if (existing) {
    await c.env.NASKRAJ_LAJKY.delete(likeKey);
    cur = Math.max(0, cur - 1);
    await c.env.NASKRAJ_LAJKY.put(`likecount:story:${id}`, String(cur));
    return c.json({ liked: false, likes: cur });
  }

  await c.env.NASKRAJ_LAJKY.put(likeKey, '1');
  cur = cur + 1;
  await c.env.NASKRAJ_LAJKY.put(`likecount:story:${id}`, String(cur));

  if (story.user_id && story.user_id !== user.sub) {
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

  return c.json({ liked: true, likes: cur }, 201);
});

// ============================================================
// Reply na story
// ============================================================
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

// ============================================================
// Replies
// ============================================================
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

// ============================================================
// Manuálny cleanup (admin)
// ============================================================
storiesRoutes.post('/admin/cleanup-expired', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'Len pre administrátorov.' }, 403);
  const result = await deleteExpiredStories(c.env);
  return c.json(result);
});
