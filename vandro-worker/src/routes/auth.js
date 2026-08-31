import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { hashPassword, verifyPassword, newId } from '../auth.js';

export const authRoutes = new Hono();

const VALID_ROLES = ['user', 'organization', 'hotelier'];

authRoutes.post('/register', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password, displayName, role = 'user', termsAccepted } = body;

  if (!email || !password) return c.json({ error: 'Vyžaduje sa email a heslo.' }, 400);
  if (!VALID_ROLES.includes(role)) return c.json({ error: 'Neplatná rola účtu.' }, 400);
  if (password.length < 6) return c.json({ error: 'Heslo musí mať aspoň 6 znaků.' }, 400);
  if (termsAccepted !== true && termsAccepted !== 'true' && termsAccepted !== 'on') {
    return c.json({ error: 'Je nutné souhlasit s obchodními podmínkami a zpracováním osobních údajů.' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return c.json({ error: 'Užívateľ s týmto emailom už existuje.' }, 409);

  const { hash, salt } = await hashPassword(password);
  const userId = newId('user');
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, display_name, role, credit_balance, terms_accepted_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
  ).bind(userId, email, hash, salt, displayName || email.split('@')[0], role).run();

  let business = null;

  if (role === 'organization') {
    const { orgName, orgType, region, district, description } = body;
    if (!orgName || !orgType || !region || !district) {
      return c.json({ error: 'Pre organizáciu vyžadujeme názov, typ, kraj a okres.' }, 400);
    }
    const orgId = newId('org');
    await c.env.DB.prepare(
      `INSERT INTO organizations (id, user_id, name, type, region, district, description, is_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    ).bind(orgId, userId, orgName, orgType, region, district, description || '').run();
    business = { id: orgId, kind: 'organization', name: orgName };
  }

  if (role === 'hotelier') {
    const { businessName, businessKind, businessType, cuisineType, region, district, description, capacity } = body;
    if (!businessName || !businessKind || !businessType || !region || !district) {
      return c.json({ error: 'Pre podnik vyžadujeme názov, druh (ubytování/gastro), typ, kraj a okres.' }, 400);
    }
    if (businessKind === 'accommodation') {
      const accId = newId('acc');
      await c.env.DB.prepare(
        `INSERT INTO accommodation (id, user_id, name, type, region, district, description, capacity, is_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      ).bind(accId, userId, businessName, businessType, region, district, description || '', capacity || null).run();
      business = { id: accId, kind: 'accommodation', name: businessName };
    } else if (businessKind === 'gastro') {
      const restId = newId('rest');
      await c.env.DB.prepare(
        `INSERT INTO restaurants (id, user_id, name, type, cuisine_type, region, district, description, is_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      ).bind(restId, userId, businessName, businessType, cuisineType || null, region, district, description || '').run();
      business = { id: restId, kind: 'gastro', name: businessName };
    } else {
      return c.json({ error: 'businessKind musí byť "accommodation" alebo "gastro".' }, 400);
    }
  }

  return c.json({ id: userId, email, role, business }, 201);
});

authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password } = body;
  if (!email || !password) return c.json({ error: 'Vyžaduje sa email a heslo.' }, 400);

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!user) return c.json({ error: 'Nesprávny email alebo heslo.' }, 401);

  const valid = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!valid) return c.json({ error: 'Nesprávny email alebo heslo.' }, 401);
  if (user.status !== 'active') return c.json({ error: 'Tento účet je pozastavený.' }, 403);

  if (!c.env.JWT_SECRET) {
    console.error('JWT_SECRET nie je nastavený (chýba `wrangler secret put JWT_SECRET`).');
    return c.json({ error: 'Server nie je správne nakonfigurovaný (chýba JWT_SECRET). Kontaktuj administrátora.' }, 500);
  }

  const token = await sign(
    { sub: user.id, email: user.email, role: user.role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 },
    c.env.JWT_SECRET,
    'HS256',
  );

  // Ak je to organizácia/hotelier, dotiahneme jeho podnik(y), nech si ich front-end rovno prednastaví
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

  return c.json({
    token,
    user: { id: user.id, email: user.email, role: user.role, display_name: user.display_name },
    businesses,
  });
});

// Stateless JWT nemá čo na serveri invalidovať — endpoint existuje kvôli konzistentnému API,
// front-end si po zavolaní tejto routy zmaže token z localStorage.
authRoutes.post('/logout', (c) => c.json({ ok: true }));
