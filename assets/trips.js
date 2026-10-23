// ============================================================
// CESTOVATELSKÝ FEED NA PROFILU ("Výlety")
// Fotky z výletů (max. 3), datum, krátký popis a poloha. Zobrazují se jen na profilu autora
// (v žádném jiném feedu). Sledující dostanou upozornění na nový výlet.
// ============================================================

const TRIP_MAX_PHOTOS = 3;
const TRIP_MAX_CAPTION = 300;

function todayIso() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function fmtTripDate(iso) {
  try {
    const loc = { cs: 'cs-CZ', sk: 'sk-SK', en: 'en-GB' }[typeof _currentLang !== 'undefined' ? _currentLang : 'cs'] || 'cs-CZ';
    return new Date(iso + 'T12:00:00').toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return iso; }
}

// ---------- načítání ----------
async function loadUserTrips(userId, more = false) {
  state._trips = state._trips || {};
  const cur = state._trips[userId] || (state._trips[userId] = { items: null, next: null, loading: false });
  if (cur.loading) return;
  cur.loading = true;
  const cacheName = `trips:${userId}`;
  if (!more && cur.items === null && typeof readFeedCache === 'function') {
    const c = readFeedCache(cacheName);
    if (c) { cur.items = c.items; cur.next = c.next_cursor || null; renderApp(); }
  }
  try {
    const q = more && cur.next ? `?cursor=${encodeURIComponent(cur.next)}` : '';
    const r = await apiGet(`/api/trips/user/${encodeURIComponent(userId)}${q}`);
    cur.items = more ? [...(cur.items || []), ...(r.trips || [])] : (r.trips || []);
    cur.next = r.next_cursor || null;
    cur.hidden = !!r.hidden;
    if (!more && typeof writeFeedCache === 'function') writeFeedCache(cacheName, cur.items, cur.next);
  } catch (err) {
    if (cur.items === null) cur.items = [];
  } finally {
    cur.loading = false;
    renderApp();
  }
}

// ---------- vykreslení sekce na profilu ----------
function renderTripCard(trip, isOwn) {
  const media = (trip.media || []).slice(0, TRIP_MAX_PHOTOS);
  const n = media.length;
  const urls = media.map((u) => escapeAttr(u)).join('|');
  const photos = n === 0 ? '' : `
    <div class="trip-photos trip-photos-${n}">
      ${media.map((u, i) => `<button class="trip-photo" data-action="trip-open-photo" data-urls="${urls}" data-idx="${i}" data-caption="${escapeAttr(trip.caption || '')}" aria-label="${escapeAttr(t('trips.photo'))} ${i + 1}">
        <img src="${escapeAttr(u)}" alt="" loading="lazy" decoding="async" /></button>`).join('')}
    </div>`;
  const hasPos = trip.lat !== null && trip.lng !== null && isFinite(trip.lat) && isFinite(trip.lng);
  return `
    <article class="trip-card">
      <header class="trip-head">
        <span class="trip-date">${icon('calendar', { size: 14 })} ${escapeHtml(fmtTripDate(trip.trip_date))}</span>
        ${isOwn ? `<button class="trip-del" data-action="trip-delete" data-id="${escapeAttr(trip.id)}" aria-label="${escapeAttr(t('trips.delete'))}">${icon('trash', { size: 16 })}</button>` : ''}
      </header>
      ${photos}
      ${trip.caption ? `<p class="trip-caption">${escapeHtml(trip.caption)}</p>` : ''}
      ${trip.place_name ? `
        ${hasPos
          ? `<button class="trip-place" data-action="trip-open-map" data-lat="${Number(trip.lat)}" data-lng="${Number(trip.lng)}">${icon('location', { size: 14 })} ${escapeHtml(trip.place_name)}</button>`
          : `<span class="trip-place is-static">${icon('location', { size: 14 })} ${escapeHtml(trip.place_name)}</span>`}` : ''}
    </article>`;
}

