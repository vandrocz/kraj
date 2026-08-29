// ---- Pomocné funkcie ----
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'práve teraz';
  if (hours < 24) return `pred ${hours} h`;
  return `pred ${Math.floor(hours / 24)} d`;
}

function fmt(n) { return n.toLocaleString('cs-CZ'); }

// ---- Stav appky ----
const state = {
  activeTab: 'collections',
  sidebarOpen: false,
};

// ---- Sidebar ----
function renderSidebar() {
  const mode = state.activeTab === 'org' ? 'org' : 'user';
  const links = sidebarLinks[mode];
  const linksHtml = links.map((l) => `
    <button class="sidebar-link">
      ${icon(l.icon, { size: 19 })}
      <span>${l.label}</span>
      ${icon('chevronRight', { size: 16, className: 'sidebar-link-chevron' })}
    </button>
  `).join('');

  return `
    <div class="sidebar-scrim ${state.sidebarOpen ? 'is-open' : ''}" data-action="close-sidebar"></div>
    <aside class="sidebar-panel ${state.sidebarOpen ? 'is-open' : ''}">
      <div class="sidebar-top">
        <div class="sidebar-brand">
          <span class="sidebar-brand-mark">V</span>
          <span>Vandro</span>
        </div>
        <button class="sidebar-close" data-action="close-sidebar" aria-label="Zavrieť menu">
          ${icon('close', { size: 20 })}
        </button>
      </div>
      <div class="sidebar-profile">
        <img src="${currentUser.avatar}" alt="" class="sidebar-avatar" />
        <div>
          <p class="sidebar-name">${currentUser.name}</p>
          <p class="sidebar-handle">@${currentUser.username}</p>
        </div>
      </div>
      <nav class="sidebar-nav">${linksHtml}</nav>
      <button class="sidebar-link sidebar-logout">
        ${icon('logout', { size: 19 })}
        <span>Odhlásiť sa</span>
      </button>
    </aside>
  `;
}

// ---- Bottom nav ----
const TABS = [
  { key: 'org', icon: 'megaphone', label: 'Organizácie' },
  { key: 'collections', icon: 'map', label: 'Zbierky' },
  { key: 'profile', icon: 'users', label: 'Profil' },
];

function renderBottomNav() {
  const btns = TABS.map((t) => `
    <button class="bottom-nav-btn ${state.activeTab === t.key ? 'is-active' : ''}" data-action="set-tab" data-tab="${t.key}">
      ${icon(t.icon, { size: state.activeTab === t.key ? 22 : 20 })}
      <span class="visually-hidden">${t.label}</span>
    </button>
  `).join('');
  return `<nav class="bottom-nav">${btns}</nav>`;
}

// ---- Header ----
function renderHeader(title, rightHtml) {
  return `
    <header class="app-header">
      <button class="menu-btn" data-action="open-sidebar" aria-label="Otvoriť menu">${icon('menu', { size: 20 })}</button>
      <h1 class="app-header-title">${title}</h1>
      <div class="app-header-right">${rightHtml || ''}</div>
    </header>
  `;
}

// ---- Karta zbierky ----
function renderCollectionCard(c) {
  const percent = Math.min(100, Math.round((c.currentAmount / c.targetAmount) * 100));
  return `
    <article class="post-card" data-collection-id="${c.id}">
      ${c.isNew ? '<span class="post-badge">Aktuálna</span>' : ''}
      <header class="post-card-head">
        <img src="${c.author.avatar}" alt="" class="post-avatar" />
        <div class="post-head-text">
          <p class="post-author">${c.author.name} ${c.author.verified ? icon('check', { size: 13, className: 'verified-badge' }) : ''}</p>
          <p class="post-time">${timeAgo(c.createdAt)}</p>
        </div>
        <button class="post-more">${icon('more', { size: 18 })}</button>
      </header>
      <button class="post-image-wrap" data-action="open-lightbox" data-img="${c.coverImage}" data-caption="${c.title}">
        <img src="${c.coverImage}" alt="${c.title}" class="post-image" />
      </button>
      <div class="post-actions">
        <button class="post-action ${c.liked ? 'is-liked' : ''}" data-action="toggle-like" data-type="collection" data-id="${c.id}">
          ${icon('heart', { size: 22, filled: c.liked })}
        </button>
        <button class="post-action">${icon('comment', { size: 21 })}</button>
        <button class="post-action">${icon('share', { size: 21 })}</button>
        <button class="post-action post-save ${c.saved ? 'is-saved' : ''}" data-action="toggle-save" data-id="${c.id}">
          ${icon('bookmark', { size: 21, filled: c.saved })}
        </button>
      </div>
      <div class="post-progress">
        <div class="post-progress-row">
          <span>${fmt(c.currentAmount)} Kč z ${fmt(c.targetAmount)} Kč</span>
          <span>${percent}%</span>
        </div>
        <div class="post-progress-track"><div class="post-progress-fill" style="width:${percent}%"></div></div>
      </div>
      <div class="post-body">
        <p class="post-likes" data-like-count="${c.id}">${fmt(c.likes)} páči sa mi</p>
        <p class="post-caption"><strong>${c.title}</strong> — ${c.description}</p>
        ${c.comments > 0 ? `<p class="post-comments-link">Zobraziť všetkých ${c.comments} komentárov</p>` : ''}
        <button class="post-detail-btn" data-action="open-detail" data-id="${c.id}">
          Zobraziť detail zbierky ${icon('chevronRight', { size: 15 })}
        </button>
      </div>
    </article>
  `;
}

