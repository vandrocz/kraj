// ============================================================
// PODUJATIA (Events) — i18n verzia
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
    showToast(t('errors.loadFailed'));
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
        <button class="header-icon-btn" data-action="open-search" aria-label="${escapeAttr(t('search.title'))}">${icon('search', { size: 19 })}</button>
        ${isLoggedIn() ? `<button class="header-icon-btn" data-action="open-threads" aria-label="${escapeAttr(t('messages.title'))}">${icon('chat', { size: 19 })}</button>` : ''}
        ${canCreate ? `<button class="header-icon-btn" data-action="open-event-create" aria-label="${escapeAttr(t('events.create'))}">${icon('plus', { size: 20 })}</button>` : ''}
      `)}
      ${renderEventsFilterBar()}
      ${renderEventsList()}
    </div>`;
}

function renderEventsFilterBar() {
  const e = state.events;
  const regionSelect = `
    <select class="filter-select ${e.region ? 'is-active' : ''}" data-action="event-filter" data-field="region">
      <option value="">${escapeHtml(t('feed.allRegions'))}</option>
      ${Object.keys(REGIONS).map((r) => `<option value="${r}" ${e.region === r ? 'selected' : ''}>${r}</option>`).join('')}
    </select>`;
  const kindSelect = `
    <select class="filter-select ${e.kind ? 'is-active' : ''}" data-action="event-filter" data-field="kind">
      <option value="">${escapeHtml(t('events.allTypes'))}</option>
      <option value="organizations" ${e.kind === 'organizations' ? 'selected' : ''}>${escapeHtml(t('events.typeOrg'))}</option>
      <option value="accommodation" ${e.kind === 'accommodation' ? 'selected' : ''}>${escapeHtml(t('events.typeAcc'))}</option>
      <option value="restaurants" ${e.kind === 'restaurants' ? 'selected' : ''}>${escapeHtml(t('events.typeGastro'))}</option>
    </select>`;
  const whenSelect = `
    <select class="filter-select ${e.when !== 'upcoming' ? 'is-active' : ''}" data-action="event-filter" data-field="when">
      <option value="upcoming" ${e.when === 'upcoming' ? 'selected' : ''}>${escapeHtml(t('events.upcoming'))}</option>
      <option value="past" ${e.when === 'past' ? 'selected' : ''}>${escapeHtml(t('events.past'))}</option>
      <option value="all" ${e.when === 'all' ? 'selected' : ''}>${escapeHtml(t('events.all'))}</option>
    </select>`;
  return `
    <div class="filter-bar">
      <div class="search-input-wrap">
        ${icon('search', { size: 17 })}
        <input class="search-input" type="search" placeholder="${escapeAttr(t('events.searchPlaceholder'))}" value="${escapeAttr(e.search)}" data-action="event-search" />
      </div>
      <div class="filter-row">${regionSelect}${kindSelect}${whenSelect}</div>
    </div>`;
}

function renderEventsList() {
  const e = state.events;
  if (state.loading.events && e.items.length === 0) return `<p class="empty-state">${escapeHtml(t('events.loadingEvents'))}</p>`;
  if (e.items.length === 0) return `<p class="empty-state">${escapeHtml(t('events.noEvents'))}</p>`;
  return `
    <div class="events-list">${e.items.map(renderEventCard).join('')}</div>
    ${e.loading_more ? `<p class="empty-state">${escapeHtml(t('common.loadingMore'))}</p>` : ''}
    ${e.next_cursor ? `<div data-load-more style="height:1px"></div>` : ''}
  `;
}

