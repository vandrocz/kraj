// ============================================================
// PODUJATIA (Events)
// ============================================================

async function loadEvents() {
  state.loading.events = true;
  try {
    const e = state.events;
    const params = new URLSearchParams();
    if (e.region) params.set('region', e.region);
    if (e.kind) params.set('kind', e.kind);
    if (e.when) params.set('when', e.when);
    if (e.search) params.set('search', e.search);
    const data = await apiGet(`/api/events?${params.toString()}`);
    state.events.items = data.events || [];
  } catch (err) {
    console.error('Events load failed:', err);
    showToast('Akce se nepodařilo načíst.');
  } finally {
    state.loading.events = false;
    if (state.tab === 'events') renderApp();
  }
}

let _eventsFilterTimer = null;
function onEventFilterChange(field, value) {
  state.events[field] = value;
  if (field === 'region') state.events.city = '';
  renderApp();
  clearTimeout(_eventsFilterTimer);
  _eventsFilterTimer = setTimeout(loadEvents, 250);
}

function renderEventsPage() {
  const title = getFeedTitle('events');
  const canCreate = isLoggedIn() && (state.user.role === 'organization' || state.user.role === 'hotelier' || state.user.role === 'admin');

  return `
    <div class="page-scroll">
      ${renderHeader(title, `
        <button class="header-icon-btn" data-action="open-search" aria-label="Hledat">${icon('search', { size: 19 })}</button>
        ${isLoggedIn() ? `<button class="header-icon-btn" data-action="open-threads" aria-label="Zprávy">${icon('chat', { size: 19 })}</button>` : ''}
        ${canCreate ? `<button class="header-icon-btn" data-action="open-event-create" aria-label="Přidat akci">${icon('plus', { size: 20 })}</button>` : ''}
      `)}
      ${renderEventsFilterBar()}
      ${renderEventsList()}
    </div>`;
}

function renderEventsFilterBar() {
  const e = state.events;
  const regionSelect = `
    <select class="filter-select ${e.region ? 'is-active' : ''}" data-action="event-filter" data-field="region">
      <option value="">Všechny kraje</option>
      ${Object.keys(REGIONS).map((r) => `<option value="${r}" ${e.region === r ? 'selected' : ''}>${r}</option>`).join('')}
    </select>`;
  const kindSelect = `
    <select class="filter-select ${e.kind ? 'is-active' : ''}" data-action="event-filter" data-field="kind">
      <option value="">Všechny typy</option>
      <option value="organizations" ${e.kind === 'organizations' ? 'selected' : ''}>Organizace</option>
      <option value="accommodation" ${e.kind === 'accommodation' ? 'selected' : ''}>Ubytování</option>
      <option value="restaurants" ${e.kind === 'restaurants' ? 'selected' : ''}>Gastro</option>
    </select>`;
  const whenSelect = `
    <select class="filter-select ${e.when !== 'upcoming' ? 'is-active' : ''}" data-action="event-filter" data-field="when">
      <option value="upcoming" ${e.when === 'upcoming' ? 'selected' : ''}>Nadcházející</option>
      <option value="past" ${e.when === 'past' ? 'selected' : ''}>Proběhlé</option>
      <option value="all" ${e.when === 'all' ? 'selected' : ''}>Všechny</option>
    </select>`;
  return `
    <div class="filter-bar">
      <div class="search-input-wrap">
        ${icon('search', { size: 17 })}
        <input class="search-input" type="search" placeholder="Hledat akci…" value="${escapeAttr(e.search)}" data-action="event-search" />
      </div>
      <div class="filter-row">${regionSelect}${kindSelect}${whenSelect}</div>
    </div>`;
}

function renderEventsList() {
  const items = state.events.items;
  if (state.loading.events && items.length === 0) return '<p class="empty-state">Načítám akce…</p>';
  if (items.length === 0) return '<p class="empty-state">Žádné akce neodpovídají filtrům.</p>';
  return `<div class="events-list">${items.map(renderEventCard).join('')}</div>`;
}

