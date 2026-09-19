// ============================================================
// WISHLIST (Chci navštívit)
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
  if (!isLoggedIn()) { showToast('Pro přidání do seznamu se musíš přihlásit.'); switchTab('account'); return; }
  try {
    const res = await apiPost('/api/wishlist', { business_id: id, business_kind: kind });
    if (btnEl) {
      btnEl.classList.toggle('is-in-wishlist', res.in_wishlist);
      const label = btnEl.querySelector('[data-wishlist-label]');
      if (label) label.textContent = res.in_wishlist ? 'V seznamu' : 'Chci navštívit';
    }
    showToast(res.in_wishlist ? 'Přidáno do seznamu.' : 'Odebráno ze seznamu.');
    state._wishlist = null;
  } catch (err) { showToast(err.message); }
}

function renderWishlistOverlay() {
  const list = state._wishlist;
  const grouped = {};
  if (list) {
    for (const w of list) {
      const region = w.region || 'Jinde';
      if (!grouped[region]) grouped[region] = [];
      grouped[region].push(w);
    }
  }

  return `
    <div class="page-scroll">
      ${renderBackHeader('Chci navštívit')}
      <div class="profile-section">
        ${list == null ? '<p class="empty-state">Načítám…</p>'
          : list.length === 0 ? '<p class="empty-state">Zatím nic v seznamu. Klikni na „Chci navštívit" na profilu podniku.</p>'
          : Object.entries(grouped).map(([region, items]) => `
            <h3 class="profile-section-title" style="margin-top:20px">${escapeHtml(region)}</h3>
            ${items.map((w) => `
              <button class="user-list-item" data-action="open-profile" data-kind="${w.business_kind}" data-id="${w.business_id}">
                ${w.business_image ? `<img src="${w.business_image}" class="user-list-avatar" style="border-radius:12px" alt="" />`
                  : `<span class="user-list-avatar user-list-avatar-init">${(w.business_name || '?').charAt(0).toUpperCase()}</span>`}
                <div style="flex:1;min-width:0">
                  <p class="user-list-name">${escapeHtml(w.business_name || '')}</p>
                  <p class="user-list-meta">${w.city ? `${escapeHtml(w.city)} · ` : ''}${w.business_kind === 'organizations' ? 'Organizace' : w.business_kind === 'accommodation' ? 'Ubytování' : 'Gastro'}</p>
                </div>
                ${icon('chevronRight', { size: 16 })}
              </button>`).join('')}
          `).join('')}
      </div>
    </div>`;
}
