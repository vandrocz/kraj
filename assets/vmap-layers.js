/* ============================================================
   VANDRO mapa — vrstvy: VANDRO místa, atrakce, ubytování, gastro, události
   Data: GET {API}/api/map/points (viz vandro-worker/src/routes/map.js)
   Každá vrstva: vlastní ikony (SVG glyfy), zapnutí/vypnutí, filtr podkategorií,
   minimální zoom, uložení nastavení do localStorage.
   Načítá se po vmap-icons.js a vmap.js (funkce se volají přes hooky ve vmap.js).
   ============================================================ */

const VM_LAYER_DEFS = [
  { key: 'vandro',        label: 'VANDRO místa', color: '#1B8F52', glyph: 'pin',      minzoom: 7,  hint: 'Naše vybraná místa z cest' },
  { key: 'organizations', label: 'Atrakce',      color: '#6741D9', glyph: 'castle',   minzoom: 8,  hint: 'Hrady, zámky, muzea a další cíle' },
  { key: 'accommodation', label: 'Ubytování',    color: '#1C7ED6', glyph: 'bed',      minzoom: 10, hint: 'Hotely, penziony, chaty, kempy' },
  { key: 'restaurants',   label: 'Gastro',       color: '#E03131', glyph: 'utensils', minzoom: 11, hint: 'Restaurace, kavárny, pivnice' },
  { key: 'events',        label: 'Události',     color: '#C2255C', glyph: 'calendar', minzoom: 8,  hint: 'Nadcházející akce' },
];
const VM_BIZ_KEYS = ['organizations', 'accommodation', 'restaurants', 'events'];
const VM_BIZ_LAYER_IDS = VM_BIZ_KEYS.map(k => 'vm-lyr-' + k);
const VM_LAYERS_LS = 'vmap_layers_v1';
const VM_BIZ_LS = 'vmap_biz_v1';
const VM_KIND_LABEL = { organizations: 'Atrakce', accommodation: 'Ubytování', restaurants: 'Gastro', events: 'Událost' };

let _vmBizData = { organizations: [], accommodation: [], restaurants: [], events: [] };
let _vmLayerState = null;
let _vmBizFetchedAt = 0;
let _vmBizFetching = false;
let _vmPanelSubs = {};
const _vmPlaceCache = new Map();

/* ---------- pomocné ---------- */
function _vmApiBase() {
  try { if (typeof API_BASE_URL === 'string' && API_BASE_URL) return API_BASE_URL; } catch (e) {}
  return 'https://api.vandro.cz';
}
function _vmEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _vmClean(s) { return String(s == null ? '' : s).replace(/[<>]/g, '').trim(); }
function _vmDef(key) { return VM_LAYER_DEFS.find(d => d.key === key); }

function _vmTypeLabel(kind, type) {
  if (!type) return '';
  try { if (typeof tType === 'function') { const l = tType(type); if (l) return l; } } catch (e) {}
  return String(type).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}
function _vmGlyphForBiz(kind, type, label) {
  const def = _vmDef(kind);
  const g = vmGlyphFor((type || '') + ' ' + (label || ''));
  if (g && g !== 'pin') return g;
  const g2 = vmGlyphFor(label || '');
  return (g2 && g2 !== 'pin') ? g2 : def.glyph;
}

/* ---------- stav vrstev (localStorage) ---------- */
function _vmLoadState() {
  if (_vmLayerState) return _vmLayerState;
  let st = {};
  try { st = JSON.parse(localStorage.getItem(VM_LAYERS_LS) || '{}') || {}; } catch (e) { st = {}; }
  VM_LAYER_DEFS.forEach(d => {
    const s = st[d.key] || {};
    st[d.key] = { on: s.on !== false, off: Array.isArray(s.off) ? s.off.slice() : [] };
  });
  _vmLayerState = st;
  return st;
}
function _vmSaveState() { try { localStorage.setItem(VM_LAYERS_LS, JSON.stringify(_vmLayerState)); } catch (e) {} }
function vmLayerState(key) { return _vmLoadState()[key] || { on: true, off: [] }; }

