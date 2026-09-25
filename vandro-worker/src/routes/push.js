import { Hono } from 'hono';
import { newId } from '../auth.js';
import { sendPushToUser } from '../push.js';

export const pushRoutes = new Hono();

// Vráti verejný VAPID key klientovi
pushRoutes.get('/vapid-public-key', (c) => {
  if (!c.env.VAPID_PUBLIC_KEY) return c.json({ error: 'Push nie je nakonfigurovaný.' }, 500);
  return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY });
});

// Registrácia subscription
pushRoutes.post('/subscribe', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const endpoint = (body.endpoint || '').toString();
  const p256dh = body.keys?.p256dh?.toString();
  const auth = body.keys?.auth?.toString();
  const ua = (c.req.header('user-agent') || '').slice(0, 200);

  if (!endpoint || !p256dh || !auth) return c.json({ error: 'Neplatná subscription.' }, 400);

  // upsert podľa endpoint
  const existing = await c.env.DB.prepare(
    `SELECT id FROM push_subscriptions WHERE endpoint = ?`,
  ).bind(endpoint).first();

  if (existing) {
    await c.env.DB.prepare(
      `UPDATE push_subscriptions SET user_id = ?, p256dh = ?, auth = ?, user_agent = ? WHERE id = ?`,
    ).bind(user.sub, p256dh, auth, ua, existing.id).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(newId('push'), user.sub, endpoint, p256dh, auth, ua).run();
  }

  return c.json({ ok: true }, 201);
});

pushRoutes.post('/unsubscribe', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const endpoint = (body.endpoint || '').toString();
  if (!endpoint) return c.json({ error: 'Chýba endpoint.' }, 400);
  await c.env.DB.prepare(`DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?`).bind(user.sub, endpoint).run();
  return c.json({ ok: true });
});

// Testovacia routa — pošle push sebe
pushRoutes.post('/test', async (c) => {
  const user = c.get('user');
  const r = await sendPushToUser(c.env, user.sub, {
    title: 'Náš kraj',
    body: 'Toto je testovacia notifikácia.',
    url: '/',
  });
  return c.json(r);
});
