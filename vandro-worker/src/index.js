import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { verify } from 'hono/jwt';
import { authRoutes } from './routes/auth.js';
import { authGoogleRoutes } from './routes/auth-google.js';
import { feedRoutes } from './routes/feed.js';
import { hashtagsRoutes } from './routes/hashtags.js';
import { postsRoutes } from './routes/posts.js';
import { adminRoutes } from './routes/admin.js';
import { profileRoutes } from './routes/profile.js';
import { storiesRoutes } from './routes/stories.js';
import { seoRoutes } from './routes/seo.js';
import { geoRoutes } from './routes/geo.js';
import { mentionsRoutes } from './routes/mentions.js';
import { eventsApiRoutes } from './routes/events.js';
import { checkinsRoutes } from './routes/checkins.js';
import { reviewsRoutes } from './routes/reviews.js';
import { wishlistRoutes } from './routes/wishlist.js';
import { nearbyRoutes } from './routes/nearby.js';
import { pushRoutes } from './routes/push.js';
import { runDailyDistribution, ensureActiveProjectRotation, cleanupOrphanedR2 } from './cron.js';
import { REGIONS, ORGANIZATION_TYPES, ACCOMMODATION_TYPES, RESTAURANT_TYPES, CUISINE_TYPES } from './regions.js';
import { rateLimit } from './ratelimit.js';

const app = new Hono();

// Bezpečnostné hlavičky pre API
app.use('*', async (c, next) => {
  await next();
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.res.headers.set('X-Frame-Options', 'DENY');
  c.res.headers.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
});

app.use('*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGIN || 'https://naskraj.vandro.cz').split(',').map((s) => s.trim());
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
    return c.json({ error: 'Neplatný token.' }, 401);
  }
}

app.get('/', (c) => c.json({ ok: true, service: 'naskraj-api' }));
app.get('/api/meta/regions', (c) => c.json({ regions: REGIONS }));
app.get('/api/meta/types', (c) => c.json({
  organization: ORGANIZATION_TYPES, accommodation: ACCOMMODATION_TYPES,
  restaurant: RESTAURANT_TYPES, cuisine: CUISINE_TYPES,
}));

app.route('/api/seo', seoRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/auth', authGoogleRoutes);

// ============================================================
// RATE LIMIT pre view (pred feedRoutes)
// ============================================================
app.use('/api/feed/:id/view', async (c, next) => {
  const ip = c.req.header('cf-connecting-ip') || 'unknown';
  const rl = await rateLimit(c.env, 'view', ip, 120, 60);
  if (!rl.ok) return c.json({ error: 'Příliš mnoho požadavků.' }, 429);
  await next();
});

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

// Feed
app.use('/api/feed/collections/:id/like', requireAuth);
app.use('/api/feed/:id/comment', requireAuth);
app.use('/api/feed/:id/report', requireAuth);
app.use('/api/feed/:id/like', requireAuth);
app.use('/api/feed/:id/bookmark', requireAuth);
app.use('/api/feed/:id/bookmarked', requireAuth);
app.use('/api/feed/bookmarks', requireAuth);
app.use('/api/feed/post/:id', requireAuth);
app.use('/api/feed/comment/:id', requireAuth);
app.route('/api/feed', feedRoutes);

// Posts
app.use('/api/posts', requireAuth);
app.route('/api/posts', postsRoutes);

// Events
app.use('/api/events', async (c, next) => {
  if (c.req.method === 'GET') return next();
  return requireAuth(c, next);
});
app.route('/api/events', eventsApiRoutes);

// Geo
app.post('/api/geo/save', requireAuth);
app.route('/api/geo', geoRoutes);

// Mentions
app.route('/api/mentions', mentionsRoutes);
app.route('/api/hashtags', hashtagsRoutes);

// Checkins
app.use('/api/checkins/me/*', requireAuth);
app.use('/api/checkins', async (c, next) => {
  if (c.req.method === 'GET') return next();
  return requireAuth(c, next);
});
app.route('/api/checkins', checkinsRoutes);

// Reviews
app.use('/api/reviews/me/*', requireAuth);
app.use('/api/reviews', async (c, next) => {
  if (c.req.method === 'GET') return next();
  return requireAuth(c, next);
});
app.route('/api/reviews', reviewsRoutes);

// Wishlist
app.use('/api/wishlist/*', requireAuth);
app.use('/api/wishlist', requireAuth);
app.route('/api/wishlist', wishlistRoutes);

// Nearby
app.route('/api/nearby', nearbyRoutes);

// Push
app.route('/api/push/vapid-public-key', pushRoutes);
app.use('/api/push/subscribe', requireAuth);
app.use('/api/push/unsubscribe', requireAuth);
app.use('/api/push/test', requireAuth);
app.route('/api/push', pushRoutes);

// Profile — search s rate limitom
app.use('/api/profile/me/*', requireAuth);
app.use('/api/profile/me', requireAuth);
app.use('/api/profile/follow', requireAuth);
app.use('/api/profile/follow/*', requireAuth);
app.use('/api/profile/block/*', requireAuth);
app.use('/api/profile/report/*', requireAuth);
app.use('/api/profile/search', requireAuth);
app.use('/api/profile/search', async (c, next) => {
  const user = c.get('user');
  const rl = await rateLimit(c.env, 'search', user?.sub || 'anon', 60, 60);
  if (!rl.ok) return c.json({ error: 'Příliš mnoho vyhledávání.' }, 429);
  await next();
});
app.route('/api/profile', profileRoutes);

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

app.post('/api/admin/r2-cleanup', async (c) => {
  const key = c.req.header('X-Cron-Secret');
  if (!key || key !== c.env.CRON_SECRET) return c.json({ error: 'Neautorizované.' }, 401);
  return c.json(await cleanupOrphanedR2(c.env));
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
    else if (event.cron === '0 4 * * *') ctx.waitUntil(cleanupOrphanedR2(env));
    else ctx.waitUntil(ensureActiveProjectRotation(env));
  },
};

import { runDailyDistribution, ensureActiveProjectRotation, cleanupOrphanedR2, deleteExpiredStories } from './cron.js';

// ... v export default:

async scheduled(event, env, ctx) {
  if (event.cron === '0 8 * * *') ctx.waitUntil(runDailyDistribution(env));
  else if (event.cron === '0 4 * * *') {
    // Nočný cleanup — najprv stories, potom siroty
    ctx.waitUntil((async () => {
      await deleteExpiredStories(env);
      await cleanupOrphanedR2(env);
    })());
  }
  else if (event.cron === '30 */6 * * *') ctx.waitUntil(deleteExpiredStories(env));
  else ctx.waitUntil(ensureActiveProjectRotation(env));
}
