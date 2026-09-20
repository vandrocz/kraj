// ============================================================
// PROFILOVÉ STRÁNKY (user / organizace / ubytování / gastro)
// ============================================================

async function loadProfile(kind, id) {
  const cacheKey = `${kind}:${id}`;
  try {
    const data = await apiGet(`/api/profile/${kind}/${id}`);
    state.profiles[cacheKey] = data;
    if (isLoggedIn()) {
      try {
        const apiType = kind === 'user' ? 'users' : kind;
        const fs = await apiGet(`/api/profile/follow/status?type=${apiType}&id=${encodeURIComponent(id)}`);
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
    return `<div class="page-scroll">${renderBackHeader('Profil')}<p class="empty-state">Načítám…</p></div>`;
  }
  if (data.__error) {
    return `<div class="page-scroll">${renderBackHeader('Profil')}<p class="empty-state">${data.__error}</p></div>`;
  }
  if (state.overlay.edit) {
    return `<div class="page-scroll">${renderBackHeader('Upravit profil')}${renderEditProfileForm()}</div>`;
  }
  if (data.type === 'user') return renderUserProfile(data, id);
  return renderBusinessProfile(data, id, kind);
}

// ============================================================
// USER PROFIL
// ============================================================

function renderUserProfile(data, id) {
  const p = data.profile;
  const isOwn = isLoggedIn() && state.user.id === id;
  const initial = (p.display_name || '?').charAt(0).toUpperCase();
  const roleLabel = { user: 'Turista', organization: 'Organizace', hotelier: 'Podnik', admin: 'Administrátor' }[p.role] || p.role;

  const businessesHtml = (data.businesses || []).map((b) => `
    <button class="profile-biz-chip" data-action="open-profile" data-kind="${b.kind}" data-id="${b.id}">
      <span>${escapeHtml(b.name)}${b.is_verified ? ' ✓' : ''}</span>
      <small>${b.city ? `${escapeHtml(b.city)}, ` : ''}${escapeHtml(b.district)}</small>
    </button>`).join('');

  return `
    <div class="page-scroll">
      ${renderBackHeader(p.display_name, isOwn
        ? `<button class="header-icon-btn" data-action="open-settings" aria-label="Nastavení">${icon('settings', { size: 19 })}</button>`
        : (isLoggedIn() ? `<button class="header-icon-btn" data-action="toggle-follow" data-kind="user" data-id="${id}" data-following="${data.is_following ? '1' : '0'}">${icon('plus', { size: 20 })}</button>` : ''))}
      <div class="profile-hero">
        <div class="profile-avatar-wrap">
          ${p.avatar_url ? `<img src="${p.avatar_url}" alt="" class="profile-avatar-img" />` : `<div class="profile-avatar-initial">${initial}</div>`}
          ${isOwn ? `<button class="profile-avatar-edit" data-action="upload-avatar" data-target="user" data-field="avatar">${icon('camera', { size: 14 })}</button>` : ''}
        </div>
        <p class="profile-name">${escapeHtml(p.display_name)}</p>
        ${p.handle ? `<p class="profile-handle">@${escapeHtml(p.handle)}</p>` : ''}
        <span class="account-role-chip">${roleLabel}</span>
        ${p.bio ? `<p class="profile-bio">${escapeHtml(p.bio)}</p>` : (isOwn ? '<p class="profile-bio" style="color:var(--c-text-muted)">Zatím žádné bio.</p>' : '')}
        <div class="profile-meta">
          ${p.location ? `<span>${icon('location', { size: 14 })} ${escapeHtml(p.location)}</span>` : ''}
          ${p.website ? `<a href="${escapeAttr(p.website)}" target="_blank" rel="noopener">${icon('globe', { size: 14 })} ${escapeHtml(p.website)}</a>` : ''}
          ${p.phone ? `<a href="tel:${escapeAttr(p.phone)}">${icon('phone', { size: 14 })} ${escapeHtml(p.phone)}</a>` : ''}
        </div>
        <div class="profile-stats-row">
          <button class="profile-stat" data-action="open-user-checkins" data-id="${id}" style="background:none;border:none;cursor:pointer">
            <strong>${data.stats?.contributions ?? 0}</strong><span>navštíveno</span>
          </button>
          <button class="profile-stat" data-action="open-followers" data-kind="user" data-id="${id}" style="background:none;border:none;cursor:pointer">
            <strong>${fmt(data.stats?.followers || 0)}</strong><span>sledujících</span>
          </button>
          ${isOwn ? `<button class="profile-stat" data-action="open-badges" style="background:none;border:none;cursor:pointer">
            <strong>${state._userBadges?.length || '★'}</strong><span>odznaků</span>
          </button>` : ''}
        </div>
        <div class="profile-actions">
          ${isOwn ? `
            <button class="profile-action-btn" data-action="edit-profile" data-kind="user" data-id="${id}">${icon('edit', { size: 15 })} Upravit</button>
            <button class="profile-action-btn" data-action="open-badges">${icon('chart', { size: 15 })} Moje odznaky</button>
            <button class="profile-action-btn" data-action="open-wishlist">${icon('bookmark', { size: 15 })} Chci navštívit</button>
          ` : (isLoggedIn() ? `
            <button class="profile-action-btn" data-action="dm-user" data-id="${id}">${icon('chat', { size: 15 })} Napsat</button>
            <button class="profile-action-btn" data-action="report-user" data-id="${id}" style="color:#B3273C">${icon('flag', { size: 15 })} Nahlásit</button>
          ` : '')}
        </div>
      </div>
      ${businessesHtml ? `
        <div class="profile-section">
          <h3 class="profile-section-title">Podniky</h3>
          <div class="profile-biz-list">${businessesHtml}</div>
        </div>` : ''}
    </div>`;
}

// ============================================================
// BUSINESS PROFIL (s tabmi)
// ============================================================

function renderBusinessProfile(data, id, kind) {
  const b = data.profile;
  const isOwn = isLoggedIn() && state.businesses.some((x) => x.id === id);
  const logo = b.logo_url || b.image_url;
  const initial = (b.name || '?').charAt(0).toUpperCase();
  const cover = b.cover_url;
  const kindLabel = { organizations: 'Organizace', accommodation: 'Ubytování', restaurants: 'Gastro' }[kind] || '';
  const activeTab = state._bizProfileTab || 'posts';

  if (activeTab === 'reviews' && !state._reviews) {
    loadReviews(kind, id);
  }
  if (state._checkinStatus === undefined && isLoggedIn()) {
    state._checkinStatus = null;
    apiGet(`/api/checkins/me/status/${kind}/${id}`).then((r) => { state._checkinStatus = r; renderApp(); }).catch(() => {});
  }
  if (state._wishlistStatus === undefined && isLoggedIn()) {
    state._wishlistStatus = null;
    apiGet(`/api/wishlist/me/status/${kind}/${id}`).then((r) => { state._wishlistStatus = r; renderApp(); }).catch(() => {});
  }

  const postsGrid = (data.posts || []).map((post) => {
    const c = (post.media && post.media[0]) || post.image_url;
    const many = post.media && post.media.length > 1;
    return `<button class="profile-grid-item" data-action="open-post" data-post-id="${post.id}" data-kind="${kind}" data-id="${id}">
      <img src="${c}" alt="" loading="lazy" />
      ${many ? `<span class="profile-grid-count">${icon('grid', { size: 12 })}${post.media.length}</span>` : ''}
    </button>`;
  }).join('');

  let tabContent = '';
  if (activeTab === 'posts') {
    tabContent = postsGrid
      ? `<div class="profile-grid">${postsGrid}</div>`
      : '<p class="empty-state">Zatím žádné příspěvky.</p>';
  } else if (activeTab === 'events') {
    const events = state._bizEvents;
    tabContent = events === null
      ? '<p class="empty-state">Načítám…</p>'
      : events.length === 0
        ? '<p class="empty-state">Žádné akce.</p>'
        : `<div class="events-list">${events.map(renderEventCard).join('')}</div>`;
  } else if (activeTab === 'reviews') {
    tabContent = renderReviewsTab();
  } else if (activeTab === 'about') {
    tabContent = `
      <div class="profile-section">
        <p style="font-size:14px;line-height:1.65">${escapeHtml(b.description || 'Bez popisu.')}</p>
        <div style="margin-top:18px;display:flex;flex-wrap:wrap;gap:10px 16px;font-size:13px;color:var(--c-text-muted)">
          ${b.website ? `<a href="${escapeAttr(b.website)}" target="_blank" rel="noopener" style="color:var(--c-primary-dark)">${icon('globe', { size: 14 })} ${escapeHtml(b.website)}</a>` : ''}
          ${b.phone ? `<a href="tel:${escapeAttr(b.phone)}">${icon('phone', { size: 14 })} ${escapeHtml(b.phone)}</a>` : ''}
          ${b.city ? `<span>${icon('location', { size: 14 })} ${escapeHtml(b.city)}, ${escapeHtml(b.district)}</span>` : ''}
        </div>
      </div>`;
  }

  const summary = state._reviews?.summary;
  const avg = summary?.average;
  const ratingHtml = avg ? `<div class="profile-rating-row">${renderStars(avg, 16)} <span style="font-size:13px;color:var(--c-text-muted)">${avg.toFixed(1)} (${summary.total})</span></div>` : '';

  const checkinStatus = state._checkinStatus;
  const wishStatus = state._wishlistStatus;

  return `
    <div class="page-scroll profile-biz-page">
      <div class="profile-cover" ${cover ? `style="background-image:url('${cover}')"` : ''}>
        <button class="header-icon-btn profile-cover-back" data-action="close-overlay">${icon('arrowLeft', { size: 20 })}</button>
        ${isOwn ? `<button class="header-icon-btn profile-cover-edit" data-action="upload-avatar" data-target="${kind}" data-target-id="${id}" data-field="cover">${icon('camera', { size: 16 })}</button>` : ''}
      </div>

      <div class="profile-biz-head">
        <div class="profile-biz-avatar-wrap">
          ${logo ? `<img src="${logo}" alt="" class="profile-biz-avatar" />` : `<div class="profile-biz-avatar profile-biz-avatar-initial">${initial}</div>`}
          ${isOwn ? `<button class="profile-avatar-edit" data-action="upload-avatar" data-target="${kind}" data-target-id="${id}" data-field="avatar">${icon('camera', { size: 13 })}</button>` : ''}
        </div>
        <div class="profile-biz-info">
          <p class="profile-name">${escapeHtml(b.name)} ${b.is_verified ? icon('check', { size: 14, className: 'verified-badge-inline' }) : ''}</p>
          <p class="profile-biz-type">${kindLabel} · ${escapeHtml(b.type || '')}</p>
          <p class="profile-biz-loc">${[b.city, b.district, b.region].filter(Boolean).map(escapeHtml).join(' · ')}</p>
          ${ratingHtml}
          ${b.verification_status === 'pending' ? `<p style="font-size:12px;color:var(--c-gold);margin-top:4px">⏳ Ověření čeká na schválení</p>` : ''}
        </div>
      </div>

      <div class="profile-biz-actions">
        ${isOwn ? `
          <button class="profile-action-btn" data-action="edit-profile" data-kind="${kind}" data-id="${id}">${icon('edit', { size: 15 })} Upravit</button>
          <button class="profile-action-btn" data-action="open-profile-stats" data-kind="${kind}" data-id="${id}">${icon('chart', { size: 15 })} Statistiky</button>
          <button class="profile-action-btn" data-action="open-event-create">${icon('calendar', { size: 15 })} Přidat akci</button>
        ` : (isLoggedIn() ? `
          <button class="profile-action-btn ${data.is_following ? 'is-following' : ''}" data-action="toggle-follow" data-kind="${kind}" data-id="${id}">
            ${data.is_following ? icon('check', { size: 15 }) + ' Sleduji' : icon('plus', { size: 15 }) + ' Sledovat'}
          </button>
          <button class="profile-action-btn ${checkinStatus?.checked_in ? 'is-following' : ''}" data-action="open-create-checkin" data-kind="${kind}" data-id="${id}" data-name="${escapeAttr(b.name)}">
            ${icon('check', { size: 15 })} Byl jsem tady
          </button>
          <button class="profile-action-btn ${wishStatus?.in_wishlist ? 'is-in-wishlist' : ''}" data-action="toggle-wishlist" data-kind="${kind}" data-id="${id}">
            ${icon('bookmark', { size: 15, filled: wishStatus?.in_wishlist })} <span data-wishlist-label>${wishStatus?.in_wishlist ? 'V seznamu' : 'Chci navštívit'}</span>
          </button>
        ` : '')}
        ${b.website ? `<a class="profile-action-btn" href="${escapeAttr(b.website)}" target="_blank" rel="noopener">${icon('globe', { size: 15 })} Web</a>` : ''}
      </div>

      <div class="profile-stats-row">
        <div class="profile-stat"><strong>${data.stats?.posts ?? 0}</strong><span>příspěvků</span></div>
        <button class="profile-stat" data-action="open-followers" data-kind="${kind}" data-id="${id}" style="background:none;border:none;cursor:pointer">
          <strong>${fmt(data.stats?.followers || 0)}</strong><span>sledujících</span>
        </button>
        <button class="profile-stat" data-action="open-business-checkins" data-kind="${kind}" data-id="${id}" style="background:none;border:none;cursor:pointer">
          <strong>${icon('users', { size: 18 })}</strong><span>kdo tu byl</span>
        </button>
      </div>

      <div class="profile-tabs">
        <button class="profile-tab ${activeTab === 'posts' ? 'is-active' : ''}" data-action="biz-profile-tab" data-tab="posts">Příspěvky</button>
        <button class="profile-tab ${activeTab === 'events' ? 'is-active' : ''}" data-action="biz-profile-tab" data-tab="events">Akce</button>
        <button class="profile-tab ${activeTab === 'reviews' ? 'is-active' : ''}" data-action="biz-profile-tab" data-tab="reviews">Recenze</button>
        <button class="profile-tab ${activeTab === 'about' ? 'is-active' : ''}" data-action="biz-profile-tab" data-tab="about">O nás</button>
      </div>

      ${tabContent}
    </div>`;
}

async function switchBizProfileTab(tab) {
  state._bizProfileTab = tab;
  renderApp();
  if (tab === 'events' && state._bizEvents === null) {
    const { id } = state.overlay;
    try {
      const data = await apiGet(`/api/events?business_id=${encodeURIComponent(id)}&when=all`);
      state._bizEvents = data.events || [];
    } catch { state._bizEvents = []; }
    renderApp();
  }
  if (tab === 'reviews' && !state._reviews) {
    const { kind, id } = state.overlay;
    loadReviews(kind, id);
  }
}

// ============================================================
// EDIT PROFILE FORM
// ============================================================

function renderEditProfileForm() {
  const kind = state.overlay.editKind;
  const id = state.overlay.editId;
  const cacheKey = `${kind === 'user' ? 'user' : kind}:${id}`;
  const data = state.profiles[cacheKey];
  const p = data?.profile || (kind === 'user' ? state.user : null);
  if (!p) return '<p class="empty-state">Data se nenačetla.</p>';

  if (kind === 'user') {
    return `
      <form data-action="submit-edit-profile" data-kind="user" data-id="${id}" class="edit-profile-form">
        <div class="form-field">
          <label class="form-label">Handle (@username)</label>
          <input class="form-input" name="handle" value="${escapeAttr(p.handle || '')}" pattern="[a-zA-Z0-9._-]{3,30}" minlength="3" maxlength="30" placeholder="napr. jan.novak" />
          <p class="form-hint">3–30 znaků: písmena, čísla, tečka, podtržítko, pomlčka. Musí být unikátní. Ostatní tě mohou zmínit pomocí @${escapeHtml(p.handle || 'handle')}.</p>
        </div>
        <div class="form-field"><label class="form-label">Jméno</label><input class="form-input" name="display_name" value="${escapeAttr(p.display_name || '')}" /></div>
        <div class="form-field"><label class="form-label">Bio</label><textarea class="form-textarea" name="bio" maxlength="280">${escapeHtml(p.bio || '')}</textarea></div>
        <div class="form-field"><label class="form-label">Lokace</label><input class="form-input" name="location" value="${escapeAttr(p.location || '')}" /></div>
        <div class="form-field"><label class="form-label">Web</label><input class="form-input" name="website" value="${escapeAttr(p.website || '')}" placeholder="https://" /></div>
        <div class="form-field"><label class="form-label">Telefon</label><input class="form-input" name="phone" value="${escapeAttr(p.phone || '')}" /></div>
        <button class="form-submit-btn" type="submit">Uložit</button>
      </form>`;
  }

  const isGastro = kind === 'restaurants';
  const isAcc = kind === 'accommodation';
  return `
    <form data-action="submit-edit-profile" data-kind="${kind}" data-id="${id}" class="edit-profile-form">
      <div class="form-field"><label class="form-label">Název</label><input class="form-input" name="name" value="${escapeAttr(p.name || '')}" required /></div>
      <div class="form-field"><label class="form-label">Popis</label><textarea class="form-textarea" name="description" maxlength="500">${escapeHtml(p.description || '')}</textarea></div>
      ${renderEditRegionDistrictCity(p)}
      ${isGastro ? `<div class="form-field"><label class="form-label">Kuchyně</label><select class="form-select" name="cuisine_type">
        ${TYPES.cuisine.map((t) => `<option value="${t.value}" ${p.cuisine_type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}</select></div>` : ''}
      ${isAcc ? `<div class="form-field"><label class="form-label">Kapacita</label><input class="form-input" type="number" name="capacity" min="1" value="${p.capacity || ''}" /></div>` : ''}
      <div class="form-field"><label class="form-label">Web</label><input class="form-input" name="website" value="${escapeAttr(p.website || '')}" /></div>
      <div class="form-field"><label class="form-label">Telefon</label><input class="form-input" name="phone" value="${escapeAttr(p.phone || '')}" /></div>
      <button class="form-submit-btn" type="submit">Uložit</button>
    </form>`;
}

function renderEditRegionDistrictCity(p) {
  return `
    <div class="form-field"><label class="form-label">Kraj</label>
      <select class="form-select" name="region" data-action="edit-region-change" required>
        ${Object.keys(REGIONS).map((r) => `<option value="${r}" ${p.region === r ? 'selected' : ''}>${r}</option>`).join('')}
      </select></div>
    <div class="form-field"><label class="form-label">Okres</label>
      <select class="form-select" name="district" required>
        ${(REGIONS[p.region] || []).map((d) => `<option value="${d}" ${p.district === d ? 'selected' : ''}>${d}</option>`).join('')}
      </select></div>
    <div class="form-field"><label class="form-label">Obec</label>
      <input class="form-input" name="city" value="${escapeAttr(p.city || '')}" required /></div>`;
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
    const ck = kind === 'user' ? `user:${id}` : `${kind}:${id}`;
    delete state.profiles[ck];
    state.overlay = { type: 'profile', kind: kind === 'user' ? 'user' : kind, id };
    showToast('Uloženo.');
    loadProfile(state.overlay.kind, state.overlay.id);
    renderApp();
  } catch (err) {
    showToast(err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Uložit'; }
  }
}

async function toggleFollow(kind, id) {
  if (!isLoggedIn()) { showToast('Pro sledování se musíš přihlásit.'); switchTab('account'); return; }
  const apiType = kind === 'user' ? 'users' : kind;
  try {
    const res = await apiPost('/api/profile/follow', { type: apiType, id });
    const ck = `${kind === 'user' ? 'user' : kind}:${id}`;
    const d = state.profiles[ck];
    if (d) { d.is_following = res.following; d.stats = { ...(d.stats || {}), followers: res.followers }; }
    showToast(res.following ? 'Sleduješ.' : 'Přestal jsi sledovat.');
    renderApp();
  } catch (err) { showToast(err.message); }
}

async function uploadProfileImage(targetType, targetId, field) {
  if (!isLoggedIn()) { showToast('Musíš být přihlášen.'); return; }
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file, { maxDim: 1200, quality: 0.85 });
    const fd = new FormData();
    fd.append('file', compressed);
    fd.append('target', targetType);
    if (targetId) fd.append('target_id', targetId);
    fd.append('field', field);
    try {
      const res = await apiPost('/api/profile/me/upload', fd);
      if (targetType === 'user') {
        state.user = { ...state.user, [field === 'cover' ? 'cover_url' : 'avatar_url']: res.url };
        setStoredUser(state.user);
        delete state.profiles[`user:${state.user.id}`];
      } else {
        delete state.profiles[`${targetType}:${targetId}`];
      }
      showToast('Fotka nahrána.');
      if (state.overlay?.type === 'profile') loadProfile(state.overlay.kind, state.overlay.id);
      renderApp();
    } catch (err) { showToast(err.message); }
  };
  input.click();
}

// ============================================================
// SETTINGS
// ============================================================

async function loadSettings() {
  if (!isLoggedIn()) return;
  try { const res = await apiGet('/api/profile/me/settings'); state._settings = res.settings; if (state.overlay?.type === 'settings') renderApp(); } catch {}
}

function renderSettingsOverlay() {
  if (!state._settings) loadSettings();
  const s = state._settings || { push_notifications: true, email_notifications: true, public_profile: true, show_contributions: true };
  return `
    <div class="page-scroll">
      ${renderBackHeader('Nastavení')}
      <div class="profile-section">
        <h3 class="profile-section-title">Notifikace</h3>
        <label class="settings-toggle"><span>Push notifikace v prohlížeči</span><input type="checkbox" data-action="push-toggle" ${state._pushSubscribed ? 'checked' : ''} /></label>
        <button class="settings-row" data-action="push-test" style="font-size:12px;color:var(--c-text-muted)">Poslat testovací push</button>
        <label class="settings-toggle"><span>E-mailové notifikace</span><input type="checkbox" data-action="setting-toggle" data-key="email_notifications" ${s.email_notifications ? 'checked' : ''} /></label>
      </div>
      <div class="profile-section">
        <h3 class="profile-section-title">Soukromí</h3>
        <label class="settings-toggle"><span>Veřejný profil</span><input type="checkbox" data-action="setting-toggle" data-key="public_profile" ${s.public_profile ? 'checked' : ''} /></label>
        <label class="settings-toggle"><span>Zobrazovat moje příspěvky</span><input type="checkbox" data-action="setting-toggle" data-key="show_contributions" ${s.show_contributions ? 'checked' : ''} /></label>
      </div>
      <div class="profile-section">
        <h3 class="profile-section-title">Účet</h3>
        <button class="settings-row" data-action="edit-profile" data-kind="user" data-id="${state.user.id}">${icon('edit', { size: 17 })} Upravit profil ${icon('chevronRight', { size: 16, className: 'settings-chevron' })}</button>
        <button class="settings-row" data-action="open-security">${icon('shield', { size: 17 })} Bezpečnost a 2FA ${icon('chevronRight', { size: 16, className: 'settings-chevron' })}</button>
        <button class="settings-row" data-action="open-login-logs">${icon('chart', { size: 17 })} Historie přihlášení ${icon('chevronRight', { size: 16, className: 'settings-chevron' })}</button>
        <button class="settings-row" data-action="open-blocks">${icon('ban', { size: 17 })} Blokovaní uživatelé ${icon('chevronRight', { size: 16, className: 'settings-chevron' })}</button>
        <button class="settings-row" data-action="open-following">${icon('users', { size: 17 })} Sleduji ${icon('chevronRight', { size: 16, className: 'settings-chevron' })}</button>
        <button class="settings-row" data-action="open-bookmarks">${icon('bookmark', { size: 17 })} Uložené příspěvky ${icon('chevronRight', { size: 16, className: 'settings-chevron' })}</button>
        <button class="settings-row" data-action="open-wishlist">${icon('bookmark', { size: 17 })} Chci navštívit ${icon('chevronRight', { size: 16, className: 'settings-chevron' })}</button>
      </div>
      <div class="profile-section">
        <h3 class="profile-section-title">Data a soukromí (GDPR)</h3>
        <button class="settings-row" data-action="export-data">${icon('download', { size: 17 })} Stáhnout moje data ${icon('chevronRight', { size: 16, className: 'settings-chevron' })}</button>
        <a class="settings-row" href="/obchodni-podminky" target="_blank" rel="noopener">${icon('help', { size: 17 })} Obchodní podmínky ${icon('chevronRight', { size: 16, className: 'settings-chevron' })}</a>
        <a class="settings-row" href="/ochrana-osobnich-udaju" target="_blank" rel="noopener">${icon('help', { size: 17 })} Ochrana osobních údajů ${icon('chevronRight', { size: 16, className: 'settings-chevron' })}</a>
        <button class="settings-row" data-action="delete-account" style="color:#B3273C">${icon('trash', { size: 17 })} Smazat účet ${icon('chevronRight', { size: 16, className: 'settings-chevron' })}</button>
      </div>
      <div class="profile-section">
        <button class="settings-row" data-action="logout" style="color:#B3273C">${icon('logout', { size: 17 })} Odhlásit se</button>
      </div>
    </div>`;
}

async function toggleSetting(key, value) {
  state._settings = { ...(state._settings || {}), [key]: value };
  try { await apiPatch('/api/profile/me/settings', { [key]: value }); }
  catch (err) { showToast(err.message); }
}

// ============================================================
// SECURITY (2FA)
// ============================================================

function renderSecurityOverlay() {
  if (!state._totpSetup) state._totpSetup = { stage: 'idle' };
  const has2fa = state.user?.totp_enabled;
  const setup = state._totpSetup;

  return `
    <div class="page-scroll">
      ${renderBackHeader('Bezpečnost a 2FA')}
      <div class="profile-section">
        <h3 class="profile-section-title">Dvoufázové ověření (2FA)</h3>
        ${has2fa ? `
          <p style="font-size:13.5px;color:var(--c-text-muted);margin-bottom:14px;">2FA je <strong style="color:var(--c-primary-dark)">aktivní</strong>.</p>
          <form data-action="submit-disable-2fa">
            <div class="form-field"><label class="form-label">Zadej kód pro vypnutí</label><input class="form-input" name="code" pattern="\\d{6}" maxlength="6" required placeholder="123456" /></div>
            <button class="form-submit-btn" type="submit" style="background:#B3273C">Vypnout 2FA</button>
          </form>
        ` : setup.stage === 'idle' ? `
          <p style="font-size:13.5px;color:var(--c-text-muted);margin-bottom:14px;">Chraň svůj účet dvoufázovým ověřením.</p>
          <button class="form-submit-btn" data-action="start-2fa-setup">Zapnout 2FA</button>
        ` : setup.stage === 'scan' ? `
          <p style="font-size:13.5px;margin-bottom:10px;">1) Naskenuj QR kód nebo zadej klíč do aplikace:</p>
          <div style="padding:12px;background:var(--c-bg);border-radius:var(--radius-sm);text-align:center;margin-bottom:14px;">
            <code style="font-family:monospace;font-size:14px;font-weight:700;word-break:break-all">${setup.secret}</code>
          </div>
          <form data-action="submit-enable-2fa">
            <div class="form-field"><label class="form-label">2) Zadej 6místný kód z aplikace</label><input class="form-input" name="code" pattern="\\d{6}" maxlength="6" required placeholder="123456" /></div>
            <button class="form-submit-btn" type="submit">Aktivovat 2FA</button>
          </form>
        ` : setup.stage === 'codes' ? `
          <div class="form-success" style="margin-bottom:14px;">2FA je aktivní! Ulož si záložní kódy.</div>
          <div style="padding:14px;background:var(--c-bg);border-radius:var(--radius-sm);margin-bottom:14px;">
            ${setup.recoveryCodes.map((c) => `<div style="font-family:monospace;font-size:14px;padding:4px 0;">${c}</div>`).join('')}
          </div>
          <button class="form-submit-btn" data-action="finish-2fa-setup">Hotovo</button>
        ` : ''}
      </div>
    </div>`;
}

async function start2FASetup() {
  try {
    const res = await apiPost('/api/auth/2fa/setup', {});
    state._totpSetup = { stage: 'scan', secret: res.secret, uri: res.otpauth_uri };
    renderApp();
  } catch (err) { showToast(err.message); }
}

async function submitEnable2FA(form) {
  const code = form.querySelector('input[name="code"]').value;
  try {
    const res = await apiPost('/api/auth/2fa/enable', { code });
    state._totpSetup = { stage: 'codes', recoveryCodes: res.recovery_codes };
    state.user.totp_enabled = true;
    setStoredUser(state.user);
    renderApp();
  } catch (err) { showToast(err.message); }
}

function finish2FASetup() { state._totpSetup = { stage: 'idle' }; renderApp(); }

async function submitDisable2FA(form) {
  const code = form.querySelector('input[name="code"]').value;
  try {
    await apiPost('/api/auth/2fa/disable', { code });
    state.user.totp_enabled = false;
    setStoredUser(state.user);
    showToast('2FA vypnuto.');
    renderApp();
  } catch (err) { showToast(err.message); }
}

async function loadLoginLogs() {
  try { const d = await apiGet('/api/auth/me/login-logs'); state._loginLogs = d.logs || []; }
  catch { state._loginLogs = []; }
  if (state.overlay?.type === 'login-logs') renderApp();
}

function renderLoginLogsOverlay() {
  const logs = state._loginLogs;
  return `
    <div class="page-scroll">
      ${renderBackHeader('Historie přihlášení')}
      <div class="profile-section">
        ${logs == null ? '<p class="empty-state">Načítám…</p>'
          : logs.length === 0 ? '<p class="empty-state">Žádné záznamy.</p>'
          : logs.map((l) => `
            <div class="admin-list-item">
              <div class="admin-list-info">
                <p class="admin-list-title">${l.success ? '✓ Úspěšné' : '✗ Neúspěšné'} · ${l.method}</p>
                <p class="admin-list-meta">${escapeHtml(l.ip || '')} · ${escapeHtml(l.user_agent || '')}</p>
              </div>
              <p class="user-list-meta" style="flex-shrink:0">${timeAgo(l.created_at)}</p>
            </div>`).join('')}
      </div>
    </div>`;
}

// ============================================================
// FOLLOWERS / FOLLOWING / BLOCKS
// ============================================================

async function loadFollowers(kind, id) {
  try { const data = await apiGet(`/api/profile/${kind}/${id}/followers`); state._followers = data.users || []; }
  catch { state._followers = []; }
  if (state.overlay?.type === 'followers') renderApp();
}

function renderFollowersOverlay() {
  const list = state._followers;
  return `
    <div class="page-scroll">
      ${renderBackHeader('Sledující')}
      <div class="profile-section">
        ${list == null ? '<p class="empty-state">Načítám…</p>'
          : list.length === 0 ? '<p class="empty-state">Zatím nikdo.</p>'
          : list.map((u) => `
            <button class="user-list-item" data-action="open-profile" data-kind="user" data-id="${u.id}">
              ${u.avatar_url ? `<img src="${u.avatar_url}" class="user-list-avatar" alt="" />`
                : `<span class="user-list-avatar user-list-avatar-init">${(u.display_name || '?').charAt(0).toUpperCase()}</span>`}
              <div style="flex:1">
                <p class="user-list-name">${escapeHtml(u.display_name || '')}</p>
                ${u.handle ? `<p class="user-list-meta">@${escapeHtml(u.handle)}</p>` : ''}
                <p class="user-list-meta">${u.role === 'organization' ? 'Organizace' : u.role === 'hotelier' ? 'Podnik' : 'Turista'}</p>
              </div>
              ${icon('chevronRight', { size: 16 })}
            </button>`).join('')}
      </div>
    </div>`;
}

async function loadFollowing() {
  try { const data = await apiGet('/api/profile/me/following'); state._following = data.items || []; }
  catch { state._following = []; }
  if (state.overlay?.type === 'following') renderApp();
}

function renderFollowingOverlay() {
  const list = state._following;
  return `
    <div class="page-scroll">
      ${renderBackHeader('Sleduji')}
      <div class="profile-section">
        ${list == null ? '<p class="empty-state">Načítám…</p>'
          : list.length === 0 ? '<p class="empty-state">Zatím nikoho nesleduješ.</p>'
          : list.map((it) => {
            const kind = it.target_type;
            const name = it.user_name || it.org_name || it.acc_name || it.rest_name || '?';
            return `<button class="user-list-item" data-action="open-profile" data-kind="${kind}" data-id="${it.target_id}">
              <span class="user-list-avatar user-list-avatar-init">${name.charAt(0).toUpperCase()}</span>
              <div style="flex:1">
                <p class="user-list-name">${escapeHtml(name)}</p>
                ${it.user_handle ? `<p class="user-list-meta">@${escapeHtml(it.user_handle)}</p>` : ''}
                <p class="user-list-meta">${kind === 'users' ? 'Uživatel' : kind === 'organizations' ? 'Organizace' : kind === 'accommodation' ? 'Ubytování' : 'Gastro'}</p>
              </div>
              ${icon('chevronRight', { size: 16 })}
            </button>`;
          }).join('')}
      </div>
    </div>`;
}

async function loadBlocks() {
  try { const data = await apiGet('/api/profile/me/blocks'); state._blocks = data.users || []; }
  catch { state._blocks = []; }
  if (state.overlay?.type === 'blocks') renderApp();
}

function renderBlocksOverlay() {
  const list = state._blocks;
  return `
    <div class="page-scroll">
      ${renderBackHeader('Blokovaní uživatelé')}
      <div class="profile-section">
        ${list == null ? '<p class="empty-state">Načítám…</p>'
          : list.length === 0 ? '<p class="empty-state">Nikoho nemáš blokovaného.</p>'
          : list.map((u) => `
            <div class="user-list-item">
              <span class="user-list-avatar user-list-avatar-init">${(u.display_name || '?').charAt(0).toUpperCase()}</span>
              <div style="flex:1">
                <p class="user-list-name">${escapeHtml(u.display_name || '')}</p>
                ${u.handle ? `<p class="user-list-meta">@${escapeHtml(u.handle)}</p>` : ''}
              </div>
              <button class="admin-delete-btn" data-action="unblock-user" data-id="${u.id}">Odblokovat</button>
            </div>`).join('')}
      </div>
    </div>`;
}

async function unblockUser(id) {
  try { await apiDelete(`/api/profile/block/${id}`); state._blocks = null; loadBlocks(); showToast('Odblokováno.'); }
  catch (err) { showToast(err.message); }
}

async function blockUser(id) {
  if (!confirm('Opravdu zablokovat? Nebude ti moci psát ani tě sledovat.')) return;
  try { await apiPost(`/api/profile/block/${id}`, {}); showToast('Zablokováno.'); closeOverlay(); }
  catch (err) { showToast(err.message); }
}

// ============================================================
// NOTIFIKACE
// ============================================================

async function loadNotifications() {
  if (!isLoggedIn()) return;
  try {
    const data = await apiGet('/api/profile/me/notifications');
    state.notifications = data.notifications || [];
    state.unreadNotifications = data.unread || 0;
    if (state.overlay?.type === 'notifications' || state.tab === 'account') renderApp();
  } catch {}
}

function renderNotificationsOverlay() {
  const list = state.notifications;
  return `
    <div class="page-scroll">
      ${renderBackHeader('Notifikace', list && list.some((n) => !n.read_at)
        ? `<button class="header-icon-btn" data-action="read-all-notifications">${icon('check', { size: 19 })}</button>` : '')}
      <div class="profile-section">
        ${list == null ? '<p class="empty-state">Načítám…</p>'
          : list.length === 0 ? '<p class="empty-state">Žádné notifikace.</p>'
          : list.map((n) => `
            <div class="notif-item ${n.read_at ? '' : 'is-unread'}">
              ${n.actor_avatar ? `<img class="user-list-avatar" src="${n.actor_avatar}" alt="" />`
                : `<span class="user-list-avatar user-list-avatar-init">${(n.actor_name || '?').charAt(0).toUpperCase()}</span>`}
              <div style="flex:1">
                <p class="notif-text"><strong>${escapeHtml(n.actor_name || 'Někdo')}</strong> ${escapeHtml(n.text || '')}</p>
                <p class="notif-time">${timeAgo(n.created_at)}</p>
              </div>
              ${!n.read_at ? `<span class="notif-dot"></span>` : ''}
            </div>`).join('')}
      </div>
    </div>`;
}

async function markAllNotificationsRead() {
  try { await apiPost('/api/profile/me/notifications/read-all', {}); } catch {}
  state.unreadNotifications = 0;
  loadNotifications();
}

// ============================================================
// GLOBÁLNÍ VYHLEDÁVÁNÍ
// ============================================================

let _searchTimer = null;

function renderSearchOverlay() {
  return `
    <div class="page-scroll">
      ${renderBackHeader('Vyhledávání')}
      <div class="filter-bar">
        <div class="search-input-wrap">${icon('search', { size: 17 })}
          <input class="search-input" type="search" placeholder="Hledat organizace, podniky, lidi…" data-action="search-global" value="${escapeAttr(state._searchQuery || '')}" autofocus />
        </div>
      </div>
      <div class="profile-section">
        ${state._searchResults == null ? '<p class="empty-state">Začni psát…</p>'
          : state._searchResults.length === 0 ? '<p class="empty-state">Nic nenalezeno.</p>'
          : state._searchResults.map((r) => {
            let kind = r.kind;
            if (kind === 'restaurants') kind = 'gastro';
            return `<button class="user-list-item" data-action="open-profile" data-kind="${kind}" data-id="${r.id}">
              <span class="user-list-avatar user-list-avatar-init">${(r.name || '?').charAt(0).toUpperCase()}</span>
              <div style="flex:1">
                <p class="user-list-name">${escapeHtml(r.name || '')}</p>
                ${r.handle ? `<p class="user-list-meta">@${escapeHtml(r.handle)}</p>` : ''}
                <p class="user-list-meta">${r.kind === 'users' ? 'Uživatel' : r.kind === 'organizations' ? 'Organizace' : r.kind === 'accommodation' ? 'Ubytování' : 'Gastro'}${r.city ? ` · ${r.city}` : ''}${r.region ? ` · ${r.region}` : ''}</p>
              </div>
              ${icon('chevronRight', { size: 16 })}
            </button>`;
          }).join('')}
      </div>
    </div>`;
}

function onGlobalSearchInput(value) {
  state._searchQuery = value;
  clearTimeout(_searchTimer);
  if (!value || value.length < 2) { state._searchResults = null; renderApp(); return; }
  _searchTimer = setTimeout(async () => {
    try { const data = await apiGet(`/api/profile/search?q=${encodeURIComponent(value)}`); state._searchResults = data.results || []; }
    catch { state._searchResults = []; }
    renderApp();
  }, 350);
}

// ============================================================
// GDPR
// ============================================================

async function exportMyData() {
  try {
    const data = await apiGet('/api/profile/me/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `naskraj-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data stažena.');
  } catch (err) { showToast(err.message); }
}

async function promptDeleteAccount() {
  const v = prompt('Pro smazání účtu napiš velkými písmeny: SMAZAT');
  if (v !== 'SMAZAT') return;
  try { await apiDelete('/api/profile/me/account', { confirm: 'SMAZAT' }); }
  catch (err) { showToast(err.message); return; }
  clearToken();
  clearStoredUser();
  state.token = null;
  state.user = null;
  state.businesses = [];
  state.overlay = null;
  showToast('Účet smazán.');
  renderApp();
}

// ============================================================
// HELPERS
// ============================================================

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s) { return escapeHtml(s); }
