// ============================================================
// ONBOARDING — i18n verzia
// ============================================================

function maybeStartOnboarding(user) {
  if (!user) return;
  if (user.onboarding_done) return;
  if (user.role === 'organization' || user.role === 'hotelier' || user.role === 'admin') {
    apiPatch('/api/profile/me/user', { onboarding_done: true }).catch(() => {});
    return;
  }
  state.overlay = { type: 'onboarding', step: 1, selectedBusinesses: [], bio: '', avatarFile: null, avatarPreview: null };
  pushHistoryState('overlay');
  renderApp();
}

function renderOnboardingOverlay() {
  const o = state.overlay;
  const step = o.step;

  let content = '';

  if (step === 1) {
    content = `
      <div class="onboarding-hero">
        <div class="onboarding-icon">👋</div>
        <h1 class="onboarding-title">${escapeHtml(t('onboarding.welcomeTitle'))}</h1>
        <p class="onboarding-lead">${escapeHtml(t('onboarding.welcomeLead'))}</p>
      </div>
      <div class="onboarding-actions">
        <button class="form-submit-btn" data-action="onboarding-next">${escapeHtml(t('onboarding.continueBtn'))}</button>
        <button class="onboarding-skip" data-action="onboarding-skip">${escapeHtml(t('onboarding.skip'))}</button>
      </div>`;
  } else if (step === 2) {
    content = `
      <div class="onboarding-hero">
        <div class="onboarding-icon">🔍</div>
        <h1 class="onboarding-title">${escapeHtml(t('onboarding.pickTitle'))}</h1>
        <p class="onboarding-lead">${escapeHtml(t('onboarding.pickLead'))}</p>
      </div>
      <div id="onboarding-businesses" class="onboarding-businesses">
        <p class="empty-state">${escapeHtml(t('onboarding.loadingBusinesses'))}</p>
      </div>
      <div class="onboarding-actions">
        <p class="onboarding-counter">${escapeHtml(t('onboarding.pickCounter'))} <strong>${o.selectedBusinesses.length}</strong> ${escapeHtml(t('onboarding.pickOf'))}</p>
        <button class="form-submit-btn" data-action="onboarding-next" ${o.selectedBusinesses.length < 3 ? 'disabled' : ''}>${escapeHtml(t('onboarding.continueBtn'))}</button>
        <button class="onboarding-skip" data-action="onboarding-skip">${escapeHtml(t('onboarding.skip'))}</button>
      </div>`;
    setTimeout(() => loadOnboardingBusinesses(), 50);
  } else if (step === 3) {
    content = `
      <div class="onboarding-hero">
        <div class="onboarding-icon">📸</div>
        <h1 class="onboarding-title">${escapeHtml(t('onboarding.profileTitle'))}</h1>
        <p class="onboarding-lead">${escapeHtml(t('onboarding.profileLead'))}</p>
      </div>
      <div class="onboarding-form">
        <div class="onboarding-avatar">
          ${o.avatarPreview
            ? `<img src="${o.avatarPreview}" alt="" class="onboarding-avatar-img" />`
            : `<div class="onboarding-avatar-placeholder">${(state.user.display_name || '?').charAt(0).toUpperCase()}</div>`}
          <button type="button" class="profile-action-btn" data-action="onboarding-avatar-pick">${icon('camera', { size: 15 })} ${escapeHtml(t('onboarding.uploadPhoto'))}</button>
          <input type="file" accept="image/*" id="onboarding-avatar-input" style="display:none" data-action="onboarding-avatar-change" />
        </div>
        <div class="form-field">
          <label class="form-label">${escapeHtml(t('onboarding.aboutMe'))}</label>
          <textarea class="form-textarea" data-action="onboarding-bio" maxlength="280" rows="3" placeholder="${escapeAttr(t('onboarding.aboutPh'))}">${escapeHtml(o.bio || '')}</textarea>
        </div>
      </div>
      <div class="onboarding-actions">
        <button class="form-submit-btn" data-action="onboarding-finish">${escapeHtml(t('onboarding.finish'))}</button>
        <button class="onboarding-skip" data-action="onboarding-skip">${escapeHtml(t('onboarding.skip'))}</button>
      </div>`;
  }

  return `
    <div class="page-scroll onboarding-page">
      <div class="onboarding-progress">
        ${[1, 2, 3].map((s) => `<span class="onboarding-dot ${s <= step ? 'is-active' : ''}"></span>`).join('')}
      </div>
      ${content}
    </div>`;
}

