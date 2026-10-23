// ============================================================
// Mazání dat — společné funkce pro uživatele, adminy a podniky
//
// Cíl: když něco smažeme, smaže se opravdu všechno, co k tomu patří
// (řádky v databázi i soubory v R2), a nezůstanou osobní údaje.
// Každý krok je v try/catch, aby jedna chybějící tabulka (nebo cizí klíč)
// nezastavila zbytek mazání.
// ============================================================

async function run(env, sql, ...binds) {
  try { return await env.DB.prepare(sql).bind(...binds).run(); }
  catch (err) { console.warn('[erase] krok selhal:', sql.slice(0, 80), err.message); return null; }
}
async function all(env, sql, ...binds) {
  try { const { results } = await env.DB.prepare(sql).bind(...binds).all(); return results || []; }
  catch (err) { console.warn('[erase] dotaz selhal:', sql.slice(0, 80), err.message); return []; }
}
function placeholders(n) { return Array(n).fill('?').join(','); }

// Smaže soubory z R2 podle URL (veřejná URL i čistý klíč).
export async function deleteMediaUrls(env, urls) {
  if (!env.MEDIA || !urls || urls.length === 0) return 0;
  const base = env.R2_PUBLIC_BASE || '';
  let n = 0;
  for (const url of new Set(urls.filter(Boolean))) {
    try {
      let key = String(url);
      if (base && key.startsWith(base + '/')) key = key.slice(base.length + 1);
      if (!key || /^https?:\/\//i.test(key)) continue; // cizí URL nemažeme
      await env.MEDIA.delete(key);
      n++;
    } catch (err) { console.warn('[erase] R2 delete selhal:', url, err.message); }
  }
  return n;
}

function jsonUrls(raw) {
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; }
  catch { return []; }
}

// ------------------------------------------------------------
// Komentář + celé vlákno odpovědí (jinak by cizí klíč parent_id mazání shodil)
// ------------------------------------------------------------
export async function deleteCommentTree(env, commentId) {
  const ids = [commentId];
  for (let i = 0; i < ids.length && ids.length < 2000; i++) {
    const kids = await all(env, `SELECT id FROM comments WHERE parent_id = ?`, ids[i]);
    for (const k of kids) if (!ids.includes(k.id)) ids.push(k.id);
  }
  for (const id of ids.reverse()) {
    await run(env, `DELETE FROM moderation_flags WHERE comment_id = ?`, id);
    await run(env, `DELETE FROM comments WHERE id = ?`, id);
  }
  return ids.length;
}

// ------------------------------------------------------------
// Příspěvek: smaže obsah, fotky, lajky, komentáře, hlášení, záložky, zmínky.
// Řádek v `posts` zůstane jako prázdný záznam se stavem 'removed'
// (kvůli cizím klíčům a evidenci moderace), bez textu, fotek a polohy.
// ------------------------------------------------------------
export async function purgePost(env, postId, { dropRow = false } = {}) {
  const post = (await all(env, `SELECT id, image_url FROM posts WHERE id = ?`, postId))[0];
  if (!post) return { ok: false };
  const media = await all(env, `SELECT image_url FROM post_media WHERE post_id = ?`, postId);
  const urls = [post.image_url, ...media.map((m) => m.image_url)];

  const roots = await all(env, `SELECT id FROM comments WHERE post_id = ? AND parent_id IS NULL`, postId);
  for (const r of roots) await deleteCommentTree(env, r.id);
  await run(env, `DELETE FROM comments WHERE post_id = ?`, postId); // zbytek (osiřelé odpovědi)

  await run(env, `DELETE FROM post_media WHERE post_id = ?`, postId);
  await run(env, `DELETE FROM post_hashtags WHERE post_id = ?`, postId);
  await run(env, `DELETE FROM post_likes WHERE post_id = ?`, postId);
  await run(env, `DELETE FROM bookmarks WHERE post_id = ?`, postId);
  await run(env, `DELETE FROM mentions WHERE post_id = ?`, postId);
  await run(env, `DELETE FROM moderation_flags WHERE post_id = ?`, postId);
  if (dropRow) await run(env, `DELETE FROM reports WHERE post_id = ?`, postId);
  else await run(env, `UPDATE reports SET resolved = 1 WHERE post_id = ?`, postId);
  await run(env, `DELETE FROM notifications WHERE entity_type = 'post' AND entity_id = ? AND type != 'moderation_removed'`, postId);

  if (dropRow) {
    await run(env, `DELETE FROM posts WHERE id = ?`, postId);
  } else {
    await run(env,
      `UPDATE posts SET status = 'removed', text_content = '', content_html = NULL, image_url = NULL,
         geo_lat = NULL, geo_lng = NULL, geo_place = NULL WHERE id = ?`, postId);
  }
  const removed = await deleteMediaUrls(env, urls);
  return { ok: true, media: removed };
}

