// ============================================================
// CHECK-INS + ODZNAKY
// ============================================================

async function loadUserCheckins(userId) {
  try {
    const data = await apiGet(`/api/checkins/user/${userId}`);
    state._userCheckins = data.checkins || [];
  } catch { state._userCheckins = []; }
  if (state.overlay?.type === 'user-checkins') renderApp();
}

async function loadUserBadges(userId) {
  try {
    const data = await apiGet(`/api/profile/user/${userId}/badges`);
    state._userBadges = data.badges || [];
  } catch { state._userBadges = []; }
  if (state.overlay?.type === 'badges') renderApp();
}

// ============================================================
// CREATE CHECK-IN — modal cez overlay (renderCreateCheckinOverlay)
// Volá sa z events.js cez action "open-create-checkin"
// ============================================================
function openCheckinCreateOverlay(kind, id, name) {
  if (!isLoggedIn()) { showToast(t('checkins.loginRequired')); switchTab('account'); return; }
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'create-checkin', kind, id, name, note: '' };
  pushHistoryState('overlay');
  renderApp();
}

function renderCreateCheckinOverlay() {
  const o = state.overlay;
  return `
    <div class="page-scroll">
      ${renderBackHeader(t('checkins.title'))}
      <div class="profile-section">
        <p style="font-size:14px;margin-bottom:16px;color:var(--c-text-muted)">${escapeHtml(o.name || '')}</p>
        <form data-action="submit-checkin" data-kind="${escapeAttr(o.kind)}" data-id="${escapeAttr(o.id)}">
          <div class="form-field">
            <label class="form-label">${escapeHtml(t('checkins.note'))}</label>
            <textarea class="form-textarea" name="note" maxlength="500" rows="4" placeholder="${escapeAttr(t('checkins.notePlaceholder'))}">${escapeHtml(o.note || '')}</textarea>
          </div>
          <button class="form-submit-btn" type="submit">${escapeHtml(t('checkins.addNote'))}</button>
        </form>
      </div>
    </div>`;
}

async function handleCheckinSubmit(form) {
  const kind = form.dataset.kind;
  const id = form.dataset.id;
  const fd = new FormData(form);
  const note = (fd.get('note') || '').toString().trim() || null;
  const btn = form.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = t('common.saving'); }

  try {
    const res = await apiPost('/api/checkins', {
      business_id: id,
      business_kind: kind,
      note,
    });

    if (res.new_badges && res.new_badges.length > 0) {
      const list = res.new_badges.map((b) => `${tBadge(b.key, b.name)} L${b.level}`).join(', ');
      showToast(t('checkins.newBadge', { list }));
    } else if (res.already) {
      showToast(res.message || t('checkins.already'));
    } else {
      showToast(t('checkins.added'));
    }

    // Zavri overlay a vráť sa na predchádzajúci (typicky profil)
    state.overlay = state.overlayStack.pop() || null;

    // Reset statusu, aby sa v profile znovu načítal
    state._checkinStatus = undefined;
    state._userProfileCheckins = undefined;

    if (state.overlay?.type === 'profile') {
      delete state.profiles[`${state.overlay.kind}:${state.overlay.id}`];
      loadProfile(state.overlay.kind, state.overlay.id);
    }
    renderApp();
  } catch (err) {
    showToast(err.message);
    if (btn) { btn.disabled = false; btn.textContent = t('checkins.addNote'); }
  }
}

function renderBadgesOverlay() {
  const badges = state._userBadges;
  return `
    <div class="page-scroll">
      ${renderBackHeader(t('checkins.badgesTitle'))}
      <div class="profile-section">
        ${badges == null ? `<p class="empty-state">${escapeHtml(t('common.loading'))}</p>`
          : badges.length === 0 ? `<p class="empty-state">${escapeHtml(t('checkins.noBadges'))}</p>`
          : `<div class="badges-grid">${badges.map(renderBadgeCard).join('')}</div>`}
      </div>
    </div>`;
}

