const API_BASE_URL = 'https://naskraj-api.vandrocz-contact.workers.dev';
const MAP_ORIGIN = 'https://maps.vandro.cz';

function getToken() { return localStorage.getItem('naskraj_token'); }
function setToken(t) { localStorage.setItem('naskraj_token', t); }
function clearToken() { localStorage.removeItem('naskraj_token'); }

function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('naskraj_user') || 'null'); } catch { return null; }
}
function setStoredUser(u) { localStorage.setItem('naskraj_user', JSON.stringify(u)); }
function clearStoredUser() { localStorage.removeItem('naskraj_user'); }

function getStoredBusinesses() {
  try { return JSON.parse(localStorage.getItem('naskraj_businesses') || '[]'); } catch { return []; }
}
function setStoredBusinesses(b) { localStorage.setItem('naskraj_businesses', JSON.stringify(b || [])); }

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : null;

  if (!res.ok) {
    const err = new Error((data && data.error) || `Chyba API (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function apiGet(path) { return apiFetch(path, { method: 'GET' }); }
function apiPost(path, body) { return apiFetch(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }); }
function apiPatch(path, body) { return apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) }); }
function apiDelete(path) { return apiFetch(path, { method: 'DELETE' }); }

// ============================================================
// KOMPRESIA OBRÁZKOV (klientsky, bez straty kvality)
// - zmenší max. rozmer na 1600 px (dostatočné pre retina displeje)
// - JPEG kvalita 0.82 — vizuálne identické, ale 5–10× menšie
// - ak je obrázok už malý, vracia originál
// ============================================================
async function compressImage(file, opts = {}) {
  const { maxDim = 1600, quality = 0.82, minBytes = 150 * 1024 } = opts;
  if (!file || !file.type || !file.type.startsWith('image/')) return file;
  if (file.size <= minBytes) return file;

  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width > maxDim || height > maxDim) {
      const ratio = Math.min(maxDim / width, maxDim / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }
    let canvas, ctx;
    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(width, height);
      ctx = canvas.getContext('2d');
    } else {
      canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      ctx = canvas.getContext('2d');
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    if (bitmap.close) bitmap.close();

    let blob;
    if (canvas.convertToBlob) {
      blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    } else {
      blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    }
    if (!blob) return file;

    // Ak by kompresia zväčšila (veľmi vzácne), vráť originál
    if (blob.size >= file.size) return file;

    const newName = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (err) {
    console.warn('Kompresia zlyhala, použijem originál:', err);
    return file;
  }
}

async function compressImageList(files, opts) {
  const arr = Array.from(files || []);
  const out = [];
  for (const f of arr) out.push(await compressImage(f, opts));
  return out;
}
