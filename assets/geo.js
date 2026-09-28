// ============================================================
// GEO — poloha, place search, map picker
// ============================================================

let _geoWatchId = null;

async function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolokace není podporována.'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error('Nepodařilo se získat polohu.')),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
}

async function reverseGeocode(lat, lng) {
  try {
    const data = await apiGet(`/api/geo/reverse?lat=${lat}&lng=${lng}`);
    return data.place || data.region || `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
  } catch {
    return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
  }
}

// ------------------------------------------------------------
// Place search — Nominatim cez náš backend
// Vracia: [{ display_name, name, lat, lng, type, address }]
// ------------------------------------------------------------
let _placeSearchTimers = {};

async function searchPlaces(query, opts = {}) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  const limit = opts.limit || 8;
  const countryFilter = opts.countryFilter || 'cz,sk';
  try {
    const url = `/api/geo/search?q=${encodeURIComponent(q)}&limit=${limit}&cc=${encodeURIComponent(countryFilter)}`;
    const data = await apiGet(url);
    return Array.isArray(data.results) ? data.results : [];
  } catch (err) {
    console.warn('[geo] searchPlaces zlyhal:', err.message);
    return [];
  }
}

// Debounced live search pri písaní
function attachPlaceSearch(inputEl, opts = {}) {
  if (!inputEl) return;
  const wrapperId = inputEl.dataset.placeWrapper || inputEl.id;
  const listId = `place-suggest-${wrapperId}`;
  let listEl = document.getElementById(listId);
  if (!listEl) {
    listEl = document.createElement('div');
    listEl.id = listId;
    listEl.className = 'place-suggest-list';
    inputEl.parentNode.style.position = 'relative';
    inputEl.parentNode.appendChild(listEl);
  }
  listEl.style.display = 'none';

  const renderList = (items) => {
    if (!items.length) { listEl.style.display = 'none'; listEl.innerHTML = ''; return; }
    listEl.innerHTML = items.map((it, i) => `
      <button type="button" class="place-suggest-item" data-place-idx="${i}">
        <span class="place-suggest-name">${escapeHtml(it.name || it.display_name)}</span>
        <span class="place-suggest-meta">${escapeHtml(it.display_name || '')}</span>
      </button>`).join('');
    listEl.style.display = 'block';
    listEl.querySelectorAll('[data-place-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = items[parseInt(btn.dataset.placeIdx, 10)];
        if (!item) return;
        inputEl.value = item.name || item.display_name;
        if (opts.onSelect) opts.onSelect(item);
        listEl.style.display = 'none';
        listEl.innerHTML = '';
      });
    });
  };

  const key = wrapperId;
  inputEl.addEventListener('input', () => {
    clearTimeout(_placeSearchTimers[key]);
    const val = inputEl.value;
    if (val.length < 3) { renderList([]); return; }
    listEl.style.display = 'block';
    listEl.innerHTML = `<div class="place-suggest-loading">${escapeHtml(t('common.loading'))}</div>`;
    _placeSearchTimers[key] = setTimeout(async () => {
      const items = await searchPlaces(val, opts);
      renderList(items);
    }, 320);
  });

  inputEl.addEventListener('blur', () => {
    setTimeout(() => { listEl.style.display = 'none'; }, 180);
  });
}

// ------------------------------------------------------------
// Map picker — otvorí modal s mapou (Leaflet/Google embed)
// Používateľ klikne, dostane lat/lng + adresu, potvrdí
// Vracia: Promise<{ lat, lng, place } | null>
// ------------------------------------------------------------
function openMapPicker(opts = {}) {
  return new Promise((resolve) => {
    const initialLat = opts.lat || 49.8175;
    const initialLng = opts.lng || 15.4730;
    const initialZoom = opts.zoom || 12;

    const modal = document.createElement('div');
    modal.className = 'map-picker-modal';
    modal.innerHTML = `
      <div class="map-picker-head">
        <button type="button" class="map-picker-btn" data-map-cancel>${escapeHtml(t('common.cancel'))}</button>
        <span class="map-picker-title">${escapeHtml(opts.title || t('geo.pickOnMap'))}</span>
        <button type="button" class="map-picker-btn map-picker-btn-primary" data-map-confirm>${escapeHtml(t('common.confirm'))}</button>
      </div>
      <div class="map-picker-search">
        <input type="text" class="map-picker-search-input" placeholder="${escapeAttr(t('geo.searchPlaceholder'))}" data-map-search />
        <div class="place-suggest-list" data-map-suggest-list style="display:none"></div>
      </div>
      <div class="map-picker-map" data-map-canvas></div>
      <div class="map-picker-info">
        <div class="map-picker-info-row">
          <span class="map-picker-info-label">${escapeHtml(t('geo.latLng'))}</span>
          <span class="map-picker-info-value" data-map-latlng>${initialLat.toFixed(5)}, ${initialLng.toFixed(5)}</span>
        </div>
        <div class="map-picker-info-row">
          <span class="map-picker-info-label">${escapeHtml(t('geo.address'))}</span>
          <span class="map-picker-info-value" data-map-address>${escapeHtml(t('common.loading'))}</span>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    const canvasEl = modal.querySelector('[data-map-canvas]');
    const latlngEl = modal.querySelector('[data-map-latlng]');
    const addressEl = modal.querySelector('[data-map-address]');
    const searchInput = modal.querySelector('[data-map-search]');
    const suggestList = modal.querySelector('[data-map-suggest-list]');

    let map = null;
    let marker = null;
    let currentLat = initialLat;
    let currentLng = initialLng;
    let currentPlace = '';

    // Leaflet — načítame dynamicky, ak nie je
    function loadLeaflet() {
      return new Promise((res, rej) => {
        if (window.L) return res(window.L);
        // CSS
        if (!document.getElementById('leaflet-css')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }
        // JS
        if (!document.getElementById('leaflet-js')) {
          const s = document.createElement('script');
          s.id = 'leaflet-js';
          s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          s.onload = () => res(window.L);
          s.onerror = rej;
          document.head.appendChild(s);
        } else {
          const check = setInterval(() => { if (window.L) { clearInterval(check); res(window.L); } }, 50);
        }
      });
    }

    function setMarker(lat, lng) {
      currentLat = lat;
      currentLng = lng;
      if (latlngEl) latlngEl.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      if (marker && map) marker.setLatLng([lat, lng]);
      else if (map) {
        marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
        marker.on('dragend', async () => {
          const pos = marker.getLatLng();
          setMarker(pos.lat, pos.lng);
          currentPlace = await reverseGeocode(pos.lat, pos.lng);
          if (addressEl) addressEl.textContent = currentPlace || '—';
        });
      }
      reverseGeocode(lat, lng).then((place) => {
        currentPlace = place || '';
        if (addressEl) addressEl.textContent = currentPlace || '—';
      });
    }

    loadLeaflet().then((L) => {
      map = L.map(canvasEl, { zoomControl: true, attributionControl: false }).setView([initialLat, initialLng], initialZoom);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      setMarker(initialLat, initialLng);
      map.on('click', (e) => {
        setMarker(e.latlng.lat, e.latlng.lng);
      });
      setTimeout(() => map.invalidateSize(), 100);
    }).catch((err) => {
      canvasEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--c-text-muted)">${escapeHtml(t('errors.loadFailed'))}</div>`;
      console.warn('Leaflet load failed:', err);
    });

    // Search v pickeri
    let searchTimer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const val = searchInput.value.trim();
      if (val.length < 3) { suggestList.style.display = 'none'; return; }
      suggestList.style.display = 'block';
      suggestList.innerHTML = `<div class="place-suggest-loading">${escapeHtml(t('common.loading'))}</div>`;
      searchTimer = setTimeout(async () => {
        const items = await searchPlaces(val, { limit: 6 });
        if (!items.length) {
          suggestList.innerHTML = `<div class="place-suggest-loading">${escapeHtml(t('search.nothingFound'))}</div>`;
          return;
        }
        suggestList.innerHTML = items.map((it, i) => `
          <button type="button" class="place-suggest-item" data-map-suggest-idx="${i}">
            <span class="place-suggest-name">${escapeHtml(it.name || it.display_name)}</span>
            <span class="place-suggest-meta">${escapeHtml(it.display_name || '')}</span>
          </button>`).join('');
        suggestList.querySelectorAll('[data-map-suggest-idx]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const item = items[parseInt(btn.dataset.mapSuggestIdx, 10)];
            if (!item) return;
            setMarker(item.lat, item.lng);
            if (map) map.setView([item.lat, item.lng], 15);
            suggestList.style.display = 'none';
            searchInput.value = item.name || item.display_name;
          });
        });
      }, 300);
    });

    modal.querySelector('[data-map-cancel]').addEventListener('click', () => {
      modal.classList.remove('is-open');
      setTimeout(() => modal.remove(), 200);
      document.body.style.overflow = '';
      resolve(null);
    });
    modal.querySelector('[data-map-confirm]').addEventListener('click', () => {
      modal.classList.remove('is-open');
      setTimeout(() => modal.remove(), 200);
      document.body.style.overflow = '';
      resolve({ lat: currentLat, lng: currentLng, place: currentPlace });
    });
  });
}

