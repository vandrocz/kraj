// ============================================================
// STAV APLIKÁCIE
// ============================================================
const state = {
  tab: 'collections',              // 'collections' | 'map' | 'organizations' | 'services' | 'account'
  servicesTab: 'accommodation',    // 'accommodation' | 'gastro'
  mapWeatherOn: false,
  mapTrafficOn: false,

  user: getStoredUser(),
  token: getToken(),
  businesses: getStoredBusinesses(),
  authView: 'login',               // 'login' | 'register' — keď nie je prihlásený

  collections: { active: null, waiting: [] },
  socialFeeds: {
    organization: { items: [], search: '', region: '', district: '', type: '' },
    accommodation: { items: [], search: '', region: '', district: '', type: '' },
    gastro: { items: [], search: '', region: '', district: '', type: '', cuisine: '' },
  },

  wallet: null,          // { credit_balance, status, contributions }
  adminPending: null,    // { organizations, accommodation, restaurants }
  adminReports: null,

  loading: {},           // per-section loading flags
};

function fmt(n) { return Number(n || 0).toLocaleString('cs-CZ'); }

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso.includes('Z') ? iso : iso + 'Z').getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'práve teraz';
  if (min < 60) return `pred ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `pred ${hours} h`;
  return `pred ${Math.floor(hours / 24)} d`;
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

// ============================================================
// SPODNÁ NAVIGÁCIA (5 tlačidiel)
// ============================================================
const TABS = [
  { key: 'collections', icon: 'heart', label: 'Zbierky' },
  { key: 'map', icon: 'compass', label: 'Mapa výletov' },
  { key: 'organizations', icon: 'castle', label: 'Organizace' },
  { key: 'services', icon: 'utensils', label: 'Služby' },
  { key: 'account', icon: 'userCog', label: 'Můj účet' },
];

function renderBottomNav() {
  const btns = TABS.map((t) => `
    <button class="bottom-nav-btn ${state.tab === t.key ? 'is-active' : ''}" data-action="set-tab" data-tab="${t.key}">
      ${icon(t.icon, { size: state.tab === t.key ? 21 : 19 })}
      <span class="visually-hidden">${t.label}</span>
    </button>
  `).join('');
  return `<nav class="bottom-nav">${btns}</nav>`;
}

// ============================================================
// FILTER BAR (znovupoužiteľný pre 3 sociálne feedy)
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
// HLAVNÝ RENDER
// ============================================================
function renderApp() {
  const root = document.getElementById('root');
  let pageHtml = '';

  if (state.tab === 'collections') pageHtml = renderCollectionsPage();
  else if (state.tab === 'map') pageHtml = renderMapPage();
  else if (state.tab === 'organizations') pageHtml = renderOrganizationsPage();
  else if (state.tab === 'services') pageHtml = renderServicesPage();
  else if (state.tab === 'account') pageHtml = renderAccountPage();

  const isMap = state.tab === 'map';

  root.innerHTML = `
    <div class="app-shell">
      ${pageHtml}
      ${renderBottomNav()}
      ${isMap ? '' : renderLightbox()}
      ${isMap ? '' : renderDetailModal()}
    </div>
  `;

  if (isMap) attachMapPostMessageBridge();
}

function switchTab(tab) {
  state.tab = tab;
  renderApp();
  // Lenivé (lazy) načítanie dát pri prvom vstupe do sekcie
  if (tab === 'collections' && state.collections.waiting.length === 0 && !state.collections.active) loadCollections();
  if (tab === 'organizations' && state.socialFeeds.organization.items.length === 0) loadSocialFeed('organization');
  if (tab === 'services') {
    const key = state.servicesTab;
    if (state.socialFeeds[key].items.length === 0) loadSocialFeed(key);
  }
  if (tab === 'account' && isLoggedIn() && !state.wallet) loadWallet();
}