function renderEventCard(ev) {
  const cover = ev.cover_image_url || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&h=500&fit=crop';
  const logo = ev.business_logo;
  const logoHtml = logo
    ? `<img src="${logo}" alt="" class="event-card-logo" />`
    : `<span class="event-card-logo event-card-logo-init">${(ev.business_name || '?').charAt(0).toUpperCase()}</span>`;
  const kindLabel = { organizations: 'Organizace', accommodation: 'Ubytování', restaurants: 'Gastro' }[ev.business_kind] || '';

  return `
    <article class="event-card" data-action="open-event" data-id="${ev.id}">
      <div class="event-card-cover" style="background-image:url('${escapeAttr(cover)}')">
        <span class="event-card-kind">${kindLabel}</span>
      </div>
      <div class="event-card-body">
        <div class="event-card-date">
          ${icon('calendar', { size: 14 })} ${formatEventDate(ev.start_at)}
        </div>
        <h3 class="event-card-title">${escapeHtml(ev.title)}</h3>
        ${ev.location_name || ev.city ? `<p class="event-card-loc">${icon('location', { size: 13 })} ${escapeHtml(ev.location_name || '')}${ev.city ? `${ev.location_name ? ' · ' : ''}${escapeHtml(ev.city)}` : ''}</p>` : ''}
        <div class="event-card-business" data-action="open-profile" data-kind="${ev.business_kind}" data-id="${ev.business_id}">
          ${logoHtml}
          <span>${escapeHtml(ev.business_name || '')}</span>
        </div>
      </div>
    </article>`;
}

// ---- Detail ----
async function openEventDetail(id) {
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'event-detail', id };
  state._eventDetail = null;
  renderApp();
  try {
    const data = await apiGet(`/api/events/${id}`);
    state._eventDetail = data.event;
    renderApp();
  } catch (err) {
    showToast(err.message);
    closeOverlay();
  }
}

function renderEventDetailOverlay() {
  const ev = state._eventDetail;
  if (!ev) return `<div class="page-scroll">${renderBackHeader('Akce')}<p class="empty-state">Načítám…</p></div>`;
  const cover = ev.cover_image_url;
  const isOwner = isLoggedIn() && state.user.id === ev.user_id;

  return `
    <div class="page-scroll">
      ${renderBackHeader(ev.title, isOwner ? `<button class="header-icon-btn" data-action="delete-event" data-id="${ev.id}" style="color:#B3273C">${icon('trash', { size: 19 })}</button>` : '')}
      ${cover ? `<img src="${cover}" alt="" style="width:100%;aspect-ratio:16/9;object-fit:cover" />` : ''}
      <div class="profile-section">
        <h2 style="font-family:var(--font-display);font-size:20px;font-weight:800;margin-bottom:8px">${escapeHtml(ev.title)}</h2>
        <p style="font-size:14px;color:var(--c-primary-dark);font-weight:700;margin-bottom:6px">${icon('calendar', { size: 14 })} ${formatEventDate(ev.start_at)}${ev.end_at ? ` – ${formatEventDate(ev.end_at)}` : ''}</p>
        ${ev.location_name ? `<p style="font-size:13.5px;color:var(--c-text-muted)">${icon('location', { size: 13 })} ${escapeHtml(ev.location_name)}${ev.city ? `, ${escapeHtml(ev.city)}` : ''}</p>` : ''}
        <div style="margin-top:16px;font-size:14px;line-height:1.6" class="rich-text">${ev.content_html || escapeHtml(ev.description || '')}</div>
        <div style="margin-top:20px">
          <button class="profile-action-btn" data-action="open-profile" data-kind="${ev.business_kind}" data-id="${ev.business_id}">
            ${icon('user', { size: 15 })} ${escapeHtml(ev.business_name || 'Profil')}
          </button>
        </div>
      </div>
    </div>`;
}

// ---- Create ----
function openCreateEvent() {
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'create-event', file: null, previewUrl: null, uploading: false, businessId: null };
  renderApp();
}