// ------------------------------------------------------------
// Pomocná — pripojí place-search input + tlačidlo na mapu
// ------------------------------------------------------------
function attachPlacePicker(inputEl, mapBtnEl, onSelect) {
  if (inputEl) {
    inputEl.dataset.placeWrapper = inputEl.id || ('place-' + Math.random().toString(36).slice(2, 8));
    attachPlaceSearch(inputEl, {
      onSelect: (item) => {
        if (onSelect) onSelect({ lat: item.lat, lng: item.lng, place: item.name || item.display_name });
      },
    });
  }
  if (mapBtnEl) {
    mapBtnEl.addEventListener('click', async () => {
      const result = await openMapPicker({ title: t('geo.pickOnMap') });
      if (!result) return;
      if (inputEl) inputEl.value = result.place || `${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}`;
      if (onSelect) onSelect(result);
    });
  }
}

async function attachLocationToPost() {
  try {
    const { lat, lng } = await getCurrentLocation();
    const place = await reverseGeocode(lat, lng);
    return { lat, lng, place };
  } catch (err) {
    showToast(err.message);
    return null;
  }
}

async function saveMyLocation() {
  try {
    const { lat, lng } = await getCurrentLocation();
    const place = await reverseGeocode(lat, lng);
    await apiPost('/api/geo/save', { lat, lng, place: place || '' });
    if (state.user) { state.user.geo_city = place || ''; setStoredUser(state.user); }
    showToast(t('toasts.locationSaved'));
  } catch (err) { showToast(err.message); }
}