function renderBadgeCard(b) {
  const name = tBadge(b.key, b.name);
  return `
    <div class="badge-card">
      <div class="badge-icon-wrap">
        ${icon(b.icon, { size: 26 })}
        ${b.level > 1 ? `<span class="badge-level">L${b.level}</span>` : ''}
      </div>
      <p class="badge-name">${escapeHtml(name)}</p>
      <p class="badge-desc">${escapeHtml(b.description || '')}</p>
      <div class="badge-progress">
        <span>${b.progress}${b.next_tier ? ` / ${b.next_tier}` : ''}</span>
        <span class="badge-levels">${'★'.repeat(b.level)}${'☆'.repeat((b.max_level || 5) - b.level)}</span>
      </div>
    </div>`;
}

function renderUserCheckinsOverlay() {
  const list = state._userCheckins;
  return `
    <div class="page-scroll">
      ${renderBackHeader(t('checkins.visitedTitle'))}
      <div class="profile-section">
        ${list == null ? `<p class="empty-state">${escapeHtml(t('common.loading'))}</p>`
          : list.length === 0 ? `<p class="empty-state">${escapeHtml(t('checkins.noVisits'))}</p>`
          : list.map((ci) => `
            <button class="user-list-item" data-action="open-profile" data-kind="${ci.business_kind}" data-id="${ci.business_id}">
              ${ci.business_logo ? `<img src="${ci.business_logo}" class="user-list-avatar" alt="" />`
                : `<span class="user-list-avatar user-list-avatar-init">${(ci.business_name || '?').charAt(0).toUpperCase()}</span>`}
              <div style="flex:1;min-width:0">
                <p class="user-list-name">${escapeHtml(ci.business_name || '')}</p>
                <p class="user-list-meta">${ci.city ? `${escapeHtml(ci.city)} · ` : ''}${timeAgo(ci.visited_at)}</p>
                ${ci.note ? `<p class="user-list-meta" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;font-style:italic">„${escapeHtml(ci.note)}"</p>` : ''}
              </div>
              ${icon('chevronRight', { size: 16 })}
            </button>`).join('')}
      </div>
    </div>`;
}

async function loadBusinessCheckins(kind, id) {
  try {
    const data = await apiGet(`/api/checkins/business/${kind}/${id}`);
    state._businessCheckins = data;
  } catch { state._businessCheckins = { checkins: [], unique_visitors: 0 }; }
  if (state.overlay?.type === 'business-checkins') renderApp();
}

function openBusinessCheckins(kind, id) {
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'business-checkins', kind, id };
  state._businessCheckins = null;
  pushHistoryState('overlay');
  renderApp();
  loadBusinessCheckins(kind, id);
}

function renderBusinessCheckinsOverlay() {
  const d = state._businessCheckins;
  return `
    <div class="page-scroll">
      ${renderBackHeader(t('checkins.whoWasHere'))}
      <div class="profile-section">
        ${d === null ? `<p class="empty-state">${escapeHtml(t('common.loading'))}</p>` : `
          <p style="font-size:14px;color:var(--c-text-muted);margin-bottom:14px">
            <strong style="color:var(--c-text);font-size:20px">${d.unique_visitors}</strong> ${escapeHtml(t('checkins.visitors'))}
          </p>
          ${d.checkins.length === 0 ? `<p class="empty-state">${escapeHtml(t('checkins.noVisitors'))}</p>`
            : d.checkins.map((ci) => `
              <button class="user-list-item" data-action="open-profile" data-kind="user" data-id="${ci.user_id}">
                ${ci.avatar_url ? `<img src="${ci.avatar_url}" class="user-list-avatar" alt="" />`
                  : `<span class="user-list-avatar user-list-avatar-init">${(ci.display_name || '?').charAt(0).toUpperCase()}</span>`}
                <div style="flex:1">
                  <p class="user-list-name">${escapeHtml(ci.display_name || '')}</p>
                  <p class="user-list-meta">${timeAgo(ci.visited_at)}</p>
                  ${ci.note ? `<p class="user-list-meta" style="font-style:italic">„${escapeHtml(ci.note)}"</p>` : ''}
                </div>
              </button>`).join('')}
        `}
      </div>
    </div>`;
}