/* ---------- podkategorie ---------- */
function _vmEventBucket(startAt) {
  const t = Date.parse(String(startAt || '').replace(' ', 'T'));
  if (isNaN(t)) return 'later';
  const days = (t - Date.now()) / 86400000;
  if (days <= 7) return 'week';
  if (days <= 31) return 'month';
  return 'later';
}
const VM_EVENT_BUCKETS = { week: 'Tento týden', month: 'Do měsíce', later: 'Později' };

function _vmSubKey(key, item) {
  if (key === 'events') return _vmEventBucket(item.start_at);
  return item.type || 'jine';
}
function _vmSubLabel(key, sub) {
  if (key === 'events') return VM_EVENT_BUCKETS[sub] || sub;
  return _vmTypeLabel(key, sub);
}

function _vmCollectSubs(key) {
  const counts = new Map();
  if (key === 'vandro') {
    (typeof allPlaces !== 'undefined' ? allPlaces : []).forEach(p => {
      const k = p.podkategoria || p.kategoria;
      if (k) counts.set(k, (counts.get(k) || 0) + 1);
    });
  } else {
    (_vmBizData[key] || []).forEach(it => {
      const k = _vmSubKey(key, it);
      counts.set(k, (counts.get(k) || 0) + 1);
    });
  }
  let arr = Array.from(counts, ([sub, n]) => ({ sub, n, label: key === 'vandro' ? sub : _vmSubLabel(key, sub) }));
  if (key === 'events') {
    const order = ['week', 'month', 'later'];
    arr.sort((a, b) => order.indexOf(a.sub) - order.indexOf(b.sub));
  } else {
    arr.sort((a, b) => b.n - a.n || String(a.label).localeCompare(String(b.label), 'cs'));
  }
  return arr;
}

/* ---------- place-like objekty (aby fungoval detailní panel, hledání, okolí) ---------- */
function _vmFmtDate(s) {
  const t = new Date(String(s || '').replace(' ', 'T'));
  if (isNaN(t)) return '';
  const hasTime = t.getHours() !== 0 || t.getMinutes() !== 0;
  try {
    return t.toLocaleString('cs-CZ', Object.assign({ day: 'numeric', month: 'numeric', year: 'numeric' }, hasTime ? { hour: '2-digit', minute: '2-digit' } : {}));
  } catch (e) { return String(s); }
}
function _vmRow(ico, lbl, val) {
  return val ? `<li><i class="${ico}"></i><span><strong>${lbl}:</strong> ${val}</span></li>` : '';
}
function _vmIconFor(key, item) {
  const def = _vmDef(key);
  if (key === 'events') return vmIconId(def.color, 'calendar');
  const label = _vmTypeLabel(key, item.type);
  return vmIconId(def.color, _vmGlyphForBiz(key, item.type, label));
}

function _vmToPlace(key, item) {
  const ck = key + ':' + item.id;
  const hit = _vmPlaceCache.get(ck);
  if (hit && hit._src === item) return hit;
  const def = _vmDef(key);
  let p;
  if (key === 'events') {
    const org = _vmClean(item.business_name);
    const rows = [
      _vmRow('fas fa-calendar-day', 'Termín', _vmEsc(_vmFmtDate(item.start_at)) + (item.end_at ? ' – ' + _vmEsc(_vmFmtDate(item.end_at)) : '')),
      _vmRow('fas fa-location-dot', 'Místo', _vmEsc([item.location, item.city].filter(Boolean).join(', '))),
      _vmRow('fas fa-user', 'Pořadatel', _vmEsc(org)),
    ].join('');
    p = {
      nazov: _vmClean(item.title) || 'Událost', kategoria: 'Událost', podkategoria: VM_EVENT_BUCKETS[_vmEventBucket(item.start_at)],
      lat: item.lat, lng: item.lng, foto_main: item.cover || '', galeria: [],
      _vm_rowsHtml: rows,
    };
  } else {
    const label = _vmTypeLabel(key, item.type);
    const rows = [
      _vmRow('fas fa-location-dot', 'Obec', _vmEsc([item.city, item.district, item.region].filter((v, i, a) => v && a.indexOf(v) === i).join(', '))),
      item.cuisine ? _vmRow('fas fa-utensils', 'Kuchyně', _vmEsc(_vmTypeLabel(key, item.cuisine))) : '',
      item.price ? _vmRow('fas fa-coins', 'Cenová hladina', _vmEsc(item.price)) : '',
      item.verified ? '<li><i class="fas fa-circle-check"></i><span><strong>Ověřený profil na Vandro</strong></span></li>' : '',
    ].join('');
    p = {
      nazov: _vmClean(item.name) || def.label, kategoria: def.label, podkategoria: label,
      lat: item.lat, lng: item.lng, foto_main: item.cover || item.logo || '', galeria: [],
      addr_street: item.address || '', addr_city: '',
      _vm_rowsHtml: rows,
    };
  }
  p._vm_kind = key; p._vm_id = item.id; p._src = item;
  p._icon_id = _vmIconFor(key, item);
  p._vm_sub = _vmSubKey(key, item);
  _vmPlaceCache.set(ck, p);
  return p;
}

