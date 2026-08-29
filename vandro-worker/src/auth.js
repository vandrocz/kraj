// Hashovanie hesiel cez Web Crypto API (PBKDF2) — funguje natívne vo Workeroch,
// bez potreby externých knižníc ako bcrypt (tie vo Workers prostredí nefungujú dobre).

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
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBuf, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return bufToHex(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return { hash, salt: bufToHex(salt) };
}

export async function verifyPassword(password, hash, saltHex) {
  const salt = hexToBuf(saltHex);
  const candidate = await pbkdf2(password, salt);
  // Konštantný čas porovnania, aby sa predišlo timing útokom
  if (candidate.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

export function newId(prefix = '') {
  const raw = crypto.randomUUID();
  return prefix ? `${prefix}_${raw}` : raw;
}
