import { newId } from './auth.js';

/**
 * Denná úloha (spúšťaná cronom o 8:00):
 * 1. Odpočíta 1 Kč každému aktívnemu užívateľovi s kreditom > 0.
 * 2. Spočíta celkovú vyzbieranú sumu.
 * 3. Zoradí čakajúce projekty ('waiting') podľa počtu lajkov v KV (najviac lajkov = najvyššia priorita).
 *    Kompletne dofinancuje toľko top projektov, koľko sa dá z vyzbieranej sumy, každý s hodinovým
 *    odstupom v poli distribution_json (na neskoršie plánované oznámenie/spustenie).
 *    Zvyšok (ak žiadny ďalší projekt nejde dofinancovať celý) pripíše poslednému
 *    rozpracovanému projektu (status 'in_progress' s najnovším created_at).
 * 4. Odošle hromadnú push notifikáciu cez OneSignal s textom, ktorému projektu dnešná 1 Kč pomohla.
 */
export async function runDailyDistribution(env) {
  const today = new Date().toISOString().slice(0, 10);

  // Skontrolujeme, či dnešný beh už neprebehol (idempotencia pri manuálnom re-triggeri)
  const existingRun = await env.DB.prepare('SELECT id FROM daily_distributions WHERE run_date = ?')
    .bind(today)
    .first();
  if (existingRun) {
    return { skipped: true, reason: 'Dnešné prerozdelenie už prebehlo.', run_date: today };
  }

  // 1) Zistíme, koľkých užívateľov sa to týka (na spočítanie sumy) a rovno odpočítame kredit
  const eligible = await env.DB.prepare(
    `SELECT id FROM users WHERE status = 'active' AND credit_balance > 0`,
  ).all();
  const usersCharged = eligible.results.length;
  const totalCollected = usersCharged; // 1 Kč na hlavu

  if (usersCharged > 0) {
    await env.DB.prepare(
      `UPDATE users SET credit_balance = credit_balance - 1 WHERE status = 'active' AND credit_balance > 0`,
    ).run();
  }

  // 2) Načítame čakajúce projekty a ich lajky z KV, zoradíme podľa popularity
  const waitingProjects = await env.DB.prepare(
    `SELECT id, title, target_amount, current_amount FROM projects WHERE status = 'waiting'`,
  ).all();

  const withLikes = await Promise.all(
    waitingProjects.results.map(async (p) => {
      const raw = await env.NASKRAJ_LAJKY.get(`likecount:${p.id}`);
      return { ...p, likes: raw ? parseInt(raw, 10) : 0 };
    }),
  );
  withLikes.sort((a, b) => b.likes - a.likes);

  // 3) Rozdeľovanie: kompletne dofinancujeme top projekty, kým nám stačia peniaze
  let remaining = totalCollected;
  const distribution = []; // { project_id, title, amount, scheduled_at, fully_funded }
  let hourOffset = 0;

  for (const project of withLikes) {
    const needed = project.target_amount - project.current_amount;
    if (needed <= 0) continue;
    if (remaining >= needed) {
      remaining -= needed;
      const scheduledAt = new Date(Date.now() + hourOffset * 3600 * 1000).toISOString();
      distribution.push({
        project_id: project.id,
        title: project.title,
        amount: needed,
        scheduled_at: scheduledAt,
        fully_funded: true,
      });
      await env.DB.prepare(
        `UPDATE projects SET current_amount = target_amount, status = 'funded', funded_at = ? WHERE id = ?`,
      ).bind(scheduledAt, project.id).run();
      hourOffset += 1;
    } else {
      break; // na ďalší celý projekt už peniaze nestačia
    }
  }

  // 4) Zvyšok pripíšeme poslednému rozpracovanému projektu (najnovšie vytvorený 'in_progress')
  let leftoverTarget = null;
  if (remaining > 0) {
    const lastInProgress = await env.DB.prepare(
      `SELECT id, title FROM projects WHERE status = 'in_progress' ORDER BY created_at DESC LIMIT 1`,
    ).first();
    if (lastInProgress) {
      await env.DB.prepare(
        `UPDATE projects SET current_amount = current_amount + ? WHERE id = ?`,
      ).bind(remaining, lastInProgress.id).run();
      leftoverTarget = { project_id: lastInProgress.id, title: lastInProgress.title, amount: remaining };
      distribution.push({ ...leftoverTarget, fully_funded: false });
    }
  }

  // Zápis auditného záznamu
  await env.DB.prepare(
    `INSERT INTO daily_distributions (id, run_date, total_collected, users_charged, distribution_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(newId('dist'), today, totalCollected, usersCharged, JSON.stringify(distribution)).run();

  // 5) Push notifikácia cez OneSignal
  await sendPushNotification(env, distribution, totalCollected);

  return { run_date: today, total_collected: totalCollected, users_charged: usersCharged, distribution };
}

async function sendPushNotification(env, distribution, totalCollected) {
  if (!env.ONESIGNAL_APP_ID || !env.ONESIGNAL_API_KEY) {
    console.log('OneSignal nie je nakonfigurovaný, notifikácia sa preskakuje.', { distribution, totalCollected });
    return;
  }

  let message;
  if (distribution.length === 0) {
    message = 'Dnes sa nevyzbieralo dosť na nový projekt, ale každá koruna sa počíta! 🌱';
  } else {
    const fullyFunded = distribution.filter((d) => d.fully_funded);
    if (fullyFunded.length > 0) {
      const names = fullyFunded.map((d) => d.title).join(', ');
      message = `Vaša dnešná 1 Kč pomohla kompletne dofinancovať: ${names}! 🎉 Ďakujeme, že vandrujete s nami.`;
    } else {
      const d = distribution[0];
      message = `Vaša dnešná 1 Kč posunula projekt „${d.title}“ o ${d.amount} Kč bližšie k cieľu. 🚶`;
    }
  }

  try {
    await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${env.ONESIGNAL_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: env.ONESIGNAL_APP_ID,
        included_segments: ['Subscribed Users'],
        headings: { en: 'Vandro', sk: 'Vandro' },
        contents: { en: message, sk: message },
      }),
    });
  } catch (err) {
    console.error('Odoslanie push notifikácie zlyhalo:', err);
  }
}
