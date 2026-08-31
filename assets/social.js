// ============================================================
// GENERICKÝ SOCIÁLNY FEED (organizace / accommodation / gastro)
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
    const query = buildFeedQuery(feedKey);
    const data = await apiGet(`/api/feed/${feedKey}${query ? `?${query}` : ''}`);
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
  if (field === 'region') state.socialFeeds[feedKey].district = ''; // reset okresu pri zmene kraja
  renderApp();
  loadSocialFeed(feedKey);
}

function onSearchChange(feedKey, value) {
  state.socialFeeds[feedKey].search = value;
  clearTimeout(filterDebounceTimer);
  filterDebounceTimer = setTimeout(() => loadSocialFeed(feedKey), 400);
}

function renderSocialPostCard(post, feedKey) {
  const commentsHtml = (post.__comments || []).map((c) =>
    `<p class="post-comment-row"><strong>${c.user_name || 'Uživatel'}</strong>${c.comment_text}</p>`,
  ).join('');

  return `
    <article class="post-card" data-post-id="${post.id}">
      <header class="post-card-head">
        <button class="post-avatar" data-action="open-business-profile" data-kind="${feedKey}" data-id="${post.business.id}"
                style="display:flex;align-items:center;justify-content:center;background:var(--c-primary-light);color:var(--c-primary-dark);font-weight:800;font-size:15px;border-radius:var(--radius-round);width:38px;height:38px;flex-shrink:0;">
          ${(post.business.name || '?').charAt(0)}
        </button>
        <div class="post-head-text" data-action="open-business-profile" data-kind="${feedKey}" data-id="${post.business.id}" style="cursor:pointer">
          <p class="post-author">
            ${post.business.name}
            ${post.business.is_verified ? icon('check', { size: 12, className: 'verified-badge-inline' }) : ''}
          </p>
          <p class="post-time">${post.business.district}, ${post.business.region} · ${timeAgo(post.created_at)}</p>
        </div>
        <button class="post-more" data-action="report-post" data-id="${post.id}">${icon('more', { size: 18 })}</button>
      </header>
      <button class="post-image-wrap" data-action="open-lightbox" data-img="${post.image_url}" data-caption="${post.text}">
        <img src="${post.image_url}" alt="" class="post-image" />
      </button>
      <div class="post-actions">
        <button class="post-action ${post.__liked ? 'is-liked' : ''}" data-action="toggle-post-like" data-id="${post.id}" data-feed="${feedKey}">
          ${icon('heart', { size: 22, filled: !!post.__liked })}
        </button>
        <button class="post-action" data-action="toggle-comments" data-id="${post.id}" data-feed="${feedKey}">${icon('comment', { size: 21 })}</button>
        <button class="post-action" data-action="share-post" data-id="${post.id}" data-text="${(post.text || '').replace(/"/g, '&quot;')}">${icon('share', { size: 21 })}</button>
      </div>
      <div class="post-body">
        <p class="post-likes" data-like-count="${post.id}">${fmt(post.likes || 0)} páči sa mi</p>
        <p class="post-caption"><strong>${post.business.name}</strong> ${post.text || ''}</p>
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
  if (!isLoggedIn()) {
    showToast('Pro lajkování se musíš přihlásit.');
    switchTab('account');
    return;
  }
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
  } catch (err) {
    showToast(err.message);
  }
}

async function sharePost(postId, text) {
  const url = `${location.origin}${location.pathname}?post=${encodeURIComponent(postId)}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Náš kraj', text: text || '', url });
      return;
    } catch {
      /* užívateľ zrušil dialóg, nič nerobíme */
      return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('Odkaz zkopírován do schránky.');
  } catch {
    showToast('Zdílení se nepodařilo — zkopíruj odkaz ručně.');
  }
}

// ---- PROFIL PODNIKU (kliknutie na avatar/meno v poste) ----
const BUSINESS_KIND_TO_TABLE = {
  organization: 'organizations',
  accommodation: 'accommodation',
  gastro: 'restaurants',
};

