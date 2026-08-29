import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
import { hashPassword, verifyPassword, newId } from './auth.js';
import { runDailyDistribution } from './cron.js';

const app = new Hono();

// ---- CORS ----
// Povolené je len klientske rozhranie na produkčnej doméne (nastav ALLOWED_ORIGIN
// v wrangler.toml / Cloudflare dashboard -> Settings -> Variables).
app.use('*', async (c, next) => {
  const allowed = c.env.ALLOWED_ORIGIN || 'https://kraj.vandro.cz';
  return cors({
    origin: [allowed, 'http://localhost:5173', 'http://localhost:8934'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })(c, next);
});

// ---- JWT middleware (vlastný, aby sme mohli pekne hlásiť 401) ----
async function requireAuth(c, next) {
  const authHeader = c.req.header('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return c.json({ error: 'Chýba prihlásenie (Authorization header).' }, 401);
  try {
    const payload = await verify(token, c.env.JWT_SECRET);
    c.set('user', payload);
    await next();
  } catch {
    return c.json({ error: 'Neplatný alebo expirovaný token.' }, 401);
  }
}

// Vyžaduje, aby prihlásený užívateľ bol schválená organizácia (alebo admin)
async function requireOrg(c, next) {
  const user = c.get('user');
  if (!user || (user.role !== 'organization' && user.role !== 'admin')) {
    return c.json({ error: 'Táto akcia je dostupná len schváleným organizáciám.' }, 403);
  }
  await next();
}

app.get('/', (c) => c.json({ ok: true, service: 'vandro-api' }));

// =====================================================================
// A) AUTENTIFIKÁCIA & PEŇAŽENKA
// =====================================================================

app.post('/api/auth/register', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password, displayName } = body;
  if (!email || !password) {
    return c.json({ error: 'Vyžaduje sa email a heslo.' }, 400);
  }
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return c.json({ error: 'Užívateľ s týmto emailom už existuje.' }, 409);

  const { hash, salt } = await hashPassword(password);
  const id = newId('user');
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, display_name, role, credit_balance)
     VALUES (?, ?, ?, ?, ?, 'user', 0)`,
  ).bind(id, email, hash, salt, displayName || email.split('@')[0]).run();

  return c.json({ id, email, credit_balance: 0 }, 201);
});

app.post('/api/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password } = body;
  if (!email || !password) return c.json({ error: 'Vyžaduje sa email a heslo.' }, 400);

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!user) return c.json({ error: 'Nesprávny email alebo heslo.' }, 401);

  const valid = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!valid) return c.json({ error: 'Nesprávny email alebo heslo.' }, 401);

  const token = await sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 dní
    },
    c.env.JWT_SECRET,
  );

  return c.json({
    token,
    user: { id: user.id, email: user.email, role: user.role, display_name: user.display_name },
  });
});

app.get('/api/user/wallet', requireAuth, async (c) => {
  const authUser = c.get('user');
  const row = await c.env.DB.prepare('SELECT credit_balance, status FROM users WHERE id = ?')
    .bind(authUser.sub)
    .first();
  if (!row) return c.json({ error: 'Užívateľ nenájdený.' }, 404);
  return c.json({ credit_balance: row.credit_balance, status: row.status });
});

// =====================================================================
// B) SYSTÉM LAJKOV (poradovník cez KV)
// =====================================================================

app.post('/api/projects/:id/like', requireAuth, async (c) => {
  const projectId = c.req.param('id');
  const authUser = c.get('user');
  const likeKey = `like:${projectId}:${authUser.sub}`;

  const already = await c.env.NASKRAJ_LAJKY.get(likeKey);
  if (already) {
    return c.json({ liked: true, message: 'Projekt už máš olajkovaný.' }, 200);
  }

  await c.env.NASKRAJ_LAJKY.put(likeKey, '1');

  const countKey = `likecount:${projectId}`;
  const current = await c.env.NASKRAJ_LAJKY.get(countKey);
  const newCount = (current ? parseInt(current, 10) : 0) + 1;
  await c.env.NASKRAJ_LAJKY.put(countKey, String(newCount));

  return c.json({ liked: true, likes: newCount }, 201);
});

app.get('/api/projects/:id/likes', async (c) => {
  const projectId = c.req.param('id');
  const count = await c.env.NASKRAJ_LAJKY.get(`likecount:${projectId}`);
  return c.json({ project_id: projectId, likes: count ? parseInt(count, 10) : 0 });
});

// =====================================================================
// C) SOCIÁLNY FEED & KOMENTÁRE
// =====================================================================

app.get('/api/feed', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT
       posts.id, posts.text_content, posts.image_url, posts.sponsored, posts.created_at,
       posts.project_id,
       users.id AS author_id, users.display_name AS author_name,
       projects.title AS project_title, projects.target_amount, projects.current_amount
     FROM posts
     JOIN users ON users.id = posts.author_id
     LEFT JOIN projects ON projects.id = posts.project_id
     ORDER BY posts.created_at DESC
     LIMIT 50`,
  ).all();

  // Ku každému príspevku dotiahneme počet komentárov a aktuálny počet lajkov z KV
  const feed = await Promise.all(
    results.map(async (post) => {
      const commentCountRow = await c.env.DB.prepare('SELECT COUNT(*) as n FROM comments WHERE post_id = ?')
        .bind(post.id)
        .first();
      let likes = 0;
      if (post.project_id) {
        const raw = await c.env.NASKRAJ_LAJKY.get(`likecount:${post.project_id}`);
        likes = raw ? parseInt(raw, 10) : 0;
      }
      return {
        id: post.id,
        text: post.text_content,
        image_url: post.image_url,
        sponsored: !!post.sponsored,
        created_at: post.created_at,
        author: { id: post.author_id, name: post.author_name },
        project: post.project_id
          ? {
              id: post.project_id,
              title: post.project_title,
              target_amount: post.target_amount,
              current_amount: post.current_amount,
              percent: post.target_amount ? Math.min(100, Math.round((post.current_amount / post.target_amount) * 100)) : 0,
            }
          : null,
        comment_count: commentCountRow?.n || 0,
        likes,
      };
    }),
  );

  return c.json({ feed });
});

