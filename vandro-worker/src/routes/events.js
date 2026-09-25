import { Hono } from 'hono';
import { newId } from '../auth.js';
import { checkText, flagContent, sanitizeHtml, htmlToPlain } from '../moderation.js';
import { rateLimit } from '../ratelimit.js';

export const eventsApiRoutes = new Hono();

const BUSINESS_TABLE = {
  organizations: 'organizations',
  accommodation: 'accommodation',
  restaurants: 'restaurants',
};

const MAX_EVENT_PHOTOS = 4;

function parseGallery(ev) {
  if (!ev) return [];
  if (ev.gallery_json) {
    try { const a = JSON.parse(ev.gallery_json); if (Array.isArray(a)) return a; } catch {}
  }
  // Fallback: vráť cover ako prvú fotku
  return ev.cover_image_url ? [ev.cover_image_url] : [];
}

eventsApiRoutes.get('/', async (c) => {
  const region = c.req.query('region') || '';
  const city = c.req.query('city') || '';
  const kind = c.req.query('kind') || '';
  const businessId = c.req.query('business_id') || '';
  const when = c.req.query('when') || 'upcoming';
  const search = (c.req.query('search') || '').trim();

  const conds = [`events.status = 'published'`];
  const params = [];

  if (region) { conds.push('events.region = ?'); params.push(region); }
  if (city) { conds.push('events.city = ?'); params.push(city); }
  if (kind) { conds.push('events.business_kind = ?'); params.push(kind); }
  if (businessId) { conds.push('events.business_id = ?'); params.push(businessId); }
  if (search) { conds.push('events.title LIKE ?'); params.push(`%${search}%`); }

  if (when === 'upcoming') conds.push(`(COALESCE(events.end_at, events.start_at) >= datetime('now'))`);
  else if (when === 'past') conds.push(`(COALESCE(events.end_at, events.start_at) < datetime('now'))`);

  const order = when === 'past' ? 'DESC' : 'ASC';

  const sql = `
    SELECT events.*,
      COALESCE(o.name, a.name, r.name) AS business_name,
      COALESCE(o.logo_url, a.image_url, r.image_url) AS business_logo,
      COALESCE(o.is_verified, a.is_verified, r.is_verified) AS business_verified
    FROM events
    LEFT JOIN organizations o ON o.id = events.business_id AND events.business_kind = 'organizations'
    LEFT JOIN accommodation a ON a.id = events.business_id AND events.business_kind = 'accommodation'
    LEFT JOIN restaurants r ON r.id = events.business_id AND events.business_kind = 'restaurants'
    WHERE ${conds.join(' AND ')}
    ORDER BY events.start_at ${order}
    LIMIT 100
  `;
  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ events: results });
});

eventsApiRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT events.*,
      COALESCE(o.name, a.name, r.name) AS business_name,
      COALESCE(o.logo_url, a.image_url, r.image_url) AS business_logo
     FROM events
     LEFT JOIN organizations o ON o.id = events.business_id AND events.business_kind = 'organizations'
     LEFT JOIN accommodation a ON a.id = events.business_id AND events.business_kind = 'accommodation'
     LEFT JOIN restaurants r ON r.id = events.business_id AND events.business_kind = 'restaurants'
     WHERE events.id = ? AND events.status = 'published'`,
  ).bind(id).first();
  if (!row) return c.json({ error: 'Akce nenalezena.' }, 404);
  const gallery = parseGallery(row);
  return c.json({ event: { ...row, gallery } });
});

eventsApiRoutes.post('/', async (c) => {
  const user = c.get('user');
  if (!['organization', 'hotelier', 'admin'].includes(user.role)) {
    return c.json({ error: 'Akce mohou přidávat jen organizace a podniky.' }, 403);
  }

  const rl = await rateLimit(c.env, 'event', user.sub, 30, 3600);
  if (!rl.ok) return c.json({ error: 'Příliš mnoho akcí. Zkus to za hodinu.' }, 429);

  const form = await c.req.parseBody({ all: true });
  const rawFiles = form.file;
  const fileList = (Array.isArray(rawFiles) ? rawFiles : rawFiles ? [rawFiles] : [])
    .filter((f) => f && typeof f !== 'string' && f.size > 0)
    .slice(0, MAX_EVENT_PHOTOS);

  const rawHtml = (form.description_html || form.description || '').toString();
  const contentHtml = sanitizeHtml(rawHtml);
  const plain = htmlToPlain(contentHtml);

  const title = (form.title || '').toString().trim().slice(0, 200);
  const startAt = (form.start_at || '').toString();
  const endAt = (form.end_at || '').toString() || null;
  const locationName = (form.location_name || '').toString().slice(0, 200);
  const city = (form.city || '').toString().slice(0, 100);
  const region = (form.region || '').toString().slice(0, 100);
  const businessId = (form.business_id || '').toString();
  const businessKind = (form.business_kind || '').toString();
  const geoLat = form.geo_lat ? parseFloat(form.geo_lat) : null;
  const geoLng = form.geo_lng ? parseFloat(form.geo_lng) : null;

  if (!title) return c.json({ error: 'Chýba název.' }, 400);
  if (!startAt) return c.json({ error: 'Chýba datum začátku.' }, 400);
  if (!businessId || !BUSINESS_TABLE[businessKind]) return c.json({ error: 'Chýba podnik.' }, 400);

  const mod = checkText(`${title} ${plain}`);
  if (!mod.clean && mod.severity >= 2) {
    await flagContent(c.env, { userId: user.sub, reason: mod.reason, severity: mod.severity });
    return c.json({ error: 'Text obsahuje zakázaný obsah.' }, 400);
  }

  const biz = await c.env.DB.prepare(`SELECT user_id FROM ${BUSINESS_TABLE[businessKind]} WHERE id = ?`).bind(businessId).first();
  if (!biz) return c.json({ error: 'Podnik nenájdený.' }, 404);
  if (biz.user_id !== user.sub && user.role !== 'admin') return c.json({ error: 'Nemáš oprávnění.' }, 403);

  const galleryUrls = [];
  for (const f of fileList) {
    try {
      const ext = ((f.name || 'x.jpg').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const key = `events/${newId()}.${ext}`;
      await c.env.MEDIA.put(key, await f.arrayBuffer(), { httpMetadata: { contentType: f.type || 'image/jpeg' } });
      const publicBase = c.env.R2_PUBLIC_BASE || '';
      galleryUrls.push(publicBase ? `${publicBase}/${key}` : key);
    } catch (err) {
      console.error('[events] R2 upload zlyhal:', err);
    }
  }

  const coverUrl = galleryUrls[0] || null;
  const id = newId('event');
  await c.env.DB.prepare(
    `INSERT INTO events (id, user_id, business_id, business_kind, title, description, content_html, cover_image_url, gallery_json, start_at, end_at, location_name, city, region, geo_lat, geo_lng, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`,
  ).bind(
    id, user.sub, businessId, businessKind, title, plain, contentHtml, coverUrl,
    galleryUrls.length > 0 ? JSON.stringify(galleryUrls) : null,
    startAt, endAt, locationName || null, city || null, region || null, geoLat, geoLng,
  ).run();

  return c.json({ id, cover_image_url: coverUrl, gallery: galleryUrls, title, start_at: startAt }, 201);
});

eventsApiRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const ev = await c.env.DB.prepare('SELECT id, user_id FROM events WHERE id = ?').bind(id).first();
  if (!ev) return c.json({ error: 'Nenalezeno.' }, 404);
  if (ev.user_id !== user.sub && user.role !== 'admin') return c.json({ error: 'Nemáš oprávnění.' }, 403);
  await c.env.DB.prepare(`UPDATE events SET status = 'removed' WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});
