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

  _adminTab: 'overview',
  adminUsers: null,
  adminUsersCounts: null,
  adminUserReports: null,
  adminStats: null,
  _adminUserQuery: '',
  _adminUserRole: '',
  _adminUserStatus: '',

  _settings: null, _blocks: null, _followers: null, _following: null,
  _searchQuery: '', _searchResults: null,
  _totpSetup: null, _loginLogs: null,
  _twofaToken: null, _twofaStage: null,

  _bizProfileTab: 'posts',
  _bizEvents: null,
  _bizStats: null,
  _profileStats: null,
  _profileStatsView: null,
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
  _cookieSettingsOpen: false,
  _cookieSettings: null,
  _pushSubscribed: null,
  _pushPrompted: false,
  _editingPost: null,
  _storyReplyOpen: null,

  _modal: null,
  _modalLoading: false,

  lightbox: null,
  loading: {},

  _mapNavCollapsed: true,
  _historyPushed: false,
};

let _mapIframeCache = null;

function pushHistoryState(type) {
  try {
    if (state._historyPushed) return;
    history.pushState({ naskraj: true, type }, '', location.href);
    state._historyPushed = true;
  } catch {}
}

function clearHistoryState() {
  try {
    if (state._historyPushed) {
      state._historyPushed = false;
      history.back();
    }
  } catch {}
}

window.addEventListener('popstate', () => {
  state._historyPushed = false;
  if (state.lightbox) { closeLightbox(true); return; }
  if (state.overlay) { closeOverlay(true); return; }
  if (state._modal) { closeModal(true); return; }
});

function fmt(n) { return Number(n || 0).toLocaleString('cs-CZ'); }

function timeAgo(iso) {
  if (!iso) return '';
  let n = String(iso);
  if (!/[Zz]|[+-]\d{2}:?\d{2}$/.test(n)) n = n.replace(' ', 'T') + 'Z';
  const t2 = new Date(n).getTime();
  if (isNaN(t2)) return '';
  const diff = Date.now() - t2;
  const min = Math.floor(diff / 60000);
  const lang = typeof getLanguage === 'function' ? getLanguage() : 'cs';
  if (min < 1) return lang === 'en' ? 'just now' : lang === 'sk' ? 'práve teraz' : 'právě teď';
  if (min < 60) return lang === 'en' ? `${min} min ago` : lang === 'sk' ? `pred ${min} min` : `před ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return lang === 'en' ? `${h} h ago` : lang === 'sk' ? `pred ${h} h` : `před ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return lang === 'en' ? `${d} d ago` : lang === 'sk' ? `pred ${d} d` : `před ${d} d`;
  const w = Math.floor(d / 7);
  if (w < 5) return lang === 'en' ? `${w} w ago` : lang === 'sk' ? `pred ${w} týž.` : `před ${w} týž.`;
  return new Date(n).toLocaleDateString(lang === 'en' ? 'en' : lang === 'sk' ? 'sk' : 'cs-CZ');
}

