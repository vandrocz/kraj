import { newId } from './auth.js';

const PROTECTION_MS = 30 * 60 * 1000;
const SUCCESS_DISPLAY_MS = 30 * 60 * 1000;

export async function ensureActiveProjectRotation(env) {
  const now = Date.now();
  const active = await env.DB.prepare(
    `SELECT * FROM projects WHERE status = 'active' ORDER BY activated_at DESC LIMIT 1`,
  ).first();

  if (active) {
    if (!active.completed_at && active.current_amount >= active.target_amount) {
      await env.DB.prepare(`UPDATE projects SET status = 'completed', completed_at = datetime('now') WHERE id = ?`).bind(active.id).run();
      return;
    }
    if (active.completed_at) {
      const completedAtMs = new Date(active.completed_at + 'Z').getTime();
      if (now - completedAtMs >= SUCCESS_DISPLAY_MS) await promoteNextWaitingProject(env);
      return;
    }
    return;
  }
  await promoteNextWaitingProject(env);
}

async function promoteNextWaitingProject(env) {
  const waiting = await env.DB.prepare(`SELECT id FROM projects WHERE status = 'waiting'`).all();
  if (waiting.results.length === 0) return null;
  const withLikes = await Promise.all(waiting.results.map(async (p) => {
    const raw = await env.NASKRAJ_LAJKY.get(`likecount:${p.id}`);
    return { id: p.id, likes: raw ? parseInt(raw, 10) : 0 };
  }));
  withLikes.sort((a, b) => b.likes - a.likes);
  const winner = withLikes[0];
  await env.DB.prepare(`UPDATE projects SET status = 'active', activated_at = datetime('now'), completed_at = NULL WHERE id = ?`).bind(winner.id).run();
  return winner.id;
}

function isOutOfProtection(project) {
  if (!project.activated_at) return false;
  const activatedMs = new Date(project.activated_at + 'Z').getTime();
  return Date.now() - activatedMs >= PROTECTION_MS;
}

export async function runDailyDistribution(env) {
  const today = new Date().toISOString().slice(0, 10);
  const existingRun = await env.DB.prepare('SELECT id FROM daily_distributions WHERE run_date = ?').bind(today).first();
  if (existingRun) return { skipped: true, reason: 'Dnešné prerozdelenie už prebehlo.', run_date: today };

  const eligible = await env.DB.prepare(`SELECT id FROM users WHERE status = 'active' AND credit_balance > 0`).all();
  const chargedUserIds = eligible.results.map((r) => r.id);
  const usersCharged = chargedUserIds.length;
  const totalCollected = usersCharged;

  if (usersCharged > 0) {
    await env.DB.prepare(`UPDATE users SET credit_balance = credit_balance - 1 WHERE status = 'active' AND credit_balance > 0`).run();
  }

  let fundedProjectId = null, overflowProjectId = null, overflowAmount = 0;

  if (totalCollected > 0) {
    await ensureActiveProjectRotation(env);
    const active = await env.DB.prepare(`SELECT * FROM projects WHERE status = 'active' ORDER BY activated_at DESC LIMIT 1`).first();
    let remaining = totalCollected;

    if (active && isOutOfProtection(active)) {
      const needed = active.target_amount - active.current_amount;
      const toApply = Math.min(remaining, Math.max(needed, 0));
      if (toApply > 0) {
        await env.DB.prepare(`UPDATE projects SET current_amount = current_amount + ? WHERE id = ?`).bind(toApply, active.id).run();
        fundedProjectId = active.id;
        remaining -= toApply;
      }
    }

    if (remaining > 0) {
      const waiting = await env.DB.prepare(`SELECT id FROM projects WHERE status = 'waiting'`).all();
      if (waiting.results.length > 0) {
        const withLikes = await Promise.all(waiting.results.map(async (p) => {
          const raw = await env.NASKRAJ_LAJKY.get(`likecount:${p.id}`);
          return { id: p.id, likes: raw ? parseInt(raw, 10) : 0 };
        }));
        withLikes.sort((a, b) => b.likes - a.likes);
        const target = withLikes[0];
        await env.DB.prepare(`UPDATE projects SET current_amount = current_amount + ? WHERE id = ?`).bind(remaining, target.id).run();
        overflowProjectId = target.id;
        overflowAmount = remaining;
      }
    }

    const primaryProject = fundedProjectId || overflowProjectId;
    if (primaryProject && chargedUserIds.length > 0) {
      const stmt = env.DB.prepare(`INSERT INTO contributions (id, user_id, project_id, amount) VALUES (?, ?, ?, 1)`);
      await env.DB.batch(chargedUserIds.map((uid) => stmt.bind(newId('contrib'), uid, primaryProject)));
    }
  }

  await ensureActiveProjectRotation(env);

  await env.DB.prepare(
    `INSERT INTO daily_distributions (id, run_date, total_collected, users_charged, funded_project_id, overflow_project_id, overflow_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(newId('dist'), today, totalCollected, usersCharged, fundedProjectId, overflowProjectId, overflowAmount).run();

  return { run_date: today, total_collected: totalCollected, users_charged: usersCharged, fundedProjectId, overflowProjectId, overflowAmount };
}

// ============================================================
// STORY CLEANUP — maže expirované stories z DB AJ z R2
// Volané: pri GET /api/stories/feed + cron každých 6 hodín
// ============================================================
export async function deleteExpiredStories(env) {
  if (!env.DB) return { deleted: 0 };
  const result = { deleted: 0, files_deleted: 0, files_failed: 0 };

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, image_url, media_urls_json FROM stories WHERE expires_at < datetime('now')`,
    ).all();

    if (!results || results.length === 0) return result;

    const publicBase = env.R2_PUBLIC_BASE || '';

    for (const s of results) {
      const urls = [];
      if (s.image_url) urls.push(s.image_url);
      if (s.media_urls_json) {
        try {
          const parsed = JSON.parse(s.media_urls_json);
          if (Array.isArray(parsed)) urls.push(...parsed);
        } catch {}
      }

      // Zmazať každý súbor z R2
      if (env.MEDIA) {
        for (const url of urls) {
          if (!url) continue;
          try {
            let key = url;
            if (publicBase && url.startsWith(publicBase + '/')) {
              key = url.slice(publicBase.length + 1);
            }
            if (key && !key.startsWith('http')) {
              await env.MEDIA.delete(key);
              result.files_deleted++;
            }
          } catch (err) {
            result.files_failed++;
            console.warn('[stories cleanup] R2 delete failed for', url, err.message);
          }
        }
      }
    }

    // Zmazať z DB
    await env.DB.prepare(`DELETE FROM stories WHERE expires_at < datetime('now')`).run();
    result.deleted = results.length;

    console.log(`[stories cleanup] deleted ${result.deleted} stories, ${result.files_deleted} files`);
  } catch (err) {
    console.error('deleteExpiredStories zlyhal:', err);
    result.error = err.message;
  }

  return result;
}

