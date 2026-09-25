// ============================================================
// SOCIÁLNY FEED — opravené lajky
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
    showToast(t('errors.loadPostsFailed'));
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
          <span>${escapeHtml(t('feed.noPhoto'))}</span>
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

  const likeText = post.likes > 0 ? `${fmt(post.likes)} ${t('feed.likesMe')}` : t('feed.likesMe');

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
        <button class="post-action" data-action="open-lightbox" data-post-id="${post.id}" data-index="0" data-caption="${escapeAttr(captionText)}">
          ${icon('comment', { size: 21 })}
          ${post.comment_count > 0 ? `<span class="post-action-badge">${post.comment_count > 99 ? '99+' : post.comment_count}</span>` : ''}
        </button>
        <button class="post-action" data-action="share-post" data-id="${post.id}" data-text="${escapeAttr(post.text || '')}">${icon('share', { size: 21 })}</button>
        ${isLoggedIn() ? `<button class="post-action ${post.__bookmarked ? 'is-bookmarked' : ''}" data-action="toggle-bookmark" data-id="${post.id}">${icon('bookmark', { size: 20, filled: !!post.__bookmarked })}</button>` : ''}
        ${isMinePost ? `<button class="post-action" data-action="edit-post" data-id="${post.id}" data-feed="${feedKey}">${icon('edit', { size: 18 })}</button>` : ''}
        ${isMinePost ? `<button class="post-action" data-action="delete-post" data-id="${post.id}" data-feed="${feedKey}" style="color:#B3273C">${icon('trash', { size: 18 })}</button>` : ''}
      </div>
      <div class="post-body">
        <p class="post-likes" data-like-count="${post.id}">${likeText}${post.views ? ` · ${fmt(post.views)} ${t('feed.views')}` : ''}</p>
        <p class="post-caption" data-action="open-lightbox" data-post-id="${post.id}" data-index="0" data-caption="${escapeAttr(captionText)}">
          <strong class="post-caption-author">${escapeHtml(post.business.name)}</strong>
          <span class="post-caption-text">${linkifyHashtags(captionText)}</span>
        </p>
        ${linksHtml}
        ${post.geo ? `<p class="post-geo">${icon('location', { size: 13 })} ${escapeHtml(post.geo.place)}</p>` : ''}
      </div>
    </article>`;
}

// ============================================================
// Pomocná funkcia — nájdi post objekt všade (feed, lightbox, profiles)
// Vždy vráti jednu referenciu (priorita: feed item > lightbox > profile)
// ============================================================
function findPostAnywhere(postId) {
  // Priorita: socialFeeds (aby sme mali konzistentnú referenciu)
  for (const k of Object.keys(state.socialFeeds)) {
    const p = state.socialFeeds[k].items.find((x) => x.id === postId);
    if (p) return p;
  }
  for (const k of Object.keys(state.profiles)) {
    const d = state.profiles[k];
    if (d?.posts) {
      const p = d.posts.find((x) => x.id === postId);
      if (p) return p;
    }
  }
  if (state.lightbox?.post?.id === postId) return state.lightbox.post;
  return null;
}

// Aktualizuj VŠETKY výskyty post objektu (feed + lightbox + profiles)
function updatePostEverywhere(postId, updater) {
  const seen = new Set();
  const apply = (p) => {
    if (!p || p.id !== postId) return;
    if (seen.has(p)) return;
    seen.add(p);
    updater(p);
  };
  for (const k of Object.keys(state.socialFeeds)) {
    apply(state.socialFeeds[k].items.find((x) => x.id === postId));
  }
  for (const k of Object.keys(state.profiles)) {
    const d = state.profiles[k];
    if (d?.posts) apply(d.posts.find((x) => x.id === postId));
  }
  apply(state.lightbox?.post);
}

// ============================================================
// OPRAVA: togglePostLike
// - Lock proti dvojkliku
// - Synchronizácia medzi feedom a lightboxom
// - Server response je zdroj pravdy
// - Vždy aktualizuj UI bez ohľadu na to, ktoré tlačidlo kliklo
// ============================================================
async function togglePostLike(postId, feedKey, btnEl) {
  if (!isLoggedIn()) { showToast(t('post.loginToComment')); switchTab('account'); return; }

  const post = findPostAnywhere(postId);
  if (!post) {
    console.warn('[like] post nenájdený:', postId);
    return;
  }

  // Zámok proti rýchlemu dvojkliku
  if (post.__likePending) return;
  post.__likePending = true;

  const wasLiked = !!post.__liked;
  const optimisticLiked = !wasLiked;
  const optimisticLikes = Math.max(0, (post.likes || 0) + (wasLiked ? -1 : 1));

  // Optimistický update všade
  updatePostEverywhere(postId, (p) => {
    p.__liked = optimisticLiked;
    p.likes = optimisticLikes;
  });

  // Okamžitý vizuálny feedback
  updateLikeButtonsDOM(postId, optimisticLiked, optimisticLikes);

  try {
    const data = await apiPost(`/api/feed/${postId}/like`, {});

    // Server response je zdroj pravdy
    updatePostEverywhere(postId, (p) => {
      p.__liked = !!data.liked;
      p.likes = data.likes || 0;
    });
    updateLikeButtonsDOM(postId, !!data.liked, data.likes || 0);
  } catch (err) {
    // Rollback
    updatePostEverywhere(postId, (p) => {
      p.__liked = wasLiked;
      p.likes = Math.max(0, (p.likes || 0) + (wasLiked ? 1 : -1));
    });
    updateLikeButtonsDOM(postId, wasLiked, post.likes);
    showToast(err.message);
  } finally {
    updatePostEverywhere(postId, (p) => { p.__likePending = false; });
  }
}

// Aktualizuj všetky lajk tlačidlá + počítadlá pre daný post na obrazovke
function updateLikeButtonsDOM(postId, liked, likes) {
  // Všetky tlačidlá (vo feede, v lightboxe, v profile)
  document.querySelectorAll(`[data-action="toggle-post-like"][data-id="${postId}"]`).forEach((btn) => {
    btn.classList.toggle('is-liked', !!liked);
    btn.innerHTML = icon('spark', { size: 22, filled: !!liked });
  });

  // Všetky počítadlá (textové + lightbox stat)
  document.querySelectorAll(`[data-like-count="${postId}"]`).forEach((el) => {
    el.textContent = likes > 0 ? `${fmt(likes)} ${t('feed.likesMe')}` : t('feed.likesMe');
  });

  // Lightbox stat (text)
  if (state.lightbox?.post?.id === postId) {
    const stat = document.querySelector('.lightbox-stat');
    if (stat) stat.textContent = `${fmt(likes)} ${t('post.like')}`;
  }
}

async function toggleBookmark(postId, btnEl) {
  if (!isLoggedIn()) { showToast(t('post.loginToComment')); switchTab('account'); return; }
  try {
    const data = await apiPost(`/api/feed/${postId}/bookmark`, {});
    updatePostEverywhere(postId, (p) => { p.__bookmarked = !!data.bookmarked; });

    // Aktualizuj všetky bookmark tlačidlá na obrazovke
    document.querySelectorAll(`[data-action="toggle-bookmark"][data-id="${postId}"]`).forEach((b) => {
      b.classList.toggle('is-bookmarked', !!data.bookmarked);
      b.innerHTML = icon('bookmark', { size: 20, filled: !!data.bookmarked });
    });

    showToast(data.bookmarked ? t('toasts.saved') : t('toasts.removedFromWishlist'));
  } catch (err) { showToast(err.message); }
}

async function sharePost(postId, text) {
  const url = `${location.origin}${location.pathname}?post=${encodeURIComponent(postId)}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'VANDRO', text: text || '', url }); return; } catch { return; }
  }
  try { await navigator.clipboard.writeText(url); showToast(t('toasts.copied')); }
  catch { showToast(t('toasts.shareFailed')); }
}

