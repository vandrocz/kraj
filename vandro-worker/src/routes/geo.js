import { Hono } from 'hono';

export const geoRoutes = new Hono();

// ============================================================
// Pomocné: parsovanie Nominatim adresy na kraj/okres/obec
// ============================================================
function parseNominatimAddress(a) {
  a = a || {};
  const city = a.city || a.town || a.village || a.hamlet || a.municipality || a.suburb || '';
  const district = a.county || a.district || a.state_district || '';
  const region = a.state || a.region || '';
  const country = (a.country_code || '').toLowerCase();
  return { city, district, region, country };
}

geoRoutes.get('/reverse', async (c) => {
  const lat = parseFloat(c.req.query('lat') || '');
  const lng = parseFloat(c.req.query('lng') || '');
  if (isNaN(lat) || isNaN(lng)) return c.json({ error: 'Neplatné souřadnice.' }, 400);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=cs&addressdetails=1`,
      { headers: { 'User-Agent': 'Vandro/1.0 (vandro.cz)' } },
    );
    if (!res.ok) throw new Error('Nominatim ' + res.status);
    const data = await res.json();
    const parsed = parseNominatimAddress(data.address);
    // place = najkratší zmysluplný názov miesta
    const place = parsed.city || data.name || data.display_name?.split(',')[0] || '';
    return c.json({
      place,
      city: parsed.city,
      district: parsed.district,
      region: parsed.region,
      country_code: parsed.country,
      lat,
      lng,
      display_name: data.display_name || '',
    });
  } catch (err) {
    return c.json({ place: '', city: '', district: '', region: '', country_code: '', lat, lng, error: err.message });
  }
});

// Forward geocoding — hľadanie miesta podľa textu
geoRoutes.get('/search', async (c) => {
  const q = (c.req.query('q') || '').trim();
  const limit = Math.min(parseInt(c.req.query('limit') || '8', 10), 20);
  const cc = (c.req.query('cc') || 'cz,sk').split(',').map((s) => s.trim()).filter(Boolean);

  if (q.length < 3) return c.json({ results: [] });

  const cacheKey = `geoq:v2:${q.toLowerCase()}:${limit}:${cc.join('|')}`;
  try {
    const cached = await c.env.NASKRAJ_LAJKY.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return c.json({ results: parsed });
    }
  } catch {}

  try {
    const url = `https://nominatim.openstreetmap.org/search?` + new URLSearchParams({
      q,
      format: 'json',
      limit: String(limit),
      addressdetails: '1',
      countrycodes: cc.join(','),
      'accept-language': 'cs',
    }).toString();

    const res = await fetch(url, { headers: { 'User-Agent': 'Vandro/1.0 (vandro.cz)' } });
    if (!res.ok) throw new Error('Nominatim ' + res.status);
    const arr = await res.json();

    const results = (arr || []).map((r) => {
      const a = r.address || {};
      const parsed = parseNominatimAddress(a);
      const shortName = r.name
        || a.city || a.town || a.village || a.hamlet || a.municipality
        || (r.display_name || '').split(',')[0];
      return {
        name: shortName,
        display_name: r.display_name || '',
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        type: r.type || r.class || '',
        address: {
          road: a.road || '',
          house_number: a.house_number || '',
          city: parsed.city,
          postcode: a.postcode || '',
          country: parsed.country,
          district: parsed.district,
          region: parsed.region,
        },
      };
    }).filter((r) => !isNaN(r.lat) && !isNaN(r.lng));

    try {
      await c.env.NASKRAJ_LAJKY.put(cacheKey, JSON.stringify(results), { expirationTtl: 86400 });
    } catch {}

    return c.json({ results });
  } catch (err) {
    console.warn('[geo search]', err.message);
    return c.json({ results: [], error: err.message });
  }
});

geoRoutes.post('/save', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const lat = parseFloat(body.lat), lng = parseFloat(body.lng);
  const place = (body.place || '').toString().slice(0, 120);
  const country = (body.country_code || '').toString().slice(0, 4);
  if (isNaN(lat) || isNaN(lng)) return c.json({ error: 'Neplatné souřadnice.' }, 400);
  try {
    await c.env.DB.prepare(`UPDATE users SET geo_lat = ?, geo_lng = ?, geo_city = ?, country_code = ? WHERE id = ?`)
      .bind(lat, lng, place, country || null, user.sub).run();
  } catch (err) {
    // fallback ak country_code stĺpec ešte neexistuje
    await c.env.DB.prepare(`UPDATE users SET geo_lat = ?, geo_lng = ?, geo_city = ? WHERE id = ?`)
      .bind(lat, lng, place, user.sub).run();
  }
  return c.json({ ok: true, place, country_code: country });
});