function formatEventDate(iso) {
  if (!iso) return '';
  let n = String(iso);
  if (!/[Zz]|[+-]\d{2}:?\d{2}$/.test(n)) n = n.replace(' ', 'T') + 'Z';
  const d = new Date(n);
  if (isNaN(d.getTime())) return iso;
  const lang = typeof getLanguage === 'function' ? getLanguage() : 'cs';
  return d.toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'sk' ? 'sk-SK' : 'cs-CZ', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

const APP_LOGO_URL = 'https://cdn.vandro.cz/Untitled15_20260522160351.png';

function renderHeader(title, rightHtml) {
  return `
    <header class="app-header">
      <img src="${APP_LOGO_URL}" alt="VANDRO" class="app-header-logo" />
      <h1 class="app-header-title">${title}</h1>
      <div class="app-header-right">${rightHtml || ''}</div>
    </header>`;
}

function renderBackHeader(title, rightHtml) {
  return `
    <header class="app-header">
      <button class="header-icon-btn" data-action="close-overlay" aria-label="${escapeAttr(t('common.back'))}">${icon('arrowLeft', { size: 20 })}</button>
      <h1 class="app-header-title" style="margin-left:4px">${title || ''}</h1>
      <div class="app-header-right">${rightHtml || ''}</div>
    </header>`;
}

const FEED_TITLES = {
  events: ['Co se děje?', 'Kam dnes vyrazit?', 'Kulturní program', 'Akce v okolí', 'Dnes, zítra, o víkendu', 'Nezmeškej!', 'Tipy na akce', 'Zábava v kraji', 'Naplánuj si víkend', 'Kde se potkáme?'],
  organization: ['Kam na výlet?', 'Dnešní dobrodružství', 'Objevuj Česko', 'Za památkami', 'Příroda a historie', 'Tipy na trip', 'Co navštívit?', 'Toulky krajem', 'Za kulturou a zábavou', 'Výlety, které nadchnou'],
  accommodation: ['Kde se vyspat?', 'Útulné noclehy', 'Ubytování na cestách', 'Přespání v přírodě', 'Tipy na přenocování', 'Wellness a klid', 'Víkendový pobyt', 'Nocleh se srdcem', 'Hotely, penziony, chaty', 'Kde složit hlavu?'],
  gastro: ['Kam na jídlo?', 'Dobroty a chutě', 'Gurmánské tipy', 'Hladový cestovatel', 'Mňam!', 'Restaurace, kavárny, hospody', 'Co si dnes dáme?', 'Ochutnej kraj', 'Skvělá jídla', 'Za dobrým jídlem'],
};

const FEED_TITLES_SK = {
  events: ['Čo sa deje?', 'Kam dnes vyraziť?', 'Kultúrny program', 'Podujatia v okolí', 'Dnes, zajtra, cez víkend', 'Nezmeškaj!', 'Tipy na podujatia', 'Zábava v kraji', 'Naplánuj si víkend', 'Kde sa stretneme?'],
  organization: ['Kam na výlet?', 'Dnešné dobrodružstvo', 'Objavuj Česko', 'Za pamiatkami', 'Príroda a história', 'Tipy na trip', 'Čo navštíviť?', 'Túlanie krajom', 'Za kultúrou a zábavou', 'Výlety, ktoré nadchnú'],
  accommodation: ['Kde sa vyspať?', 'Útulné nocľahy', 'Ubytovanie na cestách', 'Prespanie v prírode', 'Tipy na prenocovanie', 'Wellness a kľud', 'Víkendový pobyt', 'Nocľah so srdcom', 'Hotely, penzióny, chaty', 'Kde zložiť hlavu?'],
  gastro: ['Kam na jedlo?', 'Dobroty a chute', 'Gurmánske tipy', 'Hladný cestovateľ', 'Mňam!', 'Reštaurácie, kaviarne, hospody', 'Čo si dnes dáme?', 'Ochutnaj kraj', 'Skvelé jedlá', 'Za dobrým jedlom'],
};

const FEED_TITLES_EN = {
  events: ['What\'s happening?', 'Where to go today?', 'Cultural programme', 'Events nearby', 'Today, tomorrow, weekend', 'Don\'t miss it!', 'Event tips', 'Fun in the region', 'Plan your weekend', 'Where shall we meet?'],
  organization: ['Where to go?', 'Today\'s adventure', 'Discover Czechia', 'For landmarks', 'Nature and history', 'Trip tips', 'What to visit?', 'Wandering the region', 'Culture and fun', 'Trips that inspire'],
  accommodation: ['Where to sleep?', 'Cozy stays', 'Accommodation on the road', 'Sleeping in nature', 'Overnight tips', 'Wellness and calm', 'Weekend stay', 'Stay with heart', 'Hotels, guesthouses, cabins', 'Where to rest your head?'],
  gastro: ['Where to eat?', 'Treats and flavors', 'Gourmet tips', 'Hungry traveler', 'Yum!', 'Restaurants, cafés, pubs', 'What shall we have?', 'Taste the region', 'Great food', 'For good food'],
};

function pickRandomTitle(key) {
  const lang = typeof getLanguage === 'function' ? getLanguage() : 'cs';
  const dict = lang === 'en' ? FEED_TITLES_EN : lang === 'sk' ? FEED_TITLES_SK : FEED_TITLES;
  const arr = dict[key] || ['VANDRO'];
  return arr[Math.floor(Math.random() * arr.length)];
}

function getFeedTitle(key) {
  if (!state.feedTitles[key]) state.feedTitles[key] = pickRandomTitle(key);
  return state.feedTitles[key];
}

const TABS = [
  { key: 'organizations', icon: 'landmark', labelKey: 'nav.organizations' },
  { key: 'accommodation', icon: 'bed', labelKey: 'nav.accommodation' },
  { key: 'gastro', icon: 'coffee', labelKey: 'nav.gastro' },
  { key: 'map', icon: 'mapPin', labelKey: 'nav.map' },
  { key: 'events', icon: 'calendar', labelKey: 'nav.events' },
  { key: 'account', icon: 'user', labelKey: 'nav.account' },
];

const VALID_TABS = ['organizations', 'accommodation', 'gastro', 'map', 'events', 'account'];

function renderBottomNav() {
  const isMapTab = state.tab === 'map' && !state.overlay;
  const isMobile = window.innerWidth < 720;

  if (isMapTab && isMobile) {
    return `
      <nav class="bottom-nav bottom-nav--collapsed">
        <button class="bottom-nav-toggle" data-action="toggle-map-nav" aria-label="${escapeAttr(t('common.back'))}">
          ${icon('arrowLeft', { size: 20 })}
        </button>
      </nav>`;
  }

  const btns = TABS.map((tab) => {
    const active = state.tab === tab.key && !state.overlay;
    let badge = '';
    if (tab.key === 'account' && state.unreadNotifications > 0 && !state.overlay) {
      badge = `<span class="nav-badge">${state.unreadNotifications > 9 ? '9+' : state.unreadNotifications}</span>`;
    }
    const label = t(tab.labelKey);
    return `
      <button class="bottom-nav-btn ${active ? 'is-active' : ''}" data-action="set-tab" data-tab="${tab.key}" aria-label="${escapeAttr(label)}">
        ${icon(tab.icon, { size: active ? 20 : 18 })}
        ${badge}
        <span class="visually-hidden">${escapeHtml(label)}</span>
      </button>`;
  }).join('');

  return `<nav class="bottom-nav">${btns}</nav>`;
}

function renderFilterBar(feedKey, typeOptions, showCuisine) {
  const f = state.socialFeeds[feedKey];
  const regionSelect = `
    <select class="filter-select ${f.region ? 'is-active' : ''}" data-action="filter-change" data-feed="${feedKey}" data-field="region">
      <option value="">${escapeHtml(t('feed.allRegions'))}</option>
      ${Object.keys(REGIONS).map((r) => `<option value="${r}" ${f.region === r ? 'selected' : ''}>${r}</option>`).join('')}
    </select>`;
  const districtOptions = f.region ? (REGIONS[f.region] || []) : [];
  const districtSelect = `
    <select class="filter-select ${f.district ? 'is-active' : ''}" data-action="filter-change" data-feed="${feedKey}" data-field="district" ${!f.region ? 'disabled' : ''}>
      <option value="">${escapeHtml(t('feed.allDistricts'))}</option>
      ${districtOptions.map((d) => `<option value="${d}" ${f.district === d ? 'selected' : ''}>${d}</option>`).join('')}
    </select>`;
  const typeSelect = `
    <select class="filter-select ${f.type ? 'is-active' : ''}" data-action="filter-change" data-feed="${feedKey}" data-field="type">
      <option value="">${escapeHtml(t('feed.allTypes'))}</option>
      ${typeOptions.map((ty) => `<option value="${ty.value}" ${f.type === ty.value ? 'selected' : ''}>${escapeHtml(tType(ty.value))}</option>`).join('')}
    </select>`;
  const cuisineSelect = showCuisine ? `
    <select class="filter-select ${f.cuisine ? 'is-active' : ''}" data-action="filter-change" data-feed="${feedKey}" data-field="cuisine">
      <option value="">${escapeHtml(t('feed.allCuisines'))}</option>
      ${TYPES.cuisine.map((ty) => `<option value="${ty.value}" ${f.cuisine === ty.value ? 'selected' : ''}>${escapeHtml(tType(ty.value))}</option>`).join('')}
    </select>` : '';
  const sortSelect = `
    <select class="filter-select ${f.sort !== 'for_you' ? 'is-active' : ''}" data-action="filter-change" data-feed="${feedKey}" data-field="sort">
      <option value="for_you" ${f.sort === 'for_you' ? 'selected' : ''}>${escapeHtml(t('feed.sortForYou'))}</option>
      <option value="recent" ${f.sort === 'recent' ? 'selected' : ''}>${escapeHtml(t('feed.sortRecent'))}</option>
      <option value="trending" ${f.sort === 'trending' ? 'selected' : ''}>${escapeHtml(t('feed.sortTrending'))}</option>
    </select>`;

  return `
    <div class="filter-bar">
      <div class="search-input-wrap">
        ${icon('search', { size: 17 })}
        <input class="search-input" type="search" placeholder="${escapeAttr(t('feed.searchByName'))}" value="${escapeAttr(f.search)}" data-action="search-change" data-feed="${feedKey}" />
      </div>
      <div class="filter-row">${regionSelect}${districtSelect}${typeSelect}${cuisineSelect}${sortSelect}</div>
    </div>`;
}

// ============================================================
// MODAL
// ============================================================
function openModal(opts) {
  state._modal = opts || {};
  pushHistoryState('modal');
  renderApp();
}
function closeModal(fromHistory = false) {
  state._modal = null;
  state._modalLoading = false;
  if (!fromHistory && state._historyPushed) clearHistoryState();
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
          <button class="modal-close" type="button" data-action="close-modal" aria-label="${escapeAttr(t('common.close'))}">${icon('close', { size: 20 })}</button>
        </div>
        <form class="modal-form" data-action="submit-modal">
          <div class="modal-body">${m.body || ''}</div>
          <div class="modal-actions">
            <button type="button" class="modal-btn modal-btn-cancel" data-action="close-modal">${escapeHtml(t('common.cancel'))}</button>
            <button type="submit" class="modal-btn ${m.danger ? 'modal-btn-danger' : 'modal-btn-primary'}" ${state._modalLoading ? 'disabled' : ''}>
              ${state._modalLoading ? escapeHtml(t('common.processing')) : escapeHtml(m.submitLabel || t('common.confirm'))}
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

  const liveMapIframe = document.getElementById('vandro-map-iframe');
  if (liveMapIframe) {
    liveMapIframe.remove();
    _mapIframeCache = liveMapIframe;
  }

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
  else if (state.overlay?.type === 'hashtag') pageHtml = renderHashtagOverlay();
  else if (state.overlay?.type === 'threads') pageHtml = renderThreadsOverlay();
  else if (state.overlay?.type === 'thread') pageHtml = renderThreadOverlay();
  else if (state.overlay?.type === 'groups') pageHtml = renderGroupsOverlay();
  else if (state.overlay?.type === 'group') pageHtml = renderGroupDetailOverlay();
  else if (state.tab === 'organizations') pageHtml = renderFeedPage('organization', TYPES.organization, false);
  else if (state.tab === 'accommodation') pageHtml = renderFeedPage('accommodation', TYPES.accommodation, false);
  else if (state.tab === 'gastro') pageHtml = renderFeedPage('gastro', TYPES.restaurant, true);
  else if (state.tab === 'map') pageHtml = renderMapPage();
  else if (state.tab === 'events') pageHtml = renderEventsPage();
  else if (state.tab === 'account') pageHtml = renderAccountPage();

  const hideAll = state.overlay?.type === 'story-viewer' || state.overlay?.type === 'onboarding';
  const hideCookieBanner = hideAll;
  const hideLightbox = hideAll;

  root.innerHTML = `
    <div class="app-shell">
      ${pageHtml}
      ${hideAll ? '' : renderBottomNav()}
      ${hideLightbox ? '' : renderLightbox()}
      ${hideCookieBanner ? '' : renderCookieBanner()}
    </div>
    ${renderModal()}`;

  if (state.tab === 'map' && !state.overlay && !hideAll) {
    const wrap = document.querySelector('[data-map-wrap]');
    if (wrap) {
      let iframe = _mapIframeCache;
      if (!iframe) {
        iframe = createMapIframe();
        _mapIframeCache = iframe;
      }
      wrap.appendChild(iframe);
    }
  }

  applySeo();

  if (state.lightbox && state.lightbox.images && state.lightbox.images.length > 0 && !hideLightbox) {
    const lbEl = document.getElementById('lightbox');
    if (lbEl) {
      lbEl.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      applyLightboxPanelState();
      updateLightboxDOM();
    }
  }

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
      title: t('auth.welcomeTitle'),
      description: t('auth.welcomeLead').slice(0, 160),
      image: APP_LOGO_URL,
      url: 'https://naskraj.vandro.cz/',
    };
    if (state.overlay?.type === 'profile') {
      const d = state.profiles[`${state.overlay.kind}:${state.overlay.id}`];
      if (d?.profile) {
        og.title = `${d.profile.name || d.profile.display_name} — VANDRO`;
        og.description = (d.profile.description || d.profile.bio || '').slice(0, 160);
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
  if (state.lightbox) closeLightbox(true);
  let k = kind;
  if (kind === 'organization') k = 'organizations';
  if (kind === 'gastro') k = 'restaurants';
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'profile', kind: k, id };
  state._bizProfileTab = 'posts';
  state._bizEvents = null;
  state._bizStats = null;
  state._reviews = null;
  state._myReview = null;
  state._checkinStatus = undefined;
  state._wishlistStatus = undefined;
  state._verificationStatus = undefined;
  state._userProfileCheckins = undefined;
  pushHistoryState('overlay');
  renderApp();
  window.scrollTo(0, 0);
}

function closeOverlay(fromHistory = false) {
  const prev = state.overlayStack.pop();
  state.overlay = prev || null;
  if (!fromHistory && state._historyPushed) clearHistoryState();
  renderApp();
}

function clearOverlay() {
  state.overlay = null;
  state.overlayStack = [];
  renderApp();
}

function openSettings() { state.overlay = { type: 'settings' }; pushHistoryState('overlay'); renderApp(); }
function openSecurity() { state.overlay = { type: 'security' }; pushHistoryState('overlay'); renderApp(); }
function openNotifications() { state.overlay = { type: 'notifications' }; pushHistoryState('overlay'); renderApp(); loadNotifications(); }
function openSearch() { state.overlay = { type: 'search' }; pushHistoryState('overlay'); renderApp(); }
function openBlocks() { state.overlay = { type: 'blocks' }; pushHistoryState('overlay'); renderApp(); loadBlocks(); }
function openFollowers(kind, id) { state.overlay = { type: 'followers', kind, id }; pushHistoryState('overlay'); renderApp(); loadFollowers(kind, id); }
function openFollowing() { state.overlay = { type: 'following' }; pushHistoryState('overlay'); renderApp(); loadFollowing(); }
function openForgotPassword() { state.overlay = { type: 'forgot' }; pushHistoryState('overlay'); renderApp(); }
function openLoginLogs() { state.overlay = { type: 'login-logs' }; pushHistoryState('overlay'); renderApp(); loadLoginLogs(); }
function openBookmarks() { state.overlay = { type: 'bookmarks' }; state._bookmarks = null; pushHistoryState('overlay'); renderApp(); loadBookmarks(); }
function openBadges() { state.overlay = { type: 'badges' }; state._userBadges = null; pushHistoryState('overlay'); renderApp(); if (isLoggedIn()) loadUserBadges(state.user.id); }
function openUserCheckins(userId) { state.overlay = { type: 'user-checkins', userId }; state._userCheckins = null; pushHistoryState('overlay'); renderApp(); loadUserCheckins(userId); }
function openWishlist() { state.overlay = { type: 'wishlist' }; state._wishlist = null; pushHistoryState('overlay'); renderApp(); loadWishlist(); }

function persistTab(tab) { try { localStorage.setItem('naskraj_tab', tab); } catch {} }
function restoreTab() {
  try {
    const t2 = localStorage.getItem('naskraj_tab');
    if (t2 && VALID_TABS.includes(t2)) return t2;
  } catch {}
  return 'organizations';
}

function switchTab(tab) {
  state.overlay = null;
  state.overlayStack = [];
  if (state.lightbox) closeLightbox(true);
  if (state._historyPushed) { state._historyPushed = false; }
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

// ============================================================
// LIGHTBOX — s 3-stavovým panelom (compact / expanded / fullscreen)
// ============================================================
function openLightbox(images, index = 0, caption = '', post = null) {
  state.lightbox = {
    images,
    index: Math.max(0, Math.min(index, images.length - 1)),
    caption,
    post,
    panelState: 0, // 0 = compact (45vh), 1 = expanded (75vh), 2 = fullscreen (100vh)
  };
  updateLightboxDOM();
  const lbEl = document.getElementById('lightbox');
  if (lbEl) lbEl.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  pushHistoryState('lightbox');

  setTimeout(() => {
    applyLightboxPanelState();
    setupLightboxDrag();
  }, 10);

  if (post && post.id && post.__comments == null) {
    loadLightboxComments(post.id);
  }
}

async function loadLightboxComments(postId) {
  try {
    const data = await apiGet(`/api/feed/${postId}/comments`);
    if (state.lightbox?.post && state.lightbox.post.id === postId) {
      state.lightbox.post.__comments = data.comments || [];
      state.lightbox.post.comment_count = data.total || 0;
      updateLightboxDOM();
    }
  } catch (err) {
    if (state.lightbox?.post && state.lightbox.post.id === postId) {
      state.lightbox.post.__comments = [];
      updateLightboxDOM();
    }
  }
}

function closeLightbox(fromHistory = false) {
  document.getElementById('lightbox')?.classList.remove('is-open');
  document.body.style.overflow = '';
  teardownLightboxDrag();
  state.lightbox = null;
  if (!fromHistory && state._historyPushed) clearHistoryState();
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

// ============================================================
// Panel state — 3 úrovne
// ============================================================
function setLightboxPanelState(state_) {
  if (!state.lightbox) return;
  state.lightbox.panelState = Math.max(0, Math.min(2, state_));
  applyLightboxPanelState();
}

function cycleLightboxPanelState() {
  if (!state.lightbox) return;
  const cur = state.lightbox.panelState || 0;
  const next = (cur + 1) % 3;
  setLightboxPanelState(next);
}

function applyLightboxPanelState() {
  const lb = state.lightbox;
  if (!lb) return;
  const inner = document.querySelector('.lightbox-inner');
  const pane = document.querySelector('.lightbox-info-pane');
  const imgPane = document.querySelector('.lightbox-image-pane');
  if (!inner || !pane || !imgPane) return;

  inner.classList.remove('lb-panel-0', 'lb-panel-1', 'lb-panel-2');
  inner.classList.add(`lb-panel-${lb.panelState || 0}`);
}

// ============================================================
// Drag handle — swipe up/down na paneli
// ============================================================
let _lbDragHandlers = null;

function setupLightboxDrag() {
  teardownLightboxDrag();

  const handle = document.querySelector('.lightbox-drag-handle');
  const pane = document.querySelector('.lightbox-info-pane');
  if (!handle || !pane) return;

  let startY = 0;
  let startState = 0;
  let moved = false;

  const onTouchStart = (e) => {
    startY = e.touches[0].clientY;
    startState = state.lightbox?.panelState || 0;
    moved = false;
    handle.classList.add('is-dragging');
  };

  const onTouchMove = (e) => {
    if (!state.lightbox) return;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dy) > 6) moved = true;
  };

  const onTouchEnd = (e) => {
    handle.classList.remove('is-dragging');
    if (!state.lightbox) return;
    const endY = e.changedTouches[0].clientY;
    const dy = endY - startY;

    // Malý pohyb = klik → cyklus
    if (!moved || Math.abs(dy) < 20) {
      cycleLightboxPanelState();
      return;
    }

    // Swipe up = expand, swipe down = collapse
    if (dy < -40) {
      setLightboxPanelState(Math.min(2, startState + 1));
    } else if (dy > 40) {
      setLightboxPanelState(Math.max(0, startState - 1));
    }
  };

  const onClick = (e) => {
    e.preventDefault();
    cycleLightboxPanelState();
  };

  _lbDragHandlers = { onTouchStart, onTouchMove, onTouchEnd, onClick };
  handle.addEventListener('touchstart', onTouchStart, { passive: true });
  handle.addEventListener('touchmove', onTouchMove, { passive: true });
  handle.addEventListener('touchend', onTouchEnd, { passive: true });
  handle.addEventListener('click', onClick);
}

function teardownLightboxDrag() {
  if (!_lbDragHandlers) return;
  const handle = document.querySelector('.lightbox-drag-handle');
  if (handle) {
    handle.removeEventListener('touchstart', _lbDragHandlers.onTouchStart);
    handle.removeEventListener('touchmove', _lbDragHandlers.onTouchMove);
    handle.removeEventListener('touchend', _lbDragHandlers.onTouchEnd);
    handle.removeEventListener('click', _lbDragHandlers.onClick);
  }
  _lbDragHandlers = null;
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
      const logo = biz.logo_url || biz.image_url;
      const initial = (biz.name || '?').charAt(0).toUpperCase();
      const avatarHtml = logo
        ? `<img src="${escapeAttr(logo)}" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid var(--c-primary-light);" />`
        : `<span style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:var(--c-primary-light);color:var(--c-primary-dark);font-weight:800;font-size:17px;flex-shrink:0;border:2px solid var(--c-primary-light);">${initial}</span>`;

      const commentsReady = post.__comments != null;
      const commentsList = post.__comments || [];

      const commentsHtml = commentsList.map((c) => {
        const cInitial = (c.user_name || '?').charAt(0).toUpperCase();
        const avatarInner = c.user_avatar
          ? `<img src="${escapeAttr(c.user_avatar)}" alt="" class="lightbox-comment-avatar" />`
          : `<span class="lightbox-comment-avatar lightbox-comment-avatar-init">${cInitial}</span>`;
        return `
          <div class="lightbox-comment">
            <button type="button" class="lightbox-comment-avatar-btn" data-action="open-profile" data-kind="user" data-id="${c.user_id || ''}" aria-label="${escapeAttr(t('common.user'))}">
              ${avatarInner}
            </button>
            <div class="lightbox-comment-body">
              <strong data-action="open-profile" data-kind="user" data-id="${c.user_id || ''}">${escapeHtml(c.user_name || t('common.user'))}</strong>
              <span>${escapeHtml(c.comment_text)}</span>
              <span class="lightbox-comment-time">${timeAgo(c.created_at)}</span>
            </div>
          </div>
        `;
      }).join('');

      let commentsSection;
      if (!commentsReady) {
        commentsSection = `<p class="lightbox-comment-empty">${escapeHtml(t('common.loading'))}</p>`;
      } else if (commentsList.length === 0) {
        commentsSection = `<p class="lightbox-comment-empty">${escapeHtml(t('post.noComments'))}</p>`;
      } else {
        commentsSection = commentsHtml;
      }

      info.innerHTML = `
        <div class="lightbox-drag-handle" data-action="lightbox-cycle-panel" role="button" aria-label="Zobrazit komentáře"></div>
        <header class="lightbox-post-head">
          <button data-action="open-profile" data-kind="${post.__feedKey || ''}" data-id="${biz.id || ''}" style="background:none;border:none;padding:0;cursor:pointer;flex-shrink:0;">
            ${avatarHtml}
          </button>
          <div style="flex:1;min-width:0">
            <p class="post-author">${escapeHtml(biz.name || '')} ${Number(biz.is_verified) ? icon('check', { size: 12, className: 'verified-badge-inline' }) : ''}</p>
            <p class="post-time">${biz.city ? `${escapeHtml(biz.city)}, ` : ''}${biz.district ? escapeHtml(biz.district) : ''} · ${timeAgo(post.created_at)}</p>
          </div>
        </header>
        <div class="lightbox-post-body">
          <div class="lightbox-post-text rich-text">${linkifyHashtags(htmlToPlain(getPostText(post)))}</div>
          ${post.geo ? `<p class="post-geo">${icon('location', { size: 13 })} ${escapeHtml(post.geo.place)}</p>` : ''}
        </div>
        <div class="lightbox-post-actions">
          <button class="post-action ${post.__liked ? 'is-liked' : ''}" data-action="toggle-post-like" data-id="${post.id}" data-feed="${post.__feedKey || ''}">
            ${icon('spark', { size: 22, filled: !!post.__liked })}
          </button>
          <span class="lightbox-stat">${fmt(post.likes || 0)} ${escapeHtml(t('post.like'))}</span>
          <button class="post-action" data-action="share-post" data-id="${post.id}" data-text="${escapeAttr(getPostText(post))}">
            ${icon('share', { size: 21 })}
          </button>
        </div>

        <div class="lightbox-comments-section">
          <p class="lightbox-comments-title">${escapeHtml(t('post.comments'))} (${post.comment_count || 0})</p>
          <div class="lightbox-comments-list" id="lightbox-comments-list">
            ${commentsSection}
          </div>
          ${isLoggedIn() ? `
            <form class="lightbox-comment-form" data-action="submit-lightbox-comment" data-id="${post.id}" data-feed="${post.__feedKey || ''}">
              <input class="lightbox-comment-input" placeholder="${escapeAttr(t('post.writeComment'))}" data-lightbox-comment-input />
              <button type="submit" class="lightbox-comment-send" aria-label="${escapeAttr(t('common.submit'))}">${icon('send', { size: 18 })}</button>
            </form>
          ` : `
            <p class="lightbox-comment-empty" style="margin-top:8px">
              <a href="#" data-action="set-tab" data-tab="account" style="color:var(--c-primary-dark);font-weight:700">${escapeHtml(t('auth.loginTab'))}</a> ${escapeHtml(t('post.loginToComment'))}
            </p>
          `}
        </div>
      `;

      // Po rendere pripojíme drag handlery
      setTimeout(() => {
        setupLightboxDrag();
        applyLightboxPanelState();
      }, 0);
    }
  }
}