function renderFeedPage(feedKey, typeOptions, showCuisine) {
  const title = getFeedTitle(feedKey);
  return `
    <div class="page-scroll">
      ${renderHeader(title, `
        <button class="header-icon-btn" data-action="open-nearby" aria-label="${escapeAttr(t('nearby.title'))}">${icon('location', { size: 19 })}</button>
        <button class="header-icon-btn" data-action="open-search" aria-label="${escapeAttr(t('search.title'))}">${icon('search', { size: 19 })}</button>
      `)}
      ${renderStoriesBar(feedKey)}
      ${renderFilterBar(feedKey, typeOptions, showCuisine)}
      ${renderSocialFeedBody(feedKey)}
    </div>`;
}

function renderSocialFeedBody(feedKey) {
  const f = state.socialFeeds[feedKey];
  const items = f.items;
  if (state.loading[feedKey] && items.length === 0) return `<p class="empty-state">${escapeHtml(t('feed.loadingPosts'))}</p>`;
  if (items.length === 0) return `<p class="empty-state">${escapeHtml(t('feed.noPosts'))}</p>`;
  return `
    <div class="post-feed-grid">${items.map((p) => renderSocialPostCard(p, feedKey)).join('')}</div>
    ${f.loading_more ? `<p class="empty-state">${escapeHtml(t('common.loadingMore'))}</p>` : ''}
    ${f.next_cursor ? `<div data-load-more style="height:1px"></div>` : ''}
  `;
}

