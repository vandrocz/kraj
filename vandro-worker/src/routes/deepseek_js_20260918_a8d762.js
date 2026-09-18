import { Hono } from 'hono';
import { newId } from '../auth.js';
import { checkText } from '../moderation.js';
import { rateLimit } from '../ratelimit.js';

export const groupsRoutes = new Hono();

// GET /api/groups/my
groupsRoutes.get('/my', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT groups.*, group_members.role AS my_role FROM group_members
     JOIN groups ON groups.id = group_members.group_id
     WHERE group_members.user_id = ? ORDER BY groups.created_at DESC`,
  ).bind(user.sub).all();
  return c.json({ groups: results });
});

// GET /api/groups/discover
groupsRoutes.get('/discover', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT groups.*, (SELECT COUNT(*) FROM group_members WHERE group_id = groups.id) AS members_count
     FROM groups WHERE is_private = 0 ORDER BY members_count DESC LIMIT 30`,
  ).all();
  return c.json({ groups: results });
});

// POST /api/groups  { name, description, is_private }
groupsRoutes.post('/', async (c) => {
  const user = c.get('user');
  const rl = await rateLimit(c.env, 'group-create', user.sub, 5, 86400);
  if (!rl.ok) return c.json({ error: 'Příliš mnoho skupin.' }, 429);

  const body = await c.req.json().catch(() => ({}));
  const name = (body.name || '').trim().slice(0, 100);
  const description = (body.description || '').trim().slice(0, 500);
  const isPrivate = body.is_private ? 1 : 0;
  if (!name) return c.json({ error: 'Chýba název.' }, 400);

  const mod = checkText(name); if (!mod.clean && mod.severity >= 2) return c.json({ error: 'Nevhodný název.' }, 400);

  const id = newId('grp');
  await c.env.DB.prepare(
    `INSERT INTO groups (id, owner_id, name, description, is_private) VALUES (?, ?, ?, ?, ?)`,
  ).bind(id, user.sub, name, description, isPrivate).run();
  await c.env.DB.prepare(
    `INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')`,
  ).bind(id, user.sub).run();
  return c.json({ id }, 201);
});

// GET /api/groups/:id
groupsRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const group = await c.env.DB.prepare(`SELECT * FROM groups WHERE id = ?`).bind(id).first();
  if (!group) return c.json({ error: 'Nenalezeno.' }, 404);

  const member = await c.env.DB.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).bind(id, user.sub).first();
  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?`).bind(id).first();

  const { results: posts } = await c.env.DB.prepare(
    `SELECT group_posts.*, users.display_name AS user_name, users.avatar_url AS user_avatar
     FROM group_posts JOIN users ON users.id = group_posts.user_id
     WHERE group_id = ? AND status = 'published' ORDER BY created_at DESC LIMIT 50`,
  ).bind(id).all();

  return c.json({ group, my_role: member?.role || null, members_count: count?.n || 0, posts });
});

// POST /api/groups/:id/join
groupsRoutes.post('/:id/join', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const group = await c.env.DB.prepare(`SELECT * FROM groups WHERE id = ?`).bind(id).first();
  if (!group) return c.json({ error: 'Nenalezeno.' }, 404);
  if (group.is_private) return c.json({ error: 'Soukromá skupina — požádej o pozvánku.' }, 403);
  await c.env.DB.prepare(`INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')`).bind(id, user.sub).run();
  return c.json({ ok: true });
});

groupsRoutes.post('/:id/leave', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const g = await c.env.DB.prepare(`SELECT owner_id FROM groups WHERE id = ?`).bind(id).first();
  if (g?.owner_id === user.sub) return c.json({ error: 'Vlastník nemůže opustit skupinu.' }, 400);
  await c.env.DB.prepare(`DELETE FROM group_members WHERE group_id = ? AND user_id = ?`).bind(id, user.sub).run();
  return c.json({ ok: true });
});

// POST /api/groups/:id/posts  { text }
groupsRoutes.post('/:id/posts', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const member = await c.env.DB.prepare(`SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?`).bind(id, user.sub).first();
  if (!member) return c.json({ error: 'Nejsi členem skupiny.' }, 403);

  const body = await c.req.json().catch(() => ({}));
  const text = (body.text || '').trim().slice(0, 3000);
  if (!text) return c.json({ error: 'Prázdný příspěvek.' }, 400);
  const mod = checkText(text); if (!mod.clean && mod.severity >= 2) return c.json({ error: 'Nevhodný obsah.' }, 400);

  const pid = newId('gp');
  await c.env.DB.prepare(`INSERT INTO group_posts (id, group_id, user_id, text) VALUES (?, ?, ?, ?)`)
    .bind(pid, id, user.sub, text).run();
  return c.json({ id: pid, text, created_at: new Date().toISOString() }, 201);
});