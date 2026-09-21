// ============================================================
// PODUJATIA (Events)
// ============================================================

async function loadEvents(loadMore = false) {
  const e = state.events;
  if (loadMore && !e.next_cursor) return;
  if (loadMore && e.loading_more) return;
  if (loadMore) e.loading_more = true;
  else state.loading.events = true;

  try {
    const params = new URLSearchParams();
    if (e.region) params.set('region', e.region);
    if (e.kind) params.set('kind', e.kind);
    if (e.when) params.set('when', e.when);
    if (e.search) params.set('search', e.search);
    if (loadMore && e.next_cursor) params.set('cursor', e.next_cursor);

    const data = await apiGet(`/api/events?${params.toString()}`);
    if (loadMore) e.items = [...e.items, ...(data.events || [])];
    else e.items = data.events || [];
    e.next_cursor = data.next_cursor || null;
  } catch (err) {
    console.error('Events load failed:', err);
    showToast('Akce se nepodařilo načíst.');
  } finally {
    state.loading.events = false;
    e.loading_more = false;
    if (state.tab === 'events') renderApp();
  }
}

let _eventsFilterTimer = null;
function onEventFilterChange(field, value) {
  state.events[field] = value;
  if (field === 'region') state.events.city = '';
  state.events.next_cursor = null;
  renderApp();
  clearTimeout(_eventsFilterTimer);
  _eventsFilterTimer = setTimeout(() => loadEvents(), 250);
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
  const e = state.events;
  if (state.loading.events && e.items.length === 0) return '<p class="empty-state">Načítám akce…</p>';
  if (e.items.length === 0) return '<p class="empty-state">Žádné akce neodpovídají filtrům.</p>';
  return `
    <div class="events-list">${e.items.map(renderEventCard).join('')}</div>
    ${e.loading_more ? '<p class="empty-state">Načítám další…</p>' : ''}
    ${e.next_cursor ? `<div data-load-more style="height:1px"></div>` : ''}
  `;
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

  // Rozdeľ dátum na komponenty
  const startDate = ev.start_at ? new Date((String(ev.start_at).replace(' ', 'T')) + 'Z') : null;
  const endDate = ev.end_at ? new Date((String(ev.end_at).replace(' ', 'T')) + 'Z') : null;

  const dateBlock = startDate && !isNaN(startDate.getTime()) ? {
    day: startDate.getDate(),
    month: startDate.toLocaleDateString('cs-CZ', { month: 'short' }).toUpperCase(),
    weekday: startDate.toLocaleDateString('cs-CZ', { weekday: 'long' }),
    time: `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`,
    year: startDate.getFullYear(),
  } : null;

  const endTime = endDate && !isNaN(endDate.getTime())
    ? `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`
    : null;

  const kindLabel = {
    organizations: 'Organizace',
    accommodation: 'Ubytování',
    restaurants: 'Gastro',
  }[ev.business_kind] || 'Akce';

  return `
    <div class="page-scroll event-detail-page">
      ${renderBackHeader('', isOwner ? `<button class="header-icon-btn" data-action="delete-event" data-id="${ev.id}" style="color:#B3273C">${icon('trash', { size: 19 })}</button>` : `<button class="header-icon-btn" data-action="share-event" data-id="${ev.id}">${icon('share', { size: 19 })}</button>`)}

      <div class="event-detail-cover" ${cover ? `style="background-image:url('${escapeAttr(cover)}')"` : ''}>
        <div class="event-detail-cover-overlay"></div>
        <div class="event-detail-cover-content">
          <span class="event-detail-kind">${kindLabel}</span>
          <h1 class="event-detail-title">${escapeHtml(ev.title)}</h1>
        </div>
      </div>

      <div class="event-detail-body">

        <div class="event-detail-date-card">
          ${dateBlock ? `
            <div class="event-detail-date-big">
              <span class="event-detail-day">${dateBlock.day}</span>
              <span class="event-detail-month">${dateBlock.month}</span>
              <span class="event-detail-year">${dateBlock.year}</span>
            </div>
            <div class="event-detail-date-info">
              <p class="event-detail-weekday">${dateBlock.weekday}</p>
              <p class="event-detail-time">${dateBlock.time}${endTime ? ` – ${endTime}` : ''}</p>
            </div>
          ` : '<p style="color:var(--c-text-muted)">Datum neuvedeno</p>'}
        </div>

        ${ev.location_name || ev.city ? `
          <div class="event-detail-info-row">
            <span class="event-detail-info-icon">${icon('location', { size: 20 })}</span>
            <div class="event-detail-info-text">
              <span class="event-detail-info-label">Místo konání</span>
              <span class="event-detail-info-value">${escapeHtml(ev.location_name || '')}</span>
              ${ev.city ? `<span class="event-detail-info-sub">${escapeHtml(ev.city)}${ev.region ? ', ' + escapeHtml(ev.region) : ''}</span>` : ''}
            </div>
          </div>
        ` : ''}

        ${ev.content_html || ev.description ? `
          <div class="event-detail-description">
            <h3 class="event-detail-section-title">O akci</h3>
            <div class="rich-text">${ev.content_html || escapeHtml(ev.description || '')}</div>
          </div>
        ` : ''}

        <div class="event-detail-organizer">
          <h3 class="event-detail-section-title">Pořadatel</h3>
          <button class="event-detail-organizer-card" data-action="open-profile" data-kind="${ev.business_kind}" data-id="${ev.business_id}">
            <span class="event-detail-organizer-avatar">
              ${(ev.business_name || '?').charAt(0).toUpperCase()}
            </span>
            <div class="event-detail-organizer-info">
              <p class="event-detail-organizer-name">${escapeHtml(ev.business_name || '')}</p>
              <p class="event-detail-organizer-meta">${kindLabel}</p>
            </div>
            ${icon('chevronRight', { size: 18 })}
          </button>
        </div>

        ${isLoggedIn() ? `
          <div class="event-detail-actions">
            <button class="event-detail-action-btn event-detail-action-primary" data-action="add-to-calendar" data-id="${ev.id}">
              ${icon('calendar', { size: 18 })} Přidat do kalendáře
            </button>
            <button class="event-detail-action-btn" data-action="share-event" data-id="${ev.id}">
              ${icon('share', { size: 18 })} Sdílet
            </button>
          </div>
        ` : ''}

      </div>
    </div>`;
}

