// Filtrování a postupné načítání seznamu míst (dříve inline skript, kvůli CSP)
const search = document.getElementById('f-search');
  const fKat = document.getElementById('f-kat');
  const fCountry = document.getElementById('f-country');
  const cards = Array.from(document.querySelectorAll('.place-card'));
  const emptyNote = document.getElementById('empty-note');
  const loadMoreBtn = document.getElementById('load-more-btn');
  const maxBatch = Math.max(...cards.map(c => +c.dataset.batch));
  let revealedBatch = 0;
  let filterActive = false;

  function revealNextBatch() {
    cards.forEach(c => { if (+c.dataset.batch === revealedBatch) c.classList.add('is-revealed'); });
    revealedBatch++;
    if (revealedBatch > maxBatch) loadMoreBtn.classList.add('is-done');
  }
  loadMoreBtn.addEventListener('click', revealNextBatch);

  // Automaticky dogeneruje ďalšiu dávku pri priblížení sa ku koncu zoznamu.
  const sentinel = document.getElementById('scroll-sentinel');
  new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !filterActive && revealedBatch < maxBatch) revealNextBatch();
  }, { rootMargin: '400px' }).observe(sentinel);

  function applyFilters() {
    const q = search.value.trim().toLowerCase();
    const kat = fKat.value;
    const country = fCountry.value;
    filterActive = !!(q || kat || country);
    let visible = 0;
    cards.forEach(card => {
      const matches = (!q || card.dataset.name.includes(q)) && (!kat || card.dataset.kat === kat) && (!country || card.dataset.country === country);
      card.classList.toggle('is-hidden', !matches);
      // Pri aktívnom filtri ukáž všetky zhody bez ohľadu na dávku, inak sa vráť k postupnému odhaľovaniu.
      if (filterActive && matches) card.classList.add('is-revealed');
      if (matches) visible++;
    });
    loadMoreBtn.style.display = filterActive ? 'none' : '';
    emptyNote.style.display = visible ? 'none' : 'block';
  }
  search.addEventListener('input', applyFilters);
  fKat.addEventListener('change', applyFilters);
  fCountry.addEventListener('change', applyFilters);

  revealNextBatch(); // zobraz prvú dávku hneď

  // ── Řazení míst podle polohy (IP → GPS → adresa) ────────────────
  const PAGE_BATCH_JS = Number(document.currentScript && document.currentScript.dataset.batch) || 24;
  const grid = document.getElementById('grid');
  const sortNote = document.getElementById('sort-note');

  function haversineKmJs(lat1, lng1, lat2, lng2) {
    const R = 6371, toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Preusporiada karty v DOM podľa skóre (nižšie = bližšie/prvé), stabilne
  // (pri rovnosti skóre sa zachová pôvodné poradie). Prepočíta aj dávky
  // pre postupné odhaľovanie, aby "Načíst další místa" fungovalo aj po zoradení.
  function resortCardsByScore(scoreFn) {
    const withScore = cards.map((c, i) => ({ c, i, s: scoreFn(c) }));
    withScore.sort((a, b) => (a.s - b.s) || (a.i - b.i));
    withScore.forEach(({ c }, idx) => {
      c.dataset.batch = String(Math.floor(idx / PAGE_BATCH_JS));
      c.classList.remove('is-revealed');
      grid.appendChild(c);
    });
    revealedBatch = 0;
    loadMoreBtn.classList.remove('is-done');
    revealNextBatch();
    applyFilters();
  }

  function sortByPoint(lat, lng) {
    resortCardsByScore(c => {
      const clat = parseFloat(c.dataset.lat), clng = parseFloat(c.dataset.lng);
      if (!isFinite(clat) || !isFinite(clng)) return Infinity;
      return haversineKmJs(lat, lng, clat, clng);
    });
    cards.forEach(c => {
      const el = c.querySelector('.place-dist');
      if (!el) return;
      const clat = parseFloat(c.dataset.lat), clng = parseFloat(c.dataset.lng);
      if (!isFinite(clat) || !isFinite(clng)) { el.hidden = true; return; }
      const km = haversineKmJs(lat, lng, clat, clng);
      el.textContent = km < 10 ? km.toFixed(1).replace('.', ',') + ' km' : Math.round(km) + ' km';
      el.hidden = false;
    });
  }

  // Řazení jen podle země (když nemáme přesné souřadnice uživatele) — místa
  // z jeho země půjdou na začátek, pořadí uvnitř zůstane jako v CSV. Bez
  // přesného bodu vzdálenost neznáme, takže badge schováme.
  function sortByCountryFirst(countryName) {
    resortCardsByScore(c => (c.dataset.country === countryName ? 0 : 1));
    cards.forEach(c => { const el = c.querySelector('.place-dist'); if (el) el.hidden = true; });
  }

  // Země návštěvníka se odhadne lokálně z časové zóny a jazyka prohlížeče (bez dotazu na cizí službu
  // a bez předávání IP adresy třetí straně).
  const TZ_COUNTRY = {
    'Europe/Prague': 'Česko', 'Europe/Bratislava': 'Slovensko', 'Europe/Vienna': 'Rakousko',
    'Europe/Warsaw': 'Polsko', 'Europe/Berlin': 'Německo', 'Europe/Budapest': 'Maďarsko',
  };
  const LANG_COUNTRY = { cs: 'Česko', sk: 'Slovensko' };

  function autoSortByLocale() {
    let country = null;
    try { country = TZ_COUNTRY[Intl.DateTimeFormat().resolvedOptions().timeZone] || null; } catch (e) { /* ignorováno */ }
    if (!country) { const l = String(navigator.language || '').slice(0, 2).toLowerCase(); country = LANG_COUNTRY[l] || null; }
    if (country) {
      sortByCountryFirst(country);
      sortNote.textContent = '📍 Nejprve místa z vaší země (' + country + ')';
    } else {
      sortNote.textContent = '';
    }
  }

  // Pokud už má stránka udělené GPS oprávnění z dřívějška, použijeme rovnou
  // přesnou polohu (bez nového vyskakovacího okna); jinak řadíme podle země.
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'geolocation' }).then(status => {
      if (status.state === 'granted') {
        navigator.geolocation.getCurrentPosition(
          pos => { sortByPoint(pos.coords.latitude, pos.coords.longitude); sortNote.textContent = '📍 Řazeno podle vaší GPS polohy'; },
          () => autoSortByLocale()
        );
      } else {
        autoSortByLocale();
      }
    }).catch(autoSortByLocale);
  } else {
    autoSortByLocale();
  }

  // ── Modální okno: ručně zadaná adresa / GPS ──────────────────────
  const sortBackdrop = document.getElementById('sort-modal-backdrop');
  const sortInput = document.getElementById('sort-address-input');
  const sortErr = document.getElementById('sort-address-error');
  document.getElementById('btn-sort-address').addEventListener('click', () => {
    sortBackdrop.classList.add('open');
    sortInput.focus();
  });
  document.getElementById('sort-modal-close').addEventListener('click', () => sortBackdrop.classList.remove('open'));
  sortBackdrop.addEventListener('click', e => { if (e.target === sortBackdrop) sortBackdrop.classList.remove('open'); });

  document.getElementById('sort-gps-go').addEventListener('click', () => {
    sortErr.style.display = 'none';
    navigator.geolocation.getCurrentPosition(
      pos => {
        sortByPoint(pos.coords.latitude, pos.coords.longitude);
        sortNote.textContent = '📍 Řazeno podle vaší GPS polohy';
        sortBackdrop.classList.remove('open');
      },
      () => { sortErr.textContent = 'GPS polohu se nepodařilo získat.'; sortErr.style.display = 'block'; }
    );
  });

  async function goAddressSearch() {
    const q = sortInput.value.trim();
    sortErr.style.display = 'none';
    if (!q) return;
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q));
      const d = await r.json();
      if (!d || !d.length) { sortErr.textContent = 'Adresu se nepodařilo najít.'; sortErr.style.display = 'block'; return; }
      sortByPoint(parseFloat(d[0].lat), parseFloat(d[0].lon));
      sortNote.textContent = '📍 Řazeno od adresy: ' + q;
      sortBackdrop.classList.remove('open');
    } catch (e) {
      sortErr.textContent = 'Vyhledávání adresy selhalo, zkuste to prosím znovu.';
      sortErr.style.display = 'block';
    }
  }
  document.getElementById('sort-address-go').addEventListener('click', goAddressSearch);
  sortInput.addEventListener('keydown', e => { if (e.key === 'Enter') goAddressSearch(); });

// Záložní logo, když se obrázek nenačte (dříve inline onerror kvůli CSP)
document.querySelectorAll('img[data-logo-fallback]').forEach((img) => {
  const swap = () => { const sp = document.createElement('span'); sp.textContent = '🧭 Vandro'; sp.style.cssText = 'font-size:20px;font-weight:800'; img.replaceWith(sp); };
  if (img.complete && img.naturalWidth === 0) swap(); else img.addEventListener('error', swap, { once: true });
});
