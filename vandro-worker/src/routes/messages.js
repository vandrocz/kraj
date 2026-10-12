import { Hono } from 'hono';
import { newId } from '../auth.js';
import { checkText } from '../moderation.js';
import { rateLimit } from '../ratelimit.js';
import { sendPushToUser } from '../push.js';

export const messagesRoutes = new Hono();

// ------------------------------------------------------------
// PRAVIDLA SOUKROMÝCH ZPRÁV (vynucuje server, klient je jen kontroluje předem)
//  - běžný uživatel (role 'user') NEMŮŽE psát jinému běžnému uživateli
//  - běžný uživatel MŮŽE napsat organizaci / ubytování / gastro (majitel = role organization/hotelier) nebo adminovi
//  - organizace/hotelier/admin může psát komukoli, kdo není zablokovaný
// ------------------------------------------------------------
const BUSINESS_ROLES = ['organization', 'hotelier', 'admin'];
const KIND_TO_TABLE = {
  organization: 'organizations', organizations: 'organizations',
  accommodation: 'accommodation',
  gastro: 'restaurants', restaurant: 'restaurants', restaurants: 'restaurants',
};

function threadPairKey(a, b) { return a < b ? [a, b] : [b, a]; }

async function getUser(env, id) {
  return env.DB.prepare(
    `SELECT id, display_name, avatar_url, role, status, email_verified, deleted_at FROM users WHERE id = ?`,
  ).bind(id).first();
}

function isActive(u) { return !!u && !u.deleted_at && (u.status || 'active') === 'active'; }


// Označení podniku platí jen pro toho, kdo podnik kontaktuje (zákazník vidí název podniku,
// majitel podniku vidí jméno zákazníka).
const BIZ_TABLES = ['organizations', 'accommodation', 'restaurants'];
async function describeOther(env, thread, other) {
  if (!other) return null;
  let isBusiness = ['organization', 'hotelier'].includes(other.role);
  let businessName = null;
  if (thread.business_id && BIZ_TABLES.includes(thread.business_kind)) {
    const biz = await env.DB.prepare(`SELECT user_id, name FROM ${thread.business_kind} WHERE id = ?`).bind(thread.business_id).first();
    if (biz && biz.user_id === other.id) { isBusiness = true; businessName = biz.name || thread.business_name || null; }
    else if (biz) { isBusiness = false; }
  }
  return { ...other, is_business: isBusiness, business_name: businessName };
}

function roleAllowsDm(senderRole, targetRole) {
  if (senderRole === 'user' && targetRole === 'user') return false;
  return true;
}

async function isBlocked(env, a, b) {
  const row = await env.DB.prepare(
    `SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`,
  ).bind(a, b, b, a).first();
  return !!row;
}

