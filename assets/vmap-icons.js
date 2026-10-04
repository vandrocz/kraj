/* ============================================================
   VANDRO mapa — SVG ikony (nahrazují emoji)
   Jeden zdroj pravdy: stejné path-y se používají pro HTML (inline SVG)
   i pro canvas ikony markerů na mapě (Path2D).
   ============================================================ */
(function () {
  'use strict';

  var GLYPHS = {"castle":["M3 21V8h3v2.5h3V8h6v2.5h3V8h3v13z","M10 21v-4a2 2 0 0 1 4 0v4"],"palace":["M3 21h18","M5 21V11h14v10","M12 3l7 6H5z","M9 21v-5h6v5","M9 14h.01","M15 14h.01"],"ruins":["M3 21h18","M4 21V10l3 2V8l3 2v4l2-2 3 2V9l3-1v13"],"fort":["M6 21V7h2.5v2h2V7h3v2h2V7H18v14z","M10 21v-3.5a2 2 0 0 1 4 0V21","M4 21h16"],"church":["M12 2v5","M10 4h4","M6 21V12l6-5 6 5v9","M3 21h18","M10 21v-4a2 2 0 0 1 4 0v4"],"museum":["M3 21h18","M6 18v-7","M10 18v-7","M14 18v-7","M18 18v-7","M12 3l9 6H3z"],"gallery":["M3 4h18v16H3z","M3 17l5-5 4 4 3-3 6 6","M15.5 8.5h.01"],"tower":["M8 21l1.5-12h5L16 21","M7 9h10","M9 5h6v4H9z","M12 2v3","M6 21h12"],"paw":["M12 12c-3 0-5.5 3-5.5 5.5a2.5 2.5 0 0 0 3 2.4c1-.3 1.7-.6 2.5-.6s1.5.3 2.5.6a2.5 2.5 0 0 0 3-2.4C17.5 15 15 12 12 12z","M5.5 11h.01","M9.5 6.5h.01","M14.5 6.5h.01","M18.5 11h.01"],"leaf":["M5 20c0-9 5-15 15-16 0 10-5 15-15 16z","M5 20c3-5 6-8 11-10"],"home":["M3 11l9-8 9 8","M5 10v11h14V10","M10 21v-6h4v6"],"drop":["M12 3c3.5 4 6 7 6 10a6 6 0 0 1-12 0c0-3 2.5-6 6-10z","M9.5 14a2.5 2.5 0 0 0 2 2.4"],"waves":["M2 8c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2","M2 13c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2","M2 18c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"],"spa":["M12 21c-5 0-8-3-8-8 4 0 7 2 8 5 1-3 4-5 8-5 0 5-3 8-8 8z","M12 18c-2-2.5-3-6 0-10 3 4 2 7.5 0 10z"],"cave":["M3 21c0-8 4-14 9-14s9 6 9 14","M8.5 21c0-4 1.5-7 3.5-7s3.5 3 3.5 7","M2 21h20"],"mine":["M3 21h18","M5 21l2-8h10l2 8","M9 13V8h6v5","M12 8V4","M9 4h6"],"rock":["M4 19l1.5-7L10 7l5 1 4 4-1 7z","M10 7l2 7 6 5","M5.5 12L12 14"],"peak":["M2 20l7-12 4 6 2.5-4L22 20z","M9 8l2 3.5"],"trail":["M12 3v18","M8 21h8","M5 5h11l3 3-3 3H5z","M19 13H8l-3 3 3 3h11z"],"monument":["M12 2l3 5v12H9V7z","M6 21h12","M7.5 19h9"],"gear":["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z","M19.4 13.5a7.5 7.5 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5a7.5 7.5 0 0 0-2.6 1.5l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.4 1 2-3.4z"],"urn":["M9 3h6","M10 3v3c-3 1.2-4.5 4-4.5 7 0 4 2.5 7 6.5 8 4-1 6.5-4 6.5-8 0-3-1.5-5.8-4.5-7V3","M6 12h12"],"info":["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z","M12 11v6","M12 7.5h.01"],"tree":["M12 3a6 6 0 0 0-5.4 8.6A4.5 4.5 0 0 0 9 15.5h6a4.5 4.5 0 0 0 2.4-3.9A6 6 0 0 0 12 3z","M12 15.5V21","M9 21h6"],"ball":["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z","M12 3c3 2.5 3 15.5 0 18","M12 3c-3 2.5-3 15.5 0 18","M3 12h18"],"star":["M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3-5.6-3-5.6 3 1.2-6.3L3 9.6l6.3-.8z"],"snow":["M12 2v20","M4.9 7l14.2 10","M4.9 17L19.1 7","M9.5 3.5L12 6l2.5-2.5","M9.5 20.5L12 18l2.5 2.5"],"hotel":["M4 21V4h12v17","M16 9h4v12","M2 21h20","M8 8h4","M8 12h4","M8 16h4"],"bed":["M2 19V5","M2 15h20v4","M22 15v-3a3 3 0 0 0-3-3H10v6","M6 12.5a1.8 1.8 0 1 0 0-.01"],"cabin":["M3 11l9-7 9 7","M5 10v11h14V10","M9 21v-6h6v6","M16 6.5V4h2v4"],"tent":["M2 20L12 4l10 16z","M12 20l-3-6","M12 20l3-6"],"beer":["M4 8h11v12H4z","M15 10h3a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-3","M4 8a2.5 2.5 0 0 1 2-4 3 3 0 0 1 5-1 3 3 0 0 1 4 3 2 2 0 0 1 0 2","M8 12v5","M11 12v5"],"coffee":["M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z","M17 10h1.5a2.5 2.5 0 0 1 0 5H17","M8 3v3","M12 3v3"],"cake":["M4 20h16v-6H4z","M4 14c0-2 2-3 4-3h8c2 0 4 1 4 3","M12 11V8","M12 5v.01"],"icecream":["M7 12a5 5 0 0 1 10 0","M7 12h10l-5 10z","M9.5 7.5a3 3 0 0 1 5 0"],"wine":["M8 3h8l1 6a5 5 0 0 1-10 0z","M12 14v7","M8 21h8"],"pizza":["M12 22L3 6c5-3 13-3 18 0z","M8.5 9.5h.01","M13.5 11h.01","M10.5 15h.01"],"burger":["M4 11a8 6 0 0 1 16 0z","M3 15h18","M5 18.5c0 1.4 1 2 2.5 2h9c1.5 0 2.5-.6 2.5-2z"],"utensils":["M7 3v8","M4 3v5a3 3 0 0 0 6 0V3","M7 11v10","M17 21V3c-3 1-4 4-4 8v3h4"],"calendar":["M4 6h16v15H4z","M4 10h16","M8 3v4","M16 3v4","M8 14h2","M14 14h2","M8 17.5h2"],"fuel":["M4 21V4h9v17","M3 21h11","M4 10h9","M13 8l3 2v7a1.5 1.5 0 0 0 3 0V9l-2-2"],"parking":["M4 3h16v18H4z","M9 17V7h3.5a3 3 0 0 1 0 6H9"],"train":["M6 3h12a1 1 0 0 1 1 1v12a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V4a1 1 0 0 1 1-1z","M5 11h14","M8.5 15h.01","M15.5 15h.01","M8 19l-2 3","M16 19l2 3"],"bus":["M5 3h14a1 1 0 0 1 1 1v13H4V4a1 1 0 0 1 1-1z","M4 11h16","M7 20v-3","M17 20v-3","M8 14.5h.01","M16 14.5h.01"],"car":["M4 17V12l2-5h12l2 5v5z","M4 12h16","M7 17v2","M17 17v2","M7.5 14.5h.01","M16.5 14.5h.01"],"bike":["M6 19a4 4 0 1 0 0-8 4 4 0 0 0 0 8z","M18 19a4 4 0 1 0 0-8 4 4 0 0 0 0 8z","M6 15l4-8h5","M10 7l3 8h5","M9 7H7"],"bolt":["M13 2L4 14h7l-1 8 9-12h-7z"],"cross":["M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z"],"coin":["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z","M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5","M12 6.5V8","M12 16v1.5"],"mail":["M3 5h18v14H3z","M3 6l9 7 9-7"],"shield":["M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"],"bag":["M5 8h14l1 13H4z","M9 8V6a3 3 0 0 1 6 0v2"],"book":["M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z","M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"],"pin":["M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z","M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"]};

  // Normalizace textu: malá písmena, bez diakritiky, "_" → mezera
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/_/g, ' ').trim();
  }

  // Pořadí pravidel je důležité — specifičtější pravidla jdou první.
  var RULES = [
    [/lyzar|lyzov|\bski\b|sjezd|snow|bezky|bezeck/, 'snow'],
    [/\bhrad|castle|citadel/, 'castle'],
    [/zamek|zamky|zamok|palac|chateau|manor/, 'palace'],
    [/zricenin|zrucanin|ruin|zbytky/, 'ruins'],
    [/pevnost|opevnen|\bfort\b|bunkr|bunker/, 'fort'],
    [/kostel|klaster|kaplnk|kaplick|kostol|sakraln|bazilik|katedral|cirkev|church|chapel|worship|synagog|mesit/, 'church'],
    [/muze|expozic|museum/, 'museum'],
    [/galeri|vystav|gallery/, 'gallery'],
    [/rozhled|vyhlid|vyhliad|vyhlad|viewpoint|lookout|\btower\b/, 'tower'],
    [/\bzoo\b|zoolog|zviera|safari/, 'paw'],
    [/botanic|zahrad|garden|arboret|florist|kvetin/, 'leaf'],
    [/skanzen|lidov|ludov|folk/, 'home'],
    [/lazn|\bspa\b|wellness|termaln|massage|masaz/, 'spa'],
    [/vodopad|waterfall|pramen|\bspring\b|studank|drinking/, 'drop'],
    [/jezer|rybnik|nadrz|vodni|priehrad|\blake\b|pond|reservoir|koupal|kupal|bazen|aquapark|pool|swimming|plaz|beach/, 'waves'],
    [/jeskyn|jaskyn|propast|\bcave\b/, 'cave'],
    [/dulni|hornic|\bmine\b|mining|banik|stolna|\bdul\b/, 'mine'],
    [/skal|skaln|\brock\b|balvan|utvar/, 'rock'],
    [/vrchol|vrch\b|\bhora\b|hory|kopec|\bpeak\b|mountain|sedlo|ferrata|lezeck|horolez/, 'peak'],
    [/naucn|stezk|chodnik|\btrail\b|hiking|cyklotras|cyklostezk|turisticka trasa|turisticky chodnik/, 'trail'],
    [/technick|industrial|elektrarn|prumysl/, 'gear'],
    [/archeolog|archaeolog|vykopav/, 'urn'],
    [/prirodn/, 'tree'],
    [/pomnik|pamatnik|pamiatk|pamatk|socha|monument|memorial|obelisk|historick|kulturn/, 'monument'],
    [/informac|infocentrum|\binfo\b|information/, 'info'],
    [/hotel|motel/, 'hotel'],
    [/hostel|ubytovn|penzion|penzio|guest house|guesthouse|pension|\bbnb\b/, 'bed'],
    [/chata|chalupa|chalet|cabin|\bbouda\b|horska|wilderness|\bhut\b|srub/, 'cabin'],
    [/kemp|camp|glamping|\bstan\b|\btent\b|karavan|caravan/, 'tent'],
    [/apartm|apartment|vila\b|villa|ubytovani|accommodation|shelter|pristresek/, 'home'],
    [/pivovar|brewery|hospod|hostinec|krcma|pivnic|\bpub\b|\bbar\b|beer|pivo|vycep|nightclub/, 'beer'],
    [/kavarn|kaviaren|kaviarn|\bcafe\b|coffee|cajovn|\btea\b/, 'coffee'],
    [/zmrzlin|ice cream|icecream/, 'icecream'],
    [/cukrar|pekar|bakery|dort|\bcake\b|dezert/, 'cake'],
    [/vinar|vinoteka|vinarstvi|\bwine\b|vinic|alcohol/, 'wine'],
    [/pizz/, 'pizza'],
    [/fast food|burger|bistro|kebab|obcerstven|bufet|food court|streetfood|rychle/, 'burger'],
    [/restaur|jidelna|jedalen|gastro|\bfood\b|stravov/, 'utensils'],
    [/\bevent|\bakce\b|\bakci\b|\bakcie\b|podujat|festival|koncert|udalost/, 'calendar'],
    [/fuel|cerpac|benzin|petrol/, 'fuel'],
    [/parking|parkov/, 'parking'],
    [/station|nadrazi|train|\brail\b|vlak/, 'train'],
    [/\bbus\b|autobus|zastavk/, 'bus'],
    [/taxi|car rental|pujcovna aut|autopujcovna|car repair|autoservis|car wash|autodily|car parts|myck/, 'car'],
    [/bike|bicycl|cyklo|cyklobazar/, 'bike'],
    [/charging|nabij/, 'bolt'],
    [/pharmacy|lekarn|hospital|nemocnic|klinik|dentist|zubar|veterin|zdravot|social facility/, 'cross'],
    [/\batm\b|bankomat|\bbank\b|banka/, 'coin'],
    [/post office|posta|\bmail\b/, 'mail'],
    [/police|policie|\bfire\b|hasic|courthouse|soud|embassy|velvysl/, 'shield'],
    [/school|skola|univers|library|knihovn|\bbook|knihkup/, 'book'],
    [/cinema|kino|divadl|theatre|zabav|theme|lunapark|atrakc|attraction/, 'star'],
    [/hrist|ihrisk|playground|sport|fitness|posilov|tenis|futbal|golf|stadion|stadium/, 'ball'],
    [/rezervac|narodni park|\bpark\b|\bles\b|lesy|nature|picnic|piknik|odpocivadl|louka|\btree\b|alej/, 'tree'],
    [/shop|obchod|supermarket|potravin|market|mall|clothes|obleceni|shoes|obuv|electronic|hardware|gift|darek|suvenyr|optik|\btoy\b|hrack|music|photo|jewel|sperk|mobile|stationer|tobacco|trafik|\bpet\b|copy|travel|cestovn|butcher|rezn|drog|laundry|pradeln|hairdress|kadern|retail/, 'bag']
  ];

  var _gcache = {};
  function glyphFor(text) {
    var n = norm(text);
    if (!n) return 'pin';
    if (_gcache[n]) return _gcache[n];
    var out = 'pin';
    if (GLYPHS[n]) out = n;
    else {
      for (var i = 0; i < RULES.length; i++) {
        if (RULES[i][0].test(n)) { out = RULES[i][1]; break; }
      }
    }
    _gcache[n] = out;
    return out;
  }

  function svg(glyph, opts) {
    opts = opts || {};
    var paths = GLYPHS[glyph] || GLYPHS.pin;
    var size = opts.size || '1em';
    var sw = opts.stroke || 2;
    return '<svg class="vm-ico' + (opts.cls ? ' ' + opts.cls : '') + '" xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + sw +
      '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      paths.map(function (d) { return '<path d="' + d + '"/>'; }).join('') + '</svg>';
  }

  // Canvas: vykreslí glyf do středu čtverce (size × size) pomocí Path2D.
  var _p2d = {};
  function drawGlyph(ctx, glyph, size, color, fraction, lineW) {
    var paths = GLYPHS[glyph] || GLYPHS.pin;
    var scale = (size * (fraction || 0.5)) / 24;
    ctx.save();
    ctx.translate(size / 2 - 12 * scale, size / 2 - 12 * scale);
    ctx.scale(scale, scale);
    ctx.strokeStyle = color || '#fff';
    ctx.lineWidth = lineW || 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    paths.forEach(function (d) {
      var p = _p2d[d] || (_p2d[d] = new Path2D(d));
      ctx.stroke(p);
    });
    ctx.restore();
  }

  window.VM_GLYPHS = GLYPHS;
  window.vmGlyphFor = glyphFor;
  window.vmIconSvg = svg;
  window.vmDrawGlyph = drawGlyph;
  window.vmNorm = norm;
})();
