import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { verify } from 'hono/jwt';
import { authRoutes } from './routes/auth.js';
import { feedRoutes } from './routes/feed.js';
import { postsRoutes } from './routes/posts.js';
import { adminRoutes } from './routes/admin.js';
import { runDailyDistribution, ensureActiveProjectRotation } from './cron.js';
import { REGIONS, ORGANIZATION_TYPES, ACCOMMODATION_TYPES, RESTAURANT_TYPES, CUISINE_TYPES } from './regions.js';

const app = new Hono();

// ---- CORS: povolené len z klientskej domény appky ----
app.use('*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGIN || 'https://app.vandro.cz').split(',').map((s) => s.trim());
  return cors({
    origin: [...allowed, 'http://localhost:5173', 'http://localhost:8934'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Cron-Secret'],
    credentials: true,
  })(c, next);
});

// ---- JWT middleware ----
// Nastaví c.set('user', payload). Vďaka app.route() zdieľajú vnorené routy ten istý
// Context objekt ako hlavná appka, takže c.get('user') v modules/*.js funguje bez ďalších trikov.
async function requireAuth(c, next) {
  const authHeader = c.req.header('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return c.json({ error: 'Chýba prihlásenie (Authorization header).' }, 401);
  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    c.set('user', payload);
    await next();
  } catch {
    return c.json({ error: 'Neplatný alebo expirovaný token.' }, 401);
  }
}

app.get('/', (c) => c.json({ ok: true, service: 'naskraj-api' }));

// ---- Číselníky pre front-end filtre (kraje/okresy/typy) ----
app.get('/api/meta/regions', (c) => c.json({ regions: REGIONS }));
app.get('/api/meta/types', (c) =>
  c.json({
    organization: ORGANIZATION_TYPES,
    accommodation: ACCOMMODATION_TYPES,
    restaurant: RESTAURANT_TYPES,
    cuisine: CUISINE_TYPES,
  }));

// ---- Auth (register/login/logout sú verejné) ----
app.route('/api/auth', authRoutes);

// ---- Peňaženka užívateľa ----
app.get('/api/user/wallet', requireAuth, async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT credit_balance, status FROM users WHERE id = ?').bind(user.sub).first();
  if (!row) return c.json({ error: 'Užívateľ nenájdený.' }, 404);
  const { results: contributions } = await c.env.DB.prepare(
    `SELECT contributions.amount, contributions.created_at, projects.id AS project_id, projects.title
     FROM contributions JOIN projects ON projects.id = contributions.project_id
     WHERE contributions.user_id = ? ORDER BY contributions.created_at DESC LIMIT 50`,
  ).bind(user.sub).all();
  return c.json({ credit_balance: row.credit_balance, status: row.status, contributions });
});

app.post('/api/user/wallet/topup', requireAuth, async (c) => {
  // Fiktívne dobitie kreditu (bez reálnej platobnej brány) — pripočíta zvolenú sumu.
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const amount = parseInt(body.amount, 10);
  if (!amount || amount <= 0 || amount > 100000) return c.json({ error: 'Neplatná suma.' }, 400);
  await c.env.DB.prepare('UPDATE users SET credit_balance = credit_balance + ? WHERE id = ?').bind(amount, user.sub).run();
  const row = await c.env.DB.prepare('SELECT credit_balance FROM users WHERE id = ?').bind(user.sub).first();
  return c.json({ credit_balance: row.credit_balance });
});

// ---- Zbierkový feed ----
app.use('/api/feed/collections/:id/like', requireAuth);
// ---- Komentáre, nahlásenia a lajky príspevkov vyžadujú prihlásenie na zápis (GET je verejný) ----
app.use('/api/feed/:id/comment', requireAuth);
app.use('/api/feed/:id/report', requireAuth);
app.use('/api/feed/:id/like', requireAuth);
app.route('/api/feed', feedRoutes);

// ---- Príspevky organizácií/podnikov ----
app.use('/api/posts', requireAuth);
app.route('/api/posts', postsRoutes);

// ---- Manuálne spustenie cronu (chránené vlastným tajným kľúčom, nie JWT — pohodlné z CLI) ----
// Musí byť zaregistrované PRED app.use('/api/admin/*', requireAuth), inak by mu JWT middleware
// zbytočne vyžadoval Bearer token.
app.post('/api/admin/run-distribution-now', async (c) => {
  const key = c.req.header('X-Cron-Secret');
  if (!key || key !== c.env.CRON_SECRET) return c.json({ error: 'Neautorizované.' }, 401);
  const summary = await runDailyDistribution(c.env);
  return c.json(summary);
});

// ---- Admin (JWT + role 'admin' kontrolovaná vnútri modulu) ----
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
    if (event.cron === '0 8 * * *') {
      ctx.waitUntil(runDailyDistribution(env));
    } else {
      // Minútový tik: len rieši rotáciu poradovníka (ochranná/grace lehota), žiadne peniaze.
      ctx.waitUntil(ensureActiveProjectRotation(env));
    }
  },
};
