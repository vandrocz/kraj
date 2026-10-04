// ============================================================
// GEO — poloha, place search, map picker, auto-fill kraj/okres/obec
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
    return {
      place: data.place || data.city || '',
      city: data.city || data.place || '',
      district: data.district || '',
      region: data.region || '',
      country_code: (data.country_code || '').toLowerCase(),
      display_name: data.display_name || data.place || '',
      lat, lng,
    };
  } catch {
    const fallback = `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
    return {
      place: fallback, city: '', district: '', region: '',
      country_code: '', display_name: fallback, lat, lng,
    };
  }
}

// ------------------------------------------------------------
// MapLibre loader — sdílená knihovna s hlavní mapou (assets/map.js)
// ------------------------------------------------------------
let _mlLoadPromise = null;

function loadMapLibre() {
  if (window.maplibregl && window.maplibregl.Map) return Promise.resolve(window.maplibregl);
  if (_mlLoadPromise) return _mlLoadPromise;
  const sources = [
    { css: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css', js: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js' },
    { css: 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css', js: 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js' },
    { css: 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.css', js: 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.js' },
  ];
  _mlLoadPromise = (async () => {
    for (const src of sources) {
      try {
        if (!document.querySelector('link[data-ml-css]')) {
          const l = document.createElement('link');
          l.rel = 'stylesheet'; l.href = src.css; l.dataset.mlCss = '1';
          document.head.appendChild(l);
        }
        await new Promise((resolve, reject) => {
          const sc = document.createElement('script');
          sc.src = src.js; sc.onload = resolve; sc.onerror = () => reject(new Error('CDN nedostupné'));
          document.head.appendChild(sc);
          setTimeout(() => reject(new Error('Timeout')), 12000);
        });
        if (window.maplibregl && window.maplibregl.Map) return window.maplibregl;
      } catch (err) { console.warn('[geo] MapLibre CDN selhalo:', err.message); }
    }
    _mlLoadPromise = null;
    throw new Error('Knihovnu mapy se nepodařilo načíst z žádného CDN.');
  })();
  return _mlLoadPromise;
}

// ------------------------------------------------------------
// Place search
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
      if (it.address?.country === 'sk') metaParts.unshift('🇸🇰');
      else if (it.address?.country === 'cz') metaParts.unshift('🇨🇿');
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
// Map picker — MapLibre (stejný podklad jako hlavní mapa) + fallback na ruční zadání souřadnic
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
      <div class="map-picker-map" data-map-canvas>
        <div class="map-picker-loading" data-map-loading>
          <div class="map-picker-spinner"></div>
          <p>${escapeHtml(t('common.loading'))}…</p>
        </div>
      </div>
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

    requestAnimationFrame(() => modal.classList.add('is-open'));
    document.body.style.overflow = 'hidden';

    const canvasEl = modal.querySelector('[data-map-canvas]');
    const loadingEl = modal.querySelector('[data-map-loading]');
    const latlngEl = modal.querySelector('[data-map-latlng]');
    const addressEl = modal.querySelector('[data-map-address]');
    const searchInput = modal.querySelector('[data-map-search]');
    const suggestList = modal.querySelector('[data-map-suggest-list]');

    let map = null;
    let marker = null;
    let currentLat = initialLat;
    let currentLng = initialLng;
    let currentDetails = { place: '', city: '', district: '', region: '', country_code: '', display_name: '' };

    function makeMarkerEl() {
      const el = document.createElement('div');
      el.className = 'vandro-map-marker';
      el.innerHTML = '<div class="vandro-map-marker-pin"></div>';
      return el;
    }

    async function setMarker(lat, lng) {
      currentLat = lat;
      currentLng = lng;
      if (latlngEl) latlngEl.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      if (marker && map) marker.setLngLat([lng, lat]);
      else if (map && window.maplibregl) {
        marker = new window.maplibregl.Marker({ element: makeMarkerEl(), anchor: 'bottom', draggable: true })
          .setLngLat([lng, lat]).addTo(map);
        marker.on('dragend', async () => {
          const pos = marker.getLngLat();
          await setMarker(pos.lat, pos.lng);
        });
      }
      if (addressEl) addressEl.textContent = t('common.loading');
      const rev = await reverseGeocode(lat, lng);
      currentDetails = rev;
      if (addressEl) addressEl.textContent = rev.display_name || rev.place || '—';
    }

    // Fallback UI: ruční zadání souřadnic
    function showFallback(msg) {
      if (loadingEl) loadingEl.remove();
      canvasEl.innerHTML = `
        <div class="map-picker-error">
          <p style="font-weight:700;margin-bottom:8px;">⚠️ ${escapeHtml(t('errors.mapLoadFailed') || 'Mapu se nepodařilo načíst')}</p>
          <p style="font-size:12px;color:var(--c-text-muted);margin-bottom:12px;line-height:1.5;">${escapeHtml(msg)}</p>
          <p style="font-size:12.5px;font-weight:600;color:var(--c-text);margin-bottom:6px;">Zadej souřadnice ručně:</p>
          <div style="display:flex;flex-direction:column;gap:8px;max-width:280px;width:100%;">
            <input class="form-input" data-map-manual-lat placeholder="Latitude (např. 49.8175)" type="number" step="any" value="${currentLat.toFixed(5)}" />
            <input class="form-input" data-map-manual-lng placeholder="Longitude (např. 15.4730)" type="number" step="any" value="${currentLng.toFixed(5)}" />
            <button type="button" class="form-submit-btn" data-map-manual-apply style="margin-top:4px;">${escapeHtml(t('geo.pickLocation'))}</button>
          </div>
          <p style="font-size:11px;color:var(--c-text-muted);margin-top:14px;text-align:center;line-height:1.5;">
            Mapa se nepodařila načíst (blokátor reklam, firewall nebo výpadek CDN).<br>
            Můžeš pokračovat bez mapy — souřadnice zadej ručně, nebo vyhledej místo v poli výše.
          </p>
        </div>`;

      const applyBtn = canvasEl.querySelector('[data-map-manual-apply]');
      if (applyBtn) {
        applyBtn.addEventListener('click', async () => {
          const lat = parseFloat(canvasEl.querySelector('[data-map-manual-lat]').value);
          const lng = parseFloat(canvasEl.querySelector('[data-map-manual-lng]').value);
          if (isNaN(lat) || isNaN(lng)) return;
          currentLat = lat;
          currentLng = lng;
          if (latlngEl) latlngEl.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          if (addressEl) addressEl.textContent = t('common.loading');
          const rev = await reverseGeocode(lat, lng);
          currentDetails = rev;
          if (addressEl) addressEl.textContent = rev.display_name || rev.place || '—';
        });
      }
    }

    // Načti MapLibre
    loadMapLibre()
      .then((ml) => {
        if (!modal.parentNode) return;
        if (loadingEl) loadingEl.remove();

        map = new ml.Map({
          container: canvasEl,
          style: MAP_STYLE_URL,
          center: [initialLng, initialLat],
          zoom: Math.max(1, initialZoom - 1),
          attributionControl: false,
        });
        map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
        map.addControl(new ml.AttributionControl({ compact: true }), 'bottom-right');

        setMarker(initialLat, initialLng);

        map.on('click', (e) => {
          setMarker(e.lngLat.lat, e.lngLat.lng);
        });

        setTimeout(() => { if (map) map.resize(); }, 150);
        setTimeout(() => { if (map) map.resize(); }, 500);
      })
      .catch((err) => {
        console.error('[geo] map init failed:', err);
        showFallback(err.message || 'Neznámá chyba');
      });

    // Search v pickeru (funguje i bez mapy)
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
            // Pokud nemáme mapu, jen nastav souřadnice + adresu
            if (map) {
              setMarker(item.lat, item.lng);
              map.flyTo({ center: [item.lng, item.lat], zoom: 14 });
            } else {
              currentLat = item.lat;
              currentLng = item.lng;
              if (latlngEl) latlngEl.textContent = `${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}`;
              if (addressEl) addressEl.textContent = item.display_name || item.name || '';
              currentDetails = {
                place: item.name || item.display_name,
                display_name: item.display_name || item.name,
                city: item.address?.city || '',
                district: item.address?.district || '',
                region: item.address?.region || '',
                country_code: item.address?.country || '',
                lat: item.lat,
                lng: item.lng,
              };
            }
            suggestList.style.display = 'none';
            searchInput.value = item.name || item.display_name;
          });
        });
      }, 300);
    });

    function closeModal(result) {
      modal.classList.remove('is-open');
      setTimeout(() => {
        if (map) { try { map.remove(); } catch {} }
        modal.remove();
      }, 250);
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
// Auto-fill kraj/okres/obec z geocodéru
// ------------------------------------------------------------
async function fillRegionDistrictCityFromPlace(form, data) {
  if (!form || !data) return;

  const addr = data.address || {};
  const city = addr.city || data.city || data.name || '';
  const district = addr.district || data.district || '';
  const region = addr.region || data.region || '';

  const regionSelect = form.querySelector('select[name="region"]');
  const districtSelect = form.querySelector('select[name="district"]');
  const citySelect = form.querySelector('select[name="city"]');
  const cityInput = form.querySelector('input[name="city"]');

  if (regionSelect && region && typeof matchRegion === 'function') {
    const matchedRegion = matchRegion(region);
    if (matchedRegion) regionSelect.value = matchedRegion;
  }

  if (districtSelect && regionSelect?.value) {
    const districts = REGIONS[regionSelect.value] || [];
    districtSelect.innerHTML = `<option value="">${escapeHtml(t('auth.registerSelectDistrict'))}</option>${districts.map((d) => `<option value="${escapeAttr(d)}">${escapeHtml(d)}</option>`).join('')}`;

    if (district && typeof matchDistrict === 'function') {
      const matchedDistrict = matchDistrict(regionSelect.value, district);
      if (matchedDistrict) districtSelect.value = matchedDistrict;
    }
  }

  if (citySelect && districtSelect?.value && typeof loadCitiesForDistrict === 'function') {
    citySelect.innerHTML = `<option value="">${escapeHtml(t('auth.registerLoadingCities'))}</option>`;
    try {
      const cities = await loadCitiesForDistrict(districtSelect.value);
      if (cities.length > 0) {
        citySelect.innerHTML = `<option value="">${escapeHtml(t('auth.registerSelectCity'))}</option>` +
          cities.map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
        if (city) {
          const cityNorm = typeof normalizeStr === 'function' ? normalizeStr(city) : city.toLowerCase();
          const cMatch = cities.find((c) => {
            const cNorm = typeof normalizeStr === 'function' ? normalizeStr(c) : c.toLowerCase();
            return cNorm === cityNorm;
          });
          if (cMatch) {
            citySelect.value = cMatch;
          } else {
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

function setFormGeoData(form, data) {
  if (!form || !data) return;
  if (data.lat != null) form.dataset.geoLat = String(data.lat);
  if (data.lng != null) form.dataset.geoLng = String(data.lng);
  form.dataset.geoPlace = data.display_name || data.place || '';
  form.dataset.geoCountry = data.country_code || '';
}

async function applySelectedPlace(form, placeData) {
  if (!form || !placeData) return;

  const input = form.querySelector('[data-place-input]');
  const displayName = placeData.display_name || placeData.place || placeData.name || '';
  if (input && displayName) input.value = displayName;

  await fillRegionDistrictCityFromPlace(form, placeData);
  setFormGeoData(form, placeData);

  const hiddenLat = form.querySelector('[name="geo_lat"]');
  const hiddenLng = form.querySelector('[name="geo_lng"]');
  const hiddenPlace = form.querySelector('[name="geo_place"]');
  const hiddenCountry = form.querySelector('[name="country_code"]');
  if (hiddenLat) hiddenLat.value = String(placeData.lat ?? '');
  if (hiddenLng) hiddenLng.value = String(placeData.lng ?? '');
  if (hiddenPlace) hiddenPlace.value = displayName;
  if (hiddenCountry) hiddenCountry.value = placeData.country_code || '';

  const label = form.querySelector('[data-place-geo-label]');
  if (label) label.textContent = displayName ? `📍 ${displayName}` : '';
}

async function pickPlaceOnMap(buttonEl) {
  const form = buttonEl?.closest('form');
  if (!form) return;

  const initialLat = parseFloat(form.dataset.geoLat) || undefined;
  const initialLng = parseFloat(form.dataset.geoLng) || undefined;

  const result = await openMapPicker({
    title: t('geo.pickOnMap'),
    lat: initialLat,
    lng: initialLng,
  });
  if (!result) return;

  await applySelectedPlace(form, result);
}

function bindAllPlaceInputs(root = document) {
  root.querySelectorAll('[data-place-input]').forEach((input) => {
    if (input.dataset.placeBound === '1') return;
    input.dataset.placeBound = '1';

    const form = input.closest('form');

    attachPlaceSearch(input, {
      onSelect: async (item) => {
        if (!form) return;
        await applySelectedPlace(form, {
          address: item.address || {},
          name: item.name,
          display_name: item.display_name,
          place: item.name || item.display_name,
          lat: item.lat,
          lng: item.lng,
          country_code: item.address?.country || '',
        });
      },
    });
  });
}

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


