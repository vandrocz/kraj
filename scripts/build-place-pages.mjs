// ============================================================
// VANDRO — generátor SEO stránek míst
//   /mista/index.html          seznam všech míst (filtry, řazení podle polohy)
//   /misto/<slug>/index.html   detail místa (SEO, JSON-LD, galerie, odkaz na mapu)
//   /sitemap-mista.xml         sitemap míst včetně obrázků
// Zdroj dat: Google Sheet (CSV) — stejný jako používá mapa (assets/vmap.js).
// Spuštění: node scripts/build-place-pages.mjs
// Lokální test: SHEET_CSV_FILE=./test.csv node scripts/build-place-pages.mjs
// Bez závislostí (Node 20+).
// ============================================================
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://vandro.cz';
const SHEET_CSV = process.env.SHEET_CSV_URL ||
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vR9YDikPI2qUDSmXOsMmNKkzHUWN9ivO34MZgfQZCFKCjxAAPKQN14gzPrJRGFLE6LJZ3GT-xnhdYYB/pub?gid=0&single=true&output=csv';
const LOGO = 'https://cdn.vandro.cz/Untitled18_20260523111243.png';
const FALLBACK_IMG = 'https://spoznajslovensko.eu/wp-content/uploads/2026/06/GridArt_20260507_233430886-scaled.jpg';
const PAGE_BATCH = 24;

// ---------- pomocné ----------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'misto';