app.get('/api/feed/:id/comments', async (c) => {
  const postId = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    `SELECT comments.id, comments.comment_text, comments.created_at, users.display_name AS user_name
     FROM comments JOIN users ON users.id = comments.user_id
     WHERE post_id = ? ORDER BY comments.created_at ASC`,
  ).bind(postId).all();
  return c.json({ comments: results });
});

app.post('/api/feed/:id/comment', requireAuth, async (c) => {
  const postId = c.req.param('id');
  const authUser = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const text = (body.text || '').trim();
  if (!text) return c.json({ error: 'Komentár nemôže byť prázdny.' }, 400);

  const post = await c.env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(postId).first();
  if (!post) return c.json({ error: 'Príspevok nenájdený.' }, 404);

  const id = newId('comment');
  await c.env.DB.prepare(
    'INSERT INTO comments (id, post_id, user_id, comment_text) VALUES (?, ?, ?, ?)',
  ).bind(id, postId, authUser.sub, text).run();

  return c.json({ id, post_id: postId, text, created_at: new Date().toISOString() }, 201);
});

// =====================================================================
// D) PORTÁL PRE ORGANIZÁCIE (Admin)
// =====================================================================

// Nahratie nového príspevku vrátane fotky (multipart/form-data: file, text, project_id?)
app.post('/api/admin/posts', requireAuth, requireOrg, async (c) => {
  const authUser = c.get('user');
  const form = await c.req.parseBody();
  const file = form.file;
  const text = form.text || '';
  const projectId = form.project_id || null;

  if (!file || typeof file === 'string') {
    return c.json({ error: 'Chýba súbor fotky (pole "file").' }, 400);
  }

  const ext = (file.name && file.name.split('.').pop()) || 'jpg';
  const key = `posts/${newId()}.${ext}`;

  await c.env.MEDIA.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || 'image/jpeg' },
  });

  const publicBase = c.env.R2_PUBLIC_BASE || 'https://media.vandro.cz';
  const imageUrl = `${publicBase}/${key}`;

  const id = newId('post');
  await c.env.DB.prepare(
    `INSERT INTO posts (id, project_id, author_id, text_content, image_url, sponsored)
     VALUES (?, ?, ?, ?, ?, 0)`,
  ).bind(id, projectId, authUser.sub, text, imageUrl).run();

  return c.json({ id, image_url: imageUrl, text, project_id: projectId }, 201);
});

// =====================================================================
// CRON: manuálne spustenie pre testovanie (chránené tajným kľúčom)
// =====================================================================
app.post('/api/admin/run-distribution-now', async (c) => {
  const key = c.req.header('X-Cron-Secret');
  if (!key || key !== c.env.CRON_SECRET) return c.json({ error: 'Neautorizované.' }, 401);
  const summary = await runDailyDistribution(c.env);
  return c.json(summary);
});

app.notFound((c) => c.json({ error: 'Neznáma routa.' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Interná chyba servera.' }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailyDistribution(env));
  },
};
