import { Hono } from 'hono';

export const geoRoutes = new Hono();

// Nominatim reverse — mesto/obec podľa súradníc
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

// Uloženie polohy usera
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

// ============================================================
// OBCE — zoznam obcí v okrese
// Cache v KV na 7 dní
// ============================================================
geoRoutes.get('/cities', async (c) => {
  const district = (c.req.query('district') || '').trim();
  const q = (c.req.query('q') || '').trim().toLowerCase();

  if (!district) return c.json({ cities: [] });

  const cacheKey = `cities:v2:${district}`;
  let cities = null;

  try {
    const cached = await c.env.NASKRAJ_LAJKY.get(cacheKey);
    if (cached) cities = JSON.parse(cached);
  } catch {}

  if (!cities) {
    try {
      // 1) Nájdi okres v Nominatim
      const searchUrl = `https://nominatim.openstreetmap.org/search?` + new URLSearchParams({
        q: `${district}, Czech Republic`,
        format: 'json',
        limit: '1',
        addressdetails: '1',
      });
      const res = await fetch(searchUrl, { headers: { 'User-Agent': 'Naskraj/1.0 (naskraj.vandro.cz)' } });
      if (!res.ok) throw new Error('Nominatim ' + res.status);
      const arr = await res.json();
      if (!arr || arr.length === 0) cities = [];

      if (!cities || cities.length === 0) {
        const hit = arr[0];
        const osmId = hit?.osm_id;
        const osmType = hit?.osm_type;

        if (osmId && osmType) {
          // 2) Overpass API — nájdi všetky sídla v okrese
          const areaId = osmType === 'relation' ? 3600000000 + osmId : osmId;
          const ovQuery = `
            [out:json][timeout:25];
            area(${areaId})->.a;
            (
              node["place"~"^(city|town|village|hamlet|suburb|neighbourhood)$"](area.a);
            );
            out tags 300;
          `;
          const ovRes = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: { 'User-Agent': 'Naskraj/1.0 (naskraj.vandro.cz)' },
            body: 'data=' + encodeURIComponent(ovQuery),
          });
          if (ovRes.ok) {
            const ovData = await ovRes.json();
            const seen = new Set();
            cities = (ovData.elements || [])
              .map((el) => el.tags?.name)
              .filter((name) => name && !seen.has(name) && (seen.add(name), true))
              .sort((a, b) => a.localeCompare(b, 'cs'));
          } else {
            cities = [];
          }
        }
      }

      // Cache na 7 dní
      try {
        await c.env.NASKRAJ_LAJKY.put(cacheKey, JSON.stringify(cities || []), { expirationTtl: 604800 });
      } catch {}
    } catch (err) {
      console.error('cities fetch error:', err);
      cities = [];
    }
  }

  let out = cities || [];
  if (q) out = out.filter((name) => name.toLowerCase().includes(q));
  return c.json({ cities: out.slice(0, 300) });
});
