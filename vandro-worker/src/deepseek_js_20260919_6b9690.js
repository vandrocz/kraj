// ============================================================
// reCAPTCHA v3 — serverová verifikácia
// Vyžaduje secret RECAPTCHA_SECRET_KEY
// Site key je verejný (frontend), secret je súkromný (backend)
// ============================================================

const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

/**
 * @param {object} env
 * @param {string} token  — token z grecaptcha.execute()
 * @param {string} expectedAction — 'register' | 'login'
 * @param {number} minScore — prah (0.0 – 1.0), default 0.5
 * @returns {{ ok: boolean, reason?: string, score?: number, skipped?: boolean }}
 */
export async function verifyRecaptcha(env, token, expectedAction, minScore = 0.5) {
  // Ak secret nie je nastavený, verifikáciu preskočíme (aby to nezablokovalo vývoj)
  if (!env.RECAPTCHA_SECRET_KEY) {
    console.warn('[recaptcha] RECAPTCHA_SECRET_KEY chýba — verifikácia sa preskakuje.');
    return { ok: true, skipped: true };
  }

  if (!token) return { ok: false, reason: 'missing_token' };

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: env.RECAPTCHA_SECRET_KEY,
        response: token,
      }).toString(),
    });
    if (!res.ok) return { ok: false, reason: 'verify_http_' + res.status };

    const data = await res.json();
    if (!data.success) {
      return { ok: false, reason: 'verify_failed', errors: data['error-codes'] };
    }
    if (expectedAction && data.action !== expectedAction) {
      return { ok: false, reason: 'wrong_action', got: data.action, expected: expectedAction };
    }
    if (typeof data.score === 'number' && data.score < minScore) {
      return { ok: false, reason: 'low_score', score: data.score };
    }
    return { ok: true, score: data.score };
  } catch (err) {
    console.error('[recaptcha] fetch zlyhal:', err);
    return { ok: false, reason: 'exception', message: err.message };
  }
}