function renderCreateEventOverlay() {
  const businesses = state.businesses || [];
  if (businesses.length === 0) {
    return `<div class="page-scroll">${renderBackHeader('Přidat akci')}<p class="empty-state">Nemáš žádný podnik.</p></div>`;
  }
  if (!state.overlay.businessId) state.overlay.businessId = businesses[0].id;
  const selected = businesses.find((b) => b.id === state.overlay.businessId) || businesses[0];
  const KIND_MAP = { organization: 'organizations', accommodation: 'accommodation', gastro: 'restaurants' };

  return `
    <div class="page-scroll">
      ${renderBackHeader('Přidat akci')}
      <div class="profile-section">
        <form data-action="submit-create-event" data-business-id="${selected.id}" data-business-kind="${KIND_MAP[selected.kind]}">
          <div class="form-field">
            <label class="form-label">Podnik</label>
            <select class="form-select" data-action="event-business-select">
              ${businesses.map((b) => `<option value="${b.id}" ${b.id === selected.id ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('')}
            </select>
          </div>

          <div class="form-field">
            <label class="form-label">Název akce</label>
            <input class="form-input" name="title" required maxlength="200" />
          </div>

          <div class="form-field">
            <label class="form-label">Začátek</label>
            <input class="form-input" type="datetime-local" name="start_at" required />
          </div>

          <div class="form-field">
            <label class="form-label">Konec (nepovinné)</label>
            <input class="form-input" type="datetime-local" name="end_at" />
          </div>

          <div class="form-field">
            <label class="form-label">Místo konání</label>
            <input class="form-input" name="location_name" placeholder="např. Hrad Křivoklát, hlavní nádvoří" />
          </div>

          <div class="form-field">
            <label class="form-label">Kraj</label>
            <select class="form-select" name="region">
              <option value="">Vyberte kraj…</option>
              ${Object.keys(REGIONS).map((r) => `<option value="${r}">${r}</option>`).join('')}
            </select>
          </div>

          <div class="form-field">
            <label class="form-label">Obec</label>
            <input class="form-input" name="city" />
          </div>

          <div class="file-drop ${state.overlay.file ? 'has-file' : ''}" data-action="trigger-event-file">
            <input type="file" accept="image/*" id="event-file-input" data-action="event-file-selected" style="display:none" />
            ${state.overlay.previewUrl
              ? `<img src="${state.overlay.previewUrl}" style="max-height:240px;border-radius:12px;margin:0 auto" />`
              : `${icon('image', { size: 24 })}<br/>Klikni pro výběr úvodní fotky (nepovinné)`}
          </div>

          <div class="form-field">
            <label class="form-label">Popis</label>
            <textarea class="form-textarea" name="description" rows="5" placeholder="Co se bude dít?"></textarea>
          </div>

          <button class="form-submit-btn" type="submit" ${state.overlay.uploading ? 'disabled' : ''}>
            ${state.overlay.uploading ? 'Vytvářím…' : 'Zveřejnit akci'}
          </button>
        </form>
      </div>
    </div>`;
}

async function onEventFileSelected(inputEl) {
  const file = inputEl.files?.[0];
  if (!file) return;
  const compressed = await compressImage(file, { maxDim: 1600, quality: 0.82 });
  state.overlay = { ...state.overlay, file: compressed, previewUrl: URL.createObjectURL(compressed) };
  renderApp();
}

async function handleCreateEventSubmit(form) {
  state.overlay.uploading = true;
  renderApp();

  try {
    const fd = new FormData(form);
    fd.set('business_id', form.dataset.businessId);
    fd.set('business_kind', form.dataset.businessKind);
    if (state.overlay.file) fd.append('file', state.overlay.file, state.overlay.file.name);

    // Preveď datetime-local na SQLite formát
    const startEl = form.querySelector('input[name="start_at"]');
    const endEl = form.querySelector('input[name="end_at"]');
    if (startEl?.value) fd.set('start_at', startEl.value.replace('T', ' ') + ':00');
    if (endEl?.value) fd.set('end_at', endEl.value.replace('T', ' ') + ':00');

    await apiPost('/api/events', fd);
    showToast('Akce zveřejněna!');
    state.overlayStack.pop();
    state.overlay = null;
    state.events.items = [];
    if (state.tab === 'events') loadEvents();
    renderApp();
  } catch (err) {
    showToast(err.message);
    state.overlay.uploading = false;
    renderApp();
  }
}

async function deleteEvent(id) {
  if (!confirm('Smazat tuto akci?')) return;
  try {
    await apiDelete(`/api/events/${id}`);
    showToast('Akce smazána.');
    state.events.items = state.events.items.filter((e) => e.id !== id);
    closeOverlay();
  } catch (err) {
    showToast(err.message);
  }
}