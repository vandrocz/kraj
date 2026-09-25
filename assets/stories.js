// ============================================================
// STORIES — 24h príbehy
// ============================================================

const STORY_MAX_DURATION = 10000;
const STORY_PHOTO_DURATION = 3333;
const STORY_ASPECT = 9 / 16;
const STORY_OUT_WIDTH = 1080;

async function loadStoriesFeed() {
  if (!isLoggedIn()) { state.stories = { groups: [] }; return; }
  try {
    const data = await apiGet('/api/stories/feed');
    state.stories = { groups: data.groups || [] };
  } catch (err) {
    state.stories = { groups: [] };
  }
  if (['organizations', 'accommodation', 'gastro'].includes(state.tab)) renderApp();
}

// ============================================================
// Stories bar — jedna flexibilná horizontálna lišta
// ============================================================
function renderStoriesBar() {
  if (!isLoggedIn()) return '';

  const groups = state.stories?.groups || [];
  const meGroup = groups.find((g) => g.is_me);
  const myBizGroups = groups.filter((g) => g.is_my_business);
  const others = groups.filter((g) => !g.is_me && !g.is_my_business);

  const circles = [];

  // 1) Osobný "me" circle (pre všetkých, okrem admina)
  if (state.user.role !== 'admin') {
    circles.push(`
      <button class="story-circle story-circle--me"
              data-action="${meGroup ? 'open-story-viewer' : 'open-create-story'}"
              ${meGroup ? `data-group-key="me"` : ''}>
        <div class="story-ring ${meGroup ? 'has-story' : ''}">
          ${state.user.avatar_url
            ? `<img src="${escapeAttr(state.user.avatar_url)}" alt="" />`
            : `<span class="story-initial">${(state.user.display_name || '?').charAt(0).toUpperCase()}</span>`}
          ${!meGroup ? `<span class="story-plus">${icon('plus', { size: 12 })}</span>` : ''}
        </div>
        <span class="story-name">${escapeHtml(t('stories.me'))}</span>
      </button>
    `);
  }

  // 2) Business circles (pre každý podnik aktuálneho usera)
  const myBusinesses = state.businesses || [];
  for (const biz of myBusinesses) {
    const bizGroup = myBizGroups.find((g) => g.business_id === biz.id);
    const hasStory = !!bizGroup;

    circles.push(`
      <button class="story-circle story-circle--me"
              data-action="${hasStory ? 'open-story-viewer' : 'open-create-story'}"
              ${hasStory ? `data-group-key="${escapeAttr(bizGroup.key)}"` : ''}
              data-business-id="${escapeAttr(biz.id)}"
              data-business-name="${escapeAttr(biz.name)}">
        <div class="story-ring ${hasStory ? 'has-story' : ''}">
          ${biz.logo_url
            ? `<img src="${escapeAttr(biz.logo_url)}" alt="" />`
            : `<span class="story-initial">${(biz.name || '?').charAt(0).toUpperCase()}</span>`}
          ${!hasStory ? `<span class="story-plus">${icon('plus', { size: 12 })}</span>` : ''}
        </div>
        <span class="story-name">${escapeHtml((biz.name || '').slice(0, 14))}</span>
      </button>
    `);
  }

  // 3) Sledovaní (users + businesses)
  for (const g of others) {
    const storyThumb = getFirstStoryThumb(g);
    circles.push(`
      <button class="story-circle" data-action="open-story-viewer" data-group-key="${escapeAttr(g.key)}">
        <div class="story-ring has-story">
          ${storyThumb
            ? `<img src="${escapeAttr(storyThumb)}" alt="" />`
            : (g.author_avatar
              ? `<img src="${escapeAttr(g.author_avatar)}" alt="" />`
              : `<span class="story-initial">${(g.author_name || '?').charAt(0).toUpperCase()}</span>`)}
        </div>
        <span class="story-name">${escapeHtml(g.author_name || '')}</span>
      </button>
    `);
  }

  if (circles.length === 0) return '';

  return `
    <div class="stories-bar" role="list">
      ${circles.join('')}
    </div>`;
}

function getFirstStoryThumb(group) {
  if (!group?.stories?.length) return null;
  const s = group.stories[0];
  if (s.media_urls && Array.isArray(s.media_urls) && s.media_urls.length > 0) return s.media_urls[0];
  return s.image_url || null;
}

