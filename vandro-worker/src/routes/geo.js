import { Hono } from 'hono';

export const geoRoutes = new Hono();

// GET /api/geo/reverse?lat=...&lng=...  → mesto/obec (cez Nominatim, free)
geoRoutes.get('/reverse', async (c) => {
  const lat = parseFloat(c.req.query('lat') || '');
  const lng = parseFloat(c.req.query('lng') || '');
  if (isNaN(lat) || isNaN(lng)) return c.json({ error: 'Neplatné souřadnice.' }, 400);

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=cs`,
      { headers: { 'User-Agent': 'Naskraj/1.0 (naskraj.vandro.cz)' } },
    );
    if (!res.ok) throw new Error('Nominatim ' + res.status);
    const data = await res.json();
    const a = data.address || {};
    const place = a.city || a.town || a.village || a.municipality || a.county || a.state || '';
    const region = a.state || '';
    return c.json({ place, region, lat, lng });
  } catch (err) {
    return c.json({ place: '', region: '', lat, lng, error: err.message });
  }
});

// POST /api/geo/save  { lat, lng, place }  → uloží polohu k userovi
geoRoutes.post('/save', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const lat = parseFloat(body.lat), lng = parseFloat(body.lng);
  const place = (body.place || '').toString().slice(0, 120);
  if (isNaN(lat) || isNaN(lng)) return c.json({ error: 'Neplatné souřadnice.' }, 400);
  await c.env.DB.prepare(`UPDATE users SET geo_lat = ?, geo_lng = ?, geo_city = ? WHERE id = ?`)
    .bind(lat, lng, place, user.sub).run();
  return c.json({ ok: true, place });
});
