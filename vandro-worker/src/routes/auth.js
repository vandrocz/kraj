import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { hashPassword, verifyPassword, newId } from '../auth.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../email.js';

export const authRoutes = new Hono();

const VALID_ROLES = ['user', 'organization', 'hotelier'];
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;    // 24 h
const RESET_TTL_MS = 60 * 60 * 1000;           // 1 h

function publicUser(u) {
  return {
    id: u.id, email: u.email, role: u.role, display_name: u.display_name,
    bio: u.bio || null, avatar_url: u.avatar_url || null, cover_url: u.cover_url || null,
    location: u.location || null, website: u.website || null, phone: u.phone || null,
    email_verified: !!u.email_verified,
  };
}

async function issueVerificationToken(env, userId, email) {
  // invaliduj predošlé nevyužité
  await env.DB.prepare(`UPDATE email_verifications SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL`)
    .bind(userId).run();
  const token = newId('ev') + '_' + crypto.randomUUID().replace(/-/g, '');
  const exp = new Date(Date.now() + VERIFY_TTL_MS).toISOString();
  await env.DB.prepare(
    `INSERT INTO email_verifications (token, user_id, email, expires_at) VALUES (?, ?, ?, ?)`,
  ).bind(token, userId, email, exp).run();
  return token;
}

authRoutes.post('/register', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password, displayName, role = 'user', termsAccepted } = body;

  if (!email || !password) return c.json({ error: 'Vyžaduje sa email a heslo.' }, 400);
  if (!VALID_ROLES.includes(role)) return c.json({ error: 'Neplatná rola účtu.' }, 400);
  if (password.length < 8) return c.json({ error: 'Heslo musí mať aspoň 8 znakov.' }, 400);
  if (termsAccepted !== true && termsAccepted !== 'true' && termsAccepted !== 'on') {
    return c.json({ error: 'Je nutné souhlasit s obchodními podmínkami.' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();
  if (existing) return c.json({ error: 'Užívateľ s týmto emailom už existuje.' }, 409);

  const { hash, salt } = await hashPassword(password);
  const userId = newId('user');
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, display_name, role, credit_balance, terms_accepted_at, email_verified)
     VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'), 0)`,
  ).bind(userId, email.toLowerCase(), hash, salt, displayName || email.split('@')[0], role).run();

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

  // Pošli verifikačný e-mail
  try {
    const token = await issueVerificationToken(c.env, userId, email.toLowerCase());
    await sendVerificationEmail(c.env, { to: email.toLowerCase(), token, displayName: displayName || email.split('@')[0] });
  } catch (err) {
    console.error('Nepodarilo sa poslať verifikačný e-mail:', err);
  }

  return c.json({ id: userId, email, role, business, verification_sent: true }, 201);
});

authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password } = body;
  if (!email || !password) return c.json({ error: 'Vyžaduje sa email a heslo.' }, 400);

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email.toLowerCase()).first();
  if (!user) return c.json({ error: 'Nesprávny email alebo heslo.' }, 401);
  if (user.deleted_at) return c.json({ error: 'Tento účet byl smazán.' }, 403);

  const valid = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!valid) return c.json({ error: 'Nesprávny email alebo heslo.' }, 401);
  if (user.status !== 'active') return c.json({ error: 'Tento účet je pozastavený.' }, 403);

  const token = await sign(
    { sub: user.id, email: user.email, role: user.role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 },
    c.env.JWT_SECRET,
    'HS256',
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

// ---- Overenie e-mailu ----
authRoutes.post('/verify-email', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const token = (body.token || '').toString();
  if (!token) return c.json({ error: 'Chýba token.' }, 400);

  const row = await c.env.DB.prepare(`SELECT * FROM email_verifications WHERE token = ?`).bind(token).first();
  if (!row) return c.json({ error: 'Neplatný nebo neznámý odkaz.' }, 400);
  if (row.used_at) return c.json({ error: 'Tento odkaz byl již použit.' }, 400);
  if (new Date(row.expires_at) < new Date()) return c.json({ error: 'Platnost odkazu vypršela. Nech si poslat nový.' }, 400);

  await c.env.DB.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).bind(row.user_id).run();
  await c.env.DB.prepare(`UPDATE email_verifications SET used_at = datetime('now') WHERE token = ?`).bind(token).run();

  return c.json({ ok: true, email: row.email });
});

// ---- Znovu-odoslanie overovacieho e-mailu ----
authRoutes.post('/resend-verification', async (c) => {
  const authHeader = c.req.header('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return c.json({ error: 'Chýba prihlásenie.' }, 401);
  let payload;
  try {
    const { verify } = await import('hono/jwt');
    payload = await verify(token, c.env.JWT_SECRET, 'HS256');
  } catch { return c.json({ error: 'Neplatný token.' }, 401); }

  const user = await c.env.DB.prepare('SELECT id, email, display_name, email_verified FROM users WHERE id = ?').bind(payload.sub).first();
  if (!user) return c.json({ error: 'Užívateľ nenájdený.' }, 404);
  if (user.email_verified) return c.json({ ok: true, already: true });

  const vt = await issueVerificationToken(c.env, user.id, user.email);
  await sendVerificationEmail(c.env, { to: user.email, token: vt, displayName: user.display_name });
  return c.json({ ok: true, sent: true });
});

// ---- Zabudnuté heslo ----
authRoutes.post('/forgot-password', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = (body.email || '').toString().toLowerCase();
  if (!email) return c.json({ error: 'Zadej e-mail.' }, 400);

  const user = await c.env.DB.prepare('SELECT id, email, display_name FROM users WHERE email = ? AND deleted_at IS NULL').bind(email).first();
  // Vždy vráť OK (ochrana proti enumerácii e-mailov)
  if (!user) return c.json({ ok: true });

  await c.env.DB.prepare(`UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL`).bind(user.id).run();
  const token = newId('pr') + '_' + crypto.randomUUID().replace(/-/g, '');
  const exp = new Date(Date.now() + RESET_TTL_MS).toISOString();
  await c.env.DB.prepare(
    `INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)`,
  ).bind(token, user.id, exp).run();

  try {
    await sendPasswordResetEmail(c.env, { to: user.email, token, displayName: user.display_name });
  } catch (err) {
    console.error('Reset e-mail zlyhal:', err);
  }
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
  if (row.used_at) return c.json({ error: 'Tento odkaz byl již použit.' }, 400);
  if (new Date(row.expires_at) < new Date()) return c.json({ error: 'Platnost odkazu vypršela.' }, 400);

  const { hash, salt } = await hashPassword(newPassword);
  await c.env.DB.prepare(`UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?`)
    .bind(hash, salt, row.user_id).run();
  await c.env.DB.prepare(`UPDATE password_resets SET used_at = datetime('now') WHERE token = ?`).bind(token).run();

  return c.json({ ok: true });
});

// ---- Kontrola, či je e-mail overený (pre frontend pri každom requeste write-akcií) ----
export async function assertEmailVerified(c) {
  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT email_verified FROM users WHERE id = ?').bind(user.sub).first();
  if (!row || !row.email_verified) {
    const err = new Error('Pro tuto akci musíš nejprve ověřit e-mail. Podívej se do schránky.');
    err.status = 403;
    throw err;
  }
}