function renderCollectionsPage() {
  const sorted = [...collections].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return `
    <div class="page-scroll">
      ${renderHeader('Zbierky')}
      <div class="post-feed-grid" style="padding:0 4px">${sorted.map(renderCollectionCard).join('')}</div>
    </div>
  `;
}

function renderDetailModal() {
  return `
    <div class="detail-modal" id="detail-modal">
      <div class="detail-sheet" id="detail-sheet"></div>
    </div>
  `;
}

function buildDetailSheetHtml(c) {
  const percent = Math.min(100, Math.round((c.currentAmount / c.targetAmount) * 100));
  return `
    <button class="detail-sheet-close" data-action="close-detail" aria-label="Zavrieť detail">${icon('close', { size: 18 })}</button>
    <img src="${c.coverImage}" alt="${c.title}" class="detail-sheet-image" />
    <div class="detail-sheet-body">
      <p class="detail-title">${c.title}</p>
      <p class="detail-meta">${c.author.name} · ${timeAgo(c.createdAt)}</p>
      <div class="detail-progress-row">
        <span class="detail-progress-amount">${fmt(c.currentAmount)} Kč</span>
        <span class="detail-progress-percent">${percent}% z ${fmt(c.targetAmount)} Kč</span>
      </div>
      <div class="detail-progress-track"><div class="detail-progress-fill" style="width:${percent}%"></div></div>
      <p class="detail-description">${c.description}</p>
    </div>
  `;
}

// ---- Karta príspevku organizácie ----
function renderOrgPostCard(p) {
  const commentsHtml = p.comments.map((c) => `<p class="post-comment-row"><strong>${c.user}</strong>${c.text}</p>`).join('');
  return `
    <article class="post-card" data-org-id="${p.id}">
      ${p.sponsored ? `<span class="post-badge" style="background:var(--c-gold);box-shadow:none">Partner</span>` : ''}
      <header class="post-card-head">
        <img src="${p.org.avatar}" alt="" class="post-avatar" />
        <div class="post-head-text">
          <p class="post-author">${p.org.name} ${p.org.verified ? icon('check', { size: 13, className: 'verified-badge' }) : ''}</p>
          <p class="post-time">${timeAgo(p.createdAt)}</p>
        </div>
        <button class="post-more">${icon('more', { size: 18 })}</button>
      </header>
      <button class="post-image-wrap" data-action="open-lightbox" data-img="${p.image}" data-caption="${p.caption}">
        <img src="${p.image}" alt="${p.caption}" class="post-image" />
      </button>
      <div class="post-actions">
        <button class="post-action ${p.liked ? 'is-liked' : ''}" data-action="toggle-like" data-type="org" data-id="${p.id}">
          ${icon('heart', { size: 22, filled: !!p.liked })}
        </button>
        <button class="post-action" data-action="toggle-comments" data-id="${p.id}">${icon('comment', { size: 21 })}</button>
        <button class="post-action">${icon('share', { size: 21 })}</button>
      </div>
      <div class="post-body">
        <p class="post-likes" data-like-count="${p.id}">${fmt(p.likes)} páči sa mi</p>
        <p class="post-caption"><strong>${p.org.name}</strong> ${p.caption}</p>
        ${p.comments.length > 0 ? `<button class="post-comments-link" data-action="toggle-comments" data-id="${p.id}">Zobraziť všetkých ${p.comments.length} komentárov</button>` : ''}
        <div class="post-comments" data-comments-list="${p.id}" style="display:none">${commentsHtml}</div>
        <form class="post-comment-form" data-action="submit-comment" data-id="${p.id}">
          <input class="post-comment-input" placeholder="Napíš komentár…" data-comment-input="${p.id}" />
          <button type="submit" class="post-comment-send">Odoslať</button>
        </form>
      </div>
    </article>
  `;
}

