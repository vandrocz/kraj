// ============================================================
// STORIES — 24h príbehy (fotky 9:16 / video max 10s)
// ============================================================
// Pravidlá:
// - Osobný používateľ: story sa priradí k user_id (business_id = null)
// - Organizácia/podnik: story sa priradí k business_id (user_id ostáva pre autorstvo)
// - Fotky: max 3, orezané na 9:16 (1080x1920)
// - Video: max 1, max 30 MB, bez ořezu (video editor nerobíme)

const STORY_MAX_DURATION = 10000;
const STORY_PHOTO_DURATION = 3333;
const STORY_ASPECT = 9 / 16;   // 0.5625
const STORY_OUT_WIDTH = 1080;  // → 1920 výška

// ============================================================
// Stories bar
// ============================================================
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

function renderStoriesBar() {
  if (!isLoggedIn()) return '';
  const groups = state.stories?.groups || [];
  const meGroup = groups.find((g) => g.is_me);
  const others = groups.filter((g) => !g.is_me);

  const isTourist = state.user.role === 'user';
  const meCircle = isTourist ? `
    <button class="story-circle story-circle--me" data-action="${meGroup ? 'open-story-viewer' : 'open-create-story'}" data-group-key="me">
      <div class="story-ring ${meGroup ? 'has-story' : ''}">
        ${state.user.avatar_url
          ? `<img src="${state.user.avatar_url}" alt="" />`
          : `<span class="story-initial">${(state.user.display_name || '?').charAt(0).toUpperCase()}</span>`}
        ${!meGroup ? `<span class="story-plus">${icon('plus', { size: 12 })}</span>` : ''}
      </div>
      <span class="story-name">${escapeHtml(t('stories.me'))}</span>
    </button>` : '';

  const othersHtml = others.map((g) => `
    <button class="story-circle" data-action="open-story-viewer" data-group-key="${g.key}">
      <div class="story-ring has-story">
        ${g.author_avatar
          ? `<img src="${g.author_avatar}" alt="" />`
          : `<span class="story-initial">${(g.author_name || '?').charAt(0).toUpperCase()}</span>`}
      </div>
      <span class="story-name">${escapeHtml(g.author_name)}</span>
    </button>`).join('');

  if (!isTourist && others.length === 0) return '';

  return `
    <div class="stories-bar">
      ${meCircle}
      ${othersHtml}
    </div>`;
}

