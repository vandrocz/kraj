// ============================================================
// STAV APLIKÁCIE
// ============================================================
const state = {
  tab: 'organizations',
  overlay: null,
  overlayStack: [],

  user: getStoredUser(),
  token: getToken(),
  businesses: getStoredBusinesses(),
  authView: 'login',

  feedTitles: {},

  socialFeeds: {
    organization: { items: [], search: '', region: '', district: '', type: '', sort: 'for_you', next_cursor: null, loading_more: false },
    accommodation: { items: [], search: '', region: '', district: '', type: '', sort: 'for_you', next_cursor: null, loading_more: false },
    gastro: { items: [], search: '', region: '', district: '', type: '', cuisine: '', sort: 'for_you', next_cursor: null, loading_more: false },
  },
  events: { items: [], search: '', region: '', kind: '', when: 'upcoming', next_cursor: null, loading_more: false },

  nearby: { coords: null, radius: 25, kind: 'all', results: null, loading: false },

  profiles: {},
  stories: null,

  adminPending: null, adminPendingLoading: false,
  adminReports: null, adminReportsLoading: false,
  adminVerifications: null,
  adminPosts: null,

  notifications: null,
  unreadNotifications: 0,

  _settings: null, _blocks: null, _followers: null, _following: null,
  _searchQuery: '', _searchResults: null,
  _totpSetup: null, _loginLogs: null,
  _twofaToken: null, _twofaStage: null,

  _bizProfileTab: 'posts',
  _bizEvents: null,
  _bizStats: null,
  _profileStats: null,
  _bookmarks: null,
  _eventDetail: null,

  _reviews: null, _myReview: null,
  _wishlist: null,
  _userBadges: null, _userCheckins: null, _businessCheckins: null,
  _checkinStatus: undefined, _wishlistStatus: undefined,
  _verificationStatus: undefined,
  _userProfileCheckins: null,

  _onboarding: null,
  _cookieConsent: false,
  _pushSubscribed: null,
  _editingPost: null,
  _storyReplyOpen: null,

  _modal: null,
  _modalLoading: false,

  lightbox: null,
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

let _renderScheduled = false;
function scheduleRender() {
  if (_renderScheduled) return;
  _renderScheduled = true;
  requestAnimationFrame(() => { _renderScheduled = false; renderApp(); });
}

let _infiniteObserver = null;
function setupInfiniteScroll(loadMoreFn) {
  if (_infiniteObserver) { _infiniteObserver.disconnect(); _infiniteObserver = null; }
  const target = document.querySelector('[data-load-more]');
  if (!target) return;
  _infiniteObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) loadMoreFn();
  }, { rootMargin: '300px' });
  _infiniteObserver.observe(target);
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
    'Hotely, penziony, chaty', 'Kde složit hlavu?',
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
  if (!state.feedTitles[key]) state.feedTitles[key] = pickRandomTitle(key);
  return state.feedTitles[key];
}

const TABS = [
  { key: 'organizations', icon: 'landmark', label: 'Organizace' },
  { key: 'accommodation', icon: 'bed', label: 'Ubytování' },
  { key: 'gastro', icon: 'coffee', label: 'Gastro' },
  { key: 'map', icon: 'mapPin', label: 'Mapa' },
  { key: 'events', icon: 'calendar', label: 'Akce' },
  { key: 'account', icon: 'user', label: 'Profil' },
];

