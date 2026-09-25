import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { hashPassword, verifyPassword, newId, publicUser, generateUniqueHandle } from '../auth.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../email.js';
import { verifyTotp, generateSecret, otpauthUri, generateRecoveryCodes } from '../totp.js';
import { rateLimit, clientIp, userAgent } from '../ratelimit.js';

export const authRoutes = new Hono();

const VALID_ROLES = ['user', 'organization', 'hotelier'];
const RESET_TTL_MS = 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const TWOFA_TTL_MS = 5 * 60 * 1000;

async function logLogin(env, { userId, email, ip, ua, success, method }) {
  try {
    await env.DB.prepare(
      `INSERT INTO login_logs (id, user_id, email, ip, user_agent, success, method) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(newId('log'), userId || null, email || null, ip, ua, success ? 1 : 0, method || 'password').run();
  } catch (err) { console.warn('logLogin failed:', err.message); }
}

async function updateLastLogin(env, userId, ip) {
  try {
    await env.DB.prepare(`UPDATE users SET last_login_at = datetime('now'), last_login_ip = ? WHERE id = ?`)
      .bind(ip, userId).run();
  } catch (err) { console.warn('updateLastLogin failed:', err.message); }
}

authRoutes.post('/register', async (c) => {
  const ip = clientIp(c);
  const rl = await rateLimit(c.env, 'register', ip, 5, 3600);
  if (!rl.ok) return c.json({ error: 'Příliš mnoho registrací z této IP. Zkus to za hodinu.' }, 429);

  const body = await c.req.json().catch(() => ({}));
  const { email, password, displayName, role = 'user', termsAccepted, ageConfirmed, website } = body;

  // Honeypot — pole "website" je skryté, človek ho nevyplní, bot áno
  if (website && String(website).trim().length > 0) {
    console.warn('[register] honeypot triggered, IP:', ip);
    // Tvári sa ako úspech, aby bot nevedel že bol odhalený
    return c.json({ id: 'fake_' + Math.random().toString(36).slice(2), email, role, handle: 'fake', business: null }, 201);
  }

  if (!email || !password) return c.json({ error: 'Vyžaduje sa email a heslo.' }, 400);
  if (!VALID_ROLES.includes(role)) return c.json({ error: 'Neplatná rola účtu.' }, 400);
  if (password.length < 8) return c.json({ error: 'Heslo musí mať aspoň 8 znakov.' }, 400);
  if (termsAccepted !== true && termsAccepted !== 'true' && termsAccepted !== 'on') {
    return c.json({ error: 'Je nutné souhlasit s obchodními podmínkami.' }, 400);
  }
  if (ageConfirmed !== true && ageConfirmed !== 'true' && ageConfirmed !== 'on') {
    return c.json({ error: 'Musíš potvrdit, že ti je alespoň 15 let.' }, 400);
  }

  const lower = email.toLowerCase();
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(lower).first();
  if (existing) return c.json({ error: 'Užívateľ s týmto emailom už existuje.' }, 409);

  const { hash, salt } = await hashPassword(password);
  const userId = newId('user');

  let finalDisplayName = displayName || lower.split('@')[0];
  let handleBase = lower.split('@')[0] || displayName || 'user';

  if (role === 'organization' && body.orgName) {
    finalDisplayName = String(body.orgName).trim();
    handleBase = finalDisplayName;
  } else if (role === 'hotelier' && body.businessName) {
    finalDisplayName = String(body.businessName).trim();
    handleBase = finalDisplayName;
  }

  const handle = await generateUniqueHandle(c.env, handleBase);

  // email_verified = 0, age_confirmed = 1, terms_version = '1.0'
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, display_name, handle, role, credit_balance, terms_accepted_at, terms_version, age_confirmed, email_verified, auth_provider)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), '1.0', 1, 0, 'password')`,
  ).bind(userId, lower, hash, salt, finalDisplayName, handle, role).run();

  let business = null;

  if (role === 'organization') {
    const { orgName, orgType, region, district, city, description } = body;
    if (!orgName || !orgType || !region || !district || !city) {
      return c.json({ error: 'Pre organizáciu vyžadujeme názov, typ, kraj, okres a obec.' }, 400);
    }
    const orgId = newId('org');
    await c.env.DB.prepare(
      `INSERT INTO organizations (id, user_id, name, type, region, district, city, description, is_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    ).bind(orgId, userId, orgName, orgType, region, district, city, description || '').run();
    business = { id: orgId, kind: 'organization', name: orgName };
  }

  if (role === 'hotelier') {
    const { businessName, businessKind, businessType, cuisineType, region, district, city, description, capacity } = body;
    if (!businessName || !businessKind || !businessType || !region || !district || !city) {
      return c.json({ error: 'Pre podnik vyžadujeme názov, druh, typ, kraj, okres a obec.' }, 400);
    }
    if (businessKind === 'accommodation') {
      const accId = newId('acc');
      await c.env.DB.prepare(
        `INSERT INTO accommodation (id, user_id, name, type, region, district, city, description, capacity, is_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      ).bind(accId, userId, businessName, businessType, region, district, city, description || '', capacity || null).run();
      business = { id: accId, kind: 'accommodation', name: businessName };
    } else if (businessKind === 'gastro') {
      const restId = newId('rest');
      await c.env.DB.prepare(
        `INSERT INTO restaurants (id, user_id, name, type, cuisine_type, region, district, city, description, is_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      ).bind(restId, userId, businessName, businessType, cuisineType || null, region, district, city, description || '').run();
      business = { id: restId, kind: 'gastro', name: businessName };
    } else {
      return c.json({ error: 'businessKind musí byť "accommodation" alebo "gastro".' }, 400);
    }
  }

  await logLogin(c.env, { userId, email: lower, ip, ua: userAgent(c), success: true, method: 'register' });

  // Vygeneruj verifikačný token a pošli e-mail
  try {
    const token = newId('ev') + '_' + crypto.randomUUID().replace(/-/g, '');
    const exp = new Date(Date.now() + VERIFY_TTL_MS).toISOString();
    await c.env.DB.prepare(
      `INSERT INTO email_verifications (token, user_id, expires_at) VALUES (?, ?, ?)`,
    ).bind(token, userId, exp).run();
    await sendVerificationEmail(c.env, { to: lower, token, displayName: finalDisplayName });
  } catch (err) {
    console.warn('Verification email failed:', err.message);
  }

  return c.json({ id: userId, email: lower, role, handle, business, email_verification_sent: true }, 201);
});

// Overenie e-mailu
authRoutes.post('/verify-email', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const token = (body.token || '').toString();
  if (!token) return c.json({ error: 'Chýba token.' }, 400);

  const row = await c.env.DB.prepare(`SELECT * FROM email_verifications WHERE token = ?`).bind(token).first();
  if (!row) return c.json({ error: 'Neplatný odkaz.' }, 400);
  if (row.used_at) return c.json({ error: 'Odkaz byl již použit.' }, 400);
  if (new Date(row.expires_at) < new Date()) return c.json({ error: 'Platnost odkazu vypršela.' }, 400);

  await c.env.DB.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).bind(row.user_id).run();
  await c.env.DB.prepare(`UPDATE email_verifications SET used_at = datetime('now') WHERE token = ?`).bind(token).run();
  return c.json({ ok: true });
});

// Znovu-poslanie overovacieho e-mailu
authRoutes.post('/resend-verification', async (c) => {
  const h = c.req.header('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return c.json({ error: 'Chýba prihlásenie.' }, 401);
  let payload;
  try {
    const { verify } = await import('hono/jwt');
    payload = await verify(token, c.env.JWT_SECRET, 'HS256');
  } catch { return c.json({ error: 'Neplatný token.' }, 401); }

  const user = await c.env.DB.prepare('SELECT id, email, display_name, email_verified FROM users WHERE id = ?').bind(payload.sub).first();
  if (!user) return c.json({ error: 'Nenájdený.' }, 404);
  if (user.email_verified) return c.json({ ok: true, already: true });

  const ip = clientIp(c);
  const rl = await rateLimit(c.env, 'resend-verify', ip, 3, 3600);
  if (!rl.ok) return c.json({ error: 'Príliš mnoho pokusov.' }, 429);

  try {
    await c.env.DB.prepare(`UPDATE email_verifications SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL`).bind(user.id).run();
    const evToken = newId('ev') + '_' + crypto.randomUUID().replace(/-/g, '');
    const exp = new Date(Date.now() + VERIFY_TTL_MS).toISOString();
    await c.env.DB.prepare(`INSERT INTO email_verifications (token, user_id, expires_at) VALUES (?, ?, ?)`).bind(evToken, user.id, exp).run();
    await sendVerificationEmail(c.env, { to: user.email, token: evToken, displayName: user.display_name });
  } catch (err) { console.warn('resend-verify:', err.message); }
  return c.json({ ok: true });
});

authRoutes.post('/login', async (c) => {
  const ip = clientIp(c);
  const ua = userAgent(c);
  const body = await c.req.json().catch(() => ({}));
  const { email, password } = body;

  if (!email || !password) return c.json({ error: 'Vyžaduje sa email a heslo.' }, 400);

  const lower = String(email).toLowerCase();
  const rl = await rateLimit(c.env, 'login', `${ip}:${lower}`, 10, 900);
  if (!rl.ok) {
    await logLogin(c.env, { userId: null, email: lower, ip, ua, success: false, method: 'password' });
    return c.json({ error: 'Příliš mnoho pokusů o přihlášení. Zkus to za 15 minut.' }, 429);
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(lower).first();
  if (!user) {
    await logLogin(c.env, { userId: null, email: lower, ip, ua, success: false, method: 'password' });
    return c.json({ error: 'Nesprávny email alebo heslo.' }, 401);
  }
  if (user.deleted_at) return c.json({ error: 'Tento účet byl smazán.' }, 403);

  if (user.auth_provider === 'google' || user.password_hash === 'google-oauth') {
    await logLogin(c.env, { userId: user.id, email: lower, ip, ua, success: false, method: 'password' });
    return c.json({ error: 'Tento účet byl vytvořen přes Google. Přihlas se tlačítkem "Sign in with Google".' }, 400);
  }

  const valid = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!valid) {
    await logLogin(c.env, { userId: user.id, email: lower, ip, ua, success: false, method: 'password' });
    return c.json({ error: 'Nesprávny email alebo heslo.' }, 401);
  }
  if (user.status && user.status !== 'active') return c.json({ error: 'Tento účet je pozastavený.' }, 403);

  if (user.totp_enabled && user.totp_secret) {
    const tfa = newId('2fa') + '_' + crypto.randomUUID().replace(/-/g, '');
    const exp = new Date(Date.now() + TWOFA_TTL_MS).toISOString();
    try {
      await c.env.DB.prepare(`INSERT INTO twofa_sessions (token, user_id, expires_at) VALUES (?, ?, ?)`)
        .bind(tfa, user.id, exp).run();
    } catch (err) {
      console.error('twofa_sessions insert zlyhal:', err.message);
      return c.json({ error: 'Chyba při přípravě 2FA.' }, 500);
    }
    return c.json({ twofa_required: true, twofa_token: tfa });
  }

  await logLogin(c.env, { userId: user.id, email: lower, ip, ua, success: true, method: 'password' });
  await updateLastLogin(c.env, user.id, ip);

  const token = await sign(
    { sub: user.id, email: user.email, role: user.role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 },
    c.env.JWT_SECRET, 'HS256',
  );

  let businesses = [];
  if (user.role === 'organization') {
    const { results } = await c.env.DB.prepare('SELECT id, name, is_verified FROM organizations WHERE user_id = ?').bind(user.id).all();
    businesses = results.map((r) => ({ ...r, kind: 'organization' }));
  } else if (user.role === 'hotelier') {
    const acc = await c.env.DB.prepare('SELECT id, name, is_verified FROM accommodation WHERE user_id = ?').bind(user.id).all();
    const rest = await c.env.DB.prepare('SELECT id, name, is_verified FROM restaurants WHERE user_id = ?').bind(user.id).all();
    businesses = [
      ...acc.results.map((r) => ({ ...r, kind: 'accommodation' })),
      ...rest.results.map((r) => ({ ...r, kind: 'gastro' })),
    ];
  }

  return c.json({ token, user: publicUser(user), businesses });
});

authRoutes.post('/logout', (c) => c.json({ ok: true }));

authRoutes.post('/forgot-password', async (c) => {
  const ip = clientIp(c);
  const rl = await rateLimit(c.env, 'forgot', ip, 5, 3600);
  if (!rl.ok) return c.json({ error: 'Příliš mnoho pokusů.' }, 429);

  const body = await c.req.json().catch(() => ({}));
  const email = (body.email || '').toString().toLowerCase();
  if (!email) return c.json({ error: 'Zadej e-mail.' }, 400);

  const user = await c.env.DB.prepare('SELECT id, email, display_name FROM users WHERE email = ? AND deleted_at IS NULL').bind(email).first();
  if (!user) return c.json({ ok: true });

  try {
    await c.env.DB.prepare(`UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL`).bind(user.id).run();
    const token = newId('pr') + '_' + crypto.randomUUID().replace(/-/g, '');
    const exp = new Date(Date.now() + RESET_TTL_MS).toISOString();
    await c.env.DB.prepare(`INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)`).bind(token, user.id, exp).run();
    await sendPasswordResetEmail(c.env, { to: user.email, token, displayName: user.display_name });
  } catch (err) { console.warn('forgot-password:', err.message); }
  return c.json({ ok: true });
});

authRoutes.post('/reset-password', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const token = (body.token || '').toString();
  const newPassword = (body.password || '').toString();
  if (!token || !newPassword) return c.json({ error: 'Chýba token nebo heslo.' }, 400);
  if (newPassword.length < 8) return c.json({ error: 'Heslo musí mať aspoň 8 znakov.' }, 400);

  const row = await c.env.DB.prepare(`SELECT * FROM password_resets WHERE token = ?`).bind(token).first();
  if (!row) return c.json({ error: 'Neplatný odkaz.' }, 400);
  if (row.used_at) return c.json({ error: 'Odkaz byl již použit.' }, 400);
  if (new Date(row.expires_at) < new Date()) return c.json({ error: 'Platnost odkazu vypršela.' }, 400);

  const { hash, salt } = await hashPassword(newPassword);
  await c.env.DB.prepare(`UPDATE users SET password_hash = ?, password_salt = ?, auth_provider = 'password' WHERE id = ?`)
    .bind(hash, salt, row.user_id).run();
  await c.env.DB.prepare(`UPDATE password_resets SET used_at = datetime('now') WHERE token = ?`).bind(token).run();
  return c.json({ ok: true });
});

authRoutes.post('/verify-2fa', async (c) => {
  const ip = clientIp(c); const ua = userAgent(c);
  const body = await c.req.json().catch(() => ({}));
  const { twofa_token, code } = body;
  if (!twofa_token || !code) return c.json({ error: 'Chýba kód.' }, 400);

  const rl = await rateLimit(c.env, 'verify2fa', ip, 20, 900);
  if (!rl.ok) return c.json({ error: 'Příliš mnoho pokusů.' }, 429);

  const sess = await c.env.DB.prepare(`SELECT * FROM twofa_sessions WHERE token = ?`).bind(twofa_token).first();
  if (!sess) return c.json({ error: 'Neplatná relace.' }, 400);
  if (sess.used_at) return c.json({ error: 'Relace již použita.' }, 400);
  if (new Date(sess.expires_at) < new Date()) return c.json({ error: 'Relace vypršela.' }, 400);

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(sess.user_id).first();
  if (!user || !user.totp_secret) return c.json({ error: 'Chyba.' }, 400);

  const okTotp = await verifyTotp(user.totp_secret, code);
  let okRecovery = false;
  let updatedCodes = null;
  if (!okTotp && user.recovery_codes_json) {
    try {
      const codes = JSON.parse(user.recovery_codes_json);
      const idx = codes.indexOf(String(code).toUpperCase());
      if (idx >= 0) { okRecovery = true; codes.splice(idx, 1); updatedCodes = codes; }
    } catch {}
  }
  if (!okTotp && !okRecovery) {
    await logLogin(c.env, { userId: user.id, email: user.email, ip, ua, success: false, method: '2fa' });
    return c.json({ error: 'Neplatný kód.' }, 401);
  }

  try {
    await c.env.DB.prepare(`UPDATE twofa_sessions SET used_at = datetime('now') WHERE token = ?`).bind(twofa_token).run();
    if (updatedCodes) await c.env.DB.prepare(`UPDATE users SET recovery_codes_json = ? WHERE id = ?`).bind(JSON.stringify(updatedCodes), user.id).run();
  } catch {}

  await logLogin(c.env, { userId: user.id, email: user.email, ip, ua, success: true, method: okRecovery ? '2fa-recovery' : '2fa' });
  await updateLastLogin(c.env, user.id, ip);

  const token = await sign(
    { sub: user.id, email: user.email, role: user.role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 },
    c.env.JWT_SECRET, 'HS256',
  );

  let businesses = [];
  if (user.role === 'organization') {
    const { results } = await c.env.DB.prepare('SELECT id, name, is_verified FROM organizations WHERE user_id = ?').bind(user.id).all();
    businesses = results.map((r) => ({ ...r, kind: 'organization' }));
  } else if (user.role === 'hotelier') {
    const acc = await c.env.DB.prepare('SELECT id, name, is_verified FROM accommodation WHERE user_id = ?').bind(user.id).all();
    const rest = await c.env.DB.prepare('SELECT id, name, is_verified FROM restaurants WHERE user_id = ?').bind(user.id).all();
    businesses = [
      ...acc.results.map((r) => ({ ...r, kind: 'accommodation' })),
      ...rest.results.map((r) => ({ ...r, kind: 'gastro' })),
    ];
  }

  return c.json({ token, user: publicUser(user), businesses, recovery_remaining: updatedCodes?.length });
});

async function getAuthUser(c) {
  const h = c.req.header('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  try { const { verify } = await import('hono/jwt'); return await verify(token, c.env.JWT_SECRET, 'HS256'); }
  catch { return null; }
}

authRoutes.post('/2fa/setup', async (c) => {
  const payload = await getAuthUser(c);
  if (!payload) return c.json({ error: 'Chýba prihlásenie.' }, 401);
  const user = await c.env.DB.prepare('SELECT id, email, totp_enabled FROM users WHERE id = ?').bind(payload.sub).first();
  if (!user) return c.json({ error: 'Nenájdený.' }, 404);
  if (user.totp_enabled) return c.json({ error: '2FA je již aktivní.' }, 400);

  const secret = generateSecret();
  await c.env.DB.prepare(`UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?`).bind(secret, user.id).run();
  return c.json({ secret, otpauth_uri: otpauthUri({ secret, label: user.email }) });
});

authRoutes.post('/2fa/enable', async (c) => {
  const payload = await getAuthUser(c);
  if (!payload) return c.json({ error: 'Chýba prihlásenie.' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const code = (body.code || '').toString();
  if (!code) return c.json({ error: 'Zadej kód.' }, 400);

  const user = await c.env.DB.prepare('SELECT id, totp_secret, totp_enabled FROM users WHERE id = ?').bind(payload.sub).first();
  if (!user || !user.totp_secret) return c.json({ error: 'Nejdřív spusť nastavení.' }, 400);
  if (user.totp_enabled) return c.json({ error: '2FA je již aktivní.' }, 400);

  const ok = await verifyTotp(user.totp_secret, code);
  if (!ok) return c.json({ error: 'Neplatný kód.' }, 401);

  const codes = generateRecoveryCodes(8);
  await c.env.DB.prepare(`UPDATE users SET totp_enabled = 1, recovery_codes_json = ? WHERE id = ?`).bind(JSON.stringify(codes), user.id).run();
  return c.json({ ok: true, recovery_codes: codes });
});

authRoutes.post('/2fa/disable', async (c) => {
  const payload = await getAuthUser(c);
  if (!payload) return c.json({ error: 'Chýba prihlásenie.' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const code = (body.code || '').toString();
  const user = await c.env.DB.prepare('SELECT id, totp_secret, totp_enabled FROM users WHERE id = ?').bind(payload.sub).first();
  if (!user || !user.totp_enabled) return c.json({ error: '2FA není aktivní.' }, 400);
  const ok = await verifyTotp(user.totp_secret, code);
  if (!ok) return c.json({ error: 'Neplatný kód.' }, 401);
  await c.env.DB.prepare(`UPDATE users SET totp_secret = NULL, totp_enabled = 0, recovery_codes_json = NULL WHERE id = ?`).bind(user.id).run();
  return c.json({ ok: true });
});

authRoutes.get('/me/login-logs', async (c) => {
  const payload = await getAuthUser(c);
  if (!payload) return c.json({ error: 'Chýba prihlásenie.' }, 401);
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT id, ip, user_agent, success, method, created_at FROM login_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    ).bind(payload.sub).all();
    return c.json({ logs: results });
  } catch (err) {
    return c.json({ logs: [], warning: err.message });
  }
});