// ============================================================
// Story Viewer
// ============================================================
function openStoryViewer(groupKey) {
  const groups = state.stories?.groups || [];
  const group = groups.find((g) => g.key === groupKey);
  if (!group || group.stories.length === 0) return;

  state.overlay = {
    type: 'story-viewer',
    groupKey,
    index: 0,
    mediaIndex: 0,
    likes: {},
    slideStartAt: Date.now(),
  };
  pushHistoryState('story-viewer');
  renderApp();
  markStoryViewed(group);
  startStoryAutoAdvance();
}

let _storyTimer = null;
function startStoryAutoAdvance() {
  stopStoryAutoAdvance();
  _storyTimer = setInterval(() => {
    if (state.overlay?.type !== 'story-viewer') { stopStoryAutoAdvance(); return; }
    const groups = state.stories?.groups || [];
    const group = groups.find((g) => g.key === state.overlay.groupKey);
    if (!group) return;
    const story = group.stories[state.overlay.index];
    if (!story) return;
    if (story.media_type === 'video') return;

    const storyMediaList = getStoryMediaList(story);
    const elapsed = Date.now() - (state.overlay.slideStartAt || Date.now());

    if (elapsed >= STORY_PHOTO_DURATION) {
      if (state.overlay.mediaIndex + 1 < storyMediaList.length) {
        state.overlay.mediaIndex += 1;
        state.overlay.slideStartAt = Date.now();
        renderApp();
      } else {
        storyNext();
      }
    }
  }, 250);
}

function stopStoryAutoAdvance() {
  if (_storyTimer) clearInterval(_storyTimer);
  _storyTimer = null;
}

function getStoryMediaList(story) {
  if (story.media_urls && Array.isArray(story.media_urls) && story.media_urls.length > 0) {
    return story.media_urls;
  }
  if (story.image_url) return [story.image_url];
  return [];
}

function markStoryViewed(group) {
  for (const s of group.stories) {
    apiPost(`/api/stories/${s.id}/view`, {}).catch(() => {});
  }
}

function renderStoryViewerOverlay() {
  const { groupKey, index, mediaIndex } = state.overlay;
  const groups = state.stories?.groups || [];
  const group = groups.find((g) => g.key === groupKey);
  if (!group || !group.stories[index]) { setTimeout(() => closeOverlay(), 0); return ''; }
  const story = group.stories[index];
  const isMe = group.is_me || group.is_my_business;

  const storyMediaList = getStoryMediaList(story);
  const currentMedia = storyMediaList[mediaIndex] || storyMediaList[0];
  const isVideo = story.media_type === 'video' || (currentMedia || '').match(/\.(mp4|webm|mov)$/i);

  const mediaHtml = isVideo
    ? `<video src="${escapeAttr(currentMedia)}" class="story-viewer-media" autoplay muted playsinline onended="storyNext()"></video>`
    : `<img src="${escapeAttr(currentMedia)}" alt="" class="story-viewer-media" />`;

  const bars = group.stories.map((_, i) => {
    const isDone = i < index;
    const isActive = i === index;
    return `<span class="story-progress-bar ${isDone ? 'is-done' : isActive ? 'is-active' : ''}"></span>`;
  }).join('');

  const liked = state.overlay.likes?.[story.id] || false;

  const dotsHtml = storyMediaList.length > 1 ? `
    <div class="story-viewer-dots">
      ${storyMediaList.map((_, i) => `<span class="story-viewer-dot ${i === mediaIndex ? 'is-active' : ''}"></span>`).join('')}
    </div>
  ` : '';

  return `
    <div class="story-viewer" id="story-viewer-root">
      <div class="story-progress">${bars}</div>

      <div class="story-viewer-head">
        <button type="button" class="story-viewer-author-btn"
                data-action="open-story-author"
                data-author-id="${escapeAttr(group.author_id || '')}"
                data-author-kind="${escapeAttr(group.author_kind || 'user')}">
          ${group.author_avatar
            ? `<img class="story-viewer-avatar" src="${escapeAttr(group.author_avatar)}" alt="" />`
            : `<span class="story-viewer-avatar story-viewer-avatar-init">${(group.author_name || '?').charAt(0).toUpperCase()}</span>`}
          <span>${escapeHtml(group.author_name)}</span>
          <span class="story-viewer-time">${timeAgo(story.created_at)}</span>
        </button>
        <button class="story-viewer-close" data-action="close-story-viewer" aria-label="${escapeAttr(t('common.close'))}">${icon('close', { size: 22 })}</button>
      </div>

      <div class="story-viewer-body">
        ${mediaHtml}
        ${story.caption ? `<p class="story-viewer-caption">${escapeHtml(story.caption)}</p>` : ''}
        ${dotsHtml}
      </div>

      <div class="story-viewer-nav story-viewer-prev" data-action="story-prev" aria-label="${escapeAttr(t('common.prev'))}"></div>
      <div class="story-viewer-nav story-viewer-next" data-action="story-next" aria-label="${escapeAttr(t('common.next'))}"></div>

      ${!isMe ? `
        <button class="story-like-btn ${liked ? 'is-liked' : ''}" data-action="story-like" data-id="${story.id}">
          ${icon('spark', { size: 22, filled: liked })}
          <span class="story-like-count">${story.likes || 0}</span>
        </button>
      ` : ''}
    </div>`;
}

