// ============================================================
// WISHLIST — i18n verzia
// ============================================================

async function loadWishlist() {
  if (!isLoggedIn()) { state._wishlist = []; return; }
  try {
    const data = await apiGet('/api/wishlist/me');
    state._wishlist = data.wishlist || [];
  } catch { state._wishlist = []; }
  if (state.overlay?.type === 'wishlist') renderApp();
}

async function toggleWishlist(kind, id, btnEl) {
  if (!isLoggedIn()) { showToast(t('wishlist.loginRequired')); switchTab('account'); return; }
  try {
    const res = await apiPost('/api/wishlist', { business_id: id, business_kind: kind });
    if (btnEl) {
      btnEl.classList.toggle('is-in-wishlist', res.in_wishlist);
      const label = btnEl.querySelector('[data-wishlist-label]');
      if (label) label.textContent = res.in_wishlist ? t('profile.inWishlist') : t('profile.addToWishlist');
    }
    showToast(res.in_wishlist ? t('toasts.addedToWishlist') : t('toasts.removedFromWishlist'));
    state._wishlist = null;
  } catch (err) { showToast(err.message); }
}

function renderWishlistOverlay() {
  const list = state._wishlist;
  // Rozdělení podle typu (stejně jako v uložených místech na mapě): Gastro, Ubytování, Organizace
  const GROUPS = [
    ['restaurants', t('search.typeGastro')],
    ['accommodation', t('search.typeAcc')],
    ['organizations', t('search.typeOrg')],
  ];
  const grouped = {};
  if (list) for (const w of list) (grouped[w.business_kind] = grouped[w.business_kind] || []).push(w);

  return `
    <div class="page-scroll">
      ${renderBackHeader(t('wishlist.title'))}
      <div class="profile-section">
        ${list == null ? `<p class="empty-state">${escapeHtml(t('common.loading'))}</p>`
          : list.length === 0 ? `<p class="empty-state">${escapeHtml(t('wishlist.empty'))}</p>`
          : `
            <button class="settings-row" data-action="wishlist-open-map" style="margin-bottom:6px">
              ${icon('mapPin', { size: 17 })} ${escapeHtml(t('wishlist.showOnMap'))} ${icon('chevronRight', { size: 16, className: 'settings-chevron' })}
            </button>
            ${GROUPS.filter(([k]) => grouped[k]).map(([k, label]) => `
            <h3 class="profile-section-title" style="margin-top:20px">${escapeHtml(label)}</h3>
            ${grouped[k].map((w) => `
              <button class="user-list-item" data-action="open-profile" data-kind="${escapeAttr(w.business_kind)}" data-id="${escapeAttr(w.business_id)}">
                ${w.business_image ? `<img src="${escapeAttr(w.business_image)}" class="user-list-avatar" style="border-radius:12px" alt="" />`
                  : `<span class="user-list-avatar user-list-avatar-init">${escapeHtml((w.business_name || '?').charAt(0).toUpperCase())}</span>`}
                <div style="flex:1;min-width:0">
                  <p class="user-list-name">${escapeHtml(w.business_name || '')}</p>
                  <p class="user-list-meta">${escapeHtml([w.city, w.region].filter(Boolean).join(' · '))}</p>
                </div>
                ${icon('chevronRight', { size: 16 })}
              </button>`).join('')}
          `).join('')}`}
      </div>
    </div>`;
}

// Otevře záložku Mapa přímo na panelu „Moje seznamy míst“ (kde je „Chci navštívit“ také)
function wishlistOpenMap() {
  window._vmapOpenSavedOnShow = true;
  state.overlay = null; state.overlayStack = [];
  switchTab('map');
}