function renderEventCard(ev) {
  const cover = ev.cover_image_url || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&h=500&fit=crop';
  const logo = ev.business_logo;
  const logoHtml = logo
    ? `<img src="${logo}" alt="" class="event-card-logo" />`
    : `<span class="event-card-logo event-card-logo-init">${(ev.business_name || '?').charAt(0).toUpperCase()}</span>`;
  const kindLabel = { organizations: t('events.typeOrg'), accommodation: t('events.typeAcc'), restaurants: t('events.typeGastro') }[ev.business_kind] || t('events.typeEvent');

  return `
    <article class="event-card" data-action="open-event" data-id="${ev.id}">
      <div class="event-card-cover" style="background-image:url('${escapeAttr(cover)}')">
        <span class="event-card-kind">${escapeHtml(kindLabel)}</span>
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
  pushHistoryState('overlay');
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
  if (!ev) return `<div class="page-scroll">${renderBackHeader(t('events.title'))}<p class="empty-state">${escapeHtml(t('common.loading'))}</p></div>`;
  const isOwner = isLoggedIn() && state.user.id === ev.user_id;
  const gallery = Array.isArray(ev.gallery) && ev.gallery.length > 0 ? ev.gallery : (ev.cover_image_url ? [ev.cover_image_url] : []);
  const cover = gallery[0] || null;

  const startDate = ev.start_at ? new Date((String(ev.start_at).replace(' ', 'T')) + 'Z') : null;
  const endDate = ev.end_at ? new Date((String(ev.end_at).replace(' ', 'T')) + 'Z') : null;

  const dateBlock = startDate && !isNaN(startDate.getTime()) ? {
    day: startDate.getDate(),
    month: startDate.toLocaleDateString(getLanguage() === 'en' ? 'en' : getLanguage() === 'sk' ? 'sk' : 'cs', { month: 'short' }).toUpperCase(),
    weekday: startDate.toLocaleDateString(getLanguage() === 'en' ? 'en' : getLanguage() === 'sk' ? 'sk' : 'cs', { weekday: 'long' }),
    time: `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`,
    year: startDate.getFullYear(),
  } : null;

  const endTime = endDate && !isNaN(endDate.getTime())
    ? `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`
    : null;

  const kindLabel = {
    organizations: t('events.typeOrg'),
    accommodation: t('events.typeAcc'),
    restaurants: t('events.typeGastro'),
  }[ev.business_kind] || t('events.typeEvent');

  return `
    <div class="page-scroll event-detail-page">
      ${renderBackHeader('', isOwner ? `<button class="header-icon-btn" data-action="delete-event" data-id="${ev.id}" style="color:#B3273C">${icon('trash', { size: 19 })}</button>` : `<button class="header-icon-btn" data-action="share-event" data-id="${ev.id}">${icon('share', { size: 19 })}</button>`)}

      <div class="event-detail-cover-narrow">
        ${cover ? `
          <button class="event-detail-cover-image" data-action="open-event-gallery" data-event-id="${ev.id}" data-index="0">
            <img src="${escapeAttr(cover)}" alt="${escapeAttr(ev.title)}" />
            ${gallery.length > 1 ? `<span class="event-detail-gallery-badge">${icon('grid', { size: 12 })} ${gallery.length}</span>` : ''}
          </button>
        ` : ''}
        <div class="event-detail-cover-content">
          <span class="event-detail-kind">${escapeHtml(kindLabel)}</span>
          <h1 class="event-detail-title">${escapeHtml(ev.title)}</h1>
        </div>
      </div>

      ${gallery.length > 1 ? `
        <div class="event-detail-thumbs">
          ${gallery.map((url, idx) => `
            <button class="event-detail-thumb" data-action="open-event-gallery" data-event-id="${ev.id}" data-index="${idx}">
              <img src="${escapeAttr(url)}" alt="" />
            </button>
          `).join('')}
        </div>
      ` : ''}

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
          ` : `<p style="color:var(--c-text-muted)">${escapeHtml(t('events.dateNotSpecified'))}</p>`}
        </div>

        ${ev.location_name || ev.city ? `
          <div class="event-detail-info-row">
            <span class="event-detail-info-icon">${icon('location', { size: 20 })}</span>
            <div class="event-detail-info-text">
              <span class="event-detail-info-label">${escapeHtml(t('events.eventLocation'))}</span>
              <span class="event-detail-info-value">${escapeHtml(ev.location_name || '')}</span>
              ${ev.city ? `<span class="event-detail-info-sub">${escapeHtml(ev.city)}${ev.region ? ', ' + escapeHtml(ev.region) : ''}</span>` : ''}
            </div>
          </div>
        ` : ''}

        ${ev.content_html || ev.description ? `
          <div class="event-detail-description">
            <h3 class="event-detail-section-title">${escapeHtml(t('events.aboutEvent'))}</h3>
            <div class="rich-text">${linkifyHashtags(htmlToPlain(ev.content_html || ev.description || ''))}</div>
          </div>
        ` : ''}

        <div class="event-detail-organizer">
          <h3 class="event-detail-section-title">${escapeHtml(t('events.organizer'))}</h3>
          <button class="event-detail-organizer-card" data-action="open-profile" data-kind="${ev.business_kind}" data-id="${ev.business_id}">
            <span class="event-detail-organizer-avatar">${(ev.business_name || '?').charAt(0).toUpperCase()}</span>
            <div class="event-detail-organizer-info">
              <p class="event-detail-organizer-name">${escapeHtml(ev.business_name || '')}</p>
              <p class="event-detail-organizer-meta">${escapeHtml(kindLabel)}</p>
            </div>
            ${icon('chevronRight', { size: 18 })}
          </button>
        </div>

        ${isLoggedIn() ? `
          <div class="event-detail-actions">
            <button class="event-detail-action-btn event-detail-action-primary" data-action="add-to-calendar" data-id="${ev.id}">
              ${icon('calendar', { size: 18 })} ${escapeHtml(t('events.addToCalendar'))}
            </button>
            <button class="event-detail-action-btn" data-action="share-event" data-id="${ev.id}">
              ${icon('share', { size: 18 })} ${escapeHtml(t('events.share'))}
            </button>
          </div>
        ` : ''}

      </div>
    </div>`;
}

