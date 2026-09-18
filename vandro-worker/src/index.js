import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { verify } from 'hono/jwt';
import { authRoutes } from './routes/auth.js';
import { feedRoutes } from './routes/feed.js';
import { postsRoutes } from './routes/posts.js';
import { adminRoutes } from './routes/admin.js';
import { profileRoutes } from './routes/profile.js';
import { messagesRoutes } from './routes/messages.js';
import { groupsRoutes } from './routes/groups.js';
import { storiesRoutes } from './routes/stories.js';
import { runDailyDistribution, ensureActiveProjectRotation } from './cron.js';
import { REGIONS, ORGANIZATION_TYPES, ACCOMMODATION_TYPES, RESTAURANT_TYPES, CUISINE_TYPES } from './regions.js';

const app = new Hono();

app.use('*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGIN || 'https://app.vandro.cz').split(',').map((s) => s.trim());
  return cors({
    origin: [...allowed, 'http://localhost:5173', 'http://localhost:8934'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Cron-Secret'],
    credentials: true,
  })(c, next);
});

async function requireAuth(c, next) {
  const h = c.req.header('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return c.json({ error: 'Chýba prihlásenie.' }, 401);
  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    c.set('user', payload);
    await next();
  } catch {
    return c.json({ error: 'Neplatný nebo expirovaný token.' }, 401);
  }
}

app.get('/', (c) => c.json({ ok: true, service: 'naskraj-api' }));
app.get('/api/meta/regions', (c) => c.json({ regions: REGIONS }));
app.get('/api/meta/types', (c) => c.json({
  organization: ORGANIZATION_TYPES, accommodation: ACCOMMODATION_TYPES,
  restaurant: RESTAURANT_TYPES, cuisine: CUISINE_TYPES,
}));

app.route('/api/auth', authRoutes);

// Wallet
app.get('/api/user/wallet', requireAuth, async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT credit_balance, status FROM users WHERE id = ?').bind(user.sub).first();
  if (!row) return c.json({ error: 'Nenájdený.' }, 404);
  const { results: contributions } = await c.env.DB.prepare(
    `SELECT contributions.amount, contributions.created_at, projects.id AS project_id, projects.title
     FROM contributions JOIN projects ON projects.id = contributions.project_id
     WHERE contributions.user_id = ? ORDER BY contributions.created_at DESC LIMIT 50`,
  ).bind(user.sub).all();
  return c.json({ credit_balance: row.credit_balance, status: row.status, contributions });
});

app.post('/api/user/wallet/topup', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const amount = parseInt(body.amount, 10);
  if (!amount || amount <= 0 || amount > 100000) return c.json({ error: 'Neplatná suma.' }, 400);
  await c.env.DB.prepare('UPDATE users SET credit_balance = credit_balance + ? WHERE id = ?').bind(amount, user.sub).run();
  const row = await c.env.DB.prepare('SELECT credit_balance FROM users WHERE id = ?').bind(user.sub).first();
  return c.json({ credit_balance: row.credit_balance });
});

// Feed — write endpoints chránené
app.use('/api/feed/collections/:id/like', requireAuth);
app.use('/api/feed/:id/comment', requireAuth);
app.use('/api/feed/:id/report', requireAuth);
app.use('/api/feed/:id/like', requireAuth);
app.use('/api/feed/post/:id', requireAuth);
app.use('/api/feed/comment/:id', requireAuth);
app.route('/api/feed', feedRoutes);

// Posts
app.use('/api/posts', requireAuth);
app.route('/api/posts', postsRoutes);

// Profile — chránené podcesty
app.use('/api/profile/me/*', requireAuth);
app.use('/api/profile/me', requireAuth);
app.use('/api/profile/follow', requireAuth);
app.use('/api/profile/follow/*', requireAuth);
app.use('/api/profile/block/*', requireAuth);
app.use('/api/profile/search', requireAuth);
app.route('/api/profile', profileRoutes);

// Messages
app.use('/api/messages/*', requireAuth);
app.use('/api/messages', requireAuth);
app.route('/api/messages', messagesRoutes);

// Groups
app.use('/api/groups/my', requireAuth);
app.use('/api/groups/discover', requireAuth);
app.use('/api/groups', requireAuth);
app.route('/api/groups', groupsRoutes);

// Stories
app.use('/api/stories/feed', requireAuth);
app.use('/api/stories/upload', requireAuth);
app.use('/api/stories', requireAuth);
app.route('/api/stories', storiesRoutes);

// Admin cron
app.post('/api/admin/run-distribution-now', async (c) => {
  const key = c.req.header('X-Cron-Secret');
  if (!key || key !== c.env.CRON_SECRET) return c.json({ error: 'Neautorizované.' }, 401);
  return c.json(await runDailyDistribution(c.env));
});

app.use('/api/admin/*', requireAuth);
app.route('/api/admin', adminRoutes);

app.notFound((c) => c.json({ error: 'Neznáma routa.' }, 404));
app.onError((err, c) => {
  console.error('UNHANDLED ERROR:', err.message, err.stack);
  return c.json({ error: 'Interná chyba servera.', detail: err.message }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    if (event.cron === '0 8 * * *') ctx.waitUntil(runDailyDistribution(env));
    else ctx.waitUntil(ensureActiveProjectRotation(env));
  },
};
