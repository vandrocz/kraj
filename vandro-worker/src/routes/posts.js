import { Hono } from 'hono';
import { newId } from '../auth.js';
import { checkText, flagContent, sanitizeHtml, htmlToPlain } from '../moderation.js';
import { processMentions } from './mentions.js';
import { rateLimit } from '../ratelimit.js';
import { validateUpload } from '../moderation.js';

export const postsRoutes = new Hono();

const BUSINESS_TABLE_BY_FEED = { organization: 'organizations', accommodation: 'accommodation', gastro: 'restaurants' };
const MAX_PHOTOS = 4;

postsRoutes.post('/', async (c) => {
  const user = c.get('user');
  if (!['organization', 'hotelier', 'admin'].includes(user.role)) return c.json({ error: 'Príspevky môžu pridávať len organizácie a podniky.' }, 403);

  const rl = await rateLimit(c.env, 'post', user.sub, 20, 3600);
  if (!rl.ok) return c.json({ error: 'Příliš mnoho příspěvků.' }, 429);

  const row = await c.env.DB.prepare('SELECT email_verified, display_name FROM users WHERE id = ?').bind(user.sub).first();
  if (!row?.email_verified) return c.json({ error: 'Pro přidání příspěvku musíš nejprve ověřit e-mail.' }, 403);

  const form = await c.req.parseBody({ all: true });
  const rawFiles = form.file;
  const fileList = (Array.isArray(rawFiles) ? rawFiles : rawFiles ? [rawFiles] : []).filter((f) => f && typeof f !== 'string' && f.size > 0);

  const rawHtml = (form.text_html || form.text || '').toString();
  const contentHtml = sanitizeHtml(rawHtml);
  const plainText = htmlToPlain(contentHtml);
  const targetFeed = (form.target_feed || '').toString();
  const businessId = (form.business_id || '').toString();
  const geoLat = form.geo_lat ? parseFloat(form.geo_lat) : null;
  const geoLng = form.geo_lng ? parseFloat(form.geo_lng) : null;
  const geoPlace = (form.geo_place || '').toString().slice(0, 120);

  if (!['organization', 'accommodation', 'gastro'].includes(targetFeed)) return c.json({ error: 'Neplatný target_feed.' }, 400);
  if (!businessId) return c.json({ error: 'Chýba business_id.' }, 400);
  if (fileList.length === 0) return c.json({ error: 'Chýba aspoň jedna fotka.' }, 400);
  if (fileList.length > MAX_PHOTOS) return c.json({ error: `Maximálne ${MAX_PHOTOS} fotky.` }, 400);

  const mod = checkText(plainText);
  if (!mod.clean) {
    await flagContent(c.env, { userId: user.sub, reason: mod.reason, severity: mod.severity });
    if (mod.severity >= 2) return c.json({ error: 'Text obsahuje zakázaný obsah.' }, 400);
  }

  const table = BUSINESS_TABLE_BY_FEED[targetFeed];
  const business = await c.env.DB.prepare(`SELECT id, user_id FROM ${table} WHERE id = ?`).bind(businessId).first();
  if (!business) return c.json({ error: 'Podnik nenájdený.' }, 404);
  if (business.user_id !== user.sub && user.role !== 'admin') return c.json({ error: 'Nemáš oprávnění.' }, 403);

  const publicBase = c.env.R2_PUBLIC_BASE || 'https://media.vandro.cz';
  const mediaUrls = [];
  for (const file of fileList) {
    const rawName = file.name || 'photo.jpg';
    const ext = (rawName.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const key = `posts/${newId()}.${ext}`;
    await c.env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || 'image/jpeg' } });
    mediaUrls.push(`${publicBase}/${key}`);
  }
    // MIME + size + magic bytes validácia
  for (const file of fileList) {
    const v = await validateUpload(file, 'image');
    if (!v.ok) {
      const msgs = {
        bad_type: 'Povolené sú len JPG, PNG, WebP alebo GIF.',
        too_large: 'Fotka je príliš veľká (max 10 MB).',
        bad_magic: 'Súbor nie je platná fotka.',
        empty: 'Súbor je prázdny.',
      };
      return c.json({ error: msgs[v.reason] || 'Neplatný súbor.' }, 400);
    }
  }

  const id = newId('post');
  await c.env.DB.prepare(
    `INSERT INTO posts (id, user_id, target_feed, business_id, text_content, content_html, image_url, geo_lat, geo_lng, geo_place, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`,
  ).bind(id, user.sub, targetFeed, businessId, plainText, contentHtml, mediaUrls[0], geoLat, geoLng, geoPlace || null).run();

  const stmt = c.env.DB.prepare(`INSERT INTO post_media (id, post_id, image_url, sort_order) VALUES (?, ?, ?, ?)`);
  await c.env.DB.batch(mediaUrls.map((url, i) => stmt.bind(newId('pm'), id, url, i)));

  // Mentions
  const mentionedIds = await processMentions(c.env, {
    postId: id, actorId: user.sub, actorName: row.display_name, contentHtml,
  });
  if (mentionedIds.length > 0) {
    await c.env.DB.prepare(`UPDATE posts SET mentions_json = ? WHERE id = ?`).bind(JSON.stringify(mentionedIds), id).run();
  }

  return c.json({ id, media: mediaUrls, html: contentHtml, text: plainText, target_feed: targetFeed, business_id: businessId, geo: geoPlace, mentions: mentionedIds, status: 'published' }, 201);
});
