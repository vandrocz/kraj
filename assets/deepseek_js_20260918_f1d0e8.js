// ============================================================
// PROFILOVÉ STRÁNKY (user / organizace / ubytování / gastro)
// ============================================================

async function loadProfile(kind, id) {
  const cacheKey = `${kind}:${id}`;
  try {
    const data = await apiGet(`/api/profile/${kind}/${id}`);
    state.profiles[cacheKey] = data;
    if (isLoggedIn() && kind !== 'user') {
      try {
        const fs = await apiGet(`/api/profile/follow/status?type=${kind}&id=${encodeURIComponent(id)}`);
        data.is_following = fs.following;
        if (fs.followers != null) data.stats = { ...(data.stats || {}), followers: fs.followers };
      } catch {}
    } else if (isLoggedIn() && kind === 'user') {
      try {
        const fs = await apiGet(`/api/profile/follow/status?type=users&id=${encodeURIComponent(id)}`);
        data.is_following = fs.following;
        if (fs.followers != null) data.stats = { ...(data.stats || {}), followers: fs.followers };
      } catch {}
    }
    if (state.overlay?.type === 'profile' && state.overlay.kind === kind && state.overlay.id === id) renderApp();
  } catch (err) {
    state.profiles[cacheKey] = { __error: err.message };
    if (state.overlay?.type === 'profile' && state.overlay.kind === kind && state.overlay.id === id) renderApp();
  }
}

function renderProfileOverlay() {
  const { kind, id } = state.overlay;
  const data = state.profiles[`${kind}:${id}`];
  if (!data) {
    loadProfile(kind, id);
    return `<div class="page-scroll">${renderBackHeader('Profil')}<p class="empty-state">Načítám profil…</p></div>`;
  }
  if (data.__error) {
    return `<div class="page-scroll">${renderBackHeader('Profil')}<p class="empty-state">${data.__error}</p></div>`;
  }
  if (data.type === 'user') return renderUserProfile(data, id);
  return renderBusinessProfile(data, id, kind);
}