function renderOrgPage() {
  return `
    <div class="page-scroll">
      ${renderHeader('Organizácie')}
      <div style="padding:0 4px">${organizationPosts.map(renderOrgPostCard).join('')}</div>
    </div>
  `;
}

// ---- Profil ----
let selectedTopUp = 150;
const TOPUP_OPTIONS = [50, 150, 400, 1000];
const SHARE_TARGETS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'x', label: 'X' },
  { key: 'whatsapp', label: 'WhatsApp' },
];

function renderProfilePage() {
  const { stats } = currentUser;
  const topupChips = TOPUP_OPTIONS.map((v) => `
    <button class="topup-chip ${selectedTopUp === v ? 'is-selected' : ''}" data-action="select-topup" data-value="${v}">${v} Kč</button>
  `).join('');
  const shareChips = SHARE_TARGETS.map((t) => `<button class="share-chip">${icon('share', { size: 16 })}${t.label}</button>`).join('');

  return `
    <div class="page-scroll">
      ${renderHeader('Môj profil', `<button class="header-icon-btn">${icon('settings', { size: 19 })}</button>`)}

      <section class="profile-hero">
        <img src="${currentUser.avatar}" alt="" class="profile-avatar" />
        <h2 class="profile-name">${currentUser.name}</h2>
        <p class="profile-handle">@${currentUser.username}</p>
        <p class="profile-bio">${currentUser.bio}</p>
        <div class="profile-stats-row">
          <div class="profile-stat"><strong>${stats.posts}</strong><span>Príspevky</span></div>
          <div class="profile-stat"><strong>${stats.followers}</strong><span>Sledovatelia</span></div>
          <div class="profile-stat"><strong>${stats.following}</strong><span>Sleduje</span></div>
          <div class="profile-stat"><strong>${stats.kmWalked}</strong><span>km</span></div>
        </div>
      </section>

      <section class="credit-card">
        <div class="credit-card-top">
          <div>
            <p class="credit-label">Tvoj kredit</p>
            <p class="credit-amount">${icon('coins', { size: 20 })}${currentUser.credit}</p>
          </div>
          <button class="credit-history-btn">História</button>
        </div>
        <p class="topup-label">Dobiť kredit</p>
        <div class="topup-grid">${topupChips}</div>
        <button class="topup-confirm" data-action="topup-confirm">Dobiť ${selectedTopUp} Kč</button>
      </section>

      <section class="profile-section">
        <h3 class="profile-section-title">Štatistiky príspevkov</h3>
        <div class="stat-cards">
          <div class="stat-card"><p class="stat-card-value">${stats.collections}</p><p class="stat-card-label">Vytvorené zbierky</p></div>
          <div class="stat-card"><p class="stat-card-value">1 942</p><p class="stat-card-label">Celkom páči sa mi</p></div>
          <div class="stat-card"><p class="stat-card-value">86</p><p class="stat-card-label">Komentáre</p></div>
          <div class="stat-card"><p class="stat-card-value">312</p><p class="stat-card-label">Zdieľania</p></div>
        </div>
      </section>

      <section class="profile-section">
        <h3 class="profile-section-title">Zdieľať profil</h3>
        <div class="share-row">${shareChips}</div>
      </section>

      <section class="profile-section">
        <h3 class="profile-section-title">Nastavenia účtu</h3>
        <div class="settings-list">
          <button class="settings-row">${icon('settings', { size: 18 })}<span>Upraviť profil</span>${icon('chevronRight', { size: 16, className: 'settings-chevron' })}</button>
          <button class="settings-row">${icon('wallet', { size: 18 })}<span>Platobné metódy</span>${icon('chevronRight', { size: 16, className: 'settings-chevron' })}</button>
          <button class="settings-row">${icon('help', { size: 18 })}<span>Súkromie a bezpečnosť</span>${icon('chevronRight', { size: 16, className: 'settings-chevron' })}</button>
        </div>
      </section>
    </div>
  `;
}

// ---- Lightbox ----
function renderLightbox() {
  return `
    <div class="lightbox" id="lightbox">
      <button class="lightbox-close" data-action="close-lightbox" aria-label="Zavrieť náhľad">${icon('close', { size: 22 })}</button>
      <div class="lightbox-body">
        <img src="" alt="" class="lightbox-img" id="lightbox-img" />
        <p class="lightbox-caption" id="lightbox-caption"></p>
      </div>
    </div>
  `;
}

