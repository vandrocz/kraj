const API_BASE_URL = 'https://api.vandro.cz';
const MAP_ORIGIN = 'https://maps.vandro.cz'; // už se nepoužívá pro iframe; /mista/ SEO stránky zůstávají na subdoméně
// Sdílený podklad mapy (OpenFreeMap) — používá hlavní mapa i výběr místa (geo.js)
const MAP_STYLE_URL = location.origin + '/assets/map-style.json';
const MAP_STYLE_TOPO_URL = location.origin + '/assets/map-style-topo.json';
const GOOGLE_CLIENT_ID = '769764675952-1nb44qbpc4o7a1l5r14vt8phamom9209.apps.googleusercontent.com';
const RECAPTCHA_SITE_KEY = '6LeXt8UtAAAAAOOSYTkbrpC4gaotPw9-SUPEuvDo';

function getToken() { return localStorage.getItem('naskraj_token'); }
function setToken(t) { localStorage.setItem('naskraj_token', t); }
function clearToken() {
  localStorage.removeItem('naskraj_token');
  // uložené feedy obsahují osobní stav (lajky apod.), na sdíleném zařízení je po odhlášení smažeme
  try { Object.keys(localStorage).filter(k => k.startsWith('vandro_feedcache_v1:')).forEach(k => localStorage.removeItem(k)); } catch {}
}
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

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch (err) {
    const e = new Error('Nepodarilo sa pripojiť k serveru.');
    e.status = 0;
    throw e;
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  let data = null;
  if (isJson) {
    try { data = await res.json(); } catch { data = null; }
  } else {
    // Non-JSON odpoveď — vráť prázdny objekt, NIKDY null
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      const e = new Error(`Chyba API (${res.status})`);
      e.status = res.status;
      e.raw = text.slice(0, 200);
      throw e;
    }
    // 200 + non-JSON = podozrivé, ale nechceme null
    console.warn(`[api] Non-JSON 200 pre ${path}, content-type=${contentType}`);
    return {};
  }

  if (!res.ok) {
    const err = new Error((data && data.error) || `Chyba API (${res.status})`);
    err.status = res.status;
    err.data = data;
    // Vypršené nebo neplatné přihlášení: odhlásíme a řekneme to uživateli (místo tichých chyb v celé aplikaci)
    if (res.status === 401 && token && !path.startsWith('/api/auth/login') && !path.startsWith('/api/auth/register')) {
      handleSessionExpired();
    }
    throw err;
  }
  return data == null ? {} : data;   // ← NIKDY nevracaj null!
}

let _sessionExpiredShown = false;
function handleSessionExpired() {
  if (_sessionExpiredShown) return;
  _sessionExpiredShown = true;
  try { clearToken(); clearStoredUser(); } catch {}
  try { if (typeof state !== 'undefined') state.user = null; } catch {}
  try { if (typeof showToast === 'function') showToast('Přihlášení vypršelo. Přihlas se prosím znovu.'); } catch {}
  try { if (typeof switchTab === 'function') switchTab('account'); else if (typeof renderApp === 'function') renderApp(); } catch {}
  setTimeout(() => { _sessionExpiredShown = false; }, 5000);
}

// Přihlášení platí 30 dní a obnovuje se při používání (nový token, když zbývá méně než 20 dní)
function _tokenExpiry(tok) {
  try {
    const payload = JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return Number(payload.exp) || 0;
  } catch { return 0; }
}
async function maybeRefreshToken() {
  const tok = getToken();
  if (!tok) return;
  const exp = _tokenExpiry(tok);
  const left = exp - Math.floor(Date.now() / 1000);
  if (!exp || left <= 0 || left > 60 * 60 * 24 * 20) return;
  try {
    const r = await apiFetch('/api/auth/refresh', { method: 'POST', body: JSON.stringify({}) });
    if (r && r.token) setToken(r.token);
  } catch { /* offline apod. — zkusí se příště */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) maybeRefreshToken(); });
window.addEventListener('load', () => setTimeout(maybeRefreshToken, 2000));
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

// Skript Google se načítá až ve chvíli, kdy se zobrazí přihlášení/registrace
// (ne při každé návštěvě webu), aby se IP adresa zbytečně nepředávala Googlu.
let _googleScriptRequested = false;
function loadGoogleScript() {
  if (_googleScriptRequested || window.google?.accounts?.id) return;
  _googleScriptRequested = true;
  const sc = document.createElement('script');
  sc.src = 'https://accounts.google.com/gsi/client';
  sc.async = true; sc.defer = true;
  document.head.appendChild(sc);
}

function renderGoogleButton(containerEl, onCredential) {
  loadGoogleScript();
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
    setToken(data.token);
    setStoredUser(data.user);
    setStoredBusinesses(data.businesses || []);
    state.token = data.token;
    state.user = data.user;
    state.businesses = data.businesses || [];
    showToast(`Vítej, ${data.user.display_name}!`);
    if (typeof loadNotifications === 'function') loadNotifications();
    if (typeof maybeStartOnboarding === 'function') maybeStartOnboarding(data.user);
    if (typeof maybeSubscribePush === 'function') maybeSubscribePush();
  } catch (err) {
    showToast(err.message);
  }
}

// ============================================================
// reCAPTCHA v3
// ============================================================
async function getRecaptchaToken(action) {
  if (!RECAPTCHA_SITE_KEY || RECAPTCHA_SITE_KEY === '6LeXt8UtAAAAAOOSYTkbrpC4gaotPw9-SUPEuvDo') return '';
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

// Odkaz z uživatelských dat: povolené jen http(s), tel a mailto (ne javascript: apod.)
function safeHref(u) {
  const s = String(u == null ? '' : u).trim();
  return /^(https?:|tel:|mailto:)/i.test(s) ? s : '';
}

function shortenUrl(url) {
  let s = String(url).replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  const slash = s.indexOf('/');
  if (slash === -1) return s;
  const domain = s.slice(0, slash);
  const rest = s.slice(slash);
  if (rest.length <= 12) return s;
  return domain + '/…';
}

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

function extractLinks(html) {
  if (!html) return { text: '', links: [] };
  let s = String(html);
  const links = [];

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
