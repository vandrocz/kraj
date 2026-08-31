import { newId } from './auth.js';

const PROTECTION_MS = 30 * 60 * 1000; // 30 minút ochranná lehota po aktivácii
const SUCCESS_DISPLAY_MS = 30 * 60 * 1000; // 30 minút zobrazenia "Splněno / Úspěch"

/**
 * Zabezpečí, že práve jeden projekt je 'active' na vrchu feedu, a rieši prechody:
 *  - waiting -> active   (keď nie je žiadny aktívny/kompletný v grace období)
 *  - active -> completed (keď current_amount >= target_amount)
 *  - completed -> (rotácia na ďalší waiting podľa lajkov, po uplynutí 30 min)
 *
 * Volá sa jednak z minútového cronu, jednak defenzívne pri každom GET /api/feed/collections,
 * takže front-end vidí vždy aktuálny stav aj keby cron trochu meškal.
 */
export async function ensureActiveProjectRotation(env) {
  const now = Date.now();

  const active = await env.DB.prepare(
    `SELECT * FROM projects WHERE status = 'active' ORDER BY activated_at DESC LIMIT 1`,
  ).first();

  if (active) {
    // Prípad 1: aktívny projekt práve dosiahol cieľ -> presunúť do 'completed'
    if (!active.completed_at && active.current_amount >= active.target_amount) {
      await env.DB.prepare(
        `UPDATE projects SET status = 'completed', completed_at = datetime('now') WHERE id = ?`,
      ).bind(active.id).run();
      return; // ďalší krok (prípadná rotácia) rieši nasledujúce zavolanie tejto funkcie
    }

    // Prípad 2: je 'completed' a uplynulo 30 min grace -> rotovať na ďalší v poradí
    if (active.completed_at) {
      const completedAtMs = new Date(active.completed_at + 'Z').getTime();
      if (now - completedAtMs >= SUCCESS_DISPLAY_MS) {
        await promoteNextWaitingProject(env);
      }
      return;
    }

    // Prípad 3: stále beží (waiting na peniaze alebo v ochrannej lehote) — nič nerobíme
    return;
  }

  // Žiadny aktívny projekt vôbec neexistuje -> hneď povýšiť najlajkovanejší čakajúci
  await promoteNextWaitingProject(env);
}

async function promoteNextWaitingProject(env) {
  const waiting = await env.DB.prepare(
    `SELECT id FROM projects WHERE status = 'waiting'`,
  ).all();
  if (waiting.results.length === 0) return null;

  const withLikes = await Promise.all(
    waiting.results.map(async (p) => {
      const raw = await env.NASKRAJ_LAJKY.get(`likecount:${p.id}`);
      return { id: p.id, likes: raw ? parseInt(raw, 10) : 0 };
    }),
  );
  withLikes.sort((a, b) => b.likes - a.likes);
  const winner = withLikes[0];

  await env.DB.prepare(
    `UPDATE projects SET status = 'active', activated_at = datetime('now'), completed_at = NULL WHERE id = ?`,
  ).bind(winner.id).run();

  return winner.id;
}

/** Je projekt mimo 30-minútovej ochrannej lehoty, teda smie prijímať peniaze? */
function isOutOfProtection(project) {
  if (!project.activated_at) return false;
  const activatedMs = new Date(project.activated_at + 'Z').getTime();
  return Date.now() - activatedMs >= PROTECTION_MS;
}

/**
 * Denná úloha o 8:00:
 * 1. Odpočíta 1 Kč každému aktívnemu užívateľovi s kreditom > 0.
 * 2. Ak je aktuálne aktívny projekt mimo ochrannej lehoty, prisype mu vyzbieranú sumu (max do cieľa).
 * 3. Prípadný prebytok (keď suma presiahne to, čo projekt ešte potrebuje) sa pripíše
 *    najlajkovanejšiemu čakajúcemu projektu (nezmení jeho status, len current_amount).
 * 4. Zapíše sa audit záznam + jednotlivé príspevky darcov do `contributions` (pre "projekty, ktorým pomohol").
 * 5. Odošle push notifikáciu cez OneSignal.
 */
