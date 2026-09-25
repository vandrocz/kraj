// ============================================================
// SEKCE 2: MAPA VÝLETŮ
// ============================================================
// Iframe sa NEVYTVÁRA v HTML stringu — vytvorí sa raz a potom sa
// presúva medzi renderApp() volaniami. Presun existujúceho iframe
// elementu nespôsobuje reload stránky (na rozdiel od opätovného
// vytvorenia). Preto renderMapPage() vracia len prázdny wrapper.

function renderMapPage() {
  return `
    <div class="map-page">
      <div class="map-iframe-wrap map-iframe-wrap--fullscreen" data-map-wrap></div>
    </div>
  `;
}

// Pomocná funkcia — vytvorí iframe raz, potom sa recykluje cez _mapIframeCache v app.js.
function createMapIframe() {
  const iframe = document.createElement('iframe');
  iframe.id = 'vandro-map-iframe';
  iframe.className = 'map-iframe';
  iframe.src = MAP_ORIGIN;
  iframe.title = 'Mapa výletů';
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('allow', 'geolocation');
  return iframe;
}