function openEventGallery(eventId, startIndex = 0) {
  const ev = state._eventDetail;
  if (!ev || ev.id !== eventId) return;
  const gallery = Array.isArray(ev.gallery) && ev.gallery.length > 0 ? ev.gallery : (ev.cover_image_url ? [ev.cover_image_url] : []);
  if (gallery.length === 0) return;
  const fakePost = {
    id: `event-${ev.id}`,
    text: ev.title,
    html: `<p>${escapeHtml(ev.title)}</p>`,
    media: gallery,
    created_at: ev.created_at,
    likes: 0,
    comment_count: 0,
    business: { id: ev.business_id, name: ev.business_name, logo_url: ev.business_logo },
    __feedKey: ev.business_kind === 'organizations' ? 'organization' : ev.business_kind === 'accommodation' ? 'accommodation' : 'gastro',
    __isEvent: true,
  };
  openLightbox(gallery, startIndex, ev.title, fakePost);
}

async function shareEvent(id) {
  const ev = state._eventDetail;
  if (!ev) return;
  const url = `${location.origin}${location.pathname}?event=${encodeURIComponent(id)}`;
  const text = `${ev.title} · ${formatEventDate(ev.start_at)}`;
  if (navigator.share) {
    try { await navigator.share({ title: ev.title, text, url }); return; } catch { return; }
  }
  try { await navigator.clipboard.writeText(url); showToast(t('toasts.copied')); }
  catch { showToast(t('toasts.shareFailed')); }
}

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
  a.download = `${(ev.title || 'event').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(t('events.savedToCalendar'));
}

function openCreateEvent() {
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'create-event', file: null, previewUrl: null, uploading: false, businessId: null };
  pushHistoryState('overlay');
  renderApp();
}

function renderCreateEventOverlay() {
  const businesses = state.businesses || [];
  if (businesses.length === 0) {
    return `<div class="page-scroll">${renderBackHeader(t('events.create'))}<p class="empty-state">${escapeHtml(t('profile.noBusiness'))}</p></div>`;
  }
  if (!state.overlay.businessId) state.overlay.businessId = businesses[0].id;
  const selected = businesses.find((b) => b.id === state.overlay.businessId) || businesses[0];
  const KIND_MAP = { organization: 'organizations', accommodation: 'accommodation', gastro: 'restaurants' };
  const eventFiles = state.overlay.eventFiles || [];

  return `
    <div class="page-scroll">
      ${renderBackHeader(t('events.create'))}
      <div class="profile-section">
        <form data-action="submit-create-event" data-business-id="${selected.id}" data-business-kind="${KIND_MAP[selected.kind]}">
          <div class="form-field">
            <label class="form-label">${escapeHtml(t('profile.businessPicker'))}</label>
            <select class="form-select" data-action="event-business-select">
              ${businesses.map((b) => `<option value="${b.id}" ${b.id === selected.id ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('')}
            </select>
          </div>

          <div class="form-field"><label class="form-label">${escapeHtml(t('events.title2'))}</label><input class="form-input" name="title" required maxlength="200" /></div>
          <div class="form-field"><label class="form-label">${escapeHtml(t('events.startDate'))}</label><input class="form-input" type="datetime-local" name="start_at" required /></div>
          <div class="form-field"><label class="form-label">${escapeHtml(t('events.endDate'))}</label><input class="form-input" type="datetime-local" name="end_at" /></div>
          <div class="form-field"><label class="form-label">${escapeHtml(t('events.locationName'))}</label><input class="form-input" name="location_name" placeholder="${escapeAttr(t('events.locationPh'))}" /></div>
          <div class="form-field"><label class="form-label">${escapeHtml(t('events.region'))}</label>
            <select class="form-select" name="region">
              <option value="">${escapeHtml(t('auth.registerSelectRegion'))}</option>
              ${Object.keys(REGIONS).map((r) => `<option value="${r}">${r}</option>`).join('')}
            </select>
          </div>
          <div class="form-field"><label class="form-label">${escapeHtml(t('events.city'))}</label><input class="form-input" name="city" /></div>

          <div class="file-drop ${eventFiles.length > 0 ? 'has-file' : ''}" data-action="trigger-event-file">
            <input type="file" accept="image/*" multiple id="event-file-input" data-action="event-files-selected" style="display:none" />
            ${eventFiles.length === 0
              ? `${icon('image', { size: 24 })}<br/>${escapeHtml(t('events.pickPhotos'))}`
              : `✓ ${escapeHtml(t('events.photosReady', { n: eventFiles.length }))}`}
          </div>
          <div id="event-file-preview" class="file-preview-grid">
            ${eventFiles.map((f) => `<div class="file-preview-item"><img src="${URL.createObjectURL(f)}" /><button type="button" class="file-preview-remove" data-action="remove-event-file" data-name="${escapeAttr(f.name)}">${icon('close', { size: 14 })}</button></div>`).join('')}
          </div>

          <div class="form-field"><label class="form-label">${escapeHtml(t('events.description'))}</label><textarea class="form-textarea" name="description" rows="5" placeholder="${escapeAttr(t('events.descriptionPh'))}"></textarea></div>

          <button class="form-submit-btn" type="submit" ${state.overlay.uploading ? 'disabled' : ''}>
            ${state.overlay.uploading ? escapeHtml(t('events.creating')) : escapeHtml(t('events.publishEvent'))}
          </button>
        </form>
      </div>
    </div>`;
}

async function onEventFilesSelected(inputEl) {
  const files = Array.from(inputEl.files || []).slice(0, 4);
  if (files.length === 0) return;
  const compressed = [];
  for (const f of files) {
    try { compressed.push(await compressImage(f, { maxDim: 1600, quality: 0.82 })); }
    catch { compressed.push(f); }
  }
  state.overlay.eventFiles = compressed;
  renderApp();
}

function removeEventFile(name) {
  state.overlay.eventFiles = (state.overlay.eventFiles || []).filter((f) => f.name !== name);
  renderApp();
}

async function handleCreateEventSubmit(form) {
  state.overlay.uploading = true;
  renderApp();

  try {
    const fd = new FormData(form);
    fd.set('business_id', form.dataset.businessId);
    fd.set('business_kind', form.dataset.businessKind);
    (state.overlay.eventFiles || []).forEach((f) => fd.append('file', f, f.name));

    const startEl = form.querySelector('input[name="start_at"]');
    const endEl = form.querySelector('input[name="end_at"]');
    if (startEl?.value) fd.set('start_at', startEl.value.replace('T', ' ') + ':00');
    if (endEl?.value) fd.set('end_at', endEl.value.replace('T', ' ') + ':00');

    await apiPost('/api/events', fd);
    showToast(t('events.published'));
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

async function onEventFileSelected(inputEl) {
  const file = inputEl.files?.[0];
  if (!file) return;
  const compressed = await compressImage(file, { maxDim: 1600, quality: 0.82 });
  state.overlay = { ...state.overlay, file: compressed, previewUrl: URL.createObjectURL(compressed) };
  renderApp();
}

async function deleteEvent(id) {
  if (!confirm(t('events.deleteConfirm'))) return;
  try {
    await apiDelete(`/api/events/${id}`);
    showToast(t('events.deleted'));
    state.events.items = state.events.items.filter((e) => e.id !== id);
    closeOverlay();
  } catch (err) {
    showToast(err.message);
  }
}
