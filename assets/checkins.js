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


function renderCreateCheckinOverlay() {
  const { kind, id, name } = state.overlay;
  return `
    <div class="page-scroll">
      ${renderBackHeader('Byl jsem tady')}
      <div class="profile-section">
        <p style="font-size:14px;margin-bottom:16px;color:var(--c-text-muted)">Přidat návštěvu: <strong style="color:var(--c-text)">${escapeHtml(name || '')}</strong></p>
        <form data-action="submit-checkin" data-kind="${kind}" data-id="${id}">
          <div class="form-field">
            <label class="form-label">Poznámka (nepovinné)</label>
            <textarea class="form-textarea" name="note" maxlength="500" rows="4" placeholder="Co tě zaujalo?"></textarea>
          </div>
          <button class="form-submit-btn" type="submit">${icon('check', { size: 16 })} Zaznamenat návštěvu</button>
        </form>
      </div>
    </div>`;
}

async function handleCheckinSubmit(form) {
  const kind = form.dataset.kind;
  const id = form.dataset.id;
  const fd = new FormData(form);
  try {
    const res = await apiPost('/api/checkins', {
      business_id: id,
      business_kind: kind,
      note: fd.get('note') || null,
    });
    if (res.new_badges && res.new_badges.length > 0) {
      const list = res.new_badges.map((b) => `${b.name} L${b.level}`).join(', ');
      showToast(`Získáno: ${list}! 🎉`);
    } else if (res.already) {
      showToast(res.message || 'Už jsi tu byl(a).');
    } else {
      showToast('Návštěva zaznamenána!');
    }
    state.overlay = null;
    // Invaliduj cache profilu
    if (state.overlayStack.length > 0) {
      const prev = state.overlayStack.pop();
      state.overlay = prev;
      if (prev?.type === 'profile') {
        delete state.profiles[`${prev.kind}:${prev.id}`];
        loadProfile(prev.kind, prev.id);
      }
    }
    renderApp();
  } catch (err) {
    showToast(err.message);
  }
}

function renderBadgesOverlay() {
  const badges = state._userBadges;
  return `
    <div class="page-scroll">
      ${renderBackHeader('Moje odznaky')}
      <div class="profile-section">
        ${badges == null ? '<p class="empty-state">Načítám…</p>'
          : badges.length === 0 ? '<p class="empty-state">Zatím žádné odznaky. Navštiv nějaké místo!</p>'
          : `<div class="badges-grid">${badges.map(renderBadgeCard).join('')}</div>`}
      </div>
    </div>`;
}

function renderBadgeCard(b) {
  return `
    <div class="badge-card">
      <div class="badge-icon-wrap">
        ${icon(b.icon, { size: 26 })}
        ${b.level > 1 ? `<span class="badge-level">L${b.level}</span>` : ''}
      </div>
      <p class="badge-name">${escapeHtml(b.name)}</p>
      <p class="badge-desc">${escapeHtml(b.description)}</p>
      <div class="badge-progress">
        <span>${b.progress}${b.next_tier ? ` / ${b.next_tier}` : ''}</span>
        <span class="badge-levels">${'★'.repeat(b.level)}${'☆'.repeat(b.max_level - b.level)}</span>
      </div>
    </div>`;
}

function renderUserCheckinsOverlay() {
  const list = state._userCheckins;
  return `
    <div class="page-scroll">
      ${renderBackHeader('Navštívená místa')}
      <div class="profile-section">
        ${list == null ? '<p class="empty-state">Načítám…</p>'
          : list.length === 0 ? '<p class="empty-state">Zatím žádné návštěvy.</p>'
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
  renderApp();
  loadBusinessCheckins(kind, id);
}

function renderBusinessCheckinsOverlay() {
  const d = state._businessCheckins;
  return `
    <div class="page-scroll">
      ${renderBackHeader('Kdo tu byl')}
      <div class="profile-section">
        ${d === null ? '<p class="empty-state">Načítám…</p>' : `
          <p style="font-size:14px;color:var(--c-text-muted);margin-bottom:14px">
            <strong style="color:var(--c-text);font-size:20px">${d.unique_visitors}</strong> návštěvníků
          </p>
          ${d.checkins.length === 0 ? '<p class="empty-state">Zatím nikdo.</p>'
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
