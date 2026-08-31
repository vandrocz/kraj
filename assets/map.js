// ============================================================
// SEKCE 2: MAPA VÝLETŮ
// ============================================================
// Mapa má počasí a dopravu už zabudované ve vlastním rozhraní na maps.vandro.cz,
// takže tu jen embedujeme iframe na celou obrazovku bez naší hlavičky a bez duplicitních ovládačů.
// Spodná navigácia zostáva viditeľná nad iframom vďaka position:fixed a vyššiemu z-indexu.

function renderMapPage() {
  return `
    <div class="map-page">
      <div class="map-iframe-wrap map-iframe-wrap--fullscreen">
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