// ============================================================
// Story swipe handling
// ============================================================
let _storySwipeSetup = false;

function setupStorySwipe() {
  if (_storySwipeSetup) return;
  _storySwipeSetup = true;

  let startX = 0, startY = 0, startTime = 0;
  let tracking = false;

  document.addEventListener('touchstart', (e) => {
    if (!document.getElementById('story-viewer-root')) return;
    // Ignoruj ak klikol na tlačidlo (like, close, author)
    if (e.target.closest('button')) return;
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    startTime = Date.now();
    tracking = true;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    if (!document.getElementById('story-viewer-root')) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    const dt = Date.now() - startTime;

    // Swipe dole = zavrieť (rýchly alebo veľký pohyb)
    if (dy > 80 && Math.abs(dy) > Math.abs(dx)) {
      stopStoryAutoAdvance();
      closeStoryViewer();
      return;
    }

    // Swipe vľavo/vpravo = navigácia
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      stopStoryAutoAdvance();
      if (dx < 0) storyNext();
      else storyPrev();
      return;
    }

    // Krátky tap (do 250 ms, malý pohyb) = zónová navigácia
    if (dt < 250 && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const w = window.innerWidth;
      stopStoryAutoAdvance();
      if (t.clientX < w * 0.3) storyPrev();
      else if (t.clientX > w * 0.7) storyNext();
      // Stred nič nerobí (nechceme pauzovať, keďže auto-advance ide sám)
    }
  }, { passive: true });
}

setupStorySwipe();

async function storyLike(storyId) {
  try {
    const res = await apiPost(`/api/stories/${storyId}/like`, {});
    if (!state.overlay.likes) state.overlay.likes = {};
    state.overlay.likes[storyId] = res.liked;
    for (const g of state.stories.groups) {
      const s = g.stories.find((x) => x.id === storyId);
      if (s) s.likes = res.likes;
    }
    renderApp();
  } catch (err) { showToast(err.message); }
}

function storyNext() {
  if (state.overlay?.type !== 'story-viewer') return;
  const { groupKey, index, mediaIndex } = state.overlay;
  const group = state.stories.groups.find((g) => g.key === groupKey);
  if (!group) return;

  const story = group.stories[index];
  const storyMediaList = story ? getStoryMediaList(story) : [];

  if (storyMediaList.length > 1 && mediaIndex + 1 < storyMediaList.length) {
    state.overlay.mediaIndex = mediaIndex + 1;
    state.overlay.slideStartAt = Date.now();
    renderApp();
    startStoryAutoAdvance();
    return;
  }

  if (index + 1 < group.stories.length) {
    state.overlay = { ...state.overlay, index: index + 1, mediaIndex: 0, slideStartAt: Date.now() };
    renderApp();
    startStoryAutoAdvance();
  } else {
    stopStoryAutoAdvance();
    closeOverlay();
  }
}