// ---- Hlavný render ----
function renderApp() {
  const root = document.getElementById('root');
  let pageHtml = '';
  if (state.activeTab === 'org') pageHtml = renderOrgPage();
  else if (state.activeTab === 'collections') pageHtml = renderCollectionsPage();
  else pageHtml = renderProfilePage();

  root.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      ${pageHtml}
      ${renderBottomNav()}
      ${renderLightbox()}
      ${renderDetailModal()}
    </div>
  `;
}

// ---- Event delegovanie ----
document.addEventListener('click', (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;

  if (action === 'open-sidebar') { state.sidebarOpen = true; renderApp(); }
  else if (action === 'close-sidebar') { state.sidebarOpen = false; renderApp(); }
  else if (action === 'set-tab') { state.activeTab = actionEl.dataset.tab; state.sidebarOpen = false; renderApp(); }
  else if (action === 'open-lightbox') {
    e.preventDefault();
    const img = actionEl.dataset.img;
    const caption = actionEl.dataset.caption;
    const lb = document.getElementById('lightbox');
    document.getElementById('lightbox-img').src = img;
    document.getElementById('lightbox-img').alt = caption;
    document.getElementById('lightbox-caption').textContent = caption;
    lb.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  else if (action === 'close-lightbox') {
    document.getElementById('lightbox').classList.remove('is-open');
    document.body.style.overflow = '';
  }
  else if (action === 'open-detail') {
    const c = collections.find((x) => x.id === actionEl.dataset.id);
    if (!c) return;
    document.getElementById('detail-sheet').innerHTML = buildDetailSheetHtml(c);
    document.getElementById('detail-modal').classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  else if (action === 'close-detail') {
    document.getElementById('detail-modal').classList.remove('is-open');
    document.body.style.overflow = '';
  }
  else if (action === 'toggle-like') {
    const { type, id } = actionEl.dataset;
    const list = type === 'collection' ? collections : organizationPosts;
    const item = list.find((x) => x.id === id);
    item.liked = !item.liked;
    item.likes += item.liked ? 1 : -1;
    actionEl.classList.toggle('is-liked', item.liked);
    actionEl.innerHTML = icon('heart', { size: 22, filled: item.liked });
    const likesEl = document.querySelector(`[data-like-count="${id}"]`);
    if (likesEl) likesEl.textContent = `${fmt(item.likes)} páči sa mi`;
    // Optimistická UI aktualizácia je hotová, na pozadí to ešte pošleme na API
    // (ak API nie je nasadené alebo užívateľ nie je prihlásený, potichu to zlyhá)
    if (type === 'collection' && item.liked) likeProjectOnApi(id);
  }
  else if (action === 'toggle-save') {
    const { id } = actionEl.dataset;
    const item = collections.find((x) => x.id === id);
    item.saved = !item.saved;
    actionEl.classList.toggle('is-saved', item.saved);
    actionEl.innerHTML = icon('bookmark', { size: 21, filled: item.saved });
  }
  else if (action === 'toggle-comments') {
    const { id } = actionEl.dataset;
    const list = document.querySelector(`[data-comments-list="${id}"]`);
    if (list) list.style.display = list.style.display === 'none' ? 'flex' : 'none';
  }
  else if (action === 'select-topup') {
    selectedTopUp = Number(actionEl.dataset.value);
    renderApp();
  }
  else if (action === 'topup-confirm') {
    alert(`Kredit bol dobitý o ${selectedTopUp} Kč (ukážková akcia).`);
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-action="submit-comment"]');
  if (!form) return;
  e.preventDefault();
  const id = form.dataset.id;
  const input = document.querySelector(`[data-comment-input="${id}"]`);
  const text = input.value.trim();
  if (!text) return;
  const post = organizationPosts.find((p) => p.id === id);
  post.comments.push({ id: `tmp-${Date.now()}`, user: 'ty', text });
  renderApp();
  postCommentToApi(id, text);
});

document.addEventListener('click', (e) => {
  if (e.target.id === 'detail-modal') {
    document.getElementById('detail-modal').classList.remove('is-open');
    document.body.style.overflow = '';
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const lb = document.getElementById('lightbox');
    if (lb && lb.classList.contains('is-open')) {
      lb.classList.remove('is-open');
      document.body.style.overflow = '';
    }
    const dm = document.getElementById('detail-modal');
    if (dm && dm.classList.contains('is-open')) {
      dm.classList.remove('is-open');
      document.body.style.overflow = '';
    }
  }
});

renderApp();
