import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { newId, publicUser } from '../auth.js';
import { rateLimit, clientIp } from '../ratelimit.js';

export const authGoogleRoutes = new Hono();

// ============================================================
// Overenie Google ID tokenu cez Web Crypto API
// Bez externých knižníc, bez platených služieb.
// ============================================================

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

let _jwksCache = null;
let _jwksCacheExpiry = 0;

async function getGoogleJwks() {
  const now = Date.now();
  if (_jwksCache && now < _jwksCacheExpiry) return _jwksCache;

  const res = await fetch(GOOGLE_JWKS_URL);
  if (!res.ok) throw new Error('Nepodařilo se načíst Google JWKS.');
  const data = await res.json();

  // Cache-Control z Google (max-age=...) — typicky 3600 s
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAge = parseInt((cacheControl.match(/max-age=(\d+)/) || [])[1] || '3600', 10);

  _jwksCache = data.keys || [];
  _jwksCacheExpiry = now + maxAge * 1000;
  return _jwksCache;
}

function base64UrlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function verifyGoogleIdToken(idToken, clientId) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Neplatný formát tokenu.');

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64)));
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));

  // 1) iss
  if (!GOOGLE_ISSUERS.includes(payload.iss)) throw new Error('Neplatný issuer.');
  // 2) aud
  if (payload.aud !== clientId) throw new Error('Neplatný audience.');
  // 3) exp
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token vypršel.');
  // 4) email_verified
  if (payload.email_verified !== true) throw new Error('E-mail není ověřen Googlem.');

  // 5) podpis — nájdi kľúč podľa kid
  const jwks = await getGoogleJwks();
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Neznámý klíč.');

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', cryptoKey, signature, signedData,
  );
  if (!valid) throw new Error('Neplatný podpis tokenu.');

  return payload;
}

// ============================================================
// POST /api/auth/google
// Body: { credential: "<google id token>" }
// ============================================================

authGoogleRoutes.post('/google', async (c) => {
  const ip = clientIp(c);
  const rl = await rateLimit(c.env, 'google-login', ip, 30, 900);
  if (!rl.ok) return c.json({ error: 'Příliš mnoho pokusů. Zkus to za 15 minut.' }, 429);

  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.error('GOOGLE_CLIENT_ID chýba vo Worker secrets.');
    return c.json({ error: 'Google přihlášení není nakonfigurováno.' }, 500);
  }

  const body = await c.req.json().catch(() => ({}));
  const credential = (body.credential || '').toString();
  if (!credential) return c.json({ error: 'Chýba Google credential.' }, 400);

  let payload;
  try {
    payload = await verifyGoogleIdToken(credential, clientId);
  } catch (err) {
    console.error('Google token verify zlyhal:', err.message);
    return c.json({ error: 'Google přihlášení se nezdařilo.' }, 401);
  }

  const googleId = payload.sub;
  const email = (payload.email || '').toLowerCase();
  const displayName = payload.name || email.split('@')[0];
  const avatarUrl = payload.picture || null;

  if (!email) return c.json({ error: 'Google neposkytl e-mail.' }, 400);

  // 1) Skús nájsť podľa google_id
  let user = await c.env.DB.prepare('SELECT * FROM users WHERE google_id = ?').bind(googleId).first();

  // 2) Skús nájsť podľa emailu (existujúci účet)
  if (!user) {
    user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (user) {
      // prepoj existujúci účet s Google
      await c.env.DB.prepare(
        `UPDATE users SET google_id = ?, auth_provider = 'google', email_verified = 1, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?`,
      ).bind(googleId, avatarUrl, user.id).run();
      user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
    }
  }

  // 3) Vytvor nový účet
  if (!user) {
    const userId = newId('user');
    await c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, password_salt, display_name, role, credit_balance, terms_accepted_at, email_verified, auth_provider, google_id, avatar_url)
       VALUES (?, ?, 'google-oauth', 'google-oauth', ?, 'user', 0, datetime('now'), 1, 'google', ?, ?)`,
    ).bind(userId, email, displayName, googleId, avatarUrl).run();
    user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  }

  if (user.status !== 'active') return c.json({ error: 'Tento účet je pozastavený.' }, 403);
  if (user.deleted_at) return c.json({ error: 'Tento účet byl smazán.' }, 403);

  // Aktualizuj last_login
  await c.env.DB.prepare(
    `UPDATE users SET last_login_at = datetime('now'), last_login_ip = ? WHERE id = ?`,
  ).bind(ip, user.id).run();

  // Vytvor JWT (rovnaký ako pri hesle)
  const token = await sign(
    { sub: user.id, email: user.email, role: user.role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 },
    c.env.JWT_SECRET,
    'HS256',
  );

  // Dotiahni businesses (rovnaká logika ako pri /login)
  let businesses = [];
  if (user.role === 'organization') {
    const { results } = await c.env.DB.prepare(
      'SELECT id, name, is_verified FROM organizations WHERE user_id = ?',
    ).bind(user.id).all();
    businesses = results.map((r) => ({ ...r, kind: 'organization' }));
  } else if (user.role === 'hotelier') {
    const acc = await c.env.DB.prepare(
      'SELECT id, name, is_verified FROM accommodation WHERE user_id = ?',
    ).bind(user.id).all();
    const rest = await c.env.DB.prepare(
      'SELECT id, name, is_verified FROM restaurants WHERE user_id = ?',
    ).bind(user.id).all();
    businesses = [
      ...acc.results.map((r) => ({ ...r, kind: 'accommodation' })),
      ...rest.results.map((r) => ({ ...r, kind: 'gastro' })),
    ];
  }

  return c.json({
    token,
    user: publicUser(user),
    businesses,
    is_new: !user.created_at || Date.now() - new Date(user.created_at + 'Z').getTime() < 10000,
  });
});