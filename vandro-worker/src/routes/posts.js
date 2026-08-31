import { Hono } from 'hono';
import { newId } from '../auth.js';

export const postsRoutes = new Hono();

const BUSINESS_TABLE_BY_FEED = {
  organization: 'organizations',
  accommodation: 'accommodation',
  gastro: 'restaurants',
};

// POST /api/posts — multipart/form-data: file, text, target_feed, business_id
// Dostupné len pre role 'organization' a 'hotelier'. Príspevok sa zverejní IHNEĎ (status 'published'),
// žiadne schvaľovanie adminom nie je súčasťou tohto flow (na rozdiel od Verified odznaku, ten admin udeľuje zvlášť).
postsRoutes.post('/', async (c) => {
  const user = c.get('user');
  if (user.role !== 'organization' && user.role !== 'hotelier' && user.role !== 'admin') {
    return c.json({ error: 'Príspevky môžu pridávať len organizácie a podniky.' }, 403);
  }

  const form = await c.req.parseBody();
  const file = form.file;
  const text = (form.text || '').toString();
  const targetFeed = (form.target_feed || '').toString();
  const businessId = (form.business_id || '').toString();

  if (!['organization', 'accommodation', 'gastro'].includes(targetFeed)) {
    return c.json({ error: 'target_feed musí byť organization, accommodation alebo gastro.' }, 400);
  }
  if (!businessId) return c.json({ error: 'Chýba business_id (ktorý podnik príspevok pridáva).' }, 400);
  if (!file || typeof file === 'string') return c.json({ error: 'Chýba súbor fotky (pole "file").' }, 400);

  // Overenie, že business_id skutočne patrí prihlásenému užívateľovi
  const table = BUSINESS_TABLE_BY_FEED[targetFeed];
  const business = await c.env.DB.prepare(`SELECT id, user_id FROM ${table} WHERE id = ?`).bind(businessId).first();
  if (!business) return c.json({ error: 'Podnik nenájdený.' }, 404);
  if (business.user_id !== user.sub && user.role !== 'admin') {
    return c.json({ error: 'Tento podnik nepatrí prihlásenému účtu.' }, 403);
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
    `INSERT INTO posts (id, user_id, target_feed, business_id, text_content, image_url, status)
     VALUES (?, ?, ?, ?, ?, ?, 'published')`,
  ).bind(id, user.sub, targetFeed, businessId, text, imageUrl).run();

  return c.json({ id, image_url: imageUrl, text, target_feed: targetFeed, business_id: businessId, status: 'published' }, 201);
});
