// ============================================================
// TOTP (RFC 6238) — bez externých knižníc, Web Crypto API
// ============================================================

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  const bytes = new Uint8Array(buf);
  let bits = 0, value = 0, output = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += B32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = B32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function generateSecret() {
  const buf = new Uint8Array(20); // 160-bit
  crypto.getRandomValues(buf);
  return base32Encode(buf);
}

async function hmacSha1(keyBytes, msgBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, msgBytes);
  return new Uint8Array(sig);
}

async function hotp(secretBase32, counter) {
  const key = base32Decode(secretBase32);
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter >>> 0);
  const h = await hmacSha1(key, new Uint8Array(buf));
  const offset = h[19] & 0x0f;
  const code = ((h[offset] & 0x7f) << 24) | ((h[offset + 1] & 0xff) << 16) | ((h[offset + 2] & 0xff) << 8) | (h[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

export async function totpAt(secretBase32, timeStepSec = 30, windowOffset = 0) {
  const counter = Math.floor(Date.now() / 1000 / timeStepSec) + windowOffset;
  return hotp(secretBase32, counter);
}

export async function verifyTotp(secretBase32, code, windowSize = 1, timeStepSec = 30) {
  if (!code || !/^\d{6}$/.test(String(code))) return false;
  for (let w = -windowSize; w <= windowSize; w++) {
    const expected = await totpAt(secretBase32, timeStepSec, w);
    if (expected === String(code)) return true;
  }
  return false;
}

export function otpauthUri({ secret, label, issuer = 'Náš kraj' }) {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export function generateRecoveryCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const buf = new Uint8Array(5);
    crypto.getRandomValues(buf);
    const hex = [...buf].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    codes.push(`${hex.slice(0, 5)}-${hex.slice(5, 10)}`);
  }
  return codes;
}
