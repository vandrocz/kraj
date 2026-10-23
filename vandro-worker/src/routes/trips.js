import { Hono } from 'hono';
import { newId } from '../auth.js';
import { checkText, flagContent, validateUpload } from '../moderation.js';
import { rateLimit } from '../ratelimit.js';
import { sendPushToUser } from '../push.js';
import { cleanText } from '../sanitize.js';
import { purgeTrip } from '../erase.js';

// ------------------------------------------------------------
// CESTOVATELSKÝ FEED (výlety) — příspěvky uživatele zobrazené jen na jeho profilu.
// Nejsou součástí žádného jiného feedu. Max. 3 fotky, datum, krátký popis, poloha.
// ------------------------------------------------------------
export const tripsPublicRoutes = new Hono(); // čtení (volitelné přihlášení)
export const tripsRoutes = new Hono();       // zápis (vyžaduje přihlášení)

const MAX_PHOTOS = 3;
const MAX_CAPTION = 300;
const PAGE = 20;

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const d = new Date(s + 'T00:00:00Z');
  if (isNaN(d.getTime())) return false;
  const now = Date.now();
  return d.getTime() <= now + 36 * 3600 * 1000 && d.getTime() >= now - 20 * 365 * 24 * 3600 * 1000;
}

async function optionalUserId(c) {
  const h = c.req.header('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  try {
    const { verify } = await import('hono/jwt');
    const p = await verify(h.slice(7), c.env.JWT_SECRET, 'HS256');
    return p.sub || null;
  } catch { return null; }
}

// Výpis výletů uživatele (pro návštěvníky profilu)
tripsPublicRoutes.get('/user/:id', async (c) => {
  const ownerId = c.req.param('id');
  const viewerId = await optionalUserId(c);

  const owner = await c.env.DB.prepare(
    `SELECT id, settings_json FROM users WHERE id = ? AND deleted_at IS NULL AND status != 'suspended'`,
  ).bind(ownerId).first();
  if (!owner) return c.json({ trips: [], next_cursor: null });

  const isSelf = viewerId === ownerId;
  if (!isSelf) {
    let pub = true;
    try { if (owner.settings_json) pub = JSON.parse(owner.settings_json).public_profile !== false; } catch {}
    if (!pub) return c.json({ trips: [], next_cursor: null, hidden: true });
    if (viewerId) {
      const blocked = await c.env.DB.prepare(
        `SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`,
      ).bind(viewerId, ownerId, ownerId, viewerId).first();
      if (blocked) return c.json({ trips: [], next_cursor: null });
    }
  }

  // stránkování podle (trip_date, created_at, id)
  const cursor = c.req.query('cursor') || '';
  let where = `user_id = ? AND status = 'published'`;
  const binds = [ownerId];
  if (cursor) {
    const [d, ca, id] = cursor.split('|');
    if (d && ca && id) { where += ` AND (trip_date < ? OR (trip_date = ? AND (created_at < ? OR (created_at = ? AND id < ?))))`; binds.push(d, d, ca, ca, id); }
  }
  const { results } = await c.env.DB.prepare(
    `SELECT id, caption, trip_date, place_name, lat, lng, created_at FROM trip_posts
     WHERE ${where} ORDER BY trip_date DESC, created_at DESC, id DESC LIMIT ${PAGE + 1}`,
  ).bind(...binds).all();

  const rows = results.slice(0, PAGE);
  const next = results.length > PAGE ? `${rows[rows.length - 1].trip_date}|${rows[rows.length - 1].created_at}|${rows[rows.length - 1].id}` : null;

  const trips = [];
  for (const r of rows) {
    const m = await c.env.DB.prepare(`SELECT image_url FROM trip_post_media WHERE trip_id = ? ORDER BY sort_order ASC`).bind(r.id).all();
    trips.push({ ...r, media: (m.results || []).map((x) => x.image_url) });
  }
  c.header('Cache-Control', 'no-store');
  return c.json({ trips, next_cursor: next });
});