function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  const head = (rows.shift() || []).map((h) => h.trim());
  return rows.filter((r) => r.some((v) => v.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

async function loadRows() {
  if (process.env.SHEET_CSV_FILE) return parseCsv(await readFile(process.env.SHEET_CSV_FILE, 'utf8'));
  const res = await fetch(SHEET_CSV);
  if (!res.ok) throw new Error('Google Sheet: HTTP ' + res.status);
  return parseCsv(await res.text());
}

function shorten(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}
const stripHtml = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- společné styly (sjednocené s vandro.cz) ----------
const BASE_CSS = `
:root{--primary:#1B8F52;--primary-light:#E4F8EC;--bg:#F6FAF7;--text:#10201A;--muted:#64766D;--border:#E4ECE6;--r:14px}
*{box-sizing:border-box}
body{margin:0;font-family:'Inter',system-ui,-apple-system,sans-serif;color:var(--text);background:var(--bg);line-height:1.6}
h1,h2,h3{font-family:'Sora','Inter',sans-serif;line-height:1.25}
a{color:var(--primary)}
.site-header{display:flex;align-items:center;gap:12px;padding:12px 24px;background:#fff;border-bottom:1px solid var(--border);position:sticky;top:0;z-index:10}
.site-header img{height:30px;width:auto;display:block}
.site-nav{margin-left:auto;display:flex;gap:6px;font-size:14px;font-weight:600}
.site-nav a{color:var(--muted);text-decoration:none;padding:8px 14px;border-radius:999px}
.site-nav a:hover,.site-nav a.is-current{background:var(--primary-light);color:var(--primary)}
.wrap{max-width:1080px;margin:0 auto;padding:24px 20px 56px}
.site-footer{border-top:1px solid var(--border);padding:24px 16px 40px;text-align:center;font-size:12px;color:var(--muted);background:#fff}
.site-footer a{color:var(--muted);margin:0 8px;text-decoration:none}
.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 22px;border-radius:999px;background:var(--primary);color:#fff;font-weight:700;text-decoration:none;border:0;cursor:pointer;font-size:15px}
.btn.ghost{background:#fff;color:var(--primary);border:1.5px solid var(--primary)}
`;
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`;
const FAVICON = `<link rel="icon" type="image/png" href="https://cdn.vandro.cz/Untitled15_20260522160351.png"><meta name="theme-color" content="#2FBF71">`;
const header = (current) => `<header class="site-header">
  <a href="/" aria-label="Vandro"><img src="${LOGO}" alt="Vandro" onerror="this.replaceWith(Object.assign(document.createElement('strong'),{textContent:'Vandro'}))"></a>
  <nav class="site-nav"><a href="/mista/"${current === 'mista' ? ' class="is-current"' : ''}>Všechna místa</a><a href="/#map=7/49.2/16.6/liberty/0/0">Mapa</a><a href="/">Vandro</a></nav>
</header>`;
const footer = `<footer class="site-footer">
  <div>© 2026 VANDRO</div>
  <div style="margin-top:6px"><a href="/ochrana-osobnich-udaju.html">Ochrana údajů</a>·<a href="/obchodni-podminky.html">Obchodní podmínky</a>·<a href="/kontakt.html">Kontakt</a></div>
</footer>`;

// ---------- detail místa ----------
function placePage(p, others) {
  const url = `${SITE}/misto/${p.slug}/`;
  const title = `${p.nazov} | Vandro — turistická mapa`;
  const descSrc = stripHtml(p.popis) || `${p.nazov} — ${[p.podkategoria || p.kategoria, p.krajina].filter(Boolean).join(', ')}. Zobrazit na mapě Vandro, naplánovat trasu a objevit další místa v okolí.`;
  const desc = shorten(descSrc, 158);
  const mapLink = `/#${p.slug}/${p.lat}/${p.lng}`;
  const imgs = [p.foto_main, ...p.galeria].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  const og = imgs[0] || FALLBACK_IMG;
  const ld = {
    '@context': 'https://schema.org', '@type': 'TouristAttraction', name: p.nazov, url,
    description: desc, image: imgs.slice(0, 6),
    geo: { '@type': 'GeoCoordinates', latitude: +p.lat, longitude: +p.lng },
    ...(p.krajina ? { address: { '@type': 'PostalAddress', addressCountry: p.krajina } } : {}),
    ...(p.web ? { sameAs: [p.web] } : {}),
  };
  const info = [
    p.kategoria && ['Kategorie', [p.kategoria, p.podkategoria].filter(Boolean).join(' › ')],
    p.krajina && ['Země', p.krajina],
    p.vstup && ['Vstupné', p.vstup],
    p.web && ['Web', `<a href="${esc(p.web)}" target="_blank" rel="noopener nofollow">${esc(p.web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>`, true],
    ['GPS', `${(+p.lat).toFixed(5)}, ${(+p.lng).toFixed(5)}`],
  ].filter(Boolean);
  const near = others.map((o) => `<a class="near" href="/misto/${o.slug}/"><img src="${esc(o.foto_main || FALLBACK_IMG)}" alt="" loading="lazy"><span><strong>${esc(o.nazov)}</strong><small>${esc(o.kategoria)} · ${o.km < 10 ? o.km.toFixed(1).replace('.', ',') : Math.round(o.km)} km</small></span></a>`).join('');
  return `<!DOCTYPE html>
<html lang="cs"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:site_name" content="Vandro"><meta property="og:title" content="${esc(p.nazov)} | Vandro"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${esc(og)}"><meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary_large_image">
${FAVICON}${FONTS}
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<style>${BASE_CSS}
.hero{width:100%;max-height:420px;object-fit:cover;border-radius:var(--r);display:block;background:#dfe9e2}
.crumbs{font-size:13px;color:var(--muted);margin:0 0 14px}.crumbs a{text-decoration:none}
h1{font-size:30px;margin:18px 0 6px}
.tags{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}.tag{background:var(--primary-light);color:var(--primary);border-radius:999px;padding:3px 12px;font-size:12.5px;font-weight:700}
.layout{display:grid;gap:28px;grid-template-columns:1fr}@media(min-width:860px){.layout{grid-template-columns:1fr 320px}}
.card{background:#fff;border:1px solid var(--border);border-radius:var(--r);padding:18px}
.info{list-style:none;margin:0;padding:0}.info li{padding:9px 0;border-bottom:1px solid var(--border);font-size:14px;display:flex;justify-content:space-between;gap:12px}.info li:last-child{border:0}.info span:first-child{color:var(--muted)}.info span:last-child{text-align:right;word-break:break-word}
.desc{font-size:16px;white-space:pre-line}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:20px}.gallery img{width:100%;height:120px;object-fit:cover;border-radius:10px;display:block}
.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
h2{font-size:20px;margin:34px 0 12px}
.nearby{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
.near{display:flex;gap:12px;align-items:center;text-decoration:none;color:var(--text);background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden}.near img{width:84px;height:72px;object-fit:cover}.near span{display:flex;flex-direction:column;padding-right:10px}.near small{color:var(--muted)}
</style></head><body>
${header('misto')}
<main class="wrap">
  <p class="crumbs"><a href="/">Vandro</a> › <a href="/mista/">Místa</a> › ${esc(p.nazov)}</p>
  ${imgs[0] ? `<img class="hero" src="${esc(imgs[0])}" alt="${esc(p.nazov)}" fetchpriority="high">` : ''}
  <h1>${esc(p.nazov)}</h1>
  <div class="tags">${p.kategoria ? `<span class="tag">${esc(p.kategoria)}</span>` : ''}${p.podkategoria ? `<span class="tag">${esc(p.podkategoria)}</span>` : ''}${p.krajina ? `<span class="tag">${esc(p.krajina)}</span>` : ''}</div>
  <div class="layout">
    <div>
      ${p.popis ? `<div class="desc">${esc(stripHtml(p.popis))}</div>` : ''}
      ${imgs.length > 1 ? `<div class="gallery">${imgs.slice(1, 13).map((g) => `<a href="${esc(g)}" target="_blank" rel="noopener"><img src="${esc(g)}" alt="${esc(p.nazov)}" loading="lazy"></a>`).join('')}</div>` : ''}
    </div>
    <aside class="card">
      <ul class="info">${info.map(([k, v, raw]) => `<li><span>${k}</span><span>${raw ? v : esc(v)}</span></li>`).join('')}</ul>
      <div class="actions"><a class="btn" href="${mapLink}">Otevřít na mapě</a><a class="btn ghost" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noopener">Navigovat</a></div>
    </aside>
  </div>
  ${near ? `<h2>Další místa v okolí</h2><div class="nearby">${near}</div>` : ''}
</main>
${footer}
</body></html>`;
}

// ---------- seznam míst ----------
function listPage(places) {
  const kats = [...new Set(places.map((p) => p.kategoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs'));
  const countries = [...new Set(places.map((p) => p.krajina).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs'));
  const cards = places.map((p, i) => `<a class="place-card${Math.floor(i / PAGE_BATCH) ? ' is-more' : ''}" href="/misto/${p.slug}/" data-batch="${Math.floor(i / PAGE_BATCH)}" data-kat="${esc(p.kategoria)}" data-country="${esc(p.krajina)}" data-name="${esc(p.nazov.toLowerCase())}" data-lat="${esc(p.lat)}" data-lng="${esc(p.lng)}" data-orig="${i}">
      <img src="${esc(p.foto_main || FALLBACK_IMG)}" alt="" loading="lazy">
      <div class="place-card-body"><strong>${esc(p.nazov)}</strong><span>${esc([p.kategoria, p.krajina].filter(Boolean).join(' · '))}</span><span class="place-dist" hidden></span></div>
    </a>`).join('\n');
  return `<!DOCTYPE html>
<html lang="cs"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Všechna místa | Vandro — turistická mapa</title>
<meta name="description" content="Kompletní seznam turistických míst na Vandro — hrady, zámky, přírodní zajímavosti, rozhledny a další z celé střední Evropy.">
<link rel="canonical" href="${SITE}/mista/">
<meta property="og:type" content="website"><meta property="og:site_name" content="Vandro"><meta property="og:title" content="Všechna místa | Vandro"><meta property="og:url" content="${SITE}/mista/"><meta property="og:image" content="${FALLBACK_IMG}">
${FAVICON}${FONTS}
<style>${BASE_CSS}
h1{font-size:28px;margin:6px 0}
.filters{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 24px}
.filters input,.filters select{padding:10px 14px;border-radius:999px;border:1px solid var(--border);background:#fff;font-size:14px;font-family:inherit}
.filters input{flex:1;min-width:180px}
.grid{display:grid;grid-template-columns:1fr;gap:14px}@media(min-width:700px){.grid{grid-template-columns:repeat(2,1fr)}}@media(min-width:1000px){.grid{grid-template-columns:repeat(3,1fr)}}
.place-card{display:flex;flex-direction:column;text-decoration:none;color:var(--text);border-radius:var(--r);overflow:hidden;border:1px solid var(--border);background:#fff;transition:box-shadow .15s,transform .15s}
.place-card:hover{box-shadow:0 8px 22px rgba(16,32,26,.12);transform:translateY(-2px)}
.place-card img{width:100%;height:160px;object-fit:cover;background:#dfe9e2}
.place-card-body{padding:12px 14px;display:flex;flex-direction:column;gap:3px}.place-card-body span{font-size:12px;color:var(--muted)}.place-card-body .place-dist{color:var(--primary);font-weight:700}
.place-card.is-hidden{display:none}.place-card.is-more:not(.is-revealed){display:none}
.empty-note{display:none;text-align:center;color:var(--muted);padding:40px 0}
#load-more-btn{display:block;margin:14px auto 0}#load-more-btn.is-done{display:none}
#btn-sort{padding:10px 16px;border-radius:999px;border:1px solid var(--border);background:#fff;font-size:13px;cursor:pointer;font-weight:600;color:var(--primary)}
#sort-note{font-size:12px;color:var(--muted);align-self:center}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;z-index:100;padding:16px}.modal.open{display:flex}
.modal-box{background:#fff;border-radius:var(--r);padding:20px;max-width:380px;width:100%}.modal-box h3{margin:0 0 12px}
.modal-box input{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border);font-size:14px;margin-bottom:10px;font-family:inherit}
.modal-actions{display:flex;gap:8px;flex-wrap:wrap}.modal-actions button{flex:1}
</style></head><body>
${header('mista')}
<main class="wrap">
  <h1>Kam na výlet? <small style="color:var(--muted);font-weight:400">(${places.length})</small></h1>
  <div class="filters">
    <input type="search" id="f-search" placeholder="Hledat podle názvu…" aria-label="Hledat">
    <select id="f-kat" aria-label="Kategorie"><option value="">Všechny kategorie</option>${kats.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}</select>
    <select id="f-country" aria-label="Země"><option value="">Všechny země</option>${countries.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}</select>
    <button id="btn-sort" type="button">Řadit od adresy…</button><span id="sort-note"></span>
  </div>
  <div class="modal" id="modal"><div class="modal-box">
    <h3>Řadit místa od adresy</h3>
    <input type="text" id="sort-input" placeholder="Např. Praha, Brno, Bratislava…">
    <div class="modal-actions"><button class="btn" type="button" id="sort-go">Najít a seřadit</button><button class="btn ghost" type="button" id="sort-gps">Použít GPS</button></div>
    <div id="sort-err" style="color:#B3273C;font-size:12.5px;margin-top:8px;display:none"></div>
  </div></div>
  <div class="grid" id="grid">
${cards}
  </div>
  <p class="empty-note" id="empty-note">Žádná místa neodpovídají filtru.</p>
  <button class="btn ghost" id="load-more-btn" type="button">Načíst další místa</button>
  <div id="sentinel"></div>
</main>
${footer}
<script>
(function(){
  var search=document.getElementById('f-search'),fKat=document.getElementById('f-kat'),fCountry=document.getElementById('f-country');
  var grid=document.getElementById('grid'),cards=Array.prototype.slice.call(grid.children);
  var emptyNote=document.getElementById('empty-note'),more=document.getElementById('load-more-btn'),note=document.getElementById('sort-note');
  var PB=${PAGE_BATCH},maxBatch=Math.max.apply(null,cards.map(function(c){return +c.dataset.batch})),rev=0,filtering=false;
  function reveal(){cards.forEach(function(c){if(+c.dataset.batch===rev)c.classList.add('is-revealed')});rev++;if(rev>maxBatch)more.classList.add('is-done')}
  more.addEventListener('click',reveal);
  new IntersectionObserver(function(e){if(e[0].isIntersecting&&!filtering&&rev<=maxBatch)reveal()},{rootMargin:'400px'}).observe(document.getElementById('sentinel'));
  function apply(){
    var q=search.value.trim().toLowerCase(),k=fKat.value,c=fCountry.value;filtering=!!(q||k||c);var vis=0;
    cards.forEach(function(card){var ok=(!q||card.dataset.name.indexOf(q)>-1)&&(!k||card.dataset.kat===k)&&(!c||card.dataset.country===c);
      card.classList.toggle('is-hidden',!ok);if(filtering&&ok)card.classList.add('is-revealed');if(ok)vis++});
    more.style.display=filtering?'none':'';emptyNote.style.display=vis?'none':'block';
  }
  search.addEventListener('input',apply);fKat.addEventListener('change',apply);fCountry.addEventListener('change',apply);
  reveal();
  function km(a,b,c,d){var R=6371,r=function(x){return x*Math.PI/180},dl=r(c-a),dn=r(d-b),h=Math.sin(dl/2)*Math.sin(dl/2)+Math.cos(r(a))*Math.cos(r(c))*Math.sin(dn/2)*Math.sin(dn/2);return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))}
  function sortBy(lat,lng){
    var arr=cards.map(function(c,i){var la=parseFloat(c.dataset.lat),ln=parseFloat(c.dataset.lng);return{c:c,i:i,d:isFinite(la)&&isFinite(ln)?km(lat,lng,la,ln):Infinity}});
    arr.sort(function(a,b){return(a.d-b.d)||(a.i-b.i)});
    arr.forEach(function(o,idx){o.c.dataset.batch=String(Math.floor(idx/PB));o.c.classList.remove('is-revealed');grid.appendChild(o.c);
      var el=o.c.querySelector('.place-dist');if(isFinite(o.d)){el.textContent=o.d<10?o.d.toFixed(1).replace('.',',')+' km':Math.round(o.d)+' km';el.hidden=false}else el.hidden=true});
    cards=arr.map(function(o){return o.c});rev=0;more.classList.remove('is-done');reveal();apply();
  }
  var modal=document.getElementById('modal'),inp=document.getElementById('sort-input'),err=document.getElementById('sort-err');
  document.getElementById('btn-sort').addEventListener('click',function(){modal.classList.add('open');inp.focus()});
  modal.addEventListener('click',function(e){if(e.target===modal)modal.classList.remove('open')});
  document.getElementById('sort-gps').addEventListener('click',function(){err.style.display='none';
    navigator.geolocation.getCurrentPosition(function(p){sortBy(p.coords.latitude,p.coords.longitude);note.textContent='Řazeno podle vaší polohy';modal.classList.remove('open')},
      function(){err.textContent='GPS polohu se nepodařilo získat.';err.style.display='block'})});
  function go(){var q=inp.value.trim();err.style.display='none';if(!q)return;
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(q)).then(function(r){return r.json()}).then(function(d){
      if(!d||!d.length){err.textContent='Adresu se nepodařilo najít.';err.style.display='block';return}
      sortBy(parseFloat(d[0].lat),parseFloat(d[0].lon));note.textContent='Řazeno od adresy: '+q;modal.classList.remove('open')
    }).catch(function(){err.textContent='Vyhledávání adresy selhalo.';err.style.display='block'})}
  document.getElementById('sort-go').addEventListener('click',go);inp.addEventListener('keydown',function(e){if(e.key==='Enter')go()});
})();
</script>
</body></html>`;
}

// ---------- hlavní běh ----------
const rows = await loadRows();
const used = new Map(); const places = [];
for (const r of rows) {
  const lat = parseFloat(r.lat), lng = parseFloat(r.lng);
  if (!r.nazov || !isFinite(lat) || !isFinite(lng)) continue;
  let slug = slugify(r.nazov);
  if (used.has(slug)) { let n = 2; while (used.has(slug + '-' + n)) n++; slug = slug + '-' + n; }
  used.set(slug, true);
  places.push({
    slug, nazov: r.nazov, lat: String(lat), lng: String(lng), kategoria: r.kategoria || '', podkategoria: r.podkategoria || '',
    krajina: r.krajina || '', popis: r.popis || '', foto_main: r.foto_main || '', vstup: r.vstup || '', web: r.web || '',
    galeria: (r.galeria || '').split(',').map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s)),
  });
}
if (places.length < 5) throw new Error('Z Google Sheetu se načetlo příliš málo míst (' + places.length + ') — stránky nepřepisuji.');

await rm(path.join(ROOT, 'misto'), { recursive: true, force: true });
await mkdir(path.join(ROOT, 'mista'), { recursive: true });
await writeFile(path.join(ROOT, 'mista', 'index.html'), listPage(places));

const hav = (a, b, c, d) => { const R = 6371, r = (x) => x * Math.PI / 180, dl = r(c - a), dn = r(d - b), h = Math.sin(dl / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dn / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)); };
for (const p of places) {
  const others = places.filter((o) => o !== p).map((o) => ({ ...o, km: hav(+p.lat, +p.lng, +o.lat, +o.lng) })).sort((a, b) => a.km - b.km).slice(0, 6);
  const dir = path.join(ROOT, 'misto', p.slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), placePage(p, others));
}

const today = new Date().toISOString().slice(0, 10);
const sm = [`<?xml version="1.0" encoding="UTF-8"?>`, `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`,
  `  <url><loc>${SITE}/mista/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`];
for (const p of places) {
  const imgs = [p.foto_main, ...p.galeria].filter(Boolean).slice(0, 10);
  sm.push(`  <url><loc>${SITE}/misto/${p.slug}/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority>` +
    imgs.map((u) => `<image:image><image:loc>${esc(u)}</image:loc><image:title>${esc(p.nazov)}</image:title></image:image>`).join('') + `</url>`);
}
sm.push('</urlset>');
await writeFile(path.join(ROOT, 'sitemap-mista.xml'), sm.join('\n') + '\n');

// robots.txt — doplnit odkaz na sitemap míst
const robotsPath = path.join(ROOT, 'robots.txt');
if (existsSync(robotsPath)) {
  let rb = await readFile(robotsPath, 'utf8');
  if (!rb.includes('sitemap-mista.xml')) { rb = rb.replace(/\s*$/, '\n') + `Sitemap: ${SITE}/sitemap-mista.xml\n`; await writeFile(robotsPath, rb); }
}
console.log(`Hotovo: ${places.length} míst → /mista/, /misto/*/, /sitemap-mista.xml`);
