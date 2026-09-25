// ============================================================
// STORIES — 24h príbehy (video max 10s alebo max 3 fotky)
// ============================================================

const STORY_MAX_DURATION = 10000;
const STORY_PHOTO_DURATION = 3333;

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

  const meCircle = `
    <button class="story-circle story-circle--me" data-action="${meGroup ? 'open-story-viewer' : 'open-create-story'}" data-group-key="me">
      <div class="story-ring ${meGroup ? 'has-story' : ''}">
        ${state.user.avatar_url
          ? `<img src="${state.user.avatar_url}" alt="" />`
          : `<span class="story-initial">${(state.user.display_name || '?').charAt(0).toUpperCase()}</span>`}
        ${!meGroup ? `<span class="story-plus">${icon('plus', { size: 12 })}</span>` : ''}
      </div>
      <span class="story-name">Já</span>
    </button>`;

  const othersHtml = others.map((g) => `
    <button class="story-circle" data-action="open-story-viewer" data-group-key="${g.key}">
      <div class="story-ring has-story">
        ${g.author_avatar
          ? `<img src="${g.author_avatar}" alt="" />`
          : `<span class="story-initial">${(g.author_name || '?').charAt(0).toUpperCase()}</span>`}
      </div>
      <span class="story-name">${escapeHtml(g.author_name)}</span>
    </button>`).join('');

  if (others.length === 0 && !meGroup) return '';

  return `
    <div class="stories-bar">
      ${meCircle}
      ${othersHtml}
    </div>`;
}

function openStoryViewer(groupKey) {
  const groups = state.stories?.groups || [];
  const group = groups.find((g) => g.key === groupKey);
  if (!group || group.stories.length === 0) return;
  state.overlay = { type: 'story-viewer', groupKey, index: 0, likes: {} };
  pushHistoryState('story-viewer');
  renderApp();
  markStoryViewed(group);
}

function markStoryViewed(group) {
  for (const s of group.stories) {
    apiPost(`/api/stories/${s.id}/view`, {}).catch(() => {});
  }
}