const VALID_TABS = ['organizations', 'accommodation', 'gastro', 'map', 'events', 'account'];

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
        <input class="search-input" type="search" placeholder="Hledat podle názvu…" value="${escapeAttr(f.search)}" data-action="search-change" data-feed="${feedKey}" />
      </div>
      <div class="filter-row">${regionSelect}${districtSelect}${typeSelect}${cuisineSelect}${sortSelect}</div>
    </div>`;
}

// ============================================================
// MODAL
// ============================================================
function openModal(opts) {
  state._modal = opts || {};
  renderApp();
}
function closeModal() {
  state._modal = null;
  state._modalLoading = false;
  renderApp();
}
function renderModal() {
  const m = state._modal;
  if (!m) return '';
  return `
    <div class="modal-scrim" data-action="close-modal-scrim">
      <div class="modal-sheet" data-modal-sheet>
        <div class="modal-head">
          <h3>${escapeHtml(m.title || '')}</h3>
          <button class="modal-close" data-action="close-modal" aria-label="Zavřít">${icon('close', { size: 20 })}</button>
        </div>
        <form class="modal-form" data-action="submit-modal">
          <div class="modal-body">${m.body || ''}</div>
          <div class="modal-actions">
            <button type="button" class="modal-btn modal-btn-cancel" data-action="close-modal">Zrušit</button>
            <button type="submit" class="modal-btn ${m.danger ? 'modal-btn-danger' : 'modal-btn-primary'}" ${state._modalLoading ? 'disabled' : ''}>
              ${state._modalLoading ? 'Zpracovávám…' : escapeHtml(m.submitLabel || 'Potvrdit')}
            </button>
          </div>
        </form>
      </div>
    </div>`;
}

// ============================================================
// HLAVNÝ RENDER
// ============================================================
function renderApp() {
  const _active = document.activeElement;
  let _searchFocus = null;
  if (_active && _active.dataset && _active.dataset.action === 'search-change') {
    _searchFocus = { feed: _active.dataset.feed, selStart: _active.selectionStart || 0, selEnd: _active.selectionEnd || 0 };
  }
  let _otherFocus = null;
  if (_active && _active.dataset && _active.dataset.action && _active.dataset.action !== 'search-change') {
    if (['INPUT', 'TEXTAREA'].includes(_active.tagName)) {
      _otherFocus = {
        action: _active.dataset.action,
        id: _active.dataset.id || null,
        feed: _active.dataset.feed || null,
        selStart: _active.selectionStart || 0,
        selEnd: _active.selectionEnd || 0,
      };
    }
  }

  const root = document.getElementById('root');
  let pageHtml = '';

  if (state.overlay?.type === 'profile') pageHtml = renderProfileOverlay();
  else if (state.overlay?.type === 'profile-stats') pageHtml = renderProfileStatsOverlay();
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
  else if (state.overlay?.type === 'story-viewer') pageHtml = renderStoryViewerOverlay();
  else if (state.overlay?.type === 'create-story') pageHtml = renderCreateStoryOverlay();
  else if (state.overlay?.type === 'create-event') pageHtml = renderCreateEventOverlay();
  else if (state.overlay?.type === 'event-detail') pageHtml = renderEventDetailOverlay();
  else if (state.overlay?.type === 'bookmarks') pageHtml = renderBookmarksOverlay();
  else if (state.overlay?.type === 'nearby') pageHtml = renderNearbyOverlay();
  else if (state.overlay?.type === 'wishlist') pageHtml = renderWishlistOverlay();
  else if (state.overlay?.type === 'badges') pageHtml = renderBadgesOverlay();
  else if (state.overlay?.type === 'user-checkins') pageHtml = renderUserCheckinsOverlay();
  else if (state.overlay?.type === 'business-checkins') pageHtml = renderBusinessCheckinsOverlay();
  else if (state.overlay?.type === 'create-checkin') pageHtml = renderCreateCheckinOverlay();
  else if (state.overlay?.type === 'create-review') pageHtml = renderCreateReviewOverlay();
  else if (state.overlay?.type === 'onboarding') pageHtml = renderOnboardingOverlay();
  else if (state.overlay?.type === 'edit-post') pageHtml = renderEditPostOverlay();
  else if (state.overlay?.type === 'verification-request') pageHtml = renderVerificationRequestOverlay();
  else if (state.tab === 'organizations') pageHtml = renderFeedPage('organization', TYPES.organization, false);
  else if (state.tab === 'accommodation') pageHtml = renderFeedPage('accommodation', TYPES.accommodation, false);
  else if (state.tab === 'gastro') pageHtml = renderFeedPage('gastro', TYPES.restaurant, true);
  else if (state.tab === 'map') pageHtml = renderMapPage();
  else if (state.tab === 'events') pageHtml = renderEventsPage();
  else if (state.tab === 'account') pageHtml = renderAccountPage();

  const isMapTab = state.tab === 'map' && !state.overlay;
  const hideAll = state.overlay?.type === 'story-viewer' || state.overlay?.type === 'onboarding';
  const hideCookieBanner = hideAll || isMapTab;
  const hideLightbox = hideAll || isMapTab;

  root.innerHTML = `
    <div class="app-shell">
      ${pageHtml}
      ${hideAll ? '' : renderBottomNav()}
      ${hideLightbox ? '' : renderLightbox()}
      ${hideCookieBanner ? '' : renderCookieBanner()}
    </div>
    ${renderModal()}`;

  applySeo();

  if (_searchFocus) {
    const newInput = document.querySelector(`[data-action="search-change"][data-feed="${_searchFocus.feed}"]`);
    if (newInput) {
      newInput.focus({ preventScroll: true });
      try { newInput.setSelectionRange(_searchFocus.selStart, _searchFocus.selEnd); } catch {}
    }
  } else if (_otherFocus) {
    let sel = `[data-action="${_otherFocus.action}"]`;
    if (_otherFocus.id) sel += `[data-id="${_otherFocus.id}"]`;
    if (_otherFocus.feed) sel += `[data-feed="${_otherFocus.feed}"]`;
    const newInput = document.querySelector(sel);
    if (newInput) {
      newInput.focus({ preventScroll: true });
      try { newInput.setSelectionRange(_otherFocus.selStart, _otherFocus.selEnd); } catch {}
    }
  }

  if (!state.overlay) {
    if (state.tab === 'events' && state.events.next_cursor) setupInfiniteScroll(() => loadEvents(true));
    else if (['organizations', 'accommodation', 'gastro'].includes(state.tab)) {
      const k = state.tab === 'organizations' ? 'organization' : state.tab;
      if (state.socialFeeds[k].next_cursor) setupInfiniteScroll(() => loadSocialFeed(k, true));
    }
  }
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
  let k = kind; if (kind === 'organization') k = 'organizations'; if (kind === 'gastro') k = 'restaurants';
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'profile', kind: k, id };
  state._bizProfileTab = 'posts'; state._bizEvents = null; state._bizStats = null;
  state._reviews = null; state._myReview = null;
  state._checkinStatus = undefined; state._wishlistStatus = undefined; state._verificationStatus = undefined;
  state._userProfileCheckins = undefined;
  renderApp();
  window.scrollTo(0, 0);
}

function closeOverlay() { const prev = state.overlayStack.pop(); state.overlay = prev || null; renderApp(); }
function clearOverlay() { state.overlay = null; state.overlayStack = []; renderApp(); }
function openSettings() { state.overlay = { type: 'settings' }; renderApp(); }
function openSecurity() { state.overlay = { type: 'security' }; renderApp(); }
function openNotifications() { state.overlay = { type: 'notifications' }; renderApp(); loadNotifications(); }
function openSearch() { state.overlay = { type: 'search' }; renderApp(); }
function openBlocks() { state.overlay = { type: 'blocks' }; renderApp(); loadBlocks(); }
function openFollowers(kind, id) { state.overlay = { type: 'followers', kind, id }; renderApp(); loadFollowers(kind, id); }
function openFollowing() { state.overlay = { type: 'following' }; renderApp(); loadFollowing(); }
function openForgotPassword() { state.overlay = { type: 'forgot' }; renderApp(); }
function openLoginLogs() { state.overlay = { type: 'login-logs' }; renderApp(); loadLoginLogs(); }
function openBookmarks() { state.overlay = { type: 'bookmarks' }; state._bookmarks = null; renderApp(); loadBookmarks(); }
function openBadges() { state.overlay = { type: 'badges' }; state._userBadges = null; renderApp(); if (isLoggedIn()) loadUserBadges(state.user.id); }
function openUserCheckins(userId) { state.overlay = { type: 'user-checkins', userId }; state._userCheckins = null; renderApp(); loadUserCheckins(userId); }
function openWishlist() { state.overlay = { type: 'wishlist' }; state._wishlist = null; renderApp(); loadWishlist(); }

function persistTab(tab) { try { localStorage.setItem('naskraj_tab', tab); } catch {} }
function restoreTab() {
  try {
    const t = localStorage.getItem('naskraj_tab');
    if (t && VALID_TABS.includes(t)) return t;
  } catch {}
  return 'organizations';
}

function switchTab(tab) {
  state.overlay = null;
  state.overlayStack = [];
  state.tab = tab;
  persistTab(tab);
  getFeedTitle(tab);
  renderApp();
  if (tab === 'events' && state.events.items.length === 0) loadEvents();
  if (tab === 'organizations' && state.socialFeeds.organization.items.length === 0) loadSocialFeed('organization');
  if (tab === 'accommodation' && state.socialFeeds.accommodation.items.length === 0) loadSocialFeed('accommodation');
  if (tab === 'gastro' && state.socialFeeds.gastro.items.length === 0) loadSocialFeed('gastro');
  if (tab === 'account' && isLoggedIn()) loadNotifications();
}

// LIGHTBOX
function openLightbox(images, index = 0, caption = '', post = null) {
  state.lightbox = {
    images,
    index: Math.max(0, Math.min(index, images.length - 1)),
    caption,
    post,
  };
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
  const counter = document.getElementById('lightbox-counter');
  const info = document.getElementById('lightbox-info');
  const navPrev = document.querySelector('.lightbox-prev');
  const navNext = document.querySelector('.lightbox-next');

  if (img) img.src = lb.images[lb.index];
  if (counter) {
    counter.textContent = lb.images.length > 1 ? `${lb.index + 1} / ${lb.images.length}` : '';
    counter.style.display = lb.images.length > 1 ? '' : 'none';
  }
  if (navPrev) navPrev.style.display = lb.images.length > 1 ? '' : 'none';
  if (navNext) navNext.style.display = lb.images.length > 1 ? '' : 'none';

  if (info) {
    const post = lb.post;
    if (!post) {
      info.innerHTML = lb.caption ? `<p class="lightbox-caption">${escapeHtml(lb.caption)}</p>` : '';
    } else {
      const biz = post.business || {};
      info.innerHTML = `
        <header class="lightbox-post-head">
          <button class="post-avatar" data-action="open-profile" data-kind="${post.__feedKey || ''}" data-id="${biz.id || ''}"
                  style="display:flex;align-items:center;justify-content:center;background:var(--c-primary-light);color:var(--c-primary-dark);font-weight:800;font-size:15px;border-radius:var(--radius-round);width:40px;height:40px;flex-shrink:0;border:none;">
            ${(biz.name || '?').charAt(0).toUpperCase()}
          </button>
          <div style="flex:1;min-width:0">
            <p class="post-author">${escapeHtml(biz.name || '')} ${Number(biz.is_verified) ? icon('check', { size: 12, className: 'verified-badge-inline' }) : ''}</p>
            <p class="post-time">${biz.city ? `${escapeHtml(biz.city)}, ` : ''}${biz.district ? escapeHtml(biz.district) : ''} · ${timeAgo(post.created_at)}</p>
          </div>
        </header>
        <div class="lightbox-post-body">
          <div class="lightbox-post-text rich-text">${shortenLinksInHtml(post.html || escapeHtml(post.text || ''))}</div>
          ${post.geo ? `<p class="post-geo">${icon('location', { size: 13 })} ${escapeHtml(post.geo.place)}</p>` : ''}
        </div>
        <div class="lightbox-post-actions">
          <button class="post-action ${post.__liked ? 'is-liked' : ''}" data-action="toggle-post-like" data-id="${post.id}" data-feed="${post.__feedKey || ''}">
            ${icon('heart', { size: 22, filled: !!post.__liked })}
          </button>
          <span class="lightbox-stat">${fmt(post.likes || 0)}</span>
          <button class="post-action" data-action="toggle-comments" data-id="${post.id}" data-feed="${post.__feedKey || ''}">
            ${icon('comment', { size: 21 })}
          </button>
          <span class="lightbox-stat">${fmt(post.comment_count || 0)}</span>
          <button class="post-action" data-action="share-post" data-id="${post.id}" data-text="${escapeAttr(post.text || '')}">
            ${icon('share', { size: 21 })}
          </button>
        </div>
      `;
    }
  }
}

function renderLightbox() {
  return `
    <div class="lightbox" id="lightbox">
      <button class="lightbox-close" data-action="close-lightbox" aria-label="Zavřít">${icon('close', { size: 22 })}</button>
      <div class="lightbox-inner">
        <div class="lightbox-image-pane">
          <img src="" alt="" class="lightbox-img" id="lightbox-img" />
          <button class="lightbox-nav lightbox-prev" data-action="lightbox-prev" aria-label="Předchozí">${icon('chevronRight', { size: 26, className: 'flip-x' })}</button>
          <button class="lightbox-nav lightbox-next" data-action="lightbox-next" aria-label="Další">${icon('chevronRight', { size: 26 })}</button>
          <p class="lightbox-counter" id="lightbox-counter"></p>
        </div>
        <div class="lightbox-info-pane" id="lightbox-info"></div>
      </div>
    </div>`;
}

function renderCookieBanner() {
  if (state._cookieConsent) return '';
  try { if (localStorage.getItem('naskraj_cookies') === '1') { state._cookieConsent = true; return ''; } } catch {}
  return `
    <div class="cookie-banner" id="cookie-banner">
      <div class="cookie-body">
        <p class="cookie-text"><strong>Cookies a soukromí.</strong> Používáme pouze technicky nezbytné cookies a lokální úložiště pro přihlášení. Žádné reklamní ani analytické cookies třetích stran.</p>
        <div class="cookie-actions">
          <button class="cookie-btn cookie-btn-primary" data-action="accept-cookies">Rozumím</button>
          <a class="cookie-btn" href="/ochrana-osobnich-udaju" target="_blank" rel="noopener">Více info</a>
        </div>
      </div>
    </div>`;
}

function acceptCookies() {
  try { localStorage.setItem('naskraj_cookies', '1'); } catch {}
  state._cookieConsent = true;
  document.getElementById('cookie-banner')?.remove();
}

(function setupLightboxSwipe() {
  let startX = 0, startY = 0;
  document.addEventListener('touchstart', (e) => {
    if (!e.target.closest('.lightbox.is-open')) return;
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!e.target.closest('.lightbox.is-open')) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { if (dx < 0) lightboxNext(); else lightboxPrev(); }
  }, { passive: true });
})();

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.lightbox) { closeLightbox(); return; }
    if (state._modal) { closeModal(); return; }
  }
  if (!state.lightbox) return;
  if (e.key === 'ArrowRight') lightboxNext();
  else if (e.key === 'ArrowLeft') lightboxPrev();
});