// ============================================================
// Story Viewer — podporuje viac médií (carousel v rámci jednej story)
// ============================================================
function openStoryViewer(groupKey) {
  const groups = state.stories?.groups || [];
  const group = groups.find((g) => g.key === groupKey);
  if (!group || group.stories.length === 0) return;

  state.overlay = {
    type: 'story-viewer',
    groupKey,
    index: 0,
    mediaIndex: 0, // index fotky v rámci story (pre multi-photo stories)
    likes: {},
    slideStartAt: Date.now(),
  };
  pushHistoryState('story-viewer');
  renderApp();
  markStoryViewed(group);

  // Automatický posun progress baru (pre fotky)
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

    // Ak má story viac médií, najprv prejdi cez ne
    const storyMediaList = getStoryMediaList(story);
    const isVideo = story.media_type === 'video';

    if (isVideo) return; // video si riadi vlastný čas (onended/loop)

    const now = Date.now();
    const elapsed = now - (state.overlay.slideStartAt || now);

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

// Vráti pole médií (obrázkov/videí) pre jednu story (1 alebo viac)
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
  const isMe = group.is_me;

  const storyMediaList = getStoryMediaList(story);
  const currentMedia = storyMediaList[mediaIndex] || storyMediaList[0];
  const isVideo = story.media_type === 'video' || (currentMedia || '').match(/\.(mp4|webm|mov)$/i);

  let mediaHtml = '';
  if (isVideo) {
    mediaHtml = `<video src="${currentMedia}" class="story-viewer-media" autoplay muted playsinline
                  onended="storyNext()"></video>`;
  } else {
    mediaHtml = `<img src="${escapeAttr(currentMedia)}" alt="" class="story-viewer-media" />`;
  }

  // Progress bars — jedna pre každú story v skupine
  const bars = group.stories.map((_, i) => {
    const isDone = i < index;
    const isActive = i === index;
    // Pre multi-photo story, čiastkový progress
    let progressStyle = '';
    if (isActive && storyMediaList.length > 1) {
      // Čiastočný progress na základe mediaIndex
      // (detailný real-time progress sa updatuje cez JS nižšie, ale stačí hrubý)
      const totalSegments = storyMediaList.length;
      const currentSeg = mediaIndex;
      const pct = ((currentSeg + 0.5) / totalSegments) * 100;
      progressStyle = `style="--progress: ${pct}%"`;
    }
    return `<span class="story-progress-bar ${isDone ? 'is-done' : isActive ? 'is-active' : ''}" ${progressStyle}></span>`;
  }).join('');

  const liked = state.overlay.likes?.[story.id] || false;

  // Indikátor stránok v rámci story (bodky) — len ak > 1 médium
  const dotsHtml = storyMediaList.length > 1 ? `
    <div class="story-viewer-dots">
      ${storyMediaList.map((_, i) => `<span class="story-viewer-dot ${i === mediaIndex ? 'is-active' : ''}"></span>`).join('')}
    </div>
  ` : '';

  return `
    <div class="story-viewer" data-action="story-tap">
      <div class="story-progress">${bars}</div>
      <div class="story-viewer-head">
        <span class="story-viewer-author">
          ${group.author_avatar ? `<img class="story-viewer-avatar" src="${group.author_avatar}" alt="" />` : `<span class="story-viewer-avatar story-viewer-avatar-init">${(group.author_name || '?').charAt(0).toUpperCase()}</span>`}
          <span>${escapeHtml(group.author_name)}</span>
          <span class="story-viewer-time">${timeAgo(story.created_at)}</span>
        </span>
        <button class="story-viewer-close" data-action="close-story-viewer" aria-label="${escapeAttr(t('common.close'))}">${icon('close', { size: 22 })}</button>
      </div>
      <div class="story-viewer-body">
        ${mediaHtml}
        ${story.caption ? `<p class="story-viewer-caption">${escapeHtml(story.caption)}</p>` : ''}
        ${dotsHtml}
      </div>
      <div class="story-viewer-nav story-viewer-prev" data-action="story-prev"></div>
      <div class="story-viewer-nav story-viewer-next" data-action="story-next"></div>
      ${!isMe ? `
        <button class="story-like-btn ${liked ? 'is-liked' : ''}" data-action="story-like" data-id="${story.id}">
          ${icon('spark', { size: 22, filled: liked })}
          <span class="story-like-count">${story.likes || 0}</span>
        </button>
      ` : ''}
    </div>`;
}

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

  // Ak má story viac médií a nie sme na poslednom, choď na ďalšie médium
  if (storyMediaList.length > 1 && mediaIndex + 1 < storyMediaList.length) {
    state.overlay.mediaIndex = mediaIndex + 1;
    state.overlay.slideStartAt = Date.now();
    renderApp();
    startStoryAutoAdvance();
    return;
  }

  // Posun na ďalšiu story
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

  // Ak sme v rámci story na neskoršom médiu, choď na predošlé médium
  if (mediaIndex > 0) {
    state.overlay.mediaIndex = mediaIndex - 1;
    state.overlay.slideStartAt = Date.now();
    renderApp();
    startStoryAutoAdvance();
    return;
  }

  // Posun na predošlú story
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

  // Fotky — vyber max 3, orežeme ich na 9:16
  const photos = files.filter((f) => f.type.startsWith('image/')).slice(0, 3);
  if (photos.length === 0) { showToast(t('stories.photosType')); return; }

  // Najprv kompresia (zmenšíme pred ořezom, aby bol editor rýchlejší)
  const compressed = [];
  for (const f of photos) {
    try { compressed.push(await compressImage(f, { maxDim: 2400, quality: 0.92 })); }
    catch { compressed.push(f); }
  }

  // Spusti crop editor pre každú fotku
  o.cropBusy = true;
  renderApp();

  const croppedFiles = [];
  const croppedPreviews = [];
  try {
    for (let i = 0; i < compressed.length; i++) {
      const file = compressed[i];
      const cropped = await openCropEditor(file, {
        aspect: STORY_ASPECT,
        maxWidth: STORY_OUT_WIDTH,
        quality: 0.88,
        label: `Story 9:16 (${i + 1}/${compressed.length})`,
      });
      if (cropped === null) {
        // User zrušil crop — zrušíme celý výber
        o.cropBusy = false;
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
        // Celkový progress = dokončené súbory + čiastočný aktuálny
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
    closeOverlay();
    loadStoriesFeed();
  } catch (err) {
    hideUploadOverlay();
    showToast(err.message);
    o.uploading = false;
    renderApp();
  }
}
