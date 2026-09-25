import { Hono } from 'hono';

export const geoRoutes = new Hono();

// Nominatim reverse
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
// OBCE — Overpass + Nominatim kombinácia
// ============================================================

async function fetchOverpassCz(areaQuery, userAgent) {
  const ovQuery = `[out:json][timeout:30];
${areaQuery}
node["place"~"^(city|town|village|hamlet|suburb|neighbourhood|quarter)$"](area.a);
out tags 500;`;

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'User-Agent': userAgent,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'data=' + encodeURIComponent(ovQuery),
  });
  if (!res.ok) throw new Error('Overpass ' + res.status);
  const data = await res.json();
  return data.elements || [];
}

async function findOverpassAreaForDistrict(district, userAgent) {
  // 1) Skús priamo známe názvy area
  const areaNames = [`Okres ${district}`, district];

  for (const name of areaNames) {
    try {
      const els = await fetchOverpassCz(
        `area["name"="${name.replace(/"/g, '')}"]->.a;`,
        userAgent,
      );
      if (els.length > 0) return els;
    } catch (err) {
      console.warn('Overpass area name failed for', name, err.message);
    }
  }

  // 2) Nominatim — nájdi okres, potom použi jeho relation ID
  try {
    const nomRes = await fetch(
      `https://nominatim.openstreetmap.org/search?` + new URLSearchParams({
        q: `okres ${district}, Czech Republic`,
        format: 'json',
        limit: '1',
        addressdetails: '1',
      }),
      { headers: { 'User-Agent': userAgent } },
    );
    if (!nomRes.ok) throw new Error('Nominatim ' + nomRes.status);
    const arr = await nomRes.json();

    if (arr && arr.length > 0) {
      const rel = arr[0];
      const osmId = rel.osm_id;
      const osmType = rel.osm_type;
      if (osmId && osmType === 'relation') {
        const areaId = 3600000000 + osmId;
        const els = await fetchOverpassCz(`area(${areaId})->.a;`, userAgent);
        if (els.length > 0) return els;
      }
    }
  } catch (err) {
    console.warn('Nominatim lookup failed:', err.message);
  }

  return [];
}

// Fallback: zoznam najväčších miest v okrese (z Nominatim search s q="<district>")
async function fetchCitiesFromNominatim(district, userAgent) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?` + new URLSearchParams({
        q: district,
        format: 'json',
        limit: '20',
        addressdetails: '1',
        countrycodes: 'cz,sk',
      }),
      { headers: { 'User-Agent': userAgent } },
    );
    if (!res.ok) throw new Error('Nominatim ' + res.status);
    const arr = await res.json();
    return (arr || []).map((r) => r.display_name?.split(',')[0]).filter(Boolean);
  } catch (err) {
    console.warn('Nominatim cities fallback failed:', err.message);
    return [];
  }
}

geoRoutes.get('/cities', async (c) => {
  const district = (c.req.query('district') || '').trim();
  const q = (c.req.query('q') || '').trim().toLowerCase();
  const debug = c.req.query('debug') === '1';

  if (!district) return c.json({ cities: [] });

  const cacheKey = `cities:v5:${district}`;
  let cities = null;

  try {
    const cached = await c.env.NASKRAJ_LAJKY.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) cities = parsed;
    }
  } catch {}

  if (!cities || cities.length === 0) {
    const userAgent = 'Naskraj/1.0 (naskraj.vandro.cz)';
    let elements = [];

    try {
      elements = await findOverpassAreaForDistrict(district, userAgent);
    } catch (err) {
      console.error('cities fetch error:', err);
    }

    const seen = new Set();
    cities = elements
      .map((el) => el.tags?.name)
      .filter((name) => name && !seen.has(name) && (seen.add(name), true))
      .sort((a, b) => a.localeCompare(b, 'cs'));

    // OPRAVA: Ak Overpass zlyhal, skús fallback cez Nominatim search
    if (cities.length === 0) {
      console.warn(`[geo] Overpass vrátil 0 obcí pre okres "${district}", skúšam Nominatim fallback.`);
      const fb = await fetchCitiesFromNominatim(district, userAgent);
      const seenFb = new Set();
      cities = fb.filter((n) => n && !seenFb.has(n) && (seenFb.add(n), true));
    }

    // Posledný fallback: aspoň okresné mesto (zvyčajne rovnaké ako okres)
    if (cities.length === 0) {
      cities = [district];
    }

    if (cities.length > 0) {
      try { await c.env.NASKRAJ_LAJKY.put(cacheKey, JSON.stringify(cities), { expirationTtl: 2592000 }); } catch {}
    }
  }

  let out = cities || [];
  if (q) out = out.filter((name) => name.toLowerCase().includes(q));

  if (debug) {
    return c.json({
      cities: out.slice(0, 300),
      _debug: {
        district,
        total: cities.length,
        source: cities.length > 0 ? 'overpass/nominatim' : 'empty',
      },
    });
  }
  return c.json({ cities: out.slice(0, 300) });
});
