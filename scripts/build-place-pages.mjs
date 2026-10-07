// ── Generátor statických stránok pre jednotlivé VANDRO miesta ──────────────
// Spúšťa sa cez GitHub Actions (.github/workflows/build-place-pages.yml).
// Žiadne npm balíčky, žiadny Node.js lokálne netreba.

const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR9YDikPI2qUDSmXOsMmNKkzHUWN9ivO34MZgfQZCFKCjxAAPKQN14gzPrJRGFLE6LJZ3GT-xnhdYYB/pub?gid=0&single=true&output=csv';
const SITE_URL = 'https://vandro.cz';
const OUTPUT_DIR = '.'; // ← zmeň na './docs', ak Pages servíruje z /docs priečinka
const FALLBACK_IMAGE = 'https://spoznajslovensko.eu/wp-content/uploads/2026/06/GridArt_20260507_233430886-scaled.jpg';
const LOGO_URL = 'https://cdn.vandro.cz/Untitled18_20260523111243.png';
const PRIVACY_URL = 'https://www.vandro.cz/zasady-ochrany-osobnich-udaju';
const TERMS_URL = 'https://www.vandro.cz/podminky-uzivani';
const NEARBY_COUNT = 6;
const PAGE_BATCH = 24; // koľko kariet v zozname sa ukáže naraz (viac sa dogeneruje pri scrolle/tlačidle)

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && next === '\n') i++;
        row.push(field); field = '';
        if (!(row.length === 1 && row[0] === '')) rows.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows
    .filter(r => r.length === header.length)
    .map(r => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}
