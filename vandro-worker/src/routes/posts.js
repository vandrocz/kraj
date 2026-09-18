import { Hono } from 'hono';
import { newId } from '../auth.js';

export const postsRoutes = new Hono();

// over že má overený e-mail
const row = await c.env.DB.prepare('SELECT email_verified FROM users WHERE id = ?').bind(user.sub).first();
if (!row?.email_verified) return c.json({ error: 'Pro přidání příspěvku musíš nejprve ověřit e-mail.' }, 403);

const BUSINESS_TABLE_BY_FEED = {
  organization: 'organizations',
  accommodation: 'accommodation',
  gastro: 'restaurants',
};

const MAX_PHOTOS = 4;

postsRoutes.post('/', async (c) => {
  const user = c.get('user');
  if (user.role !== 'organization' && user.role !== 'hotelier' && user.role !== 'admin') {
    return c.json({ error: 'Príspevky môžu pridávať len organizácie a podniky.' }, 403);
  }

  const form = await c.req.parseBody({ all: true });
  const rawFiles = form.file;
  const fileList = (Array.isArray(rawFiles) ? rawFiles : rawFiles ? [rawFiles] : [])
    .filter((f) => f && typeof f !== 'string' && f.size > 0);

  const text = (form.text || '').toString();
  const targetFeed = (form.target_feed || '').toString();
  const businessId = (form.business_id || '').toString();

  if (!['organization', 'accommodation', 'gastro'].includes(targetFeed)) {
    return c.json({ error: 'Neplatný target_feed.' }, 400);
  }
  if (!businessId) return c.json({ error: 'Chýba business_id.' }, 400);
  if (fileList.length === 0) return c.json({ error: 'Chýba aspoň jedna fotka.' }, 400);
  if (fileList.length > MAX_PHOTOS) return c.json({ error: `Maximálne ${MAX_PHOTOS} fotky na príspevok.` }, 400);

  const table = BUSINESS_TABLE_BY_FEED[targetFeed];
  const business = await c.env.DB.prepare(`SELECT id, user_id FROM ${table} WHERE id = ?`).bind(businessId).first();
  if (!business) return c.json({ error: 'Podnik nenájdený.' }, 404);
  if (business.user_id !== user.sub && user.role !== 'admin') {
    return c.json({ error: 'Tento podnik nepatrí prihlásenému účtu.' }, 403);
  }

  const publicBase = c.env.R2_PUBLIC_BASE || 'https://media.vandro.cz';
  const mediaUrls = [];

  for (const file of fileList) {
    const rawName = file.name || 'photo.jpg';
    const ext = (rawName.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const key = `posts/${newId()}.${ext}`;
    await c.env.MEDIA.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || 'image/jpeg' },
    });
    mediaUrls.push(`${publicBase}/${key}`);
  }

  const id = newId('post');
  await c.env.DB.prepare(
    `INSERT INTO posts (id, user_id, target_feed, business_id, text_content, image_url, status)
     VALUES (?, ?, ?, ?, ?, ?, 'published')`,
  ).bind(id, user.sub, targetFeed, businessId, text, mediaUrls[0]).run();

  const stmt = c.env.DB.prepare(
    `INSERT INTO post_media (id, post_id, image_url, sort_order) VALUES (?, ?, ?, ?)`,
  );
  await c.env.DB.batch(mediaUrls.map((url, i) => stmt.bind(newId('pm'), id, url, i)));

  return c.json({ id, media: mediaUrls, text, target_feed: targetFeed, business_id: businessId, status: 'published' }, 201);
});
