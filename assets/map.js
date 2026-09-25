// ============================================================
// SEKCE 2: MAPA VÝLETŮ
// ============================================================
// Mapa má počasí a dopravu už zabudované ve vlastním rozhraní na maps.vandro.cz.
// Embedujeme iframe na celú obrazovku bez našej hlavičky a bez duplicitných ovládačov.
//
// D7: Spodná lišta (bottom-nav) je na tejto karte štandardne zbalená
// do malého tlačidla so šípkou — riešené v renderBottomNav() v app.js.
// Po prepnutí na inú kartu sa automaticky rozbalí do plnej podoby.

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
