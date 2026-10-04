import { Hono } from 'hono';

// Veřejný endpoint pro mapu na vandro.cz — všechny body (atrakce, ubytování,
// gastro, události) s GPS souřadnicemi. Jedním dotazem na typ, bez N+1.
export const mapRoutes = new Hono();

const TABLES = {
  organizations: { feed: 'organization', logo: 'logo_url', extra: `'' AS cuisine_type, '' AS price_level` },
  accommodation: { feed: 'accommodation', logo: 'image_url', extra: `'' AS cuisine_type, COALESCE(t.price_level,'') AS price_level` },
  restaurants: { feed: 'gastro', logo: 'image_url', extra: `COALESCE(t.cuisine_type,'') AS cuisine_type, COALESCE(t.price_level,'') AS price_level` },
};

async function loadBusinesses(db, table) {
  const cfg = TABLES[table];
  // Souřadnice podniku; pokud chybí, vezmeme geo z posledního publikovaného příspěvku.
  const sql = `
    SELECT t.id, t.name, t.type, t.region, t.district, t.city, t.address,
           t.${cfg.logo} AS logo, t.cover_url AS cover, t.is_verified,
           ${cfg.extra},
           COALESCE(t.geo_lat, (SELECT p.geo_lat FROM posts p WHERE p.business_id = t.id AND p.target_feed = ? AND p.geo_lat IS NOT NULL AND p.status = 'published' ORDER BY p.created_at DESC LIMIT 1)) AS lat,
           COALESCE(t.geo_lng, (SELECT p.geo_lng FROM posts p WHERE p.business_id = t.id AND p.target_feed = ? AND p.geo_lng IS NOT NULL AND p.status = 'published' ORDER BY p.created_at DESC LIMIT 1)) AS lng
    FROM ${table} t
    JOIN users u ON u.id = t.user_id
    WHERE u.status = 'active'
    LIMIT 3000`;
  const { results } = await db.prepare(sql).bind(cfg.feed, cfg.feed).all();
  return (results || [])
    .filter((r) => r.lat != null && r.lng != null && isFinite(r.lat) && isFinite(r.lng))
    .map((r) => ({
      id: r.id, name: r.name, type: r.type || '', cuisine: r.cuisine_type || '',
      price: r.price_level || '', region: r.region || '', district: r.district || '',
      city: r.city || '', address: r.address || '', logo: r.logo || '', cover: r.cover || '',
      verified: r.is_verified ? 1 : 0,
      lat: Math.round(r.lat * 1e6) / 1e6, lng: Math.round(r.lng * 1e6) / 1e6,
    }));
}

async function loadEvents(db) {
  const sql = `
    SELECT e.id, e.title, e.start_at, e.end_at, e.location_name, e.city, e.region,
           e.cover_image_url AS cover, e.business_id, e.business_kind,
           COALESCE(e.geo_lat, o.geo_lat, a.geo_lat, r.geo_lat) AS lat,
           COALESCE(e.geo_lng, o.geo_lng, a.geo_lng, r.geo_lng) AS lng,
           COALESCE(o.name, a.name, r.name) AS business_name
    FROM events e
    LEFT JOIN organizations o ON o.id = e.business_id AND e.business_kind = 'organizations'
    LEFT JOIN accommodation a ON a.id = e.business_id AND e.business_kind = 'accommodation'
    LEFT JOIN restaurants r ON r.id = e.business_id AND e.business_kind = 'restaurants'
    WHERE e.status = 'published' AND COALESCE(e.end_at, e.start_at) >= datetime('now')
    ORDER BY e.start_at ASC
    LIMIT 1000`;
  const { results } = await db.prepare(sql).all();
  return (results || [])
    .filter((r) => r.lat != null && r.lng != null && isFinite(r.lat) && isFinite(r.lng))
    .map((r) => ({
      id: r.id, title: r.title, start_at: r.start_at, end_at: r.end_at || '',
      location: r.location_name || '', city: r.city || '', region: r.region || '',
      cover: r.cover || '', business_id: r.business_id, business_kind: r.business_kind,
      business_name: r.business_name || '',
      lat: Math.round(r.lat * 1e6) / 1e6, lng: Math.round(r.lng * 1e6) / 1e6,
    }));
}

mapRoutes.get('/points', async (c) => {
  const out = { organizations: [], accommodation: [], restaurants: [], events: [], generated_at: new Date().toISOString() };
  for (const table of Object.keys(TABLES)) {
    try { out[table] = await loadBusinesses(c.env.DB, table); }
    catch (err) { console.error('map points', table, err); }
  }
  try { out.events = await loadEvents(c.env.DB); }
  catch (err) { console.error('map points events', err); }
  c.header('Cache-Control', 'public, max-age=120');
  return c.json(out);
});
