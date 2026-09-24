// ============================================================
// SOCIÁLNY FEED
// ============================================================

function buildFeedQuery(feedKey) {
  const f = state.socialFeeds[feedKey];
  const params = new URLSearchParams();
  if (f.search) params.set('search', f.search);
  if (f.region) params.set('region', f.region);
  if (f.district) params.set('district', f.district);
  if (f.type) params.set('type', f.type);
  if (feedKey === 'gastro' && f.cuisine) params.set('cuisine', f.cuisine);
  if (f.sort) params.set('sort', f.sort);
  return params.toString();
}

async function loadSocialFeed(feedKey, loadMore = false) {
  const f = state.socialFeeds[feedKey];
  if (loadMore && !f.next_cursor) return;
  if (loadMore && f.loading_more) return;
  if (loadMore) f.loading_more = true;
  else state.loading[feedKey] = true;

  try {
    const q = buildFeedQuery(feedKey);
    const url = `/api/feed/${feedKey}${q ? `?${q}` : ''}${loadMore && f.next_cursor ? `${q ? '&' : '?'}cursor=${encodeURIComponent(f.next_cursor)}` : ''}`;
    const data = await apiGet(url);
    if (loadMore) f.items = [...f.items, ...(data.feed || [])];
    else f.items = data.feed || [];
    f.next_cursor = data.next_cursor || null;
  } catch (err) {
    console.error(`Feed ${feedKey}:`, err.message);
    showToast('Příspěvky se nepodařilo načíst.');
  } finally {
    state.loading[feedKey] = false;
    f.loading_more = false;
    renderApp();
  }
}

let filterDebounceTimer = null;
function onFilterChange(feedKey, field, value) {
  state.socialFeeds[feedKey][field] = value;
  if (field === 'region') state.socialFeeds[feedKey].district = '';
  state.socialFeeds[feedKey].next_cursor = null;
  renderApp();
  clearTimeout(filterDebounceTimer);
  filterDebounceTimer = setTimeout(() => loadSocialFeed(feedKey), 250);
}

function onSearchChange(feedKey, value) {
  state.socialFeeds[feedKey].search = value;
  state.socialFeeds[feedKey].next_cursor = null;
  clearTimeout(filterDebounceTimer);
  filterDebounceTimer = setTimeout(() => loadSocialFeed(feedKey), 400);
}

function renderMediaCarousel(post) {
  const media = post.media && post.media.length ? post.media : (post.image_url ? [post.image_url] : []);
  const caption = escapeAttr(post.text || '');

  if (media.length === 0) {
    return `
      <div class="post-image-wrap post-image-empty">
        <div class="post-image-placeholder">
          ${icon('image', { size: 36 })}
          <span>Bez fotky</span>
        </div>
      </div>`;
  }

  if (media.length === 1) {
    return `
      <button class="post-image-wrap" data-action="open-lightbox" data-post-id="${post.id}" data-index="0" data-caption="${caption}">
        <img src="${media[0]}" alt="" class="post-image" loading="lazy" />
      </button>`;
  }

  const slides = media.map((url, idx) => `
    <button class="post-carousel-slide" data-action="open-lightbox" data-post-id="${post.id}" data-index="${idx}" data-caption="${caption}">
      <img src="${url}" alt="" class="post-image" loading="lazy" />
    </button>`).join('');
  const dots = media.map((_, i) => `<span class="post-carousel-dot ${i === 0 ? 'is-active' : ''}"></span>`).join('');
  return `
    <div class="post-carousel" data-post-carousel="${post.id}">
      <div class="post-carousel-track" data-carousel-track>${slides}</div>
      <div class="post-carousel-dots">${dots}</div>
    </div>`;
}

