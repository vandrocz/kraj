import { Hono } from 'hono';
import { newId } from '../auth.js';
import { ensureActiveProjectRotation } from '../cron.js';

export const feedRoutes = new Hono();

const PROTECTION_MS = 30 * 60 * 1000;

function projectPhase(project) {
  if (project.status === 'waiting') return 'waiting';
  if (project.status === 'completed') return 'completed'; // "Splněno / Úspěch"
  // status === 'active'
  if (!project.activated_at) return 'preparing';
  const activatedMs = new Date(project.activated_at + 'Z').getTime();
  return Date.now() - activatedMs < PROTECTION_MS ? 'preparing' : 'running'; // "Příprava" vs bežná
}

async function attachLikes(env, projects) {
  return Promise.all(
    projects.map(async (p) => {
      const raw = await env.NASKRAJ_LAJKY.get(`likecount:${p.id}`);
      return { ...p, likes: raw ? parseInt(raw, 10) : 0 };
    }),
  );
}

// ---- ZBIERKOVÝ FEED ----
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
     WHERE projects.status = 'waiting'
     ORDER BY projects.created_at DESC`,
  ).all();

  const waitingWithLikes = await attachLikes(c.env, waitingRaw);
  waitingWithLikes.sort((a, b) => b.likes - a.likes);
  const waitingTop10 = waitingWithLikes.slice(0, 10);

  const activeOut = active
    ? { ...(await attachLikes(c.env, [active]))[0], phase: projectPhase(active) }
    : null;

  return c.json({
    active: activeOut,
    waiting: waitingTop10.map((p) => ({ ...p, phase: 'waiting' })),
  });
});

feedRoutes.post('/collections/:id/like', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('id');

  const project = await c.env.DB.prepare('SELECT id, status FROM projects WHERE id = ?').bind(projectId).first();
  if (!project) return c.json({ error: 'Projekt nenájdený.' }, 404);
  if (project.status !== 'waiting') {
    return c.json({ error: 'Lajkovať sa dá len projekt čakajúci v poradovníku.' }, 400);
  }

  const likeKey = `like:${projectId}:${user.sub}`;
  const already = await c.env.NASKRAJ_LAJKY.get(likeKey);
  if (already) return c.json({ liked: true, message: 'Už si lajkol.' });

  await c.env.NASKRAJ_LAJKY.put(likeKey, '1');
  const countKey = `likecount:${projectId}`;
  const current = await c.env.NASKRAJ_LAJKY.get(countKey);
  const newCount = (current ? parseInt(current, 10) : 0) + 1;
  await c.env.NASKRAJ_LAJKY.put(countKey, String(newCount));

  return c.json({ liked: true, likes: newCount }, 201);
});

// ---- GENERICKÝ NAČÍTAVAČ SOCIÁLNYCH FEEDOV (organization / accommodation / gastro) ----
async function loadSocialFeed(c, { targetFeed, table, extraFilterCols }) {
  const search = (c.req.query('search') || '').trim();
  const region = c.req.query('region') || '';
  const district = c.req.query('district') || '';
  const type = c.req.query('type') || '';
  const cuisine = c.req.query('cuisine') || '';

  const conditions = [`posts.target_feed = ?`, `posts.status = 'published'`];
  const params = [targetFeed];

  if (search) {
    conditions.push(`${table}.name LIKE ?`);
    params.push(`%${search}%`);
  }
  if (region) {
    conditions.push(`${table}.region = ?`);
    params.push(region);
  }
  if (district) {
    conditions.push(`${table}.district = ?`);
    params.push(district);
  }
  if (type) {
    conditions.push(`${table}.type = ?`);
    params.push(type);
  }
  if (cuisine && extraFilterCols?.includes('cuisine_type')) {
    conditions.push(`${table}.cuisine_type = ?`);
    params.push(cuisine);
  }

  const sql = `
    SELECT posts.id, posts.text_content, posts.image_url, posts.created_at,
           ${table}.id AS business_id, ${table}.name AS business_name, ${table}.type AS business_type,
           ${table}.region, ${table}.district, ${table}.is_verified
           ${extraFilterCols?.includes('cuisine_type') ? `, ${table}.cuisine_type` : ''}
    FROM posts
    JOIN ${table} ON ${table}.id = posts.business_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY posts.created_at DESC
    LIMIT 50
  `;

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();

  const withComments = await Promise.all(
    results.map(async (post) => {
      const commentCountRow = await c.env.DB.prepare('SELECT COUNT(*) as n FROM comments WHERE post_id = ?')
        .bind(post.id)
        .first();
      return {
        id: post.id,
        text: post.text_content,
        image_url: post.image_url,
        created_at: post.created_at,
        comment_count: commentCountRow?.n || 0,
        business: {
          id: post.business_id,
          name: post.business_name,
          type: post.business_type,
          region: post.region,
          district: post.district,
          is_verified: !!post.is_verified,
          cuisine_type: post.cuisine_type || null,
        },
      };
    }),
  );

  return c.json({ feed: withComments });
}

feedRoutes.get('/organization', (c) =>
  loadSocialFeed(c, { targetFeed: 'organization', table: 'organizations' }));

feedRoutes.get('/accommodation', (c) =>
  loadSocialFeed(c, { targetFeed: 'accommodation', table: 'accommodation' }));

feedRoutes.get('/gastro', (c) =>
  loadSocialFeed(c, { targetFeed: 'gastro', table: 'restaurants', extraFilterCols: ['cuisine_type'] }));

// ---- KOMENTÁRE (spoločné pre všetky feedy, viazané na posts.id) ----
feedRoutes.get('/:id/comments', async (c) => {
  const postId = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    `SELECT comments.id, comments.comment_text, comments.created_at, users.display_name AS user_name
     FROM comments JOIN users ON users.id = comments.user_id
     WHERE post_id = ? ORDER BY comments.created_at ASC`,
  ).bind(postId).all();
  return c.json({ comments: results });
});

feedRoutes.post('/:id/comment', async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const text = (body.text || '').trim();
  if (!text) return c.json({ error: 'Komentár nemôže byť prázdny.' }, 400);

  const post = await c.env.DB.prepare(`SELECT id FROM posts WHERE id = ? AND status = 'published'`).bind(postId).first();
  if (!post) return c.json({ error: 'Príspevok nenájdený.' }, 404);

  const id = newId('comment');
  await c.env.DB.prepare(
    'INSERT INTO comments (id, post_id, user_id, comment_text) VALUES (?, ?, ?, ?)',
  ).bind(id, postId, user.sub, text).run();

  return c.json({ id, post_id: postId, text, created_at: new Date().toISOString() }, 201);
});

feedRoutes.post('/:id/report', async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const post = await c.env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(postId).first();
  if (!post) return c.json({ error: 'Príspevok nenájdený.' }, 404);

  const id = newId('report');
  await c.env.DB.prepare(
    'INSERT INTO reports (id, post_id, reporter_id, reason) VALUES (?, ?, ?, ?)',
  ).bind(id, postId, user.sub, body.reason || null).run();

  return c.json({ id, ok: true }, 201);
});
