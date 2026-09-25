// ============================================================
// Pomocné funkcie pre autentifikáciu
// ============================================================

function bufToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes.buffer;
}

async function pbkdf2(password, saltBuf, iterations = 100000) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBuf, iterations, hash: 'SHA-256' }, keyMaterial, 256,
  );
  return bufToHex(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return { hash, salt: bufToHex(salt) };
}

export async function verifyPassword(password, hash, saltHex) {
  if (!hash || !saltHex) return false;
  if (hash === 'deleted' || hash === 'google-oauth') return false;
  if (saltHex === 'deleted' || saltHex === 'google-oauth') return false;
  if (typeof saltHex !== 'string' || saltHex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(saltHex)) return false;
  try {
    const salt = hexToBuf(saltHex);
    const candidate = await pbkdf2(password, salt);
    if (candidate.length !== hash.length) return false;
    let diff = 0;
    for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i);
    return diff === 0;
  } catch (err) {
    console.error('verifyPassword zlyhal:', err);
    return false;
  }
}

export function newId(prefix = '') {
  const raw = crypto.randomUUID();
  return prefix ? `${prefix}_${raw}` : raw;
}

// ============================================================
// HANDLE (username) — slugify, validácia, unikátnosť
// ============================================================

const HANDLE_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const RESERVED_HANDLES = new Set([
  'admin', 'root', 'system', 'support', 'help', 'api', 'www',
  'about', 'login', 'register', 'profile', 'settings', 'user', 'users',
  'naskraj', 'vandro', 'official', 'team', 'bot',
]);

export function normalizeHandle(raw) {
  if (!raw) return '';
  let h = String(raw).toLowerCase().trim();
  h = h.replace(/\s+/g, '-');
  // odstráň diakritiku (jednoduché)
  h = h.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // iba a-z 0-9 . _ -
  h = h.replace(/[^a-z0-9._-]/g, '');
  // nesmie začínať bodkou/podčiarkou/pomlčkou
  h = h.replace(/^[._-]+/, '');
  // skráť na 30
  h = h.slice(0, 30);
  return h;
}

export function validateHandle(h) {
  if (!h) return { ok: false, reason: 'empty' };
  if (!HANDLE_RE.test(h)) return { ok: false, reason: 'invalid_format' };
  if (RESERVED_HANDLES.has(h)) return { ok: false, reason: 'reserved' };
  return { ok: true };
}

export async function generateUniqueHandle(env, base) {
  let candidate = normalizeHandle(base) || 'user';
  if (candidate.length < 3) candidate = 'user' + candidate;
  let suffix = 0;
  // max 100 pokusov
  for (let i = 0; i < 100; i++) {
    const tryHandle = suffix === 0 ? candidate : `${candidate.slice(0, 27)}${suffix}`;
    const valid = validateHandle(tryHandle);
    if (!valid.ok) {
      suffix++;
      continue;
    }
    const exists = await env.DB.prepare('SELECT 1 FROM users WHERE handle = ?').bind(tryHandle).first();
    if (!exists) return tryHandle;
    suffix++;
  }
  // fallback — náhodné číslo
  return `${candidate.slice(0, 24)}-${Math.floor(Math.random() * 99999)}`;
}

export function publicUser(u) {
  return {
    id: u.id, email: u.email, role: u.role, display_name: u.display_name,
    handle: u.handle || null,
    bio: u.bio || null, avatar_url: u.avatar_url || null, cover_url: u.cover_url || null,
    location: u.location || null, website: u.website || null, phone: u.phone || null,
    email_verified: u.email_verified != null ? !!u.email_verified : true,
    totp_enabled: !!u.totp_enabled,
    onboarding_done: !!u.onboarding_done,
  };
}
