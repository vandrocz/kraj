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

// ============================================================
// Striktná sanitizácia HTML
// Povolené tagy: b, strong, i, em, u, s, br, p, ul, ol, li, a, blockquote
// Povolené atribúty: a[href] (len http/https)
// ============================================================

const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'br', 'p',
  'ul', 'ol', 'li', 'a', 'blockquote',
]);

const DANGEROUS_TAGS = [
  'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button',
  'link', 'meta', 'base', 'svg', 'math', 'template', 'noscript', 'video',
  'audio', 'source', 'track', 'img', 'picture', 'canvas', 'map', 'area',
];

export function sanitizeHtml(input) {
  if (!input) return '';
  let s = String(input);

  // 1) Odstráň kompletné bloky nebezpečných tagov (aj s obsahom)
  for (const tag of DANGEROUS_TAGS) {
    const reBlock = new RegExp(`<\\s*${tag}\\b[^>]*>[\\s\\S]*?<\\s*\\/\\s*${tag}\\s*>`, 'gi');
    s = s.replace(reBlock, '');
    const reSelf = new RegExp(`<\\s*\\/?\\s*${tag}\\b[^>]*\\/?\\s*>`, 'gi');
    s = s.replace(reSelf, '');
  }

  // 2) Odstráň HTML komentáre
  s = s.replace(/<!--[\s\S]*?-->/g, '');

  // 3) Whitelist tagov
  s = s.replace(/<\s*\/?\s*([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g, (match, rawTag, attrs) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';

    const isClosing = /^\s*<\s*\//.test(match);

    if (tag === 'a') {
      if (isClosing) return '</a>';
      const hrefMatch = attrs.match(/\shref\s*=\s*["']([^"']+)["']/i);
      if (!hrefMatch) return '<a>';
      let href = hrefMatch[1].trim();
      // Iba http:// alebo https://
      if (!/^https?:\/\//i.test(href)) return '<a>';
      // Odstráň nebezpečné znaky
      href = href.replace(/["'<>\\]/g, '').slice(0, 500);
      return `<a href="${href}" target="_blank" rel="noopener nofollow ugc">`;
    }

    return isClosing ? `</${tag}>` : `<${tag}>`;
  });

  // 4) Escapuj osamelé < a > ktoré nie sú súčasťou whitelist tagov
  s = s.replace(/<([^>]*)>/g, (m, inner) => {
    if (/^\s*\/?\s*[a-z]+\s*$/.test(inner)) return m; // je to tag bez atribútov
    if (/^\s*\/?\s*a\s+href\s*=/.test(inner)) return m;
    return '&lt;' + inner + '&gt;';
  });

  // 5) Escapuj nebezpečné URL javascript:, data: (aj s medzerami)
  s = s.replace(/javascript\s*:/gi, '').replace(/data\s*:/gi, '');
  s = s.replace(/on\w+\s*=/gi, '');

  return s.trim();
}

export function htmlToPlain(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Escape % a _ pre SQL LIKE
export function escapeLike(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

// ============================================================
// MIME + SIZE + MAGIC BYTES validácia nahrávaných súborov
// ============================================================

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
export const ALLOWED_DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
export const MAX_VIDEO_SIZE = 30 * 1024 * 1024;
export const MAX_DOC_SIZE = 10 * 1024 * 1024;

function _bytes(buf) { return new Uint8Array(buf); }

export function checkImageMagicBytes(buf) {
  if (!buf || buf.byteLength < 12) return false;
  const b = _bytes(buf);
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return true;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return true;
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return true;
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return true;
  return false;
}

export function checkVideoMagicBytes(buf) {
  if (!buf || buf.byteLength < 12) return false;
  const b = _bytes(buf);
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return true;
  if (b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) return true;
  return false;
}

export function checkPdfMagicBytes(buf) {
  if (!buf || buf.byteLength < 5) return false;
  const b = _bytes(buf);
  return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2D;
}

export async function validateUpload(file, kind) {
  if (!file || typeof file === 'string') return { ok: false, reason: 'no_file' };
  if (!file.size) return { ok: false, reason: 'empty' };
  const type = file.type || '';
  const size = file.size;

  if (kind === 'image') {
    if (!ALLOWED_IMAGE_TYPES.includes(type)) return { ok: false, reason: 'bad_type' };
    if (size > MAX_IMAGE_SIZE) return { ok: false, reason: 'too_large' };
    const buf = await file.slice(0, 12).arrayBuffer();
    if (!checkImageMagicBytes(buf)) return { ok: false, reason: 'bad_magic' };
  } else if (kind === 'video') {
    if (!ALLOWED_VIDEO_TYPES.includes(type)) return { ok: false, reason: 'bad_type' };
    if (size > MAX_VIDEO_SIZE) return { ok: false, reason: 'too_large' };
    const buf = await file.slice(0, 12).arrayBuffer();
    if (!checkVideoMagicBytes(buf)) return { ok: false, reason: 'bad_magic' };
  } else if (kind === 'document') {
    if (!ALLOWED_DOC_TYPES.includes(type)) return { ok: false, reason: 'bad_type' };
    if (size > MAX_DOC_SIZE) return { ok: false, reason: 'too_large' };
    if (type === 'application/pdf') {
      const buf = await file.slice(0, 5).arrayBuffer();
      if (!checkPdfMagicBytes(buf)) return { ok: false, reason: 'bad_magic' };
    } else {
      const buf = await file.slice(0, 12).arrayBuffer();
      if (!checkImageMagicBytes(buf)) return { ok: false, reason: 'bad_magic' };
    }
  }
  return { ok: true };
}