function renderUserProfile(data, id) {
  const p = data.profile;
  const isOwn = isLoggedIn() && state.user.id === id;
  const initial = (p.display_name || '?').charAt(0).toUpperCase();
  const roleLabel = { user: 'Turista', organization: 'Organizace', hotelier: 'Ubytování / Gastro', admin: 'Administrátor' }[p.role] || p.role;

  const businessesHtml = (data.businesses || []).map((b) => `
    <button class="profile-biz-chip" data-action="open-profile" data-kind="${b.kind}" data-id="${b.id}">
      <span>${b.name}${b.is_verified ? ' ✓' : ''}</span>
      <small>${b.city ? `${b.city}, ` : ''}${b.district}</small>
    </button>
  `).join('');

  return `
    <div class="page-scroll">
      ${renderBackHeader(p.display_name, isOwn
        ? `<button class="header-icon-btn" data-action="open-settings" aria-label="Nastavení">${icon('settings', { size: 19 })}</button>`
        : (isLoggedIn() ? `<button class="header-icon-btn" data-action="toggle-follow" data-kind="user" data-id="${id}" data-following="${data.is_following ? '1' : '0'}">${icon('plus', { size: 20 })}</button>` : ''))}

      <div class="profile-hero">
        <div class="profile-avatar-wrap">
          ${p.avatar_url
            ? `<img src="${p.avatar_url}" alt="" class="profile-avatar-img" />`
            : `<div class="profile-avatar-initial">${initial}</div>`}
          ${isOwn ? `<button class="profile-avatar-edit" data-action="upload-avatar" data-target="user" data-field="avatar" aria-label="Změnit foto">${icon('camera', { size: 14 })}</button>` : ''}
        </div>
        <p class="profile-name">${p.display_name}</p>
        <span class="account-role-chip">${roleLabel}</span>
        ${p.bio ? `<p class="profile-bio">${escapeHtml(p.bio)}</p>` : (isOwn ? '<p class="profile-bio" style="color:var(--c-text-muted)">Zatím žádné bio — klikni na Upravit profil.</p>' : '')}

        <div class="profile-meta">
          ${p.location ? `<span>${icon('location', { size: 14 })} ${escapeHtml(p.location)}</span>` : ''}
          ${p.website ? `<a href="${escapeAttr(p.website)}" target="_blank" rel="noopener">${icon('globe', { size: 14 })} ${escapeHtml(p.website)}</a>` : ''}
          ${p.phone ? `<a href="tel:${escapeAttr(p.phone)}">${icon('phone', { size: 14 })} ${escapeHtml(p.phone)}</a>` : ''}
        </div>

        <div class="profile-stats-row">
          <div class="profile-stat"><strong>${data.stats?.contributions ?? 0}</strong><span>příspěvků</span></div>
          ${data.stats?.followers != null ? `<div class="profile-stat"><strong>${fmt(data.stats.followers)}</strong><span>sledujících</span></div>` : ''}
        </div>

        ${isOwn ? `
          <div class="profile-actions">
            <button class="profile-action-btn" data-action="edit-profile" data-kind="user" data-id="${id}">${icon('edit', { size: 15 })} Upravit profil</button>
            <button class="profile-action-btn" data-action="open-settings">${icon('settings', { size: 15 })} Nastavení</button>
          </div>
        ` : ''}
      </div>

      ${businessesHtml ? `
        <div class="profile-section">
          <h3 class="profile-section-title">Podniky</h3>
          <div class="profile-biz-list">${businessesHtml}</div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderBusinessProfile(data, id, kind) {
  const b = data.profile;
  const isOwn = isLoggedIn() && state.businesses.some((x) => x.id === id);
  const logo = b.logo_url || b.image_url;
  const initial = (b.name || '?').charAt(0).toUpperCase();
  const cover = b.cover_url;
  const kindLabel = { organizations: 'Organizace', accommodation: 'Ubytování', restaurants: 'Gastro' }[kind] || '';

  const postsGrid = (data.posts || []).map((post) => {
    const cover = (post.media && post.media[0]) || post.image_url;
    const many = post.media && post.media.length > 1;
    return `
      <button class="profile-grid-item" data-action="open-post" data-post-id="${post.id}" data-kind="${kind}" data-id="${id}">
        <img src="${cover}" alt="" loading="lazy" />
        ${many ? `<span class="profile-grid-count">${icon('grid', { size: 12 })}${post.media.length}</span>` : ''}
      </button>
    `;
  }).join('');

  return `
    <div class="page-scroll profile-biz-page">
      <div class="profile-cover" ${cover ? `style="background-image:url('${cover}')"` : ''}>
        <button class="header-icon-btn profile-cover-back" data-action="close-overlay">${icon('arrowLeft', { size: 20 })}</button>
        ${isOwn ? `<button class="header-icon-btn profile-cover-edit" data-action="upload-avatar" data-target="${kind}" data-target-id="${id}" data-field="cover" aria-label="Změnit úvodní foto">${icon('camera', { size: 16 })}</button>` : ''}
      </div>

      <div class="profile-biz-head">
        <div class="profile-biz-avatar-wrap">
          ${logo
            ? `<img src="${logo}" alt="" class="profile-biz-avatar" />`
            : `<div class="profile-biz-avatar profile-biz-avatar-initial">${initial}</div>`}
          ${isOwn ? `<button class="profile-avatar-edit" data-action="upload-avatar" data-target="${kind}" data-target-id="${id}" data-field="avatar" aria-label="Změnit logo">${icon('camera', { size: 13 })}</button>` : ''}
        </div>
        <div class="profile-biz-info">
          <p class="profile-name">
            ${b.name}
            ${b.is_verified ? icon('check', { size: 14, className: 'verified-badge-inline' }) : ''}
          </p>
          <p class="profile-biz-type">${kindLabel} · ${escapeHtml(b.type || '')}</p>
          <p class="profile-biz-loc">${[b.city, b.district, b.region].filter(Boolean).map(escapeHtml).join(' · ')}</p>
        </div>
      </div>

      <div class="profile-biz-actions">
        ${isOwn
          ? `<button class="profile-action-btn" data-action="edit-profile" data-kind="${kind}" data-id="${id}">${icon('edit', { size: 15 })} Upravit</button>`
          : (isLoggedIn()
            ? `<button class="profile-action-btn ${data.is_following ? 'is-following' : ''}" data-action="toggle-follow" data-kind="${kind}" data-id="${id}" data-following="${data.is_following ? '1' : '0'}">
                 ${data.is_following ? icon('check', { size: 15 }) + ' Sleduji' : icon('plus', { size: 15 }) + ' Sledovat'}
               </button>`
            : '')}
        ${b.website ? `<a class="profile-action-btn" href="${escapeAttr(b.website)}" target="_blank" rel="noopener">${icon('globe', { size: 15 })} Web</a>` : ''}
        ${b.phone ? `<a class="profile-action-btn" href="tel:${escapeAttr(b.phone)}">${icon('phone', { size: 15 })} Zavolat</a>` : ''}
      </div>

      <div class="profile-stats-row">
        <div class="profile-stat"><strong>${data.stats?.posts ?? 0}</strong><span>příspěvků</span></div>
        <div class="profile-stat"><strong>${fmt(data.stats?.followers || 0)}</strong><span>sledujících</span></div>
      </div>

      ${b.description ? `<div class="profile-section"><p class="profile-biz-desc">${escapeHtml(b.description)}</p></div>` : ''}

      <div class="profile-section">
        <h3 class="profile-section-title">Příspěvky</h3>
        ${postsGrid ? `<div class="profile-grid">${postsGrid}</div>` : '<p class="empty-state">Zatím žádné příspěvky.</p>'}
      </div>
    </div>
  `;
}

// ---------------- Edit profile (modal cez overlay) ----------------

function renderEditProfileForm() {
  const kind = state.overlay.editKind; // 'user' | 'organizations' | 'accommodation' | 'restaurants'
  const id = state.overlay.editId;
  const cacheKey = `${kind === 'user' ? 'user' : kind}:${id}`;
  const data = state.profiles[cacheKey];
  const p = data?.profile || (kind === 'user' ? state.user : null);
  if (!p) return '<p class="empty-state">Data se nenačetla.</p>';

  if (kind === 'user') {
    return `
      <form data-action="submit-edit-profile" data-kind="user" data-id="${id}" class="edit-profile-form">
        <div class="form-field">
          <label class="form-label">Jméno</label>
          <input class="form-input" name="display_name" value="${escapeAttr(p.display_name || '')}" />
        </div>
        <div class="form-field">
          <label class="form-label">Bio</label>
          <textarea class="form-textarea" name="bio" maxlength="280" placeholder="Něco o sobě…">${escapeHtml(p.bio || '')}</textarea>
        </div>
        <div class="form-field">
          <label class="form-label">Lokace</label>
          <input class="form-input" name="location" value="${escapeAttr(p.location || '')}" placeholder="Praha, Česko" />
        </div>
        <div class="form-field">
          <label class="form-label">Web</label>
          <input class="form-input" name="website" value="${escapeAttr(p.website || '')}" placeholder="https://" />
        </div>
        <div class="form-field">
          <label class="form-label">Telefon</label>
          <input class="form-input" name="phone" value="${escapeAttr(p.phone || '')}" />
        </div>
        <button class="form-submit-btn" type="submit">Uložit</button>
      </form>
    `;
  }

  // Business edit
  const isGastro = kind === 'restaurants';
  const isAcc = kind === 'accommodation';
  return `
    <form data-action="submit-edit-profile" data-kind="${kind}" data-id="${id}" class="edit-profile-form">
      <div class="form-field">
        <label class="form-label">Název</label>
        <input class="form-input" name="name" value="${escapeAttr(p.name || '')}" required />
      </div>
      <div class="form-field">
        <label class="form-label">Popis</label>
        <textarea class="form-textarea" name="description" maxlength="500">${escapeHtml(p.description || '')}</textarea>
      </div>
      ${renderEditRegionDistrictCity(p)}
      ${isGastro ? `
        <div class="form-field">
          <label class="form-label">Kuchyně</label>
          <select class="form-select" name="cuisine_type">
            ${TYPES.cuisine.map((t) => `<option value="${t.value}" ${p.cuisine_type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
        </div>` : ''}
      ${isAcc ? `
        <div class="form-field">
          <label class="form-label">Kapacita</label>
          <input class="form-input" type="number" name="capacity" min="1" value="${p.capacity || ''}" />
        </div>` : ''}
      <div class="form-field">
        <label class="form-label">Web</label>
        <input class="form-input" name="website" value="${escapeAttr(p.website || '')}" placeholder="https://" />
      </div>
      <div class="form-field">
        <label class="form-label">Telefon</label>
        <input class="form-input" name="phone" value="${escapeAttr(p.phone || '')}" />
      </div>
      <button class="form-submit-btn" type="submit">Uložit</button>
    </form>
  `;
}

function renderEditRegionDistrictCity(p) {
  return `
    <div class="form-field">
      <label class="form-label">Kraj</label>
      <select class="form-select" name="region" data-action="edit-region-change" required>
        ${Object.keys(REGIONS).map((r) => `<option value="${r}" ${p.region === r ? 'selected' : ''}>${r}</option>`).join('')}
      </select>
    </div>
    <div class="form-field">
      <label class="form-label">Okres</label>
      <select class="form-select" name="district" required>
        ${(REGIONS[p.region] || []).map((d) => `<option value="${d}" ${p.district === d ? 'selected' : ''}>${d}</option>`).join('')}
      </select>
    </div>
    <div class="form-field">
      <label class="form-label">Obec</label>
      <input class="form-input" name="city" value="${escapeAttr(p.city || '')}" placeholder="např. Křivoklát" required />
    </div>
  `;
}

async function handleEditProfileSubmit(form) {
  const kind = form.dataset.kind;
  const id = form.dataset.id;
  const fd = new FormData(form);
  const body = Object.fromEntries(fd.entries());

  const btn = form.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Ukládám…'; }

  try {
    if (kind === 'user') {
      const res = await apiPatch('/api/profile/me/user', body);
      state.user = { ...state.user, ...res.user };
      setStoredUser(state.user);
    } else {
      await apiPatch(`/api/profile/me/${kind}/${id}`, body);
    }
    // invalidate cache
    const cacheKey = kind === 'user' ? `user:${id}` : `${kind}:${id}`;
    delete state.profiles[cacheKey];
    state.overlay = { type: 'profile', kind: kind === 'user' ? 'user' : kind, id };
    showToast('Uloženo.');
    loadProfile(state.overlay.kind, state.overlay.id);
    renderApp();
  } catch (err) {
    showToast(err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Uložit'; }
  }
}

// ---------------- Follow ----------------

async function toggleFollow(kind, id) {
  if (!isLoggedIn()) {
    showToast('Pro sledování se musíš přihlásit.');
    switchTab('account');
    return;
  }
  const apiType = kind === 'user' ? 'users' : kind;
  try {
    const res = await apiPost('/api/profile/follow', { type: apiType, id });
    const cacheKey = `${kind === 'user' ? 'user' : kind}:${id}`;
    const d = state.profiles[cacheKey];
    if (d) {
      d.is_following = res.following;
      d.stats = { ...(d.stats || {}), followers: res.followers };
    }
    showToast(res.following ? 'Sleduješ.' : 'Přestal jsi sledovat.');
    renderApp();
  } catch (err) {
    showToast(err.message);
  }
}

// ---------------- Upload avatar/cover ----------------

async function uploadProfileImage(targetType, targetId, field) {
  if (!isLoggedIn()) { showToast('Musíš být přihlášen.'); return; }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file, { maxDim: 1000, quality: 0.85 });
    const fd = new FormData();
    fd.append('file', compressed);
    fd.append('target', targetType);
    if (targetId) fd.append('target_id', targetId);
    fd.append('field', field);
    try {
      const res = await apiPost('/api/profile/me/upload', fd);
      // refresh
      if (targetType === 'user') {
        state.user = { ...state.user, [field === 'cover' ? 'cover_url' : 'avatar_url']: res.url };
        setStoredUser(state.user);
        const ck = `user:${state.user.id}`;
        delete state.profiles[ck];
      } else {
        const ck = `${targetType}:${targetId}`;
        delete state.profiles[ck];
      }
      showToast('Fotka nahrána.');
      if (state.overlay?.type === 'profile') {
        loadProfile(state.overlay.kind, state.overlay.id);
      }
      renderApp();
    } catch (err) {
      showToast(err.message);
    }
  };
  input.click();
}

// ---------------- Settings ----------------

async function loadSettings() {
  if (!isLoggedIn()) return;
  try {
    const res = await apiGet('/api/profile/me/settings');
    state._settings = res.settings;
    if (state.overlay?.type === 'settings') renderApp();
  } catch {}
}

function renderSettingsOverlay() {
  if (!state._settings) { loadSettings(); }
  const s = state._settings || { push_notifications: true, email_notifications: true, public_profile: true, show_contributions: true };
  return `
    <div class="page-scroll">
      ${renderBackHeader('Nastavení')}
      <div class="profile-section">
        <h3 class="profile-section-title">Notifikace</h3>
        <label class="settings-toggle">
          <span>Push notifikace</span>
          <input type="checkbox" data-action="setting-toggle" data-key="push_notifications" ${s.push_notifications ? 'checked' : ''} />
        </label>
        <label class="settings-toggle">
          <span>E-mailové notifikace</span>
          <input type="checkbox" data-action="setting-toggle" data-key="email_notifications" ${s.email_notifications ? 'checked' : ''} />
        </label>
      </div>
      <div class="profile-section">
        <h3 class="profile-section-title">Soukromí</h3>
        <label class="settings-toggle">
          <span>Veřejný profil</span>
          <input type="checkbox" data-action="setting-toggle" data-key="public_profile" ${s.public_profile ? 'checked' : ''} />
        </label>
        <label class="settings-toggle">
          <span>Zobrazovat moje příspěvky veřejně</span>
          <input type="checkbox" data-action="setting-toggle" data-key="show_contributions" ${s.show_contributions ? 'checked' : ''} />
        </label>
      </div>
      <div class="profile-section">
        <h3 class="profile-section-title">Účet</h3>
        <button class="settings-row" data-action="edit-profile" data-kind="user" data-id="${state.user.id}">
          ${icon('edit', { size: 17 })} Upravit profil ${icon('chevronRight', { size: 16, className: 'settings-chevron' })}
        </button>
        <a class="settings-row" href="/obchodni-podminky" target="_blank" rel="noopener">
          ${icon('help', { size: 17 })} Obchodní podmínky ${icon('chevronRight', { size: 16, className: 'settings-chevron' })}
        </a>
        <a class="settings-row" href="/ochrana-osobnich-udaju" target="_blank" rel="noopener">
          ${icon('help', { size: 17 })} Ochrana osobních údajů ${icon('chevronRight', { size: 16, className: 'settings-chevron' })}
        </a>
        <button class="settings-row" data-action="logout" style="color:#B3273C">
          ${icon('logout', { size: 17 })} Odhlásit se
        </button>
      </div>
    </div>
  `;
}

async function toggleSetting(key, value) {
  state._settings = { ...(state._settings || {}), [key]: value };
  try {
    await apiPatch('/api/profile/me/settings', { [key]: value });
  } catch (err) {
    showToast(err.message);
  }
}

// ---------------- Helpers ----------------

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s); }