// ============================================================
// Web Push — VAPID + AES-GCM encryption (vlastná implementácia)
// Bez externých knižníc, funguje vo Workers.
// ============================================================

const DEBUG = true; // ← v produkcii prepni na false

function log(...args) { if (DEBUG) console.log('[push]', ...args); }
function warn(...args) { console.warn('[push]', ...args); }

function b64uToBytes(s) {
  let str = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToB64u(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  // Bezpečnejšie pre veľké polia
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

function utf8(str) { return new TextEncoder().encode(str); }

// Import VAPID private key (base64url) do CryptoKey pre ES256
async function importVapidPrivateKey(b64uPrivateKey, b64uPublicKey) {
  const pub = b64uToBytes(b64uPublicKey);
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error(`Neplatný VAPID public key (dĺžka ${pub.length}, prvý byte 0x${pub[0]?.toString(16)}).`);
  const d = b64uToBytes(b64uPrivateKey);
  if (d.length !== 32) throw new Error(`Neplatný VAPID private key (dĺžka ${d.length}, očakávané 32).`);

  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC', crv: 'P-256',
      d: bytesToB64u(d),
      x: bytesToB64u(pub.slice(1, 33)),
      y: bytesToB64u(pub.slice(33, 65)),
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

// Vytvor VAPID Authorization header (JWT podpísaný ES256)
async function buildVapidAuth(endpoint, subject, publicKey, privateKey) {
  const url = new URL(endpoint);
  const aud = url.origin;

  // Kontrola pre FCM
  if (url.hostname === 'fcm.googleapis.com' && aud !== 'https://fcm.googleapis.com') {
    warn('FCM aud sa líši od očakávaného:', aud);
  }

  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = { aud, exp, sub: subject };
  const signingInput = `${bytesToB64u(utf8(JSON.stringify(header)))}.${bytesToB64u(utf8(JSON.stringify(payload)))}`;

  const key = await importVapidPrivateKey(privateKey, publicKey);
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    utf8(signingInput),
  );

  // Sanity check: ES256 signature musí byť 64 bytes (raw R||S)
  if (sig.byteLength !== 64) {
    throw new Error(`Neočakávaná dĺžka ECDSA signature: ${sig.byteLength} (očakávané 64). Workers môže vracať DER formát — treba konverzia.`);
  }

  const jwt = `${signingInput}.${bytesToB64u(sig)}`;
  log('VAPID aud:', aud, '| sub:', subject, '| endpoint host:', url.hostname);
  return `vapid t=${jwt}, k=${publicKey}`;
}

// Zašifruj payload podľa RFC 8291 (aes128gcm)
async function encryptPayload(payloadStr, p256dhB64u, authB64u) {
  const clientPubBytes = b64uToBytes(p256dhB64u);
  if (clientPubBytes.length !== 65) throw new Error(`Neplatný p256dh (dĺžka ${clientPubBytes.length}).`);
  const authSecret = b64uToBytes(authB64u);
  if (authSecret.length !== 16) throw new Error(`Neplatný auth secret (dĺžka ${authSecret.length}).`);

  // 1) Server ECDH P-256
  const serverKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
  );
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));

  // 2) Import client public
  const clientPub = await crypto.subtle.importKey(
    'raw', clientPubBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  );

  // 3) ECDH shared secret
  const sharedBits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPub }, serverKeys.privateKey, 256,
  ));

  // 4) HKDF #1: PRK_key = HKDF-Extract(auth_secret, ecdh_secret); IKM = HKDF-Expand(PRK_key, key_info, 32)
  const ecdhKey = await crypto.subtle.importKey('raw', sharedBits, { name: 'HKDF' }, false, ['deriveBits']);
  const ikm = new Uint8Array(await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: authSecret,
      info: concat(utf8('WebPush: info\0'), clientPubBytes, serverPubRaw),
    },
    ecdhKey, 256,
  ));

  // 5) HKDF #2: CEK + NONCE
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const ikmKey = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits']);
  const cek = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: utf8('Content-Encoding: aes128gcm\0') },
    ikmKey, 128,
  ));
  const nonce = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: utf8('Content-Encoding: nonce\0') },
    ikmKey, 96,
  ));

  // 6) Padding: payload || 0x02 (posledný record)
  const plaintext = concat(utf8(payloadStr), new Uint8Array([2]));

  // 7) AES-128-GCM
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, aesKey, plaintext,
  ));

  // 8) Header: salt(16) || rs(4) || idlen(1) || keyid(65)
  const rs = new Uint8Array([0x00, 0x00, 0x10, 0x00]); // 4096
  const idlen = new Uint8Array([65]);
  const header = concat(salt, rs, idlen, serverPubRaw);

  return concat(header, ciphertext);
}

export async function sendPush(env, subscription, payloadObj) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    warn('VAPID kľúče chýbajú (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).');
    return { ok: false, reason: 'no_vapid' };
  }
  const subject = env.VAPID_SUBJECT || 'mailto:admin@vandro.cz';
  if (!subject.startsWith('mailto:') && !subject.startsWith('https://')) {
    warn('VAPID_SUBJECT by mal začínať "mailto:" alebo "https://", máš:', subject);
  }
  const payload = JSON.stringify(payloadObj);

  try {
    const auth = await buildVapidAuth(subscription.endpoint, subject, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    const body = await encryptPayload(payload, subscription.p256dh, subscription.auth);

    log('Odosielam push na', new URL(subscription.endpoint).hostname, '| payload', payload.length, 'B | body', body.length, 'B');

    const res = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        'TTL': '86400',
        'Urgency': 'normal',
      },
      body,
    });

    const statusText = await res.text().catch(() => '');
    if (res.status === 201 || res.status === 200 || res.status === 202) {
      log('✓ push OK', res.status);
      return { ok: true };
    }
    if (res.status === 404 || res.status === 410) {
      log('✗ subscription expirovala (', res.status, ')');
      return { ok: false, gone: true, reason: 'gone' };
    }
    warn('✗ push service vrátil', res.status, statusText.slice(0, 300));
    return { ok: false, reason: `http_${res.status}`, detail: statusText.slice(0, 300) };
  } catch (err) {
    console.error('[push] sendPush exception:', err);
    return { ok: false, reason: 'exception', error: err.message };
  }
}

export async function sendPushToUser(env, userId, payloadObj) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?`,
    ).bind(userId).all();

    log(`sendPushToUser(${userId}): ${results.length} subscriptions`);
    if (results.length === 0) return { sent: 0, failed: 0, removed: 0, total: 0, note: 'user nemá žiadne subscriptions' };

    let sent = 0, failed = 0, removed = 0;
    for (const sub of results) {
      const r = await sendPush(env, sub, payloadObj);
      if (r.ok) sent++;
      else {
        failed++;
        if (r.gone) {
          try { await env.DB.prepare(`DELETE FROM push_subscriptions WHERE id = ?`).bind(sub.id).run(); removed++; } catch {}
        }
      }
    }
    return { sent, failed, removed, total: results.length };
  } catch (err) {
    console.error('[push] sendPushToUser zlyhal:', err);
    return { error: err.message };
  }
}