function reportPost(postId) {
  if (!isLoggedIn()) { showToast(t('post.loginToComment')); switchTab('account'); return; }
  openModal({
    title: t('post.reportTitle'),
    body: `
      <div class="form-field">
        <label class="form-label">${escapeHtml(t('post.reportReason'))}</label>
        <textarea class="form-textarea" name="reason" rows="3" maxlength="500" placeholder="${escapeAttr(t('post.reportReasonPlaceholder'))}"></textarea>
      </div>`,
    submitLabel: t('post.reportSend'),
    danger: true,
    onSubmit: async (data) => {
      state._modalLoading = true; renderApp();
      try {
        await apiPost(`/api/feed/${postId}/report`, { reason: data.reason || null });
        closeModal();
        showToast(t('toasts.reportSent'));
      } catch (err) { showToast(err.message); state._modalLoading = false; renderApp(); }
    },
  });
}

function deletePost(postId, feedKey) {
  openModal({
    title: t('post.deleteTitle'),
    body: `<p style="font-size:14px;line-height:1.6">${escapeHtml(t('post.deleteText'))}</p>`,
    submitLabel: t('common.delete'),
    danger: true,
    onSubmit: async () => {
      state._modalLoading = true; renderApp();
      try {
        await apiDelete(`/api/feed/post/${postId}`);
        if (state.socialFeeds[feedKey]) state.socialFeeds[feedKey].items = state.socialFeeds[feedKey].items.filter((p) => p.id !== postId);
        // Zavri lightbox ak je otvorený pre tento post
        if (state.lightbox?.post?.id === postId) closeLightbox();
        closeModal();
        showToast(t('toasts.postDeleted'));
      } catch (err) { showToast(err.message); state._modalLoading = false; renderApp(); }
    },
  });
}

async function deleteComment(commentId, feedKey, postId) {
  try {
    await apiDelete(`/api/feed/comment/${commentId}`);
    if (state.lightbox?.post?.id === postId) {
      try {
        const c = await apiGet(`/api/feed/${postId}/comments`);
        state.lightbox.post.__comments = c.comments || [];
        state.lightbox.post.comment_count = c.total || 0;
        updateLightboxDOM();
      } catch {}
    }
    showToast(t('toasts.deleted'));
  } catch (err) { showToast(err.message); }
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
      ${renderBackHeader(t('settings.savedPosts'))}
      <div class="profile-section">
        ${list == null ? `<p class="empty-state">${escapeHtml(t('common.loading'))}</p>`
          : list.length === 0 ? `<p class="empty-state">${escapeHtml(t('wishlist.empty'))}</p>`
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
  const post = findPostAnywhere(postId);
  if (!post) return;
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'edit-post', postId, feedKey, html: post.html || post.text || '' };
  pushHistoryState('overlay');
  renderApp();
}

function renderEditPostOverlay() {
  const { postId, feedKey, html } = state.overlay;
  return `
    <div class="page-scroll">
      ${renderBackHeader(t('post.writeEdit'))}
      <div class="profile-section">
        <form data-action="submit-edit-post" data-post-id="${postId}" data-feed="${feedKey}">
          ${renderRichEditor('text_html', t('post.textPlaceholder'), html)}
          <button class="form-submit-btn" type="submit">${escapeHtml(t('post.saveChanges'))}</button>
        </form>
      </div>
    </div>`;
}

async function handleEditPostSubmit(form) {
  const postId = form.dataset.postId;
  const feedKey = form.dataset.feed;
  const html = getEditorHtml(form);
  const btn = form.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = t('common.saving'); }

  try {
    const res = await apiPatch(`/api/feed/post/${postId}`, { html });
    updatePostEverywhere(postId, (p) => { p.html = res.html; p.text = res.text; });
    closeOverlay();
    showToast(t('toasts.saved'));
  } catch (err) {
    showToast(err.message);
    if (btn) { btn.disabled = false; btn.textContent = t('post.saveChanges'); }
  }
}

async function submitLightboxComment(postId, feedKey, text) {
  if (!text.trim()) return;
  if (!isLoggedIn()) { showToast(t('post.loginToComment')); return; }

  try {
    await apiPost(`/api/feed/${postId}/comment`, { text: text.trim() });

    let newComments = null;
    let newTotal = null;
    try {
      const c = await apiGet(`/api/feed/${postId}/comments`);
      newComments = c.comments || [];
      newTotal = (c.total != null) ? c.total : newComments.length;
    } catch {}

    if (state.lightbox?.post?.id === postId) {
      if (newComments) state.lightbox.post.__comments = newComments;
      if (newTotal != null) state.lightbox.post.comment_count = newTotal;
      updateLightboxDOM();
    }

    updatePostEverywhere(postId, (p) => {
      if (newTotal != null) p.comment_count = newTotal;
      if (newComments) p.__comments = newComments;
    });

    if (newTotal != null) {
      document.querySelectorAll(`.post-card[data-post-id="${postId}"] .post-action-badge`).forEach((badge) => {
        badge.textContent = newTotal > 99 ? '99+' : String(newTotal);
      });
    }

    showToast(t('toasts.commentAdded'));
  } catch (err) {
    showToast(err.message);
  }
}
