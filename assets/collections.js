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
  } finally {
    state.loading.collections = false;
    if (state.tab === 'collections') renderApp();
  }
}

const PHASE_LABELS = {
  preparing: 'Příprava',
  running: 'Probíhá',
  completed: 'Splněno / Úspěch',
};

function renderActiveCollectionCard(project) {
  const percent = project.target_amount ? Math.min(100, Math.round((project.current_amount / project.target_amount) * 100)) : 0;
  const phaseClass = project.phase === 'completed' ? 'completed' : project.phase === 'running' ? 'running' : 'preparing';

  return `
    <article class="post-card" data-collection-id="${project.id}" style="border: 2px solid var(--c-primary); margin: 0 12px 20px;">
      <div class="phase-bar ${phaseClass}">${PHASE_LABELS[project.phase] || 'Aktuální'}</div>
      <header class="post-card-head">
        <img src="${project.org_logo || 'https://i.pravatar.cc/150?img=5'}" alt="" class="post-avatar" />
        <div class="post-head-text">
          <p class="post-author">${project.org_name || ''}</p>
          <p class="post-time">${timeAgo(project.activated_at)}</p>
        </div>
      </header>
      <button class="post-image-wrap" data-action="open-lightbox" data-img="${project.cover_image_url}" data-caption="${project.title}">
        <img src="${project.cover_image_url}" alt="${project.title}" class="post-image" />
      </button>
      <div class="post-progress" style="padding-top: 12px;">
        <div class="post-progress-row">
          <span>${fmt(project.current_amount)} Kč z ${fmt(project.target_amount)} Kč</span>
          <span>${percent}%</span>
        </div>
        <div class="post-progress-track"><div class="post-progress-fill" style="width:${percent}%"></div></div>
      </div>
      <div class="post-actions" style="padding: 10px 14px 0;">
        <button class="post-action" data-action="share-post" data-id="${project.id}" data-text="${(project.title || '').replace(/"/g, '&quot;')}">
          ${icon('share', { size: 21 })}
        </button>
      </div>
      <div class="post-body">
        <p class="post-caption"><strong>${project.title}</strong> — ${project.description || ''}</p>
        <button class="post-detail-btn" data-action="open-detail" data-id="${project.id}" data-source="active">
          Zobrazit detail sbírky ${icon('chevronRight', { size: 15 })}
        </button>
      </div>
    </article>
  `;
}

function renderQueueItem(project, rank) {
  return `
    <div class="queue-item">
      <span class="queue-rank">#${rank}</span>
      <img src="${project.cover_image_url}" alt="" class="queue-thumb" />
      <div class="queue-info" data-action="open-detail" data-id="${project.id}" data-source="waiting" style="cursor:pointer">
        <p class="queue-title">${project.title}</p>
        <p class="queue-org">${project.org_name || ''} · ${fmt(project.likes)} ${project.likes === 1 ? 'hlas' : 'hlasů'}</p>
      </div>
      <button class="queue-like-btn ${project.__liked ? 'is-liked' : ''}" data-action="like-collection" data-id="${project.id}">
        ${icon('heart', { size: 14, filled: !!project.__liked })}
        ${fmt(project.likes)}
      </button>
    </div>
  `;
}

function renderCollectionsPage() {
  const { active, waiting } = state.collections;

  if (state.loading.collections && !active && waiting.length === 0) {
    return `<div class="page-scroll">${renderHeader('Zbierky')}<p class="empty-state">Načítám sbírky…</p></div>`;
  }

  return `
    <div class="page-scroll">
      ${renderHeader('Zbierky')}
      ${active ? renderActiveCollectionCard(active) : '<p class="empty-state">Momentálně neběží žádná sbírka.</p>'}
      ${waiting.length > 0 ? `
        <p class="queue-section-title">Čekárna — hlasujte lajkem (${waiting.length}/10)</p>
        ${waiting.map((p, i) => renderQueueItem(p, i + 1)).join('')}
      ` : ''}
    </div>
  `;
}

function buildDetailSheetHtml(project) {
  const percent = project.target_amount ? Math.min(100, Math.round((project.current_amount / project.target_amount) * 100)) : 0;
  return `
    <button class="detail-sheet-close" data-action="close-detail" aria-label="Zavřít detail">${icon('close', { size: 18 })}</button>
    <img src="${project.cover_image_url}" alt="${project.title}" class="detail-sheet-image" />
    <div class="detail-sheet-body">
      <p class="detail-title">${project.title}</p>
      <p class="detail-meta">${project.org_name || ''} ${project.phase ? `· ${PHASE_LABELS[project.phase] || ''}` : ''}</p>
      <div class="detail-progress-row">
        <span class="detail-progress-amount">${fmt(project.current_amount)} Kč</span>
        <span class="detail-progress-percent">${percent}% z ${fmt(project.target_amount)} Kč</span>
      </div>
      <div class="detail-progress-track"><div class="detail-progress-fill" style="width:${percent}%"></div></div>
      <p class="detail-description">${project.description || ''}</p>
    </div>
  `;
}

function renderDetailModal() {
  return `<div class="detail-modal" id="detail-modal"><div class="detail-sheet" id="detail-sheet"></div></div>`;
}

function renderLightbox() {
  return `
    <div class="lightbox" id="lightbox">
      <button class="lightbox-close" data-action="close-lightbox" aria-label="Zavřít náhled">${icon('close', { size: 22 })}</button>
      <div class="lightbox-body">
        <img src="" alt="" class="lightbox-img" id="lightbox-img" />
        <p class="lightbox-caption" id="lightbox-caption"></p>
      </div>
    </div>
  `;
}

async function likeCollection(projectId, btnEl) {
  if (!isLoggedIn()) {
    showToast('Pro hlasování se musíš přihlásit.');
    switchTab('account');
    return;
  }
  const project = state.collections.waiting.find((p) => p.id === projectId);
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
    showToast(err.message);
  }
}
