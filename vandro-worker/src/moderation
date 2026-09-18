// Jednoduchá automatická moderácia — detekcia toxického/SPAM obsahu
// NIE je to AI, len vrstva filtrov. Rozšíriteľné.

const PROFANITY = [
  // koren slova — match case-insensitive, celé slovo alebo s diakritikou
  'kokot', 'pica', 'píča', 'kurva', 'jebat', 'jebať', 'srať', 'srat',
  'hovno', 'zmrd', 'debil', 'idiot', 'kretén', 'kretan', 'piča', 'chuj',
  'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'nigger', 'faggot',
];

const SPAM_PATTERNS = [
  /(https?:\/\/[^\s]+){4,}/gi,           // 4+ URL v jednej správe
  /(.)\1{15,}/g,                          // 15+ rovnakých znakov
  /\b(viagra|cialis|casino|bet365|1xbet)\b/gi,
];

export function checkText(text) {
  if (!text) return { clean: true, severity: 0, reason: null };
  const t = String(text);
  const lower = t.toLowerCase();

  for (const w of PROFANITY) {
    const re = new RegExp(`(^|[^a-zá-ž])${w}([^a-zá-ž]|$)`, 'i');
    if (re.test(lower)) return { clean: false, severity: 2, reason: `profanity:${w}` };
  }

  for (const p of SPAM_PATTERNS) {
    if (p.test(t)) return { clean: false, severity: 1, reason: `spam_pattern` };
  }

  if (t.length > 5000) return { clean: false, severity: 1, reason: 'too_long' };

  return { clean: true, severity: 0, reason: null };
}

export async function flagContent(env, { userId, postId, commentId, reason, severity }) {
  try {
    const id = 'flag_' + crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO moderation_flags (id, user_id, post_id, comment_id, reason, severity)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(id, userId || null, postId || null, commentId || null, reason || null, severity || 1).run();
  } catch (err) {
    console.error('flagContent failed:', err);
  }
}