function _vmItemVisible(key, item) {
  const st = vmLayerState(key);
  if (!st.on) return false;
  return !st.off.includes(_vmSubKey(key, item));
}

function vmBizPlacesAll() {
  const out = [];
  VM_BIZ_KEYS.forEach(k => (_vmBizData[k] || []).forEach(it => { if (_vmItemVisible(k, it)) out.push(_vmToPlace(k, it)); }));
  return out;
}
function vmBizSearch(val) {
  val = String(val || '').toLowerCase().trim();
  if (val.length < 2) return [];
  const out = [];
  VM_BIZ_KEYS.forEach(k => {
    if (!vmLayerState(k).on) return;
    (_vmBizData[k] || []).forEach(it => {
      if (out.length >= 40) return;
      const hay = [it.name, it.title, it.city, k === 'events' ? '' : _vmTypeLabel(k, it.type)].join(' ').toLowerCase();
      if (hay.includes(val) && _vmItemVisible(k, it)) out.push(_vmToPlace(k, it));
    });
  });
  return out.slice(0, 12);
}
function vmFindBizPlace(p) {
  if (!p) return null;
  if (p._vm_kind && p._vm_id) {
    const it = (_vmBizData[p._vm_kind] || []).find(x => x.id === p._vm_id);
    if (it) return _vmToPlace(p._vm_kind, it);
  }
  const lat = +p.lat, lng = +p.lng;
  if (!isFinite(lat) || !isFinite(lng)) return null;
  const name = String(p.nazov || p.name || '').trim().toLowerCase();
  if (!name) return null;
  for (const k of VM_BIZ_KEYS) {
    const it = (_vmBizData[k] || []).find(x => Math.abs(x.lat - lat) < 0.0003 && Math.abs(x.lng - lng) < 0.0003
      && String(x.name || x.title || '').trim().toLowerCase() === name);
    if (it) return _vmToPlace(k, it);
  }
  return null;
}

/* ---------- akce v detailu ---------- */
function vmPlaceActionsHtml(p) {
  if (!p || !p._vm_kind) return '';
  const k = p._vm_kind, id = String(p._vm_id || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!id) return '';
  if (k === 'events') {
    return `<button onclick="vmOpenEvent('${id}')" class="btn-share vm-open-btn"><i class="fa-solid fa-calendar-day"></i> Detail události</button>`;
  }
  return `<button onclick="vmOpenBizProfile('${k}','${id}')" class="btn-share vm-open-btn"><i class="fa-solid fa-circle-info"></i> Profil na Vandro</button>`;
}
function vmOpenBizProfile(kind, id) {
  try {
    if (typeof openProfile === 'function') { openProfile(kind, id); return; }
  } catch (e) { console.warn('openProfile', e); }
  location.href = '/';
}
function vmOpenEvent(id) {
  try {
    if (typeof openEventDetail === 'function') { openEventDetail(id); return; }
  } catch (e) { console.warn('openEventDetail', e); }
  location.href = '/';
}

