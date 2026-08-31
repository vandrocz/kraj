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
        <div class="post-avatar" style="display:flex;align-items:center;justify-content:center;background:var(--c-primary-light);color:var(--c-primary-dark);font-weight:800;font-size:15px;">
          ${(post.business.name || '?').charAt(0)}
        </div>
        <div class="post-head-text">
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
        <button class="post-action" data-action="toggle-comments" data-id="${post.id}" data-feed="${feedKey}">${icon('comment', { size: 21 })}</button>
        <button class="post-action">${icon('share', { size: 21 })}</button>
      </div>
      <div class="post-body">
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