export async function runDailyDistribution(env) {
  const today = new Date().toISOString().slice(0, 10);

  const existingRun = await env.DB.prepare('SELECT id FROM daily_distributions WHERE run_date = ?')
    .bind(today)
    .first();
  if (existingRun) {
    return { skipped: true, reason: 'Dnešné prerozdelenie už prebehlo.', run_date: today };
  }

  const eligible = await env.DB.prepare(
    `SELECT id FROM users WHERE status = 'active' AND credit_balance > 0`,
  ).all();
  const chargedUserIds = eligible.results.map((r) => r.id);
  const usersCharged = chargedUserIds.length;
  const totalCollected = usersCharged;

  if (usersCharged > 0) {
    await env.DB.prepare(
      `UPDATE users SET credit_balance = credit_balance - 1 WHERE status = 'active' AND credit_balance > 0`,
    ).run();
  }

  let fundedProjectId = null;
  let overflowProjectId = null;
  let overflowAmount = 0;

  if (totalCollected > 0) {
    await ensureActiveProjectRotation(env);
    const active = await env.DB.prepare(
      `SELECT * FROM projects WHERE status = 'active' ORDER BY activated_at DESC LIMIT 1`,
    ).first();

    let remaining = totalCollected;

    if (active && isOutOfProtection(active)) {
      const needed = active.target_amount - active.current_amount;
      const toApply = Math.min(remaining, Math.max(needed, 0));
      if (toApply > 0) {
        await env.DB.prepare(
          `UPDATE projects SET current_amount = current_amount + ? WHERE id = ?`,
        ).bind(toApply, active.id).run();
        fundedProjectId = active.id;
        remaining -= toApply;
      }
    }

    if (remaining > 0) {
      const waiting = await env.DB.prepare(`SELECT id FROM projects WHERE status = 'waiting'`).all();
      if (waiting.results.length > 0) {
        const withLikes = await Promise.all(
          waiting.results.map(async (p) => {
            const raw = await env.NASKRAJ_LAJKY.get(`likecount:${p.id}`);
            return { id: p.id, likes: raw ? parseInt(raw, 10) : 0 };
          }),
        );
        withLikes.sort((a, b) => b.likes - a.likes);
        const target = withLikes[0];
        await env.DB.prepare(
          `UPDATE projects SET current_amount = current_amount + ? WHERE id = ?`,
        ).bind(remaining, target.id).run();
        overflowProjectId = target.id;
        overflowAmount = remaining;
      }
    }

    // Zápis, ktorému projektu dnešná koruna každého darcu pomohla (pre "moje príspevky")
    const primaryProject = fundedProjectId || overflowProjectId;
    if (primaryProject && chargedUserIds.length > 0) {
      const stmt = env.DB.prepare(
        `INSERT INTO contributions (id, user_id, project_id, amount) VALUES (?, ?, ?, 1)`,
      );
      await env.DB.batch(chargedUserIds.map((uid) => stmt.bind(newId('contrib'), uid, primaryProject)));
    }
  }

  await ensureActiveProjectRotation(env); // ak sa práve dofinancoval do 100 %, hneď to premietneme

  await env.DB.prepare(
    `INSERT INTO daily_distributions (id, run_date, total_collected, users_charged, funded_project_id, overflow_project_id, overflow_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(newId('dist'), today, totalCollected, usersCharged, fundedProjectId, overflowProjectId, overflowAmount).run();

  await sendPushNotification(env, { fundedProjectId, overflowProjectId, overflowAmount, totalCollected });

  return { run_date: today, total_collected: totalCollected, users_charged: usersCharged, fundedProjectId, overflowProjectId, overflowAmount };
}

async function sendPushNotification(env, { fundedProjectId, overflowProjectId, overflowAmount, totalCollected }) {
  if (!env.ONESIGNAL_APP_ID || !env.ONESIGNAL_API_KEY) {
    console.log('OneSignal nie je nakonfigurovaný, notifikácia sa preskakuje.', { fundedProjectId, overflowProjectId });
    return;
  }
  if (totalCollected === 0) return;

  let message = 'Vaša dnešná 1 Kč pomohla posunúť aktuálnu sbírku blíž k cíli. 🚶';
  const projectId = fundedProjectId || overflowProjectId;
  if (projectId) {
    const project = await env.DB.prepare('SELECT title FROM projects WHERE id = ?').bind(projectId).first();
    if (project) {
      message = fundedProjectId
        ? `Vaša dnešná 1 Kč pomohla sbírce „${project.title}“! Sledujte, jestli dnes dosáhne 100 %. 🎉`
        : `Vaša dnešná 1 Kč (${overflowAmount} Kč celkem od komunity) putovala do sbírky „${project.title}“. 🌱`;
    }
  }

  try {
    await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${env.ONESIGNAL_API_KEY}` },
      body: JSON.stringify({
        app_id: env.ONESIGNAL_APP_ID,
        included_segments: ['Subscribed Users'],
        headings: { cs: 'Vandro', en: 'Vandro' },
        contents: { cs: message, en: message },
      }),
    });
  } catch (err) {
    console.error('Odoslanie push notifikácie zlyhalo:', err);
  }
}