async function openBusinessProfile(feedKey, businessId) {
  const table = BUSINESS_KIND_TO_TABLE[feedKey];
  const modal = document.getElementById('detail-modal');
  const sheet = document.getElementById('detail-sheet');
  if (!modal || !sheet) return;

  sheet.innerHTML = `
    <button class="detail-sheet-close" data-action="close-detail">${icon('close', { size: 18 })}</button>
    <div class="detail-sheet-body"><p class="empty-state">Načítám profil…</p></div>
  `;
  modal.classList.add('is-open');
  document.body.style.overflow = 'hidden';

  try {
    const data = await apiGet(`/api/feed/business/${table}/${businessId}`);
    const b = data.business;
    const postsHtml = (data.posts || []).map((p) => `
      <button class="post-image-wrap" style="border-radius:var(--radius-sm);margin-bottom:8px" data-action="open-lightbox" data-img="${p.image_url}" data-caption="${p.text_content || ''}">
        <img src="${p.image_url}" alt="" class="post-image" />
      </button>
    `).join('');

    sheet.innerHTML = `
      <button class="detail-sheet-close" data-action="close-detail">${icon('close', { size: 18 })}</button>
      <div class="detail-sheet-body">
        <p class="detail-title">${b.name} ${b.is_verified ? icon('check', { size: 15, className: 'verified-badge-inline' }) : ''}</p>
        <p class="detail-meta">${b.type} · ${b.district}, ${b.region}</p>
        <p class="detail-description" style="margin-bottom:18px">${b.description || 'Bez popisu.'}</p>
        <p class="profile-section-title" style="padding:0 0 10px">Příspěvky</p>
        ${postsHtml || '<p class="empty-state">Zatím žádné příspěvky.</p>'}
      </div>
    `;
  } catch (err) {
    sheet.innerHTML = `
      <button class="detail-sheet-close" data-action="close-detail">${icon('close', { size: 18 })}</button>
      <div class="detail-sheet-body"><p class="empty-state">Profil se nepodařilo načíst.</p></div>
    `;
  }
}

function renderSocialFeedBody(feedKey) {
  const items = state.socialFeeds[feedKey].items;
  if (state.loading[feedKey] && items.length === 0) {
    return '<p class="empty-state">Načítám příspěvky…</p>';
  }
  if (items.length === 0) {
    return '<p class="empty-state">Žádné příspěvky neodpovídají zvoleným filtrům.</p>';
  }
  return `<div class="post-feed-grid">${items.map((p) => renderSocialPostCard(p, feedKey)).join('')}</div>`;
}

// ---- SEKCE 3: SOCIÁLNÍ SÍŤ ORGANIZACÍ ----
function renderOrganizationsPage() {
  return `
    <div class="page-scroll">
      ${renderHeader('Organizace')}
      ${renderFilterBar('organization', TYPES.organization)}
      ${renderSocialFeedBody('organization')}
    </div>
  `;
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
        `<p class="post-comment-row"><strong>${c.user_name || 'Uživatel'}</strong>${c.comment_text}</p>`,
      ).join('') || '<p class="post-comment-row" style="color:var(--c-text-muted)">Zatím žádné komentáře.</p>';
      list.dataset.loaded = 'true';
    } catch (err) {
      showToast('Komentáře se nepodařilo načíst.');
      return;
    }
  }
  list.style.display = isHidden ? 'flex' : 'none';
}

async function submitSocialComment(postId, feedKey, text, inputEl) {
  if (!text.trim()) return;
  if (!isLoggedIn()) {
    showToast('Pro komentování se musíš přihlásit.');
    switchTab('account');
    return;
  }
  try {
    await apiPost(`/api/feed/${postId}/comment`, { text: text.trim() });
    inputEl.value = '';
    const post = state.socialFeeds[feedKey].items.find((p) => p.id === postId);
    if (post) post.comment_count = (post.comment_count || 0) + 1;
    const list = document.querySelector(`[data-comments-list="${postId}"]`);
    if (list) {
      list.dataset.loaded = 'false';
      list.style.display = 'none';
      await toggleSocialComments(postId, feedKey);
    }
    showToast('Komentář přidán.');
  } catch (err) {
    showToast(err.message);
  }
}

async function reportPost(postId) {
  if (!isLoggedIn()) {
    showToast('Pro nahlášení se musíš přihlásit.');
    switchTab('account');
    return;
  }
  const reason = prompt('Proč tento příspěvek nahlašuješ? (nepovinné)');
  try {
    await apiPost(`/api/feed/${postId}/report`, { reason: reason || null });
    showToast('Příspěvek byl nahlášen administrátorům.');
  } catch (err) {
    showToast(err.message);
  }
}
