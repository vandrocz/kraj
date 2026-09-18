// ============================================================
// Moderácia + sanitizácia HTML (rich-text)
// ============================================================

const PROFANITY = [
  'kokot', 'pica', 'píča', 'kurva', 'jebat', 'jebať', 'srať', 'srat',
  'hovno', 'zmrd', 'debil', 'idiot', 'kretén', 'kretan', 'piča', 'chuj',
  'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'nigger', 'faggot',
];

const SPAM_PATTERNS = [
  /(https?:\/\/[^\s]+){4,}/gi,
  /(.)\1{15,}/g,
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

// Povolené HTML tagy pre rich-text (whitelist)
const ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'u', 's', 'p', 'br', 'ul', 'ol', 'li', 'a', 'blockquote'];
const ALLOWED_ATTR = { a: ['href', 'target', 'rel'] };

export function sanitizeHtml(html) {
  if (!html) return '';
  let out = String(html);

  // Odstráň nebezpečné tagy
  out = out.replace(/<\s*(script|style|iframe|object|embed|form|input|button)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  out = out.replace(/<\s*(script|style|iframe|object|embed|form|input|button)[^>]*\/?\s*>/gi, '');

  // Odstráň všetky neznáme tagy (zachovaj whitelist)
  out = out.replace(/<\s*\/?\s*([a-zA-Z0-9]+)([^>]*)>/g, (match, tag, attrs) => {
    const lower = tag.toLowerCase();
    if (!ALLOWED_TAGS.includes(lower)) return '';
    // Vyčisti atribúty
    const allowed = ALLOWED_ATTR[lower] || [];
    if (allowed.length === 0) return `<${lower}>`;
    let cleanAttrs = '';
    for (const attr of allowed) {
      const re = new RegExp(`\\s${attr}\\s*=\\s*["']([^"']*)["']`, 'i');
      const m = attrs.match(re);
      if (m) {
        let val = m[1].replace(/javascript:/gi, '').replace(/on\w+=/gi, '');
        cleanAttrs += ` ${attr}="${val}"`;
      }
    }
    return `<${lower}${cleanAttrs}>`;
  });

  // Zatvor nezavreté tagy (jednoduché)
  return out;
}

export function htmlToPlain(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