// ------------------------------------------------------------
// Výlet z profilu: řádek, fotky v R2 a upozornění na něj
// ------------------------------------------------------------
export async function purgeTrip(env, tripId) {
  const media = await all(env, `SELECT image_url FROM trip_post_media WHERE trip_id = ?`, tripId);
  await run(env, `DELETE FROM trip_post_media WHERE trip_id = ?`, tripId);
  await run(env, `DELETE FROM notifications WHERE entity_type = 'trip' AND entity_id = ?`, tripId);
  await run(env, `DELETE FROM trip_posts WHERE id = ?`, tripId);
  await deleteMediaUrls(env, media.map((m) => m.image_url));
  return { ok: true };
}

// ------------------------------------------------------------
// Podnik (organizace / ubytování / gastro) se vším, co k němu patří
// ------------------------------------------------------------
export async function deleteBusinessCascade(env, table, id) {
  if (!['organizations', 'accommodation', 'restaurants'].includes(table)) return false;
  const biz = (await all(env, `SELECT * FROM ${table} WHERE id = ?`, id))[0];
  if (!biz) return false;
  const urls = [biz.logo_url, biz.image_url, biz.cover_url];

  const gallery = await all(env, `SELECT image_url FROM business_gallery WHERE business_id = ? AND business_kind = ?`, id, table);
  urls.push(...gallery.map((g) => g.image_url));
  await run(env, `DELETE FROM business_gallery WHERE business_id = ? AND business_kind = ?`, id, table);

  const vr = await all(env, `SELECT doc_url FROM verification_requests WHERE business_id = ? AND business_kind = ?`, id, table);
  urls.push(...vr.map((v) => v.doc_url));
  await run(env, `DELETE FROM verification_requests WHERE business_id = ? AND business_kind = ?`, id, table);

  for (const p of await all(env, `SELECT id FROM posts WHERE business_id = ?`, id)) {
    await purgePost(env, p.id, { dropRow: true });
  }

  for (const s of await all(env, `SELECT id, image_url, media_urls_json FROM stories WHERE business_id = ?`, id)) {
    urls.push(s.image_url, ...jsonUrls(s.media_urls_json));
    await run(env, `DELETE FROM story_views WHERE story_id = ?`, s.id);
    await run(env, `DELETE FROM story_replies WHERE story_id = ?`, s.id);
    await run(env, `DELETE FROM stories WHERE id = ?`, s.id);
  }

  for (const e of await all(env, `SELECT id, cover_image_url, gallery_json FROM events WHERE business_id = ? AND business_kind = ?`, id, table)) {
    urls.push(e.cover_image_url, ...jsonUrls(e.gallery_json));
  }
  await run(env, `DELETE FROM events WHERE business_id = ? AND business_kind = ?`, id, table);

  await run(env, `DELETE FROM reviews WHERE business_id = ? AND business_kind = ?`, id, table);
  await run(env, `DELETE FROM checkins WHERE business_id = ? AND business_kind = ?`, id, table);
  await run(env, `DELETE FROM wishlist WHERE business_id = ? AND business_kind = ?`, id, table);
  await run(env, `DELETE FROM follows WHERE target_type = ? AND target_id = ?`, table, id);
  await run(env, `DELETE FROM follows WHERE target_type = ? AND target_id = ?`, table === 'organizations' ? 'organization' : table === 'restaurants' ? 'gastro' : table, id);

  await run(env, `DELETE FROM ${table} WHERE id = ?`, id);
  await deleteMediaUrls(env, urls);
  return true;
}

