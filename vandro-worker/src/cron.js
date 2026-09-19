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
// R2 CLEANUP — maže osirelé obrázky z R2 (tie, ktoré nie sú v DB)
// Bezpečný 30-dňový buffer: čo bolo nahrané pred menej ako 30 dňami, sa nechá.
// ============================================================

export async function cleanupOrphanedR2(env) {
  if (!env.MEDIA) return { skipped: true, reason: 'no_media_binding' };

  const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const results = { scanned: 0, orphaned: 0, deleted: 0, errors: 0 };

  try {
    // Načítaj všetky použité URL z DB
    const usedUrls = new Set();
    const queries = [
      'SELECT image_url AS u FROM posts WHERE image_url IS NOT NULL',
      'SELECT image_url AS u FROM post_media',
      'SELECT logo_url AS u FROM organizations WHERE logo_url IS NOT NULL',
      'SELECT image_url AS u FROM accommodation WHERE image_url IS NOT NULL',
      'SELECT image_url AS u FROM restaurants WHERE image_url IS NOT NULL',
      'SELECT avatar_url AS u FROM users WHERE avatar_url IS NOT NULL',
      'SELECT cover_url AS u FROM users WHERE cover_url IS NOT NULL',
      'SELECT cover_url AS u FROM organizations WHERE cover_url IS NOT NULL',
      'SELECT cover_url AS u FROM accommodation WHERE cover_url IS NOT NULL',
      'SELECT cover_url AS u FROM restaurants WHERE cover_url IS NOT NULL',
      'SELECT cover_image_url AS u FROM events WHERE cover_image_url IS NOT NULL',
      'SELECT image_url AS u FROM stories',
    ];
    for (const q of queries) {
      try {
        const { results: rs } = await env.DB.prepare(q).all();
        for (const r of rs) if (r.u) usedUrls.add(r.u);
      } catch (e) { /* tabuľka nemusí existovať */ }
    }

    // Parsuj URL → vytvor set kľúčov v R2 (posts/xxx.jpg, profile/yyy.jpg, atď.)
    const usedKeys = new Set();
    const publicBase = env.R2_PUBLIC_BASE || '';
    for (const url of usedUrls) {
      if (publicBase && url.startsWith(publicBase + '/')) {
        usedKeys.add(url.slice(publicBase.length + 1));
      } else if (!url.startsWith('http')) {
        usedKeys.add(url);
      }
    }

    // Listuj R2 (prefix-based). Cloudflare R2 list vracia max 1000 kľúčov na volanie.
    const prefixes = ['posts/', 'profile/', 'stories/', 'events/', 'debug/'];
    for (const prefix of prefixes) {
      let cursor = undefined;
      do {
        const list = await env.MEDIA.list({ prefix, cursor, limit: 1000 });
        for (const obj of list.objects) {
          results.scanned++;
          if (obj.uploaded && new Date(obj.uploaded).getTime() > cutoffMs) continue;
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
