// ============================================================
// GENERICKÝ SOCIÁLNY FEED
// ============================================================

function buildFeedQuery(feedKey) {
  const f = state.socialFeeds[feedKey];
  const params = new URLSearchParams();
  if (f.search) params.set('search', f.search);
  if (f.region) params.set('region', f.region);
  if (f.district) params.set('district', f.district);
  if (f.type) params.set('type', f.type);
  if (feedKey === 'gastro' && f.cuisine) params.set('cuisine', f.cuisine);
  return params.toString();
}

async function loadSocialFeed(feedKey) {
  state.loading[feedKey] = true;
  try {
    const q = buildFeedQuery(feedKey);
    const data = await apiGet(`/api/feed/${feedKey}${q ? `?${q}` : ''}`);
    state.socialFeeds[feedKey].items = data.feed || [];
  } catch (err) {
    console.error(`Feed ${feedKey} sa nepodarilo načítať:`, err.message);
    showToast('Příspěvky se nepodařilo načíst.');
  } finally {
    state.loading[feedKey] = false;
    renderApp();
  }
}

let filterDebounceTimer = null;
function onFilterChange(feedKey, field, value) {
  state.socialFeeds[feedKey][field] = value;
  if (field === 'region') state.socialFeeds[feedKey].district = '';
  renderApp();
  loadSocialFeed(feedKey);
}
function onSearchChange(feedKey, value) {
  state.socialFeeds[feedKey].search = value;
  clearTimeout(filterDebounceTimer);
  filterDebounceTimer = setTimeout(() => loadSocialFeed(feedKey), 400);
}

// ---- Carousel 1–4 fotky ----
function renderMediaCarousel(post, feedKey) {
  const media = post.media && post.media.length ? post.media : (post.image_url ? [post.image_url] : []);
  if (media.length === 0) return '';
  if (media.length === 1) {
    return `
      <button class="post-image-wrap" data-action="open-lightbox" data-img="${media[0]}" data-caption="${escapeAttr(post.text || '')}">
        <img src="${media[0]}" alt="" class="post-image" loading="lazy" />
      </button>
    `;
  }
  const slides = media.map((url) => `
    <button class="post-carousel-slide" data-action="open-lightbox" data-img="${url}" data-caption="${escapeAttr(post.text || '')}">
      <img src="${url}" alt="" class="post-image" loading="lazy" />
    </button>
  `).join('');
  const dots = media.map((_, i) => `<span class="post-carousel-dot ${i === 0 ? 'is-active' : ''}"></span>`).join('');
  return `
    <div class="post-carousel" data-post-carousel="${post.id}">
      <div class="post-carousel-track" data-carousel-track>${slides}</div>
      <div class="post-carousel-dots">${dots}</div>
    </div>
  `;
}

function renderSocialPostCard(post, feedKey) {
  const commentsHtml = (post.__comments || []).map((c) =>
    `<p class="post-comment-row"><strong data-action="open-profile" data-kind="user" data-id="${c.user_id || ''}" style="cursor:pointer">${c.user_name || 'Uživatel'}</strong>${escapeHtml(c.comment_text)}</p>`,
  ).join('');

  const bizInitial = (post.business.name || '?').charAt(0);

  return `
    <article class="post-card" data-post-id="${post.id}">
      <header class="post-card-head">
        <button class="post-avatar" data-action="open-profile" data-kind="${feedKey}" data-id="${post.business.id}"
                style="display:flex;align-items:center;justify-content:center;background:var(--c-primary-light);color:var(--c-primary-dark);font-weight:800;font-size:15px;border-radius:var(--radius-round);width:38px;height:38px;flex-shrink:0;border:none;">
          ${bizInitial}
        </button>
        <div class="post-head-text" data-action="open-profile" data-kind="${feedKey}" data-id="${post.business.id}" style="cursor:pointer">
          <p class="post-author">
            ${post.business.name}
            ${post.business.is_verified ? icon('check', { size: 12, className: 'verified-badge-inline' }) : ''}
          </p>
          <p class="post-time">${post.business.city ? `${post.business.city}, ` : ''}${post.business.district} · ${timeAgo(post.created_at)}</p>
        </div>
        <button class="post-more" data-action="report-post" data-id="${post.id}">${icon('more', { size: 18 })}</button>
      </header>
      ${renderMediaCarousel(post, feedKey)}
      <div class="post-actions">
        <button class="post-action ${post.__liked ? 'is-liked' : ''}" data-action="toggle-post-like" data-id="${post.id}" data-feed="${feedKey}">
          ${icon('heart', { size: 22, filled: !!post.__liked })}
        </button>
        <button class="post-action" data-action="toggle-comments" data-id="${post.id}" data-feed="${feedKey}">${icon('comment', { size: 21 })}</button>
        <button class="post-action" data-action="share-post" data-id="${post.id}" data-text="${escapeAttr(post.text || '')}">${icon('share', { size: 21 })}</button>
      </div>
      <div class="post-body">
        <p class="post-likes" data-like-count="${post.id}">${fmt(post.likes || 0)} páči sa mi</p>
        <p class="post-caption"><strong>${post.business.name}</strong> ${escapeHtml(post.text || '')}</p>
        ${post.comment_count > 0 ? `<button class="post-comments-link" data-action="toggle-comments" data-id="${post.id}" data-feed="${feedKey}">Zobrazit všech ${post.comment_count} komentářů</button>` : ''}
        <div class="post-comments" data-comments-list="${post.id}" style="display:none">${commentsHtml}</div>
        <form class="post-comment-form" data-action="submit-social-comment" data-id="${post.id}" data-feed="${feedKey}">
          <input class="post-comment-input" placeholder="Napiš komentář…" data-comment-input="${post.id}" />
          <button type="submit" class="post-comment-send">Odeslat</button>
        </form>
      </div>
    </article>
  `;
}

