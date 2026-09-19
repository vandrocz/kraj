import { Hono } from 'hono';

export const nearbyRoutes = new Hono();

const EARTH_RADIUS_KM = 6371;

function haversine(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const KIND_TO_FEED = { organizations: 'organization', accommodation: 'accommodation', restaurants: 'gastro' };

nearbyRoutes.get('/', async (c) => {
  const lat = parseFloat(c.req.query('lat') || '');
  const lng = parseFloat(c.req.query('lng') || '');
  const radius = Math.min(parseFloat(c.req.query('radius') || '25'), 200);
  const kind = (c.req.query('kind') || 'all').toString();
  if (isNaN(lat) || isNaN(lng)) return c.json({ error: 'Neplatné souřadnice.' }, 400);

  const tables = kind === 'all'
    ? ['organizations', 'accommodation', 'restaurants']
    : [kind];

  const out = [];

  for (const table of tables) {
    if (!KIND_TO_FEED[table]) continue;
    try {
      const { results } = await c.env.DB.prepare(
        `SELECT DISTINCT ${table}.id, ${table}.name, ${table}.type, ${table}.region, ${table}.district, ${table}.city,
                ${table}.is_verified, ${table}.logo_url AS logo,
                posts.geo_lat, posts.geo_lng, posts.geo_place
         FROM ${table}
         JOIN posts ON posts.business_id = ${table}.id AND posts.target_feed = ? AND posts.geo_lat IS NOT NULL
         WHERE posts.status = 'published'
         LIMIT 500`,
      ).bind(KIND_TO_FEED[table]).all();

      for (const r of results) {
        if (r.geo_lat == null || r.geo_lng == null) continue;
        const dist = haversine(lat, lng, r.geo_lat, r.geo_lng);
        if (dist <= radius) out.push({ ...r, kind: table, distance_km: Math.round(dist * 10) / 10 });
      }
    } catch (err) { console.error('nearby error:', err); }
  }

  out.sort((a, b) => a.distance_km - b.distance_km);
  return c.json({ results: out.slice(0, 100), center: { lat, lng }, radius_km: radius });
});