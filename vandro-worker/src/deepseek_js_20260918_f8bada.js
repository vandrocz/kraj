// Rate limiting cez KV (NASKRAJ_LAJKY)
// Kľúč: rl:<scope>:<identifier>, hodnota: počet, TTL: windowSec

export async function rateLimit(env, scope, identifier, max, windowSec) {
  if (!env.NASKRAJ_LAJKY) return { ok: true };
  const key = `rl:${scope}:${identifier}`;
  const raw = await env.NASKRAJ_LAJKY.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= max) {
    return { ok: false, remaining: 0, retryAfter: windowSec };
  }
  await env.NASKRAJ_LAJKY.put(key, String(count + 1), { expirationTtl: windowSec });
  return { ok: true, remaining: max - count - 1 };
}

export function clientIp(c) {
  return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export function userAgent(c) {
  return (c.req.header('user-agent') || '').slice(0, 200);
}