/* ---------- mapové vrstvy ---------- */
function _vmFeatureCollection(key) {
  const feats = [];
  (_vmBizData[key] || []).forEach(it => {
    if (!isFinite(it.lat) || !isFinite(it.lng)) return;
    const sub = _vmSubKey(key, it);
    const name = _vmClean(key === 'events' ? it.title : it.name);
    const prio = 10 - (it.verified ? 4 : 0) - ((it.logo || it.cover) ? 2 : 0) + ((it.lat * 1000 + it.lng * 1000) % 1) * 0.5;
    feats.push({
      type: 'Feature', geometry: { type: 'Point', coordinates: [it.lng, it.lat] },
      properties: { id: it.id, kind: key, name, sub, icon: _vmIconFor(key, it), sk: prio },
    });
  });
  return { type: 'FeatureCollection', features: feats };
}

function _vmFilterFor(key) {
  const off = vmLayerState(key).off;
  if (!off.length) return null;
  return ['!', ['in', ['get', 'sub'], ['literal', off]]];
}

function _vmApplyLayer(key) {
  if (typeof map === 'undefined' || !map) return;
  const id = 'vm-lyr-' + key;
  if (!map.getLayer(id)) return;
  const st = vmLayerState(key);
  try { map.setLayoutProperty(id, 'visibility', st.on ? 'visible' : 'none'); } catch (e) {}
  try { map.setFilter(id, _vmFilterFor(key)); } catch (e) {}
}

function vmBizReinit() {
  if (typeof map === 'undefined' || !map) return;
  VM_BIZ_KEYS.forEach(key => {
    const def = _vmDef(key);
    const srcId = 'vm-src-' + key, lyrId = 'vm-lyr-' + key;
    try {
      if (!map.getSource(srcId)) map.addSource(srcId, { type: 'geojson', data: _vmFeatureCollection(key) });
      else map.getSource(srcId).setData(_vmFeatureCollection(key));
      if (!map.getLayer(lyrId)) {
        map.addLayer({
          id: lyrId, type: 'symbol', source: srcId, minzoom: def.minzoom,
          layout: {
            'icon-image': ['get', 'icon'],
            'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 12, 0.72, 16, 0.95],
            'icon-allow-overlap': false, 'icon-ignore-placement': false, 'icon-padding': 2,
            'symbol-sort-key': ['get', 'sk'],
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Regular'],
            'text-size': ['step', ['zoom'], 0, 13.5, 11],
            'text-anchor': 'top', 'text-offset': [0, 1.1], 'text-max-width': 8, 'text-optional': true,
          },
          paint: {
            'text-color': '#222', 'text-halo-color': 'rgba(255,255,255,0.95)', 'text-halo-width': 1.6,
          },
        });
      }
      _vmApplyLayer(key);
    } catch (e) { console.warn('vmBizReinit', key, e); }
  });
}

function _vmRefreshSources() {
  if (typeof map === 'undefined' || !map) return;
  VM_BIZ_KEYS.forEach(key => {
    const s = map.getSource('vm-src-' + key);
    if (s) { try { s.setData(_vmFeatureCollection(key)); } catch (e) {} }
  });
}