// ============================================================
// OBCE — Overpass + Nominatim (CZ + SK)
// ============================================================
async function fetchOverpassCz(areaQuery, userAgent) {
  const ovQuery = `[out:json][timeout:30];
${areaQuery}
node["place"~"^(city|town|village|hamlet|suburb|neighbourhood|quarter)$"](area.a);
out tags 500;`;

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'User-Agent': userAgent, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(ovQuery),
  });
  if (!res.ok) throw new Error('Overpass ' + res.status);
  const data = await res.json();
  return data.elements || [];
}

async function findOverpassAreaForDistrict(district, userAgent) {
  // Skús rôzne tvary názvov — CZ aj SK
  const areaNames = [`Okres ${district}`, `okres ${district}`, district];
  for (const name of areaNames) {
    try {
      const els = await fetchOverpassCz(`area["name"="${name.replace(/"/g, '')}"]->.a;`, userAgent);
      if (els.length > 0) return els;
    } catch (err) {}
  }
  // Fallback: Nominatim nájde relation pre okres
  try {
    const nomRes = await fetch(
      `https://nominatim.openstreetmap.org/search?` + new URLSearchParams({
        q: `${district}, Czech Republic, Slovakia`,
        format: 'json', limit: '1', addressdetails: '1',
      }),
      { headers: { 'User-Agent': userAgent } },
    );
    if (!nomRes.ok) throw new Error('Nominatim ' + nomRes.status);
    const arr = await nomRes.json();
    if (arr && arr.length > 0) {
      const rel = arr[0];
      if (rel.osm_id && rel.osm_type === 'relation') {
        const areaId = 3600000000 + rel.osm_id;
        const els = await fetchOverpassCz(`area(${areaId})->.a;`, userAgent);
        if (els.length > 0) return els;
      }
    }
  } catch (err) {}
  return [];
}

async function fetchCitiesFromNominatim(district, userAgent) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?` + new URLSearchParams({
        q: district, format: 'json', limit: '20', addressdetails: '1', countrycodes: 'cz,sk',
      }),
      { headers: { 'User-Agent': userAgent } },
    );
    if (!res.ok) throw new Error('Nominatim ' + res.status);
    const arr = await res.json();
    return (arr || []).map((r) => r.display_name?.split(',')[0]).filter(Boolean);
  } catch (err) { return []; }
}

geoRoutes.get('/cities', async (c) => {
  const district = (c.req.query('district') || '').trim();
  const q = (c.req.query('q') || '').trim().toLowerCase();
  const debug = c.req.query('debug') === '1';
  if (!district) return c.json({ cities: [] });

  const cacheKey = `cities:v7:${district}`;
  let cities = null;

  try {
    const cached = await c.env.NASKRAJ_LAJKY.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) cities = parsed;
    }
  } catch {}

  if (!cities || cities.length === 0) {
    const userAgent = 'Vandro/1.0 (vandro.cz)';
    let elements = [];
    try { elements = await findOverpassAreaForDistrict(district, userAgent); } catch (err) {}

    const seen = new Set();
    cities = elements
      .map((el) => el.tags?.name)
      .filter((name) => name && !seen.has(name) && (seen.add(name), true))
      .sort((a, b) => a.localeCompare(b, 'cs'));

    if (cities.length === 0) {
      const fb = await fetchCitiesFromNominatim(district, userAgent);
      const seenFb = new Set();
      cities = fb.filter((n) => n && !seenFb.has(n) && (seenFb.add(n), true));
    }
    if (cities.length === 0) cities = [district];

    if (cities.length > 0) {
      try { await c.env.NASKRAJ_LAJKY.put(cacheKey, JSON.stringify(cities), { expirationTtl: 2592000 }); } catch {}
    }
  }

  let out = cities || [];
  if (q) out = out.filter((name) => name.toLowerCase().includes(q));

  if (debug) return c.json({ cities: out.slice(0, 300), _debug: { district, total: cities.length } });
  return c.json({ cities: out.slice(0, 300) });
});
