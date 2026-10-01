// ============================================================
// BANNERY — zobrazenie + dismiss
// ============================================================

let _bannerDismissed = new Set();
try {
  const raw = localStorage.getItem('vandro_dismissed_banners');
  if (raw) _bannerDismissed = new Set(JSON.parse(raw));
} catch {}

function _persistDismissedBanners() {
  try {
    localStorage.setItem('vandro_dismissed_banners', JSON.stringify([..._bannerDismissed]));
  } catch {}
}

async function loadBanners() {
  if (state._banners !== null) return;
  try {
    const data = await apiGet('/api/banners');
    state._banners = data.banners || [];
  } catch {
    state._banners = [];
  }
  const visible = (state._banners || []).filter((b) => !_bannerDismissed.has(b.id));
  if (visible.length > 0) scheduleRender();
}

function renderBannerSlot() {
  const banners = state._banners || [];
  const visible = banners.filter((b) => !_bannerDismissed.has(b.id));
  if (visible.length === 0) return '';
  return `<div class="banner-stack">${visible.map(renderBanner).join('')}</div>`;
}

function renderBanner(b) {
  const bg = b.bg_color || '#2FBF71';
  const fg = b.text_color || '#FFFFFF';
  const hasImage = !!b.image_url;

  const inner = `
    <div class="banner-content">
      ${hasImage ? `<img class="banner-image" src="${escapeAttr(b.image_url)}" alt="" loading="lazy" />` : ''}
      <div class="banner-text">
        <p class="banner-title" style="color:${escapeAttr(fg)}">${escapeHtml(b.title)}</p>
        ${b.description ? `<p class="banner-desc" style="color:${escapeAttr(fg)}">${escapeHtml(b.description)}</p>` : ''}
        ${b.link_url ? `<span class="banner-cta" style="color:${escapeAttr(fg)};border-color:${escapeAttr(fg)}">${escapeHtml(b.link_text || 'Zistiť viac')} →</span>` : ''}
      </div>
    </div>`;

  const wrapper = b.link_url
    ? `<a class="banner" href="${escapeAttr(b.link_url)}" target="_blank" rel="noopener" style="background:${escapeAttr(bg)}">${inner}</a>`
    : `<div class="banner" style="background:${escapeAttr(bg)}">${inner}</div>`;

  return `
    <div class="banner-wrap" data-banner-id="${b.id}">
      ${wrapper}
      <button class="banner-dismiss" data-action="dismiss-banner" data-id="${b.id}" aria-label="${escapeAttr(t('common.close'))}">${icon('close', { size: 14 })}</button>
    </div>`;
}

function dismissBanner(id) {
  _bannerDismissed.add(id);
  _persistDismissedBanners();
  renderApp();
}

// ============================================================
// ADMIN — zoznam bannerov + modal
// ============================================================

async function loadAdminBanners() {
  try {
    const d = await apiGet('/api/admin/banners');
    state.adminBanners = d.banners || [];
  } catch {
    state.adminBanners = [];
  }
  if (state.tab === 'account' && state._adminTab === 'banners') renderApp();
}

function openBannerModal(bannerId) {
  const existing = bannerId ? (state.adminBanners || []).find((b) => b.id === bannerId) : null;
  const b = existing || {};

  openModal({
    title: existing ? 'Upraviť banner' : 'Nový banner',
    body: `
      <div class="form-field"><label class="form-label">Titulok *</label><input class="form-input" name="title" required maxlength="200" value="${escapeAttr(b.title || '')}" /></div>
      <div class="form-field"><label class="form-label">Popis</label><textarea class="form-textarea" name="description" maxlength="500" rows="2">${escapeHtml(b.description || '')}</textarea></div>
      <div class="form-field"><label class="form-label">Obrázok (URL, nepovinné)</label><input class="form-input" name="image_url" value="${escapeAttr(b.image_url || '')}" placeholder="https://…" /></div>
      <div class="form-field"><label class="form-label">Odkaz (URL, nepovinné)</label><input class="form-input" name="link_url" value="${escapeAttr(b.link_url || '')}" placeholder="https://…" /></div>
      <div class="form-field"><label class="form-label">Text odkazu</label><input class="form-input" name="link_text" maxlength="60" value="${escapeAttr(b.link_text || '')}" placeholder="Zistiť viac" /></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-field">
          <label class="form-label">Farba pozadia</label>
          <input type="color" name="bg_color" class="form-input" style="padding:4px;height:44px" value="${escapeAttr(b.bg_color || '#2FBF71')}" />
        </div>
        <div class="form-field">
          <label class="form-label">Farba textu</label>
          <input type="color" name="text_color" class="form-input" style="padding:4px;height:44px" value="${escapeAttr(b.text_color || '#FFFFFF')}" />
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-field"><label class="form-label">Platí od</label><input class="form-input" type="datetime-local" name="starts_at" value="${escapeAttr((b.starts_at || '').replace(' ', 'T').slice(0, 16))}" /></div>
        <div class="form-field"><label class="form-label">Platí do</label><input class="form-input" type="datetime-local" name="ends_at" value="${escapeAttr((b.ends_at || '').replace(' ', 'T').slice(0, 16))}" /></div>
      </div>
      <div class="form-field"><label class="form-label">Poradie</label><input class="form-input" type="number" name="sort_order" value="${parseInt(b.sort_order, 10) || 0}" /></div>
      <label style="display:flex;align-items:center;gap:10px;padding:10px 0;font-size:13.5px">
        <input type="checkbox" name="active" ${b.active !== 0 && b.active !== false ? 'checked' : ''} style="width:18px;height:18px" />
        Aktívny (zobrazovať na webe)
      </label>
    `,
    submitLabel: existing ? 'Uložiť' : 'Vytvoriť',
    onSubmit: async (data) => {
      state._modalLoading = true; renderApp();
      const payload = {
        title: data.title,
        description: data.description || null,
        image_url: data.image_url || null,
        link_url: data.link_url || null,
        link_text: data.link_text || null,
        bg_color: data.bg_color || '#2FBF71',
        text_color: data.text_color || '#FFFFFF',
        starts_at: data.starts_at ? data.starts_at.replace('T', ' ') + ':00' : null,
        ends_at: data.ends_at ? data.ends_at.replace('T', ' ') + ':00' : null,
        sort_order: parseInt(data.sort_order, 10) || 0,
        active: !!data.active,
      };
      try {
        if (existing) await apiPatch(`/api/admin/banners/${existing.id}`, payload);
        else await apiPost('/api/admin/banners', payload);
        state.adminBanners = null;
        state._banners = null; // vynúť reload aj pre verejné
        closeModal();
        showToast(t('toasts.saved'));
        loadAdminBanners();
        loadBanners();
      } catch (err) {
        showToast(err.message);
        state._modalLoading = false;
        renderApp();
      }
    },
  });
}

async function deleteBanner(id) {
  if (!confirm('Naozaj zmazať tento banner?')) return;
  try {
    await apiDelete(`/api/admin/banners/${id}`);
    state.adminBanners = null;
    state._banners = null;
    showToast(t('toasts.deleted'));
    loadAdminBanners();
    loadBanners();
  } catch (err) { showToast(err.message); }
}