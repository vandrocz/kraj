import { Hono } from 'hono';
import { newId } from '../auth.js';
import { checkText } from '../moderation.js';
import { rateLimit } from '../ratelimit.js';

export const messagesRoutes = new Hono();

function threadPairKey(a, b) { return a < b ? [a, b] : [b, a]; }

// GET /api/messages/threads
messagesRoutes.get('/threads', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT dm_threads.*,
      CASE WHEN user_a = ? THEN user_b ELSE user_a END AS other_id
     FROM dm_threads
     WHERE user_a = ? OR user_b = ?
     ORDER BY last_message_at DESC NULLS LAST, created_at DESC LIMIT 100`,
  ).bind(user.sub, user.sub, user.sub).all();

  const withUsers = await Promise.all(results.map(async (t) => {
    const other = await c.env.DB.prepare(
      `SELECT id, display_name, avatar_url, role FROM users WHERE id = ? AND deleted_at IS NULL`,
    ).bind(t.other_id).first();
    const unread = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM dm_messages WHERE thread_id = ? AND sender_id != ? AND read_at IS NULL`,
    ).bind(t.id, user.sub).first();
    return { ...t, other, unread: unread?.n || 0 };
  }));

  return c.json({ threads: withUsers });
});

// POST /api/messages/start  { user_id }
messagesRoutes.post('/start', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const other = (body.user_id || '').toString();
  if (!other || other === user.sub) return c.json({ error: 'Neplatný uživatel.' }, 400);

  // Blok kontrola
  const blocked = await c.env.DB.prepare(`SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`)
    .bind(user.sub, other, other, user.sub).first();
  if (blocked) return c.json({ error: 'Nelze zahájit konverzaci.' }, 403);

  const [a, b] = threadPairKey(user.sub, other);
  const existing = await c.env.DB.prepare(`SELECT id FROM dm_threads WHERE user_a = ? AND user_b = ?`).bind(a, b).first();
  if (existing) return c.json({ thread_id: existing.id, existing: true });

  const id = newId('thr');
  await c.env.DB.prepare(`INSERT INTO dm_threads (id, user_a, user_b) VALUES (?, ?, ?)`).bind(id, a, b).run();
  return c.json({ thread_id: id }, 201);
});

// GET /api/messages/thread/:id
messagesRoutes.get('/thread/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const thread = await c.env.DB.prepare(`SELECT * FROM dm_threads WHERE id = ?`).bind(id).first();
  if (!thread) return c.json({ error: 'Nenalezeno.' }, 404);
  if (thread.user_a !== user.sub && thread.user_b !== user.sub) return c.json({ error: 'Nemáš oprávnění.' }, 403);

  const otherId = thread.user_a === user.sub ? thread.user_b : thread.user_a;
  const other = await c.env.DB.prepare(`SELECT id, display_name, avatar_url, role FROM users WHERE id = ?`).bind(otherId).first();

  const { results } = await c.env.DB.prepare(
    `SELECT id, sender_id, text, image_url, read_at, created_at FROM dm_messages
     WHERE thread_id = ? ORDER BY created_at ASC LIMIT 200`,
  ).bind(id).all();

  // Označ ako prečítané (moje prijaté)
  await c.env.DB.prepare(
    `UPDATE dm_messages SET read_at = datetime('now') WHERE thread_id = ? AND sender_id != ? AND read_at IS NULL`,
  ).bind(id, user.sub).run();

  return c.json({ thread, other, messages: results });
});

// POST /api/messages/thread/:id/send  { text }
messagesRoutes.post('/thread/:id/send', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const thread = await c.env.DB.prepare(`SELECT * FROM dm_threads WHERE id = ?`).bind(id).first();
  if (!thread) return c.json({ error: 'Nenalezeno.' }, 404);
  if (thread.user_a !== user.sub && thread.user_b !== user.sub) return c.json({ error: 'Nemáš oprávnění.' }, 403);

  const rl = await rateLimit(c.env, 'dm', user.sub, 200, 3600);
  if (!rl.ok) return c.json({ error: 'Příliš mnoho zpráv.' }, 429);

  const body = await c.req.json().catch(() => ({}));
  const text = (body.text || '').trim().slice(0, 2000);
  if (!text) return c.json({ error: 'Prázdná zpráva.' }, 400);

  const mod = checkText(text);
  if (!mod.clean && mod.severity >= 2) return c.json({ error: 'Text obsahuje zakázaný obsah.' }, 400);

  const otherId = thread.user_a === user.sub ? thread.user_b : thread.user_a;

  const msgId = newId('dm');
  await c.env.DB.prepare(
    `INSERT INTO dm_messages (id, thread_id, sender_id, text) VALUES (?, ?, ?, ?)`,
  ).bind(msgId, id, user.sub, text).run();

  await c.env.DB.prepare(
    `UPDATE dm_threads SET last_message_at = datetime('now'), last_message_preview = ? WHERE id = ?`,
  ).bind(text.slice(0, 100), id).run();

  try {
    await c.env.DB.prepare(
      `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, text)
       VALUES (?, ?, 'dm', ?, 'thread', ?, 'ti poslal(a) zprávu')`,
    ).bind(newId('notif'), otherId, user.sub, id).run();
  } catch {}

  return c.json({ id: msgId, text, created_at: new Date().toISOString() }, 201);
});