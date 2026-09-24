const API_BASE_URL = 'https://naskraj-api.vandrocz-contact.workers.dev';
const MAP_ORIGIN = 'https://maps.vandro.cz';
const GOOGLE_CLIENT_ID = 'SEM_VLOZ_SVOJ_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
const RECAPTCHA_SITE_KEY = '';

function getToken() { return localStorage.getItem('naskraj_token'); }
function setToken(t) { localStorage.setItem('naskraj_token', t); }
function clearToken() { localStorage.removeItem('naskraj_token'); }
function getStoredUser() { try { return JSON.parse(localStorage.getItem('naskraj_user') || 'null'); } catch { return null; } }
function setStoredUser(u) { localStorage.setItem('naskraj_user', JSON.stringify(u)); }
function clearStoredUser() { localStorage.removeItem('naskraj_user'); }
function getStoredBusinesses() { try { return JSON.parse(localStorage.getItem('naskraj_businesses') || '[]'); } catch { return []; } }
function setStoredBusinesses(b) { localStorage.setItem('naskraj_businesses', JSON.stringify(b || [])); }

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData) && options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : null;

  if (!res.ok) {
    const err = new Error((data && data.error) || `Chyba API (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function apiGet(path) { return apiFetch(path, { method: 'GET' }); }
function apiPost(path, body) { return apiFetch(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }); }
function apiPatch(path, body) { return apiFetch(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }); }
function apiDelete(path, body) { return apiFetch(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }); }

function getUrlParam(key) { return new URLSearchParams(location.search).get(key); }
function clearUrlParams() { if (location.search) history.replaceState(null, '', location.pathname); }

async function compressImage(file, opts = {}) {
  const { maxDim = 1600, quality = 0.82, minBytes = 150 * 1024 } = opts;
  if (!file || !file.type || !file.type.startsWith('image/')) return file;
  if (file.size <= minBytes) return file;
  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width > maxDim || height > maxDim) {
      const ratio = Math.min(maxDim / width, maxDim / height);
      width = Math.round(width * ratio); height = Math.round(height * ratio);
    }
    let canvas, ctx;
    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(width, height); ctx = canvas.getContext('2d');
    } else {
      canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      ctx = canvas.getContext('2d');
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    if (bitmap.close) bitmap.close();
    let blob;
    if (canvas.convertToBlob) blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    else blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    const newName = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (err) {
    console.warn('Kompresia zlyhala:', err);
    return file;
  }
}

async function compressImageList(files, opts) {
  const arr = Array.from(files || []); const out = [];
  for (const f of arr) out.push(await compressImage(f, opts));
  return out;
}

// ============================================================
// GOOGLE SIGN-IN
// ============================================================
let _googleInitialized = false;

function initGoogleSignIn(onCredential) {
  if (!window.google?.accounts?.id) return false;
  if (!_googleInitialized) {
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => { if (response?.credential) onCredential(response.credential); },
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    _googleInitialized = true;
  }
  return true;
}

function renderGoogleButton(containerEl, onCredential) {
  if (!initGoogleSignIn(onCredential)) {
    setTimeout(() => renderGoogleButton(containerEl, onCredential), 1000);
    return;
  }
  window.google.accounts.id.renderButton(containerEl, {
    theme: 'outline', size: 'large', text: 'signin_with',
    shape: 'pill', logo_alignment: 'left', width: 320,
  });
}

async function handleGoogleCredential(credential) {
  try {
    const data = await apiPost('/api/auth/google', { credential });
    // 🔑 Použi zdieľaný finishLogin z account.js (obsahuje renderApp + redirect)
    if (typeof finishLogin === 'function') {
      finishLogin(data);
    } else {
      // Fallback (keby sa account.js nenačítal)
      setToken(data.token);
      setStoredUser(data.user);
      setStoredBusinesses(data.businesses || []);
      state.token = data.token;
      state.user = data.user;
      state.businesses = data.businesses || [];
      state.tab = 'account';
      state.overlay = null;
      showToast(`Vítej, ${data.user.display_name}!`);
      if (typeof renderApp === 'function') renderApp();
      if (typeof loadNotifications === 'function') loadNotifications();
    }
  } catch (err) {
    showToast(err.message);
  }
}

// ============================================================
// reCAPTCHA v3
// ============================================================
async function getRecaptchaToken(action) {
  if (!RECAPTCHA_SITE_KEY || RECAPTCHA_SITE_KEY === 'SEM_VLOZ_SVOJ_RECAPTCHA_SITE_KEY') return '';
  if (!window.grecaptcha) return '';
  return new Promise((resolve) => {
    try {
      grecaptcha.ready(async () => {
        try { resolve((await grecaptcha.execute(RECAPTCHA_SITE_KEY, { action })) || ''); }
        catch { resolve(''); }
      });
    } catch { resolve(''); }
  });
}

// ============================================================
// URL + HTML HELPERS
// ============================================================

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s); }

function shortenUrl(url) {
  let s = String(url).replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  const slash = s.indexOf('/');
  if (slash === -1) return s;
  const domain = s.slice(0, slash);
  const rest = s.slice(slash);
  if (rest.length <= 12) return s;
  return domain + '/…';
}

// Skrátenie linkov priamo v HTML — pre lightbox (kde chceme plný text s linkami)
function shortenLinksInHtml(html) {
  if (!html) return html;
  return String(html).replace(
    /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi,
    (match, pre, href, post, text) => {
      const innerText = String(text || '').replace(/<[^>]+>/g, '').trim();
      const isBareUrl = !innerText || /^https?:\/\//i.test(innerText) || innerText === href;
      let label;
      if (isBareUrl) {
        label = shortenUrl(innerText || href);
      } else {
        label = innerText.length > 26 ? innerText.slice(0, 24).trim() + '…' : innerText;
      }
      return `<a href="${escapeAttr(href)}" title="${escapeAttr(href)}" rel="noopener nofollow ugc" target="_blank">${escapeHtml(label)}</a>`;
    },
  );
}

// Extrakcia liniek z HTML pre karty — vráti { text, links }
// Linky sa v karte vykreslia ako samostatné tlačidlá POD textom.
function extractLinks(html) {
  if (!html) return { text: '', links: [] };
  let s = String(html);
  const links = [];

  // Extrahuj všetky <a href="...">...</a>
  s = s.replace(
    /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (match, href, innerText) => {
      const rawLabel = String(innerText || '').replace(/<[^>]+>/g, '').trim();
      const isBareUrl = !rawLabel || /^https?:\/\//i.test(rawLabel) || rawLabel === href;
      let label;
      if (isBareUrl) {
        label = shortenUrl(rawLabel || href);
      } else {
        label = rawLabel.length > 22 ? rawLabel.slice(0, 20).trim() + '…' : rawLabel;
      }
      links.push({ href, label });
      return '';
    },
  );

  // Odstráň ostatné HTML tagy
  s = s.replace(/<br\s*\/?>/gi, ' ');
  s = s.replace(/<\/p>/gi, ' ');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ')
       .replace(/&amp;/g, '&')
       .replace(/&lt;/g, '<')
       .replace(/&gt;/g, '>')
       .replace(/&quot;/g, '"')
       .replace(/&#39;/g, "'");
  s = s.replace(/\s+/g, ' ').trim();

  return { text: s, links };
}
