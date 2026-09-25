// ============================================================
// HASHTAGS — i18n verzia
// ============================================================

const HASHTAG_RE = /#([a-zA-Z0-9_áäčďéěíľĺňóôŕřšťúůýžÁÄČĎÉĚÍĽĹŇÓÔŔŘŠŤÚŮÝŽ]{2,40})/g;

function linkifyHashtags(text) {
  if (!text) return '';
  return escapeHtml(text).replace(HASHTAG_RE, (m, tag) => {
    return `<a class="hashtag-link" data-action="open-hashtag" data-tag="${escapeAttr(tag.toLowerCase())}">#${escapeHtml(tag)}</a>`;
  });
}

async function loadTrendingHashtags() {
  if (state._trendingHashtags) return state._trendingHashtags;
  try {
    const data = await apiGet('/api/hashtags/trending?limit=12');
    state._trendingHashtags = data.hashtags || [];
  } catch { state._trendingHashtags = []; }
  return state._trendingHashtags;
}

function renderTrendingHashtagsInline() {
  const items = state._trendingHashtags;
  if (!items || items.length === 0) return '';
  return `
    <div class="trending-hashtags">
      <div class="trending-hashtags-title">${icon('hash', { size: 14 })} ${escapeHtml(t('hashtags.trending'))}</div>
      <div class="trending-hashtags-list">
        ${items.map((h) => `
          <button class="hashtag-chip" data-action="open-hashtag" data-tag="${escapeAttr(h.hashtag)}">
            #${escapeHtml(h.hashtag)}
            <span class="hashtag-chip-count">${h.count}</span>
          </button>
        `).join('')}
      </div>
    </div>`;
}

async function openHashtag(tag) {
  tag = String(tag || '').toLowerCase().replace(/^#/, '');
  if (!tag) return;
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'hashtag', tag };
  state._hashtagPosts = null;
  pushHistoryState('overlay');
  renderApp();

  try {
    const data = await apiGet(`/api/hashtags/${encodeURIComponent(tag)}/posts`);
    state._hashtagPosts = data.posts || [];
  } catch (err) {
    state._hashtagPosts = [];
    showToast(t('errors.loadFailed'));
  }
  renderApp();
}

function renderHashtagOverlay() {
  const tag = state.overlay.tag;
  const posts = state._hashtagPosts;

  let content = '';
  if (posts === null) content = `<p class="empty-state">${escapeHtml(t('common.loading'))}</p>`;
  else if (posts.length === 0) content = `<p class="empty-state">${escapeHtml(t('hashtags.noPosts'))} #${escapeHtml(tag)}.</p>`;
  else {
    content = `<div class="post-feed-grid">
      ${posts.map((p) => renderSocialPostCard(p, p.__feedKey || (p.target_feed === 'gastro' ? 'gastro' : p.target_feed === 'accommodation' ? 'accommodation' : 'organization'))).join('')}
    </div>`;
  }

  return `
    <div class="page-scroll">
      ${renderBackHeader(`#${escapeHtml(tag)}`)}
      ${content}
    </div>`;
}
