// ============================================================
// SEKCE 1: ZBIERKOVÝ FEED
// ============================================================

async function loadCollections() {
  state.loading.collections = true;
  try {
    const data = await apiGet('/api/feed/collections');
    state.collections = data;
  } catch (err) {
    console.error('Nepodarilo sa načítať zbierky:', err.message);
    showToast('Zbierky se nepodařilo načíst.');
    state.collections = { active: null, waiting: [] };
  } finally {
    state.loading.collections = false;
    if (state.tab === 'collections') renderApp();
  }
}

const PHASE_LABELS = {
  preparing: 'Příprava',
  running: 'Probíhá',
  completed: 'Splněno / Úspěch',
  waiting: 'V čekárně',
};

function renderActiveCollectionCard(project) {
  const percent = project.target_amount
    ? Math.min(100, Math.round((project.current_amount / project.target_amount) * 100))
    : 0;
  const phaseClass = project.phase === 'completed' ? 'completed' : project.phase === 'running' ? 'running' : 'preparing';

  return `
    <article class="post-card" data-collection-id="${project.id}" style="border: 2px solid var(--c-primary); margin: 0 12px 20px;">
      <div class="phase-bar ${phaseClass}">${PHASE_LABELS[project.phase] || 'Aktuální'}</div>
      <header class="post-card-head">
        <img src="${escapeAttr(project.org_logo || 'https://i.pravatar.cc/150?img=5')}" alt="" class="post-avatar" />
        <div class="post-head-text">
          <p class="post-author">${escapeHtml(project.org_name || '')}</p>
          <p class="post-time">${timeAgo(project.activated_at)}</p>
        </div>
      </header>
      ${project.cover_image_url ? `
        <button class="post-image-wrap" data-action="open-lightbox" data-img="${escapeAttr(project.cover_image_url)}" data-caption="${escapeAttr(project.title)}">
          <img src="${escapeAttr(project.cover_image_url)}" alt="${escapeAttr(project.title)}" class="post-image" />
        </button>` : ''}
      <div class="post-progress" style="padding-top: 12px;">
        <div class="post-progress-row">
          <span>${fmt(project.current_amount)} Kč z ${fmt(project.target_amount)} Kč</span>
          <span>${percent}%</span>
        </div>
        <div class="post-progress-track"><div class="post-progress-fill" style="width:${percent}%"></div></div>
      </div>
      <div class="post-actions" style="padding: 10px 14px 0;">
        <button class="post-action" data-action="share-post" data-id="${project.id}" data-text="${escapeAttr(project.title || '')}">
          ${icon('share', { size: 21 })}
        </button>
      </div>
      <div class="post-body">
        <p class="post-caption"><strong>${escapeHtml(project.title)}</strong> — ${escapeHtml(project.description || '')}</p>
      </div>
    </article>
  `;
}

function renderQueueItem(project, rank) {
  return `
    <div class="queue-item">
      <span class="queue-rank">#${rank}</span>
      <img src="${escapeAttr(project.cover_image_url || '')}" alt="" class="queue-thumb" />
      <div class="queue-info">
        <p class="queue-title">${escapeHtml(project.title)}</p>
        <p class="queue-org">${escapeHtml(project.org_name || '')} · ${fmt(project.likes)} ${project.likes === 1 ? 'hlas' : 'hlasů'}</p>
      </div>
      <button class="queue-like-btn ${project.__liked ? 'is-liked' : ''}" data-action="like-collection" data-id="${project.id}">
        ${icon('heart', { size: 14, filled: !!project.__liked })}
        ${fmt(project.likes)}
      </button>
    </div>
  `;
}

function renderCollectionsPage() {
  const { active, waiting } = state.collections || { active: null, waiting: [] };

  if (state.loading.collections && !active && (waiting?.length || 0) === 0) {
    return `<div class="page-scroll">${renderHeader('Zbierky')}<p class="empty-state">Načítám sbírky…</p></div>`;
  }

  return `
    <div class="page-scroll">
      ${renderHeader('Zbierky')}
      ${active ? renderActiveCollectionCard(active) : '<p class="empty-state">Momentálně neběží žádná sbírka.</p>'}
      ${(waiting && waiting.length > 0) ? `
        <p class="queue-section-title">Čekárna — hlasujte lajkem (${waiting.length}/10)</p>
        ${waiting.map((p, i) => renderQueueItem(p, i + 1)).join('')}
      ` : ''}
    </div>
  `;
}

async function likeCollection(projectId, btnEl) {
  if (!isLoggedIn()) {
    showToast('Pro hlasování se musíš přihlásit.');
    switchTab('account');
    return;
  }
  const project = (state.collections?.waiting || []).find((p) => p.id === projectId);
  if (!project || project.__liked) return;

  // Optimistická aktualizácia
  project.__liked = true;
  project.likes += 1;
  if (btnEl) {
    btnEl.classList.add('is-liked');
    btnEl.innerHTML = `${icon('heart', { size: 14, filled: true })}${fmt(project.likes)}`;
  }

  try {
    await apiPost(`/api/feed/collections/${projectId}/like`, {});
  } catch (err) {
    // Rollback
    project.__liked = false;
    project.likes -= 1;
    if (btnEl) {
      btnEl.classList.remove('is-liked');
      btnEl.innerHTML = `${icon('heart', { size: 14 })}${fmt(project.likes)}`;
    }
    showToast(err.message);
  }
}