// Share handler pre event
async function shareEvent(id) {
  const ev = state._eventDetail;
  if (!ev) return;
  const url = `${location.origin}${location.pathname}?event=${encodeURIComponent(id)}`;
  const text = `${ev.title} · ${formatEventDate(ev.start_at)}`;
  if (navigator.share) {
    try { await navigator.share({ title: ev.title, text, url }); return; } catch { return; }
  }
  try { await navigator.clipboard.writeText(url); showToast('Odkaz zkopírován.'); }
  catch { showToast('Sdílení se nepodařilo.'); }
}

// Add to calendar (ICS download)
function addEventToCalendar(id) {
  const ev = state._eventDetail;
  if (!ev) return;
  const fmt = (iso) => {
    const d = new Date((String(iso).replace(' ', 'T')) + 'Z');
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  };
  const start = fmt(ev.start_at);
  const end = ev.end_at ? fmt(ev.end_at) : fmt(ev.start_at);
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Náš kraj//Akce//CS',
    'BEGIN:VEVENT',
    `UID:${ev.id}@naskraj.vandro.cz`,
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${(ev.title || '').replace(/\n/g, ' ')}`,
    `DESCRIPTION:${(ev.description || '').replace(/\n/g, ' ')}`,
    `LOCATION:${(ev.location_name || ev.city || '').replace(/\n/g, ' ')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(ev.title || 'akce').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Uloženo do kalendáře.');
}

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

    const startEl = form.querySelector('input[name="start_at"]');
    const endEl = form.querySelector('input[name="end_at"]');
    if (startEl?.value) fd.set('start_at', startEl.value.replace('T', ' ') + ':00');
    if (endEl?.value) fd.set('end_at', endEl.value.replace('T', ' ') + ':00');

    await apiPost('/api/events', fd);
    showToast('Akce zveřejněna!');
    state.overlayStack.pop();
    state.overlay = null;
    state.events.items = [];
    state.events.next_cursor = null;
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