// Společná část pro /start a /start-business. Vrací { thread_id, existing } nebo { error, status }.
async function findOrCreateThread(env, me, other, business) {
  const [a, b] = threadPairKey(me.id, other.id);
  const existing = await env.DB.prepare(`SELECT id FROM dm_threads WHERE user_a = ? AND user_b = ?`).bind(a, b).first();
  if (existing) {
    if (business) {
      await env.DB.prepare(
        `UPDATE dm_threads SET business_kind = ?, business_id = ?, business_name = ? WHERE id = ?`,
      ).bind(business.table, business.id, business.name, existing.id).run();
    }
    return { thread_id: existing.id, existing: true };
  }
  const id = newId('thr');
  await env.DB.prepare(
    `INSERT INTO dm_threads (id, user_a, user_b, business_kind, business_id, business_name) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, a, b, business?.table || null, business?.id || null, business?.name || null).run();
  return { thread_id: id, existing: false };
}

async function guardStart(c, me, other) {
  if (!isActive(me)) return { error: 'Účet není aktivní.', status: 403 };
  if (!isActive(other)) return { error: 'Tento uživatel už neexistuje.', status: 404 };
  if (other.id === me.id) return { error: 'Nemůžeš psát sám sobě.', status: 400 };
  if (!roleAllowsDm(me.role, other.role)) {
    return { error: 'Běžní uživatelé si mezi sebou nemohou psát soukromé zprávy. Kontaktovat lze pouze organizace.', status: 403 };
  }
  if (await isBlocked(c.env, me.id, other.id)) return { error: 'Nelze zahájit konverzaci.', status: 403 };
  if (me.role === 'user' && !me.email_verified) {
    return { error: 'Pro psaní zpráv musíš nejprve ověřit e-mail.', status: 403 };
  }
  const rl = await rateLimit(c.env, 'dm_start', me.id, 30, 3600);
  if (!rl.ok) return { error: 'Příliš mnoho nových konverzací. Zkus to později.', status: 429 };
  return null;
}

// ------------------------------------------------------------
// Seznam konverzací
// ------------------------------------------------------------
messagesRoutes.get('/threads', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT dm_threads.*,
      CASE WHEN user_a = ? THEN user_b ELSE user_a END AS other_id
     FROM dm_threads
     WHERE user_a = ? OR user_b = ?
     ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT 100`,
  ).bind(user.sub, user.sub, user.sub).all();

  const withUsers = await Promise.all(results.map(async (t) => {
    const other = await c.env.DB.prepare(
      `SELECT id, display_name, avatar_url, role FROM users WHERE id = ? AND deleted_at IS NULL`,
    ).bind(t.other_id).first();
    const unread = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM dm_messages WHERE thread_id = ? AND sender_id != ? AND read_at IS NULL`,
    ).bind(t.id, user.sub).first();
    return {
      ...t,
      other: await describeOther(c.env, t, other),
      unread: unread?.n || 0,
    };
  }));

  c.header('Cache-Control', 'no-store');
  return c.json({ threads: withUsers.filter((t) => t.other) });
});

messagesRoutes.get('/unread-count', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM dm_messages m JOIN dm_threads t ON t.id = m.thread_id
     WHERE (t.user_a = ? OR t.user_b = ?) AND m.sender_id != ? AND m.read_at IS NULL`,
  ).bind(user.sub, user.sub, user.sub).first();
  c.header('Cache-Control', 'no-store');
  return c.json({ unread: row?.n || 0 });
});

// ------------------------------------------------------------
// Zahájení konverzace s uživatelem
// ------------------------------------------------------------
messagesRoutes.post('/start', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const otherId = (body.user_id || '').toString();
  if (!otherId) return c.json({ error: 'Neplatný uživatel.' }, 400);

  const [me, other] = await Promise.all([getUser(c.env, user.sub), getUser(c.env, otherId)]);
  const err = await guardStart(c, me, other);
  if (err) return c.json({ error: err.error }, err.status);

  const res = await findOrCreateThread(c.env, me, other, null);
  return c.json(res, res.existing ? 200 : 201);
});

// ------------------------------------------------------------
// Zahájení konverzace s podnikem (organizace, ubytování, gastro)
// Zprávu dostane majitel podniku (uživatel, který podnik spravuje).
// ------------------------------------------------------------
messagesRoutes.post('/start-business', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const table = KIND_TO_TABLE[(body.business_kind || '').toString()];
  const businessId = (body.business_id || '').toString();
  if (!table || !businessId) return c.json({ error: 'Neplatný podnik.' }, 400);

  const biz = await c.env.DB.prepare(`SELECT id, user_id, name FROM ${table} WHERE id = ?`).bind(businessId).first();
  if (!biz || !biz.user_id) return c.json({ error: 'Podnik nebyl nalezen.' }, 404);

  const [me, owner] = await Promise.all([getUser(c.env, user.sub), getUser(c.env, biz.user_id)]);
  // Majitel podniku může mít v DB roli 'user' — kontakt podniku je ale vždy povolený
  const err = await guardStart(c, me, owner ? { ...owner, role: owner.role === 'user' ? 'organization' : owner.role } : owner);
  if (err) return c.json({ error: err.error }, err.status);

  const res = await findOrCreateThread(c.env, me, owner, { table, id: biz.id, name: String(biz.name || '').slice(0, 120) });
  return c.json(res, res.existing ? 200 : 201);
});