/* ---------- načtení dat ---------- */
function _vmSetData(d) {
  VM_BIZ_KEYS.forEach(k => { _vmBizData[k] = Array.isArray(d && d[k]) ? d[k].filter(x => x && isFinite(x.lat) && isFinite(x.lng)) : (_vmBizData[k] || []); });
  _vmPlaceCache.clear();
}
async function _vmFetchBiz() {
  if (_vmBizFetching) return;
  _vmBizFetching = true;
  try {
    const r = await fetch(_vmApiBase() + '/api/map/points', { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    _vmSetData(d);
    _vmBizFetchedAt = Date.now();
    try { localStorage.setItem(VM_BIZ_LS, JSON.stringify({ t: _vmBizFetchedAt, d })); } catch (e) {}
    _vmRefreshSources();
    vmLayersChanged('data');
  } catch (e) {
    console.warn('vmap: vrstvy se nepodařilo načíst:', e.message || e);
  } finally { _vmBizFetching = false; }
}
function vmBizStart() {
  try {
    const c = JSON.parse(localStorage.getItem(VM_BIZ_LS) || 'null');
    if (c && c.d) { _vmSetData(c.d); _vmBizFetchedAt = c.t || 0; _vmRefreshSources(); }
  } catch (e) {}
  vmBizReinit();
  if (navigator.onLine !== false) _vmFetchBiz();
}
// volá map.js při každém zobrazení mapy
function vmBizRefreshIfStale() {
  if (Date.now() - _vmBizFetchedAt > 5 * 60 * 1000 && navigator.onLine !== false) _vmFetchBiz();
}

/* ---------- klik na bod ---------- */
function vmHandleBizClick(e) {
  if (typeof map === 'undefined' || !map) return false;
  const layers = VM_BIZ_LAYER_IDS.filter(id => map.getLayer(id));
  if (!layers.length) return false;
  const pad = window.innerWidth <= 768 ? 14 : 6;
  const feats = map.queryRenderedFeatures([[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]], { layers });
  if (!feats.length) return false;
  const f = feats[0];
  const key = f.properties.kind, id = f.properties.id;
  const it = (_vmBizData[key] || []).find(x => String(x.id) === String(id));
  if (!it) return false;
  showPlaceDetail(_vmToPlace(key, it));
  return true;
}

/* ---------- změny stavu ---------- */
function vmLayersChanged(reason) {
  if (reason === 'data') _vmPlaceCache.clear();
  VM_BIZ_KEYS.forEach(_vmApplyLayer);
  try {
    if (typeof allPlaces !== 'undefined' && typeof map !== 'undefined' && map && map.getSource && map.getSource('places')) {
      renderPlacesLayer(_vandroVisiblePlaces());
    }
  } catch (e) { console.warn('vmLayersChanged/vandro', e); }
  vmRenderLayersPanel();
}

/* ---------- panel „Vrstvy" ---------- */
function _vmPanelHtml() {
  _vmPanelSubs = {};
  const zoom = (typeof map !== 'undefined' && map) ? map.getZoom() : 0;
  const body = VM_LAYER_DEFS.map(def => {
    const st = vmLayerState(def.key);
    const subs = _vmCollectSubs(def.key);
    _vmPanelSubs[def.key] = subs;
    const total = subs.reduce((a, s) => a + s.n, 0);
    const hidden = zoom && zoom < def.minzoom && st.on;
    const meta = `${total} ${total === 1 ? 'místo' : (total >= 2 && total <= 4 ? 'místa' : 'míst')}` + (hidden ? ` · zobrazí se od přiblížení ${def.minzoom}` : '');
    const chips = (st.on && subs.length > 1) ? `
      <div class="vl-subs">
        <div class="vl-sub-actions">
          <button type="button" data-vm-all="${def.key}">Vše</button>
          <button type="button" data-vm-none="${def.key}">Nic</button>
        </div>
        <div class="vl-chips">${subs.map((s, i) => {
          const on = !st.off.includes(s.sub);
          const glyph = def.key === 'events' ? 'calendar' : (def.key === 'vandro' ? vmGlyphFor(s.sub) : _vmGlyphForBiz(def.key, s.sub, s.label));
          return `<button type="button" class="vl-chip${on ? ' on' : ''}" style="--c:${def.color}" data-vm-sub="${def.key}" data-i="${i}" aria-pressed="${on}">${vmIconSvg(glyph, { size: '14px' })}<span>${_vmEsc(s.label)}</span><em>${s.n}</em></button>`;
        }).join('')}</div>
      </div>` : '';
    return `
    <section class="vl-layer${st.on ? '' : ' is-off'}">
      <div class="vl-head">
        <span class="vl-ico" style="background:${def.color}">${vmIconSvg(def.glyph, { size: '18px' })}</span>
        <div class="vl-title"><strong>${_vmEsc(def.label)}</strong><small>${_vmEsc(meta)}</small></div>
        <label class="vl-switch" title="${st.on ? 'Skrýt' : 'Zobrazit'} vrstvu ${_vmEsc(def.label)}">
          <input type="checkbox" data-vm-toggle="${def.key}" ${st.on ? 'checked' : ''} aria-label="${_vmEsc(def.label)}"><span></span>
        </label>
      </div>
      ${chips}
    </section>`;
  }).join('');
  return `<p class="vl-intro">Vyberte, co se má na mapě zobrazovat. Ikony se objevují postupně podle přiblížení.</p>${body}`;
}

function vmRenderLayersPanel() {
  const els = document.querySelectorAll('#vmap-root .vl-body');
  if (!els.length) return;
  const html = _vmPanelHtml();
  els.forEach(el => { const top = el.parentElement ? el.parentElement.scrollTop : 0; el.innerHTML = html; if (el.parentElement) el.parentElement.scrollTop = top; });
}

function vmOpenLayersPanelDesktop() {
  closeAllPanels();
  openSidebar(`<div class="sidebar-header"><h3><i class="fa-solid fa-layer-group" style="color:var(--primary);margin-right:8px"></i>Vrstvy mapy</h3><button class="btn-close" onclick="closeDesktopPanels()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="panel-content"><div class="vl-body"></div></div>`);
  vmRenderLayersPanel();
}
function vmOpenLayersPanelMobile() {
  const placeSheet = document.getElementById('mobile-bottom-sheet');
  if (placeSheet) { placeSheet.classList.remove('sheet-preview-only', 'sheet-expanded'); placeSheet.classList.add('sheet-hidden'); }
  const rs = document.getElementById('mobile-route-sheet');
  if (rs) { rs.classList.remove('sheet-preview-only', 'sheet-expanded'); rs.classList.add('sheet-hidden'); }
  closeMobilePanels();
  const pnl = document.getElementById('layers-panel-mobile');
  if (pnl) pnl.classList.remove('hidden');
  vmRenderLayersPanel();
}

function vmLayersInit() {
  _vmLoadState();
  const root = document.getElementById('vmap-root');
  if (!root || root.__vlBound) return;
  root.__vlBound = true;
  const bd = document.getElementById('btn-layers');
  if (bd) bd.addEventListener('click', vmOpenLayersPanelDesktop);
  const bm = document.getElementById('btn-layers-mobile');
  if (bm) bm.addEventListener('click', vmOpenLayersPanelMobile);

  root.addEventListener('change', ev => {
    const t = ev.target.closest && ev.target.closest('[data-vm-toggle]');
    if (!t) return;
    _vmLoadState()[t.dataset.vmToggle].on = !!t.checked;
    _vmSaveState();
    vmLayersChanged('toggle');
  });
  root.addEventListener('click', ev => {
    const chip = ev.target.closest && ev.target.closest('[data-vm-sub]');
    if (chip) {
      const key = chip.dataset.vmSub, s = (_vmPanelSubs[key] || [])[+chip.dataset.i];
      if (!s) return;
      const st = _vmLoadState()[key], ix = st.off.indexOf(s.sub);
      if (ix >= 0) st.off.splice(ix, 1); else st.off.push(s.sub);
      _vmSaveState(); vmLayersChanged('sub'); return;
    }
    const all = ev.target.closest && ev.target.closest('[data-vm-all]');
    if (all) { _vmLoadState()[all.dataset.vmAll].off = []; _vmSaveState(); vmLayersChanged('sub'); return; }
    const none = ev.target.closest && ev.target.closest('[data-vm-none]');
    if (none) {
      const key = none.dataset.vmNone;
      _vmLoadState()[key].off = (_vmPanelSubs[key] || []).map(s => s.sub);
      _vmSaveState(); vmLayersChanged('sub');
    }
  });
  // změna zoomu → aktualizovat hint „zobrazí se od přiblížení"
  try {
    let tm = null;
    map.on('zoomend', () => { clearTimeout(tm); tm = setTimeout(() => { if (document.querySelector('#vmap-root .vl-body')) vmRenderLayersPanel(); }, 150); });
  } catch (e) {}
}
