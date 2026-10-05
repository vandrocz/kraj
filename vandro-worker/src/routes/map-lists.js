import { Hono } from 'hono';

// Osobní seznamy míst z mapy (záložky). Každý uživatel má jeden záznam
// s celým JSON dokumentem { lists: [...] }. Synchronizace funguje přes
// "updated_at" (revize): klient posílá revizi, ze které vycházel, a pokud mezitím
// někdo jiný zapsal novější verzi, server vrátí 409 a aktuální data ke sloučení.
export const mapListsRoutes = new Hono();

const MAX_BYTES = 400000;     // limit velikosti jednoho dokumentu
const MAX_LISTS = 100;
const MAX_ITEMS_PER_LIST = 3000;

function sanitizeDoc(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.lists)) return null;
  if (input.lists.length > MAX_LISTS) return null;
  const lists = [];
  for (const l of input.lists) {
    if (!l || typeof l !== 'object') return null;
    if (!Array.isArray(l.items) || l.items.length > MAX_ITEMS_PER_LIST) return null;
    const items = [];
    for (const it of l.items) {
      if (!it || typeof it !== 'object') continue;
      const lat = Number(it.lat), lng = Number(it.lng);
      if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      items.push({ ...it, lat, lng });
    }
    lists.push({
      ...l,
      id: String(l.id || '').slice(0, 80) || ('list_' + Date.now()),
      name: String(l.name || 'Seznam').slice(0, 120),
      visibleOnMap: l.visibleOnMap !== false,
      items,
    });
  }
  return { lists };
}

mapListsRoutes.get('/me', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(
    `SELECT data, updated_at FROM map_lists WHERE user_id = ?`,
  ).bind(user.sub).first();
  if (!row) return c.json({ data: null, updated_at: 0 });
  let data = null;
  try { data = JSON.parse(row.data); } catch { data = null; }
  c.header('Cache-Control', 'no-store');
  return c.json({ data, updated_at: row.updated_at });
});

mapListsRoutes.put('/me', async (c) => {
  const user = c.get('user');
  const raw = await c.req.text();
  if (raw.length > MAX_BYTES * 2) return c.json({ error: 'Seznamy jsou příliš velké.' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return c.json({ error: 'Neplatná data.' }, 400); }

  const doc = sanitizeDoc(body.data);
  if (!doc) return c.json({ error: 'Neplatná struktura seznamů.' }, 400);
  const json = JSON.stringify(doc);
  if (json.length > MAX_BYTES) return c.json({ error: 'Seznamy jsou příliš velké.' }, 413);

  const base = Number(body.base_updated_at) || 0;
  const force = body.force === true;
  const existing = await c.env.DB.prepare(
    `SELECT data, updated_at FROM map_lists WHERE user_id = ?`,
  ).bind(user.sub).first();

  if (existing && !force && Number(existing.updated_at) !== base) {
    let current = null;
    try { current = JSON.parse(existing.data); } catch { current = null; }
    return c.json({ error: 'Konflikt verzí.', conflict: true, data: current, updated_at: existing.updated_at }, 409);
  }

  // revize musí být vždy větší než předchozí, i když by dvě uložení spadla do stejné milisekundy
  const now = Math.max(Date.now(), existing ? Number(existing.updated_at) + 1 : 0);
  await c.env.DB.prepare(
    `INSERT INTO map_lists (user_id, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).bind(user.sub, json, now).run();
  return c.json({ ok: true, updated_at: now });
});