function storyPrev() {
  if (state.overlay?.type !== 'story-viewer') return;
  const { index, mediaIndex } = state.overlay;

  if (mediaIndex > 0) {
    state.overlay.mediaIndex = mediaIndex - 1;
    state.overlay.slideStartAt = Date.now();
    renderApp();
    startStoryAutoAdvance();
    return;
  }

  if (index > 0) {
    state.overlay = { ...state.overlay, index: index - 1, mediaIndex: 0, slideStartAt: Date.now() };
    renderApp();
    startStoryAutoAdvance();
  }
}

function closeStoryViewer() {
  stopStoryAutoAdvance();
  closeOverlay();
}

// Autor z story viewera → otvor profil
function openStoryAuthor(authorId, authorKind) {
  if (!authorId) return;
  // Zavri story viewer
  stopStoryAutoAdvance();
  state.overlay = null;
  state.overlayStack = [];
  state._historyPushed = false;

  // Otvor profil
  let kind = authorKind || 'user';
  if (kind === 'organizations') kind = 'organizations';
  else if (kind === 'accommodation') kind = 'accommodation';
  else if (kind === 'restaurants') kind = 'restaurants';
  else kind = 'user';

  openProfile(kind, authorId);
}

// ============================================================
// Vytvorenie story
// ============================================================
function openCreateStory(businessId = null, businessName = null) {
  state.overlay = {
    type: 'create-story',
    files: [],
    previews: [],
    uploading: false,
    storyType: 'photos',
    businessId: businessId || null,
    businessName: businessName || null,
    cropBusy: false,
  };
  pushHistoryState('create-story');
  renderApp();
}

function renderCreateStoryOverlay() {
  const o = state.overlay;
  const files = o.files || [];
  const previews = o.previews || [];
  const isBusiness = !!o.businessId;
  const isBusy = o.cropBusy || o.uploading;

  return `
    <div class="page-scroll">
      ${renderBackHeader(t('stories.title'))}
      <div class="profile-section">
        ${isBusiness ? `
          <div class="story-context-chip">
            ${icon('camera', { size: 14 })}
            <span>${escapeHtml(t('stories.publishingAs'))}: <strong>${escapeHtml(o.businessName || '')}</strong></span>
          </div>
        ` : ''}

        <div class="story-type-toggle">
          <button class="story-type-btn ${o.storyType === 'photos' ? 'is-active' : ''}" data-action="story-type" data-type="photos" ${isBusy ? 'disabled' : ''}>
            ${icon('image', { size: 16 })} ${escapeHtml(t('stories.photosType'))}
          </button>
          <button class="story-type-btn ${o.storyType === 'video' ? 'is-active' : ''}" data-action="story-type" data-type="video" ${isBusy ? 'disabled' : ''}>
            ${icon('camera', { size: 16 })} ${escapeHtml(t('stories.videoType'))}
          </button>
        </div>

        <div class="story-format-hint">
          ${o.storyType === 'photos'
            ? `📱 ${escapeHtml(t('stories.verticalHint'))} · 9:16`
            : `🎬 MP4/WebM/MOV · max 10s · max 30 MB`}
        </div>

        <form data-action="submit-create-story">
          <div class="file-drop ${files.length > 0 ? 'has-file' : ''}" data-action="${isBusy ? '' : 'trigger-story-file'}">
            <input type="file" accept="${o.storyType === 'video' ? 'video/*' : 'image/*'}" id="story-file-input" data-action="story-file-selected" style="display:none" ${o.storyType === 'photos' ? 'multiple' : ''} />
            ${previews.length > 0
              ? `<div class="story-preview-grid story-preview-grid--9-16">${previews.map((p, i) => `
                  <div class="story-preview-item story-preview-item--9-16">
                    ${p.type === 'video' ? `<video src="${p.url}" muted></video>` : `<img src="${p.url}" />`}
                    <button type="button" class="file-preview-remove" data-action="remove-story-file" data-index="${i}" ${isBusy ? 'disabled' : ''}>${icon('close', { size: 12 })}</button>
                  </div>
                `).join('')}</div>`
              : `${icon('image', { size: 28 })}<br/>${escapeHtml(o.storyType === 'video' ? t('stories.pickVideo') : t('stories.pickPhotos'))}`}
          </div>
          <div class="form-field">
            <label class="form-label">${escapeHtml(t('stories.caption'))}</label>
            <input class="form-input" name="caption" maxlength="200" ${isBusy ? 'disabled' : ''} />
          </div>
          <button class="form-submit-btn" type="submit" ${(files.length === 0 || isBusy) ? 'disabled' : ''}>
            ${o.uploading ? escapeHtml(t('common.uploading')) : o.cropBusy ? escapeHtml(t('stories.cropping')) : escapeHtml(t('stories.publish'))}
          </button>
        </form>
        <p class="form-hint">${escapeHtml(t('stories.hint'))}</p>
      </div>
    </div>`;
}

