// ============================================================
// SEKCE 2: MAPA VÝLETŮ — sloučená mapa (dříve maps.vandro.cz v iframe)
// ============================================================
// Mapa žije v trvalém prvku #vmap-root přímo v <body> (ne v #root, který
// renderApp() při každé změně přepisuje). Díky tomu se nikdy nenačítá znovu
// a zachovává pozici i vrstvy. renderMapPage() vrací jen prázdný slot;
// app.js volá vmapShow() / vmapHide() podle aktivní záložky.
//
// Knihovny (MapLibre, PapaParse, …) a skripty mapy se stahují líně až při
// prvním otevření záložky Mapa, takže ostatní části webu nezpomalují.

const VMAP_BUILD = '1';
const VMAP_LIBS = {
  css: [
    'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
    'https://cdn.jsdelivr.net/npm/glightbox/dist/css/glightbox.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'assets/vmap.css?v=' + VMAP_BUILD,
  ],
  // pořadí = pořadí spuštění
  js: [
    'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
    'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
    'https://cdn.jsdelivr.net/npm/glightbox/dist/js/glightbox.min.js',
    'https://unpkg.com/pmtiles@3.2.0/dist/pmtiles.js',
    'https://unpkg.com/maplibre-contour@0.0.6/dist/index.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  ],
  // volitelné — když selžou, mapa běží dál
  optional: ['pmtiles.js', 'index.min.js', 'jspdf.umd.min.js', 'glightbox.min.js'],
  own: [
    'assets/vmap-icons.js?v=' + VMAP_BUILD,
    'assets/vmap.js?v=' + VMAP_BUILD,
    'assets/vmap-layers.js?v=' + VMAP_BUILD,
  ],
};

let _vmapState = 'idle';       // idle | loading | ready | error
let _vmapPromise = null;
let _vmapWanted = false;

function renderMapPage() {
  return '<div class="vmap-slot" aria-hidden="true"></div>';
}

function _vmapLoadCss(href) {
  return new Promise((resolve) => {
    if (document.querySelector('link[data-vmap="' + href + '"]')) return resolve();
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.dataset.vmap = href;
    l.onload = () => resolve(); l.onerror = () => resolve(); // CSS nesmí blokovat
    document.head.appendChild(l);
  });
}
function _vmapLoadJs(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = false;
    s.onload = () => resolve(); s.onerror = () => reject(new Error('Nepodařilo se načíst ' + src));
    document.head.appendChild(s);
  });
}

function _vmapEnsureRoot() {
  let root = document.getElementById('vmap-root');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'vmap-root';
  root.innerHTML = VMAP_TEMPLATE;
  document.body.appendChild(root);
  return root;
}

function _vmapShowError(msg) {
  const root = _vmapEnsureRoot();
  root.querySelector('.vm-error')?.remove();
  const e = document.createElement('div');
  e.className = 'vm-error';
  e.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><p>' + escapeHtml(msg || 'Mapu se nepodařilo načíst.') + '</p><button type="button">Zkusit znovu</button>';
  e.querySelector('button').addEventListener('click', () => { e.remove(); _vmapState = 'idle'; _vmapPromise = null; vmapShow(); });
  root.appendChild(e);
}

async function _vmapBoot() {
  if (_vmapState === 'ready') return;
  if (_vmapPromise) return _vmapPromise;
  _vmapState = 'loading';
  window.VMAP_BUILD = VMAP_BUILD;
  _vmapPromise = (async () => {
    _vmapEnsureRoot().classList.add('is-active'); // musí mít velikost, než vznikne MapLibre
    await Promise.all(VMAP_LIBS.css.map(_vmapLoadCss));
    for (const src of VMAP_LIBS.js) {
      try { await _vmapLoadJs(src); }
      catch (err) {
        if (VMAP_LIBS.optional.some((o) => src.includes(o))) console.warn(err.message);
        else throw err;
      }
    }
    for (const src of VMAP_LIBS.own) await _vmapLoadJs(src);
    if (typeof window.vmapInit !== 'function') throw new Error('Mapa není dostupná.');
    window.vmapInit();
    _vmapState = 'ready';
    _vmapObserveSheet();
  })().catch((err) => {
    console.error('[vmap]', err);
    _vmapState = 'error'; _vmapPromise = null;
    _vmapShowError('Mapu se nepodařilo načíst. Zkontrolujte připojení a zkuste to znovu.');
  });
  return _vmapPromise;
}