// Pomocná funkcia — vykreslí avatar podniku (obrázok alebo iniciála)
function renderBusinessAvatar(business, feedKey, size = 38) {
  const logo = business.logo_url || business.image_url;
  const initial = (business.name || '?').charAt(0).toUpperCase();
  const fontSize = Math.round(size * 0.42);

  if (logo) {
    return `
      <button class="post-avatar" data-action="open-profile" data-kind="${feedKey}" data-id="${business.id}"
              style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;padding:0;border:2px solid var(--c-primary-light);flex-shrink:0;background:var(--c-surface);">
        <img src="${escapeAttr(logo)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />
      </button>`;
  }
  return `
    <button class="post-avatar" data-action="open-profile" data-kind="${feedKey}" data-id="${business.id}"
            style="display:flex;align-items:center;justify-content:center;background:var(--c-primary-light);color:var(--c-primary-dark);font-weight:800;font-size:${fontSize}px;border-radius:50%;width:${size}px;height:${size}px;flex-shrink:0;border:2px solid var(--c-primary-light);">
      ${initial}
    </button>`;
}

function renderSocialPostCard(post, feedKey) {
  const isMinePost = isLoggedIn() && state.businesses.some((b) => b.id === post.business.id);
  const isVerified = Number(post.business.is_verified) === 1 || post.business.is_verified === true;

  const { text: captionText, links: captionLinks } = extractLinks(post.html || post.text || '');

  const linksHtml = captionLinks.length > 0
    ? `<div class="post-links">
        ${captionLinks.map((l) => `
          <a href="${escapeAttr(l.href)}" target="_blank" rel="noopener nofollow ugc" title="${escapeAttr(l.href)}">
            <span class="post-link-label">${escapeHtml(l.label)}</span>
          </a>
        `).join('')}
       </div>`
    : '';

  return `
    <article class="post-card" data-post-id="${post.id}">
      <header class="post-card-head">
        ${renderBusinessAvatar(post.business, feedKey, 38)}
        <div class="post-head-text" data-action="open-profile" data-kind="${feedKey}" data-id="${post.business.id}" style="cursor:pointer">
          <p class="post-author">
            ${escapeHtml(post.business.name)}
            ${isVerified ? icon('check', { size: 12, className: 'verified-badge-inline' }) : ''}
          </p>
          <p class="post-time">${post.business.city ? `${escapeHtml(post.business.city)}, ` : ''}${escapeHtml(post.business.district)} · ${timeAgo(post.created_at)}</p>
        </div>
        <button class="post-more" data-action="report-post" data-id="${post.id}">${icon('more', { size: 18 })}</button>
      </header>
      ${renderMediaCarousel(post)}
      <div class="post-actions">
        <button class="post-action ${post.__liked ? 'is-liked' : ''}" data-action="toggle-post-like" data-id="${post.id}" data-feed="${feedKey}">
          ${icon('spark', { size: 22, filled: !!post.__liked })}
        </button>
        <button class="post-action post-action--with-count" data-action="open-lightbox" data-post-id="${post.id}" data-index="0" data-caption="${escapeAttr(captionText)}">
          ${icon('comment', { size: 21 })}
          ${post.comment_count > 0 ? `<span class="post-action-count">${post.comment_count}</span>` : ''}
        </button>
        <button class="post-action" data-action="share-post" data-id="${post.id}" data-text="${escapeAttr(post.text || '')}">${icon('share', { size: 21 })}</button>
        ${isLoggedIn() ? `<button class="post-action ${post.__bookmarked ? 'is-bookmarked' : ''}" data-action="toggle-bookmark" data-id="${post.id}">${icon('bookmark', { size: 20, filled: !!post.__bookmarked })}</button>` : ''}
        ${isMinePost ? `<button class="post-action" data-action="edit-post" data-id="${post.id}" data-feed="${feedKey}">${icon('edit', { size: 18 })}</button>` : ''}
        ${isMinePost ? `<button class="post-action" data-action="delete-post" data-id="${post.id}" data-feed="${feedKey}" style="color:#B3273C">${icon('trash', { size: 18 })}</button>` : ''}
      </div>
      <div class="post-body">
        <p class="post-likes" data-like-count="${post.id}">${fmt(post.likes || 0)} obdivov${post.views ? ` · ${fmt(post.views)} zobrazení` : ''}</p>
        <p class="post-caption" data-action="open-lightbox" data-post-id="${post.id}" data-index="0" data-caption="${escapeAttr(captionText)}">
          <strong class="post-caption-author">${escapeHtml(post.business.name)}</strong>
          <span class="post-caption-text">${linkifyHashtags(captionText)}</span>
        </p>
        ${linksHtml}
        ${post.geo ? `<p class="post-geo">${icon('location', { size: 13 })} ${escapeHtml(post.geo.place)}</p>` : ''}
        ${post.comment_count > 0 ? `<button class="post-comments-link" data-action="open-lightbox" data-post-id="${post.id}" data-index="0" data-caption="${escapeAttr(captionText)}">Zobrazit všech ${post.comment_count} komentářů</button>` : ''}
      </div>
    </article>`;
}

