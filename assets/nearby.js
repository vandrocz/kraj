// ============================================================
// NEARBY — i18n verzia
// ============================================================

async function loadNearby() {
  const nb = state.nearby;
  nb.loading = true;
  renderApp();
  try {
    if (!nb.coords) {
      nb.coords = await getCurrentLocation();
    }
    const url = `/api/nearby?lat=${nb.coords.lat}&lng=${nb.coords.lng}&radius=${nb.radius}&kind=${nb.kind}`;
    const data = await apiGet(url);
    nb.results = data.results || [];
  } catch (err) {
    showToast(err.message);
    nb.results = [];
  } finally {
    nb.loading = false;
    renderApp();
  }
}

function openNearby() {
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'nearby' };
  pushHistoryState('overlay');
  renderApp();
  if (!state.nearby.results) loadNearby();
}

function renderNearbyOverlay() {
  const nb = state.nearby;
  return `
    <div class="page-scroll">
      ${renderBackHeader(t('nearby.title'), `<button class="header-icon-btn" data-action="nearby-refresh" aria-label="${escapeAttr(t('nearby.refresh'))}">${icon('refresh', { size: 19 })}</button>`)}
      <div class="filter-bar">
        <div class="filter-row">
          <select class="filter-select ${nb.radius !== 25 ? 'is-active' : ''}" data-action="nearby-radius">
            <option value="5" ${nb.radius === 5 ? 'selected' : ''}>5 ${escapeHtml(t('nearby.km'))}</option>
            <option value="10" ${nb.radius === 10 ? 'selected' : ''}>10 ${escapeHtml(t('nearby.km'))}</option>
            <option value="25" ${nb.radius === 25 ? 'selected' : ''}>25 ${escapeHtml(t('nearby.km'))}</option>
            <option value="50" ${nb.radius === 50 ? 'selected' : ''}>50 ${escapeHtml(t('nearby.km'))}</option>
            <option value="100" ${nb.radius === 100 ? 'selected' : ''}>100 ${escapeHtml(t('nearby.km'))}</option>
          </select>
          <select class="filter-select ${nb.kind !== 'all' ? 'is-active' : ''}" data-action="nearby-kind">
            <option value="all" ${nb.kind === 'all' ? 'selected' : ''}>${escapeHtml(t('nearby.kindAll'))}</option>
            <option value="organizations" ${nb.kind === 'organizations' ? 'selected' : ''}>${escapeHtml(t('nearby.kindOrg'))}</option>
            <option value="accommodation" ${nb.kind === 'accommodation' ? 'selected' : ''}>${escapeHtml(t('nearby.kindAcc'))}</option>
            <option value="restaurants" ${nb.kind === 'restaurants' ? 'selected' : ''}>${escapeHtml(t('nearby.kindGastro'))}</option>
          </select>
        </div>
      </div>
      <div class="profile-section">
        ${nb.loading ? `<p class="empty-state">${escapeHtml(t('nearby.locating'))}</p>`
          : nb.results == null ? `<p class="empty-state">${escapeHtml(t('common.loading'))}</p>`
          : nb.results.length === 0 ? `<p class="empty-state">${escapeHtml(t('nearby.noResults'))}</p>`
          : nb.results.map((r) => `
            <button class="user-list-item" data-action="open-profile" data-kind="${r.kind}" data-id="${r.id}">
              ${r.logo ? `<img src="${r.logo}" class="user-list-avatar" style="border-radius:12px" alt="" />`
                : `<span class="user-list-avatar user-list-avatar-init">${(r.name || '?').charAt(0).toUpperCase()}</span>`}
              <div style="flex:1;min-width:0">
                <p class="user-list-name">${escapeHtml(r.name || '')} ${r.is_verified ? '✓' : ''}</p>
                <p class="user-list-meta">${r.geo_place ? `${escapeHtml(r.geo_place)} · ` : ''}${r.distance_km} ${escapeHtml(t('nearby.km'))}</p>
              </div>
              ${icon('chevronRight', { size: 16 })}
            </button>`).join('')}
      </div>
    </div>`;
}
