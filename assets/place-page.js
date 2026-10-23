// Stránka konkrétního místa: mapka se značkou jako na hlavní mapě a galerie fotek (dříve inline skripty, kvůli CSP)
document.addEventListener('DOMContentLoaded', () => {
  if (typeof GLightbox !== 'undefined') GLightbox({ selector: '.glightbox' });

  const el = document.getElementById('minimap');
  if (!el || typeof maplibregl === 'undefined') return;
  const lat = parseFloat(el.dataset.lat), lng = parseFloat(el.dataset.lng);
  if (!isFinite(lat) || !isFinite(lng)) return;
  try {
    const mm = new maplibregl.Map({
      container: 'minimap', style: location.origin + '/assets/map-style.json',
      center: [lng, lat], zoom: 12.5, attributionControl: true,
    });
    mm.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    // značka stejná jako na hlavní mapě: zelený kruh, bílý okraj a ikona kategorie
    const marker = document.createElement('div');
    marker.className = 'place-marker';
    const glyph = (window.vmGlyphFor ? window.vmGlyphFor(el.dataset.glyph || '') : 'pin');
    marker.innerHTML = window.vmIconSvg ? window.vmIconSvg(glyph, { size: '19px', stroke: 2.1 }) : '';
    marker.title = el.dataset.title || '';
    new maplibregl.Marker({ element: marker, anchor: 'center' }).setLngLat([lng, lat]).addTo(mm);
  } catch (e) { console.warn('Minimapa se nenačetla:', e); }
});

// Záložní logo, když se obrázek nenačte (dříve inline onerror kvůli CSP)
document.querySelectorAll('img[data-logo-fallback]').forEach((img) => {
  const swap = () => { const sp = document.createElement('span'); sp.textContent = '🧭 Vandro'; sp.style.cssText = 'font-size:20px;font-weight:800'; img.replaceWith(sp); };
  if (img.complete && img.naturalWidth === 0) swap(); else img.addEventListener('error', swap, { once: true });
});