function renderStoryViewerOverlay() {
  const { groupKey, index } = state.overlay;
  const groups = state.stories?.groups || [];
  const group = groups.find((g) => g.key === groupKey);
  if (!group || !group.stories[index]) { setTimeout(() => closeOverlay(), 0); return ''; }
  const story = group.stories[index];
  const isMe = group.is_me;

  const isVideo = story.media_type === 'video' || (story.image_url || '').match(/\.(mp4|webm|mov)$/i);
  const mediaHtml = isVideo
    ? `<video src="${story.image_url}" class="story-viewer-media" autoplay muted playsinline loop></video>`
    : `<img src="${story.image_url}" alt="" class="story-viewer-media" />`;

  const bars = group.stories.map((_, i) => `<span class="story-progress-bar ${i < index ? 'is-done' : i === index ? 'is-active' : ''}"></span>`).join('');

  const liked = state.overlay.likes?.[story.id] || false;

  return `
    <div class="story-viewer" data-action="story-tap">
      <div class="story-progress">${bars}</div>
      <div class="story-viewer-head">
        <span class="story-viewer-author">
          ${group.author_avatar ? `<img class="story-viewer-avatar" src="${group.author_avatar}" alt="" />` : `<span class="story-viewer-avatar story-viewer-avatar-init">${(group.author_name || '?').charAt(0).toUpperCase()}</span>`}
          <span>${escapeHtml(group.author_name)}</span>
          <span class="story-viewer-time">${timeAgo(story.created_at)}</span>
        </span>
        <button class="story-viewer-close" data-action="close-story-viewer">${icon('close', { size: 22 })}</button>
      </div>
      <div class="story-viewer-body">
        ${mediaHtml}
        ${story.caption ? `<p class="story-viewer-caption">${escapeHtml(story.caption)}</p>` : ''}
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
  const { groupKey, index } = state.overlay;
  const group = state.stories.groups.find((g) => g.key === groupKey);
  if (!group) return;
  if (index + 1 < group.stories.length) {
    state.overlay = { ...state.overlay, index: index + 1 };
    renderApp();
  } else {
    closeOverlay();
  }
}

function storyPrev() {
  if (state.overlay?.type !== 'story-viewer') return;
  if (state.overlay.index > 0) {
    state.overlay = { ...state.overlay, index: state.overlay.index - 1 };
    renderApp();
  }
}

function closeStoryViewer() { closeOverlay(); }

// ------------------------------------------------------------------
// Vytvorenie story (video alebo max 3 fotky)
// ------------------------------------------------------------------
function openCreateStory() {
  state.overlay = { type: 'create-story', files: [], previews: [], uploading: false, storyType: 'photos' };
  pushHistoryState('create-story');
  renderApp();
}

function renderCreateStoryOverlay() {
  const o = state.overlay;
  const files = o.files || [];
  const previews = o.previews || [];

  return `
    <div class="page-scroll">
      ${renderBackHeader('Přidat story')}
      <div class="profile-section">
        <div class="story-type-toggle">
          <button class="story-type-btn ${o.storyType === 'photos' ? 'is-active' : ''}" data-action="story-type" data-type="photos">
            ${icon('image', { size: 16 })} Fotky (max 3)
          </button>
          <button class="story-type-btn ${o.storyType === 'video' ? 'is-active' : ''}" data-action="story-type" data-type="video">
            ${icon('camera', { size: 16 })} Video (max 10s)
          </button>
        </div>

        <form data-action="submit-create-story">
          <div class="file-drop ${files.length > 0 ? 'has-file' : ''}" data-action="trigger-story-file">
            <input type="file" accept="${o.storyType === 'video' ? 'video/*' : 'image/*'}" id="story-file-input" data-action="story-file-selected" style="display:none" ${o.storyType === 'photos' ? 'multiple' : ''} />
            ${previews.length > 0
              ? `<div class="story-preview-grid">${previews.map((p, i) => `
                  <div class="story-preview-item">
                    ${p.type === 'video' ? `<video src="${p.url}" muted></video>` : `<img src="${p.url}" />`}
                    <button type="button" class="file-preview-remove" data-action="remove-story-file" data-index="${i}">${icon('close', { size: 12 })}</button>
                  </div>
                `).join('')}</div>`
              : `${icon('image', { size: 28 })}<br/>Klikni pro výběr ${o.storyType === 'video' ? 'videa' : '1–3 fotek'}`}
          </div>
          <div class="form-field">
            <label class="form-label">Popisek (nepovinné)</label>
            <input class="form-input" name="caption" maxlength="200" />
          </div>
          <button class="form-submit-btn" type="submit" ${files.length === 0 ? 'disabled' : ''}>
            ${o.uploading ? 'Nahrávám…' : 'Zveřejnit story (24 h)'}
          </button>
        </form>
        <p class="form-hint">Story zmizí po 24 hodinách. Max 10 sekund.</p>
      </div>
    </div>`;
}

async function onStoryFileSelected(inputEl) {
  const o = state.overlay;
  const files = Array.from(inputEl.files || []);
  if (files.length === 0) return;

  if (o.storyType === 'video') {
    const file = files[0];
    if (!file.type.startsWith('video/')) { showToast('Vyber video.'); return; }
    o.files = [file];
    o.previews = [{ type: 'video', url: URL.createObjectURL(file) }];
  } else {
    const photos = files.filter((f) => f.type.startsWith('image/')).slice(0, 3);
    if (photos.length === 0) { showToast('Vyber fotky.'); return; }
    const compressed = [];
    for (const f of photos) {
      try { compressed.push(await compressImage(f, { maxDim: 1080, quality: 0.85 })); }
      catch { compressed.push(f); }
    }
    o.files = compressed;
    o.previews = compressed.map((f) => ({ type: 'image', url: URL.createObjectURL(f) }));
  }
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
  o.uploading = true;
  renderApp();

  try {
    const uploadedUrls = [];
    for (const file of o.files) {
      const fd = new FormData();
      fd.append('file', file);
      const endpoint = o.storyType === 'video' ? '/api/stories/upload-video' : '/api/stories/upload';
      const up = await apiPost(endpoint, fd);
      uploadedUrls.push(up.url);
    }

    const caption = form.querySelector('input[name="caption"]')?.value || '';
    await apiPost('/api/stories', {
      image_url: uploadedUrls[0],
      caption,
      media_urls: uploadedUrls,
      media_type: o.storyType === 'video' ? 'video' : 'photo',
    });

    showToast('Story zveřejněna.');
    state.stories = null;
    closeOverlay();
    loadStoriesFeed();
  } catch (err) {
    showToast(err.message);
    o.uploading = false;
    renderApp();
  }
}