function renderTripsSection(userId, isOwn) {
  const cur = state._trips && state._trips[userId];
  if (!cur) return '';
  if (cur.hidden && !isOwn) return '';
  const items = cur.items;
  return `
    <div class="profile-section trips-section">
      <div class="trips-head">
        <h3 class="profile-section-title" style="margin:0">${escapeHtml(t('trips.title'))}</h3>
        ${isOwn ? `<button class="trips-add-btn" data-action="trip-new">${icon('plus', { size: 15 })} ${escapeHtml(t('trips.add'))}</button>` : ''}
      </div>
      ${items === null
        ? `<p class="empty-state">${escapeHtml(t('common.loading'))}</p>`
        : items.length === 0
          ? `<p class="empty-state">${escapeHtml(isOwn ? t('trips.emptyOwn') : t('trips.empty'))}</p>`
          : `<div class="trip-list">${items.map((tr) => renderTripCard(tr, isOwn)).join('')}</div>
             ${cur.next ? `<button class="about-see-all" data-action="trips-more" data-id="${escapeAttr(userId)}" style="margin-top:10px">${escapeHtml(t('trips.more'))}</button>` : ''}`}
      ${isOwn ? `<p class="trips-privacy">${escapeHtml(t('trips.privacyNote'))}</p>` : ''}
    </div>`;
}

// ---------- mazání ----------
function tripDelete(tripId) {
  openModal({
    title: t('trips.deleteTitle'),
    body: `<p style="font-size:14px;line-height:1.6">${escapeHtml(t('trips.deleteConfirm'))}</p>`,
    submitLabel: t('trips.delete'),
    danger: true,
    onSubmit: async () => {
      state._modalLoading = true; renderApp();
      try {
        await apiDelete(`/api/trips/${encodeURIComponent(tripId)}`);
        const mine = state._trips && state._trips[state.user.id];
        if (mine && mine.items) mine.items = mine.items.filter((x) => x.id !== tripId);
        closeModal();
        showToast(t('trips.deleted'));
      } catch (err) { showToast(err.message); }
      state._modalLoading = false; renderApp();
    },
  });
}

// ---------- otevření místa na mapě ----------
function tripOpenOnMap(lat, lng) {
  window._vmapPendingFocus = { lat: Number(lat), lng: Number(lng) };
  state.overlay = null; state.overlayStack = [];
  switchTab('map');
}

// ---------- nový výlet ----------
function openTripNew() {
  if (!isLoggedIn()) { showToast(t('post.loginToComment')); switchTab('account'); return; }
  state._tripDraft = { files: [], date: todayIso(), caption: '', place: null, busy: false, suggestions: [] };
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'trip-new' };
  pushHistoryState('overlay');
  renderApp();
}

function renderTripNewOverlay() {
  const d = state._tripDraft || { files: [], date: todayIso(), caption: '', place: null };
  const full = d.files.length >= TRIP_MAX_PHOTOS;
  return `
    <div class="page-scroll">
      ${renderBackHeader(t('trips.add'))}
      <div class="profile-section trip-form">
        <label class="form-label">${escapeHtml(t('trips.photos'))} <span class="trip-count">${d.files.length}/${TRIP_MAX_PHOTOS}</span></label>
        <div class="trip-previews">
          ${d.files.map((f, i) => `
            <div class="trip-preview">
              <img src="${escapeAttr(f.url)}" alt="" />
              <button class="trip-preview-x" data-action="trip-remove-photo" data-idx="${i}" aria-label="${escapeAttr(t('trips.removePhoto'))}">${icon('close', { size: 14 })}</button>
            </div>`).join('')}
          ${full ? '' : `<button class="trip-add-photo" data-action="trip-pick-photos">${icon('plus', { size: 22 })}<span>${escapeHtml(t('trips.addPhoto'))}</span></button>`}
        </div>
        <input type="file" id="trip-file" accept="image/*" multiple hidden />

        <label class="form-label" style="margin-top:16px" for="trip-date">${escapeHtml(t('trips.date'))}</label>
        <input type="date" id="trip-date" class="form-input" data-trip-date value="${escapeAttr(d.date)}" max="${escapeAttr(todayIso())}" />

        <label class="form-label" style="margin-top:16px" for="trip-caption">${escapeHtml(t('trips.caption'))} <span class="trip-count" id="trip-caption-count">${(d.caption || '').length}/${TRIP_MAX_CAPTION}</span></label>
        <textarea id="trip-caption" class="form-input" data-trip-caption rows="3" maxlength="${TRIP_MAX_CAPTION}" placeholder="${escapeAttr(t('trips.captionPh'))}">${escapeHtml(d.caption || '')}</textarea>

        <label class="form-label" style="margin-top:16px">${escapeHtml(t('trips.place'))}</label>
        ${d.place ? `
          <div class="trip-place-chosen">
            <span>${icon('location', { size: 15 })} ${escapeHtml(d.place.name)}</span>
            <button data-action="trip-clear-place" aria-label="${escapeAttr(t('trips.clearPlace'))}">${icon('close', { size: 14 })}</button>
          </div>` : `
          <div class="trip-search-wrap">
            <input type="search" class="form-input" data-trip-search placeholder="${escapeAttr(t('trips.searchPh'))}" autocomplete="off" />
            <div id="trip-suggest" class="trip-suggest"></div>
          </div>
          <div class="trip-place-actions">
            <button class="trip-place-btn" data-action="trip-pick-on-map">${icon('mapPin', { size: 15 })} ${escapeHtml(t('trips.pickOnMap'))}</button>
            <button class="trip-place-btn" data-action="trip-use-gps">${icon('location', { size: 15 })} ${escapeHtml(t('trips.useGps'))}</button>
          </div>`}

        <button class="btn-primary trip-submit" data-action="trip-submit" ${d.busy ? 'disabled' : ''}>${escapeHtml(d.busy ? t('common.loading') : t('trips.publish'))}</button>
        <p class="trips-privacy">${escapeHtml(t('trips.privacyNote'))}</p>
      </div>
    </div>`;
}

