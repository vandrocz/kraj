import { Hono } from 'hono';
import { newId } from '../auth.js';
import { rateLimit } from '../ratelimit.js';
import { checkText } from '../moderation.js';
import { sendPushToUser } from '../push.js';

export const storiesRoutes = new Hono();

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

storiesRoutes.get('/feed', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare(`DELETE FROM stories WHERE expires_at < datetime('now')`).run();

  const my = await c.env.DB.prepare(
    `SELECT id, user_id, business_id, image_url, caption, created_at, expires_at FROM stories
     WHERE user_id = ? AND expires_at > datetime('now') ORDER BY created_at ASC`,
  ).bind(user.sub).all();

  const { results: followedStories } = await c.env.DB.prepare(
    `SELECT s.id, s.user_id, s.business_id, s.image_url, s.caption, s.created_at, s.expires_at,
            u.display_name AS author_name, u.avatar_url AS author_avatar
     FROM stories s JOIN users u ON u.id = s.user_id
     WHERE s.expires_at > datetime('now') AND s.user_id != ? AND s.user_id IN (
       SELECT target_id FROM follows WHERE follower_id = ? AND target_type = 'users'
     ) ORDER BY s.created_at ASC`,
  ).bind(user.sub, user.sub).all();

  const { results: bizStories } = await c.env.DB.prepare(
    `SELECT s.id, s.user_id, s.business_id, s.image_url, s.caption, s.created_at, s.expires_at,
            COALESCE(o.name, a.name, r.name) AS business_name
     FROM stories s
     LEFT JOIN organizations o ON o.id = s.business_id
     LEFT JOIN accommodation a ON a.id = s.business_id
     LEFT JOIN restaurants r ON r.id = s.business_id
     WHERE s.expires_at > datetime('now') AND s.business_id IS NOT NULL
       AND s.business_id IN (
         SELECT target_id FROM follows WHERE follower_id = ?
           AND target_type IN ('organizations','accommodation','restaurants')
       ) ORDER BY s.created_at ASC`,
  ).bind(user.sub).all();

  function groupBy(list) {
    const map = new Map();
    for (const s of list) {
      const key = s.business_id || s.user_id;
      if (!map.has(key)) map.set(key, { key, author_name: s.business_name || s.author_name || 'Profil', author_avatar: s.author_avatar || null, stories: [] });
      map.get(key).stories.push({ id: s.id, image_url: s.image_url, caption: s.caption, created_at: s.created_at });
    }
    return Array.from(map.values());
  }

  const groups = [];
  if (my.results.length > 0) {
    const me = await c.env.DB.prepare(`SELECT display_name, avatar_url FROM users WHERE id = ?`).bind(user.sub).first();
    groups.push({
      key: 'me', is_me: true,
      author_name: me?.display_name || 'Já', author_avatar: me?.avatar_url || null,
      stories: my.results.map((s) => ({ id: s.id, image_url: s.image_url, caption: s.caption, created_at: s.created_at })),
    });
  }
  groups.push(...groupBy(followedStories), ...groupBy(bizStories));

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
  if (!image_url) return c.json({ error: 'Chýba obrázek.' }, 400);

  const id = newId('story');
  const exp = new Date(Date.now() + STORY_TTL_MS).toISOString();
  await c.env.DB.prepare(
    `INSERT INTO stories (id, user_id, business_id, image_url, caption, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, user.sub, business_id, image_url, caption, exp).run();
  return c.json({ id, expires_at: exp }, 201);
});

storiesRoutes.post('/upload', async (c) => {
  const user = c.get('user');
  const form = await c.req.parseBody();
  const file = form.file;
  if (!file || typeof file === 'string') return c.json({ error: 'Chýba soubor.' }, 400);
  if (!c.env.MEDIA) return c.json({ error: 'Server nemá úložiště.' }, 500);

  const publicBase = c.env.R2_PUBLIC_BASE || '';
  const ext = ((file.name || 'x.jpg').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = `stories/${newId()}.${ext}`;
  await c.env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || 'image/jpeg' } });
  const url = publicBase ? `${publicBase}/${key}` : key;
  return c.json({ url }, 201);
});

storiesRoutes.post('/:id/view', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare(`INSERT OR IGNORE INTO story_views (story_id, viewer_id) VALUES (?, ?)`).bind(id, user.sub).run();
  return c.json({ ok: true });
});

// Odpoveď na story → DM autorovi + notifikácia
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

  // Nájdi alebo vytvor DM thread
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

  // Notifikácia + push
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
