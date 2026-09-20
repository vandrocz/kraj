import { Hono } from 'hono';

export const geoRoutes = new Hono();

// Reverse geocoding — mesto podľa súradníc
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

// Uloženie polohy
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
// OBCE — priamo Overpass API (bez Nominatim medzistupňa)
// ============================================================
geoRoutes.get('/cities', async (c) => {
  const district = (c.req.query('district') || '').trim();
  const q = (c.req.query('q') || '').trim().toLowerCase();
  const debug = c.req.query('debug') === '1';

  if (!district) return c.json({ cities: [] });

  const cacheKey = `cities:v3:${district}`;
  let cities = null;

  // Skús KV cache
  try {
    const cached = await c.env.NASKRAJ_LAJKY.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) cities = parsed;
    }
  } catch {}

  if (!cities) {
    // Overpass API — nájdi okres a všetky obce v ňom
    // Okresy ČR: admin_level=7 (okresy), admin_level=6 (kraje), Praha je admin_level=6
    const isPraha = district.toLowerCase() === 'praha' || district.toLowerCase() === 'praha-město';

    // Použijeme názov okresu. Okresy sa v OSM volajú "Okres X" alebo len "X"
    const ovQuery = isPraha
      ? `[out:json][timeout:30];
         area["name"="Praha"]["admin_level"="6"]->.a;
         node["place"~"^(city|town|village|hamlet|suburb|neighbourhood|quarter)$"](area.a);
         out tags 300;`
      : `[out:json][timeout:30];
         area["name"="${district.replace(/"/g, '')}"]["boundary"="administrative"]["admin_level"="7"]->.a;
         node["place"~"^(city|town|village|hamlet|suburb|neighbourhood|quarter)$"](area.a);
         out tags 500;`;

    try {
      const ovRes = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: {
          'User-Agent': 'Naskraj/1.0 (naskraj.vandro.cz)',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'data=' + encodeURIComponent(ovQuery),
      });

      if (!ovRes.ok) {
        console.error('Overpass HTTP:', ovRes.status, await ovRes.text().catch(() => ''));
        cities = [];
      } else {
        const ovData = await ovRes.json();
        const seen = new Set();
        cities = (ovData.elements || [])
          .map((el) => el.tags?.name)
          .filter((name) => name && !seen.has(name) && (seen.add(name), true))
          .sort((a, b) => a.localeCompare(b, 'cs'));
        if (debug) console.log('Overpass returned', cities.length, 'cities for', district);
      }

      // Cache na 30 dní
      if (cities.length > 0) {
        try { await c.env.NASKRAJ_LAJKY.put(cacheKey, JSON.stringify(cities), { expirationTtl: 2592000 }); } catch {}
      }
    } catch (err) {
      console.error('Overpass error:', err);
      cities = [];
    }
  }

  let out = cities || [];
  if (q) out = out.filter((name) => name.toLowerCase().includes(q));

  if (debug) {
    return c.json({ cities: out.slice(0, 300), _debug: { district, total: cities.length, cached: cities !== null } });
  }
  return c.json({ cities: out.slice(0, 300) });
});