async function onStoryFileSelected(inputEl) {
  const o = state.overlay;
  const files = Array.from(inputEl.files || []);
  if (files.length === 0) return;

  if (o.storyType === 'video') {
    const file = files[0];
    if (!file.type.startsWith('video/')) { showToast(t('stories.videoType')); return; }
    if (file.size > 30 * 1024 * 1024) { showToast(t('stories.tooLargeVideo')); return; }
    o.files = [file];
    o.previews = [{ type: 'video', url: URL.createObjectURL(file) }];
    renderApp();
    return;
  }

  const photos = files.filter((f) => f.type.startsWith('image/')).slice(0, 3);
  if (photos.length === 0) { showToast(t('stories.photosType')); return; }

  const compressed = [];
  for (const f of photos) {
    try { compressed.push(await compressImage(f, { maxDim: 2400, quality: 0.92 })); }
    catch { compressed.push(f); }
  }

  o.cropBusy = true;
  renderApp();

  const croppedFiles = [];
  const croppedPreviews = [];
  try {
    for (let i = 0; i < compressed.length; i++) {
      const cropped = await openCropEditor(compressed[i], {
        aspect: STORY_ASPECT,
        maxWidth: STORY_OUT_WIDTH,
        quality: 0.88,
        label: `Story 9:16 (${i + 1}/${compressed.length})`,
      });
      if (cropped === null) {
        o.cropBusy = false;
        o.files = [];
        o.previews = [];
        renderApp();
        return;
      }
      croppedFiles.push(cropped);
      croppedPreviews.push({ type: 'image', url: URL.createObjectURL(cropped) });
    }
  } catch (err) {
    console.error('Crop error:', err);
    o.cropBusy = false;
    renderApp();
    showToast('Nepodařilo se ořezat obrázky.');
    return;
  }

  o.files = croppedFiles;
  o.previews = croppedPreviews;
  o.cropBusy = false;
  renderApp();
}

function removeStoryFile(index) {
  state.overlay.files.splice(index, 1);
  state.overlay.previews.splice(index, 1);
  renderApp();
}

async function handleCreateStorySubmit(form) {
  const o = state.overlay;
  if (!o.files || o.files.length === 0) return;
  if (o.uploading) return;

  o.uploading = true;
  renderApp();

  showUploadOverlay(t('common.uploading'));

  try {
    const uploadedUrls = [];
    const total = o.files.length;

    for (let i = 0; i < total; i++) {
      const file = o.files[i];
      const fd = new FormData();
      fd.append('file', file);

      const endpoint = o.storyType === 'video' ? '/api/stories/upload-video' : '/api/stories/upload';

      const up = await uploadWithProgress(endpoint, fd, (pct) => {
        const overall = ((i + pct / 100) / total) * 100;
        updateUploadOverlay(overall, `${t('common.uploading')} ${i + 1}/${total}`);
      });

      if (!up || !up.url) throw new Error('Nahrávanie zlyhalo.');
      uploadedUrls.push(up.url);
    }

    const caption = form.querySelector('input[name="caption"]')?.value || '';
    const payload = {
      image_url: uploadedUrls[0],
      caption,
      media_urls: uploadedUrls,
      media_type: o.storyType === 'video' ? 'video' : 'photo',
    };

    if (o.businessId) payload.business_id = o.businessId;

    updateUploadOverlay(100, t('common.processing'));
    await apiPost('/api/stories', payload);

    hideUploadOverlay();
    showToast(t('stories.published'));

    state.stories = null;
    state._historyPushed = false;
    state.overlay = null;
    state.overlayStack = [];
    document.body.style.overflow = '';
    document.body.style.pointerEvents = '';

    renderApp();
    loadStoriesFeed();
  } catch (err) {
    hideUploadOverlay();
    showToast(err.message);
    o.uploading = false;
    renderApp();
  }
}