async function togglePostLike(postId, feedKey, btnEl) {
  if (!isLoggedIn()) { showToast('Pro obdivování se musíš přihlásit.'); switchTab('account'); return; }
  let post = state.socialFeeds[feedKey]?.items.find((p) => p.id === postId);
  if (!post) {
    for (const k of Object.keys(state.profiles)) {
      const d = state.profiles[k];
      if (d?.posts) {
        const p = d.posts.find((x) => x.id === postId);
        if (p) { post = p; break; }
      }
    }
  }
  if (!post || post.__liked) return;
  post.__liked = true;
  post.likes = (post.likes || 0) + 1;
  btnEl.classList.add('is-liked');
  btnEl.innerHTML = icon('spark', { size: 22, filled: true });
  const likesEl = document.querySelector(`[data-like-count="${postId}"]`);
  if (likesEl) likesEl.textContent = `${fmt(post.likes)} obdivov`;
  try {
    const data = await apiPost(`/api/feed/${postId}/like`, {});
    post.likes = data.likes;
    if (likesEl) likesEl.textContent = `${fmt(post.likes)} obdivov`;
  } catch (err) { showToast(err.message); }
}

async function toggleBookmark(postId, btnEl) {
  if (!isLoggedIn()) { showToast('Pro uložení se musíš přihlásit.'); switchTab('account'); return; }
  try {
    const data = await apiPost(`/api/feed/${postId}/bookmark`, {});
    if (btnEl) {
      btnEl.classList.toggle('is-bookmarked', data.bookmarked);
      btnEl.innerHTML = icon('bookmark', { size: 20, filled: data.bookmarked });
    }
    for (const k of Object.keys(state.profiles)) {
      const d = state.profiles[k];
      if (d?.posts) {
        const p = d.posts.find((x) => x.id === postId);
        if (p) p.__bookmarked = data.bookmarked;
      }
    }
    showToast(data.bookmarked ? 'Uloženo.' : 'Odebráno z uložených.');
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

function renderFeedPage(feedKey, typeOptions, showCuisine) {
  const title = getFeedTitle(feedKey);
  return `
    <div class="page-scroll">
      ${renderHeader(title, `
        <button class="header-icon-btn" data-action="open-nearby" aria-label="V okolí">${icon('location', { size: 19 })}</button>
        <button class="header-icon-btn" data-action="open-search" aria-label="Hledat">${icon('search', { size: 19 })}</button>
      `)}
      ${renderStoriesBar()}
      ${renderFilterBar(feedKey, typeOptions, showCuisine)}
      ${renderSocialFeedBody(feedKey)}
    </div>`;
}

function renderSocialFeedBody(feedKey) {
  const f = state.socialFeeds[feedKey];
  const items = f.items;
  if (state.loading[feedKey] && items.length === 0) return '<p class="empty-state">Načítám příspěvky…</p>';
  if (items.length === 0) return '<p class="empty-state">Žádné příspěvky neodpovídají zvoleným filtrům.</p>';
  return `
    <div class="post-feed-grid">${items.map((p) => renderSocialPostCard(p, feedKey)).join('')}</div>
    ${f.loading_more ? '<p class="empty-state">Načítám další…</p>' : ''}
    ${f.next_cursor ? `<div data-load-more style="height:1px"></div>` : ''}
  `;
}

// Toggle už nepoužíváme v karte, ale necháváme pro případ nouze
async function toggleSocialComments(postId, feedKey) {
  const list = document.querySelector(`[data-comments-list="${postId}"]`);
  if (!list) return;
  const isHidden = list.style.display === 'none' || !list.style.display;
  if (isHidden && list.dataset.loaded !== 'true') {
    try {
      const data = await apiGet(`/api/feed/${postId}/comments`);
      let post = state.socialFeeds[feedKey]?.items.find((p) => p.id === postId);
      if (!post) {
        for (const k of Object.keys(state.profiles)) {
          const d = state.profiles[k];
          if (d?.posts) {
            const p = d.posts.find((x) => x.id === postId);
            if (p) { post = p; break; }
          }
        }
      }
      if (post) post.__comments = data.comments;
      list.innerHTML = (data.comments || []).map((c) => renderCommentRow(c, feedKey, postId)).join('') ||
        '<p class="post-comment-row" style="color:var(--c-text-muted)">Zatím žádné komentáře.</p>';
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
    showToast('Komentář přidán.');
  } catch (err) { showToast(err.message); }
}

function toggleReplyForm(commentId) {
  const form = document.querySelector(`[data-reply-form="${commentId}"]`);
  if (!form) return;
  form.style.display = form.style.display === 'none' ? 'flex' : 'none';
  if (form.style.display === 'flex') form.querySelector('input')?.focus();
}

async function submitReply(parentId, postId, feedKey, text, inputEl) {
  if (!text.trim()) return;
  try {
    await apiPost(`/api/feed/${postId}/comment`, { text: text.trim(), parent_id: parentId });
    inputEl.value = '';
    showToast('Odpověď přidána.');
    if (state.lightbox && state.lightbox.post && state.lightbox.post.id === postId) {
      const c = await apiGet(`/api/feed/${postId}/comments`);
      state.lightbox.post.__comments = c.comments || [];
      updateLightboxDOM();
    }
  } catch (err) { showToast(err.message); }
}

function reportPost(postId) {
  if (!isLoggedIn()) { showToast('Pro nahlášení se musíš přihlásit.'); switchTab('account'); return; }
  openModal({
    title: 'Nahlásit příspěvek',
    body: `
      <div class="form-field">
        <label class="form-label">Důvod (nepovinné)</label>
        <textarea class="form-textarea" name="reason" rows="3" maxlength="500" placeholder="Proč tento příspěvek nahlašuješ?"></textarea>
      </div>`,
    submitLabel: 'Odeslat nahlášení',
    danger: true,
    onSubmit: async (data) => {
      state._modalLoading = true; renderApp();
      try {
        await apiPost(`/api/feed/${postId}/report`, { reason: data.reason || null });
        closeModal();
        showToast('Příspěvek byl nahlášen.');
      } catch (err) { showToast(err.message); state._modalLoading = false; renderApp(); }
    },
  });
}

function deletePost(postId, feedKey) {
  openModal({
    title: 'Smazat příspěvek?',
    body: `<p style="font-size:14px;line-height:1.6">Příspěvek bude skryt ze všech feedů. Akce je nevratná.</p>`,
    submitLabel: 'Smazat',
    danger: true,
    onSubmit: async () => {
      state._modalLoading = true; renderApp();
      try {
        await apiDelete(`/api/feed/post/${postId}`);
        if (state.socialFeeds[feedKey]) state.socialFeeds[feedKey].items = state.socialFeeds[feedKey].items.filter((p) => p.id !== postId);
        closeModal();
        showToast('Smazáno.');
      } catch (err) { showToast(err.message); state._modalLoading = false; renderApp(); }
    },
  });
}

async function openPostFromProfile(postId, kind, businessId) {
  const cacheKey = `${kind}:${businessId}`;
  const d = state.profiles[cacheKey];
  if (!d || !d.posts) return;
  const post = d.posts.find((p) => p.id === postId);
  if (!post) return;
  const media = post.media || (post.image_url ? [post.image_url] : []);
  if (!media.length) return;
  post.__feedKey = d.feedKey || null;
  openLightbox(media, 0, post.text_content || '', post);
}

async function loadBookmarks() {
  try {
    const data = await apiGet('/api/feed/bookmarks');
    state._bookmarks = data.bookmarks || [];
  } catch { state._bookmarks = []; }
  if (state.overlay?.type === 'bookmarks') renderApp();
}

function renderBookmarksOverlay() {
  const list = state._bookmarks;
  return `
    <div class="page-scroll">
      ${renderBackHeader('Uložené příspěvky')}
      <div class="profile-section">
        ${list == null ? '<p class="empty-state">Načítám…</p>'
          : list.length === 0 ? '<p class="empty-state">Zatím nic uloženého.</p>'
          : list.map((b) => `
            <button class="user-list-item" data-action="open-post-bookmark" data-id="${b.id}">
              ${b.image_url ? `<img src="${b.image_url}" class="user-list-avatar" style="border-radius:12px" alt="" />` : `<span class="user-list-avatar user-list-avatar-init">${icon('image', { size: 18 })}</span>`}
              <div style="flex:1;min-width:0">
                <p class="user-list-name">${escapeHtml(b.org_name || b.acc_name || b.rest_name || '')}</p>
                <p class="user-list-meta" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;">${escapeHtml((b.text_content || '').slice(0, 80))}</p>
              </div>
            </button>`).join('')}
      </div>
    </div>`;
}

function openEditPost(postId, feedKey) {
  const post = state.socialFeeds[feedKey]?.items.find((p) => p.id === postId);
  if (!post) return;
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'edit-post', postId, feedKey, html: post.html || post.text || '' };
  renderApp();
}

function renderEditPostOverlay() {
  const { postId, feedKey, html } = state.overlay;
  return `
    <div class="page-scroll">
      ${renderBackHeader('Upravit příspěvek')}
      <div class="profile-section">
        <form data-action="submit-edit-post" data-post-id="${postId}" data-feed="${feedKey}">
          ${renderRichEditor('text_html', 'Text příspěvku…', html)}
          <button class="form-submit-btn" type="submit">Uložit změny</button>
        </form>
      </div>
    </div>`;
}

async function handleEditPostSubmit(form) {
  const postId = form.dataset.postId;
  const feedKey = form.dataset.feed;
  const html = getEditorHtml(form);
  const btn = form.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Ukládám…'; }

  try {
    const res = await apiPatch(`/api/feed/post/${postId}`, { html });
    const post = state.socialFeeds[feedKey]?.items.find((p) => p.id === postId);
    if (post) { post.html = res.html; post.text = res.text; }
    closeOverlay();
    showToast('Uloženo.');
  } catch (err) {
    showToast(err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Uložit změny'; }
  }
}

async function submitLightboxComment(postId, feedKey, text) {
  if (!text.trim()) return;
  if (!isLoggedIn()) { showToast('Pro komentování se musíš přihlásit.'); return; }
  try {
    await apiPost(`/api/feed/${postId}/comment`, { text: text.trim() });
    if (state.lightbox && state.lightbox.post) {
      try {
        const c = await apiGet(`/api/feed/${postId}/comments`);
        state.lightbox.post.__comments = c.comments || [];
        state.lightbox.post.comment_count = c.total || (state.lightbox.post.comment_count || 0) + 1;
      } catch {}
    }
    for (const k of Object.keys(state.socialFeeds)) {
      const p = state.socialFeeds[k].items.find((x) => x.id === postId);
      if (p) { p.comment_count = (p.comment_count || 0) + 1; }
    }
    updateLightboxDOM();
    showToast('Komentář přidán.');
  } catch (err) { showToast(err.message); }
}