// Přidání výletu
tripsRoutes.post('/', async (c) => {
  const user = c.get('user');
  const rl = await rateLimit(c.env, 'trip', user.sub, 10, 3600);
  if (!rl.ok) return c.json({ error: 'Příliš mnoho výletů za krátkou dobu. Zkus to později.' }, 429);

  const me = await c.env.DB.prepare(`SELECT email_verified, display_name FROM users WHERE id = ?`).bind(user.sub).first();
  if (!me?.email_verified) return c.json({ error: 'Pro přidání výletu musíš nejprve ověřit e-mail.' }, 403);
  if (!c.env.MEDIA) return c.json({ error: 'Server nemá úložiště.' }, 500);

  const form = await c.req.parseBody({ all: true });
  const raw = form.file;
  const files = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((f) => f && typeof f !== 'string' && f.size > 0);
  if (files.length === 0) return c.json({ error: 'Přidej alespoň jednu fotku.' }, 400);
  if (files.length > MAX_PHOTOS) return c.json({ error: `Maximálně ${MAX_PHOTOS} fotky.` }, 400);

  const exts = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  for (const f of files) {
    const v = await validateUpload(f, 'image');
    if (!v.ok) {
      const msgs = { bad_type: 'Povolené jsou jen JPG, PNG, WebP nebo GIF.', too_large: 'Fotka je příliš velká (max 10 MB).', bad_magic: 'Soubor není platná fotka.', empty: 'Soubor je prázdný.' };
      return c.json({ error: msgs[v.reason] || 'Neplatný soubor.' }, 400);
    }
  }

  const caption = cleanText(form.caption, MAX_CAPTION);
  const tripDate = (form.trip_date || '').toString();
  if (!validDate(tripDate)) return c.json({ error: 'Neplatné datum výletu.' }, 400);
  const placeName = cleanText(form.place_name, 120);
  let lat = form.lat !== undefined && form.lat !== '' ? parseFloat(form.lat) : null;
  let lng = form.lng !== undefined && form.lng !== '' ? parseFloat(form.lng) : null;
  if (lat != null && lng != null && (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)) { lat = null; lng = null; }
  if (lat == null || lng == null) { lat = null; lng = null; }

  for (const txt of [caption, placeName]) {
    if (!txt) continue;
    const mod = checkText(txt);
    if (!mod.clean) {
      await flagContent(c.env, { userId: user.sub, reason: mod.reason, severity: mod.severity });
      if (mod.severity >= 2) return c.json({ error: 'Text obsahuje zakázaný obsah.' }, 400);
    }
  }

  const base = c.env.R2_PUBLIC_BASE || 'https://media.vandro.cz';
  const urls = [];
  for (const f of files) {
    const key = `trips/${newId()}.${exts[f.type] || 'jpg'}`;
    await c.env.MEDIA.put(key, await f.arrayBuffer(), { httpMetadata: { contentType: f.type } });
    urls.push(`${base}/${key}`);
  }

  const id = newId('trip');
  await c.env.DB.prepare(
    `INSERT INTO trip_posts (id, user_id, caption, trip_date, place_name, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, user.sub, caption, tripDate, placeName, lat, lng).run();
  const stmt = c.env.DB.prepare(`INSERT INTO trip_post_media (id, trip_id, image_url, sort_order) VALUES (?, ?, ?, ?)`);
  await c.env.DB.batch(urls.map((u, i) => stmt.bind(newId('tm'), id, u, i)));

  // Upozornění sledujícím (zápis do notifikací + push prvním 50)
  const notify = async () => {
    try {
      const { results: followers } = await c.env.DB.prepare(
        `SELECT follows.follower_id AS uid FROM follows JOIN users ON users.id = follows.follower_id
         WHERE follows.target_type IN ('user', 'users') AND follows.target_id = ? AND users.deleted_at IS NULL LIMIT 500`,
      ).bind(user.sub).all();
      const ins = c.env.DB.prepare(
        `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, text) VALUES (?, ?, 'trip_post', ?, 'trip', ?, 'přidal(a) nový výlet')`,
      );
      const stmts = [];
      for (const f of followers || []) {
        const blocked = await c.env.DB.prepare(`SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`).bind(f.uid, user.sub, user.sub, f.uid).first();
        if (!blocked) stmts.push(ins.bind(newId('notif'), f.uid, user.sub, id));
      }
      for (let i = 0; i < stmts.length; i += 50) await c.env.DB.batch(stmts.slice(i, i + 50));
      for (const f of (followers || []).slice(0, 50)) {
        await sendPushToUser(c.env, f.uid, { title: me.display_name || 'Vandro', body: 'přidal(a) nový výlet', url: `/?profile=${user.sub}`, tag: `trip-${id}` }).catch(() => {});
      }
    } catch (err) { console.warn('[trips] notify failed:', err.message); }
  };
  let ctx = null;
  try { ctx = c.executionCtx; } catch { /* mimo Workers (testy) */ }
  if (ctx && ctx.waitUntil) ctx.waitUntil(notify()); else await notify();

  return c.json({ id, trip_date: tripDate, caption, place_name: placeName, lat, lng, media: urls }, 201);
});

// Smazání (vlastník nebo admin)
tripsRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT id, user_id FROM trip_posts WHERE id = ?`).bind(id).first();
  if (!row) return c.json({ error: 'Nenalezeno.' }, 404);
  if (row.user_id !== user.sub && user.role !== 'admin') return c.json({ error: 'Nemáš oprávnění.' }, 403);
  await purgeTrip(c.env, id);
  return c.json({ ok: true });
});
