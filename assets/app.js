const state = {
  tab: 'events',
  overlay: null,
  overlayStack: [],

  user: getStoredUser(),
  token: getToken(),
  businesses: getStoredBusinesses(),
  authView: 'login',

  // Random feed titles (pevné v session, aby sa nemenili pri každom renderi)
  feedTitles: {},

  socialFeeds: {
    organization: { items: [], search: '', region: '', district: '', type: '', sort: 'for_you' },
    accommodation: { items: [], search: '', region: '', district: '', type: '', sort: 'for_you' },
    gastro: { items: [], search: '', region: '', district: '', type: '', cuisine: '', sort: 'for_you' },
  },
  events: { items: [], search: '', region: '', kind: '', when: 'upcoming' },

  profiles: {},
  stories: null,

  adminPending: null, adminPendingLoading: false,
  adminReports: null, adminReportsLoading: false,

  notifications: null,
  unreadNotifications: 0,

  _settings: null, _blocks: null, _followers: null, _following: null,
  _searchQuery: '', _searchResults: null,
  _totpSetup: null, _loginLogs: null,
  _twofaToken: null, _twofaStage: null,

  _bizProfileTab: 'posts',
  _bizEvents: null,
  _bizStats: null,

  threads: null, threadCurrent: null, threadMessages: null,
  groupsMy: null, groupsDiscover: null, groupCurrent: null,

  lightbox: null, // { images: [], index: 0, caption: '' }

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
  if (min < 1) return 'právě teď';
  if (min < 60) return `před ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `před ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `před ${d} d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `před ${w} týž.`;
  return new Date(n).toLocaleDateString('cs-CZ');
}

function formatEventDate(iso) {
  if (!iso) return '';
  let n = String(iso);
  if (!/[Zz]|[+-]\d{2}:?\d{2}$/.test(n)) n = n.replace(' ', 'T') + 'Z';
  const d = new Date(n);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isLoggedIn() { return !!(state.token && state.user); }

let toastTimer = null;
function showToast(message) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2600);
}

function renderHeader(title, rightHtml) {
  return `
    <header class="app-header">
      <h1 class="app-header-title">${title}</h1>
      <div class="app-header-right">${rightHtml || ''}</div>
    </header>`;
}

function renderBackHeader(title, rightHtml) {
  return `
    <header class="app-header">
      <button class="header-icon-btn" data-action="close-overlay" aria-label="Zpět">${icon('arrowLeft', { size: 20 })}</button>
      <h1 class="app-header-title" style="margin-left:4px">${title || ''}</h1>
      <div class="app-header-right">${rightHtml || ''}</div>
    </header>`;
}

// ---- Náhodné názvy feedov ----
const FEED_TITLES = {
  events: [
    'Co se děje?', 'Kam dnes vyrazit?', 'Kulturní program', 'Akce v okolí',
    'Dnes, zítra, o víkendu', 'Nezmeškej!', 'Tipy na akce', 'Zábava v kraji',
    'Naplánuj si víkend', 'Kde se potkáme?',
  ],
  organization: [
    'Kam na výlet?', 'Dnešní dobrodružství', 'Objevuj Česko', 'Za památkami',
    'Příroda a historie', 'Tipy na trip', 'Co navštívit?', 'Toulky krajem',
    'Za kulturou a zábavou', 'Výlety, které nadchnou',
  ],
  accommodation: [
    'Kde se vyspat?', 'Útulné noclehy', 'Ubytování na cestách', 'Přespání v přírodě',
    'Tipy na přenocování', 'Wellness a klid', 'Víkendový pobyt', 'Nocleh se srdcem',
    'Hotely, penziony, kempy', 'Kde složit hlavu?',
  ],
  gastro: [
    'Kam na jídlo?', 'Dobroty a chutě', 'Gurmánské tipy', 'Hladový cestovatel',
    'Mňam!', 'Restaurace, kavárny, hospody', 'Co si dnes dáme?', 'Ochutnej kraj',
    'Skvělá jídla', 'Za dobrým jídlem',
  ],
};

function pickRandomTitle(key) {
  const arr = FEED_TITLES[key] || ['Náš kraj'];
  return arr[Math.floor(Math.random() * arr.length)];
}

function getFeedTitle(key) {
  if (!state.feedTitles[key]) {
    state.feedTitles[key] = pickRandomTitle(key);
  }
  return state.feedTitles[key];
}

const TABS = [
  { key: 'events', icon: 'calendar', label: 'Akce' },
  { key: 'map', icon: 'mapPin', label: 'Mapa' },
  { key: 'organizations', icon: 'landmark', label: 'Organizace' },
  { key: 'accommodation', icon: 'bed', label: 'Ubytování' },
  { key: 'gastro', icon: 'coffee', label: 'Gastro' },
  { key: 'account', icon: 'user', label: 'Účet' },
];

function renderBottomNav() {
  const btns = TABS.map((t) => {
    const active = state.tab === t.key && !state.overlay;
    let badge = '';
    if (t.key === 'account' && state.unreadNotifications > 0 && !state.overlay) {
      badge = `<span class="nav-badge">${state.unreadNotifications > 9 ? '9+' : state.unreadNotifications}</span>`;
    }
    return `
      <button class="bottom-nav-btn ${active ? 'is-active' : ''}" data-action="set-tab" data-tab="${t.key}">
        ${icon(t.icon, { size: active ? 20 : 18 })}
        ${badge}
        <span class="visually-hidden">${t.label}</span>
      </button>`;
  }).join('');
  return `<nav class="bottom-nav">${btns}</nav>`;
}

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
  const sortSelect = `
    <select class="filter-select ${f.sort !== 'for_you' ? 'is-active' : ''}" data-action="filter-change" data-feed="${feedKey}" data-field="sort">
      <option value="for_you" ${f.sort === 'for_you' ? 'selected' : ''}>Pro tebe</option>
      <option value="recent" ${f.sort === 'recent' ? 'selected' : ''}>Nejnovější</option>
      <option value="trending" ${f.sort === 'trending' ? 'selected' : ''}>Trendy</option>
    </select>`;

  return `
    <div class="filter-bar">
      <div class="search-input-wrap">
        ${icon('search', { size: 17 })}
        <input class="search-input" type="search" placeholder="Hledat podle názvu…" value="${f.search}" data-action="search-change" data-feed="${feedKey}" />
      </div>
      <div class="filter-row">${regionSelect}${districtSelect}${typeSelect}${cuisineSelect}${sortSelect}</div>
    </div>`;
}

function renderApp() {
  const root = document.getElementById('root');
  let pageHtml = '';

  if (state.overlay?.type === 'profile') pageHtml = renderProfileOverlay();
  else if (state.overlay?.type === 'settings') pageHtml = renderSettingsOverlay();
  else if (state.overlay?.type === 'security') pageHtml = renderSecurityOverlay();
  else if (state.overlay?.type === 'notifications') pageHtml = renderNotificationsOverlay();
  else if (state.overlay?.type === 'search') pageHtml = renderSearchOverlay();
  else if (state.overlay?.type === 'blocks') pageHtml = renderBlocksOverlay();
  else if (state.overlay?.type === 'followers') pageHtml = renderFollowersOverlay();
  else if (state.overlay?.type === 'following') pageHtml = renderFollowingOverlay();
  else if (state.overlay?.type === 'forgot') pageHtml = renderForgotPasswordOverlay();
  else if (state.overlay?.type === 'reset-password') pageHtml = renderResetPasswordOverlay(state.overlay.token);
  else if (state.overlay?.type === 'login-logs') pageHtml = renderLoginLogsOverlay();
  else if (state.overlay?.type === 'threads') pageHtml = renderThreadsOverlay();
  else if (state.overlay?.type === 'thread') pageHtml = renderThreadOverlay();
  else if (state.overlay?.type === 'groups') pageHtml = renderGroupsOverlay();
  else if (state.overlay?.type === 'group') pageHtml = renderGroupDetailOverlay();
  else if (state.overlay?.type === 'story-viewer') pageHtml = renderStoryViewerOverlay();
  else if (state.overlay?.type === 'create-story') pageHtml = renderCreateStoryOverlay();
  else if (state.overlay?.type === 'create-event') pageHtml = renderCreateEventOverlay();
  else if (state.overlay?.type === 'event-detail') pageHtml = renderEventDetailOverlay();
  else if (state.overlay?.type === 'bookmarks') pageHtml = renderBookmarksOverlay();
  else if (state.tab === 'events') pageHtml = renderEventsPage();
  else if (state.tab === 'map') pageHtml = renderMapPage();
  else if (state.tab === 'organizations') pageHtml = renderFeedPage('organization', TYPES.organization, false);
  else if (state.tab === 'accommodation') pageHtml = renderFeedPage('accommodation', TYPES.accommodation, false);
  else if (state.tab === 'gastro') pageHtml = renderFeedPage('gastro', TYPES.restaurant, true);
  else if (state.tab === 'account') pageHtml = renderAccountPage();
  else if (state.overlay?.type === 'profile-stats') pageHtml = renderProfileStatsOverlay();

  const hideChrome = (state.tab === 'map' && !state.overlay) || state.overlay?.type === 'story-viewer';

  root.innerHTML = `
    <div class="app-shell">
      ${pageHtml}
      ${renderBottomNav()}
      ${hideChrome ? '' : renderLightbox()}
      ${hideChrome ? '' : renderDetailModal()}
    </div>`;

  applySeo();
}

async function applySeo() {
  try {
    let og = {
      title: 'Náš kraj — regionální platforma',
      description: 'Objevuj hrady, zámky, ubytování a gastro v Česku.',
      image: 'https://naskraj.vandro.cz/assets/og-default.jpg',
      url: 'https://naskraj.vandro.cz/',
    };
    if (state.overlay?.type === 'profile') {
      const d = state.profiles[`${state.overlay.kind}:${state.overlay.id}`];
      if (d?.profile) {
        og.title = `${d.profile.name || d.profile.display_name} — Náš kraj`;
        og.description = (d.profile.description || d.profile.bio || 'Profil na Náš kraj').slice(0, 160);
        og.image = d.profile.cover_url || d.profile.logo_url || d.profile.image_url || d.profile.avatar_url || og.image;
      }
    }
    document.getElementById('og-title')?.setAttribute('content', og.title);
    document.getElementById('og-desc')?.setAttribute('content', og.description);
    document.getElementById('og-image')?.setAttribute('content', og.image);
    document.getElementById('og-url')?.setAttribute('content', og.url);
    document.getElementById('meta-desc')?.setAttribute('content', og.description);
    document.title = og.title;
  } catch {}
}

function openProfile(kind, id) {
  let k = kind;
  if (kind === 'organization') k = 'organizations';
  if (kind === 'gastro') k = 'restaurants';
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'profile', kind: k, id };
  state._bizProfileTab = 'posts';
  state._bizEvents = null;
  state._bizStats = null;
  renderApp();
  window.scrollTo(0, 0);
}

function closeOverlay() {
  const prev = state.overlayStack.pop();
  state.overlay = prev || null;
  renderApp();
}

function clearOverlay() {
  state.overlay = null;
  state.overlayStack = [];
  renderApp();
}

function openSettings() { state.overlay = { type: 'settings' }; renderApp(); }
function openSecurity() { state.overlay = { type: 'security' }; renderApp(); }
function openNotifications() { state.overlay = { type: 'notifications' }; renderApp(); loadNotifications(); }
function openSearch() { state.overlay = { type: 'search' }; renderApp(); }
function openBlocks() { state.overlay = { type: 'blocks' }; renderApp(); loadBlocks(); }
function openFollowers(kind, id) { state.overlay = { type: 'followers', kind, id }; renderApp(); loadFollowers(kind, id); }
function openFollowing() { state.overlay = { type: 'following' }; renderApp(); loadFollowing(); }
function openForgotPassword() { state.overlay = { type: 'forgot' }; renderApp(); }
function openLoginLogs() { state.overlay = { type: 'login-logs' }; renderApp(); loadLoginLogs(); }
function openThreads() { state.overlay = { type: 'threads' }; renderApp(); loadThreads(); }
function openGroups() { state.overlay = { type: 'groups' }; renderApp(); loadGroupsMy(); loadGroupsDiscover(); }
function openBookmarks() { state.overlay = { type: 'bookmarks' }; renderApp(); loadBookmarks(); }

function switchTab(tab) {
  state.overlay = null;
  state.overlayStack = [];
  state.tab = tab;
  // Vygeneruj nový random title pre tento tab (ak ešte nie je)
  getFeedTitle(tab);
  renderApp();
  if (tab === 'events' && state.events.items.length === 0) loadEvents();
  if (tab === 'organizations' && state.socialFeeds.organization.items.length === 0) loadSocialFeed('organization');
  if (tab === 'accommodation' && state.socialFeeds.accommodation.items.length === 0) loadSocialFeed('accommodation');
  if (tab === 'gastro' && state.socialFeeds.gastro.items.length === 0) loadSocialFeed('gastro');
  if (tab === 'account' && isLoggedIn()) loadNotifications();
}

// ---- Lightbox s carouselom ----
function openLightbox(images, index = 0, caption = '') {
  state.lightbox = { images, index: Math.max(0, Math.min(index, images.length - 1)), caption };
  updateLightboxDOM();
  document.getElementById('lightbox')?.classList.add('is-open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox')?.classList.remove('is-open');
  document.body.style.overflow = '';
  state.lightbox = null;
}

function lightboxPrev() {
  if (!state.lightbox) return;
  state.lightbox.index = (state.lightbox.index - 1 + state.lightbox.images.length) % state.lightbox.images.length;
  updateLightboxDOM();
}

function lightboxNext() {
  if (!state.lightbox) return;
  state.lightbox.index = (state.lightbox.index + 1) % state.lightbox.images.length;
  updateLightboxDOM();
}

function updateLightboxDOM() {
  const lb = state.lightbox;
  if (!lb || !lb.images.length) return;
  const img = document.getElementById('lightbox-img');
  const cap = document.getElementById('lightbox-caption');
  const counter = document.getElementById('lightbox-counter');
  const nav = document.querySelectorAll('.lightbox-nav');
  if (img) img.src = lb.images[lb.index];
  if (cap) cap.textContent = lb.caption || '';
  if (counter) {
    counter.textContent = lb.images.length > 1 ? `${lb.index + 1} / ${lb.images.length}` : '';
    counter.style.display = lb.images.length > 1 ? '' : 'none';
  }
  nav.forEach((n) => { n.style.display = lb.images.length > 1 ? '' : 'none'; });
}

function renderLightbox() {
  return `
    <div class="lightbox" id="lightbox">
      <button class="lightbox-close" data-action="close-lightbox" aria-label="Zavřít">${icon('close', { size: 22 })}</button>
      <button class="lightbox-nav lightbox-prev" data-action="lightbox-prev" aria-label="Předchozí">${icon('chevronRight', { size: 26, className: 'flip-x' })}</button>
      <button class="lightbox-nav lightbox-next" data-action="lightbox-next" aria-label="Další">${icon('chevronRight', { size: 26 })}</button>
      <div class="lightbox-body">
        <img src="" alt="" class="lightbox-img" id="lightbox-img" />
        <p class="lightbox-caption" id="lightbox-caption"></p>
        <p class="lightbox-counter" id="lightbox-counter"></p>
      </div>
    </div>`;
}

// Swipe v lightboxe
(function setupLightboxSwipe() {
  let startX = 0;
  let startY = 0;
  document.addEventListener('touchstart', (e) => {
    if (!e.target.closest('.lightbox.is-open')) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!e.target.closest('.lightbox.is-open')) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) lightboxNext();
      else lightboxPrev();
    }
  }, { passive: true });
})();

// Klávesy ←/→
document.addEventListener('keydown', (e) => {
  if (!state.lightbox) return;
  if (e.key === 'ArrowRight') lightboxNext();
  else if (e.key === 'ArrowLeft') lightboxPrev();
  else if (e.key === 'Escape') closeLightbox();
});