// Na mobilu: když je otevřený spodní panel (detail místa nebo panel Vrstvy/Trasa/Podklady),
// schovat sbalenou navigaci, aby nepřekrývala obsah
function _vmapSheetOpen() {
  const root = document.getElementById('vmap-root');
  if (!root || !root.classList.contains('is-active')) return false;
  const sheet = document.getElementById('mobile-bottom-sheet');
  if (sheet && !sheet.classList.contains('sheet-hidden')) return true;
  const rs = document.getElementById('mobile-route-sheet');
  if (rs && !rs.classList.contains('sheet-hidden')) return true;
  return !!root.querySelector('.mobile-panel:not(.hidden)');
}
function _vmapUpdateSheetClass() {
  document.body.classList.toggle('vm-sheet-open', _vmapSheetOpen());
}
function _vmapObserveSheet() {
  const root = document.getElementById('vmap-root');
  if (!root || root.__vmObs) return;
  root.__vmObs = true;
  new MutationObserver(_vmapUpdateSheetClass).observe(root, { attributes: true, attributeFilter: ['class'], subtree: true });
  _vmapUpdateSheetClass();
}

function vmapShow() {
  _vmapWanted = true;
  const root = _vmapEnsureRoot();
  const wasActive = root.classList.contains('is-active');
  root.classList.add('is-active');
  document.body.classList.add('vmap-open');
  if (_vmapState === 'idle' || _vmapState === 'error') { _vmapBoot(); return; }
  if (_vmapState === 'ready') {
    if (!wasActive) {
      try { if (typeof map !== 'undefined' && map) map.resize(); } catch (e) {}
      try { if (typeof vmBizRefreshIfStale === 'function') vmBizRefreshIfStale(); } catch (e) {}
    }
    _vmapObserveSheet();
    _vmapUpdateSheetClass();
  }
}

function vmapHide() {
  _vmapWanted = false;
  document.getElementById('vmap-root')?.classList.remove('is-active');
  document.body.classList.remove('vmap-open', 'vm-sheet-open');
}

// Pokud je načtena jen část a záložka se mezitím změnila, nenechat mapu viset
window.addEventListener('resize', () => {
  if (_vmapState === 'ready' && _vmapWanted) { try { if (typeof map !== 'undefined' && map) map.resize(); } catch (e) {} }
});

