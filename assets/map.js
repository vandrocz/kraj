// ============================================================
// SEKCE 2: MAPA VÝLETŮ
// ============================================================
// Iframe načíta mapovú subdoménu. Spodná navigácia (fixed) zostáva viditeľná nad iframom
// vďaka tomu, že .bottom-nav má position:fixed a vyšší z-index ako .map-iframe-wrap.

function renderMapPage() {
  return `
    <div class="map-page">
      ${renderHeader('Mapa výletů')}
      <div class="map-iframe-wrap">
        <div class="map-floating-controls">
          <button class="map-float-btn ${state.mapWeatherOn ? 'is-active' : ''}" data-action="toggle-map-weather">
            ${icon('cloud', { size: 16 })} Počasí + radar
          </button>
          <button class="map-float-btn ${state.mapTrafficOn ? 'is-active' : ''}" data-action="toggle-map-traffic">
            ${icon('traffic', { size: 16 })} Doprava
          </button>
        </div>
        <iframe
          id="vandro-map-iframe"
          class="map-iframe"
          src="${MAP_ORIGIN}"
          title="Mapa výletů"
          loading="lazy"
          allow="geolocation"
        ></iframe>
      </div>
    </div>
  `;
}

function attachMapPostMessageBridge() {
  // Nič netreba na "attach" event listenery — tlačidlá idú cez globálny click delegate.
  // Táto funkcia len zaistí, že po každom re-rendri vieme poslať aktuálny stav do (novo načítaného) iframu.
  const iframe = document.getElementById('vandro-map-iframe');
  if (!iframe) return;
  iframe.addEventListener('load', () => {
    postMapLayerState(iframe);
  });
}

function postMapLayerState(iframeEl) {
  const iframe = iframeEl || document.getElementById('vandro-map-iframe');
  if (!iframe || !iframe.contentWindow) return;
  try {
    iframe.contentWindow.postMessage(
      { source: 'naskraj-app', type: 'set-map-layers', layers: { weather: state.mapWeatherOn, traffic: state.mapTrafficOn } },
      MAP_ORIGIN,
    );
  } catch (err) {
    console.warn('postMessage do mapy zlyhal (iframe ešte nemusí byť pripravený):', err.message);
  }
}

function toggleMapLayer(layer) {
  if (layer === 'weather') state.mapWeatherOn = !state.mapWeatherOn;
  if (layer === 'traffic') state.mapTrafficOn = !state.mapTrafficOn;

  // Zámerne NEvoláme renderApp() — to by prekreslilo celé DOM vrátane <iframe>, čo by ho reloadlo.
  // Namiesto toho len prepneme vizuálny stav tlačidiel a pošleme aktuálny stav vrstiev do mapy.
  const weatherBtn = document.querySelector('[data-action="toggle-map-weather"]');
  const trafficBtn = document.querySelector('[data-action="toggle-map-traffic"]');
  if (weatherBtn) weatherBtn.classList.toggle('is-active', state.mapWeatherOn);
  if (trafficBtn) trafficBtn.classList.toggle('is-active', state.mapTrafficOn);

  postMapLayerState();
}
