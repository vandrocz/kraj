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

/**
 * Reverse geocoding — vracia detailné údaje.
 * @returns {Promise<{ place, city, district, region, country_code, display_name }>}
 */
async function reverseGeocode(lat, lng) {
  try {
    const data = await apiGet(`/api/geo/reverse?lat=${lat}&lng=${lng}`);
    return {
      place: data.place || data.city || '',
      city: data.city || data.place || '',
      district: data.district || '',
      region: data.region || '',
      country_code: (data.country_code || '').toLowerCase(),
      display_name: data.display_name || data.place || '',
    };
  } catch {
    const fallback = `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
    return {
      place: fallback, city: '', district: '', region: '',
      country_code: '', display_name: fallback,
    };
  }
}

// ------------------------------------------------------------
// Place search — Nominatim cez náš backend
// Vracia: [{ name, display_name, lat, lng, type, address: { city, district, region, country } }]
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

// ------------------------------------------------------------
// Debounced live search pri písaní
// ------------------------------------------------------------
function attachPlaceSearch(inputEl, opts = {}) {
  if (!inputEl) return;
  const wrapperId = inputEl.dataset.placeWrapper || inputEl.id || ('place-' + Math.random().toString(36).slice(2, 8));
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
    listEl.innerHTML = items.map((it, i) => {
      const metaParts = [];
      if (it.address?.city) metaParts.push(it.address.city);
      if (it.address?.district) metaParts.push(it.address.district);
      if (it.address?.region) metaParts.push(it.address.region);
      if (it.address?.country === 'sk') metaParts.unshift('SK');
      if (it.address?.country === 'cz') metaParts.unshift('CZ');
      return `
        <button type="button" class="place-suggest-item" data-place-idx="${i}">
          <span class="place-suggest-name">${escapeHtml(it.name || it.display_name)}</span>
          <span class="place-suggest-meta">${escapeHtml(metaParts.join(' · ') || it.display_name || '')}</span>
        </button>`;
    }).join('');
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
// Map picker — Leaflet modal
// Vracia: Promise<{ lat, lng, place, city, district, region, country_code, display_name } | null>
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
    let currentDetails = {
      place: '', city: '', district: '', region: '',
      country_code: '', display_name: '',
    };

    function loadLeaflet() {
      return new Promise((res, rej) => {
        if (window.L) return res(window.L);
        if (!document.getElementById('leaflet-css')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }
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

    async function setMarker(lat, lng) {
      currentLat = lat;
      currentLng = lng;
      if (latlngEl) latlngEl.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      if (marker && map) marker.setLatLng([lat, lng]);
      else if (map) {
        marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
        marker.on('dragend', async () => {
          const pos = marker.getLatLng();
          await setMarker(pos.lat, pos.lng);
        });
      }
      if (addressEl) addressEl.textContent = t('common.loading');
      const rev = await reverseGeocode(lat, lng);
      currentDetails = rev;
      if (addressEl) addressEl.textContent = rev.display_name || rev.place || '—';
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
        suggestList.innerHTML = items.map((it, i) => {
          const metaParts = [];
          if (it.address?.city) metaParts.push(it.address.city);
          if (it.address?.district) metaParts.push(it.address.district);
          if (it.address?.region) metaParts.push(it.address.region);
          return `
            <button type="button" class="place-suggest-item" data-map-suggest-idx="${i}">
              <span class="place-suggest-name">${escapeHtml(it.name || it.display_name)}</span>
              <span class="place-suggest-meta">${escapeHtml(metaParts.join(' · ') || it.display_name || '')}</span>
            </button>`;
        }).join('');
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

    function closeModal(result) {
      modal.classList.remove('is-open');
      setTimeout(() => modal.remove(), 200);
      document.body.style.overflow = '';
      resolve(result);
    }

    modal.querySelector('[data-map-cancel]').addEventListener('click', () => closeModal(null));
    modal.querySelector('[data-map-confirm]').addEventListener('click', () => closeModal({
      lat: currentLat,
      lng: currentLng,
      place: currentDetails.place || '',
      city: currentDetails.city || '',
      district: currentDetails.district || '',
      region: currentDetails.region || '',
      country_code: currentDetails.country_code || '',
      display_name: currentDetails.display_name || '',
    }));
  });
}

// ------------------------------------------------------------
// Pomocná: pripojí place-search input + tlačidlo na mapu
// ------------------------------------------------------------
function attachPlacePicker(inputEl, mapBtnEl, onSelect) {
  if (inputEl) {
    inputEl.dataset.placeWrapper = inputEl.id || ('place-' + Math.random().toString(36).slice(2, 8));
    attachPlaceSearch(inputEl, {
      onSelect: (item) => {
        if (onSelect) onSelect({
          lat: item.lat,
          lng: item.lng,
          place: item.name || item.display_name,
          display_name: item.display_name || item.name,
          city: item.address?.city || '',
          district: item.address?.district || '',
          region: item.address?.region || '',
          country_code: item.address?.country || '',
        });
      },
    });
  }
  if (mapBtnEl) {
    mapBtnEl.addEventListener('click', async () => {
      const result = await openMapPicker({ title: t('geo.pickOnMap') });
      if (!result) return;
      if (inputEl) inputEl.value = result.display_name || result.place || `${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}`;
      if (onSelect) onSelect(result);
    });
  }
}

async function attachLocationToPost() {
  try {
    const { lat, lng } = await getCurrentLocation();
    const rev = await reverseGeocode(lat, lng);
    return { lat, lng, place: rev.place || rev.display_name, details: rev };
  } catch (err) {
    showToast(err.message);
    return null;
  }
}

async function saveMyLocation() {
  try {
    const { lat, lng } = await getCurrentLocation();
    const rev = await reverseGeocode(lat, lng);
    await apiPost('/api/geo/save', {
      lat, lng,
      place: rev.place || rev.city || '',
      country_code: rev.country_code || '',
    });
    if (state.user) {
      state.user.geo_city = rev.place || rev.city || '';
      state.user.country_code = rev.country_code || '';
      setStoredUser(state.user);
    }
    showToast(t('toasts.locationSaved'));
  } catch (err) { showToast(err.message); }
}

// ============================================================
// NOVÉ: Automatické vyplnenie kraja/okresu/obce z adresy
// ============================================================

/**
 * Vyplní polia `select[name="region"]`, `select[name="district"]`,
 * `select[name="city"]` (alebo `input[name="city"]`) na základe
 * výsledku z geocodéra (Nominatim).
 *
 * @param {HTMLFormElement} form - formulár s poľami
 * @param {Object} place - { address: { city, district, region }, name }
 */
async function fillRegionDistrictCityFromPlace(form, place) {
  if (!form || !place) return;

  const addr = place.address || {};
  const city = addr.city || place.city || place.name || '';
  const district = addr.district || place.district || '';
  const region = addr.region || place.region || '';

  const regionSelect = form.querySelector('select[name="region"]');
  const districtSelect = form.querySelector('select[name="district"]');
  const citySelect = form.querySelector('select[name="city"]');
  const cityInput = form.querySelector('input[name="city"]');

  // Kraj
  if (regionSelect && region && typeof matchRegion === 'function') {
    const matchedRegion = matchRegion(region);
    if (matchedRegion) regionSelect.value = matchedRegion;
  }

  // Manuálne naplň okresy (nespoliehaj sa na change event)
  if (districtSelect && regionSelect?.value) {
    const districts = REGIONS[regionSelect.value] || [];
    districtSelect.innerHTML = `<option value="">${escapeHtml(t('auth.registerSelectDistrict'))}</option>${districts.map((d) => `<option value="${escapeAttr(d)}">${escapeHtml(d)}</option>`).join('')}`;

    if (district && typeof matchDistrict === 'function') {
      const matchedDistrict = matchDistrict(regionSelect.value, district);
      if (matchedDistrict) districtSelect.value = matchedDistrict;
    }
  }

  // Obce
  if (citySelect && districtSelect?.value && typeof loadCitiesForDistrict === 'function') {
    citySelect.innerHTML = `<option value="">${escapeHtml(t('auth.registerLoadingCities'))}</option>`;
    try {
      const cities = await loadCitiesForDistrict(districtSelect.value);
      if (cities.length > 0) {
        citySelect.innerHTML = `<option value="">${escapeHtml(t('auth.registerSelectCity'))}</option>` +
          cities.map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
        if (city) {
          const cityNorm = normalizeStr(city);
          const cMatch = cities.find((c) => normalizeStr(c) === cityNorm);
          if (cMatch) {
            citySelect.value = cMatch;
          } else {
            // Ak nie je v zozname, pridaj manuálne
            const opt = document.createElement('option');
            opt.value = city;
            opt.textContent = city;
            citySelect.appendChild(opt);
            citySelect.value = city;
          }
        }
      } else {
        citySelect.innerHTML = `<option value="">${escapeHtml(t('auth.registerNoCities'))}</option>`;
      }
    } catch {
      citySelect.innerHTML = `<option value="">${escapeHtml(t('auth.registerNoCities'))}</option>`;
    }
  } else if (cityInput && city) {
    cityInput.value = city;
  }
}

/**
 * Nastaví skryté geo_* polia formulára (dataset atribúty).
 * Používa sa pri odosielaní — `submit-register`, `submit-edit-profile`, `submit-create-event`.
 */
function setFormGeoData(form, place) {
  if (!form || !place) return;
  if (place.lat != null) form.dataset.geoLat = String(place.lat);
  if (place.lng != null) form.dataset.geoLng = String(place.lng);
  form.dataset.geoPlace = place.display_name || place.place || '';
  form.dataset.geoCountry = place.country_code || '';
}