// zmenší fotku (delší strana max 1600 px) → rychlejší nahrávání, menší spotřeba dat
async function tripPrepareImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (blob) return blob;
  } catch {}
  return file;
}

async function tripAddFiles(fileList) {
  const d = state._tripDraft; if (!d) return;
  const room = TRIP_MAX_PHOTOS - d.files.length;
  const picked = Array.from(fileList || []).filter((f) => /^image\//.test(f.type)).slice(0, room);
  if (Array.from(fileList || []).length > room) showToast(t('trips.maxPhotos'));
  for (const f of picked) {
    const blob = await tripPrepareImage(f);
    d.files.push({ blob, url: URL.createObjectURL(blob) });
  }
  renderApp();
}

function tripRemovePhoto(i) {
  const d = state._tripDraft; if (!d) return;
  const f = d.files[i]; if (f) { try { URL.revokeObjectURL(f.url); } catch {} }
  d.files.splice(i, 1);
  renderApp();
}

// ---------- vyhledávání místa (Photon / OpenStreetMap) ----------
let _tripSearchTimer = null;
function tripSearchPlaces(q) {
  clearTimeout(_tripSearchTimer);
  const box = document.getElementById('trip-suggest');
  if (!box) return;
  if (!q || q.trim().length < 2) { box.innerHTML = ''; return; }
  _tripSearchTimer = setTimeout(async () => {
    try {
      const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q.trim())}&limit=6`);
      const data = await res.json();
      const list = (data.features || []).map((f) => {
        const p = f.properties || {};
        const parts = [p.name, p.street, p.city || p.county, p.country].filter(Boolean);
        const label = [...new Set(parts)].join(', ');
        return { name: label.slice(0, 120), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
      }).filter((x) => x.name);
      state._tripDraft.suggestions = list;
      const b = document.getElementById('trip-suggest'); if (!b) return;
      b.innerHTML = list.length === 0 ? `<p class="trip-suggest-empty">${escapeHtml(t('trips.noResults'))}</p>`
        : list.map((x, i) => `<button class="trip-suggest-item" data-action="trip-choose-place" data-i="${i}">${icon('location', { size: 14 })} ${escapeHtml(x.name)}</button>`).join('');
    } catch { box.innerHTML = `<p class="trip-suggest-empty">${escapeHtml(t('trips.searchFailed'))}</p>`; }
  }, 350);
}

function tripChoosePlace(i) {
  const d = state._tripDraft; const s = d && d.suggestions[i]; if (!s) return;
  d.place = { name: s.name, lat: s.lat, lng: s.lng };
  renderApp();
}

function tripUseGps() {
  if (!navigator.geolocation) { showToast(t('trips.gpsFailed')); return; }
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    state._tripDraft.place = { name: await tripReverseName(lat, lng), lat, lng };
    renderApp();
  }, () => showToast(t('trips.gpsFailed')), { enableHighAccuracy: false, timeout: 8000 });
}

async function tripReverseName(lat, lng) {
  try {
    const r = await fetch(`https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}`);
    const j = await r.json();
    const p = (j.features && j.features[0] && j.features[0].properties) || {};
    const parts = [p.name, p.city || p.county, p.country].filter(Boolean);
    const label = [...new Set(parts)].join(', ');
    if (label) return label.slice(0, 120);
  } catch {}
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

// ---------- výběr místa na mapě ----------
let _tripMapLibPromise = null;
function ensureMapLibre() {
  if (window.maplibregl) return Promise.resolve();
  if (_tripMapLibPromise) return _tripMapLibPromise;
  _tripMapLibPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'; document.head.appendChild(css);
    const sc = document.createElement('script'); sc.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
    sc.onload = () => resolve(); sc.onerror = () => { _tripMapLibPromise = null; reject(new Error('maplibre')); };
    document.head.appendChild(sc);
  });
  return _tripMapLibPromise;
}

async function tripPickOnMap() {
  try { await ensureMapLibre(); } catch { showToast(t('trips.mapFailed')); return; }
  const d = state._tripDraft;
  const start = d && d.place ? [d.place.lng, d.place.lat] : [17.1, 48.9];
  const wrap = document.createElement('div');
  wrap.id = 'trip-map-picker';
  wrap.innerHTML = `
    <div class="tmp-bar">
      <button class="tmp-close" data-tmp="close" aria-label="${escapeAttr(t('common.close'))}">${icon('close', { size: 20 })}</button>
      <strong>${escapeHtml(t('trips.pickTitle'))}</strong>
    </div>
    <div id="tmp-map"></div>
    <div class="tmp-pin" aria-hidden="true"><svg width="34" height="42" viewBox="0 0 34 42"><path d="M17 41C17 41 3 26 3 16a14 14 0 1 1 28 0c0 10-14 25-14 25Z" fill="#1B8F52" stroke="#fff" stroke-width="2.5"/><circle cx="17" cy="16" r="5.5" fill="#fff"/></svg></div>
    <div class="tmp-foot"><button class="btn-primary" data-tmp="ok">${escapeHtml(t('trips.useThisPlace'))}</button></div>`;
  document.body.appendChild(wrap);
  const m = new maplibregl.Map({ container: 'tmp-map', style: location.origin + '/assets/map-style.json', center: start, zoom: d && d.place ? 14 : 7 });
  m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  const close = () => { try { m.remove(); } catch {} wrap.remove(); };
  wrap.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tmp]'); if (!b) return;
    if (b.dataset.tmp === 'close') { close(); return; }
    const c = m.getCenter();
    b.disabled = true;
    const name = await tripReverseName(c.lat, c.lng);
    state._tripDraft.place = { name, lat: c.lat, lng: c.lng };
    close(); renderApp();
  });
}

// ---------- odeslání ----------
async function tripSubmit() {
  const d = state._tripDraft; if (!d || d.busy) return;
  if (d.files.length === 0) { showToast(t('trips.needPhoto')); return; }
  if (!d.date) { showToast(t('trips.needDate')); return; }
  d.busy = true; renderApp();
  try {
    const fd = new FormData();
    d.files.forEach((f, i) => fd.append('file', f.blob, `trip${i}.jpg`));
    fd.append('trip_date', d.date);
    fd.append('caption', d.caption || '');
    if (d.place) { fd.append('place_name', d.place.name); fd.append('lat', String(d.place.lat)); fd.append('lng', String(d.place.lng)); }
    await apiPost('/api/trips', fd);
    d.files.forEach((f) => { try { URL.revokeObjectURL(f.url); } catch {} });
    state._tripDraft = null;
    state._trips = {};
    showToast(t('trips.published'));
    // zpět na profil, kde se výlet hned objeví
    state.overlay = state.overlayStack.pop() || null;
    renderApp();
  } catch (err) {
    d.busy = false; renderApp();
    showToast(err.message || t('errors.generic'));
  }
}

// ---------- události (delegace, funguje i po překreslení) ----------
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el || !el.matches || !state._tripDraft) return;
  if (el.matches('[data-trip-caption]')) {
    state._tripDraft.caption = el.value;
    const c = document.getElementById('trip-caption-count'); if (c) c.textContent = `${el.value.length}/${TRIP_MAX_CAPTION}`;
  } else if (el.matches('[data-trip-date]')) {
    state._tripDraft.date = el.value;
  } else if (el.matches('[data-trip-search]')) {
    tripSearchPlaces(el.value);
  }
});
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'trip-file') { tripAddFiles(e.target.files); e.target.value = ''; }
});
