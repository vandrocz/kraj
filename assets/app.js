// ============================================================
// STAV APLIKÁCIE
// ============================================================
const state = {
  tab: 'collections',
  overlay: null, // null | { type: 'profile', kind, id } | { type: 'settings' }

  user: getStoredUser(),
  token: getToken(),
  businesses: getStoredBusinesses(),
  authView: 'login',

  collections: { active: null, waiting: [] },
  socialFeeds: {
    organization: { items: [], search: '', region: '', district: '', type: '' },
    accommodation: { items: [], search: '', region: '', district: '', type: '' },
    gastro: { items: [], search: '', region: '', district: '', type: '', cuisine: '' },
  },
  profiles: {}, // cache: { 'user:id' | 'organizations:id' ...: data }

  wallet: null,
  adminPending: null,
  adminPendingLoading: false,
  adminReports: null,
  adminReportsLoading: false,

  loading: {},
};

function fmt(n) { return Number(n || 0).toLocaleString('cs-CZ'); }

function timeAgo(iso) {
  if (!iso) return '';
  let n = String(iso);
  if (!/[Zz]|[+-]\d{2}:?\d{2}$/.test(n)) n = n.replace(' ', 'T') + 'Z';
  const t = new Date(n).getTime();
  if (isNaN(t)) return '';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'práve teraz';
  if (min < 60) return `pred ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `pred ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `pred ${d} d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `pred ${w} týž.`;
  return new Date(n).toLocaleDateString('cs-CZ');
}

function isLoggedIn() { return !!(state.token && state.user); }

// ============================================================
// TOAST
// ============================================================
let toastTimer = null;
function showToast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2600);
}

// ============================================================
// HEADER
// ============================================================
function renderHeader(title, rightHtml) {
  return `
    <header class="app-header">
      <h1 class="app-header-title">${title}</h1>
      <div class="app-header-right">${rightHtml || ''}</div>
    </header>
  `;
}

function renderBackHeader(title, rightHtml) {
  return `
    <header class="app-header">
      <button class="header-icon-btn" data-action="close-overlay" aria-label="Zpět">${icon('arrowLeft', { size: 20 })}</button>
      <h1 class="app-header-title" style="margin-left:4px">${title || ''}</h1>
      <div class="app-header-right">${rightHtml || ''}</div>
    </header>
  `;
}

// ============================================================
// SPODNÁ NAVIGÁCIA — 6 tlačidiel
// ============================================================
const TABS = [
  { key: 'collections', icon: 'piggy', label: 'Sbírky' },
  { key: 'map', icon: 'mapPin', label: 'Mapa' },
  { key: 'organizations', icon: 'landmark', label: 'Organizace' },
  { key: 'accommodation', icon: 'bed', label: 'Ubytování' },
  { key: 'gastro', icon: 'coffee', label: 'Gastro' },
  { key: 'account', icon: 'user', label: 'Účet' },
];

function renderBottomNav() {
  const btns = TABS.map((t) => `
    <button class="bottom-nav-btn ${state.tab === t.key && !state.overlay ? 'is-active' : ''}" data-action="set-tab" data-tab="${t.key}">
      ${icon(t.icon, { size: state.tab === t.key && !state.overlay ? 20 : 18 })}
      <span class="visually-hidden">${t.label}</span>
    </button>
  `).join('');
  return `<nav class="bottom-nav">${btns}</nav>`;
}

// ============================================================
// FILTER BAR
// ============================================================
function renderFilterBar(feedKey, typeOptions, showCuisine) {
  const f = state.socialFeeds[feedKey];
  const regionSelect = `
    <select class="filter-select ${f.region ? 'is-active' : ''}" data-action="filter-change" data-feed="${feedKey}" data-field="region">
      <option value="">Všechny kraje</option>
      ${Object.keys(REGIONS).map((r) => `<option value="${r}" ${f.region === r ? 'selected' : ''}>${r}</option>`).join('')}
    </select>`;
  const districtOptions = f.region ? (REGIONS[f.region] || []) : [];
  const districtSelect = `
    <select class="filter-select ${f.district ? 'is-active' : ''}" data-action="filter-change" data-feed="${feedKey}" data-field="district" ${!f.region ? 'disabled' : ''}>
      <option value="">Všechny okresy</option>
      ${districtOptions.map((d) => `<option value="${d}" ${f.district === d ? 'selected' : ''}>${d}</option>`).join('')}
    </select>`;
  const typeSelect = `
    <select class="filter-select ${f.type ? 'is-active' : ''}" data-action="filter-change" data-feed="${feedKey}" data-field="type">
      <option value="">Všechny druhy</option>
      ${typeOptions.map((t) => `<option value="${t.value}" ${f.type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
    </select>`;
  const cuisineSelect = showCuisine ? `
    <select class="filter-select ${f.cuisine ? 'is-active' : ''}" data-action="filter-change" data-feed="${feedKey}" data-field="cuisine">
      <option value="">Všechny kuchyně</option>
      ${TYPES.cuisine.map((t) => `<option value="${t.value}" ${f.cuisine === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
    </select>` : '';

  return `
    <div class="filter-bar">
      <div class="search-input-wrap">
        ${icon('search', { size: 17 })}
        <input class="search-input" type="search" placeholder="Hledat podle názvu…" value="${f.search}"
               data-action="search-change" data-feed="${feedKey}" />
      </div>
      <div class="filter-row">${regionSelect}${districtSelect}${typeSelect}${cuisineSelect}</div>
    </div>
  `;
}

// ============================================================
// RENDER
// ============================================================
function renderApp() {
  const root = document.getElementById('root');
  let pageHtml = '';

  if (state.overlay?.type === 'profile') {
    pageHtml = renderProfileOverlay();
  } else if (state.overlay?.type === 'settings') {
    pageHtml = renderSettingsOverlay();
  } else if (state.tab === 'collections') {
    pageHtml = renderCollectionsPage();
  } else if (state.tab === 'map') {
    pageHtml = renderMapPage();
  } else if (state.tab === 'organizations') {
    pageHtml = renderFeedPage('organization', 'Organizace', TYPES.organization, false);
  } else if (state.tab === 'accommodation') {
    pageHtml = renderFeedPage('accommodation', 'Ubytování', TYPES.accommodation, false);
  } else if (state.tab === 'gastro') {
    pageHtml = renderFeedPage('gastro', 'Gastro', TYPES.restaurant, true);
  } else if (state.tab === 'account') {
    pageHtml = renderAccountPage();
  }

  const hideChrome = state.tab === 'map' && !state.overlay;

  root.innerHTML = `
    <div class="app-shell">
      ${pageHtml}
      ${renderBottomNav()}
      ${hideChrome ? '' : renderLightbox()}
      ${hideChrome ? '' : renderDetailModal()}
    </div>
  `;
}

function openProfile(kind, id) {
  // kind: 'user' | 'organizations' | 'organization' | 'accommodation' | 'restaurants' | 'gastro'
  let normalizedKind = kind;
  if (kind === 'organization') normalizedKind = 'organizations';
  if (kind === 'gastro') normalizedKind = 'restaurants';
  state.overlay = { type: 'profile', kind: normalizedKind, id };
  renderApp();
  window.scrollTo(0, 0);
}

function closeOverlay() {
  state.overlay = null;
  renderApp();
}

function openSettings() {
  state.overlay = { type: 'settings' };
  renderApp();
}

function switchTab(tab) {
  state.overlay = null;
  state.tab = tab;
  renderApp();
  if (tab === 'collections' && state.collections.waiting.length === 0 && !state.collections.active) loadCollections();
  if (tab === 'organizations' && state.socialFeeds.organization.items.length === 0) loadSocialFeed('organization');
  if (tab === 'accommodation' && state.socialFeeds.accommodation.items.length === 0) loadSocialFeed('accommodation');
  if (tab === 'gastro' && state.socialFeeds.gastro.items.length === 0) loadSocialFeed('gastro');
  if (tab === 'account' && isLoggedIn() && !state.wallet) loadWallet();
}