function getPostText(post) {
  return post.text || post.text_content || '';
}

function htmlToPlain(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function renderLightbox() {
  return `
    <div class="lightbox" id="lightbox">
      <button class="lightbox-close" data-action="close-lightbox" aria-label="${escapeAttr(t('common.close'))}">${icon('close', { size: 22 })}</button>
      <div class="lightbox-inner">
        <div class="lightbox-image-pane">
          <img src="" alt="" class="lightbox-img" id="lightbox-img" />
          <button class="lightbox-nav lightbox-prev" data-action="lightbox-prev" aria-label="${escapeAttr(t('common.prev'))}">${icon('chevronRight', { size: 26, className: 'flip-x' })}</button>
          <button class="lightbox-nav lightbox-next" data-action="lightbox-next" aria-label="${escapeAttr(t('common.next'))}">${icon('chevronRight', { size: 26 })}</button>
          <p class="lightbox-counter" id="lightbox-counter"></p>
        </div>
        <div class="lightbox-info-pane" id="lightbox-info"></div>
      </div>
    </div>`;
}

// ============================================================
// NOTIFIKÁCIE
// ============================================================
async function openNotification(notifId) {
  const n = (state.notifications || []).find((x) => x.id === notifId);
  if (!n) return;

  if (!n.read_at) {
    try { await apiPost(`/api/profile/me/notifications/${notifId}/read`, {}); } catch {}
    n.read_at = new Date().toISOString();
    state.unreadNotifications = Math.max(0, (state.unreadNotifications || 0) - 1);
  }

  if (state.overlay?.type === 'notifications') {
    state.overlay = state.overlayStack.pop() || null;
  }

  const t2 = n.type;
  const entType = n.entity_type;
  const entId = n.entity_id;

  if ((t2 === 'like' || t2 === 'comment' || t2 === 'reply' || t2 === 'mention') && entType === 'post' && entId) {
    try {
      const data = await apiGet(`/api/feed/post-by-id/${encodeURIComponent(entId)}`);
      if (!data.post) {
        showToast(t('common.notFound'));
        renderApp();
        return;
      }
      const post = data.post;
      try {
        const c = await apiGet(`/api/feed/${post.id}/comments`);
        post.__comments = c.comments || [];
        post.comment_count = c.total || 0;
      } catch {}

      if (!post.media || post.media.length === 0) {
        showToast(t('toasts.noPhoto'));
        renderApp();
        return;
      }

      renderApp();
      openLightbox(post.media, 0, post.text || '', post);
    } catch (err) {
      showToast(t('errors.loadFailed'));
      renderApp();
    }
    return;
  }

  if (t2 === 'dm' && entType === 'thread' && entId) {
    renderApp();
    openThreadById(entId);
    return;
  }

  if ((t2 === 'follow' || t2 === 'story_reply' || t2 === 'story_like') && n.actor_id) {
    renderApp();
    openProfile('user', n.actor_id);
    return;
  }

  if (t2 === 'verification_approved' || t2 === 'verification_rejected') {
    renderApp();
    switchTab('account');
    return;
  }

  renderApp();
}

// ============================================================
// GDPR COOKIE CONSENT V2
// ============================================================
const COOKIE_CONSENT_VERSION = '2';

function setCookieConsentShared(value, settings) {
  const payload = {
    v: COOKIE_CONSENT_VERSION,
    ts: Date.now(),
    necessary: true,
    analytics: !!(settings && settings.analytics),
    marketing: !!(settings && settings.marketing),
  };
  const json = JSON.stringify(payload);
  try { localStorage.setItem('naskraj_cookies', json); } catch {}
  try {
    const maxAge = 365 * 24 * 60 * 60;
    document.cookie = `naskraj_cookies=${encodeURIComponent(json)}; path=/; max-age=${maxAge}; domain=.vandro.cz; SameSite=Lax; Secure`;
  } catch {}
  try {
    document.cookie = `naskraj_cookies=${encodeURIComponent(json)}; path=/; max-age=${365 * 24 * 60 * 60}; SameSite=Lax`;
  } catch {}
}

function getCookieConsentShared() {
  try {
    const m = document.cookie.match(/(?:^|; )naskraj_cookies=([^;]+)/);
    if (m) {
      const parsed = JSON.parse(decodeURIComponent(m[1]));
      if (parsed && parsed.v === COOKIE_CONSENT_VERSION) return parsed;
    }
  } catch {}
  try {
    const raw = localStorage.getItem('naskraj_cookies');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.v === COOKIE_CONSENT_VERSION) return parsed;
    }
  } catch {}
  return null;
}

