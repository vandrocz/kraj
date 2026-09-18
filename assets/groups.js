async function loadGroupsMy() {
  if (!isLoggedIn()) return;
  try { const d = await apiGet('/api/groups/my'); state.groupsMy = d.groups || []; }
  catch { state.groupsMy = []; }
  if (state.overlay?.type === 'groups') renderApp();
}

async function loadGroupsDiscover() {
  try { const d = await apiGet('/api/groups/discover'); state.groupsDiscover = d.groups || []; }
  catch { state.groupsDiscover = []; }
  if (state.overlay?.type === 'groups') renderApp();
}

function renderGroupsOverlay() {
  return `
    <div class="page-scroll">
      ${renderBackHeader('Skupiny', `<button class="header-icon-btn" data-action="open-create-group" aria-label="Vytvořit">${icon('plus', { size: 20 })}</button>`)}
      <div class="profile-section">
        <h3 class="profile-section-title">Moje skupiny</h3>
        ${state.groupsMy == null ? '<p class="empty-state">Načítám…</p>'
          : state.groupsMy.length === 0 ? '<p class="empty-state">Nejsi v žádné skupině.</p>'
          : state.groupsMy.map((g) => `
            <button class="user-list-item" data-action="open-group" data-id="${g.id}">
              <span class="user-list-avatar user-list-avatar-init">${(g.name || '?').charAt(0).toUpperCase()}</span>
              <div style="flex:1"><p class="user-list-name">${escapeHtml(g.name)}</p>
              <p class="user-list-meta">${g.my_role === 'owner' ? 'Vlastník' : 'Člen'}${g.is_private ? ' · Soukromá' : ''}</p></div>
              ${icon('chevronRight', { size: 16 })}
            </button>`).join('')}
      </div>
      <div class="profile-section">
        <h3 class="profile-section-title">Objevit</h3>
        ${state.groupsDiscover == null ? '<p class="empty-state">Načítám…</p>'
          : state.groupsDiscover.length === 0 ? '<p class="empty-state">Žádné veřejné skupiny.</p>'
          : state.groupsDiscover.map((g) => `
            <button class="user-list-item" data-action="open-group" data-id="${g.id}">
              <span class="user-list-avatar user-list-avatar-init">${(g.name || '?').charAt(0).toUpperCase()}</span>
              <div style="flex:1"><p class="user-list-name">${escapeHtml(g.name)}</p>
              <p class="user-list-meta">${g.members_count || 0} členů</p></div>
              ${icon('chevronRight', { size: 16 })}
            </button>`).join('')}
      </div>
    </div>
  `;
}

async function loadGroupDetail(id) {
  try { const d = await apiGet(`/api/groups/${id}`); state.groupCurrent = d; }
  catch (err) { showToast(err.message); state.groupCurrent = { error: err.message }; }
  if (state.overlay?.type === 'group') renderApp();
}

function openGroupDetail(id) {
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'group', id };
  state.groupCurrent = null;
  renderApp();
  loadGroupDetail(id);
}

function renderGroupDetailOverlay() {
  const d = state.groupCurrent;
  if (!d) return `<div class="page-scroll">${renderBackHeader('Skupina')}<p class="empty-state">Načítám…</p></div>`;
  if (d.error) return `<div class="page-scroll">${renderBackHeader('Skupina')}<p class="empty-state">${d.error}</p></div>`;
  const isMember = !!d.my_role;

  return `
    <div class="page-scroll">
      ${renderBackHeader(d.group.name)}
      <div class="profile-biz-head" style="margin-top:8px">
        <span class="user-list-avatar user-list-avatar-init" style="width:64px;height:64px;font-size:24px;border-radius:16px">${(d.group.name || '?').charAt(0).toUpperCase()}</span>
        <div style="flex:1">
          <p class="profile-name">${escapeHtml(d.group.name)}</p>
          <p class="user-list-meta">${d.members_count} členů${d.group.is_private ? ' · Soukromá' : ''}</p>
        </div>
      </div>
      <div class="profile-biz-actions">
        ${isMember
          ? (d.my_role === 'owner' ? '' : `<button class="profile-action-btn" data-action="leave-group" data-id="${d.group.id}">Opustit</button>`)
          : `<button class="profile-action-btn" data-action="join-group" data-id="${d.group.id}">${icon('plus', { size: 15 })} Přidat se</button>`}
      </div>
      ${d.group.description ? `<p class="profile-biz-desc" style="margin-top:12px">${escapeHtml(d.group.description)}</p>` : ''}
      <div class="profile-section">
        <h3 class="profile-section-title">Příspěvky</h3>
        ${isMember ? `
          <form data-action="submit-group-post" data-id="${d.group.id}" style="margin-bottom:14px">
            <textarea class="form-textarea" name="text" placeholder="Napiš příspěvek do skupiny…" required></textarea>
            <button class="form-submit-btn" type="submit" style="margin-top:8px">Zveřejnit</button>
          </form>` : ''}
        ${(d.posts || []).length === 0 ? '<p class="empty-state">Žádné příspěvky.</p>'
          : d.posts.map((p) => `
            <div class="admin-list-item" style="flex-direction:column;align-items:flex-start">
              <p class="user-list-name" style="margin-bottom:4px">${escapeHtml(p.user_name || '')}</p>
              <p style="font-size:13.5px;line-height:1.5;white-space:pre-wrap">${escapeHtml(p.text || '')}</p>
              <p class="user-list-meta" style="margin-top:6px">${timeAgo(p.created_at)}</p>
            </div>`).join('')}
      </div>
    </div>
  `;
}

async function handleCreateGroup() {
  const name = prompt('Název skupiny:');
  if (!name) return;
  const description = prompt('Popis (nepovinné):') || '';
  try {
    await apiPost('/api/groups', { name, description, is_private: 0 });
    showToast('Skupina vytvořena.');
    state.groupsMy = null;
    loadGroupsMy();
  } catch (err) { showToast(err.message); }
}

async function joinGroup(id) {
  try { await apiPost(`/api/groups/${id}/join`, {}); showToast('Přidán do skupiny.'); state.groupCurrent = null; loadGroupDetail(id); state.groupsMy = null; loadGroupsMy(); }
  catch (err) { showToast(err.message); }
}

async function leaveGroup(id) {
  if (!confirm('Opustit skupinu?')) return;
  try { await apiPost(`/api/groups/${id}/leave`, {}); closeOverlay(); state.groupsMy = null; }
  catch (err) { showToast(err.message); }
}

async function handleGroupPostSubmit(form) {
  const id = form.dataset.id;
  const text = form.querySelector('textarea[name="text"]').value.trim();
  if (!text) return;
  try {
    await apiPost(`/api/groups/${id}/posts`, { text });
    showToast('Zveřejněno.');
    state.groupCurrent = null;
    loadGroupDetail(id);
  } catch (err) { showToast(err.message); }
}