// ------------------------------------------------------------
// Úplné vymazání uživatele (GDPR čl. 17).
// Smaže obsah a osobní údaje; řádek v `users` zůstane jako anonymní
// záznam (cizí klíče, účetní evidence příspěvků do projektů, audit log adminů).
// ------------------------------------------------------------
export async function eraseUser(env, userId) {
  const urls = [];
  const u = (await all(env, `SELECT avatar_url, cover_url FROM users WHERE id = ?`, userId))[0];
  if (u) urls.push(u.avatar_url, u.cover_url);

  // 1) podniky, které uživatel vlastní
  for (const table of ['organizations', 'accommodation', 'restaurants']) {
    for (const b of await all(env, `SELECT id FROM ${table} WHERE user_id = ?`, userId)) {
      await deleteBusinessCascade(env, table, b.id);
    }
  }

  // 2) jeho příspěvky
  for (const p of await all(env, `SELECT id FROM posts WHERE user_id = ?`, userId)) {
    await purgePost(env, p.id, { dropRow: true });
  }

  // 2b) jeho výlety (cestovatelský feed)
  for (const tr of await all(env, `SELECT id FROM trip_posts WHERE user_id = ?`, userId)) await purgeTrip(env, tr.id);

  // 3) jeho komentáře (odpovědi jiných lidí se odpojí, ne smažou)
  await run(env, `UPDATE comments SET parent_id = NULL WHERE parent_id IN (SELECT id FROM comments WHERE user_id = ?)`, userId);
  await run(env, `DELETE FROM moderation_flags WHERE user_id = ? OR comment_id IN (SELECT id FROM comments WHERE user_id = ?)`, userId, userId);
  await run(env, `DELETE FROM comments WHERE user_id = ?`, userId);

  // 4) interakce
  await run(env, `DELETE FROM post_likes WHERE user_id = ?`, userId);
  await run(env, `DELETE FROM bookmarks WHERE user_id = ?`, userId);
  await run(env, `DELETE FROM mentions WHERE user_id = ?`, userId);
  await run(env, `DELETE FROM follows WHERE follower_id = ? OR ((target_type = 'users' OR target_type = 'user') AND target_id = ?)`, userId, userId);
  await run(env, `DELETE FROM blocks WHERE blocker_id = ? OR blocked_id = ?`, userId, userId);
  await run(env, `DELETE FROM wishlist WHERE user_id = ?`, userId);
  await run(env, `DELETE FROM map_lists WHERE user_id = ?`, userId);
  await run(env, `DELETE FROM user_badges WHERE user_id = ?`, userId);
  await run(env, `DELETE FROM reviews WHERE user_id = ?`, userId);
  await run(env, `DELETE FROM reports WHERE reporter_id = ?`, userId);
  await run(env, `DELETE FROM user_reports WHERE reporter_id = ? OR target_user_id = ?`, userId, userId);
  await run(env, `DELETE FROM notifications WHERE user_id = ? OR actor_id = ?`, userId, userId);

  for (const c of await all(env, `SELECT image_url FROM checkins WHERE user_id = ?`, userId)) urls.push(c.image_url);
  await run(env, `DELETE FROM checkins WHERE user_id = ?`, userId);

  for (const v of await all(env, `SELECT doc_url FROM verification_requests WHERE user_id = ?`, userId)) urls.push(v.doc_url);
  await run(env, `DELETE FROM verification_requests WHERE user_id = ?`, userId);

  // 5) příběhy
  for (const s of await all(env, `SELECT id, image_url, media_urls_json FROM stories WHERE user_id = ?`, userId)) {
    urls.push(s.image_url, ...jsonUrls(s.media_urls_json));
    await run(env, `DELETE FROM story_views WHERE story_id = ?`, s.id);
    await run(env, `DELETE FROM story_replies WHERE story_id = ?`, s.id);
    await run(env, `DELETE FROM stories WHERE id = ?`, s.id);
  }
  await run(env, `DELETE FROM story_views WHERE viewer_id = ?`, userId);
  await run(env, `DELETE FROM story_replies WHERE user_id = ?`, userId);

  // 6) události
  for (const e of await all(env, `SELECT cover_image_url, gallery_json FROM events WHERE user_id = ?`, userId)) {
    urls.push(e.cover_image_url, ...jsonUrls(e.gallery_json));
  }
  await run(env, `DELETE FROM events WHERE user_id = ?`, userId);

  // 7) skupiny
  for (const g of await all(env, `SELECT id FROM groups WHERE owner_id = ?`, userId)) {
    await run(env, `DELETE FROM group_posts WHERE group_id = ?`, g.id);
    await run(env, `DELETE FROM group_members WHERE group_id = ?`, g.id);
    await run(env, `DELETE FROM groups WHERE id = ?`, g.id);
  }
  await run(env, `DELETE FROM group_posts WHERE user_id = ?`, userId);
  await run(env, `DELETE FROM group_members WHERE user_id = ?`, userId);

  // 8) soukromé zprávy (celé konverzace s tímto účtem)
  for (const t of await all(env, `SELECT id FROM dm_threads WHERE user_a = ? OR user_b = ?`, userId, userId)) {
    for (const m of await all(env, `SELECT image_url FROM dm_messages WHERE thread_id = ?`, t.id)) urls.push(m.image_url);
    await run(env, `DELETE FROM dm_messages WHERE thread_id = ?`, t.id);
    await run(env, `DELETE FROM dm_threads WHERE id = ?`, t.id);
  }

  // 9) přihlašovací a bezpečnostní data
  await run(env, `DELETE FROM push_subscriptions WHERE user_id = ?`, userId);
  await run(env, `DELETE FROM email_verifications WHERE user_id = ?`, userId);
  await run(env, `DELETE FROM password_resets WHERE user_id = ?`, userId);
  await run(env, `DELETE FROM twofa_sessions WHERE user_id = ?`, userId);
  await run(env, `DELETE FROM login_logs WHERE user_id = ?`, userId);

  // 10) anonymizace samotného účtu (nic osobního nezůstane)
  const now = new Date().toISOString();
  await run(env,
    `UPDATE users SET deleted_at = ?, status = 'deleted', email = ?, display_name = 'Smazaný účet', handle = NULL,
       bio = NULL, avatar_url = NULL, cover_url = NULL, location = NULL, website = NULL, phone = NULL,
       geo_lat = NULL, geo_lng = NULL, geo_city = NULL, google_id = NULL, auth_provider = 'password',
       password_hash = 'deleted', password_salt = 'deleted', totp_secret = NULL, totp_enabled = 0,
       recovery_codes_json = NULL, settings_json = NULL, last_login_ip = NULL, email_verified = 0
     WHERE id = ?`,
    now, `deleted+${userId}@vandro.local`, userId);

  await deleteMediaUrls(env, urls);
  return { ok: true };
}