function slugify(str) {
  return String(str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'misto';
}
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function parseGallery(raw) {
  return String(raw || '').split(',').map(s => s.trim()).filter(Boolean);
}
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const SHARED_STYLE = `
  :root { --primary: #2b8a3e; --primary-dark: #226f31; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; margin: 0; color: #222; line-height: 1.6; background: #fbfbfa; }
  a { color: var(--primary); }
  .site-header {
    display: flex; align-items: center; gap: 10px; padding: 14px 24px;
    border-bottom: 1px solid #eee; background: #fff; position: sticky; top: 0; z-index: 10;
  }
  .site-header img { width: auto; height: 30px; display: block; object-fit: contain; }
  .site-header a.site-name { font-weight: 800; font-size: 17px; color: #222; text-decoration: none; display: flex; align-items: center; gap: 8px; }
  .site-header .site-nav { margin-left: auto; display: flex; gap: 18px; font-size: 13px; }
  .site-header .site-nav a { color: #666; text-decoration: none; }
  .wrap-wide { max-width: 1080px; margin: 0 auto; padding: 24px 24px 50px; }
  .site-footer { border-top: 1px solid #eee; margin-top: 40px; padding: 24px 20px 40px; text-align: center; font-size: 12px; color: #999; }
  .site-footer a { color: #999; margin: 0 8px; }
`;
// Logo s fallbackom — ak sa externý obrázok nenačíta, ukáže sa aspoň textová
// ikona namiesto rozbitého obrázka (medzi doménami sa občas nenačíta spoľahlivo).
function headerHtml() {
  return `<div class="site-header">
    <a class="site-name" href="${SITE_URL}/">
      <img src="${LOGO_URL}" alt="Vandro" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'🧭 Vandro',style:'font-size:20px;font-weight:800'}))">
    </a>
    <nav class="site-nav">
      <a href="${SITE_URL}/mista/">Všechna místa</a>
      <a href="${SITE_URL}/">Mapa</a>
    </nav>
  </div>`;
}
function footerHtml() {
  const year = new Date().getFullYear();
  return `<div class="site-footer">
    <div>© ${year} VANDRO — turiská mapa</div>
    <div style="margin-top:6px">
      <a href="${PRIVACY_URL}" target="_blank" rel="noopener">Zásady ochrany osobních údajů</a>·
      <a href="${TERMS_URL}" target="_blank" rel="noopener">Podmínky užívání</a>
    </div>
  </div>`;
}
// Minimapa — namiesto cudzieho OSM embedu použije rovnaký podklad (OpenFreeMap
// štýl), aký appka sama používa, takže vyzerá konzistentne s hlavnou mapou.
function minimapScript(lat, lng, title) {
  return `
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet">
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      try {
        const mm = new maplibregl.Map({
          container: 'minimap', style: '${SITE_URL}/map-style.json',
          center: [${lng}, ${lat}], zoom: 12.5, attributionControl: true,
        });
        mm.addControl(new maplibregl.NavigationControl({showCompass:false}), 'top-right');
        new maplibregl.Marker({ color: '#e53935' }).setLngLat([${lng}, ${lat}]).addTo(mm);
      } catch (e) { console.warn('Minimapa se nenačetla:', e); }
    });
  </script>`;
}

function buildPageHtml(p, slug, nearby) {
  const title = p.nazov || 'Turistické místo';
  const category = [p.kategoria, p.podkategoria].filter(Boolean).join(' › ');
  const descRaw = (p.popis || '').replace(/<[^>]*>/g, '').trim();
  const metaDescription = (descRaw || `${title}${category ? ' — ' + category : ''} na turistické mapě Vandro.`).slice(0, 300);
  const image = p.foto_main || FALLBACK_IMAGE;
  const pageUrl = `${SITE_URL}/misto/${slug}/`;
  const mapUrl = `${SITE_URL}/#${slug}/${p.lat}/${p.lng}`;
  const country = p.krajina || '';
  const gallery = parseGallery(p.galeria).filter(u => u !== p.foto_main);
  const lat = +p.lat, lng = +p.lng;

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'TouristAttraction',
    name: title, description: metaDescription, image: [image, ...gallery], url: pageUrl,
    address: country ? { '@type': 'PostalAddress', addressCountry: country } : undefined,
    geo: { '@type': 'GeoCoordinates', latitude: p.lat, longitude: p.lng },
  };

  const extraBits = [
    p.vstup ? `Vstupné: ${escapeHtml(p.vstup)}` : '',
    p.web ? `<a href="${escapeHtml(p.web)}" target="_blank" rel="noopener nofollow">Web</a>` : '',
  ].filter(Boolean);
  const infoSection = extraBits.length ? `<div class="extra-line">${extraBits.join(' · ')}</div>` : '';

  const gallerySection = gallery.length ? `
    <h2 class="section-title">Galerie</h2>
    <div class="gallery-grid">
      ${gallery.map(img => `<a href="${escapeHtml(img)}" class="glightbox" data-gallery="place-gallery" data-title="${escapeHtml(title)}"><img src="${escapeHtml(img)}" alt="${escapeHtml(title)}" loading="lazy"></a>`).join('')}
    </div>` : '';

  const nearbySection = nearby.length ? `
    <h2 class="section-title">Místa v okolí</h2>
    <div class="nearby-list">
      ${nearby.map(n => `<a class="nearby-item" href="${SITE_URL}/misto/${n.slug}/">
        <img src="${escapeHtml(n.p.foto_main || FALLBACK_IMAGE)}" alt="" loading="lazy">
        <div class="nearby-item-body">
          <strong>${escapeHtml(n.p.nazov)}</strong>
          <span>${escapeHtml(n.p.kategoria || '')}</span>
        </div>
        <span class="nearby-dist">${n.dist < 1 ? Math.round(n.dist*1000)+' m' : n.dist.toFixed(1)+' km'}</span>
      </a>`).join('')}
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} | Vandro — turistická mapa</title>
<meta name="description" content="${escapeHtml(metaDescription)}">
<link rel="canonical" href="${pageUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Vandro">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(metaDescription)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${pageUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(metaDescription)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
${minimapScript(lat, lng, title)}
<link href="https://cdn.jsdelivr.net/npm/glightbox/dist/css/glightbox.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/glightbox/dist/js/glightbox.min.js"></script>
<script>
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof GLightbox !== 'undefined') GLightbox({ selector: '.glightbox' });
  });
</script>
<style>
${SHARED_STYLE}
  .hero-wrap { max-width: 1080px; margin: 0 auto; padding: 20px 24px 0; }
  .hero-wrap a { display: block; cursor: zoom-in; }
  .hero { width: 100%; max-height: 380px; object-fit: cover; display: block; border-radius: 14px; }
  .gallery-grid a { display: block; cursor: zoom-in; }
  h1 { font-size: 28px; margin: 20px 0 4px; }
  .cat { color: #888; font-size: 14px; margin-bottom: 4px; }
  .gps { color: #aaa; font-size: 12px; margin-bottom: 20px; }
  .cta-btn {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    background: var(--primary); color: #fff; text-decoration: none; font-weight: 700; font-size: 16px;
    padding: 16px 24px; border-radius: 10px; margin: 0 0 16px; box-shadow: 0 4px 14px rgba(43,138,62,0.3);
  }
  .cta-btn:hover { background: var(--primary-dark); }
  .popis { font-size: 15px; white-space: pre-line; }
  .section-title { font-size: 18px; font-weight: 800; margin: 32px 0 12px; }
  .info-rows,
  .extra-line { color: #888; font-size: 14px; margin-bottom: 4px; }
  .extra-line a { color: var(--primary); font-weight: 600; text-decoration: none; }
  .extra-line a:hover { text-decoration: underline; }
  /* Mobil (predvolené): foto → CTA tlačítko → titulek/popis/vstupné → galerie → poloha → místa v okolí.
     .col-main/.col-side sú na mobile "priehľadné" (display:contents), takže bloky sa radia priamo
     podľa grid-template-areas nižšie. */
  .content-grid {
    display: grid; grid-template-columns: 1fr; gap: 8px 40px;
    grid-template-areas: "title" "cta" "popis" "gallery" "poloha" "nearby";
  }
  .col-main, .col-side { display: contents; }
  .blk-title { grid-area: title; }
  .blk-cta { grid-area: cta; }
  .blk-popis { grid-area: popis; }
  .blk-gallery { grid-area: gallery; }
  .blk-poloha { grid-area: poloha; }
  .blk-nearby { grid-area: nearby; }
  .blk-poloha .section-title, .blk-gallery .section-title { margin-top: 0; }
  @media (min-width: 860px) {
    /* Desktop: dva nezávislé stĺpce vedľa seba (nie zdieľané "riadky"), takže
       titulok a CTA tlačidlo začínajú presne v rovnakej výške a galéria
       nadväzuje priamo pod tlačidlom bez medzery navyše. */
    .content-grid { display: flex; align-items: flex-start; gap: 40px; }
    .col-main, .col-side { display: flex; flex-direction: column; min-width: 0; }
    .col-main { flex: 1.5; }
    .col-side { flex: 1; }
  }
  .gallery-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .gallery-grid img { width: 100%; height: 110px; object-fit: cover; border-radius: 8px; }
  #minimap { height: 280px; border-radius: 10px; overflow: hidden; margin-top: 4px; }
  .nearby-list { display: flex; flex-direction: column; gap: 8px; }
  .nearby-item { display: flex; align-items: center; gap: 12px; text-decoration: none; color: #222; padding: 8px; border-radius: 8px; border: 1px solid #f0f0f0; }
  .nearby-item:hover { background: #f7f7f7; }
  .nearby-item img { width: 52px; height: 52px; object-fit: cover; border-radius: 8px; flex-shrink: 0; }
  .nearby-item-body { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .nearby-item-body span { font-size: 12px; color: #999; }
  .nearby-dist { font-size: 12px; color: #999; flex-shrink: 0; }
</style>
</head>
<body>
${headerHtml()}
<div class="hero-wrap"><a href="${escapeHtml(image)}" class="glightbox" data-gallery="place-gallery" data-title="${escapeHtml(title)}"><img class="hero" src="${escapeHtml(image)}" alt="${escapeHtml(title)}"></a></div>
<div class="wrap-wide">
  <div class="content-grid">
    <div class="col-main">
      <div class="blk-title">
        <h1>${escapeHtml(title)}</h1>
        ${category ? `<div class="cat">${escapeHtml(category)}${country ? ' · ' + escapeHtml(country) : ''}</div>` : ''}
        ${infoSection}
        <div class="gps">${p.lat}, ${p.lng}</div>
      </div>
      <div class="blk-popis">
        ${descRaw ? `<p class="popis">${escapeHtml(descRaw)}</p>` : ''}
      </div>
      <div class="blk-nearby">${nearbySection}</div>
    </div>
    <div class="col-side">
      <div class="blk-cta">
        <a class="cta-btn" href="${mapUrl}"><span>📍</span> Zobrazit na interaktivní mapě</a>
      </div>
      <div class="blk-gallery">${gallerySection}</div>
      <div class="blk-poloha">
        <h2 class="section-title">Poloha</h2>
        <div id="minimap"></div>
      </div>
    </div>
  </div>
</div>
${footerHtml()}
</body>
</html>`;
}