// ============================================================
// R2 CLEANUP — maže osirelé obrázky z R2 (tie, ktoré nie sú v DB)
// - 30-dňový buffer pre posts/, profile/, events/, debug/
// - 1-dňový buffer pre stories/ (fallback pre zlyhané uploady)
// ============================================================

export async function cleanupOrphanedR2(env) {
  if (!env.MEDIA) return { skipped: true, reason: 'no_media_binding' };

  const DAY_MS = 24 * 60 * 60 * 1000;
  const cutoffPostsMs = Date.now() - 30 * DAY_MS;   // 30 dní
  const cutoffStoriesMs = Date.now() - 1 * DAY_MS;  // 1 deň (fallback pre siroty)

  const results = { scanned: 0, orphaned: 0, deleted: 0, errors: 0 };

  try {
    // Načítaj všetky použité URL z DB
    const usedUrls = new Set();
    const queries = [
      // IBA published posts (removed/hidden_by_reports sa nemajú blokovať mazanie)
      `SELECT image_url AS u FROM posts WHERE image_url IS NOT NULL AND status = 'published'`,
      `SELECT pm.image_url AS u FROM post_media pm
       JOIN posts p ON p.id = pm.post_id
       WHERE p.status = 'published'`,
      // Business logá / obrázky
      `SELECT logo_url AS u FROM organizations WHERE logo_url IS NOT NULL`,
      `SELECT image_url AS u FROM accommodation WHERE image_url IS NOT NULL`,
      `SELECT image_url AS u FROM restaurants WHERE image_url IS NOT NULL`,
      // Používatelia — iba aktívni (nie deleted)
      `SELECT avatar_url AS u FROM users WHERE avatar_url IS NOT NULL AND deleted_at IS NULL`,
      `SELECT cover_url AS u FROM users WHERE cover_url IS NOT NULL AND deleted_at IS NULL`,
      // Cover obrázky podnikov
      `SELECT cover_url AS u FROM organizations WHERE cover_url IS NOT NULL`,
      `SELECT cover_url AS u FROM accommodation WHERE cover_url IS NOT NULL`,
      `SELECT cover_url AS u FROM restaurants WHERE cover_url IS NOT NULL`,
      // Events — iba published
      `SELECT cover_image_url AS u FROM events WHERE cover_image_url IS NOT NULL AND status = 'published'`,
      // Stories NIE — tie rieši deleteExpiredStories samostatne
    ];

    for (const q of queries) {
      try {
        const { results: rs } = await env.DB.prepare(q).all();
        for (const r of rs) if (r.u) usedUrls.add(r.u);
      } catch (e) { /* tabuľka nemusí existovať */ }
    }

    // Parsuj URL → vytvor set kľúčov v R2
    const usedKeys = new Set();
    const publicBase = env.R2_PUBLIC_BASE || '';
    for (const url of usedUrls) {
      if (publicBase && url.startsWith(publicBase + '/')) {
        usedKeys.add(url.slice(publicBase.length + 1));
      } else if (!url.startsWith('http')) {
        usedKeys.add(url);
      }
    }

    // Listuj R2 podľa prefixov
    const prefixes = [
      { prefix: 'posts/', cutoff: cutoffPostsMs },
      { prefix: 'profile/', cutoff: cutoffPostsMs },
      { prefix: 'events/', cutoff: cutoffPostsMs },
      { prefix: 'debug/', cutoff: cutoffPostsMs },
      { prefix: 'stories/', cutoff: cutoffStoriesMs }, // 1 deň (siroty po zlyhanom upload)
    ];

    for (const { prefix, cutoff } of prefixes) {
      let cursor = undefined;
      do {
        const list = await env.MEDIA.list({ prefix, cursor, limit: 1000 });
        for (const obj of list.objects) {
          results.scanned++;
          // Preskoč čerstvé súbory
          if (obj.uploaded && new Date(obj.uploaded).getTime() > cutoff) continue;
          // Vymaž iba ak nie je v DB
          if (!usedKeys.has(obj.key)) {
            results.orphaned++;
            try {
              await env.MEDIA.delete(obj.key);
              results.deleted++;
            } catch (err) {
              results.errors++;
            }
          }
        }
        cursor = list.truncated ? list.cursor : undefined;
      } while (cursor);
    }
  } catch (err) {
    console.error('cleanupOrphanedR2 zlyhal:', err);
    return { error: err.message, ...results };
  }

  return results;
}
