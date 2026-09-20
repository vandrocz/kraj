// ============================================================
// Web Push — VAPID + AES-GCM encryption (vlastná implementácia)
// Bez externých knižníc, funguje vo Workers.
// ============================================================

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
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
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
  // VAPID private key je raw 32-byte EC P-256 scalar
  // VAPID public key je raw 65-byte uncompressed point (0x04 || X || Y)
  const pub = b64uToBytes(b64uPublicKey);
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error('Neplatný VAPID public key.');
  const d = b64uToBytes(b64uPrivateKey);
  if (d.length !== 32) throw new Error('Neplatný VAPID private key.');

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
  const aud = new URL(endpoint).origin;
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
  // ES256 signature musí byť raw R||S (64 bajtov) — Web Crypto to vracia tak
  const jwt = `${signingInput}.${bytesToB64u(sig)}`;
  return `vapid t=${jwt}, k=${publicKey}`;
}

// Zašifruj payload podľa RFC 8291 (aes128gcm)
async function encryptPayload(payloadStr, p256dhB64u, authB64u) {
  const clientPubBytes = b64uToBytes(p256dhB64u); // 65 bytes
  const authSecret = b64uToBytes(authB64u); // 16 bytes

  // 1) Vygeneruj server ECDH P-256
  const serverKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
  );
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey)); // 65

  // 2) Import client public
  const clientPub = await crypto.subtle.importKey(
    'raw', clientPubBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  );

  // 3) ECDH shared secret
  const sharedBits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPub }, serverKeys.privateKey, 256,
  ));

  // 4) HKDF s auth secretom → IKM
  const authKey = await crypto.subtle.importKey('raw', authSecret, { name: 'HKDF' }, false, ['deriveBits']);
  const prkKey = await crypto.subtle.importKey('raw', sharedBits, { name: 'HKDF' }, false, ['deriveBits']);

  // salt (16 random bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // IKM = HKDF(auth_secret, shared_secret, "WebPush: info\0" || client_pub || server_pub, 32)
  const ikm = new Uint8Array(await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: authSecret,
      info: concat(utf8('WebPush: info\0'), clientPubBytes, serverPubRaw),
    },
    prkKey, 256,
  ));

  // 5) CEK a NONCE
  const ikmKey = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits']);
  const cek = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: utf8('Content-Encoding: aes128gcm\0') },
    ikmKey, 128,
  ));
  const nonce = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: utf8('Content-Encoding: nonce\0') },
    ikmKey, 96,
  ));

  // 6) Padding: 2 bytes (0x02 || 0x00) + payload
  const plaintext = concat(utf8(payloadStr), new Uint8Array([2]));

  // 7) AES-128-GCM encrypt
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
    console.warn('[push] VAPID kľúče chýbajú.');
    return { ok: false, reason: 'no_vapid' };
  }
  const subject = env.VAPID_SUBJECT || 'mailto:admin@vandro.cz';
  const payload = JSON.stringify(payloadObj);

  try {
    const auth = await buildVapidAuth(subscription.endpoint, subject, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    const body = await encryptPayload(payload, subscription.p256dh, subscription.auth);

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

    if (res.status === 201 || res.status === 200 || res.status === 202) return { ok: true };
    if (res.status === 404 || res.status === 410) return { ok: false, gone: true, reason: 'gone' };
    console.warn('[push] push service vrátil', res.status);
    return { ok: false, reason: 'http_' + res.status };
  } catch (err) {
    console.error('[push] sendPush zlyhal:', err);
    return { ok: false, reason: 'exception', error: err.message };
  }
}

export async function sendPushToUser(env, userId, payloadObj) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?`,
    ).bind(userId).all();

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