async function togglePostLike(postId, feedKey, btnEl) {
  if (!isLoggedIn()) { showToast('Pro lajkování se musíš přihlásit.'); switchTab('account'); return; }
  const post = state.socialFeeds[feedKey].items.find((p) => p.id === postId);
  if (!post || post.__liked) return;

  post.__liked = true;
  post.likes = (post.likes || 0) + 1;
  btnEl.classList.add('is-liked');
  btnEl.innerHTML = icon('heart', { size: 22, filled: true });
  const likesEl = document.querySelector(`[data-like-count="${postId}"]`);
  if (likesEl) likesEl.textContent = `${fmt(post.likes)} páči sa mi`;

  try {
    const data = await apiPost(`/api/feed/${postId}/like`, {});
    post.likes = data.likes;
    if (likesEl) likesEl.textContent = `${fmt(post.likes)} páči sa mi`;
  } catch (err) { showToast(err.message); }
}

async function sharePost(postId, text) {
  const url = `${location.origin}${location.pathname}?post=${encodeURIComponent(postId)}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Náš kraj', text: text || '', url }); return; } catch { return; }
  }
  try { await navigator.clipboard.writeText(url); showToast('Odkaz zkopírován.'); }
  catch { showToast('Zdílení se nepodařilo.'); }
}

// ---- Feed page helper (pro 3 taby) ----
function renderFeedPage(feedKey, title, typeOptions, showCuisine) {
  return `
    <div class="page-scroll">
      ${renderHeader(title)}
      ${renderFilterBar(feedKey, typeOptions, showCuisine)}
      ${renderSocialFeedBody(feedKey)}
    </div>
  `;
}

// ---- Organizations tab (zpětná kompatibilita) ----
function renderOrganizationsPage() { return renderFeedPage('organization', 'Organizace', TYPES.organization, false); }

function renderSocialFeedBody(feedKey) {
  const items = state.socialFeeds[feedKey].items;
  if (state.loading[feedKey] && items.length === 0) return '<p class="empty-state">Načítám příspěvky…</p>';
  if (items.length === 0) return '<p class="empty-state">Žádné příspěvky neodpovídají zvoleným filtrům.</p>';
  return `<div class="post-feed-grid">${items.map((p) => renderSocialPostCard(p, feedKey)).join('')}</div>`;
}

async function toggleSocialComments(postId, feedKey) {
  const list = document.querySelector(`[data-comments-list="${postId}"]`);
  if (!list) return;
  const isHidden = list.style.display === 'none' || !list.style.display;
  if (isHidden && list.dataset.loaded !== 'true') {
    try {
      const data = await apiGet(`/api/feed/${postId}/comments`);
      const post = state.socialFeeds[feedKey].items.find((p) => p.id === postId);
      if (post) post.__comments = data.comments;
      list.innerHTML = (data.comments || []).map((c) =>
        `<p class="post-comment-row"><strong data-action="open-profile" data-kind="user" data-id="${c.user_id || ''}" style="cursor:pointer">${c.user_name || 'Uživatel'}</strong>${escapeHtml(c.comment_text)}</p>`,
      ).join('') || '<p class="post-comment-row" style="color:var(--c-text-muted)">Zatím žádné komentáře.</p>';
      list.dataset.loaded = 'true';
    } catch (err) { showToast('Komentáře se nepodařilo načíst.'); return; }
  }
  list.style.display = isHidden ? 'flex' : 'none';
}

async function submitSocialComment(postId, feedKey, text, inputEl) {
  if (!text.trim()) return;
  if (!isLoggedIn()) { showToast('Pro komentování se musíš přihlásit.'); switchTab('account'); return; }
  try {
    await apiPost(`/api/feed/${postId}/comment`, { text: text.trim() });
    inputEl.value = '';
    const post = state.socialFeeds[feedKey].items.find((p) => p.id === postId);
    if (post) post.comment_count = (post.comment_count || 0) + 1;
    const list = document.querySelector(`[data-comments-list="${postId}"]`);
    if (list) { list.dataset.loaded = 'false'; list.style.display = 'none'; await toggleSocialComments(postId, feedKey); }
    showToast('Komentář přidán.');
  } catch (err) { showToast(err.message); }
}

async function reportPost(postId) {
  if (!isLoggedIn()) { showToast('Pro nahlášení se musíš přihlásit.'); switchTab('account'); return; }
  const reason = prompt('Proč tento příspěvek nahlašuješ? (nepovinné)');
  try {
    await apiPost(`/api/feed/${postId}/report`, { reason: reason || null });
    showToast('Příspěvek byl nahlášen.');
  } catch (err) { showToast(err.message); }
}

// ---- Post detail (klik z profilu na grid) ----
async function openPostFromProfile(postId, kind, businessId) {
  // Jednoduché: najdeme v cache profile
  const cacheKey = `${kind}:${businessId}`;
  const d = state.profiles[cacheKey];
  if (!d || !d.posts) return;
  const post = d.posts.find((p) => p.id === postId);
  if (!post) return;
  const img = (post.media && post.media[0]) || post.image_url;
  const lb = document.getElementById('lightbox');
  if (!lb) return;
  document.getElementById('lightbox-img').src = img;
  document.getElementById('lightbox-img').alt = post.text_content || '';
  document.getElementById('lightbox-caption').textContent = post.text_content || '';
  lb.classList.add('is-open');
  document.body.style.overflow = 'hidden';
}