async function loadOnboardingBusinesses() {
  const el = document.getElementById('onboarding-businesses');
  if (!el) return;
  try {
    const [orgs, acc, rest] = await Promise.all([
      apiGet('/api/feed/organization?sort=trending'),
      apiGet('/api/feed/accommodation?sort=trending'),
      apiGet('/api/feed/gastro?sort=trending'),
    ]);

    const all = [
      ...(orgs.feed || []).map((p) => ({ ...p.business, kind: 'organizations' })),
      ...(acc.feed || []).map((p) => ({ ...p.business, kind: 'accommodation' })),
      ...(rest.feed || []).map((p) => ({ ...p.business, kind: 'restaurants' })),
    ];

    const seen = new Set();
    const uniq = all.filter((b) => {
      const key = `${b.kind}:${b.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 20);

    if (uniq.length === 0) {
      el.innerHTML = `<p class="empty-state">${escapeHtml(t('onboarding.noBusinesses'))}</p>`;
      return;
    }

    const selected = new Set(state.overlay.selectedBusinesses.map((x) => `${x.kind}:${x.id}`));

    el.innerHTML = uniq.map((b) => {
      const key = `${b.kind}:${b.id}`;
      const isSel = selected.has(key);
      const kindLabel = { organizations: t('search.typeOrg'), accommodation: t('search.typeAcc'), restaurants: t('search.typeGastro') }[b.kind] || '';
      return `
        <button type="button" class="onboarding-biz ${isSel ? 'is-selected' : ''}" data-action="onboarding-toggle-biz" data-kind="${b.kind}" data-id="${b.id}" data-name="${escapeAttr(b.name)}">
          <span class="onboarding-biz-initial">${(b.name || '?').charAt(0).toUpperCase()}</span>
          <span class="onboarding-biz-info">
            <span class="onboarding-biz-name">${escapeHtml(b.name || '')}</span>
            <span class="onboarding-biz-meta">${escapeHtml(kindLabel)}${b.city ? ` · ${escapeHtml(b.city)}` : ''}</span>
          </span>
          ${isSel ? `<span class="onboarding-biz-check">${icon('check', { size: 18 })}</span>` : ''}
        </button>`;
    }).join('');
  } catch (err) {
    el.innerHTML = `<p class="empty-state">${escapeHtml(t('common.error'))}: ${err.message}</p>`;
  }
}

function onboardingToggleBiz(kind, id, name) {
  const list = state.overlay.selectedBusinesses;
  const key = `${kind}:${id}`;
  const idx = list.findIndex((x) => `${x.kind}:${x.id}` === key);
  if (idx >= 0) list.splice(idx, 1);
  else list.push({ kind, id, name });
  renderApp();
}

function onboardingNext() {
  state.overlay.step = Math.min(3, state.overlay.step + 1);
  renderApp();
}

function onboardingSkip() {
  finishOnboarding(true);
}

async function onboardingAvatarPick() {
  document.getElementById('onboarding-avatar-input')?.click();
}

async function onboardingAvatarChange(input) {
  const file = input.files?.[0];
  if (!file) return;
  const compressed = await compressImage(file, { maxDim: 800, quality: 0.85 });
  state.overlay.avatarFile = compressed;
  state.overlay.avatarPreview = URL.createObjectURL(compressed);
  renderApp();
}

function onboardingBioChange(value) {
  state.overlay.bio = value;
}

async function finishOnboarding(skipped = false) {
  const o = state.overlay;

  if (o.selectedBusinesses && o.selectedBusinesses.length > 0) {
    for (const b of o.selectedBusinesses) {
      try { await apiPost('/api/profile/follow', { type: b.kind, id: b.id }); } catch {}
    }
  }

  if (o.avatarFile) {
    try {
      const fd = new FormData();
      fd.append('file', o.avatarFile);
      fd.append('target', 'user');
      fd.append('field', 'avatar');
      const res = await apiPost('/api/profile/me/upload', fd);
      state.user = { ...state.user, avatar_url: res.url };
      setStoredUser(state.user);
    } catch {}
  }

  if (o.bio && o.bio.trim()) {
    try {
      const res = await apiPatch('/api/profile/me/user', { bio: o.bio.trim() });
      if (res.user) { state.user = { ...state.user, ...res.user }; setStoredUser(state.user); }
    } catch {}
  }

  try {
    await apiPatch('/api/profile/me/user', { onboarding_done: true });
    state.user.onboarding_done = true;
    setStoredUser(state.user);
  } catch {}

  state.overlay = null;
  state.overlayStack = [];
  if (!skipped) showToast(t('onboarding.welcomeDone'));
  renderApp();
}
