// ============================================================
// STORIES
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
  state.overlay = { type: 'story-viewer', groupKey, index: 0, replyOpen: false, replyText: '' };
  renderApp();
  markStoryViewed(group);
}

function markStoryViewed(group) {
  for (const s of group.stories) {
    apiPost(`/api/stories/${s.id}/view`, {}).catch(() => {});
  }
}

function renderStoryViewerOverlay() {
  const { groupKey, index, replyOpen, replyText } = state.overlay;
  const groups = state.stories?.groups || [];
  const group = groups.find((g) => g.key === groupKey);
  if (!group || !group.stories[index]) { setTimeout(() => closeOverlay(), 0); return ''; }
  const story = group.stories[index];
  const isMe = group.is_me;

  const bars = group.stories.map((_, i) => `<span class="story-progress-bar ${i < index ? 'is-done' : i === index ? 'is-active' : ''}"></span>`).join('');

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
        <img src="${story.image_url}" alt="" class="story-viewer-img" />
        ${story.caption ? `<p class="story-viewer-caption">${escapeHtml(story.caption)}</p>` : ''}
      </div>
      <div class="story-viewer-nav story-viewer-prev" data-action="story-prev"></div>
      <div class="story-viewer-nav story-viewer-next" data-action="story-next"></div>
      ${!isMe ? `
        ${!replyOpen ? `
          <button class="story-reply-trigger" data-action="story-reply-open">
            ${icon('chat', { size: 18 })} Odpovědět
          </button>
        ` : `
          <div class="story-reply-box">
            <input type="text" class="story-reply-input" placeholder="Odpověz…" value="${escapeAttr(replyText)}" data-story-reply-input maxlength="500" autofocus />
            <button class="story-reply-send" data-action="story-reply-send">${icon('send', { size: 18 })}</button>
            <button class="story-reply-cancel" data-action="story-reply-cancel">${icon('close', { size: 18 })}</button>
          </div>
        `}
      ` : ''}
    </div>`;
}

function storyReplyOpen() {
  if (state.overlay?.type !== 'story-viewer') return;
  state.overlay.replyOpen = true;
  renderApp();
  setTimeout(() => document.querySelector('[data-story-reply-input]')?.focus(), 50);
}

function storyReplyCancel() {
  if (state.overlay?.type !== 'story-viewer') return;
  state.overlay.replyOpen = false;
  state.overlay.replyText = '';
  renderApp();
}

async function storyReplySend() {
  if (state.overlay?.type !== 'story-viewer') return;
  const group = state.stories.groups.find((g) => g.key === state.overlay.groupKey);
  if (!group) return;
  const story = group.stories[state.overlay.index];
  if (!story) return;

  const input = document.querySelector('[data-story-reply-input]');
  const text = (input?.value || '').trim();
  if (!text) return;

  try {
    await apiPost(`/api/stories/${story.id}/reply`, { text });
    showToast('Odpověď odeslána.');
    state.overlay.replyOpen = false;
    state.overlay.replyText = '';
    renderApp();
  } catch (err) { showToast(err.message); }
}

function storyNext() {
  if (state.overlay?.type !== 'story-viewer') return;
  const { groupKey, index } = state.overlay;
  const group = state.stories.groups.find((g) => g.key === groupKey);
  if (!group) return;
  if (index + 1 < group.stories.length) {
    state.overlay = { ...state.overlay, index: index + 1, replyOpen: false, replyText: '' };
    renderApp();
  } else {
    closeOverlay();
  }
}

function storyPrev() {
  if (state.overlay?.type !== 'story-viewer') return;
  if (state.overlay.index > 0) {
    state.overlay = { ...state.overlay, index: state.overlay.index - 1, replyOpen: false, replyText: '' };
    renderApp();
  }
}

function closeStoryViewer() { closeOverlay(); }

function openCreateStory() {
  state.overlay = { type: 'create-story', file: null, previewUrl: null, uploading: false };
  renderApp();
}

function renderCreateStoryOverlay() {
  return `
    <div class="page-scroll">
      ${renderBackHeader('Přidat story')}
      <div class="profile-section">
        <form data-action="submit-create-story">
          <div class="file-drop ${state.overlay.file ? 'has-file' : ''}" data-action="trigger-story-file">
            <input type="file" accept="image/*" id="story-file-input" data-action="story-file-selected" style="display:none" />
            ${state.overlay.previewUrl
              ? `<img src="${state.overlay.previewUrl}" style="max-height:280px;border-radius:12px;margin:0 auto" />`
              : `${icon('image', { size: 28 })}<br/>Klikni pro výběr fotky`}
          </div>
          <div class="form-field">
            <label class="form-label">Popisek (nepovinné)</label>
            <input class="form-input" name="caption" maxlength="200" />
          </div>
          <button class="form-submit-btn" type="submit" ${state.overlay.file ? '' : 'disabled'}>
            ${state.overlay.uploading ? 'Nahrávam…' : 'Zveřejnit story (24 h)'}
          </button>
        </form>
      </div>
    </div>`;
}

async function onStoryFileSelected(inputEl) {
  const file = inputEl.files?.[0];
  if (!file) return;
  const compressed = await compressImage(file, { maxDim: 1080, quality: 0.85 });
  state.overlay = { ...state.overlay, file: compressed, previewUrl: URL.createObjectURL(compressed) };
  renderApp();
}

async function handleCreateStorySubmit(form) {
  if (!state.overlay.file) return;
  state.overlay.uploading = true;
  renderApp();
  try {
    const fd = new FormData();
    fd.append('file', state.overlay.file);
    const up = await apiPost('/api/stories/upload', fd);
    const caption = form.querySelector('input[name="caption"]')?.value || '';
    await apiPost('/api/stories', { image_url: up.url, caption });
    showToast('Story zveřejněna.');
    state.stories = null;
    closeOverlay();
    loadStoriesFeed();
  } catch (err) {
    showToast(err.message);
    state.overlay.uploading = false;
    renderApp();
  }
}