function buildIndexHtml(items) {
  const categories = [...new Set(items.map(it => it.p.podkategoria || it.p.kategoria).filter(Boolean))].sort();
  const countries = [...new Set(items.map(it => it.p.krajina).filter(Boolean))].sort();

  // VŠETKY karty (aj odkazy) sú v surovom HTML kvôli SEO — JS len postupne
  // odhaľuje ďalšie dávky po 24, aby prehliadač nemusel hneď sťahovať
  // stovky obrázkov naraz. Bez JS by boli jednoducho vidno všetky.
  const cardsHtml = items.map((it, i) => `
    <a class="place-card${i >= PAGE_BATCH ? ' is-more' : ''}" href="${SITE_URL}/misto/${it.slug}/" data-batch="${Math.floor(i / PAGE_BATCH)}" data-kat="${escapeHtml(it.p.podkategoria || it.p.kategoria || '')}" data-country="${escapeHtml(it.p.krajina || '')}" data-name="${escapeHtml((it.p.nazov||'').toLowerCase())}" data-lat="${escapeHtml(it.p.lat||'')}" data-lng="${escapeHtml(it.p.lng||'')}" data-orig="${i}">
      <img src="${escapeHtml(it.p.foto_main || FALLBACK_IMAGE)}" alt="" loading="lazy">
      <div class="place-card-body">
        <strong>${escapeHtml(it.p.nazov || 'Místo')}</strong>
        <span>${escapeHtml(it.p.podkategoria || it.p.kategoria || '')}${it.p.krajina ? ' · ' + escapeHtml(it.p.krajina) : ''}</span>
        <span class="place-dist" hidden></span>
      </div>
    </a>`).join('');

  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Všechna místa | Vandro — turistická mapa</title>
<meta name="description" content="Kompletní seznam turistických míst na Vandro — hrady, přírodní zajímavosti, rozhledny a další z celé Evropy.">
<link rel="canonical" href="${SITE_URL}/mista/">
<style>
${SHARED_STYLE}
  h1 { font-size: 26px; }
  .filters { display: flex; gap: 10px; flex-wrap: wrap; margin: 18px 0 24px; }
  .filters input, .filters select { padding: 9px 12px; border-radius: 8px; border: 1px solid #ddd; font-size: 14px; font-family: inherit; }
  .filters input { flex: 1; min-width: 180px; }
  .grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
  @media (min-width: 700px) { .grid { grid-template-columns: repeat(2, 1fr); } }
  @media (min-width: 1000px) { .grid { grid-template-columns: repeat(3, 1fr); } }
  .place-card { display: flex; flex-direction: column; text-decoration: none; color: #222; border-radius: 12px; overflow: hidden; border: 1px solid #eee; background: #fff; transition: box-shadow 0.15s, transform 0.15s; }
  .place-card:hover { box-shadow: 0 6px 18px rgba(0,0,0,0.1); transform: translateY(-2px); }
  .place-card img { width: 100%; height: 160px; object-fit: cover; }
  .place-card-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 3px; }
  .place-card-body span { font-size: 12px; color: #999; }
  .place-card-body .place-dist { color: var(--primary); font-weight: 700; }
  .place-card.is-hidden { display: none; }
  .place-card.is-more:not(.is-revealed) { display: none; }
  .empty-note { display: none; text-align: center; color: #999; padding: 40px 0; }
  #load-more-btn { display: block; margin: 10px auto 0; padding: 12px 26px; border-radius: 8px; border: 1.5px solid var(--primary); background: #fff; color: var(--primary); font-weight: 700; font-size: 14px; cursor: pointer; }
  #load-more-btn:hover { background: var(--primary); color: #fff; }
  #load-more-btn.is-done { display: none; }
  #scroll-sentinel { height: 1px; }
  .sort-bar { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #888; flex: 1 1 220px; min-width: 0; }
  #sort-note { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #btn-sort-address { padding: 7px 12px; border-radius: 7px; border: 1.5px solid var(--primary); background: #fff; color: var(--primary); font-weight: 600; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
  #btn-sort-address:hover { background: var(--primary); color: #fff; }
  /* Řádkové zlomy: na desktopu drží řádení odděleně od filtrů (jako předtím),
     na mobilu naopak drží vyhledávání samo a kategorii/zemi/řazení pohromadě. */
  .row-break { flex-basis: 100%; width: 0; height: 0; overflow: hidden; }
  .row-break-mobile { display: none; }
  .row-break-desktop { display: block; }
  .ficon-wrap { position: relative; display: inline-flex; align-items: center; }
  .ficon-wrap .ficon { display: none; }
  @media (max-width: 640px) {
    .row-break-mobile { display: block; }
    .row-break-desktop { display: none; }
    #f-search { flex: 1 1 100%; }
    .ficon-wrap { width: 40px; height: 38px; flex-shrink: 0; }
    .ficon-wrap select {
      position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; padding: 0; border: none;
    }
    .ficon-wrap .ficon {
      display: flex; align-items: center; justify-content: center; position: absolute; inset: 0;
      background: #fff; border: 1px solid #ddd; border-radius: 8px; font-size: 15px; pointer-events: none;
    }
    .sort-bar { flex: 1 1 auto; min-width: 0; }
    #sort-note { display: none; }
    #btn-sort-address { width: 38px; height: 38px; padding: 0; justify-content: center; flex-shrink: 0; }
    #btn-sort-address .btn-sort-label { display: none; }
  }
  .sort-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: none; align-items: center; justify-content: center; z-index: 100; padding: 16px; }
  .sort-modal-backdrop.open { display: flex; }
  .sort-modal { background: #fff; border-radius: 14px; padding: 20px; max-width: 380px; width: 100%; }
  .sort-modal h3 { margin: 0 0 12px; font-size: 17px; }
  .sort-modal input { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #ddd; font-size: 14px; font-family: inherit; box-sizing: border-box; margin-bottom: 10px; }
  .sort-modal-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .sort-modal-actions button { flex: 1; padding: 10px 12px; border-radius: 8px; border: 1.5px solid var(--primary); background: #fff; color: var(--primary); font-weight: 600; font-size: 13px; cursor: pointer; }
  .sort-modal-actions button.primary { background: var(--primary); color: #fff; }
  .sort-modal-close { float: right; background: none; border: none; font-size: 18px; cursor: pointer; color: #999; }
</style>
</head>
<body>
${headerHtml()}
<div class="wrap-wide">
  <h1>Kam na výlet? <small style="color:#999;font-weight:400">(${items.length})</small></h1>
  <div class="filters" id="controls-bar">
    <input type="text" id="f-search" placeholder="Hledat podle názvu…">
    <div class="row-break row-break-mobile"></div>
    <div class="ficon-wrap" title="Kategorie">
      <i class="ficon">🏷️</i>
      <select id="f-kat"><option value="">Všechny kategorie</option>${categories.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}</select>
    </div>
    <div class="ficon-wrap" title="Země">
      <i class="ficon">🌍</i>
      <select id="f-country"><option value="">Všechny země</option>${countries.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}</select>
    </div>
    <div class="row-break row-break-desktop"></div>
    <div class="sort-bar" id="sort-bar">
      <span id="sort-note">Řazeno podle vaší polohy…</span>
      <button id="btn-sort-address" type="button" title="Řadit od adresy">
        <i class="ficon">📍</i><span class="btn-sort-label"> Řadit od adresy…</span>
      </button>
    </div>
  </div>
  <div class="sort-modal-backdrop" id="sort-modal-backdrop">
    <div class="sort-modal">
      <button class="sort-modal-close" id="sort-modal-close" type="button" aria-label="Zavřít">✕</button>
      <h3>Řadit místa od adresy</h3>
      <input type="text" id="sort-address-input" placeholder="Např. Praha, Brno, Bratislava…">
      <div class="sort-modal-actions">
        <button type="button" id="sort-address-go" class="primary">Najít a seřadit</button>
        <button type="button" id="sort-gps-go">📍 Použít moji GPS polohu</button>
      </div>
      <div id="sort-address-error" style="color:#c0392b;font-size:12.5px;margin-top:8px;display:none"></div>
    </div>
  </div>
  <div class="grid" id="grid">${cardsHtml}</div>
  <p class="empty-note" id="empty-note">Žádná místa neodpovídají filtru.</p>
  <button id="load-more-btn">Načíst další místa</button>
  <div id="scroll-sentinel"></div>
</div>
${footerHtml()}
<script>
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
  const PAGE_BATCH_JS = ${PAGE_BATCH};
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

  // Anglický název země z IP geolokace → český název tak, jak je uložen ve
  // sloupci "krajina" v Google Sheets (uprav/doplň dle skutečných hodnot).
  const COUNTRY_NAME_MAP = {
    'czechia': 'Česko', 'czech republic': 'Česko',
    'slovakia': 'Slovensko',
    'austria': 'Rakousko',
    'poland': 'Polsko',
    'germany': 'Německo',
    'hungary': 'Maďarsko',
  };

  async function autoSortByIp() {
    try {
      const r = await fetch('https://ipapi.co/json/');
      if (!r.ok) throw new Error('ip lookup failed');
      const d = await r.json();
      if (d && isFinite(d.latitude) && isFinite(d.longitude)) {
        sortByPoint(d.latitude, d.longitude);
        sortNote.textContent = '📍 Řazeno podle vaší polohy (dle IP adresy)';
        return;
      }
      const mapped = d && d.country_name ? COUNTRY_NAME_MAP[String(d.country_name).toLowerCase()] : null;
      if (mapped) {
        sortByCountryFirst(mapped);
        sortNote.textContent = '📍 Nejprve místa z vaší země (' + mapped + ')';
        return;
      }
      sortNote.textContent = '';
    } catch (e) {
      sortNote.textContent = ''; // IP geolokace není dostupná — ponecháme výchozí pořadí
    }
  }

  // Pokud už má stránka udělené GPS oprávnění z dřívějška, použijeme rovnou
  // přesnou polohu (bez nového vyskakovacího okna); jinak zkusíme IP.
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'geolocation' }).then(status => {
      if (status.state === 'granted') {
        navigator.geolocation.getCurrentPosition(
          pos => { sortByPoint(pos.coords.latitude, pos.coords.longitude); sortNote.textContent = '📍 Řazeno podle vaší GPS polohy'; },
          () => autoSortByIp()
        );
      } else {
        autoSortByIp();
      }
    }).catch(autoSortByIp);
  } else {
    autoSortByIp();
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
</script>
</body>
</html>`;
}

async function main() {
  console.log('Stahuji data míst z Google Sheets…');
  const res = await fetch(SHEET_CSV);
  if (!res.ok) throw new Error(`Nepodařilo se stáhnout CSV: HTTP ${res.status}`);
  const csvText = await res.text();
  const places = parseCSV(csvText).filter(p => p.lat && p.lng && p.nazov);
  console.log(`Nalezeno ${places.length} míst.`);

  const usedSlugs = new Map();
  const items = [];
  for (const p of places) {
    let slug = slugify(p.nazov);
    const count = usedSlugs.get(slug) || 0;
    usedSlugs.set(slug, count + 1);
    if (count > 0) slug = `${slug}-${count + 1}`;
    items.push({ p, slug });
  }

  const sitemapUrls = [
    { loc: `${SITE_URL}/` },
    { loc: `${SITE_URL}/mista/` },
  ];

  for (const item of items) {
    const { p, slug } = item;
    const lat = +p.lat, lng = +p.lng;
    const nearby = items
      .filter(it => it.slug !== slug)
      .map(it => ({ ...it, dist: haversineKm(lat, lng, +it.p.lat, +it.p.lng) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, NEARBY_COUNT);

    const dir = path.join(OUTPUT_DIR, 'misto', slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), buildPageHtml(p, slug, nearby), 'utf-8');
    const pageImages = [p.foto_main, ...parseGallery(p.galeria)].filter(Boolean);
    sitemapUrls.push({ loc: `${SITE_URL}/misto/${slug}/`, title: p.nazov || '', images: [...new Set(pageImages)].slice(0, 20) });
  }

  const mistaDir = path.join(OUTPUT_DIR, 'mista');
  await mkdir(mistaDir, { recursive: true });
  await writeFile(path.join(mistaDir, 'index.html'), buildIndexHtml(items), 'utf-8');

  // Sitemap s rozšírením pre obrázky (xmlns:image) — pomáha Google nájsť a
  // priradiť fotky ku konkrétnym stránkam miest, čo zvyšuje šancu, že sa
  // zobrazia náhľady/fotky priamo vo výsledkoch vyhľadávania a Google Images.
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${sitemapUrls.map(u => {
    const imgTags = (u.images || []).map(img => `
    <image:image>
      <image:loc>${escapeHtml(img)}</image:loc>${u.title ? `
      <image:title>${escapeHtml(u.title)}</image:title>` : ''}
    </image:image>`).join('');
    return `  <url><loc>${u.loc}</loc>${imgTags}
  </url>`;
  }).join('\n')}
</urlset>`;
  await writeFile(path.join(OUTPUT_DIR, 'sitemap.xml'), sitemap, 'utf-8');

  console.log(`Hotovo — vygenerováno ${places.length} stránek míst + /mista/ + sitemap.xml.`);
}

main().catch(err => { console.error('Build selhal:', err); process.exit(1); });
