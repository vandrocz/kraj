import { Hono } from 'hono';
import { newId } from '../auth.js';
import { sendMentionEmail } from '../email.js';
import { htmlToPlain } from '../moderation.js';
import { sendPushToUser } from '../push.js';

export const mentionsRoutes = new Hono();

function extractMentions(text) {
  const re = /@([a-zA-Z0-9._-]{2,40})/g;
  const out = [];
  let m;
  while ((m = re.exec(text))) out.push(m[1].toLowerCase());
  return [...new Set(out)];
}

export async function processMentions(env, { postId, actorId, actorName, contentHtml }) {
  const plain = htmlToPlain(contentHtml);
  const usernames = extractMentions(plain);
  if (usernames.length === 0) return [];

  const found = [];
  for (const u of usernames) {
    // Primárne hľadaj podľa handle, fallback na display_name
    let row = await env.DB.prepare(
      `SELECT id, email, display_name, handle FROM users WHERE LOWER(handle) = ? AND deleted_at IS NULL LIMIT 1`,
    ).bind(u).first();

    if (!row) {
      row = await env.DB.prepare(
        `SELECT id, email, display_name, handle FROM users WHERE LOWER(display_name) = ? AND deleted_at IS NULL LIMIT 1`,
      ).bind(u).first();
    }
    if (row && row.id !== actorId) found.push(row);
  }

  for (const user of found) {
    try {
      await env.DB.prepare(`INSERT INTO mentions (id, post_id, user_id) VALUES (?, ?, ?)`)
        .bind(newId('men'), postId, user.id).run();
      await env.DB.prepare(
        `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, text)
         VALUES (?, ?, 'mention', ?, 'post', ?, 'tě zmínil(a) v příspěvku')`,
      ).bind(newId('notif'), user.id, actorId, postId).run();
      try {
        await sendMentionEmail(env, {
          to: user.email, actorName,
          postPreview: plain.slice(0, 200),
          displayName: user.display_name,
        });
      } catch {}
      try {
        await sendPushToUser(env, user.id, {
          title: 'Zmínka v příspěvku',
          body: `${actorName} tě zmínil(a).`,
          url: '/',
        });
      } catch {}
    } catch (err) { console.error('mention:', err); }
  }

  return found.map((u) => u.id);
}

mentionsRoutes.get('/search', async (c) => {
  const q = (c.req.query('q') || '').replace(/^@/, '').trim();
  if (!q || q.length < 1) return c.json({ users: [] });
  const lower = q.toLowerCase();
  const { results } = await c.env.DB.prepare(
    `SELECT id, display_name, handle, avatar_url, role FROM users
     WHERE deleted_at IS NULL AND (LOWER(handle) LIKE ? OR LOWER(display_name) LIKE ?)
     ORDER BY CASE WHEN LOWER(handle) LIKE ? THEN 0 ELSE 1 END, display_name ASC
     LIMIT 8`,
  ).bind(`%${lower}%`, `%${lower}%`, `${lower}%`).all();
  return c.json({ users: results });
});
