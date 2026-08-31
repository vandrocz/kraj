// Živé API — nasadený Cloudflare Worker (Hono)
const API_BASE_URL = 'https://naskraj-api.vandrocz-contact.workers.dev';

// Adresa mapovej subdomény, do ktorej posielame postMessage signály pre počasie/dopravu
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
function apiDelete(path) { return apiFetch(path, { method: 'DELETE' }); }