const VMAP_TEMPLATE = `

<div class="panel-backdrop" id="panel-backdrop"></div>

<div class="bm-modal-backdrop hidden" id="bm-modal-backdrop">
  <div class="bm-modal-box" id="bm-modal-box"></div>
</div>

<div class="top-ui-bar-desktop" id="top-ui-bar">
  <div class="left-controls">
    <button id="btn-about" class="control-btn icon-only" title="Vandro"><i class="fa-solid fa-compass"></i></button>
    <a href="https://maps.vandro.cz/mista/" target="_blank" rel="noopener" id="btn-places-list-desktop" class="control-btn icon-only" title="Seznam všech míst"><i class="fa-solid fa-list"></i></a>
    <button id="btn-search-desktop" class="control-btn"><i class="fa-solid fa-magnifying-glass"></i><span>Hledat</span></button>
    <button id="btn-route-desktop" class="control-btn"><i class="fa-solid fa-route"></i><span>Trasa</span></button>
    <button id="btn-nearby-desktop" class="control-btn"><i class="fa-solid fa-map-location-dot"></i><span>Místa v okolí</span></button>
  </div>
  <div class="right-controls">
    <button id="btn-basemap" class="control-btn"><i class="fa-solid fa-map"></i><span>Podklady</span></button>
    <button id="btn-layers" class="control-btn"><i class="fa-solid fa-layer-group"></i><span>Vrstvy</span></button>
    <button id="btn-locate-desktop" class="control-btn icon-only" title="Moje poloha"><i class="fa-solid fa-location-crosshairs"></i></button>
    <button id="btn-zoom-in" class="control-btn icon-only" title="Přiblížit"><i class="fa-solid fa-plus"></i></button>
    <button id="btn-zoom-out" class="control-btn icon-only" title="Oddálit"><i class="fa-solid fa-minus"></i></button>
    <button id="btn-north" class="control-btn icon-only compass-btn" title="Otočit na sever">
      <svg class="compass-needle" viewBox="0 0 24 24" width="22" height="22">
        <path d="M12 2 L15 12 L12 10 L9 12 Z" fill="#2b8a3e"/>
        <path d="M12 22 L15 12 L12 14 L9 12 Z" fill="#bbb"/>
        <circle cx="12" cy="12" r="2" fill="#333"/>
      </svg>
    </button>
  </div>
</div>

<div class="top-ui-bar-mobile">
  <a href="https://maps.vandro.cz/mista/" target="_blank" rel="noopener" id="btn-places-list-mobile" class="mobile-search-side-btn" title="Seznam všech míst" aria-label="Seznam všech míst"><i class="fa-solid fa-list"></i></a>
  <div class="search-container-mobile">
    <i class="fa-solid fa-magnifying-glass search-icon"></i>
    <input type="text" id="search-input" placeholder="Hledat místo...">
    <div id="search-results" class="search-results hidden"></div>
  </div>
</div>

<div class="mobile-controls">
  <button id="btn-north-mobile" class="mobile-control-btn compass-btn" title="Otočit na sever">
    <svg class="compass-needle" viewBox="0 0 24 24" width="22" height="22">
      <path d="M12 2 L15 12 L12 10 L9 12 Z" fill="#2b8a3e"/>
      <path d="M12 22 L15 12 L12 14 L9 12 Z" fill="#bbb"/>
      <circle cx="12" cy="12" r="2" fill="#333"/>
    </svg>
  </button>
  <button id="btn-locate-mobile" class="mobile-control-btn" title="Moje poloha"><i class="fa-solid fa-location-crosshairs"></i></button>
  <button id="btn-route-mobile" class="mobile-control-btn" title="Trasa"><i class="fa-solid fa-route"></i></button>
  <button id="btn-nearby-mobile" class="mobile-control-btn" title="Místa v okolí"><i class="fa-solid fa-map-location-dot"></i></button>
  <button id="btn-layers-mobile" class="mobile-control-btn" title="Vrstvy"><i class="fa-solid fa-layer-group"></i></button>
  <button id="btn-basemap-mobile" class="mobile-control-btn" title="Podklady"><i class="fa-solid fa-map"></i></button>
  <button id="btn-zoom-in-mobile" class="mobile-control-btn mobile-zoom-btn" title="Přiblížit"><i class="fa-solid fa-plus"></i></button>
  <button id="btn-zoom-out-mobile" class="mobile-control-btn mobile-zoom-btn" title="Oddálit"><i class="fa-solid fa-minus"></i></button>
  <button id="btn-about-mobile" class="mobile-control-btn" title="Vandro"><i class="fa-solid fa-compass"></i></button>

  <div id="route-panel-mobile" class="mobile-panel hidden">
    <div class="mobile-panel-header">
      <h4>Plán trasy</h4>
      <button class="mobile-panel-close" onclick="document.getElementById('route-panel-mobile').classList.add('hidden')"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="rt-add-row" style="margin-bottom:10px">
      <button class="rt-add-btn" onclick="addGpsAsWaypoint()" style="font-size:13px"><i class="fa-solid fa-location-crosshairs"></i> GPS</button>
    </div>
    <select id="route-type-mobile" class="mobile-select">
      <option value="car">Auto</option>
      <option value="foot">Pěšky</option>
      <option value="bike">Cyklistika</option>
    </select>
    <input type="text" id="route-search-mobile" class="mobile-input" placeholder="Hledat bod...">
    <div id="route-search-results-mobile" class="search-results hidden" style="margin-top:8px;max-height:160px;"></div>
    <div id="route-waypoints-mobile" style="margin-top:8px;max-height:100px;overflow-y:auto;"></div>
    <div id="route-info-mobile" style="margin-top:6px;font-size:12px;color:#666;"></div>
    <button id="btn-route-start-mobile" class="mobile-action-btn primary"><i class="fa-solid fa-map-pin"></i> Vybrat bod na mapě</button>
    <button id="btn-route-clear-mobile" class="mobile-action-btn danger">Smazat trasu</button>
  </div>

  <div id="layers-panel-mobile" class="mobile-panel hidden">
    <div class="mobile-panel-header">
      <h4>Vrstvy mapy</h4>
      <button class="mobile-panel-close" onclick="document.getElementById('layers-panel-mobile').classList.add('hidden')"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="vl-body"></div>
  </div>

  <div id="basemap-panel-mobile" class="mobile-panel hidden">
    <div class="mobile-panel-header">
      <h4>Podklady mapy</h4>
      <button class="mobile-panel-close" onclick="document.getElementById('basemap-panel-mobile').classList.add('hidden')"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="basemap-options">
      <button class="basemap-option active" data-layer="liberty"><i class="fa-solid fa-map"></i> Základní</button>
      <button class="basemap-option" data-layer="topo"><i class="fa-solid fa-mountain"></i> Turistická</button>
      <button class="basemap-option" data-layer="zima"><i class="fa-solid fa-snowflake"></i> Zimní</button>
      <button class="basemap-option" data-layer="satelit"><i class="fa-solid fa-satellite"></i> Satelit</button>
    </div>
  </div>
</div>

<div id="app-container">
  <div id="map"></div>
  <div id="weather-dim-overlay"></div>

  <aside id="desktop-sidebar" class="panel-hidden"><div id="desktop-sidebar-inner"></div></aside>

  <div id="mobile-bottom-sheet" class="sheet-hidden">
    <div class="sheet-drag-handle"><span></span></div>
    <button class="sheet-back-btn hidden" id="sheet-back-btn" title="Zpět"><i class="fa-solid fa-arrow-left"></i></button>
    <button class="sheet-close-btn" id="sheet-close-btn"><i class="fa-solid fa-xmark"></i></button>
    <div id="mobile-preview" class="sheet-preview">
      <img src="" alt="" id="mobile-thumb" style="display:none">
      <div class="sheet-preview-text">
        <h3 id="mobile-title">Miesto</h3>
        <div id="mobile-subtitle" class="sheet-preview-sub"></div>
      </div>
      <div id="mobile-preview-actions" class="sheet-preview-actions"></div>
    </div>
    <div id="mobile-content" class="sheet-content"></div>
  </div>

  <div id="vandro-panel" class="info-panel panel-hidden">
    <div class="sidebar-header">
      <h3>Naše VANDRO místa</h3>
      <div class="sidebar-header-actions">
        <button class="btn-panel-back hidden" id="vandro-panel-back" title="Zpět"><i class="fa-solid fa-arrow-left"></i></button>
        <button class="btn-close" id="vandro-panel-close"><i class="fa-solid fa-xmark"></i></button>
      </div>
    </div>
    <div class="panel-content">
      <img src="https://spoznajslovensko.eu/wp-content/uploads/2026/06/GridArt_20260507_233430886-scaled.jpg" alt="VANDRO místa" class="vandro-hero-img">
      <p class="vandro-desc">Výběr zajímavostí, které jsme potkali při našich toulkách. Někde jsme strávili hodiny, kolem jiných jsme jen projeli a stihli udělat fotku, protože nás něčím hned upoutaly. Najdete tu mix všeho, co nám na cestách přišlo zajímavé, inspirativní nebo prostě fajn na krátké zastavení.</p>
    </div>
  </div>

  <div id="vandro-panel-mobile" class="mobile-panel hidden">
    <div class="mobile-panel-header">
      <h4>Naše VANDRO místa</h4>
      <button class="mobile-panel-close" id="vandro-panel-mobile-close"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <img src="https://spoznajslovensko.eu/wp-content/uploads/2026/06/GridArt_20260507_233430886-scaled.jpg" alt="VANDRO místa" class="vandro-hero-img">
    <p class="vandro-desc">Výběr zajímavostí, které jsme potkali při našich toulkách. Někde jsme strávili hodiny, kolem jiných jsme jen projeli a stihli udělat fotku, protože nás něčím hned upoutaly. Najdete tu mix všeho, co nám na cestách přišlo zajímavé, inspirativní nebo prostě fajn na krátké zastavení.</p>
  </div>
</div>

`;