// ------------------------------------------------------------
// Detail konverzace
// ------------------------------------------------------------
messagesRoutes.get('/thread/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const thread = await c.env.DB.prepare(`SELECT * FROM dm_threads WHERE id = ?`).bind(id).first();
  if (!thread) return c.json({ error: 'Nenalezeno.' }, 404);
  if (thread.user_a !== user.sub && thread.user_b !== user.sub) return c.json({ error: 'Nemáš oprávnění.' }, 403);

  const otherId = thread.user_a === user.sub ? thread.user_b : thread.user_a;
  const other = await c.env.DB.prepare(`SELECT id, display_name, avatar_url, role FROM users WHERE id = ? AND deleted_at IS NULL`).bind(otherId).first();
  const { results } = await c.env.DB.prepare(
    `SELECT id, sender_id, text, image_url, read_at, created_at FROM dm_messages
     WHERE thread_id = ? ORDER BY created_at ASC LIMIT 200`,
  ).bind(id).all();

  await c.env.DB.prepare(
    `UPDATE dm_messages SET read_at = datetime('now') WHERE thread_id = ? AND sender_id != ? AND read_at IS NULL`,
  ).bind(id, user.sub).run();

  c.header('Cache-Control', 'no-store');
  return c.json({
    thread,
    other: await describeOther(c.env, thread, other),
    messages: results,
  });
});

// ------------------------------------------------------------
// Odeslání zprávy (+ notifikace a push)
// ------------------------------------------------------------
messagesRoutes.post('/thread/:id/send', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const thread = await c.env.DB.prepare(`SELECT * FROM dm_threads WHERE id = ?`).bind(id).first();
  if (!thread) return c.json({ error: 'Nenalezeno.' }, 404);
  if (thread.user_a !== user.sub && thread.user_b !== user.sub) return c.json({ error: 'Nemáš oprávnění.' }, 403);

  const otherId = thread.user_a === user.sub ? thread.user_b : thread.user_a;
  const [me, other] = await Promise.all([getUser(c.env, user.sub), getUser(c.env, otherId)]);
  if (!isActive(me)) return c.json({ error: 'Účet není aktivní.' }, 403);
  if (!isActive(other)) return c.json({ error: 'Tento uživatel už neexistuje.' }, 404);
  if (await isBlocked(c.env, user.sub, otherId)) return c.json({ error: 'Nelze odeslat zprávu.' }, 403);
  // starší konverzace user↔user (pokud nějaké vznikly) se také zastaví, a to i při obchodním kontaktu přes podnik
  if (!thread.business_id && !roleAllowsDm(me.role, other.role)) {
    return c.json({ error: 'Běžní uživatelé si mezi sebou nemohou psát soukromé zprávy.' }, 403);
  }

  const rl = await rateLimit(c.env, 'dm', user.sub, 200, 3600);
  if (!rl.ok) return c.json({ error: 'Příliš mnoho zpráv.' }, 429);

  const body = await c.req.json().catch(() => ({}));
  const text = (body.text || '').toString().trim().slice(0, 2000);
  if (!text) return c.json({ error: 'Prázdná zpráva.' }, 400);

  const mod = checkText(text);
  if (!mod.clean && mod.severity >= 2) return c.json({ error: 'Text obsahuje zakázaný obsah.' }, 400);

  const msgId = newId('dm');
  await c.env.DB.prepare(
    `INSERT INTO dm_messages (id, thread_id, sender_id, text) VALUES (?, ?, ?, ?)`,
  ).bind(msgId, id, user.sub, text).run();

  await c.env.DB.prepare(
    `UPDATE dm_threads SET last_message_at = datetime('now'), last_message_preview = ? WHERE id = ?`,
  ).bind(text.slice(0, 100), id).run();

  try {
    const actorName = me.display_name || 'Někdo';
    const preview = text.length > 80 ? text.slice(0, 77) + '…' : text;

    await c.env.DB.prepare(
      `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, text)
       VALUES (?, ?, 'dm', ?, 'thread', ?, 'ti poslal(a) zprávu')`,
    ).bind(newId('notif'), otherId, user.sub, id).run();

    await sendPushToUser(c.env, otherId, {
      title: actorName,
      body: preview,
      url: `/?thread=${id}`,
      tag: `dm-${id}`,
    });
  } catch (err) { console.warn('[dm] notif/push selhal:', err.message); }

  return c.json({ id: msgId, text, created_at: new Date().toISOString() }, 201);
});