function hasValidCookieConsent() {
  return !!getCookieConsentShared();
}

function acceptCookies() {
  setCookieConsentShared('1', { analytics: true, marketing: true });
  state._cookieConsent = true;
  state._cookieSettingsOpen = false;
  document.getElementById('cookie-banner')?.remove();
}

function rejectCookies() {
  setCookieConsentShared('0', { analytics: false, marketing: false });
  state._cookieConsent = true;
  state._cookieSettingsOpen = false;
  document.getElementById('cookie-banner')?.remove();
}

function openCookieSettings() {
  state._cookieSettingsOpen = true;
  const existing = getCookieConsentShared();
  state._cookieSettings = existing || { necessary: true, analytics: false, marketing: false };
  renderApp();
}

function toggleCookieSetting(key, value) {
  state._cookieSettings = { ...(state._cookieSettings || {}), [key]: value };
}

function saveCookieSettings() {
  const s = state._cookieSettings || { necessary: true, analytics: false, marketing: false };
  setCookieConsentShared('1', { analytics: s.analytics, marketing: s.marketing });
  state._cookieConsent = true;
  state._cookieSettingsOpen = false;
  document.getElementById('cookie-banner')?.remove();
}

function renderCookieBanner() {
  if (state._cookieConsent) return '';
  const existing = getCookieConsentShared();
  if (existing) { state._cookieConsent = true; return ''; }

  const settings = state._cookieSettings || { necessary: true, analytics: false, marketing: false };
  const showSettings = state._cookieSettingsOpen;

  return `
    <div class="cookie-banner" id="cookie-banner" role="dialog" aria-modal="true" aria-label="${escapeAttr(t('cookie.title'))}">
      <div class="cookie-body">
        <p class="cookie-text">
          <strong>${escapeHtml(t('cookie.title'))}</strong>
          ${escapeHtml(t('cookie.text'))}
          ${!showSettings ? ' ' + escapeHtml(t('cookie.noTracking')) : ''}
        </p>
        ${showSettings ? `
          <div class="cookie-settings">
            <label class="cookie-toggle">
              <span>${escapeHtml(t('cookie.necessary'))}</span>
              <input type="checkbox" checked disabled />
            </label>
            <label class="cookie-toggle">
              <span>${escapeHtml(t('cookie.analytics'))}</span>
              <input type="checkbox" data-action="cookie-setting" data-key="analytics" ${settings.analytics ? 'checked' : ''} />
            </label>
            <label class="cookie-toggle">
              <span>${escapeHtml(t('cookie.marketing'))}</span>
              <input type="checkbox" data-action="cookie-setting" data-key="marketing" ${settings.marketing ? 'checked' : ''} />
            </label>
          </div>
        ` : ''}
        <div class="cookie-actions">
          ${showSettings ? `
            <button class="cookie-btn cookie-btn-primary" data-action="save-cookie-settings">${escapeHtml(t('cookie.save'))}</button>
          ` : `
            <button class="cookie-btn cookie-btn-primary" data-action="accept-cookies">${escapeHtml(t('cookie.acceptAll'))}</button>
            <button class="cookie-btn cookie-btn-primary" data-action="reject-cookies" style="background:transparent;border-color:rgba(255,255,255,0.5)">${escapeHtml(t('cookie.reject'))}</button>
            <button class="cookie-btn" data-action="open-cookie-settings">${escapeHtml(t('cookie.settings'))}</button>
          `}
          <a class="cookie-btn" href="/ochrana-osobnich-udaju.html" target="_blank" rel="noopener">${escapeHtml(t('cookie.more'))}</a>
        </div>
      </div>
    </div>`;
}

(function setupLightboxSwipe() {
  let startX = 0, startY = 0;
  document.addEventListener('touchstart', (e) => {
    if (!e.target.closest('.lightbox.is-open')) return;
    if (e.target.closest('.lightbox-comments-section')) return; // neruš swipe v komentároch
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!e.target.closest('.lightbox.is-open')) return;
    if (e.target.closest('.lightbox-comments-section')) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) lightboxNext();
      else lightboxPrev();
    }
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

function maybeRequestPushPermission() {
  if (!isLoggedIn()) return;
  if (state._pushPrompted) return;
  if (!('Notification' in window)) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (Notification.permission === 'granted') return;
  if (Notification.permission === 'denied') return;
  state._pushPrompted = true;
  setTimeout(async () => {
    if (!isLoggedIn()) return;
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        if (typeof enablePushNotifications === 'function') {
          await enablePushNotifications();
        }
      }
    } catch (err) {
      console.warn('[push-prompt] zlyhalo:', err);
    }
  }, 8000);
}
