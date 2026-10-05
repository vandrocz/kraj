// ============================================================
//  VANDRO MAPA — MapLibre GL JS (sloučeno do hlavní domény vandro.cz)
//  Původně samostatná aplikace na maps.vandro.cz. Spouští se přes
//  window.vmapInit() z assets/map.js (viz mapa je součástí SPA).
//  Nové vrstvy (atrakce / ubytování / gastro / události) jsou v
//  assets/vmap-layers.js, SVG ikony v assets/vmap-icons.js.
// ============================================================
const vmRoot = () => document.getElementById('vmap-root');

// ── Pozícia mapy — URL hash + localStorage fallback ───────────
const MAP_STATE_KEY = 'vandro_map_state';

function saveMapState() {
  if (!map) return;
  // Neprepisuj hash ak je aktívna zdieľaná trasa
  if (location.hash.includes('#route=')) return;
  const c = map.getCenter();
  const z = map.getZoom().toFixed(4);
  const lat = c.lat.toFixed(5);
  const lng = c.lng.toFixed(5);
  const b = map.getBearing().toFixed(1);
  const p = map.getPitch().toFixed(1);
  const base = currentBaseLayer;
  try {
    history.replaceState(null, '', `#map=${z}/${lat}/${lng}/${base}/${b}/${p}`);
  } catch {}
  try { localStorage.setItem(MAP_STATE_KEY, JSON.stringify({ lng: +lng, lat: +lat, zoom: +z, bearing: +b, pitch: +p, baseLayer: base })); } catch {}
}

// Načíta vandro bod z URL hash #place=slug/lat/lng a otvorí jeho panel
function _openPlaceFromHash() {
  try {
    const hash = location.hash.slice(1); // bez #
    if (!hash || hash.startsWith('map=') || hash.startsWith('route=')) return;
    // Formát: slug/lat/lng
    const parts = hash.split('/');
    if (parts.length < 3) return;
    const lat = parseFloat(parts[parts.length - 2]);
    const lng = parseFloat(parts[parts.length - 1]);
    if (isNaN(lat) || isNaN(lng)) return;
    const p = allPlaces.find(pl => Math.abs(+pl.lat - lat) < 0.001 && Math.abs(+pl.lng - lng) < 0.001);
    if (!p) return;
    map.setCenter([lng, lat]);
    showPlaceDetail(p);
  } catch {}
}


function loadMapState() {
  // 1. URL hash má prednosť
  try {
    const hash = location.hash.replace('#','');
    if (hash.startsWith('map=')) {
      const parts = hash.slice(4).split('/');
      if (parts.length >= 4) {
        return {
          zoom: parseFloat(parts[0]),
          lat: parseFloat(parts[1]),
          lng: parseFloat(parts[2]),
          baseLayer: parts[3] || 'liberty',
          bearing: parseFloat(parts[4] || 0),
          pitch: parseFloat(parts[5] || 0),
        };
      }
    }
  } catch {}
  // 2. Fallback — localStorage
  try { return JSON.parse(localStorage.getItem(MAP_STATE_KEY)); } catch { return null; }
}

// ── GPS poloha ────────────────────────────────────────────────
let userLocation = null;
let gpsWatchId = null;
function initUserLocation() {
  if (!navigator.geolocation) return;
  const startWatch = () => {
    if (gpsWatchId) return; // už beží
    gpsWatchId = navigator.geolocation.watchPosition(
      pos => {
        const ll = [pos.coords.longitude, pos.coords.latitude];
        userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        // Marker vytvoríme automaticky, ak ešte neexistuje — takto sa poloha
        // zobrazí sama vždy, keď ju má používateľ už povolenú, nielen po
        // kliknutí na tlačidlo "Moje poloha".
        if (gpsMarker) gpsMarker.setLngLat(ll);
        else placeGpsMarker(ll);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  };
  // Spustíme sledovanie ihneď len vtedy, ak už má používateľ polohu
  // POVOLENÚ z minula — nechceme pri prvej návšteve vyskočiť s
  // vyžiadaním súhlasu bez toho, aby si o to niekto vyžiadal kliknutím.
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'geolocation' }).then(status => {
      if (status.state === 'granted') startWatch();
      status.onchange = () => { if (status.state === 'granted') startWatch(); };
    }).catch(() => {});
  }
  // Ak appka o povolenie požiada inde (tlačidlo "Moje poloha"), nech sa
  // priebežné sledovanie spustí aj bez podpory Permissions API.
  window._startGpsWatch = startWatch;
}

// ── GPS kruhový marker ─────────────────────────────────────────
function placeGpsMarker(ll) {
  if(gpsMarker) gpsMarker.remove();
  const el=document.createElement('div');
  el.className='gps-dot-marker';
  el.innerHTML=`<div class="gps-dot-pulse"></div><div class="gps-dot-core"></div>`;
  gpsMarker=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat(ll).addTo(map);
}

// ── Dočasný pin (search / long press / right click) ───────────
let tempPinMarker=null;
function placeTempPin(lat,lng) {
  if(tempPinMarker){tempPinMarker.remove();tempPinMarker=null;}
  const el=document.createElement('div');
  el.className='temp-pin-marker';
  el.innerHTML=`<div class="temp-pin-pulse"></div><div class="temp-pin-dot"></div>`;
  tempPinMarker=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([lng,lat]).addTo(map);
}
function removeTempPin(){if(tempPinMarker){tempPinMarker.remove();tempPinMarker=null;}}

// ── Vzdialenosť ───────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function fmtDist(km) {
  if (km < 1) return `${Math.round(km*1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

// ── Štýly máp ─────────────────────────────────────────────────
// STRATÉGIA: Topo a Satelit sú čisté rasterové štýly BEZ glyphs/sprite/vector sources.
// Popisky miest (place labels) pridávame cez CanvasSource aby sme sa vyhli
// akýmkoľvek async fetchom ktoré spôsobovali nekonečné načítavanie.

const STYLES = {
  // Základná mapa — OpenFreeMap Liberty (vektorová, rýchla CDN)
  liberty: (typeof MAP_STYLE_URL !== 'undefined' ? MAP_STYLE_URL : '/assets/map-style.json'),

  // Turistická mapa: OFM štýl + Waymarked Trails prekryv (minzoom 13)
  // Vrstevnice sa pridávajú dynamicky cez maplibre-contour
  topo: (typeof MAP_STYLE_TOPO_URL !== 'undefined' ? MAP_STYLE_TOPO_URL : '/assets/map-style-topo.json'),

  // Zimná mapa: svetlý OFM podklad + OpenSnowMap prekryv (lyžiarske svahy, bežky)
  zima: {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
    sources: {
      openmaptiles: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet'
      },
      opensnowmap: {
        type: 'raster',
        tiles: ['https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© <a href="https://www.opensnowmap.org">OpenSnowMap</a> contributors'
      }
    },
    layers: [
      // Svetlý podklad — len základné prvky
      { id:'z-background', type:'background', paint:{'background-color':'#f0f4f8'} },
      { id:'z-water', type:'fill', source:'openmaptiles', 'source-layer':'water',
        paint:{'fill-color':'#b3d9f7'} },
      { id:'z-landuse-park', type:'fill', source:'openmaptiles', 'source-layer':'landuse',
        filter:['in',['get','class'],['literal',['park','forest','grass','meadow','wood']]],
        paint:{'fill-color':'#deefd8','fill-opacity':0.7} },
      { id:'z-roads', type:'line', source:'openmaptiles', 'source-layer':'transportation',
        filter:['in',['get','class'],['literal',['motorway','trunk','primary','secondary','tertiary']]],
        paint:{'line-color':'#d0d8e0','line-width':['interpolate',['linear'],['zoom'],8,0.5,14,3]} },
      { id:'z-roads-minor', type:'line', source:'openmaptiles', 'source-layer':'transportation',
        minzoom:12,
        filter:['in',['get','class'],['literal',['minor','service','track','path']]],
        paint:{'line-color':'#e0e8f0','line-width':['interpolate',['linear'],['zoom'],12,0.5,16,2]} },
      { id:'z-buildings', type:'fill', source:'openmaptiles', 'source-layer':'building',
        minzoom:14, paint:{'fill-color':'#dde3ea','fill-opacity':0.6} },
      // OpenSnowMap prekryv — lyžiarske zjazdovky, bežecké trasy, vleky
      { id:'z-snowmap', type:'raster', source:'opensnowmap',
        paint:{'raster-opacity':0.85,'raster-fade-duration':200} },
      // POI — rovnaká štruktúra ako v liberty/topo JSON, source 'openmaptiles' je dostupný
      { id:'z-poi-transit', type:'symbol', source:'openmaptiles', 'source-layer':'poi',
        filter:['match',['geometry-type'],['MultiPoint','Point'],true,false],
        layout:{
          'icon-image':['to-string',['get','class']],
          'icon-size':0.7,
          'text-anchor':'left',
          'text-field':['coalesce',['get','name_en'],['get','name']],
          'text-font':['Noto Sans Regular'],'text-max-width':9,'text-offset':[0.9,0],'text-size':11,
          'text-optional':true
        },
        paint:{'text-color':'#2e5a80','text-halo-color':'#fff','text-halo-width':1,'text-halo-blur':0.5}
      },
      { id:'z-poi-r1', type:'symbol', source:'openmaptiles', 'source-layer':'poi',
        minzoom:15,
        filter:['all',['match',['geometry-type'],['MultiPoint','Point'],true,false],
          ['>=',['get','rank'],1],['<',['get','rank'],7]],
        layout:{
          'icon-image':['match',['get','subclass'],['florist','furniture'],['get','subclass'],['get','class']],
          'text-anchor':'top',
          'text-field':['coalesce',['get','name_en'],['get','name']],
          'text-font':['Noto Sans Regular'],'text-max-width':9,'text-offset':[0,0.6],'text-size':11,
          'text-optional':true
        },
        paint:{'text-color':'#666','text-halo-blur':0.5,'text-halo-color':'#fff','text-halo-width':1}
      },
      { id:'z-poi-r7', type:'symbol', source:'openmaptiles', 'source-layer':'poi',
        minzoom:16,
        filter:['all',['match',['geometry-type'],['MultiPoint','Point'],true,false],
          ['>=',['get','rank'],7],['<',['get','rank'],20]],
        layout:{
          'icon-image':['match',['get','subclass'],['florist','furniture'],['get','subclass'],['get','class']],
          'text-anchor':'top',
          'text-field':['coalesce',['get','name_en'],['get','name']],
          'text-font':['Noto Sans Regular'],'text-max-width':9,'text-offset':[0,0.6],'text-size':11,
          'text-optional':true
        },
        paint:{'text-color':'#666','text-halo-blur':0.5,'text-halo-color':'#fff','text-halo-width':1}
      },
      { id:'z-poi-r20', type:'symbol', source:'openmaptiles', 'source-layer':'poi',
        minzoom:17,
        filter:['all',['match',['geometry-type'],['MultiPoint','Point'],true,false],
          ['>=',['get','rank'],20]],
        layout:{
          'icon-image':['match',['get','subclass'],['florist','furniture'],['get','subclass'],['get','class']],
          'text-anchor':'top',
          'text-field':['coalesce',['get','name_en'],['get','name']],
          'text-font':['Noto Sans Regular'],'text-max-width':9,'text-offset':[0,0.6],'text-size':11,
          'text-optional':true
        },
        paint:{'text-color':'#666','text-halo-blur':0.5,'text-halo-color':'#fff','text-halo-width':1}
      },
      // Popisky miest
      { id:'z-place-village', type:'symbol', source:'openmaptiles', 'source-layer':'place',
        minzoom:10, filter:['==',['get','class'],'village'],
        layout:{'text-field':['coalesce',['get','name_en'],['get','name']],
          'text-font':['Noto Sans Regular'],'text-size':12,'text-max-width':8},
        paint:{'text-color':'#334','text-halo-color':'rgba(255,255,255,0.9)','text-halo-width':2} },
      { id:'z-place-town', type:'symbol', source:'openmaptiles', 'source-layer':'place',
        minzoom:8, filter:['==',['get','class'],'town'],
        layout:{'text-field':['coalesce',['get','name_en'],['get','name']],
          'text-font':['Noto Sans Bold'],'text-size':14,'text-max-width':8},
        paint:{'text-color':'#223','text-halo-color':'rgba(255,255,255,0.95)','text-halo-width':2.5} },
      { id:'z-place-city', type:'symbol', source:'openmaptiles', 'source-layer':'place',
        minzoom:5, filter:['==',['get','class'],'city'],
        layout:{'text-field':['coalesce',['get','name_en'],['get','name']],
          'text-font':['Noto Sans Bold'],'text-size':['interpolate',['linear'],['zoom'],5,13,12,18],'text-max-width':8},
        paint:{'text-color':'#112','text-halo-color':'rgba(255,255,255,0.95)','text-halo-width':3} },
      { id:'z-place-country', type:'symbol', source:'openmaptiles', 'source-layer':'place',
        maxzoom:7, filter:['==',['get','class'],'country'],
        layout:{'text-field':['coalesce',['get','name_en'],['get','name']],
          'text-font':['Noto Sans Bold'],'text-size':['interpolate',['linear'],['zoom'],2,11,6,16],'text-max-width':7},
        paint:{'text-color':'#334','text-halo-color':'rgba(255,255,255,0.9)','text-halo-width':2.5} }
    ]
  },

    // Satelitná mapa: ESRI World Imagery (najrýchlejší globálny CDN)
  // + OFM vektorové popisky — biele s tmavým okrajom, dobre čitateľné na satelite
  satelit: {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
    sources: {
      // ESRI World Imagery — globálna CDN, veľmi rýchla
      esri: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256, maxzoom: 19,
        attribution: '© Esri, Maxar, Earthstar Geographics'
      },
      // OFM vektorové tiles — použijeme len pre popisky (place, water_name, transportation_name)
      openmaptiles: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet'
      }
    },
    layers: [
      // Satelitný podklad
      { id: 'satelit-base', type: 'raster', source: 'esri', paint: { 'raster-fade-duration': 0 } },
      // ── Vodné plochy — modrý italic popis ──────────────────────
      { id: 'sat-water-label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'water_name',
        layout: { 'text-field': ['coalesce',['get','name_en'],['get','name']], 'text-font': ['Noto Sans Italic'],
          'text-size': ['interpolate',['linear'],['zoom'],6,11,12,14], 'text-max-width': 6 },
        paint: { 'text-color': '#aaddff', 'text-halo-color': 'rgba(0,20,60,0.85)', 'text-halo-width': 2, 'text-halo-blur': 0.5 }
      },
      // ── Obce / dediny ──────────────────────────────────────────
      { id: 'sat-village-label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
        minzoom: 10,
        filter: ['==', ['get','class'], 'village'],
        layout: { 'text-field': ['coalesce',['get','name_en'],['get','name']], 'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate',['linear'],['zoom'],10,11,14,14], 'text-max-width': 8,
          'text-anchor': 'bottom', 'icon-image': ['step',['zoom'],'circle_11_black',11,''], 'icon-size': 0.25 },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 2, 'text-halo-blur': 0 }
      },
      // ── Mestá (town) ───────────────────────────────────────────
      { id: 'sat-town-label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
        minzoom: 8,
        filter: ['==', ['get','class'], 'town'],
        layout: { 'text-field': ['coalesce',['get','name_en'],['get','name']], 'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate',['linear'],['zoom'],8,12,13,16], 'text-max-width': 8,
          'text-anchor': 'bottom', 'icon-image': ['step',['zoom'],'circle_11_black',10,''], 'icon-size': 0.3 },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 2.5, 'text-halo-blur': 0 }
      },
      // ── Väčšie mestá (city) ────────────────────────────────────
      { id: 'sat-city-label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
        minzoom: 5,
        filter: ['==', ['get','class'], 'city'],
        layout: { 'text-field': ['coalesce',['get','name_en'],['get','name']], 'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate',['linear'],['zoom'],5,12,8,15,12,20], 'text-max-width': 8,
          'text-anchor': 'bottom', 'icon-image': ['step',['zoom'],'circle_11_black',10,''], 'icon-size': 0.4 },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.95)', 'text-halo-width': 3, 'text-halo-blur': 0 }
      },
      // ── Štáty ──────────────────────────────────────────────────
      { id: 'sat-state-label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
        minzoom: 5, maxzoom: 8,
        filter: ['==', ['get','class'], 'state'],
        layout: { 'text-field': ['coalesce',['get','name_en'],['get','name']], 'text-font': ['Noto Sans Italic'],
          'text-size': ['interpolate',['linear'],['zoom'],5,10,8,13], 'text-transform': 'uppercase',
          'text-letter-spacing': 0.15 },
        paint: { 'text-color': '#ffe880', 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 2, 'text-halo-blur': 0.5 }
      },
      // ── Krajiny ────────────────────────────────────────────────
      { id: 'sat-country-label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
        maxzoom: 7,
        filter: ['==', ['get','class'], 'country'],
        layout: { 'text-field': ['coalesce',['get','name_en'],['get','name']], 'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate',['linear'],['zoom'],2,11,6,18], 'text-max-width': 7 },
        paint: { 'text-color': '#ffe880', 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 2.5, 'text-halo-blur': 0.5 }
      }
    ]
  }
};

// ── Farby trás ────────────────────────────────────────────────
const ROUTE_NETWORK_COLORS = {
  iwn:'#c0392b', nwn:'#e67e22', rwn:'#2980b9', lwn:'#27ae60',
  icn:'#8e44ad', ncn:'#d35400', rcn:'#16a085', lcn:'#2c3e50',
};
// OSM taguje farbu turistickej/cyklo značky slovom (colour=red/blue/green/…),
// nie hexom — preto treba názov farby najprv preložiť. Farby zodpovedajú
// zaužívanému stredoeurópskemu značeniu (KST/KČT): červená, modrá, zelená, žltá.
const ROUTE_COLOUR_NAMES = {
  red:'#e30613', blue:'#0066b3', green:'#00963f', yellow:'#ffd500',
  orange:'#f39c12', purple:'#8e44ad', violet:'#8e44ad', black:'#2c3e50',
  white:'#bbbbbb', brown:'#8b4513', gray:'#7f8c8d', grey:'#7f8c8d',
};
function getRouteColor(tags) {
  // 1) Priama farba (moderné tagovanie, ale v ČR/SR pomerne zriedkavé)
  const raw = (tags['route:colour'] || tags.colour || '').trim().toLowerCase();
  if (raw && !raw.includes(';')) {
    if (ROUTE_COLOUR_NAMES[raw]) return ROUTE_COLOUR_NAMES[raw];
    const hex = raw.startsWith('#') ? raw : '#'+raw;
    if (/^#[0-9a-f]{3,6}$/.test(hex)) return hex;
  }
  // 2) osmc:symbol — bežný spôsob značenia KČT/KST tras vo formáte
  // "waycolor:background:foreground:…"; prvá časť pred dvojbodkou je
  // reálna farba trasy (napr. "red:red:white_stripe" → červená).
  const osmc = (tags['osmc:symbol'] || '').trim().toLowerCase();
  if (osmc) {
    const wayColor = osmc.split(':')[0];
    if (ROUTE_COLOUR_NAMES[wayColor]) return ROUTE_COLOUR_NAMES[wayColor];
  }
  // 3) Staršie české kct_red/kct_blue/kct_green/kct_yellow tagy (predchádzali
  // zavedeniu relácií, no na časti tras sa stále vyskytujú).
  if (tags.kct_red) return ROUTE_COLOUR_NAMES.red;
  if (tags.kct_blue) return ROUTE_COLOUR_NAMES.blue;
  if (tags.kct_green) return ROUTE_COLOUR_NAMES.green;
  if (tags.kct_yellow) return ROUTE_COLOUR_NAMES.yellow;
  // 4) Fallback podľa úrovne siete, keď nič z vyššie uvedeného chýba
  return ROUTE_NETWORK_COLORS[tags.network] || (tags.route==='bicycle' ? '#8e44ad' : '#3498db');
}

// ── OSM typy POI ──────────────────────────────────────────────
const OSM_TYPES = {
  // Stravovanie
  restaurant:       { icon:'', color:'#e74c3c', minZoom:15, label:'Restaurace',       keys:[['amenity','restaurant']] },
  cafe:             { icon:'',  color:'#f39c12', minZoom:15, label:'Kavárna',           keys:[['amenity','cafe']] },
  fast_food:        { icon:'', color:'#d35400', minZoom:15, label:'Rychlé občerstvení',           keys:[['amenity','fast_food']] },
  pub:              { icon:'', color:'#8b4513', minZoom:16, label:'Hospoda / Bar',         keys:[['amenity','pub'],['amenity','bar']] },
  ice_cream:        { icon:'', color:'#e91e8c', minZoom:17, label:'Zmrzlina',            keys:[['amenity','ice_cream']] },
  food_court:       { icon:'', color:'#e67e22', minZoom:16, label:'Food Court',          keys:[['amenity','food_court']] },
  // Ubytovanie
  hotel:            { icon:'', color:'#3498db', minZoom:14, label:'Hotel',               keys:[['tourism','hotel']] },
  hostel:           { icon:'', color:'#9b59b6', minZoom:14, label:'Hostel / Penzion',   keys:[['tourism','hostel'],['tourism','guest_house']] },
  camp_site:        { icon:'', color:'#16a085', minZoom:16, label:'Kemp / Chata',        keys:[['tourism','camp_site'],['tourism','chalet'],['tourism','wilderness_hut']] },
  apartment:        { icon:'', color:'#2980b9', minZoom:16, label:'Apartmán',            keys:[['tourism','apartment']] },
  // Doprava
  fuel:             { icon:'', color:'#c0392b', minZoom:17, label:'Čerpací stanice',    keys:[['amenity','fuel']] },
  parking:          { icon:'🅿', color:'#607d8b', minZoom:17, label:'Parkoviště',          keys:[['amenity','parking']] },
  station:          { icon:'', color:'#2980b9', minZoom:13, label:'Vlaková nádraží',    keys:[['railway','station']] },
  bus_stop:         { icon:'', color:'#16a085', minZoom:16, label:'Zastávka',            keys:[['highway','bus_stop'],['amenity','bus_station']] },
  taxi:             { icon:'', color:'#f1c40f', minZoom:17, label:'Taxi',                keys:[['amenity','taxi']] },
  car_rental:       { icon:'', color:'#2980b9', minZoom:16, label:'Půjčovna aut',       keys:[['amenity','car_rental']] },
  bike_rental:      { icon:'', color:'#27ae60', minZoom:17, label:'Půjčovna kol',  keys:[['amenity','bicycle_rental']] },
  charging:         { icon:'', color:'#27ae60', minZoom:17, label:'Nabíjecí stanice',   keys:[['amenity','charging_station']] },
  // Kultúra / Históia
  castle:           { icon:'', color:'#8e44ad', minZoom:12, label:'Hrad',                keys:[['historic','castle']] },
  ruins:            { icon:'', color:'#5d4037', minZoom:14, label:'Zřícenina',           keys:[['historic','ruins']] },
  museum:           { icon:'', color:'#16a085', minZoom:15, label:'Muzeum',              keys:[['tourism','museum']] },
  gallery:          { icon:'', color:'#9b59b6', minZoom:16, label:'Galerie',             keys:[['tourism','gallery']] },
  viewpoint:        { icon:'', color:'#e74c3c', minZoom:16, label:'Rozhledna',           keys:[['tourism','viewpoint']] },
  monument:         { icon:'', color:'#795548', minZoom:16, label:'Památník',             keys:[['historic','monument'],['historic','memorial']] },
  archaeological:   { icon:'', color:'#8d6e63', minZoom:15, label:'Arch. lokalita',      keys:[['historic','archaeological_site']] },
  fort:             { icon:'', color:'#6d4c41', minZoom:13, label:'Pevnost',             keys:[['historic','fort']] },
  // Príroda / Outdoor
  zoo:              { icon:'', color:'#ff5722', minZoom:13, label:'ZOO',                 keys:[['tourism','zoo'],['tourism','theme_park']] },
  information:      { icon:'', color:'#3498db', minZoom:16, label:'Infocentrum',        keys:[['tourism','information']] },
  picnic_site:      { icon:'', color:'#27ae60', minZoom:17, label:'Piknikové místo',    keys:[['tourism','picnic_site']] },
  park:             { icon:'', color:'#2e7d32', minZoom:15, label:'Park / Zahrada',      keys:[['leisure','park'],['leisure','garden'],['leisure','nature_reserve']] },
  playground:       { icon:'', color:'#3498db', minZoom:16, label:'Hřiště',             keys:[['leisure','playground']] },
  sports_centre:    { icon:'', color:'#27ae60', minZoom:16, label:'Sport / Bazén',       keys:[['leisure','sports_centre'],['leisure','swimming_pool'],['leisure','fitness_centre']] },
  golf:             { icon:'', color:'#2e7d32', minZoom:14, label:'Golf',                keys:[['leisure','golf_course']] },
  peak:             { icon:'', color:'#795548', minZoom:13, label:'Vrchol',                keys:[['natural','peak']] },
  waterfall:        { icon:'', color:'#2196f3', minZoom:14, label:'Vodopád',             keys:[['waterway','waterfall']] },
  cave:             { icon:'', color:'#5d4037', minZoom:14, label:'Jeskyně',             keys:[['natural','cave_entrance']] },
  spring:           { icon:'', color:'#2196f3', minZoom:17, label:'Pramen',              keys:[['natural','spring']] },
  beach:            { icon:'', color:'#f39c12', minZoom:14, label:'Pláž',               keys:[['natural','beach']] },
  // Obchody
  supermarket:      { icon:'', color:'#f39c12', minZoom:15, label:'Supermarket',         keys:[['shop','supermarket'],['shop','convenience']] },
  bakery:           { icon:'', color:'#d4a017', minZoom:16, label:'Pekárna',             keys:[['shop','bakery']] },
  butcher:          { icon:'', color:'#c0392b', minZoom:17, label:'Řeznictví',          keys:[['shop','butcher']] },
  drogerie:         { icon:'', color:'#1abc9c', minZoom:16, label:'Drogerie',            keys:[['shop','chemist']] },
  clothes:          { icon:'', color:'#e91e8c', minZoom:16, label:'Oblečení',           keys:[['shop','clothes'],['shop','fashion']] },
  shoes:            { icon:'', color:'#795548', minZoom:17, label:'Obuv',                keys:[['shop','shoes']] },
  electronics:      { icon:'', color:'#2c3e50', minZoom:16, label:'Elektronika',         keys:[['shop','electronics'],['shop','computer']] },
  hardware:         { icon:'', color:'#607d8b', minZoom:17, label:'Dům a zahrada',       keys:[['shop','doityourself'],['shop','hardware'],['shop','garden_centre']] },
  sports_shop:      { icon:'', color:'#27ae60', minZoom:16, label:'Sportovní potřeby',    keys:[['shop','sports']] },
  books:            { icon:'', color:'#8e44ad', minZoom:17, label:'Knihkupectví',        keys:[['shop','books']] },
  gift:             { icon:'', color:'#e74c3c', minZoom:17, label:'Dárky / Suvenýry',  keys:[['shop','gift'],['shop','souvenir']] },
  florist:          { icon:'', color:'#e91e8c', minZoom:17, label:'Květinářství',        keys:[['shop','florist']] },
  optician:         { icon:'', color:'#2980b9', minZoom:17, label:'Optika',              keys:[['shop','optician']] },
  mall:             { icon:'', color:'#e67e22', minZoom:14, label:'Obchodní centrum',    keys:[['shop','mall']] },
  marketplace:      { icon:'', color:'#f39c12', minZoom:15, label:'Tržiště',       keys:[['amenity','marketplace']] },
  // Zdravie
  pharmacy:         { icon:'', color:'#e74c3c', minZoom:16, label:'Lékárna',             keys:[['amenity','pharmacy']] },
  hospital:         { icon:'', color:'#c0392b', minZoom:14, label:'Nemocnice',           keys:[['amenity','hospital'],['amenity','clinic']] },
  dentist:          { icon:'', color:'#2980b9', minZoom:17, label:'Zubař',               keys:[['amenity','dentist']] },
  veterinary:       { icon:'', color:'#27ae60', minZoom:17, label:'Veterinář',           keys:[['amenity','veterinary']] },
  // Služby
  atm:              { icon:'', color:'#34495e', minZoom:17, label:'Bankomat',            keys:[['amenity','atm']] },
  bank:             { icon:'', color:'#2c3e50', minZoom:16, label:'Banka',               keys:[['amenity','bank']] },
  post_office:      { icon:'', color:'#f39c12', minZoom:17, label:'Pošta',               keys:[['amenity','post_office']] },
  library:          { icon:'', color:'#2c3e50', minZoom:16, label:'Knihovna',            keys:[['amenity','library']] },
  cinema:           { icon:'', color:'#2c3e50', minZoom:17, label:'Kino / Divadlo',      keys:[['amenity','cinema'],['amenity','theatre']] },
  place_of_worship: { icon:'', color:'#8b4513', minZoom:16, label:'Kostel / Kaple',    keys:[['amenity','place_of_worship']] },
  police:           { icon:'', color:'#2c3e50', minZoom:15, label:'Policie',             keys:[['amenity','police']] },
  fire_station:     { icon:'', color:'#e74c3c', minZoom:15, label:'Hasičská stanice',    keys:[['amenity','fire_station']] },
  toilets:          { icon:'', color:'#1abc9c', minZoom:17, label:'Toalety',             keys:[['amenity','toilets']] },
  drinking_water:   { icon:'', color:'#2196f3', minZoom:17, label:'Pitná voda',          keys:[['amenity','drinking_water']] },
  shelter:          { icon:'', color:'#795548', minZoom:16, label:'Přístřešek',          keys:[['amenity','shelter']] },
  hairdresser:      { icon:'', color:'#9b59b6', minZoom:17, label:'Kadeřnictví',         keys:[['shop','hairdresser'],['shop','beauty']] },
  laundry:          { icon:'', color:'#1abc9c', minZoom:17, label:'Prádelna',            keys:[['shop','laundry'],['amenity','laundry']] },
  embassy:          { icon:'', color:'#2c3e50', minZoom:14, label:'Velvyslanectví',      keys:[['amenity','embassy']] },
  courthouse:       { icon:'', color:'#2c3e50', minZoom:15, label:'Soud',                keys:[['amenity','courthouse']] },
  // Ďalšie obchody a služby
  toy_shop:         { icon:'', color:'#ff9800', minZoom:17, label:'Hračky',               keys:[['shop','toys']] },
  music_shop:       { icon:'', color:'#9c27b0', minZoom:17, label:'Hudební nástroje',             keys:[['shop','musical_instrument']] },
  photo_shop:       { icon:'', color:'#607d8b', minZoom:17, label:'Foto',                 keys:[['shop','photo']] },
  jewellery:        { icon:'', color:'#ffd700', minZoom:17, label:'Šperky',               keys:[['shop','jewelry'],['shop','jewellery']] },
  mobile_phone:     { icon:'', color:'#2196f3', minZoom:17, label:'Mobily',               keys:[['shop','mobile_phone']] },
  stationery:       { icon:'', color:'#795548', minZoom:17, label:'Papírnictví',         keys:[['shop','stationery']] },
  tobacco:          { icon:'', color:'#5d4037', minZoom:17, label:'Tabák / Trafika',     keys:[['shop','tobacco'],['shop','newsagent']] },
  alcohol:          { icon:'', color:'#880e4f', minZoom:17, label:'Alkohol',              keys:[['shop','alcohol'],['shop','wine']] },
  bicycle_shop:     { icon:'', color:'#388e3c', minZoom:17, label:'Cyklobazár',           keys:[['shop','bicycle']] },
  car_repair:       { icon:'', color:'#546e7a', minZoom:16, label:'Autoservis',           keys:[['shop','car_repair'],['shop','tyres']] },
  car_parts:        { icon:'', color:'#455a64', minZoom:17, label:'Autodíly',             keys:[['shop','car_parts']] },
  pet_shop:         { icon:'', color:'#8d6e63', minZoom:17, label:'Chovatelské potřeby', keys:[['shop','pet']] },
  copyshop:         { icon:'', color:'#607d8b', minZoom:17, label:'Kopírovna / Tisk',        keys:[['shop','copyshop'],['shop','print']] },
  travel_agency:    { icon:'', color:'#1565c0', minZoom:17, label:'Cestovní agentura',   keys:[['shop','travel_agency']] },
  massage:          { icon:'', color:'#e91e8c', minZoom:17, label:'Masáže / Wellness',   keys:[['shop','massage'],['leisure','spa']] },
  school:           { icon:'', color:'#1565c0', minZoom:14, label:'Škola',               keys:[['amenity','school'],['amenity','kindergarten']] },
  university:       { icon:'', color:'#283593', minZoom:13, label:'Univerzita',           keys:[['amenity','university'],['amenity','college']] },
  nightclub:        { icon:'', color:'#6a1b9a', minZoom:16, label:'Noční klub',          keys:[['amenity','nightclub'],['amenity','events_venue']] },
  car_wash:         { icon:'', color:'#0288d1', minZoom:17, label:'Myčka aut',        keys:[['amenity','car_wash']] },
  social_facility:  { icon:'', color:'#1a237e', minZoom:15, label:'Sociální zařízení', keys:[['amenity','social_facility']] },
};

const TAG_TO_TYPE = {};
Object.entries(OSM_TYPES).forEach(([type, conf]) => {
  conf.keys.forEach(([k, v]) => { TAG_TO_TYPE[`${k}=${v}`] = type; });
});

// ── Kategórie vlastných miest → OSM typ ──────────────────────
// Hodnoty .icon v OSM_TYPES a PODKATEGORIA_ICONS jsou názvy SVG glyfů (viz vmap-icons.js) —
// doplní se hned níže, emoji se už nikde nepoužívají.
const KATEGORIA_TO_TYPE = {
  // Hrady / História
  'hrady':'castle','hrad':'castle','hrady a zámky':'castle','zámok':'castle',
  'zrúcanina':'ruins','zrucanina':'ruins','ruiny':'ruins',
  'pamiatka':'monument','pamätník':'monument','pamiatky':'monument','pomník':'monument',
  'archeológia':'archaeological','archaeological':'archaeological',
  'pevnosť':'fort','fort':'fort',
  // Múzeá / Kultúra
  'múzeum':'museum','muzeum':'museum','múzeá':'museum',
  'galéria':'gallery','galeria':'gallery','výstava':'gallery',
  // Výhľady
  'vyhliadka':'viewpoint','rozhľadňa':'viewpoint','rozhladna':'viewpoint','výhľad':'viewpoint',
  // Príroda
  'piknik':'picnic_site','odpočívadlo':'picnic_site','oddych':'picnic_site',
  'park':'park','záhrada':'park','zahrada':'park','les':'park','príroda':'park','rezervácia':'park',
  'vodopád':'waterfall','vodopad':'waterfall',
  'jaskyňa':'cave','jaskyna':'cave',
  'vrch':'peak','kopec':'peak','hora':'peak',
  'prameň':'spring','pramene':'spring',
  'pláž':'beach','pláže':'beach',
  // Ubytovanie
  'hotel':'hotel','ubytovanie':'hostel','penzión':'hostel','penzion':'hostel',
  'hostel':'hostel','apartmán':'apartment','apartman':'apartment',
  'kemp':'camp_site','kemping':'camp_site','chata':'camp_site','turistická chata':'camp_site',
  // Stravovanie
  'reštaurácia':'restaurant','restauracia':'restaurant','jedáleň':'restaurant',
  'kaviareň':'cafe','kaviarneň':'cafe','café':'cafe','kaviarňa':'cafe','coffee':'cafe',
  'bar':'pub','krčma':'pub','pivnica':'pub','hospoda':'pub','vinárstvo':'pub',
  'zmrzlina':'ice_cream','cukráreň':'ice_cream',
  'rýchle občerstvenie':'fast_food','kebab':'fast_food',
  // Šport
  'šport':'sports_centre','sport':'sports_centre','bazén':'sports_centre','fitness':'sports_centre',
  'ihrisko':'playground','detské ihrisko':'playground',
  'golf':'golf',
  // Doprava
  'parkovisko':'parking','parking':'parking',
  'čerpacia stanica':'fuel','benzínka':'fuel',
  // Obchody
  'obchod':'supermarket','potraviny':'supermarket','obchody':'supermarket',
  'drogéria':'drogerie','drogeria':'drogerie',
  'oblečenie':'clothes','móda':'clothes',
  'elektronika':'electronics',
  // Zdravie
  'kostol':'place_of_worship','kaplnka':'place_of_worship','kostoly':'place_of_worship','cirkev':'place_of_worship',
  'zoo':'zoo','zábavný park':'zoo','zábava':'zoo',
  'informácie':'information','info':'information','turistické info':'information',
  'nemocnica':'hospital','zdravotníctvo':'hospital','klinika':'hospital',
  'lekáreň':'pharmacy','lekaren':'pharmacy',
  'toalety':'toilets',
  'banka':'bank','bankomat':'atm',
  // Ďalšie podkategórie
  'hračky':'toy_shop','hračkárstvo':'toy_shop',
  'hudobniny':'music_shop','hudba':'music_shop',
  'foto':'photo_shop','fotografia':'photo_shop',
  'šperky':'jewellery','klenotníctvo':'jewellery',
  'mobily':'mobile_phone','telefóny':'mobile_phone',
  'papiernictvo':'stationery','papier':'stationery',
  'tabak':'tobacco','trafika':'tobacco','novinár':'tobacco',
  'alkohol':'alcohol','víno':'alcohol','vinotéka':'alcohol',
  'cyklobazar':'bicycle_shop','bicykle':'bicycle_shop',
  'autoservis':'car_repair','pneuservis':'car_repair',
  'autodily':'car_parts','auto diely':'car_parts',
  'chovateľské potreby':'pet_shop','zvieratá':'pet_shop',
  'kópia':'copyshop','tlač':'copyshop','copy centrum':'copyshop',
  'cestovná agentúra':'travel_agency','cestovka':'travel_agency',
  'masáže':'massage','wellness':'massage','spa':'massage',
  'škola':'school','základná škola':'school','stredná škola':'school','škôlka':'school',
  'univerzita':'university','vysoká škola':'university',
  'nočný klub':'nightclub','bar / klub':'nightclub','diskotéka':'nightclub',
  'autoumyváreň':'car_wash','čistiareň áut':'car_wash',
  'krčma':'pub','hostinec':'pub',
  'čerpacia stanica':'fuel',
};

// ── Priame ikony pre podkategórie (emoji → vždy v zelenom kruhu) ─────
// Kľúč = text podkategórie (lowercase). Pokrýva vlastné podkategórie z Google Sheets.
// Ak podkategória nie je tu, použije sa KATEGORIA_TO_TYPE → OSM_TYPES ako fallback.
const PODKATEGORIA_ICONS = {
  // Hrady & História
  'hrad':'','hrady':'','zámok':'','zámky':'',
  'zrúcanina':'','ruiny':'','zbytky':'',
  'pamiatka':'','pomník':'','pamätník':'','socha':'',
  'archeológia':'','archaeológia':'',
  'pevnosť':'','opevnenie':'',
  // Kostoly & Sakrálne
  'kostol':'','kaplnka':'','kláštor':'','bazilika':'','katedrála':'','cirkev':'',
  // Múzeá & Kultúra
  'múzeum':'','múzeá':'','expozícia':'',
  'galéria':'','výstava':'',
  'kino':'','divadlo':'',
  // Vyhliadky
  'vyhliadka':'','rozhľadňa':'','výhľad':'',
  // Príroda
  'vodopád':'','vodopad':'',
  'jaskyňa':'','jaskyne':'',
  'vrch':'','kopec':'','hora':'','vrchol':'',
  'prameň':'','minerálny prameň':'',
  'pláž':'','jazero':'','rybník':'',
  'park':'','záhrada':'','lesy':'','príroda':'',
  'piknik':'','odpočívadlo':'','lavička':'',
  'rezervácia':'',
  // ZOO & Atrakcie
  'zoo':'','zábavný park':'','aquapark':'','hrad pre deti':'',
  // Turistika & Outdoor
  'turistický chodník':'','náučný chodník':'','turistická trasa':'',
  'cyklotrasa':'','cyklistická trasa':'','bike trail':'',
  'ferrata':'','lezecká stena':'','horolezectvo':'',
  'lyžovanie':'','ski':'','bežky':'',
  // Ubytovanie
  'hotel':'','hotely':'','ubytovanie':'',
  'penzión':'','chata':'','kemping':'','kemp':'',
  'hostel':'','apartmán':'','apartmány':'',
  // Stravovanie
  'reštaurácia':'','jedáleň':'','reštaurácie':'',
  'kaviareň':'','kaviarňa':'','café':'','coffee':'',
  'pivnica':'','krčma':'','hostinec':'','pub':'','bar':'',
  'zmrzlina':'','cukráreň':'',
  'rýchle občerstvenie':'','fast food':'','kebab':'',
  'pizzeria':'','pizza':'',
  // Obchody
  'supermarket':'','potraviny':'','obchod':'',
  'pekáreň':'','mäsiarstvo':'',
  'drogéria':'','lekáreň':'',
  'oblečenie':'','móda':'','obuv':'','topánky':'',
  'elektronika':'','mobily':'','telefóny':'',
  'knihy':'','kníhkupectvo':'',
  'darčeky':'','suveníry':'',
  'kvetinárstvo':'','kvetiny':'',
  'šport':'','športové potreby':'',
  // Zdravie & Služby
  'nemocnica':'','klinika':'',
  'zubár':'','stomatológ':'',
  'veterinár':'',
  'banka':'','bankomat':'',
  'pošta':'',
  'polícia':'',
  'čerpacia stanica':'','benzínka':'',
  'parkovisko':'🅿',
  'toalety':'',
  'info centrum':'','turistické info':'',
  // Šport & Voľný čas
  'bazén':'','kúpalisko':'','aqua':'',
  'fitness':'','posilňovňa':'',
  'golf':'','golfové ihrisko':'',
  'tenisový kurt':'','tenis':'',
  'futbalové ihrisko':'','futbal':'',
  'detské ihrisko':'','ihrisko':'',
  // Doprava
  'vlakové nádražie':'','nádražie':'','stanica':'',
  'autobusová stanica':'','zastávka':'',
  'letisko':'',

  // ── Reálne podkategórie z Google Sheets (presné texty) ────────
  // Hrady & História (sheets)
  'historické a kulturní památky':'',
  'sakrální památky':'',
  'hrady a zámky':'',
  'skanzeny a lidová architektura':'',
  'jezera a vodní nádrže':'',
  'vodopády':'',
  'jeskyně a propasti':'',
  'důlní díla a hornictví':'',
  'naučné stezky':'',
  'lázně':'',
  'koupaliště':'',
  'rozhledny a vyhlídky':'',
  'muzea a galerie':'',
  'zoologické zahrady a parky':'',
  'botanické zahrady a parky':'',
  'turistické atrakce':'',
  'skály a skalní města':'',
  'jiné atrakce':'',
};

Object.keys(OSM_TYPES).forEach(k => { OSM_TYPES[k].icon = vmGlyphFor(k); });
Object.keys(PODKATEGORIA_ICONS).forEach(k => { PODKATEGORIA_ICONS[k] = vmGlyphFor(k); });

// ── VLASTNÍ OBRÁZKOVÉ IKONY KATEGORIÍ (jedno centrální místo) ─────────
// Sem stačí doplnit URL vlastního .webp/.png obrázku pro danou kategorii —
// klíč je buď přesný text podkategorie/kategorie z Google Sheets (malými
// písmeny, přesně jako výše v PODKATEGORIA_ICONS), nebo interní typ z
// OSM_TYPES (např. 'castle', 'museum', 'viewpoint'…). Jakmile je zde klíč
// vyplněný, obrázek se automaticky použije všude, kde se dané ikony
// zobrazují — detail místa, seznam míst v okolí, vyhledávání, legenda,
// oblíbené, náhodný tip… A TAKÉ přímo v pinu na mapě (viz addCustomIcons
// níže — obrázek se asynchronně načte a vloží doprostřed kolečka pinu).
// Kategorie, které zde nemají obrázek, zůstanou se svým emoji všude.
const CATEGORY_ICON_IMAGES = {
  // Příklad: 'hrady a zámky': 'https://cdn.vandro.cz/Untitled23_20260822220535.webp',
  // Příklad: 'castle': 'https://cdn.vandro.cz/Untitled23_20260822220535.webp',
};
function _categoryIconHtml(glyphOrEmoji, key) {
  const url = key ? CATEGORY_ICON_IMAGES[key] : null;
  if (url) return `<img src="${url}" class="cat-icon-img" alt="">`;
  return vmIconSvg(vmGlyphFor(key || glyphOrEmoji));
}

// Asynchrónne načítanie obrázkov pre piny na mapě. _categoryImgCache[url] je
// buď Promise (kým sa sťahuje), alebo hotový HTMLImageElement po načítaní,
// alebo null, ak sa načítanie nepodařilo (vtedy zostane pin s emoji).
const _categoryImgCache = {};
function _preloadCategoryImage(url) {
  if (_categoryImgCache[url]) return _categoryImgCache[url];
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // nutné, aby canvas s obrázkom nebol "tainted"
    img.onload = () => {
      _categoryImgCache[url] = img;
      resolve(img);
      // Obrázok práve dorazil — preregistrujeme ikony na mape, nech sa pin prekreslí.
      if (typeof vmRefreshCategoryImages === 'function' && typeof map !== 'undefined' && map && map.isStyleLoaded && map.isStyleLoaded()) {
        try { vmRefreshCategoryImages(); } catch (e) { console.warn('category icon refresh:', e); }
      }
    };
    img.onerror = () => { resolve(null); };
    img.src = url;
  });
  _categoryImgCache[url] = p;
  return p;
}
function _resolveCategoryImage(key) {
  const url = key ? CATEGORY_ICON_IMAGES[key] : null;
  if (!url) return null;
  const cached = _categoryImgCache[url];
  if (cached instanceof Image) return cached;
  _preloadCategoryImage(url); // spustí sťahovanie na pozadí, teraz vrátime null (padne späť na emoji)
  return null;
}

// ── Globálny stav ─────────────────────────────────────────────
let map;
// Escapuje HTML špeciálne znaky — používame všade, kde sa do innerHTML/atribútov
// vkladá text z externých zdrojov (OSM/Photon/Nominatim výsledky, vyhľadávací
// dotaz) alebo od používateľa (názvy zoznamov), aby nešlo o XSS vektor.
// (escapeHtml je definováno v assets/config.js — stejná implementace)
// Bezpečné vloženie textu ako JS string argumentu vo vnútri HTML onclick
// atribútu — encodeURIComponent zneškodní aj úvodzovky/apostrofy/lomítka,
// takže text (napr. názov miesta z externého zdroja) nemôže "vyskočiť" ani
// z HTML atribútu, ani z JS string literálu. Na druhej strane sa dekóduje
// cez decodeURIComponent.
function _jsAttrSafe(str) {
  return encodeURIComponent(String(str ?? '')).replace(/'/g, '%27');
}

let allPlaces = [];
let currentCategory = 'all';
// Která VANDRO místa se zobrazí: vrstva zapnutá + povolené podkategorie (panel Vrstvy)
// + případný rychlý filtr z vyhledávacího panelu (currentCategory).
function _vandroVisiblePlaces() {
  const ls = (typeof vmLayerState === 'function') ? vmLayerState('vandro') : null;
  if (ls && !ls.on) return [];
  const off = ls && ls.off ? new Set(ls.off) : null;
  return allPlaces.filter(p => {
    const k = p.podkategoria || p.kategoria;
    if (currentCategory !== 'all' && k !== currentCategory) return false;
    if (off && off.has(k)) return false;
    return true;
  });
}
let currentBaseLayer = 'liberty';
let routeWaypoints = [];
let isCreatingRoute = false;
let osmLoadTimer = null;
let routesLoadTimer = null;
let lastOsmKey = '';
let lastRoutesKey = '';
let routeLineId = 0;
let iconsLoaded = false;
let gpsMarker = null;
let searchOutlineActive = false;
let searchOutlineOsmId = null;
let searchOutlineOsmType = null;
let searchMarker = null;
let longPressTimer = null;
let longPressFired = false;
// Nearby panel stav
let _nearbyDetailActive = false;
let _nearbyListScrollTop = 0;
let _hlActive = null;

const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR9YDikPI2qUDSmXOsMmNKkzHUWN9ivO34MZgfQZCFKCjxAAPKQN14gzPrJRGFLE6LJZ3GT-xnhdYYB/pub?gid=0&single=true&output=csv';
const HISTORY_KEY = 'vandro_history';

// ── Overpass load balancing ───────────────────────────────────
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
let _overpassIdx = 0;
async function overpassFetch(query, timeoutMs = 12000) {
  const url = OVERPASS_ENDPOINTS[_overpassIdx % OVERPASS_ENDPOINTS.length];
  _overpassIdx++;
  return fetch(`${url}?data=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(timeoutMs)
  });
}

// ── Canvas icon cache ─────────────────────────────────────────
const _iconCache = new Map();

// ── História ──────────────────────────────────────────────────
function getHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; } }
function saveHistory(p) {
  let h = getHistory().filter(x => x.nazov !== (p.nazov || p.name));
  h.unshift({ nazov: p.nazov || p.name || 'Místo', lat: +p.lat, lng: +p.lng, kategoria: p.kategoria || 'Místo', podkategoria: p.podkategoria||'' });
  if (h.length > 8) h.length = 8;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
}

// Cache pre kliky na výsledky vyhľadávania/históriu — objekt sa NIKDY neserializuje
// priamo do HTML onclick atribútu (názov miesta s apostrofom by inak rozbil celé HTML).
window._pickCache = [];
function _stashPick(p) { window._pickCache.push(p); return window._pickCache.length - 1; }
window._pickFromCache = idx => { const p = window._pickCache[idx]; if (!p) { console.warn('_pickFromCache: chybajúca položka pre index', idx); return; } try { window._pick(p); } catch(e) { console.error('_pick zlyhalo:', e); } };
window._msoPickHistoryFromCache = idx => { const p = window._pickCache[idx]; if (!p) { console.warn('_msoPickHistoryFromCache: chybajúca položka pre index', idx); return; } try { window._msoPickHistory(p); } catch(e) { console.error('_msoPickHistory zlyhalo:', e); } };
window._deskPickPlaceFromCache = idx => {
  const p = window._pickCache[idx];
  if (!p) { console.warn('_deskPickPlaceFromCache: chybajúca položka pre index', idx); return; }
  if (!window._deskPickPlace) { console.warn('_deskPickPlaceFromCache: _deskPickPlace ešte nie je pripravené (panel vyhledávání nebyl otevřen)'); return; }
  try { window._deskPickPlace(p); } catch(e) { console.error('_deskPickPlace zlyhalo:', e); }
};
window._clearHistory = () => { localStorage.removeItem(HISTORY_KEY); document.querySelectorAll('.search-results').forEach(e => e.classList.add('hidden')); };

// ── UI helpers ────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const topBar = () => $('top-ui-bar');

function closeAllPanels() {
  _deactivateWeatherMode();
  $('desktop-sidebar').classList.add('panel-hidden');
  const vp = $('vandro-panel'); if (vp) vp.classList.add('panel-hidden');
  topBar().classList.remove('sidebar-open');
  $('panel-backdrop').classList.remove('active');
  const s = $('mobile-bottom-sheet');
  if (s) { s.classList.remove('sheet-preview-only','sheet-expanded'); s.classList.add('sheet-hidden'); }
  clearSearchOutline();
  _nearbyDetailActive = false;
  setPlaceHighlight(null);
  window._vandroPanelReturn = false;
  // Vymaž place hash z URL (nahraď späť map hash)
  try {
    if (location.hash.startsWith('#place=')) saveMapState();
  } catch {}
}
function closeMobilePanels() {
  _deactivateWeatherMode();
  document.querySelectorAll('.mobile-panel').forEach(p => p.classList.add('hidden'));
  const so = $('mobile-search-overlay');
  if (so) so.classList.add('hidden');
  $('panel-backdrop').classList.remove('active');
}
window.closeDesktopPanels = closeAllPanels;

// Otvorenie sidebar — mapa zostáva plne interaktívna (žiaden backdrop)
function openSidebar(html) {
  _deactivateWeatherMode();
  const s = $('mobile-bottom-sheet');
  if (s) { s.classList.remove('sheet-preview-only','sheet-expanded'); s.classList.add('sheet-hidden'); }
  closeMobilePanels();
  // Zatvoriť VANDRO panel ak je otvorený
  const vp = $('vandro-panel'); if (vp) vp.classList.add('panel-hidden');
  $('desktop-sidebar-inner').innerHTML = html;
  $('desktop-sidebar-inner').scrollTop = 0;
  $('desktop-sidebar').classList.remove('panel-hidden');
  topBar().classList.add('sidebar-open');
  // Backdrop NEpridávame — mapa musí zostať klikateľná a posuvná
  $('panel-backdrop').classList.remove('active');
}

// Otvorenie mobile sheet — najprv zavrie desktop a route sheet
// expanded=true → sheet sa otvorí plne (pre info panely); false → preview (pre body na mape)
function openMobileSheet(title, thumbSrc, content, expanded, opts) {
  _deactivateWeatherMode();
  $('desktop-sidebar').classList.add('panel-hidden');
  topBar().classList.remove('sidebar-open');
  $('panel-backdrop').classList.remove('active');
  closeMobilePanels();
  // Zavrieme route sheet ak je otvorený
  const rs = $('mobile-route-sheet');
  if (rs) { rs.classList.remove('sheet-preview-only','sheet-expanded'); rs.classList.add('sheet-hidden'); }
  const so = $('mobile-search-overlay');
  if (so) so.classList.add('hidden');
  $('mobile-content').innerHTML = content;
  $('mobile-content').scrollTop = 0;
  $('mobile-title').innerHTML = title;
  const t = $('mobile-thumb');
  if (thumbSrc) { t.src = thumbSrc; t.style.display = 'block'; } else t.style.display = 'none';
  const sub = $('mobile-subtitle');
  if (sub) sub.innerHTML = opts?.subtitle || '';
  const actions = $('mobile-preview-actions');
  if (actions) actions.innerHTML = opts?.actionsHtml || '';
  const s = $('mobile-bottom-sheet');
  s.classList.remove('sheet-hidden','sheet-preview-only','sheet-expanded');
  s.classList.add(expanded ? 'sheet-expanded' : 'sheet-preview-only');
  // Malá šípka "Späť" — viditeľná len keď je obsah otvorený z Vandro (About) panela
  const backBtn = $('sheet-back-btn');
  if (backBtn) backBtn.classList.toggle('hidden', !window._vandroPanelReturn);
}

function updateCompass() {
  const b = map.getBearing();
  ['btn-north','btn-north-mobile'].forEach(id => {
    const el = $(id); if (!el) return;
    const n = el.querySelector('.compass-needle');
    if (n) n.style.transform = `rotate(${-b}deg)`;
    el.classList.toggle('rotated', Math.abs(b) > 1);
  });
}

function getIconForKategoria(k, sub) {
  const subKey=(sub||'').toLowerCase().trim();
  const katKey=(k||'').toLowerCase().trim();
  // 1. Priame emoji z PODKATEGORIA_ICONS (najrýchlejšie)
  if(subKey && PODKATEGORIA_ICONS[subKey]) return _categoryIconHtml(PODKATEGORIA_ICONS[subKey], subKey);
  if(katKey && PODKATEGORIA_ICONS[katKey]) return _categoryIconHtml(PODKATEGORIA_ICONS[katKey], katKey);
  // 2. Cez KATEGORIA_TO_TYPE → OSM_TYPES
  const subT = subKey ? KATEGORIA_TO_TYPE[subKey] : null;
  const katT = KATEGORIA_TO_TYPE[katKey];
  const t = subT || katT;
  if (t) return _categoryIconHtml(OSM_TYPES[t]?.icon||'', t);
  // Bez přesné shody (např. kategorie registrovaných podniků) — odvodíme glyf z textu
  return _categoryIconHtml('', subKey || katKey || 'pin');
}
function getIconForOsmType(t) { return _categoryIconHtml(OSM_TYPES[t]?.icon||'', t); }

// ── Obrys vyhľadaného miesta ──────────────────────────────────
function showSearchMarkerDot(lat, lng) {
  if (searchMarker) { searchMarker.remove(); searchMarker = null; }
  const el = document.createElement('div');
  el.style.cssText = 'width:16px;height:16px;background:#2b8a3e;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4);pointer-events:none;';
  searchMarker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
}

async function showSearchOutline(osmId, osmType) {
  clearSearchOutline();
  searchOutlineOsmId = osmId; searchOutlineOsmType = osmType;
  if (!osmId || !osmType) return false;
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/details.php?osmtype=${osmType}&osmid=${osmId}&polygon_geojson=1&format=json`, { headers:{'Accept-Language':'cs,sk'} });
    if (!r.ok) return false;
    const data = await r.json();
    const geom = data.geometry;
    if (!geom || !['Polygon','MultiPolygon','LineString','MultiLineString'].includes(geom.type)) return false;
    removeOutlineLayers();
    map.addSource('search-outline-src', { type:'geojson', data:{ type:'Feature', geometry:geom, properties:{} }});
    if (geom.type==='Polygon'||geom.type==='MultiPolygon') {
      map.addLayer({ id:'search-outline-fill', type:'fill', source:'search-outline-src',
        paint:{ 'fill-color':'#2b8a3e', 'fill-opacity':0.12 } });
    }
    map.addLayer({ id:'search-outline-line', type:'line', source:'search-outline-src',
      paint:{ 'line-color':'#2b8a3e', 'line-width':3, 'line-opacity':0.95 } });
    // Vždy úplne navrchu — inak ho môžu prekryť novšie vlastné vrstvy (halo
    // uložených miest, nahraté vlastné body), ktoré sa pridávajú až po ňom.
    try { if (map.getLayer('search-outline-fill')) map.moveLayer('search-outline-fill'); } catch {}
    try { map.moveLayer('search-outline-line'); } catch {}
    searchOutlineActive = true;
    return true; // obrys sa zobrazil
  } catch(e) { console.warn('Outline:', e); return false; }
}

function removeOutlineLayers() {
  ['search-outline-fill','search-outline-line'].forEach(id => { try { if(map.getLayer(id)) map.removeLayer(id); } catch {} });
  try { if(map.getSource('search-outline-src')) map.removeSource('search-outline-src'); } catch {}
}
function clearSearchOutline() {
  removeOutlineLayers(); searchOutlineActive=false; searchOutlineOsmId=null; searchOutlineOsmType=null;
  if (searchMarker) { searchMarker.remove(); searchMarker=null; }
  removeTempPin();
}

// ── Reverse geocode ───────────────────────────────────────────
async function showReverseGeocodePanel(lat, lng) {
  placeTempPin(lat,lng); // Dočasný bod pri pravom kliku / long press
  const isMobile = window.innerWidth <= 768;
  const coordStr = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const loader = `<div class="panel-inner" style="padding:30px 0;text-align:center;color:#888"><div class="spinner" style="margin:0 auto 12px"></div><p style="font-size:13px">Načítám informace…</p></div>`;
  if (isMobile) openMobileSheet(coordStr, null, loader);
  else openSidebar(`<div class="sidebar-header"><h3><i class="fa-solid fa-location-dot"></i> ${coordStr}</h3><button class="btn-close" onclick="closeDesktopPanels()"><i class="fa-solid fa-xmark"></i></button></div><div class="panel-content">${loader}</div>`);
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&extratags=1&namedetails=1&zoom=18`,{ headers:{'Accept-Language':'cs,sk'} });
    if (!r.ok) return;
    const data = await r.json();
    const addr=data.address||{}, extra=data.extratags||{}, names=data.namedetails||{};
    const name = data.name||names.name||addr.road||addr.suburb||addr.city||addr.town||'Místo';
    const iconType = TAG_TO_TYPE[`${data.class||''}=${data.type||''}`]||null;
    const icon = iconType ? vmIconSvg(vmGlyphFor(iconType)) : vmIconSvg('pin');
    const rows = buildInfoRows({
      addrStr:[addr.road,addr.house_number].filter(Boolean).join(' '),
      cityStr:[addr.city||addr.town||addr.village||addr.hamlet,addr.postcode,addr.country].filter(Boolean).join(', '),
      opening_hours:extra.opening_hours, phone:extra.phone||extra['contact:phone'],
      web:extra.website||extra['contact:website'], email:extra.email||extra['contact:email'],
      operator:extra.operator, brand:extra.brand, cuisine:extra.cuisine,
      wheelchair:extra.wheelchair, fee:extra.fee, access:extra.access,
      ele:extra.ele, capacity:extra.capacity, religion:extra.religion, denomination:extra.denomination,
      sport:extra.sport, surface:extra.surface, architect:extra.architect, start_date:extra.start_date,
      material:extra.material, inscription:extra.inscription, description:extra.description, wikidata:extra.wikidata,
    });
    const html = `<div class="panel-inner">
      <div class="panel-title-row"><span class="place-icon-emoji">${icon}</span><h2 class="panel-title">${escapeHtml(name)}</h2></div>
      ${data.display_name?`<p class="panel-subtitle">${escapeHtml(data.display_name)}</p>`:''}
      <ul class="panel-info-list">${rows}</ul>
      <div class="panel-footer">
        <div class="gps-row"><span>${coordStr}</span><button onclick="copyGps(${lat},${lng})" class="btn-copy">Kopírovat GPS</button></div>
        <button onclick="startRoutingToPlace(${lat},${lng},'${_jsAttrSafe(name)}')" class="btn-route-plan"><i class="fas fa-route"></i> Naplánovat trasu</button>
        <button onclick="sharePoint()" class="btn-share"><i class="fas fa-share-alt"></i> Sdílet</button>
      </div></div>`;
    if (isMobile) { $('mobile-content').innerHTML=html; $('mobile-title').innerHTML=`${icon} ${escapeHtml(name)}`; }
    else openSidebar(`<div class="sidebar-header"><h3>${icon} ${escapeHtml(name)}</h3><button class="btn-close" onclick="closeDesktopPanels()"><i class="fa-solid fa-xmark"></i></button></div><div class="panel-content">${html}</div>`);
  } catch(e) { console.warn('RevGeo:',e); }
}

// ── Info riadky ────────────────────────────────────────────────
function buildInfoRows(d) {
  const rows = [];
  const row = (ico,lbl,val) => { if (val) rows.push(`<li><i class="${ico}"></i><span><strong>${lbl}:</strong> ${val}</span></li>`); };
  const link = (ico,lbl,url) => { if (url) rows.push(`<li><i class="${ico}"></i><span><strong>${lbl}:</strong> <a href="${url}" target="_blank" rel="noopener">${url.replace(/^https?:\/\//,'')}</a></span></li>`); };
  row('fas fa-map-marker-alt','Adresa',d.addrStr);
  row('fas fa-city','Město',d.cityStr);
  row('fas fa-clock','Otevírací hodiny',d.opening_hours);
  row('fas fa-phone','Telefon',d.phone);
  link('fas fa-link','Web',d.web);
  row('fas fa-envelope','Email',d.email);
  row('fas fa-building','Provozovatel',d.operator);
  row('fas fa-tag','Značka',d.brand);
  row('fas fa-utensils','Kuchyně',d.cuisine);
  if (d.wheelchair) row('fas fa-wheelchair','Vozíčkáři',d.wheelchair==='yes'?'Ano <i class="fa-solid fa-check"></i>':d.wheelchair==='no'?'Ne <i class="fa-solid fa-xmark"></i>':d.wheelchair);
  if (d.fee&&d.fee!=='') row('fas fa-coins','Poplatek',d.fee==='yes'?'Ano':d.fee==='no'?'Ne':d.fee);
  row('fas fa-lock','Přístup',d.access);
  if (d.ele) row('fas fa-mountain','Nadm. výška',`${d.ele} m`);
  row('fas fa-users','Kapacita',d.capacity);
  row('fas fa-pray','Náboženství',d.religion);
  row('fas fa-church','Konfese',d.denomination);
  row('fas fa-running','Sport',d.sport);
  row('fas fa-road','Povrch',d.surface);
  row('fas fa-drafting-compass','Architekt',d.architect);
  row('fas fa-calendar','Datum vzniku',d.start_date);
  row('fas fa-cube','Materiál',d.material);
  row('fas fa-scroll','Nápis',d.inscription);
  row('fas fa-info-circle','Popis',d.description);
  if (d.vstup) row('fas fa-ticket-alt','Vstup',d.vstup);
  if (d.extraHtml) rows.push(d.extraHtml);
  if (d.wikidata) rows.push(`<li><i class="fab fa-wikipedia-w"></i><span><strong>Wikidata:</strong> <a href="https://www.wikidata.org/wiki/${d.wikidata}" target="_blank">${d.wikidata}</a></span></li>`);
  return rows.join('');
}

// ── Wikipedia enrichment ──────────────────────────────────────
// Skúsi (1) priamy OSM tag wikipedia="lang:Title", (2) Wikidata QID → sitelinky na Wikipedii,
// (3) ak článok neexistuje, aspoň krátky verejne dostupný (CC0) popis priamo z Wikidat.
async function fetchWikipediaInfo(wikidata, wikipediaTag) {
  const langs = ['cs','sk','en'];

  // 1. Priamy tag wikipedia="cs:Název" — najrýchlejšia a najpresnejšia cesta
  if (wikipediaTag && wikipediaTag.includes(':')) {
    const idx = wikipediaTag.indexOf(':');
    const lang = wikipediaTag.slice(0, idx).trim().toLowerCase();
    const title = wikipediaTag.slice(idx + 1).trim();
    if (/^[a-z-]{2,}$/.test(lang) && title) {
      try {
        const info = await _fetchWikiByTitle(title, lang);
        if (info) return info;
      } catch {}
    }
  }

  if (!wikidata) return null;

  try {
    const wdUrl=`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wikidata}&props=sitelinks|labels|descriptions&format=json&origin=*`;
    const wdR=await fetch(wdUrl,{signal:AbortSignal.timeout(5000)});
    if(!wdR.ok) return null;
    const wdD=await wdR.json();
    const entity=wdD.entities?.[wikidata];
    if(!entity) return null;

    // 2. Wikidata → sitelinky na plnohodnotný Wikipedia článok
    if (entity.sitelinks) {
      for(const l of langs){
        const sl=entity.sitelinks[`${l}wiki`];
        if(sl?.title){
          const info=await _fetchWikiByTitle(sl.title,l);
          if(info) return info;
        }
      }
    }

    // 3. Žiadny Wikipedia článok — aspoň krátky CC0 popis priamo z Wikidat
    const desc = _pickWdLangValue(entity.descriptions, langs);
    if (desc) {
      const label = _pickWdLangValue(entity.labels, langs) || wikidata;
      return {
        snippet: desc.charAt(0).toUpperCase() + desc.slice(1),
        thumb: null,
        wikiUrl: `https://www.wikidata.org/wiki/${wikidata}`,
        title: label,
        lang: 'wikidata',
      };
    }
  } catch {}
  return null;
}

function _pickWdLangValue(obj, langs) {
  if (!obj) return null;
  for (const l of langs) { if (obj[l]?.value) return obj[l].value; }
  const any = Object.values(obj)[0];
  return any?.value || null;
}

async function _fetchWikiByTitle(title, lang) {
  const url=`https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts|pageimages&exintro=1&exchars=500&piprop=thumbnail&pithumbsize=400&format=json&origin=*`;
  const r=await fetch(url,{signal:AbortSignal.timeout(6000)});
  if(!r.ok) return null;
  const d=await r.json();
  const pages=d.query?.pages;
  if(!pages) return null;
  const page=Object.values(pages)[0];
  if(!page||page.missing!==undefined||!page.extract) return null;
  // Vyčistíme HTML extract → plain text
  const tmp=document.createElement('div');
  tmp.innerHTML=page.extract;
  const text=(tmp.textContent||'').replace(/\s+/g,' ').trim();
  if(text.length<30) return null;
  const snippet=text.length>300?text.slice(0,300).replace(/\s+\S*$/,'…'):text;
  const thumb=page.thumbnail?.source||null;
  const wikiUrl=`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`;
  return {snippet,thumb,wikiUrl,title:page.title,lang};
}

// Vloží Wikipedia/Wikidata sekciu do otvoreného panela (async doplnenie)
function _injectWikiSection(wikiInfo, panelInner) {
  if(!wikiInfo||!panelInner) return;
  const existing=panelInner.querySelector('.wiki-section');
  if(existing) existing.remove();
  const sec=document.createElement('div');
  sec.className='wiki-section';
  const isWikidataOnly = wikiInfo.lang === 'wikidata';
  const sourceLink = isWikidataOnly
    ? `<a href="${wikiInfo.wikiUrl}" target="_blank" rel="noopener" class="wiki-source-link"><i class="fa-solid fa-database"></i> Zdroj: Wikidata</a>`
    : `<a href="${wikiInfo.wikiUrl}" target="_blank" rel="noopener" class="wiki-source-link"><i class="fab fa-wikipedia-w"></i> Číst na Wikipedii (${wikiInfo.lang})</a>`;
  sec.innerHTML=`
    ${wikiInfo.thumb?`<img src="${wikiInfo.thumb}" class="wiki-thumb" alt="" loading="lazy">`:''}
    <p class="wiki-excerpt">${wikiInfo.snippet}</p>
    ${sourceLink}`;
  // Vložíme pred panel-footer alebo na koniec panel-inner
  const footer=panelInner.querySelector('.panel-footer');
  if(footer) panelInner.insertBefore(sec,footer);
  else panelInner.appendChild(sec);
  // Reinit lightbox ak je thumb
  if(wikiInfo.thumb && typeof GLightbox!=='undefined') setTimeout(()=>GLightbox({selector:'.glightbox'}),50);
}


// ── Wikimedia Commons — nezávislý zdroj fotiek podľa GPS ─────
// Na rozdiel od Wikipedia/Wikidata nepotrebuje žiadny wikidata/wikipedia tag —
// hľadá fotky nahrané do Commons v okolí zadaných súradníc (CC licencie, s odkazom na zdroj).
async function _fetchCommonsNearbyPhoto(lat, lng) {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lng}&gsradius=100&gslimit=6&gsnamespace=6&format=json&origin=*`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d = await r.json();
    const results = d.query?.geosearch || [];
    const file = results.find(x => /\.(jpe?g|png|webp)$/i.test(x.title));
    if (!file) return null;
    const filename = file.title.replace(/^File:/, '');
    return {
      thumb: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=500`,
      pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(file.title)}`,
    };
  } catch { return null; }
}

// Vloží fotku z Wikimedia Commons do panela (samostatná sekcia, mimo Wikipedia/Wikidata bloku)
function _injectCommonsPhotoSection(photo, panelInner) {
  if (!photo || !panelInner) return;
  if (panelInner.querySelector('.commons-photo-section')) return;
  const sec = document.createElement('div');
  sec.className = 'commons-photo-section';
  sec.innerHTML = `
    <img src="${photo.thumb}" class="commons-photo-thumb" alt="" loading="lazy">
    <a href="${photo.pageUrl}" target="_blank" rel="noopener" class="wiki-source-link">
      <i class="fa-brands fa-wikimedia"></i> Foto z okolí: Wikimedia Commons
    </a>`;
  const footer = panelInner.querySelector('.panel-footer');
  if (footer) panelInner.insertBefore(sec, footer);
  else panelInner.appendChild(sec);
  if (typeof GLightbox !== 'undefined') setTimeout(() => GLightbox({ selector: '.glightbox' }), 50);
}

// Skúsi Wikipedia/Wikidata, a ak nič nenájde (alebo bod nemá wikidata/wikipedia tag vôbec),
// skúsi nezávisle dohľadať aspoň fotku z Wikimedia Commons podľa GPS súradníc.
function _enrichPlaceMedia(lat, lng, p) {
  if (!navigator.onLine) return; // offline — nemá zmysel skúšať Wikipedii/Commons
  const panelInner = () => document.querySelector('.panel-inner');
  const tryCommons = () => { if (!p.foto_main) _fetchCommonsNearbyPhoto(lat, lng).then(photo => _injectCommonsPhotoSection(photo, panelInner())); };
  if (p.wikidata || p.wikipedia) {
    fetchWikipediaInfo(p.wikidata, p.wikipedia).then(wikiInfo => {
      if (wikiInfo) { _injectWikiSection(wikiInfo, panelInner()); if (!wikiInfo.thumb) tryCommons(); }
      else tryCommons();
    });
  } else {
    tryCommons();
  }
}


// ── Obohatenie natívnych OFM POI cez Nominatim ───────────────
// Volá sa async po showPlaceDetail — dopíše do otvoreného panelu
// opening_hours, phone, web, address, operator, cuisine a pod.
// Wikidata/Wikipedia sa fetchuje štandardnou cestou (už je v showPlaceDetail).
async function enrichNativePOIDetail(lat, lng, wikidata) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&extratags=1&zoom=18`,
      { headers: { 'Accept-Language': 'cs,sk' } }
    );
    if (!r.ok) return;
    const data = await r.json();
    const extra = data.extratags || {};
    const addr = data.address || {};

    // Zostavíme riadky s novými dátami
    const enriched = {
      opening_hours: extra.opening_hours || '',
      phone: extra.phone || extra['contact:phone'] || '',
      web: extra.website || extra['contact:website'] || '',
      email: extra.email || extra['contact:email'] || '',
      operator: extra.operator || '',
      brand: extra.brand || '',
      cuisine: extra.cuisine || '',
      wheelchair: extra.wheelchair || '',
      fee: extra.fee || '',
      addr_street: [addr.road, addr.house_number].filter(Boolean).join(' '),
      addr_city: [addr.city || addr.town || addr.village, addr.postcode].filter(Boolean).join(', '),
      description: extra.description || '',
    };

    // Ak panel ešte stále zobrazuje toto miesto, dopíšeme info
    const infoList = document.querySelector('.panel-info-list');
    if (!infoList) return;

    const newRows = buildInfoRows(enriched);
    if (!newRows) return;

    // Nahradíme existujúci (prázdny) zoznam obohateným
    infoList.innerHTML = newRows;

    // Wikipedia/Wikidata + Commons fallback — wikidata/wikipedia tag môže byť aj v extratags
    const wd = wikidata || extra.wikidata || '';
    const wp = extra.wikipedia || '';
    _enrichPlaceMedia(lat, lng, { wikidata: wd, wikipedia: wp, foto_main: '' });
  } catch(e) {
    // Tiché zlyhanie — panel zostáva s pôvodnými dátami
  }
}

// ── DETAIL MIESTA ─────────────────────────────────────────────
// ── Návratový kontext (tlačidlo "Späť") ──────────────────────
// Keď sa detail miesta otvorí PRIAMO zo zoznamu (napr. záložky, alebo
// v budúcnosti obsah vo Vandro paneli), chceme popri štandardnom "X"
// (úplné zavretie) aj šípku "Späť", ktorá vráti používateľa presne tam,
// odkiaľ prišiel — rovnaký vzor, aký appka už používa pri "Naposledy
// navrhnutý tip" a "Zpět na seznam" v okolí.
window._panelReturnCtx = null;
window._panelGoBack = () => {
  const rc = window._panelReturnCtx;
  window._panelReturnCtx = null;
  if (rc && typeof rc.fn === 'function') { rc.fn(); return; }
  closeAllPanels();
};

// ── Malá šípka "Späť" vedľa "X" pre obsah otvorený z Vandro (About) panela ──
// Kontaktní formulář, Náhodný tip na výlet, Legenda mapy, Počasí, Statistiky
// a Moje seznamy míst sa dajú otvoriť aj priamo z hlavného Vandro panela
// (kompas ikona). Keď sa otvoria TOUTO cestou, popri štandardnom "X" (úplné
// zavretie) sa zobrazí aj malá šípka, ktorá vráti presne do Vandro panela.
window._vandroPanelReturn = null;
window._vandroPanelGoBack = () => { window._vandroPanelReturn = false; openAboutPanel(); };
function _vandroBackArrowHtml() {
  return window._vandroPanelReturn
    ? `<button class="btn-panel-back" title="Zpět" onclick="window._vandroPanelGoBack()"><i class="fa-solid fa-arrow-left"></i></button>`
    : '';
}

// Vyhľadávačom sa v jednostránkovej appke nedá zobraziť samostatná URL pre
// každé miesto (hash časť adresy sa na server neposiela), ale ŠTATISTIKY
// sa dajú viesť samostatne — pošleme do GA4 "virtuálny pageview" pri
// každom otvorení konkrétneho miesta. Ak analytics ešte nie je povolené
// (cookie súhlas), gtag neexistuje a jednoducho nič neodošleme.
function _slugify(str) {
  return String(str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'misto';
}
function _trackPlaceView(p) {
  if (typeof window.gtag !== 'function') return;
  const title = p.nazov || p.name || 'Místo';
  const path = `/misto/${_slugify(title)}`;
  window.gtag('event', 'page_view', { page_path: path, page_title: title, page_location: location.origin + path });
}

window.showPlaceDetail = function(p, returnCtx) {
  window._panelReturnCtx = returnCtx || null;
  saveHistory(p);
  _trackPlaceView(p);
  window._currentDetailPlace = p;
  const isMobile = window.innerWidth <= 768;
  const lat = parseFloat(p.lat), lng = parseFloat(p.lng);
  const galeria = Array.isArray(p.galeria)?p.galeria:(typeof p.galeria==='string'?p.galeria.split(',').map(s=>s.trim()).filter(Boolean):[]);
  const iconEmoji = p.osm_type ? getIconForOsmType(p.osm_type) : getIconForKategoria(p.kategoria||'', p.podkategoria||'');
  const titleStr = (iconEmoji?iconEmoji+' ':'')+(p.nazov||p.name||'Místo');
  const rows = buildInfoRows({
    addrStr:p.addr_street?[p.addr_street,p.addr_housenumber].filter(Boolean).join(' ')+(p.addr_city?', '+p.addr_city:''):'',
    opening_hours:p.opening_hours, phone:p.phone, web:p.web, email:p.email,
    operator:p.operator, brand:p.brand, cuisine:p.cuisine, wheelchair:p.wheelchair,
    fee:p.fee, access:p.access, ele:p.ele, capacity:p.capacity, religion:p.religion,
    description:p.description, start_date:p.start_date, wikidata:p.wikidata, vstup:p.vstup, extraHtml: p._vm_rowsHtml,
  });
  const backBtnHtml = window._panelReturnCtx ? `<button class="btn-nearby-back" onclick="window._panelGoBack()"><i class="fa-solid fa-arrow-left"></i> ${window._panelReturnCtx.label}</button>` : '';
  const html = `
    ${_mainPhotoImgHtml(p.foto_main, 'panel-img-main')}
    <div class="panel-inner">
      ${backBtnHtml}
      <div class="panel-title-row">
        ${iconEmoji?`<span class="place-icon-emoji">${iconEmoji}</span>`:''}
        <h2 class="panel-title">${escapeHtml(p.nazov||p.name||'Místo')}</h2>
      </div>
      <div class="panel-categories">
        <span class="tag-kat">${escapeHtml(p.kategoria||p.label||'Info')}</span>
        ${p.podkategoria?`<span class="tag-subkat">${escapeHtml(p.podkategoria)}</span>`:''}
      </div>
      <ul class="panel-info-list">${rows}</ul>
      ${_renderDescriptionHtml(p.popis)}
      ${_renderGalleryHtml(galeria)}
      <div class="panel-footer">
        <div class="gps-row"><span>${lat.toFixed(5)}, ${lng.toFixed(5)}</span><button onclick="copyGps(${lat},${lng})" class="btn-copy">Kopírovat GPS</button></div>
        <div class="panel-footer-actions">
          <button onclick="startRoutingToPlace(${lat},${lng},'${_jsAttrSafe(p.nazov||p.name||'Místo')}')" class="btn-route-plan"><i class="fas fa-route"></i> Trasa</button>
          ${_bmRenderBtn(lat, lng)}
          <button onclick="sharePoint()" class="btn-share"><i class="fas fa-share-alt"></i> Sdílet</button>
          <button onclick="window._openPlaceWeather(${lat},${lng})" class="btn-place-weather"><i class="fa-solid fa-cloud-sun"></i> Počasí</button>
          ${typeof vmPlaceActionsHtml === 'function' ? vmPlaceActionsHtml(p) : ''}
        </div>
      </div>
    </div>`;

  // Oranžový highlight bodu na mape pokým je panel otvorený
  if (p._icon_id) setPlaceHighlight({ lat, lng }, p._icon_id);
  else if (!p.osm_type) setPlaceHighlight({ lat, lng }, 'custom-pin');

  // URL hash pre SEO + zdieľanie — len pre vandro body
  if (p.nazov && !p.osm_type && !p._vm_kind) {
    const slug = (p.nazov)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // odstráni diakritiku
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-]/g, '');
    try {
      if (!location.hash.includes('#route=')) {
        history.replaceState(null, '', `#${slug}/${lat.toFixed(5)}/${lng.toFixed(5)}`);
      }
    } catch {}
  }

  if (isMobile) {
    const subtitle = `${p.kategoria||p.label||''}${p.podkategoria?' · '+p.podkategoria:''}`;
    const actionsHtml = `${_bmRenderQuickBtn(lat, lng)}${_bmRenderQuickRouteBtn(lat, lng, p.nazov||p.name)}`;
    openMobileSheet(titleStr, _mainPhotoThumbSrc(p.foto_main), html, false, { subtitle, actionsHtml });
  }
  else openSidebar(`<div class="sidebar-header"><h3>${titleStr}</h3><button class="btn-close" onclick="${window._panelReturnCtx?'window._panelGoBack()':'closeDesktopPanels()'}"><i class="fa-solid fa-xmark"></i></button></div><div class="panel-content">${html}</div>`);
  if (typeof GLightbox!=='undefined') setTimeout(()=>GLightbox({selector:'.glightbox'}),100);
  setTimeout(()=>_initClampedText(),0);

  _enrichPlaceMedia(lat, lng, p);
};

// ── Detail trasy ──────────────────────────────────────────────
function showRouteDetail(props, lat, lng) {
  const isMobile = window.innerWidth <= 768;
  const name = props.name||props.ref||(props.route_type==='bicycle'?'Cyklotrasa':'Turistická trasa');
  const color = props.color||'#3498db';
  const netLabels = {iwn:'Mezinárodní',nwn:'Národní',rwn:'Regionální',lwn:'Místní',icn:'Mezinár. cyklo',ncn:'Národní cyklo',rcn:'Regionální cyklo',lcn:'Místní cyklo'};
  const icon = props.route_type==='bicycle'?'<i class="fa-solid fa-person-biking"></i>':'<i class="fa-solid fa-person-hiking"></i>';
  const rows=[];
  const row=(ico,lbl,val)=>{if(val)rows.push(`<li><i class="${ico}"></i><span><strong>${lbl}:</strong> ${val}</span></li>`);};
  row('fas fa-tag','Značka / Ref',props.ref);
  row('fas fa-network-wired','Síť',netLabels[props.network]||props.network);
  if(props.colour) row('fas fa-palette','Barva trasy',props.colour);
  if(props.distance) row('fas fa-ruler-horizontal','Délka',`${(+props.distance/1000).toFixed(1)} km`);
  if(props.ascent) row('fas fa-mountain','Převýšení',`↑${props.ascent} m${props.descent?' ↓'+props.descent+' m':''}`);
  row('fas fa-building','Operátor',props.operator);
  row('fas fa-info-circle','Popis',props.description);
  if(props.url) rows.push(`<li><i class="fas fa-link"></i><span><strong>Web:</strong> <a href="${props.url}" target="_blank" rel="noopener">${props.url.replace(/^https?:\/\//,'')}</a></span></li>`);
  const swatch=`<span style="display:inline-block;width:16px;height:16px;background:${color};border-radius:3px;vertical-align:middle;margin-right:6px;border:1px solid rgba(0,0,0,0.15)"></span>`;
  const title=`${icon} ${name}`;
  const html=`<div class="panel-inner">
    <div class="panel-title-row"><span class="place-icon-emoji">${icon}</span><h2 class="panel-title">${name}</h2></div>
    <div class="panel-categories">${swatch}<span class="tag-kat">${netLabels[props.network]||(props.route_type==='bicycle'?'Cyklotrasa':'Turistická trasa')}</span></div>
    <ul class="panel-info-list">${rows.join('')}</ul>
    <div class="panel-footer">
      <div class="gps-row"><span>${lat.toFixed(5)}, ${lng.toFixed(5)}</span></div>
      <button onclick="startRoutingToPlace(${lat},${lng},'${_jsAttrSafe(name)}')" class="btn-route-plan"><i class="fas fa-route"></i> Naplánovat trasu</button>
    </div></div>`;
  if(isMobile) openMobileSheet(title,null,html);
  else openSidebar(`<div class="sidebar-header"><h3>${title}</h3><button class="btn-close" onclick="closeDesktopPanels()"><i class="fa-solid fa-xmark"></i></button></div><div class="panel-content">${html}</div>`);
}

window.copyGps=(lat,lng)=>{navigator.clipboard.writeText(`${lat}, ${lng}`);alert('GPS souřadnice zkopírovány!');};
window.sharePoint=()=>{if(navigator.share)navigator.share({title:'vandro.cz',url:location.href});else{navigator.clipboard.writeText(location.href);alert('Odkaz zkopírován!');}};

// Inline počasí pri detaile bodu — injekcie do panela, bez nového sheetu
window._openPlaceWeather = async (lat, lng) => {
  const btn = document.querySelector('.btn-place-weather');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Načítám…'; }
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,apparent_temperature,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&forecast_days=3`);
    const d = await r.json();
    const cur = d.current;
    const info = _wmoInfo(cur.weather_code);
    const dailyHtml = d.daily.time.map((date, i) => {
      const dt = new Date(date);
      const day = ['Ne','Po','Út','St','Čt','Pá','So'][dt.getDay()];
      const di = _wmoInfo(d.daily.weather_code[i]);
      return `<div class="pw-day">
        <div class="pw-day-name">${i===0?'Dnes':day}</div>
        <i class="fa-solid ${di.ic}"></i>
        <div><strong>${Math.round(d.daily.temperature_2m_max[i])}°</strong> <span>${Math.round(d.daily.temperature_2m_min[i])}°</span></div>
      </div>`;
    }).join('');
    const widget = `<div class="place-weather-widget" id="place-weather-widget">
      <div class="pw-header">
        <div class="pw-cur">
          <i class="fa-solid ${info.ic} pw-icon"></i>
          <span class="pw-temp">${Math.round(cur.temperature_2m)}°C</span>
          <span class="pw-label">${info.label}</span>
        </div>
        <div class="pw-extra"><i class="fa-solid fa-wind"></i> ${Math.round(cur.wind_speed_10m)} km/h · Pocitově ${Math.round(cur.apparent_temperature)}°C</div>
      </div>
      <div class="pw-days">${dailyHtml}</div>
      <p class="pw-src"><a href="https://open-meteo.com" target="_blank">Open-Meteo</a></p>
    </div>`;

    // Injektuj pred panel-footer
    const existing = document.getElementById('place-weather-widget');
    if (existing) { existing.remove(); if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-cloud-sun"></i> Počasí'; } return; }
    const footer = document.querySelector('.panel-footer');
    if (footer) footer.insertAdjacentHTML('beforebegin', widget);
    if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-cloud-sun"></i> Skrýt počasí'; }
  } catch {
    if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-cloud-sun"></i> Počasí'; }
  }
};// ══════════════════════════════════════════════════════════════
// ZÁLOŽKY — osobní seznamy míst
// ══════════════════════════════════════════════════════════════
const BM_KEY = 'vandro_bookmarks_v1'; // { lists: [{id, name, items:[{lat,lng,nazov,kategoria,podkategoria,foto_main}]}] }
const BM_META_KEY = 'vandro_bookmarks_meta_v1';          // + ':' + userId → { rev, dirty }
const BM_GUEST_IMPORTED_KEY = 'vandro_bookmarks_guest_imported';

// ── Seznamy míst jsou svázané s účtem ─────────────────────────────
// Nepřihlášený uživatel: seznamy v localStorage pod klíčem BM_KEY (jako dřív).
// Přihlášený uživatel: vlastní klíč BM_KEY:<userId> (účty na jednom zařízení se
// nemíchají) a kopie na serveru (GET/PUT /api/map-lists/me), takže seznamy
// přežijí smazání dat prohlížeče a fungují na všech zařízeních.
function _bmUserId() {
  try {
    if (typeof getToken !== 'function' || !getToken()) return null;
    const u = (typeof getStoredUser === 'function') ? getStoredUser() : null;
    return (u && u.id) ? String(u.id) : null;
  } catch { return null; }
}
function _bmKey(uid) { return uid ? BM_KEY + ':' + uid : BM_KEY; }
function _bmDefault() { return { lists: [{ id: 'default', name: 'Uložená místa', items: [], visibleOnMap: true }] }; }
function _bmReadRaw(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d && Array.isArray(d.lists)) {
      // Migrace starších uložených dat bez visibleOnMap příznaku
      d.lists.forEach(l => {
        if (l.visibleOnMap === undefined) l.visibleOnMap = true;
        if (!Array.isArray(l.items)) l.items = [];
      });
      return d;
    }
  } catch {}
  return null;
}
function _bmLoad() { return _bmReadRaw(_bmKey(_bmUserId())) || _bmDefault(); }

function _bmMeta(uid) {
  try { return Object.assign({ rev: 0, dirty: false }, JSON.parse(localStorage.getItem(BM_META_KEY + ':' + uid)) || {}); }
  catch { return { rev: 0, dirty: false }; }
}
function _bmSetMeta(uid, m) { try { localStorage.setItem(BM_META_KEY + ':' + uid, JSON.stringify(m)); } catch {} }

let _bmChangeSeq = 0;
function _bmSave(data) {
  const uid = _bmUserId();
  try { localStorage.setItem(_bmKey(uid), JSON.stringify(data)); } catch {}
  if (uid) {
    _bmChangeSeq++;
    const m = _bmMeta(uid); m.dirty = true; _bmSetMeta(uid, m);
    _bmScheduleSync(1500);
  }
}

function _bmSamePoint(a, b) { return Math.abs(a.lat - b.lat) < 0.0001 && Math.abs(a.lng - b.lng) < 0.0001; }
// Sloučení dvou dokumentů (sjednocení seznamů podle id/názvu a bodů podle souřadnic)
function _bmMerge(a, b) {
  const out = JSON.parse(JSON.stringify(a && Array.isArray(a.lists) ? a : _bmDefault()));
  ((b && b.lists) || []).forEach(bl => {
    let target = out.lists.find(l => l.id === bl.id) || out.lists.find(l => l.name === bl.name);
    if (!target) { target = { ...bl, items: [] }; out.lists.push(target); }
    (bl.items || []).forEach(it => { if (!target.items.some(x => _bmSamePoint(x, it))) target.items.push(it); });
  });
  return out;
}
function _bmHasContent(d) { return !!(d && d.lists && d.lists.some(l => l.items && l.items.length)); }

let _bmSyncTimer = null, _bmSyncBusy = false, _bmSyncAgain = false;
let _bmLastUid, _bmLastSyncAt = 0;
function _bmScheduleSync(delay) {
  clearTimeout(_bmSyncTimer);
  _bmSyncTimer = setTimeout(() => { window.vmBmSync && window.vmBmSync(true); }, delay);
}
function _bmAfterRemoteChange() {
  try { _refreshPlacesLayer(); } catch {}
  // Je-li panel Moje seznamy právě otevřený, překreslit ho
  try {
    const el = document.querySelector('#vmap-root .bm-list-items, #vmap-root .bm-empty');
    if (el && !el.closest('.panel-hidden, .sheet-hidden, .hidden') && typeof openBookmarksPanel === 'function') openBookmarksPanel();
  } catch {}
}

// Synchronizace seznamů s účtem. Volá se při zobrazení mapy, po každé změně
// (s odstupem) a po přihlášení/odhlášení (změna userId se pozná sama).
window.vmBmSync = async function (force) {
  const uid = _bmUserId();
  const uidChanged = uid !== _bmLastUid;
  _bmLastUid = uid;
  if (!uid) { if (uidChanged) _bmAfterRemoteChange(); return; }
  if (!force && !uidChanged && Date.now() - _bmLastSyncAt < 20000) return;
  if (_bmSyncBusy) { _bmSyncAgain = true; return; }
  _bmSyncBusy = true;
  let changed = uidChanged;
  try {
    const res = await apiGet('/api/map-lists/me');
    const serverDoc = (res && res.data && Array.isArray(res.data.lists)) ? res.data : null;
    const serverRev = Number(res && res.updated_at) || 0;
    const meta = _bmMeta(uid);
    let local = _bmReadRaw(_bmKey(uid));
    let dirty = !!meta.dirty;

    if (!local) {
      // První synchronizace tohoto účtu na tomto zařízení
      local = serverDoc ? JSON.parse(JSON.stringify(serverDoc)) : _bmDefault();
      if (serverDoc) meta.rev = serverRev;
      // Seznamy, které si host uložil před přihlášením, se jednou převezmou do prvního účtu
      if (!localStorage.getItem(BM_GUEST_IMPORTED_KEY)) {
        const guest = _bmReadRaw(BM_KEY);
        if (_bmHasContent(guest)) { local = _bmMerge(local, guest); dirty = true; }
        try { localStorage.setItem(BM_GUEST_IMPORTED_KEY, uid); } catch {}
      }
      try { localStorage.setItem(_bmKey(uid), JSON.stringify(local)); } catch {}
      changed = true;
    } else if (!dirty && serverDoc && serverRev !== meta.rev) {
      // Na jiném zařízení se seznamy změnily a tady nejsou neodeslané úpravy
      local = JSON.parse(JSON.stringify(serverDoc));
      meta.rev = serverRev;
      try { localStorage.setItem(_bmKey(uid), JSON.stringify(local)); } catch {}
      changed = true;
    }

    if (dirty || (!serverDoc && _bmHasContent(local))) {
      // Základ = revize, ze které lokální data vycházejí (ne čerstvě stažená), jinak by konflikt zůstal nepovšimnutý
      let base = Number(meta.rev) || 0;
      for (let attempt = 0; attempt < 3; attempt++) {
        const seq = _bmChangeSeq;
        try {
          const r = await apiFetch('/api/map-lists/me', { method: 'PUT', body: JSON.stringify({ data: local, base_updated_at: base }) });
          meta.rev = Number(r.updated_at) || meta.rev;
          dirty = (seq !== _bmChangeSeq); // mezitím přibyla další změna → pošle se příště
          break;
        } catch (err) {
          if (err && err.status === 409 && err.data && err.data.data) {
            // Mezitím někdo zapsal novější verzi → sloučit a odeslat znovu
            local = _bmMerge(err.data.data, local);
            base = Number(err.data.updated_at) || 0;
            try { localStorage.setItem(_bmKey(uid), JSON.stringify(local)); } catch {}
            changed = true;
            continue;
          }
          throw err;
        }
      }
    }
    meta.dirty = dirty;
    _bmSetMeta(uid, meta);
    _bmLastSyncAt = Date.now();
    if (dirty) _bmScheduleSync(1500);
  } catch (err) {
    // Offline nebo vypršelé přihlášení — změny zůstanou lokálně a odešlou se při příští synchronizaci
    console.warn('[vmap] synchronizace seznamů selhala:', err && err.message);
  } finally {
    _bmSyncBusy = false;
    if (changed) _bmAfterRemoteChange();
    if (_bmSyncAgain) { _bmSyncAgain = false; _bmScheduleSync(500); }
  }
};

window._bmGoLogin = () => { try { if (typeof switchTab === 'function') switchTab('account'); } catch {} };

// ── Přenos uložených míst mezi zařízeními ────────────────────────
// Seznamy přihlášeného uživatele se synchronizují s účtem (viz vmBmSync).
// JSON záloha zůstává užitečná pro převod seznamů ze starší mapy na
// maps.vandro.cz (jiná doména = jiné úložiště prohlížeče) a jako ruční kopie.
window._bmExportData = () => {
  const payload = {
    type: 'vandro-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    bookmarks: _bmLoad(),
    customLayer: (typeof _tempLayerItems !== 'undefined') ? _tempLayerItems : [],
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vandro-zaloha-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

window._bmImportData = async (inputEl) => {
  const file = inputEl.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.type !== 'vandro-backup' || !data.bookmarks) {
      alert('Tento soubor nevypadá jako záloha z Vandro. Zkontrolujte, že jde o správný soubor.');
      inputEl.value = '';
      return;
    }
    const mode = confirm(
      'Chcete zálohu PŘIDAT k současným uloženým místům (OK), nebo jimi současná data celá NAHRADIT (Zrušit)?'
    ) ? 'merge' : 'replace';

    if (mode === 'replace') {
      _bmSave(data.bookmarks);
    } else {
      const current = _bmLoad();
      (data.bookmarks.lists || []).forEach(importedList => {
        let target = current.lists.find(l => l.id === importedList.id) || current.lists.find(l => l.name === importedList.name);
        if (!target) {
          target = { id: importedList.id || ('list_' + Date.now() + Math.random().toString(36).slice(2)), name: importedList.name, items: [], visibleOnMap: true };
          current.lists.push(target);
        }
        (importedList.items || []).forEach(item => {
          const exists = target.items.some(i => Math.abs(i.lat - item.lat) < 0.0001 && Math.abs(i.lng - item.lng) < 0.0001);
          if (!exists) target.items.push(item);
        });
      });
      _bmSave(current);
    }

    if (Array.isArray(data.customLayer) && data.customLayer.length && typeof _tempLayerItems !== 'undefined') {
      if (mode === 'replace') _tempLayerItems = data.customLayer.slice();
      else data.customLayer.forEach(it => _tempLayerItems.push(it));
      if (typeof _tempLayerPersist === 'function') _tempLayerPersist();
      if (typeof _refreshTempLayer === 'function') _refreshTempLayer();
    }

    _refreshPlacesLayer();
    inputEl.value = '';
    alert('Záloha byla úspěšně načtena.');
    openBookmarksPanel();
  } catch (e) {
    console.error('Import zálohy selhal:', e);
    alert('Soubor se nepodařilo načíst — zkontrolujte, že jde o platnou zálohu z Vandro.');
    inputEl.value = '';
  }
};

function _bmIsBookmarked(lat, lng) {
  const d = _bmLoad();
  return d.lists.some(l => l.items.some(i => Math.abs(i.lat - lat) < 0.0001 && Math.abs(i.lng - lng) < 0.0001));
}

function _bmListsContaining(lat, lng) {
  return _bmLoad().lists.filter(l => l.items.some(i => Math.abs(i.lat - lat) < 0.0001 && Math.abs(i.lng - lng) < 0.0001)).map(l => l.id);
}

// Bod sa na mape jemne zvýrazní, ak je uložený aspoň v jednom zozname,
// ktorý používateľ nemá práve vypnutý (viď. přepínač viditeľnosti zoznamu
// v paneli záložiek).
function _bmIsBookmarkedVisible(lat, lng) {
  return _bmLoad().lists.some(l => l.visibleOnMap !== false && l.items.some(i => Math.abs(i.lat - lat) < 0.0001 && Math.abs(i.lng - lng) < 0.0001));
}

// Prekreslí body na mape s aktuálne aktívnym kategóriovým filtrom —
// spoločné miesto namiesto opakovania tej istej podmienky na viacerých
// miestach (napr. po zapnutí/vypnutí viditeľnosti zoznamu záložiek).
function _refreshPlacesLayer() {
  if (!allPlaces || !allPlaces.length) return;
  renderPlacesLayer(_vandroVisiblePlaces());
}

function _bmToggle(lat, lng, place, listId = 'default') {
  const d = _bmLoad();
  let list = d.lists.find(l => l.id === listId);
  if (!list) { list = { id: listId, name: listId, items: [], visibleOnMap: true }; d.lists.push(list); }
  const idx = list.items.findIndex(i => Math.abs(i.lat - lat) < 0.0001 && Math.abs(i.lng - lng) < 0.0001);
  if (idx >= 0) {
    list.items.splice(idx, 1);
    _bmSave(d);
    _refreshPlacesLayer();
    return false; // odobrané
  } else {
    list.items.unshift({ lat: +lat, lng: +lng, nazov: place.nazov||place.name||'Místo', kategoria: place.kategoria||'', podkategoria: place.podkategoria||'', foto_main: place.foto_main||'', osm_type: place.osm_type||'', wikidata: place.wikidata||'', wikipedia: place.wikipedia||'' });
    _bmSave(d);
    _refreshPlacesLayer();
    return true; // pridané
  }
}

function _bmRenderBtn(lat, lng) {
  const on = _bmIsBookmarked(lat, lng);
  return `<button class="btn-bookmark js-bm-toggle${on?' active':''}" data-lat="${lat}" data-lng="${lng}" onclick="window._bmClick(${lat},${lng})">
    <i class="fa-${on?'solid':'regular'} fa-bookmark"></i> ${on ? 'Uloženo' : 'Uložit'}
  </button>`;
}

// Kompaktné kolieskové tlačidlo pre náhľadovú lištu mobilného panela
function _bmRenderQuickBtn(lat, lng) {
  const on = _bmIsBookmarked(lat, lng);
  return `<button class="js-bm-toggle${on?' active':''}" data-lat="${lat}" data-lng="${lng}" onclick="event.stopPropagation();window._bmClick(${lat},${lng})" title="${on?'Uloženo':'Uložit'}">
    <i class="fa-${on?'solid':'regular'} fa-bookmark"></i>
  </button>`;
}
function _bmRenderQuickRouteBtn(lat, lng, name) {
  return `<button onclick="event.stopPropagation();startRoutingToPlace(${lat},${lng},'${_jsAttrSafe(name||'Místo')}')" title="Naplánovat trasu"><i class="fas fa-route"></i></button>`;
}

// Aktualizuje VŠETKY tlačidlá (panel aj náhľadová lišta) pre daný bod naraz
function _bmUpdateToggleButtons(lat, lng) {
  const on = _bmIsBookmarked(lat, lng);
  document.querySelectorAll(`.js-bm-toggle[data-lat="${lat}"][data-lng="${lng}"]`).forEach(btn => {
    btn.classList.toggle('active', on);
    if (btn.classList.contains('btn-bookmark')) {
      btn.innerHTML = `<i class="fa-${on?'solid':'regular'} fa-bookmark"></i> ${on?'Uloženo':'Uložit'}`;
    } else {
      btn.innerHTML = `<i class="fa-${on?'solid':'regular'} fa-bookmark"></i>`;
    }
  });
}

// Nájdi kompletné dáta bodu — najprv aktuálne otvorený panel (funguje aj pre OSM body),
// potom vlastné VANDRO body, inak minimálny fallback
function _bmResolvePlace(lat, lng) {
  const cur = window._currentDetailPlace;
  if (cur && Math.abs(+cur.lat - lat) < 0.0001 && Math.abs(+cur.lng - lng) < 0.0001) return cur;
  return allPlaces.find(pl => Math.abs(+pl.lat - lat) < 0.0001 && Math.abs(+pl.lng - lng) < 0.0001) || { lat, lng, nazov: '', kategoria: '' };
}

function _bmRenderPickerContent(lat, lng) {
  const d = _bmLoad();
  const inLists = _bmListsContaining(lat, lng);
  const items = d.lists.map(l => {
    const checked = inLists.includes(l.id);
    return `<label class="bm-list-pick${checked?' checked':''}">
      <input type="checkbox" ${checked?'checked':''} data-lid="${l.id}" onchange="window._bmPickerToggleList(${lat},${lng},'${l.id}',this.checked)">
      <i class="fa-${checked?'solid':'regular'} fa-bookmark"></i> ${l.name} <span>(${l.items.length})</span>
    </label>`;
  }).join('');
  return `<div class="bm-modal-header">
      <h4>Uložit do seznamu</h4>
      <button class="bm-modal-close" onclick="window._bmCloseModal()"><i class="fa-solid fa-xmark"></i></button>
    </div>
    ${items}
    <button class="bm-new-list-btn" onclick="window._bmInlineNewList(${lat},${lng})"><i class="fa-solid fa-plus"></i> Nový seznam</button>`;
}

function _bmEnsureModal() {
  let backdrop = document.getElementById('bm-modal-backdrop');
  if (backdrop) return backdrop;
  backdrop = document.createElement('div');
  backdrop.id = 'bm-modal-backdrop';
  backdrop.className = 'bm-modal-backdrop hidden';
  backdrop.innerHTML = '<div class="bm-modal-box" id="bm-modal-box"></div>';
  vmRoot().appendChild(backdrop);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) window._bmCloseModal(); });
  return backdrop;
}

window._bmShowPickerModal = (lat, lng) => {
  const backdrop = _bmEnsureModal();
  const box = document.getElementById('bm-modal-box');
  if (!box) return;
  box.innerHTML = _bmRenderPickerContent(lat, lng);
  backdrop.classList.remove('hidden');
};

window._bmCloseModal = () => {
  document.getElementById('bm-modal-backdrop')?.classList.add('hidden');
};

window._bmClick = (lat, lng) => {
  const p = _bmResolvePlace(lat, lng);
  window._bmCurrentPickerPlace = p;
  const d = _bmLoad();
  if (d.lists.length === 1) {
    // Len jeden zoznam — priamo toggle
    const added = _bmToggle(lat, lng, p, 'default');
    _bmUpdateToggleButtons(lat, lng);
  } else {
    // Viac zoznamov — vyskakovacie okno nad všetkým obsahom (nie skryté v paneli)
    window._bmShowPickerModal(lat, lng);
  }
};

window._bmPickerToggleList = (lat, lng, listId, checked) => {
  const d = _bmLoad();
  let list = d.lists.find(l => l.id === listId);
  if (!list) return;
  const place = window._bmCurrentPickerPlace || _bmResolvePlace(lat, lng);
  const idx = list.items.findIndex(i => Math.abs(i.lat - lat) < 0.0001 && Math.abs(i.lng - lng) < 0.0001);
  if (checked && idx < 0) list.items.unshift({ lat:+lat, lng:+lng, nazov:place.nazov||place.name||'Místo', kategoria:place.kategoria||'', podkategoria:place.podkategoria||'', foto_main:place.foto_main||'', osm_type: place.osm_type||'', wikidata: place.wikidata||'', wikipedia: place.wikipedia||'' });
  if (!checked && idx >= 0) list.items.splice(idx, 1);
  _bmSave(d);
  _refreshPlacesLayer();
  const box = document.getElementById('bm-modal-box');
  if (box) box.innerHTML = _bmRenderPickerContent(lat, lng);
  _bmUpdateToggleButtons(lat, lng);
};

window._bmInlineNewList = (lat, lng) => {
  const name = prompt('Název nového seznamu:');
  if (!name?.trim()) return;
  const d = _bmLoad();
  d.lists.push({ id: 'list_' + Date.now(), name: name.trim(), items: [], visibleOnMap: true });
  _bmSave(d);
  const box = document.getElementById('bm-modal-box');
  if (box) box.innerHTML = _bmRenderPickerContent(lat, lng);
};

function openBookmarksPanel() {
  const isMobile = window.innerWidth <= 768;
  const titleStr = `<i class="fa-solid fa-bookmark" style="color:var(--primary);margin-right:8px"></i>Moje seznamy míst`;
  const d = _bmLoad();

  function _renderBmPanel() {
    if (!d.lists.some(l => l.items.length)) {
      return `<div class="bm-empty"><i class="fa-regular fa-bookmark"></i><p>Zatím žádná uložená místa.</p><p style="font-size:11px;color:#aaa">Místa ukládejte tlačítkem „Uložit" v detailu místa.</p></div>`;
    }
    const localStorageNote = _bmUserId()
      ? `<div class="bm-storage-note"><i class="fa-solid fa-cloud"></i> Seznamy jsou uložené u vašeho účtu a synchronizují se mezi zařízeními.</div>`
      : `<div class="bm-storage-note"><i class="fa-solid fa-circle-info"></i> Místa jsou uložena jen v tomto prohlížeči. <a href="#" onclick="event.preventDefault();window._bmGoLogin()" style="color:var(--primary);font-weight:600">Přihlaste se</a>, aby se uložila k vašemu účtu.</div>`;
    const listsHtml = d.lists.map((list) => {
      const visible = list.visibleOnMap !== false;
      // Přepínač viditelnosti — zobrazí/skryje celý seznam na mapě (jemný
      // oranžový halo pod ikonami bodů tohoto seznamu). Nezobrazujeme ho pro
      // prázdné seznamy (nemá co skrývat).
      const visToggle = list.items.length ? `
        <label class="bm-list-visibility" title="${visible?'Skrýt seznam na mapě':'Zobrazit seznam na mapě'}">
          <input type="checkbox" ${visible?'checked':''} onchange="window._bmToggleListVisible('${list.id}',this.checked)">
          <span class="bm-vis-track"></span>
        </label>` : '';
      if (!list.items.length) return `<div class="bm-list-header">
        <span class="bm-list-name">${list.name}</span>
        <span class="bm-list-count">Prázdný</span>
        ${list.id !== 'default' ? `<button class="bm-delete-list" onclick="window._bmDeleteList('${list.id}')"><i class="fa-solid fa-trash"></i></button>` : ''}
      </div>`;
      return `<div class="bm-list-block">
        <div class="bm-list-header${visible?'':' bm-list-hidden'}">
          <span class="bm-list-name">${list.name}</span>
          <span class="bm-list-count">${list.items.length} míst</span>
          ${visToggle}
          ${list.id !== 'default' ? `<button class="bm-delete-list" onclick="window._bmDeleteList('${list.id}')"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>
        <div class="bm-list-items" data-list-id="${list.id}">
        ${list.items.map((item, ii) => `
          <div class="bm-item" draggable="true" data-list-id="${list.id}" data-idx="${ii}" onclick="window._bmOpenItem(${item.lat},${item.lng})">
            <span class="bm-drag-handle" title="Přesunout" onclick="event.stopPropagation()"><i class="fa-solid fa-grip-vertical"></i></span>
            ${item.foto_main ? `<img src="${item.foto_main}" class="bm-thumb" alt="">` : `<div class="bm-thumb-placeholder">${getIconForKategoria(item.kategoria,item.podkategoria)||vmIconSvg('pin')}</div>`}
            <div class="bm-item-body">
              <div class="bm-item-name">${item.nazov||'Místo'}</div>
              <div class="bm-item-cat">${item.podkategoria||item.kategoria||''}</div>
            </div>
            <button class="bm-remove" onclick="event.stopPropagation();window._bmRemoveItem('${list.id}',${ii})"><i class="fa-solid fa-xmark"></i></button>
          </div>`).join('')}
        </div>
      </div>`;
    }).join('');

    return `${localStorageNote}${listsHtml}
      <button class="bm-new-list-btn-main" onclick="window._bmNewList()"><i class="fa-solid fa-plus"></i> Nový seznam</button>
      <div class="bm-transfer-section">
        <p class="bm-transfer-note">Chcete si uložená místa přenést do jiného telefonu/prohlížeče? Stáhněte si zálohu a na druhém zařízení ji nahrajte zpět.</p>
        <div class="bm-transfer-actions">
          <button class="offline-btn offline-btn-download" onclick="window._bmExportData()"><i class="fa-solid fa-download"></i> Stáhnout zálohu</button>
          <label class="offline-btn offline-btn-download" style="cursor:pointer">
            <i class="fa-solid fa-upload"></i> Nahrát zálohu
            <input type="file" accept=".json" style="display:none" onchange="window._bmImportData(this)">
          </label>
        </div>
      </div>`;
  }

  // Drag-and-drop manuálne radenie položiek v rámci JEDNÉHO zoznamu.
  // Ťahať možno len cez úchyt (.bm-drag-handle) aby to nekolidovalo s
  // klikom na položku (otvorenie detailu) ani s drag na mape.
  let _bmDragSrc = null;
  function _attachBmDragHandlers() {
    document.querySelectorAll('.bm-item').forEach(el => {
      el.addEventListener('dragstart', (e) => {
        _bmDragSrc = { listId: el.dataset.listId, idx: +el.dataset.idx };
        el.classList.add('bm-dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('bm-dragging');
        document.querySelectorAll('.bm-item').forEach(x => x.classList.remove('bm-drag-over-top','bm-drag-over-bottom'));
      });
      el.addEventListener('dragover', (e) => {
        if (!_bmDragSrc || _bmDragSrc.listId !== el.dataset.listId) return; // len v rámci rovnakého zoznamu
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        el.classList.toggle('bm-drag-over-top', before);
        el.classList.toggle('bm-drag-over-bottom', !before);
      });
      el.addEventListener('dragleave', () => el.classList.remove('bm-drag-over-top','bm-drag-over-bottom'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('bm-drag-over-top','bm-drag-over-bottom');
        if (!_bmDragSrc || _bmDragSrc.listId !== el.dataset.listId) { _bmDragSrc = null; return; }
        const toIdx = +el.dataset.idx;
        const rect = el.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        const d2 = _bmLoad();
        const list = d2.lists.find(l => l.id === _bmDragSrc.listId);
        if (list) {
          const [moved] = list.items.splice(_bmDragSrc.idx, 1);
          let insertAt = toIdx > _bmDragSrc.idx ? toIdx - 1 : toIdx;
          if (!before) insertAt += 1;
          list.items.splice(Math.max(0, Math.min(insertAt, list.items.length)), 0, moved);
          _bmSave(d2);
          openBookmarksPanel();
        }
        _bmDragSrc = null;
      });
    });
  }

  window._bmOpenItem = (lat, lng) => {
    const returnCtx = { label: 'Zpět na seznam míst', fn: openBookmarksPanel };
    map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14), speed: 1.3 });
    const p = allPlaces.find(pl => Math.abs(+pl.lat - lat) < 0.0001 && Math.abs(+pl.lng - lng) < 0.0001);
    if (p) { showPlaceDetail(p, returnCtx); return; }
    // OSM bod (nie je vo vlastných VANDRO bodoch) — zrekonštruuj panel z uložených dát
    const d2 = _bmLoad();
    let item = null;
    for (const l of d2.lists) { item = l.items.find(i => Math.abs(i.lat - lat) < 0.0001 && Math.abs(i.lng - lng) < 0.0001); if (item) break; }
    if (!item) return;
    showPlaceDetail({
      lat, lng, nazov: item.nazov, kategoria: item.kategoria, podkategoria: item.podkategoria,
      foto_main: item.foto_main, osm_type: item.osm_type || 'yes', wikidata: item.wikidata || '', wikipedia: item.wikipedia || '',
    }, returnCtx);
    if (item.osm_type) enrichNativePOIDetail(lat, lng, item.wikidata || '');
    // (wikipedia tag sa dotiahne cez extratags v samotnom enrichNativePOIDetail)
  };
  window._bmRemoveItem = (listId, idx) => {
    const d2 = _bmLoad(); const list = d2.lists.find(l => l.id === listId);
    if (list) { list.items.splice(idx, 1); _bmSave(d2); _refreshPlacesLayer(); openBookmarksPanel(); }
  };
  window._bmDeleteList = (listId) => {
    if (!confirm('Smazat celý seznam?')) return;
    const d2 = _bmLoad(); d2.lists = d2.lists.filter(l => l.id !== listId); _bmSave(d2); _refreshPlacesLayer(); openBookmarksPanel();
  };
  window._bmNewList = () => {
    const name = prompt('Název nového seznamu:');
    if (!name?.trim()) return;
    const d2 = _bmLoad(); d2.lists.push({ id: 'list_' + Date.now(), name: name.trim(), items: [], visibleOnMap: true }); _bmSave(d2); openBookmarksPanel();
  };
  // Zapne/vypne zobrazenie celého zoznamu na mape (halo pod ikonami bodov
  // tohoto zoznamu) bez toho, aby sa body zo zoznamu zmazali.
  window._bmToggleListVisible = (listId, checked) => {
    const d2 = _bmLoad();
    const list = d2.lists.find(l => l.id === listId);
    if (!list) return;
    list.visibleOnMap = checked;
    _bmSave(d2);
    _refreshPlacesLayer();
    const header = document.querySelector(`.bm-list-items[data-list-id="${listId}"]`)?.previousElementSibling;
    if (header) header.classList.toggle('bm-list-hidden', !checked);
  };

  const content = _renderBmPanel();
  if (isMobile) openMobileSheet(titleStr, null, content, true);
  else openSidebar(`<div class="sidebar-header"><h3>${titleStr}</h3><div class="sidebar-header-actions">${_vandroBackArrowHtml()}<button class="btn-close" onclick="closeDesktopPanels()"><i class="fa-solid fa-xmark"></i></button></div></div><div class="panel-content">${content}</div>`);
  _attachBmDragHandlers();
}


// ══════════════════════════════════════════════════════════════
// OG IMAGE — thumbnail pre zdieľanie
// ══════════════════════════════════════════════════════════════
function updateOgMeta(place) {
  const setMeta = (prop, content) => {
    let el = document.querySelector(`meta[property="${prop}"]`);
    if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el); }
    el.setAttribute('content', content);
  };
  const name = place.nazov || place.name || 'Místo';
  const desc = place.popis || place.kategoria || 'Turistické místo na vandro.cz';
  setMeta('og:title', `${name} | vandro.cz`);
  setMeta('og:description', desc);
  if (place.foto_main) setMeta('og:image', place.foto_main);
  /* titulek hlavního webu neměníme — SPA má vlastní meta */
}

// ── INICIALIZÁCIA MAPY ────────────────────────────────────────
function initMap() {
  vmRoot().insertAdjacentHTML('afterbegin','<div id="map-loading"><div class="spinner"></div><p>Načítám mapu…</p></div>');
  initUserLocation();
  const s = loadMapState();
  // Obnoviť uloženú podkladovú mapu
  if (s && s.baseLayer && STYLES[s.baseLayer]) {
    currentBaseLayer = s.baseLayer;
  }
  
  const initStyle = (typeof STYLES[currentBaseLayer] === 'string') ? `${STYLES[currentBaseLayer]}?v=${window.VMAP_BUILD || 1}` : STYLES[currentBaseLayer];
  map = new maplibregl.Map({
    container:'map', style: initStyle,
    center: s?[s.lng,s.lat]:[17.5,48.8], zoom:s?s.zoom:7,
    bearing:s?s.bearing:0, pitch:s?s.pitch:0,
    minZoom:4, maxZoom:20, attributionControl:false,
    touchZoomRotate:true, dragRotate:true,
    preserveDrawingBuffer:true,
    fadeDuration: 0,             // okamžité zobrazenie dlaždíc, bez fade-in animácie
    refreshExpiredTiles: false,  // menej zbytočných requestov
    collectResourceTiming: false,
    renderWorldCopies: true,
  });
  
  map.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-right');
  map.on('load', onMapLoad);
  map.on('rotate', updateCompass);
  map.on('rotateend', updateCompass);
  map.on('click', handleMapClick);
  map.on('styleimagemissing', (e) => { try { vmEnsureImage(e.id); } catch (err) {} });

  // Skry loader okamžite po pridaní mapy do DOM (background vrstva je už vykreslená pod CSS farbou)
  requestAnimationFrame(() => {
    const ml = document.getElementById('map-loading');
    if (ml) { ml.classList.add('done'); setTimeout(()=>ml.remove(), 250); }
  });

  // CSV s VANDRO bodmi ťahaj paralelne s inicializáciou mapy (nezdržuj prvý render)
  setTimeout(() => { try { loadGoogleSheetData(); } catch(e) { console.warn('parallel CSV load:', e); } }, 0);


  // 'style.load' funguje pre inline štýly (satelit).
  // Pre URL štýly (liberty, topo) niekedy MapLibre vystreľuje 'style.load'
  // až po niekoľkých 'styledata' udalostiach — použijeme oba.
  let _reinitDone = false;

  function doReinit() {
    if (_reinitDone) return;
    _reinitDone = true;
    setTimeout(() => { _reinitDone = false; }, 200);
    hideLoader();
    try {
      if (currentBaseLayer !== 'satelit') hideBuildInPOIs();
      if (currentBaseLayer !== 'topo') removeContourLayers();
      reInitAllLayers();
      if (currentBaseLayer === 'topo') {
        try { addContourLayers(); } catch(ce) { console.error('addContourLayers failed:', ce); }
      }
      lastOsmKey = ''; lastRoutesKey = '';
      _lastOsmBbox = null; _lastOsmZoomFloor = -1;
      _osmForceReload = true;
      if (allPlaces && allPlaces.length > 0) renderPlacesLayer(_vandroVisiblePlaces());
      if (_tempLayerItems && _tempLayerItems.length) _refreshTempLayer();
      if (searchOutlineOsmId) showSearchOutline(searchOutlineOsmId, searchOutlineOsmType);
      updateCompass();
      debouncedRefresh();
      if (routeGeoLine) renderRouteLine(routeGeoLine);
      else if (routeWaypoints.length) renderWaypointDots();
    } catch(e) {
      console.warn('style reinit:', e);
    }
  }

  map.on('style.load', doReinit);

  // Fallback pre URL štýly kde style.load môže prísť neskoro alebo viackrát.
  // Navyše: loader skryjeme pri PRVOM styledata aby sa stránka nejavila zaseknutá.
  // Hide loader pri PRVOM styledata (mapa už je viditeľná, dlaždice sa dokreslia)
  let _loaderHidden = false;
  map.on('styledata', () => {
    if (!_loaderHidden) {
      _loaderHidden = true;
      const ml = document.getElementById('map-loading');
      if (ml) { ml.classList.add('done'); setTimeout(()=>ml.remove(), 250); }
    }
    try {
      const s = map.getStyle();
      if (s && s.layers && s.layers.length > 0 && !map.getLayer('places-layer')) {
        doReinit();
      }
    } catch(e) {}
  });

  // Pravý klik — v režimu počasí přesune bod počasí, jinak normální info o místě
  map.on('contextmenu', e => {
    e.preventDefault();
    if (window._weatherModeActive) {
      window._weatherPoint = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      _flashWeatherPointMarker(e.lngLat);
      openWeatherPanel();
      return;
    }
    showReverseGeocodePanel(e.lngLat.lat, e.lngLat.lng);
  });

  // Long press mobile
  const canvas = map.getCanvas();
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length!==1) return;
    longPressFired=false;
    const touch=e.touches[0];
    longPressTimer=setTimeout(()=>{
      longPressFired=true;
      const rect=canvas.getBoundingClientRect();
      const ll=map.unproject({x:touch.clientX-rect.left,y:touch.clientY-rect.top});
      if (window._weatherModeActive) {
        window._weatherPoint = { lat: ll.lat, lng: ll.lng };
        if (navigator.vibrate) navigator.vibrate(25);
        _flashWeatherPointMarker(ll);
        openWeatherPanel();
        return;
      }
      showReverseGeocodePanel(ll.lat,ll.lng);
    },600);
  },{passive:true});
  canvas.addEventListener('touchend',()=>clearTimeout(longPressTimer),{passive:true});
  canvas.addEventListener('touchmove',()=>clearTimeout(longPressTimer),{passive:true});

  ['moveend','zoomend','rotateend','pitchend'].forEach(ev=>map.on(ev,saveMapState));

  // Cursor
  ['places-layer','osm-pois','hiking-routes','cycling-routes','poi_r1','poi_r7','poi_r20','poi_transit','z-poi-r1','z-poi-r7','z-poi-r20','z-poi-transit', ...((typeof VM_BIZ_LAYER_IDS !== 'undefined') ? VM_BIZ_LAYER_IDS : [])].forEach(id=>{
    map.on('mouseenter',id,()=>{map.getCanvas().style.cursor='pointer';});
    map.on('mouseleave',id,()=>{map.getCanvas().style.cursor='';});
  });
}

// ── OFM POI class → čitateľný label ─────────────────────────
// OFM (OpenFreeMap) poi source-layer používa class/subclass hodnoty
// z OpenMapTiles schémy (https://openmaptiles.org/schema/#poi)
const OFM_CLASS_LABELS = {
  // Stravovanie
  restaurant:'Restaurace', cafe:'Kavárna', fast_food:'Rychlé občerstvení', bar:'Bar',
  pub:'Hospoda', food_court:'Food Court', ice_cream:'Zmrzlina', bakery:'Pekárna',
  // Ubytovanie
  hotel:'Hotel', hostel:'Hostel', motel:'Motel', guest_house:'Penzion',
  chalet:'Chata', camp_site:'Kemp', apartment:'Apartmán',
  // Kultúra
  museum:'Muzeum', gallery:'Galerie', castle:'Hrad', ruins:'Zřícenina',
  monument:'Památník', memorial:'Pomník', fort:'Pevnost',
  archaeological_site:'Arch. lokalita', viewpoint:'Rozhledna / Vyhlídka',
  // Príroda
  peak:'Vrchol', waterfall:'Vodopád', cave_entrance:'Jeskyně',
  spring:'Pramen', beach:'Pláž', nature_reserve:'Přírodní rezervace',
  // Služby
  hospital:'Nemocnice', clinic:'Klinika', pharmacy:'Lékárna',
  dentist:'Zubař', veterinary:'Veterinář',
  bank:'Banka', atm:'Bankomat', post_office:'Pošta',
  police:'Policie', fire_station:'Hasiči',
  // Doprava
  fuel:'Čerpací stanice', parking:'Parkoviště', bus:'Autobusová zastávka',
  rail:'Vlakové nádraží', airport:'Letiště',
  bicycle_rental:'Půjčovna kol', car_rental:'Půjčovna aut',
  charging_station:'Nabíjecí stanice',
  // Obchody
  supermarket:'Supermarket', convenience:'Potraviny', butcher:'Řeznictví',
  clothes:'Oblečení', shoes:'Obuv', electronics:'Elektronika',
  sports:'Sportovní potřeby', mall:'Obchodní centrum',
  // Voľný čas / Sport
  park:'Park', playground:'Hřiště', zoo:'ZOO', theme_park:'Zábavní park',
  sports_centre:'Sportovní centrum', swimming_pool:'Bazén',
  golf_course:'Golf', stadium:'Stadion',
  // Iné
  information:'Informační centrum', toilets:'Toalety',
  drinking_water:'Pitná voda', place_of_worship:'Kostel / Chrám',
};

function _ofmClassToLabel(cls) {
  return OFM_CLASS_LABELS[cls] || (cls ? cls.charAt(0).toUpperCase()+cls.slice(1).replace(/_/g,' ') : 'Bod zájmu');
}

// ── Click handler ─────────────────────────────────────────────
function handleMapClick(e) {
  if (longPressFired) { longPressFired=false; return; }
  // 1. Vlastné miesta
  const pf=map.queryRenderedFeatures(e.point,{layers:['places-layer']});
  if (pf.length>0) {
    const p={...pf[0].properties};
    if(typeof p.galeria==='string'){try{p.galeria=JSON.parse(p.galeria);}catch{p.galeria=[];}}
    showPlaceDetail(p); return;
  }
  // 1b. Registrované podniky a události (atrakce / ubytování / gastro / akce)
  try { if (typeof vmHandleBizClick === 'function' && vmHandleBizClick(e)) return; } catch (err) { console.warn('vmHandleBizClick:', err); }
  // 2. Turistické trasy
  const hf=map.queryRenderedFeatures(e.point,{layers:['hiking-routes']});
  if (hf.length>0) { showRouteDetail(hf[0].properties,e.lngLat.lat,e.lngLat.lng); return; }
  // 3. Cyklotrasy
  const cf=map.queryRenderedFeatures(e.point,{layers:['cycling-routes']});
  if (cf.length>0) { showRouteDetail({...cf[0].properties,route_type:'bicycle'},e.lngLat.lat,e.lngLat.lng); return; }
  // 4. OSM POI — Overpass vrstva (satelit)
  const t=window.innerWidth<=768?20:8;
  const bbox=[[e.point.x-t,e.point.y-t],[e.point.x+t,e.point.y+t]];
  const of=map.queryRenderedFeatures(bbox,{layers:['osm-pois']});
  if (of.length>0) {
    const pr=of[0].properties,co=of[0].geometry.coordinates;
    showPlaceDetail({lat:co[1],lng:co[0],nazov:pr.name||pr.label,kategoria:pr.label,osm_type:pr.osm_type,
      phone:pr.phone||'',opening_hours:pr.opening_hours||'',web:pr.web||'',operator:pr.operator||'',
      brand:pr.brand||'',cuisine:pr.cuisine||'',wheelchair:pr.wheelchair||'',fee:pr.fee||'',
      ele:pr.ele||'',email:pr.email||'',access:pr.access||'',religion:pr.religion||'',
      capacity:pr.capacity||'',description:pr.description||'',start_date:pr.start_date||'',
      wikidata:pr.wikidata||'',addr_street:pr.addr_street||'',addr_housenumber:pr.addr_housenumber||'',
      addr_city:pr.addr_city||''}); return;
  }
  // 4b. Natívne POI z vektorového podkladu (liberty / topo / zima) — vrátane vrcholov
  const nativePOILayers = Array.from(new Set([
    'poi_r1','poi_r7','poi_r20','poi_transit','z-poi-r1','z-poi-r7','z-poi-r20','z-poi-transit',
    ..._getNativePOILayerIds(),
  ])).filter(id=>{try{return !!map.getLayer(id);}catch{return false;}});
  if (nativePOILayers.length > 0) {
    const nf=map.queryRenderedFeatures(bbox,{layers:nativePOILayers});
    if (nf.length>0) {
      const pr=nf[0].properties, co=nf[0].geometry.coordinates;
      const name=pr['name:latin']||pr.name||pr.subclass||pr.class||'';
      const kategLabel=_ofmClassToLabel(pr.subclass||pr.class||'');
      const osmType=TAG_TO_TYPE['amenity='+(pr.subclass||'')]||TAG_TO_TYPE['tourism='+(pr.subclass||'')]||
                    TAG_TO_TYPE['amenity='+(pr.class||'')]||TAG_TO_TYPE['tourism='+(pr.class||'')]||
                    TAG_TO_TYPE['natural='+(pr.subclass||'')]||TAG_TO_TYPE['natural='+(pr.class||'')]||null;
      // Zobraz panel okamžite s dostupnými dátami
      showPlaceDetail({
        lat:co[1],lng:co[0],nazov:name,kategoria:kategLabel,
        osm_type:osmType,wikidata:pr.wikidata||'',ele:pr.ele||'',
      });
      // Obohať detaily cez Nominatim reverse-geocode (1 request, žiadny Overpass)
      // Spúšťame async BEZ await — panel sa zobrazí okamžite, detaily sa dopíšu
      enrichNativePOIDetail(co[1], co[0], pr.wikidata||'');
      return;
    }
  }
  // 5. Tvorba trasy
  if (routePickerMode) { confirmPickerPosition(e.lngLat.lat, e.lngLat.lng); return; }
  if (isCreatingRoute) { addWaypoint(e.lngLat.lat, e.lngLat.lng, null); return; }
  // 6. Klik na prázdne miesto — nič nerob (reverse geocode je len pri pravom kliku / long press)
}

// ── Vrstevnice (maplibre-contour) ────────────────────────────
// Táto funkcia sa volá po každom načítaní topo štýlu.
// Používa knižnicu mlcontour (maplibre-contour) na výpočet vrstevníc
// priamo z raster-DEM dlaždíc v prehliadači — žiadny externý server ani API kľúč.
let _contourDemSource = null;

function addContourLayers() {
  if (typeof mlcontour === 'undefined') {
    console.warn('maplibre-contour not loaded');
    return;
  }
  if (map.getLayer('contour-minor')) return; // už pridané

  // Vždy vytvárame novú inštanciu — zaručí správnu registráciu protokolu
  // po každom prepnutí štýlu (style.load zruší staré protokoly maplibre-contour).
  // Zdroj: AWS Open Data (Terrarium encoding, globálne pokrytie, CORS povolené, maxzoom 13).
  _contourDemSource = new mlcontour.DemSource({
    url: 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png',
    encoding: 'terrarium',
    maxzoom: 13,
    worker: true,
  });
  _contourDemSource.setupMaplibre(maplibregl);

  if (!map.getSource('contour-lines')) {
    map.addSource('contour-lines', {
      type: 'vector',
      tiles: [_contourDemSource.contourProtocolUrl({
        multiplier: 1,
        overzoom: 0,
        buffer: 1,
        extent: 4096,
        thresholds: {
          11: [50, 200],
          12: [20, 100],
          13: [10,  50],
        },
        contourLayer: 'contours',
        elevationKey: 'ele',
        levelKey: 'level',
      })],
      maxzoom: 12,
    });
  }

  // Vložíme vrstevnice pod VŠETKY línie, budovy a body — teda aj pod cesty,
  // budovy a vrcholové body základného štýlu (map-style-topo.json).
  // Hľadáme prvú line/fill-extrusion/symbol vrstvu v štýle — vrstevnice
  // vložíme PRED ňu, čím skončia úplne na dne stack-u nad background/fill podkladom.
  // DÔLEŽITÉ: nekontrolujeme vlastné vrstvy — anchor nesmie byť žiadna contour vrstva,
  // ale inak berieme naozaj prvú line/symbol vrstvu (vrátane ciest a popiskov topo štýlu).
  const CONTOUR_LAYERS = new Set([
    'contour-minor','contour-major','contour-labels',
  ]);
  const anchor = () => {
    const layers = map.getStyle()?.layers || [];
    for (const l of layers) {
      if (!CONTOUR_LAYERS.has(l.id) && (l.type === 'line' || l.type === 'symbol' || l.type === 'fill-extrusion')) {
        return l.id;
      }
    }
    return undefined;
  };

  if (!map.getLayer('contour-minor')) {
    map.addLayer({
      id: 'contour-minor',
      type: 'line',
      source: 'contour-lines',
      'source-layer': 'contours',
      minzoom: 13,
      filter: ['==', ['get', 'level'], 0],
      paint: {
        'line-color': '#aaa',
        'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.3, 17, 0.7],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.3, 17, 0.55],
      },
    }, anchor());
  }

  if (!map.getLayer('contour-major')) {
    map.addLayer({
      id: 'contour-major',
      type: 'line',
      source: 'contour-lines',
      'source-layer': 'contours',
      minzoom: 13,
      filter: ['==', ['get', 'level'], 1],
      paint: {
        'line-color': '#999',
        'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.4, 17, 1],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.35, 17, 0.65],
      },
    }, anchor());
  }

  if (!map.getLayer('contour-labels')) {
    map.addLayer({
      id: 'contour-labels',
      type: 'symbol',
      source: 'contour-lines',
      'source-layer': 'contours',
      minzoom: 13,
      filter: ['==', ['get', 'level'], 1],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 350,
        'text-field': ['concat', ['to-string', ['get', 'ele']], ' m'],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 9, 17, 11],
        'text-letter-spacing': 0.05,
        'text-max-angle': 30,
        'text-keep-upright': false,
        'text-rotation-alignment': 'map',
        'text-pitch-alignment': 'map',
      },
      paint: {
        'text-color': '#888',
        'text-halo-color': 'rgba(255,255,255,0.9)',
        'text-halo-width': 1.2,
      },
    }, anchor());
  }
}

// Vyčistenie vrstevníc pri prepnutí z topo
function removeContourLayers() {
  ['contour-labels','contour-major','contour-minor'].forEach(id => {
    try { if (map.getLayer(id)) map.removeLayer(id); } catch {}
  });
  ['contour-lines'].forEach(id => {
    try { if (map.getSource(id)) map.removeSource(id); } catch {}
  });
  _contourDemSource = null;
}

// ── onMapLoad ─────────────────────────────────────────────────
function onMapLoad() {
  // loadGoogleSheetData();  ← ODSTRÁNIŤ (už je v initMap)
  if (_tempLayerItems && _tempLayerItems.length) _refreshTempLayer();
  map.on('moveend', debouncedRefresh);
  map.on('zoomend', debouncedRefresh);
  map.on('moveend', _nearbyAutoRefresh);
  map.on('zoomend', _nearbyAutoRefresh);
  map.on('zoomend', _schedulePlacesRerender);
  map.on('moveend', _schedulePlacesRerender);
  try { if (typeof vmBizStart === 'function') vmBizStart(); } catch (e) { console.warn('vmBizStart:', e); }
  // Loader už bol skrytý v styledata handleri — toto je len poistka
  const _mlEl = $('map-loading');
  if (_mlEl) { _mlEl.classList.add('done'); setTimeout(()=>_mlEl.remove(), 250); }
}

function debouncedRefresh() {
  clearTimeout(osmLoadTimer); clearTimeout(routesLoadTimer);
  // liberty/topo/zima: POI sú natívne z vektorového podkladu — GeoJSON osm-pois zostane prázdny
  // satelit: POI načítavame cez Overpass API
  if (currentBaseLayer === 'satelit') {
    osmLoadTimer = setTimeout(loadOSMPOIs, 800);
  } else {
    if (map && map.getSource('osm-pois')) {
      map.getSource('osm-pois').setData({type:'FeatureCollection',features:[]});
    }
  }
  routesLoadTimer=setTimeout(loadOSMRoutes,900);
}

// ── OSM bbox cache — zabraňuje zbytočným Overpass dotazom ─────
// Ukladá posledný načítaný bbox; nový request sa pošle len ak sa
// viewport posunul výraznejšie (> 35% aktuálnej výšky/šírky bbox)
let _lastOsmBbox = null;
let _lastOsmZoomFloor = -1;
let _osmForceReload = false;

function _shouldRefreshOSM(bounds, zoom) {
  const zf = Math.floor(zoom);
  if (zf !== _lastOsmZoomFloor) return true; // zmena zoom levelu — vždy refresh
  if (!_lastOsmBbox) return true;
  const bh = bounds.getNorth() - bounds.getSouth();
  const bw = bounds.getEast() - bounds.getWest();
  const ds = Math.abs(bounds.getSouth() - _lastOsmBbox.s);
  const dn = Math.abs(bounds.getNorth() - _lastOsmBbox.n);
  const dw = Math.abs(bounds.getWest() - _lastOsmBbox.w);
  const de = Math.abs(bounds.getEast() - _lastOsmBbox.e);
  // Refresh ak sa niektorý okraj posunul o viac ako 35% výšky/šírky
  return ds > bh * 0.35 || dn > bh * 0.35 || dw > bw * 0.35 || de > bw * 0.35;
}

function hideBuildInPOIs() {
  // Na liberty/topo necháme natívne POI vrstvy z podkladu (poi_r1/r7/r20/poi_transit) viditeľné —
  // sú teraz primárny zdroj POI bodov na týchto mapách.
  // Skryjeme len duplikáty ako place_of_worship, shop vrstva atď., ale nie poi source-layer.
  const style=map.getStyle(); if(!style||!style.layers) return;
  // Vrstvám z source-layer:"poi" ponecháme viditeľnosť — sú to natívne OFM POI body
  const KEEP_SOURCE_LAYERS = new Set(['poi', 'mountain_peak']);
  const kw=['place_of_worship'];
  style.layers.forEach(l=>{
    if(KEEP_SOURCE_LAYERS.has((l['source-layer']||'').toLowerCase())) return; // neskrývaj natívne POI
    const id=l.id.toLowerCase();
    if(kw.some(k=>id.includes(k))){try{map.setLayoutProperty(l.id,'visibility','none');}catch{}}
  });
}

// ── Ikony (SVG glyfy kreslené na canvas, generované líně) ─────
// ID obrázku → specifikace. Podporované formáty ID:
//   vmi:<barva-bez-#>:<glyf>        (nové vrstvy a VANDRO body)
//   osm-<typ>                       (Overpass POI na satelitu; barva typu)
//   custom-<typ> | podkat-<klíč>    (zpětná kompatibilita; zelená)
//   custom-pin                      (pin bez kategorie)
//   <libovolné ID>-hl               (zvýrazněná oranžová varianta)
const VM_GREEN = '#1B8F52';
const VM_HL = '#E67700';
function _vmIconSpec(id) {
  if (!id) return null;
  let hl = false;
  if (id.endsWith('-hl')) { hl = true; id = id.slice(0, -3); }
  let spec = null;
  if (id.startsWith('vmi:')) {
    const [, col, glyph] = id.split(':');
    spec = { color: '#' + col, glyph };
  } else if (id.startsWith('osm-')) {
    const t = id.slice(4); const c = OSM_TYPES[t];
    spec = { color: c ? c.color : '#555', glyph: vmGlyphFor(t) };
  } else if (id.startsWith('custom-') && id !== 'custom-pin') {
    spec = { color: VM_GREEN, glyph: vmGlyphFor(id.slice(7)), imgKey: id.slice(7) };
  } else if (id.startsWith('podkat-')) {
    spec = { color: VM_GREEN, glyph: vmGlyphFor(id.slice(7).replace(/_/g, ' ')), imgKey: id.slice(7).replace(/_/g, ' ') };
  } else if (id === 'custom-pin') {
    spec = { color: VM_GREEN, glyph: 'pin', pin: true };
  }
  if (!spec) return null;
  if (hl) spec = { ...spec, color: VM_HL };
  return spec;
}
function _vmDrawIcon(spec) {
  const S = 72; // px (zobrazuje se při pixelRatio 2 → 36 css px)
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const cx = c.getContext('2d');
  if (spec.pin) {
    const head = S * 0.38;
    cx.shadowColor = 'rgba(0,0,0,0.35)'; cx.shadowBlur = 6;
    cx.beginPath(); cx.arc(S/2, head, head*0.85, 0, Math.PI*2); cx.fillStyle = spec.color; cx.fill();
    cx.strokeStyle = '#fff'; cx.lineWidth = 4; cx.stroke(); cx.shadowBlur = 0;
    cx.beginPath(); cx.moveTo(S/2-8, head+head*0.7); cx.lineTo(S/2+8, head+head*0.7); cx.lineTo(S/2, S-6); cx.closePath();
    cx.fillStyle = spec.color; cx.fill();
    cx.beginPath(); cx.arc(S/2, head, head*0.35, 0, Math.PI*2); cx.fillStyle = 'rgba(255,255,255,0.95)'; cx.fill();
    return cx.getImageData(0, 0, S, S);
  }
  const r = S * 0.42;
  cx.shadowColor = 'rgba(0,0,0,0.32)'; cx.shadowBlur = S * 0.12; cx.shadowOffsetY = S * 0.02;
  cx.beginPath(); cx.arc(S/2, S/2, r, 0, Math.PI*2); cx.fillStyle = spec.color; cx.fill();
  cx.shadowBlur = 0; cx.shadowOffsetY = 0;
  cx.lineWidth = S * 0.06; cx.strokeStyle = '#fff'; cx.stroke();
  const img = spec.imgKey ? _resolveCategoryImage(spec.imgKey) : null;
  let drewImg = false;
  if (img) {
    try {
      const ir = r * 0.74;
      cx.save(); cx.beginPath(); cx.arc(S/2, S/2, ir, 0, Math.PI*2); cx.closePath(); cx.clip();
      cx.drawImage(img, S/2 - ir, S/2 - ir, ir*2, ir*2); cx.restore(); drewImg = true;
    } catch (e) { drewImg = false; }
  }
  if (!drewImg) vmDrawGlyph(cx, spec.glyph, S, '#fff', 0.5, 2.1);
  try { return cx.getImageData(0, 0, S, S); }
  catch (e) { spec = { ...spec, imgKey: null }; return _vmDrawIcon(spec); }
}
function vmEnsureImage(id) {
  if (!map || !id || map.hasImage(id)) return !!(map && map.hasImage(id));
  const spec = _vmIconSpec(id);
  if (!spec) return false;
  try { map.addImage(id, _vmDrawIcon(spec), { pixelRatio: 2 }); return true; }
  catch (e) { console.warn('vmEnsureImage', id, e); return false; }
}
function vmIconId(color, glyph) { return 'vmi:' + String(color).replace('#', '') + ':' + glyph; }

function addCustomIcons() {
  // Ikony se generují líně přes 'styleimagemissing' (viz initMap). Tady jen
  // zajistíme pin bez kategorie a dokreslíme případné vlastní obrázky.
  iconsLoaded = false;
  vmEnsureImage('custom-pin');
  // Obrázky kategorií, které se právě dočetly → přegenerovat dotčené ikony
  try {
    const style = map.getStyle();
    (style.layers || []).forEach(() => {});
  } catch (e) {}
  iconsLoaded = true;
}
function vmRefreshCategoryImages() {
  if (!map) return;
  try {
    ['custom-', 'podkat-'].forEach(p => {});
    Object.keys(map.style.imageManager.images || {}).forEach(id => {
      if (id.startsWith('custom-') || id.startsWith('podkat-') || id.startsWith('osm-')) { try { map.removeImage(id); } catch (e) {} }
    });
    map.triggerRepaint();
  } catch (e) { /* bez vlastních obrázků nic nedělat */ }
}

// ── Google Sheets ─────────────────────────────────────────────
function loadGoogleSheetData() {
  // localStorage cache — vyhne sa opakovanému sťahovaniu CSV pri každom
  // načítaní stránky, a hlavně: prežije aj úplne offline reštart appky
  // (na rozdiel od sessionStorage, ktoré sa stráca so zavretím karty).
  let cachedPlaces = null;
  try {
    const cached = localStorage.getItem('vandro_places_v1');
    if (cached) cachedPlaces = JSON.parse(cached);
  } catch {}
  if (cachedPlaces && !navigator.onLine) {
    // Offline — nemá zmysel skúšať sieť, rovno použijeme cache.
    allPlaces = cachedPlaces;
    try { renderPlacesLayer(_vandroVisiblePlaces()); } catch (e) {}
    try { if (typeof vmLayersChanged === 'function') vmLayersChanged('data'); } catch (e) {}
    return;
  }
  Papa.parse(SHEET_CSV,{download:true,header:true,skipEmptyLines:true,
    complete(results){
      allPlaces=results.data.filter(p=>p.lat&&p.lng).map(p=>{
        if(typeof p.galeria==='string') p.galeria=p.galeria.split(',').map(s=>s.trim()).filter(Boolean);
        const subKey=(p.podkategoria||'').toLowerCase().trim();
        const katKey=(p.kategoria||'').toLowerCase().trim();
        if(subKey && PODKATEGORIA_ICONS[subKey]) {
          p._icon_type=null;
          p._icon_id=`podkat-${subKey.replace(/[^a-zA-Z0-9]/g,'_')}`;
        } else if(katKey && PODKATEGORIA_ICONS[katKey]) {
          p._icon_type=null;
          p._icon_id=`podkat-${katKey.replace(/[^a-zA-Z0-9]/g,'_')}`;
        } else {
          p._icon_type=KATEGORIA_TO_TYPE[subKey]||KATEGORIA_TO_TYPE[katKey]||null;
          p._icon_id=p._icon_type?`custom-${p._icon_type}`:'custom-pin';
        }
        return p;
      });
      try { localStorage.setItem('vandro_places_v1', JSON.stringify(allPlaces)); } catch {}
      // Styl podkladu se ještě nemusel načíst — body se pak vykreslí v doReinit()
      try { renderPlacesLayer(_vandroVisiblePlaces()); } catch (e) { console.warn('renderPlacesLayer (styl ještě není načten):', e.message); }
      try { if (typeof vmLayersChanged === 'function') vmLayersChanged('data'); } catch (e) {}
      // Otvor bod z URL hash (#place=slug/lat/lng) ak bol zadaný priamo
      _openPlaceFromHash();
    },error(err){
      console.error('Sheet:',err);
      // Sieť zlyhala (napr. offline) — použijeme aspoň predošlú uloženú kópiu.
      if (cachedPlaces) { allPlaces = cachedPlaces; try { renderPlacesLayer(_vandroVisiblePlaces()); } catch (e) {} }
    }
  });
}

// ── Vrstva vlastných miest ────────────────────────────────────

function _lngLatToPixel(lng, lat, zoom) {
  const scale = 256 * Math.pow(2, zoom);
  const x = (lng + 180) / 360 * scale;
  const sinLat = Math.sin(lat * Math.PI / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function _pixelToLngLat(x, y, zoom) {
  const scale = 256 * Math.pow(2, zoom);
  const lng = x / scale * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y / scale;
  const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lng, lat };
}

function _iconPx(zoom) {
  const size = zoom < 10 ? 0.5 : zoom < 12 ? 0.7 : zoom < 14 ? 0.85 : 1.0;
  return Math.round(36 * size);
}

function _resolveOverlaps(places, zoom) {
  if (!places.length) return [];

  // Pri zoom >= 14 zobraz všetko
  if (zoom >= 14) {
    return places.map(p => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [+p.lng, +p.lat] },
      properties: {
        ...p,
        galeria: JSON.stringify(Array.isArray(p.galeria) ? p.galeria : []),
        _icon: p._icon_id || 'custom-pin',
        _icon_hl: (p._icon_id || 'custom-pin') + '-hl',
        _icon_type: p._icon_type || '',
        _icon_id: p._icon_id || 'custom-pin',
        _origLng: +p.lng,
        _origLat: +p.lat,
        _visible: 1,
        _bookmarked: _bmIsBookmarkedVisible(+p.lat, +p.lng) ? 1 : 0,
      }
    }));
  }

  // Minimálna geografická vzdialenosť medzi bodmi v stupňoch lng/lat
  // Pri zoom 8: ~0.15°, zoom 11: ~0.02°, zoom 13: ~0.005°
  // Vzorec: 40° / 2^zoom (empiricky kalibrované)
  const minDeg = 10 / Math.pow(2, zoom);

  const visible = [];
  const result = places.map(p => {
    const lng = +p.lng, lat = +p.lat;
    const tooClose = visible.some(v => {
      const dlng = Math.abs(v.lng - lng);
      const dlat = Math.abs(v.lat - lat);
      return dlng < minDeg && dlat < minDeg;
    });
    if (!tooClose) visible.push({ lng, lat });
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        ...p,
        galeria: JSON.stringify(Array.isArray(p.galeria) ? p.galeria : []),
        _icon: p._icon_id || 'custom-pin',
        _icon_hl: (p._icon_id || 'custom-pin') + '-hl',
        _icon_type: p._icon_type || '',
        _icon_id: p._icon_id || 'custom-pin',
        _origLng: lng,
        _origLat: lat,
        _visible: tooClose ? 0 : 1,
        _bookmarked: _bmIsBookmarkedVisible(lat, lng) ? 1 : 0,
      }
    };
  });

  return result;
}

function renderPlacesLayer(data) {
  const zoom = map ? map.getZoom() : 8;
  const features = _resolveOverlaps(data, zoom);
  const geojson = { type: 'FeatureCollection', features };

  if (map.getSource('places')) {
    map.getSource('places').setData(geojson);
    if (map.getLayer('places-bm-halo')) try { map.moveLayer('places-bm-halo'); } catch {}
    if (map.getLayer('places-layer')) try { map.moveLayer('places-layer'); } catch {}
    if (map.getLayer('places-hl-layer')) try { map.moveLayer('places-hl-layer'); } catch {}
    ['temp-layer-lines','search-outline-fill','search-outline-line'].forEach(id=>{ if (map.getLayer(id)) try { map.moveLayer(id); } catch {} });
    return;
  }
  map.addSource('places', { type: 'geojson', data: geojson });

  // Jemný, nerušivý "halo" kruh pod ikonou pre uložené (bookmarknuté) body —
  // vykreslený PRED places-layer, takže samotné ikony zostávajú navrchu.
  if (!map.getLayer('places-bm-halo')) {
    map.addLayer({
      id: 'places-bm-halo', type: 'circle', source: 'places', minzoom: 7,
      filter: ['all', ['==', ['get', '_bookmarked'], 1], ['==', ['get', '_visible'], 1]],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 9.3, 12, 15.5, 16, 20.7],
        'circle-color': '#e53935',
        'circle-opacity': 0.35,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#e53935',
        'circle-stroke-opacity': 0.5,
      }
    });
  }

  // Normálna vrstva — len viditeľné body
  if (!map.getLayer('places-layer')) {
    map.addLayer({
      id: 'places-layer', type: 'symbol', source: 'places', minzoom: 7,
      filter: ['==', ['get', '_visible'], 1],
      layout: {
        'icon-image': ['get', '_icon'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 7, 0.5, 12, 0.85, 16, 1.1],
        'icon-anchor': ['case', ['==', ['get', '_icon'], 'custom-pin'], 'bottom', 'center'],
        'icon-allow-overlap': true, 'icon-ignore-placement': true,
        'text-field': '',
      }, paint: {}
    });
  }

  // Highlight source — nezávislý GeoJSON, zobrazuje zvýraznený bod oranžovou ikonou
  // (skryté aj viditeľné body — highlight vždy na originálnej polohe)
  if (!map.getSource('places-hl-src')) {
    map.addSource('places-hl-src', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }
  if (!map.getLayer('places-hl-layer')) {
    map.addLayer({
      id: 'places-hl-layer', type: 'symbol', source: 'places-hl-src',
      layout: {
        'icon-image': ['get', '_icon_hl'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 7, 0.5, 12, 0.85, 16, 1.1],
        'icon-anchor': ['case', ['==', ['get', '_icon'], 'custom-pin'], 'bottom', 'center'],
        'icon-allow-overlap': true, 'icon-ignore-placement': true,
        'text-field': '',
      }, paint: {}
    });
  }
}

// Nastaví highlight — zobrazí oranžovú verziu ikony na originálnej polohe bodu
function setPlaceHighlight(latLng, iconId) {
  _hlActive = latLng;
  const src = map.getSource('places-hl-src');
  if (!src) return;
  if (!latLng) {
    src.setData({ type: 'FeatureCollection', features: [] });
    return;
  }
  const baseIcon = iconId || 'custom-pin';
  const hlIcon = baseIcon + '-hl';
  // Zaistíme oranžovú verziu ikony ak ešte neexistuje
  _ensureHighlightIcon(baseIcon, hlIcon);
  src.setData({
    type: 'FeatureCollection', features: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [latLng.lng, latLng.lat] },
      properties: { _icon: baseIcon, _icon_hl: hlIcon }
    }]
  });
  if (map.getLayer('places-hl-layer')) try { map.moveLayer('places-hl-layer'); } catch {}
}

// Oranžová verze ikony se generuje stejným generátorem (ID končí "-hl")
function _ensureHighlightIcon(baseId, hlId) { vmEnsureImage(hlId); }

// Prerendering pri zmene zoom
let _placesRerenderTimer = null;
function _schedulePlacesRerender() {
  clearTimeout(_placesRerenderTimer);
  _placesRerenderTimer = setTimeout(() => {
    if (!map || !allPlaces.length) return;
    const src = map.getSource('places');
    if (!src) return;
    const zoom = map.getZoom();
    const toShow = _vandroVisiblePlaces();
    const features = _resolveOverlaps(toShow, zoom);
    src.setData({ type: 'FeatureCollection', features });
  }, 120);
}

// ── OSM POI vrstva ────────────────────────────────────────────
// Dynamicky nájde všetky natívne vrstvy podkladu (poi + mountain_peak/vrcholy)
// namiesto spoliehania sa na natvrdo zapísané ID, ktoré sa môžu líšiť podľa štýlu.
const _MANAGED_LAYER_IDS = new Set([
  'osm-pois','places-bm-halo','places-layer','places-hl-layer',
  'hiking-routes','hiking-routes-outline','hiking-routes-label',
  'cycling-routes','cycling-routes-outline','cycling-routes-label',
]);
function _getNativePOILayerIds() {
  if (!map) return [];
  const style = map.getStyle();
  if (!style || !style.layers) return [];
  const KNOWN_SOURCE_LAYERS = new Set(['poi', 'mountain_peak']);
  return style.layers
    .filter(l => !_MANAGED_LAYER_IDS.has(l.id)
      && KNOWN_SOURCE_LAYERS.has((l['source-layer']||'').toLowerCase())
      && (l.type === 'symbol' || l.type === 'circle'))
    .map(l => l.id);
}

function setupOSMLayer() {
  if(!map.getSource('osm-pois')) {
    map.addSource('osm-pois',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  }
  if(!map.getLayer('osm-pois')) {
    map.addLayer({id:'osm-pois',type:'symbol',source:'osm-pois',layout:{
      'icon-image':['concat','osm-',['get','osm_type']],
      'icon-size':['interpolate',['linear'],['zoom'],12,0.44,15,0.68,18,0.9],
      'icon-anchor':'center','icon-allow-overlap':true,'icon-ignore-placement':true,
      'text-field':'',
    },paint:{}});
  }
}

// ── Vrstvy trás ───────────────────────────────────────────────
function setupRouteLayers() {
  function addRouteSource(id) {
    if(map.getSource(id)) return;
    map.addSource(id,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  }
  addRouteSource('hiking-routes'); addRouteSource('cycling-routes');

  const lineProps=(color,dash)=>({
    'line-color':['coalesce',['get','color'],color],
    'line-width':['interpolate',['linear'],['zoom'],8,1,12,2,16,3.5],
    'line-opacity':0.85,
    ...(dash?{'line-dasharray':[5,3]}:{}),
  });

  const addBeforeIfMissing=(id,spec,before)=>{
    if(!map.getLayer(id)){
      try{ map.addLayer(spec, before&&map.getLayer(before)?before:undefined); }catch(e){console.warn('addLayer',id,e);}
    }
  };
  addBeforeIfMissing('hiking-routes-outline',{id:'hiking-routes-outline',type:'line',source:'hiking-routes',minzoom:8,
    layout:{'line-join':'round','line-cap':'round'},
    paint:{'line-color':'#fff','line-width':['interpolate',['linear'],['zoom'],8,2,12,3.5,16,5.5],'line-opacity':0.5}
  },'osm-pois');
  addBeforeIfMissing('hiking-routes',{id:'hiking-routes',type:'line',source:'hiking-routes',minzoom:8,
    layout:{'line-join':'round','line-cap':'round'},paint:lineProps('#3498db',false)
  },'osm-pois');
  addBeforeIfMissing('hiking-routes-label',{id:'hiking-routes-label',type:'symbol',source:'hiking-routes',minzoom:13,
    layout:{'symbol-placement':'line','text-field':['coalesce',['get','ref'],['get','name']],
      'text-font':['literal',['Noto Sans Bold']],'text-size':12,'text-max-angle':30,'symbol-spacing':300},
    paint:{'text-color':['coalesce',['get','color'],'#2980b9'],'text-halo-color':'#fff','text-halo-width':2.5}
  },'osm-pois');
  addBeforeIfMissing('cycling-routes-outline',{id:'cycling-routes-outline',type:'line',source:'cycling-routes',minzoom:8,
    layout:{'line-join':'round','line-cap':'round'},
    paint:{'line-color':'#fff','line-width':['interpolate',['linear'],['zoom'],8,2,12,3.5,16,5.5],'line-opacity':0.4}
  },'osm-pois');
  addBeforeIfMissing('cycling-routes',{id:'cycling-routes',type:'line',source:'cycling-routes',minzoom:8,
    layout:{'line-join':'round','line-cap':'round'},paint:lineProps('#8e44ad',true)
  },'osm-pois');
  addBeforeIfMissing('cycling-routes-label',{id:'cycling-routes-label',type:'symbol',source:'cycling-routes',minzoom:13,
    layout:{'symbol-placement':'line','text-field':['coalesce',['get','ref'],['get','name']],
      'text-font':['literal',['Noto Sans Bold']],'text-size':11,'text-max-angle':30,'symbol-spacing':300},
    paint:{'text-color':['coalesce',['get','color'],'#8e44ad'],'text-halo-color':'#fff','text-halo-width':2.5}
  },'osm-pois');
  // Zaistíme správne poradie: trasy pod POI, POI a vlastné body navrchu
  ['hiking-routes-outline','hiking-routes','hiking-routes-label',
   'cycling-routes-outline','cycling-routes','cycling-routes-label'].forEach(id=>{
    try{ if(map.getLayer(id)&&map.getLayer('osm-pois')) map.moveLayer(id,'osm-pois'); }catch{}
  });
  if(map.getLayer('osm-pois')) try{map.moveLayer('osm-pois');}catch{}
  if(map.getLayer('places-bm-halo')) try{map.moveLayer('places-bm-halo');}catch{}
  if(map.getLayer('places-layer')) try{map.moveLayer('places-layer');}catch{}
  if(map.getLayer('places-hl-layer')) try{map.moveLayer('places-hl-layer');}catch{}
  ['temp-layer-lines','search-outline-fill','search-outline-line'].forEach(id=>{ if (map.getLayer(id)) try { map.moveLayer(id); } catch {} });
}

// ── Overpass — POI ────────────────────────────────────────────
async function loadOSMPOIs() {
  if(!map||!map.getSource('osm-pois')) return;
  // Vždy zaistíme ikony pred načítaním POI — iconsLoaded môže byť false po setStyle()
  if(!iconsLoaded) { try { addCustomIcons(); } catch(e) { console.warn('icons:', e); } }
  const zoom=map.getZoom(),bounds=map.getBounds();

  const forced = _osmForceReload;
  if (forced) {
    _osmForceReload = false;
    lastOsmKey = ''; // reset aj kľúč nech sa nič neblokuje
  } else if (!_shouldRefreshOSM(bounds, zoom)) {
    return;
  }

  const key=`p_${Math.floor(zoom)}_${bounds.getSouth().toFixed(2)}_${bounds.getNorth().toFixed(2)}_${bounds.getWest().toFixed(2)}_${bounds.getEast().toFixed(2)}`;
  if(!forced && key===lastOsmKey) return;
  lastOsmKey=key;

  // Aktualizácia cache bbox
  _lastOsmBbox = { s: bounds.getSouth(), n: bounds.getNorth(), w: bounds.getWest(), e: bounds.getEast() };
  _lastOsmZoomFloor = Math.floor(zoom);

  // Aktívne typy podľa zoom levelu — pri nižšom zoome obmedz počet typov
  let active=Object.entries(OSM_TYPES).filter(([,c])=>c.minZoom<=zoom);
  if(zoom<15) active=active.slice(0,18);       // pri zoom<15 max 18 typov
  else if(zoom<16) active=active.slice(0,35);  // pri zoom<16 max 35 typov
  if(!active.length){map.getSource('osm-pois').setData({type:'FeatureCollection',features:[]});return;}
  const parts=[],seen=new Set();
  active.forEach(([,conf])=>conf.keys.forEach(([k,v])=>{
    if(!seen.has(`${k}=${v}`)){parts.push(`node[${k}="${v}"];way[${k}="${v}"];`);seen.add(`${k}=${v}`);}
  }));
  // Väčší padding = prefetch okolie → menej dotazov pri pohybe
  const pad=zoom>=15?0.03:0.015,b=bounds;
  const bbox=`${b.getSouth()-pad},${b.getWest()-pad},${b.getNorth()+pad},${b.getEast()+pad}`;
  const query=`[bbox:${bbox}][out:json][timeout:20];(${parts.join('')});out center tags 500;`;
  try {
    const res=await overpassFetch(query,12000);
    if(!res.ok) return;
    const data=await res.json();
    const tkeys=['amenity','tourism','historic','leisure','shop','railway','highway','natural','waterway'];
    const features=[];
    data.elements.forEach(el=>{
      const lat=el.center?.lat??el.lat,lon=el.center?.lon??el.lon;
      if(!lat||!lon) return;
      const tags=el.tags||{};
      let osmType=null;
      for(const k of tkeys){if(tags[k]){osmType=TAG_TO_TYPE[`${k}=${tags[k]}`];if(osmType)break;}}
      if(!osmType) return;
      const conf=OSM_TYPES[osmType];if(!conf||conf.minZoom>zoom) return;
      // Preskočiť OSM body ktoré sú zhodné s VANDRO miestami (vzdialenosť < 80m)
      const dupVandro = allPlaces.some(p => haversineKm(+p.lat,+p.lng,lat,lon) < 0.08);
      if(dupVandro) return;
      features.push({type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:{
        osm_type:osmType,label:conf.label,name:tags.name||conf.label,
        phone:tags.phone||tags['contact:phone']||'',opening_hours:tags.opening_hours||'',
        web:tags.website||tags['contact:website']||'',operator:tags.operator||'',brand:tags.brand||'',
        cuisine:tags.cuisine||'',wheelchair:tags.wheelchair||'',fee:tags.fee||'',
        ele:tags.ele||tags.elevation||'',email:tags.email||tags['contact:email']||'',
        access:tags.access||'',religion:tags.religion||'',capacity:tags.capacity||'',
        description:tags.description||'',start_date:tags.start_date||'',wikidata:tags.wikidata||'',wikipedia:tags.wikipedia||'',
        addr_street:tags['addr:street']||'',addr_housenumber:tags['addr:housenumber']||'',
        addr_city:tags['addr:city']||tags['addr:town']||'',
      }});
    });
    if(!iconsLoaded) addCustomIcons();
    map.getSource('osm-pois')?.setData({type:'FeatureCollection',features});
  } catch(e){if(e.name!=='TimeoutError'&&e.name!=='AbortError')console.warn('POI:',e);}
}

// ── Overpass — trasy ──────────────────────────────────────────
async function loadOSMRoutes() {
  if(!map||!map.getSource('hiking-routes')||!map.getSource('cycling-routes')) return;
  const zoom=map.getZoom();
  if(zoom<10){
    map.getSource('hiking-routes').setData({type:'FeatureCollection',features:[]});
    map.getSource('cycling-routes').setData({type:'FeatureCollection',features:[]});
    return;
  }
  const bounds=map.getBounds();
  const key=`r_${Math.floor(zoom)}_${bounds.getSouth().toFixed(2)}_${bounds.getNorth().toFixed(2)}_${bounds.getWest().toFixed(2)}_${bounds.getEast().toFixed(2)}`;
  if(key===lastRoutesKey) return; lastRoutesKey=key;
  const pad=0.01,b=bounds;
  const bbox=`${b.getSouth()-pad},${b.getWest()-pad},${b.getNorth()+pad},${b.getEast()+pad}`;
  const query=`[bbox:${bbox}][out:json][timeout:25];(relation["route"~"hiking|foot"]["network"~"iwn|nwn|rwn|lwn"];relation["route"="bicycle"]["network"~"icn|ncn|rcn|lcn"];);out geom tags 300;`;
  try {
    const res=await overpassFetch(query,18000);
    if(!res.ok) return;
    const data=await res.json();
    const hike=[],cycle=[];
    data.elements.forEach(rel=>{
      if(rel.type!=='relation') return;
      const tags=rel.tags||{};
      const isCycle=tags.route==='bicycle';
      const color=getRouteColor(tags);
      const meta={color,name:tags.name||'',ref:tags.ref||'',network:tags.network||'',
        operator:tags.operator||'',description:tags.description||'',
        distance:tags.distance||'',ascent:tags.ascent||'',descent:tags.descent||'',
        colour:tags.colour||tags['route:colour']||'',url:tags.url||tags.website||'',
        route_type:isCycle?'bicycle':'hiking'};
      if(!rel.members) return;
      rel.members.forEach(m=>{
        if(m.type!=='way'||!m.geometry||m.geometry.length<2) return;
        const coords=m.geometry.map(n=>[n.lon,n.lat]);
        const feat={type:'Feature',geometry:{type:'LineString',coordinates:coords},properties:meta};
        if(isCycle) cycle.push(feat); else hike.push(feat);
      });
    });
    map.getSource('hiking-routes')?.setData({type:'FeatureCollection',features:hike});
    map.getSource('cycling-routes')?.setData({type:'FeatureCollection',features:cycle});
  } catch(e){if(e.name!=='TimeoutError'&&e.name!=='AbortError')console.warn('Routes:',e);}
}

// ── ZMENA PODKLADOVEJ MAPY (OPRAVENÁ VERZIA) ────────────────────────────────────
function showLoader(){
  if(document.getElementById('bm-loader')) return;
  const l=document.createElement('div');
  l.id='bm-loader';
  l.style.cssText='position:fixed;inset:0;background:rgba(255,255,255,0.55);z-index:9990;display:flex;align-items:center;justify-content:center;transition: opacity 0.3s ease;';
  l.innerHTML='<div class="spinner"></div>';
  vmRoot().appendChild(l);
  // Garantovaný fallback — loader vždy zmizne po max 3 sekundách
  setTimeout(hideLoader, 2000);
}
function hideLoader(){ 
  const loader = document.getElementById('bm-loader');
  if(loader) {
    loader.style.opacity = '0';
    setTimeout(() => loader.remove(), 300); // plynulé skrytie
  }
}

function reInitAllLayers() {
  // Poradie je kritické: 1.ikony → 2.zdroje → 3.trasy → 4.vlastné body
  try { addCustomIcons(); } catch(e) { console.warn('addCustomIcons:',e); }
  // OSM POI
  if(!map.getSource('osm-pois')) map.addSource('osm-pois',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  if(!map.getLayer('osm-pois')) map.addLayer({
    id:'osm-pois',type:'symbol',source:'osm-pois',
    layout:{
      'icon-image':['concat','osm-',['get','osm_type']],
      'icon-size':['interpolate',['linear'],['zoom'],12,0.44,15,0.68,18,0.9],
      'icon-anchor':'center','icon-allow-overlap':true,'icon-ignore-placement':true,
      'text-field':'',
    },paint:{}
  });
  // Trasy
  ['hiking-routes','cycling-routes'].forEach(id=>{
    if(!map.getSource(id)) map.addSource(id,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  });
  const LP=(c,dash)=>({'line-color':['coalesce',['get','color'],c],'line-width':['interpolate',['linear'],['zoom'],8,1,12,2,16,3.5],'line-opacity':0.85,...(dash?{'line-dasharray':[5,3]}:{})});
  const addL=(id,spec)=>{if(!map.getLayer(id)){try{map.addLayer(spec);}catch(e){console.warn(id,e);}}};
  addL('hiking-routes-outline',{id:'hiking-routes-outline',type:'line',source:'hiking-routes',minzoom:8,
    layout:{'line-join':'round','line-cap':'round'},
    paint:{'line-color':'#fff','line-width':['interpolate',['linear'],['zoom'],8,2,12,3.5,16,5.5],'line-opacity':0.5}});
  addL('hiking-routes',{id:'hiking-routes',type:'line',source:'hiking-routes',minzoom:8,
    layout:{'line-join':'round','line-cap':'round'},paint:LP('#3498db')});
  addL('hiking-routes-label',{id:'hiking-routes-label',type:'symbol',source:'hiking-routes',minzoom:13,
    layout:{'symbol-placement':'line','text-field':['coalesce',['get','ref'],['get','name']],
      'text-font':['literal',['Noto Sans Bold']],'text-size':12,'text-max-angle':30,'symbol-spacing':300},
    paint:{'text-color':['coalesce',['get','color'],'#2980b9'],'text-halo-color':'#fff','text-halo-width':2.5}});
  addL('cycling-routes-outline',{id:'cycling-routes-outline',type:'line',source:'cycling-routes',minzoom:8,
    layout:{'line-join':'round','line-cap':'round'},
    paint:{'line-color':'#fff','line-width':['interpolate',['linear'],['zoom'],8,2,12,3.5,16,5.5],'line-opacity':0.4}});
  addL('cycling-routes',{id:'cycling-routes',type:'line',source:'cycling-routes',minzoom:8,
    layout:{'line-join':'round','line-cap':'round'},paint:LP('#8e44ad',true)});
  addL('cycling-routes-label',{id:'cycling-routes-label',type:'symbol',source:'cycling-routes',minzoom:13,
    layout:{'symbol-placement':'line','text-field':['coalesce',['get','ref'],['get','name']],
      'text-font':['literal',['Noto Sans Bold']],'text-size':11,'text-max-angle':30,'symbol-spacing':300},
    paint:{'text-color':['coalesce',['get','color'],'#8e44ad'],'text-halo-color':'#fff','text-halo-width':2.5}});
  // Vlastné miesta — vždy navrchu (rešpektuj aktívny filter kategórie)
  renderPlacesLayer(_vandroVisiblePlaces());
  // Presun navrch
  try{if(map.getLayer('osm-pois')) map.moveLayer('osm-pois');}catch{}
  // Natívne POI z vektorového podkladu (liberty/topo/zima) — musia byť nad linkami trás
  Array.from(new Set([
    'poi_r1','poi_r7','poi_r20','poi_transit','z-poi-r1','z-poi-r7','z-poi-r20','z-poi-transit',
    ..._getNativePOILayerIds(),
  ])).forEach(id=>{
    try{ if(map.getLayer(id)) map.moveLayer(id); }catch{}
  });
  try { if (typeof vmBizReinit === 'function') vmBizReinit(); } catch (e) { console.warn('vmBizReinit:', e); }
  try{if(map.getLayer('places-bm-halo')) map.moveLayer('places-bm-halo');}catch{}
  try{if(map.getLayer('places-layer')) map.moveLayer('places-layer');}catch{}
  try{if(map.getLayer('places-hl-layer')) map.moveLayer('places-hl-layer');}catch{}
  ['temp-layer-lines','search-outline-fill','search-outline-line'].forEach(id=>{ if (map.getLayer(id)) try { map.moveLayer(id); } catch {} });
}

function changeBasemap(layer) {
  if(layer===currentBaseLayer) return;
  const prev=currentBaseLayer;
  currentBaseLayer=layer;
  iconsLoaded=false;
  lastOsmKey='';
  lastRoutesKey='';
  _lastOsmBbox = null; _lastOsmZoomFloor = -1;
  // Vyčistíme vrstevnice pri odchode z topo
  if (prev === 'topo') removeContourLayers();

  // ── Optimalizovaný swap BEZ setStyle() ak meníme medzi rastrovými vrstvami ──
  const rasterLayers = [];
  if(rasterLayers.includes(prev) && rasterLayers.includes(layer)) {
    const newStyle = STYLES[layer];
    Object.entries(newStyle.sources).forEach(([srcId, srcDef]) => {
      const src = map.getSource(srcId);
      if(src && srcDef.tiles) {
        src.setTiles(srcDef.tiles);
      } else if(!src) {
        map.addSource(srcId, srcDef);
      }
    });
    const newLayerIds = new Set(newStyle.layers.map(l=>l.id));
    const prevLayerIds = new Set(STYLES[prev].layers.map(l=>l.id));
    prevLayerIds.forEach(id=>{ try{if(map.getLayer(id)) map.setLayoutProperty(id,'visibility','none');}catch{} });
    newStyle.layers.forEach(lSpec=>{
      if(!map.getLayer(lSpec.id)){
        try{ map.addLayer(lSpec, map.getLayer('osm-pois')?'osm-pois':undefined); }catch{}
      }
      try{ map.setLayoutProperty(lSpec.id,'visibility','visible'); }catch{}
    });
    debouncedRefresh();
    return;
  }

  showLoader();
  const styleRef = STYLES[layer];
  const styleArg = typeof styleRef === 'string' ? `${styleRef}?v=${Date.now()}` : styleRef;
  map.setStyle(styleArg);
  // hideLoader sa zavolá v globálnom style.load handleri
  // Pre satelit: po setStyle zaistíme Overpass load s dostatočným oneskorením
  if (layer === 'satelit') {
    setTimeout(() => {
      if (currentBaseLayer === 'satelit' && map.getSource('osm-pois')) {
        _osmForceReload = true;
        lastOsmKey = '';
        loadOSMPOIs();
      }
    }, 1500);
  }
}


// ── VYHĽADÁVANIE ─────────────────────────────────────────────
function showHistory(el) {
  const h=getHistory(); if(!h.length){el.classList.add('hidden');return;}
  el.innerHTML=`<div class="history-header"><span>Naposledy navštívená místa</span><button onclick="window._clearHistory()" class="history-clear-btn">Vymazať</button></div>`+
    h.map(p=>{
      const ic=getIconForKategoria(p.kategoria||'', p.podkategoria||'');
      const dist=userLocation?`<span class="res-dist">${fmtDist(haversineKm(userLocation.lat,userLocation.lng,+p.lat,+p.lng))}</span>`:'';
      const subLbl=p.podkategoria?`${p.kategoria} › ${p.podkategoria}`:(p.kategoria||'');
      return `<div class="res-item local" onclick="window._pickFromCache(${_stashPick(p)})">
        <span class="res-item-icon">${ic||vmIconSvg('pin')}</span>
        <div class="res-item-content"><strong>${p.nazov}</strong><small>${subLbl}</small></div>${dist}
      </div>`;
    }).join('');
  el.classList.remove('hidden');
}

// ── Skórovanie relevancie výsledkov vyhľadávania ──────────────
// Kombinuje: blízkosť k středu mapy / GPS a "význam" typu miesta
// (mesto/obec má prednosť pred ulicou pri rovnakom názve).
const PLACE_TYPE_RANK = {
  // vyššie číslo = vyššia priorita
  city:100, town:95, municipality:93, village:90, hamlet:85,
  administrative:80, suburb:75, neighbourhood:70, quarter:68,
  island:60, peak:60, attraction:58, tourism:55,
  road:30, street:30, residential:28, pedestrian:26, footway:20,
  house:15, building:15,
};
function _placeTypeScore(g){
  const t=(g.type||'').toLowerCase(), c=(g.class||'').toLowerCase();
  if(PLACE_TYPE_RANK[t]!=null) return PLACE_TYPE_RANK[t];
  if(PLACE_TYPE_RANK[c]!=null) return PLACE_TYPE_RANK[c];
  if(c==='place') return 80;
  if(c==='highway') return 25;
  if(c==='building') return 15;
  return 40;
}
function sortGlobalResults(list, ctr){
  return list.map(g=>{
    const dKm=haversineKm(ctr.lat,ctr.lng,+g.lat,+g.lon);
    // Skóre: typ miesta (mesto > ulica) má najväčšiu váhu,
    // importance z Nominatim dorovnáva v rámci rovnakého typu,
    // blízkosť k mape je tretí faktor (klesá s logaritmom vzdialenosti).
    const typeScore=_placeTypeScore(g);
    const importance=(g.importance||0.2)*20; // 0..~12
    const proximity=Math.max(0,12-Math.log2(1+dKm)); // blízke miesta bonus
    return {...g,_dist:dKm,_score:typeScore+importance+proximity};
  }).sort((a,b)=>b._score-a._score);
}
// OSM/Nominatim výsledok, ktorý je fyzicky (podľa GPS) totožný s už existujúcim
// vlastným VANDRO bodom, sa v hľadaní nezobrazuje duplicitne — VANDRO bod má prednosť.
function _isNearVandroPlace(lat, lng, thresholdKm = 0.15) {
  return allPlaces.some(p => haversineKm(lat, lng, +p.lat, +p.lng) < thresholdKm);
}

// ── Offline náhradná fotografia ─────────────────────────────────
// Keď je appka offline a miesto nemá (alebo sa nepodarí načítať) hlavnú
// fotografiu, použije sa táto náhradná — zámerne je aj v service workeri
// (sw.js, SHELL_FILES) predcachovaná, takže je dostupná aj úplne offline.
const OFFLINE_FALLBACK_PHOTO = 'https://spoznajslovensko.eu/wp-content/uploads/2026/07/Blush-Pink-Abstract-Watercolor-Fashion-Or-Beauty-Studio-Facebook-Cover-%E2%80%93-ko_20260709_232215_0000.png';

function _mainPhotoImgHtml(fotoMain, cssClass) {
  if (!fotoMain) {
    // Bez fotky vôbec — offline ukáž náhradný obrázok, online radšej nič
    // (aby sa nezobrazoval "placeholder" v prípadoch, keď appka ešte len
    // dotiahne fotku z Wikipédie/Commons cez _enrichPlaceMedia).
    return navigator.onLine ? '' : `<img src="${OFFLINE_FALLBACK_PHOTO}" class="${cssClass}" alt="" loading="lazy">`;
  }
  // Fotka je zadaná, ale offline sa nemusí podariť načítať (nie je
  // predcachovaná) — onerror ju v tom prípade nahradí náhradnou.
  return `<img src="${fotoMain}" class="${cssClass}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${OFFLINE_FALLBACK_PHOTO}';">`;
}
// Rovnaká logika pre mobilný náhľadový thumbnail (openMobileSheet dostáva
// priamo URL, nie HTML — tu vraciame buď skutočnú/náhradnú URL, alebo null).
function _mainPhotoThumbSrc(fotoMain) {
  if (fotoMain) return fotoMain;
  return navigator.onLine ? null : OFFLINE_FALLBACK_PHOTO;
}

// Galéria vyžaduje viacero obrázkov naraz, ktoré appka nikde neprecachúva
// — offline by sa zobrazilo len množstvo rozbitých obrázkov, preto ju
// v offline režime radšej celú skryjeme.
function _renderGalleryHtml(galeria) {
  if (!galeria.length || !navigator.onLine) return '';
  return `<p class="section-title">Galerie</p><div class="panel-gallery">${galeria.map(img => `<a href="${img}" class="glightbox"><img src="${img}" class="gal-item" alt="" loading="lazy"></a>`).join('')}</div>`;
}

function _renderDescriptionHtml(popis) {
  if (!popis) return '';
  return `<div class="panel-description clamp-text" data-desc>${popis}</div>
    <button class="btn-show-more" data-desc-toggle onclick="
      const d=this.previousElementSibling;
      const clamped=d.classList.toggle('clamp-text');
      this.textContent = clamped ? 'Zobrazit více' : 'Zobrazit méně';
    ">Zobrazit více</button>`;
}
// Po vložení do DOM skryjeme tlačidlo "Zobrazit více" pri textoch, ktoré sa
// aj tak celé zmestia (orezanie by inak nemalo žiadny efekt).
function _initClampedText(root) {
  (root || document).querySelectorAll('[data-desc]').forEach(d => {
    const btn = d.nextElementSibling;
    if (!btn || !btn.hasAttribute('data-desc-toggle')) return;
    if (d.scrollHeight <= d.clientHeight + 2) { d.classList.remove('clamp-text'); btn.style.display = 'none'; }
  });
}

// Pri otváraní bodu (napr. kliknutím na položku histórie, ktorá si pamätá
// len odľahčený snapshot bez fotiek/popisu) vždy uprednostníme AKTUÁLNY plný
// VANDRO záznam z allPlaces, ak na daných súradniciach existuje — inak by sa
// namiesto neho zobrazil "holý" panel (prípadne dotiahnutý z Wikipedie/
// Commons), čo pôsobí, akoby sa otvoril iný (OSM) bod na rovnakom mieste.
function _resolvePlaceForOpen(p) {
  if (p.osm_type) return p; // toto je zámerne OSM bod — nič nedohľadávaj
  if (p._vm_kind) return p;
  if (typeof vmFindBizPlace === 'function') { const bz = vmFindBizPlace(p); if (bz) return bz; }
  const match = allPlaces.find(pl => Math.abs(+pl.lat - +p.lat) < 0.0005 && Math.abs(+pl.lng - +p.lng) < 0.0005);
  return match || p;
}

// Vyhľadávanie cez Photon (komoot) — geokodér nad OSM daty postavený priamo
// pre "search-as-you-type" (na rozdiel od Nominatim /search podporuje aj
// neúplné/predponové zhody, napr. "Bard" nájde "Bardejov"). Výsledky sú
// smerované (nie tvrdo obmedzené) k stredu mapy, takže sa dajú nájsť aj
// vzdialenejšie mestá, ulice či celé štáty.
function _photonToResult(f) {
  const p = f.properties || {};
  const [lon, lat] = f.geometry.coordinates;
  const line2 = [p.street && p.housenumber ? `${p.street} ${p.housenumber}` : p.street, p.city, p.state, p.country]
    .filter(Boolean);
  const display = [p.name, ...line2].filter(Boolean);
  return {
    lat, lon,
    display_name: [...new Set(display)].join(', '),
    name: p.name || p.street || '',
    class: p.osm_key || '',
    type: p.osm_value || p.type || '',
    importance: 0.2,
    osm_type: p.osm_type || null,
    osm_id: p.osm_id || null,
  };
}
// Nominatim search — používame ako fallback, keď Photon zlyhá (rate-limit,
// CORS, výpadok…) alebo nevráti žiadny výsledok. Formát výsledku mapujeme
// na rovnaký tvar ako _photonToResult, aby ho vedel spracovať zvyšný kód.
function _nominatimToResult(d) {
  return {
    lat: d.lat, lon: d.lon,
    display_name: d.display_name || '',
    name: d.name || (d.display_name || '').split(',')[0] || '',
    class: d.class || '',
    type: d.type || '',
    importance: d.importance != null ? d.importance : 0.2,
    osm_type: d.osm_type || null,
    osm_id: d.osm_id || null,
  };
}
async function _geocodeSearchPhoton(val, ctr) {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(val)}&lat=${ctr.lat}&lon=${ctr.lng}&zoom=11&limit=10&lang=cs`;
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) { console.warn('geocodeSearch: Photon HTTP', r.status); return []; }
    const data = await r.json();
    return (data.features || []).map(_photonToResult).filter(g => g.lat && g.lon);
  } catch (e) { console.warn('geocodeSearch: Photon zlyhal:', e); return []; }
}
async function _geocodeSearchNominatim(val, ctr) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=10&addressdetails=1&lat=${ctr.lat}&lon=${ctr.lng}`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'cs,sk' }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) { console.warn('geocodeSearch: Nominatim HTTP', r.status); return []; }
    const data = await r.json();
    return (Array.isArray(data) ? data : []).map(_nominatimToResult).filter(g => g.lat && g.lon);
  } catch (e) { console.warn('geocodeSearch: Nominatim zlyhal:', e); return []; }
}
async function geocodeSearch(val, ctr) {
  // Primárne Photon (lepšie search-as-you-type správanie), pri zlyhaní
  // alebo prázdnom výsledku skúsime Nominatim, aby vyhľadávanie nezostalo
  // úplne bez globálnych výsledkov keď je Photon nedostupný/throttlovaný.
  let out = await _geocodeSearchPhoton(val, ctr);
  if (!out.length) out = await _geocodeSearchNominatim(val, ctr);
  return out;
}

// ── Zjednotené vyhľadávanie: lokálne VANDRO body + globálne (Photon/Nominatim)
// sa teraz VŽDY hodnotia spolu podľa jednej škály relevancie namiesto toho,
// aby lokálne výsledky vždy vytlačili globálne. Skóre zohľadňuje:
//  - kvalitu zhody (presný názov > názov na začiatku > názov obsahuje >
//    zhoda len v kategórii),
//  - významnosť miesta (mesto > obec > ulica… — cez _placeTypeScore),
//  - blízkosť k stredu mapy / polohe užívateľa (klesá s log2 vzdialenosti).
// Vďaka tomu napr. "hrad" nezobrazí len desiatky vlastných bodov s
// kategóriou "hrady a zámky", ale zoradí ich spolu s reálnymi hradmi z OSM
// podľa toho, čo je skutočne najbližšie/najvýznamnejšie.
function _localMatchScore(p, val, ctr) {
  const name = (p.nazov || '').toLowerCase();
  const kat = (p.kategoria || '').toLowerCase();
  const podkat = (p.podkategoria || '').toLowerCase();
  let matchScore;
  if (name === val) matchScore = 100;
  else if (name.startsWith(val)) matchScore = 78;
  else if (name.includes(val)) matchScore = 58;
  else if (kat.includes(val) || podkat.includes(val)) matchScore = 32;
  else matchScore = 20; // teoreticky by sem nemalo dôjsť (už vyfiltrované vyššie)
  const dKm = haversineKm(ctr.lat, ctr.lng, +p.lat, +p.lng);
  const proximity = Math.max(0, 12 - Math.log2(1 + dKm));
  // Malý bonus za to, že ide o kurátorsky vybraný VANDRO bod (vlastný obsah,
  // fotky, popis…), aby pri podobnej relevancii mierne vyhrával nad
  // všeobecným OSM záznamom rovnakého typu.
  const curatedBonus = 6;
  return { score: matchScore + proximity + curatedBonus, dist: dKm };
}

async function buildUnifiedSearchResults(val, ctr) {
  let local = allPlaces.filter(p => (p.nazov || '').toLowerCase().includes(val)
    || (p.kategoria || '').toLowerCase().includes(val)
    || (p.podkategoria || '').toLowerCase().includes(val));
  if (typeof vmBizSearch === 'function') local = local.concat(vmBizSearch(val));
  local = local.map(p => {
    const { score, dist } = _localMatchScore(p, val, ctr);
    return { ...p, _isLocal: true, _score: score, _dist: dist };
  });

  let global = [];
  if (navigator.onLine) {
    try {
      let gm = await geocodeSearch(val, ctr);
      gm = gm.filter(g => !_isNearVandroPlace(+g.lat, +g.lon));
      global = sortGlobalResults(gm, ctr).map(g => ({ ...g, _isLocal: false }));
    } catch (e) { console.warn('buildUnifiedSearchResults: globálne výsledky zlyhali:', e); }
  }

  return [...local, ...global].sort((a, b) => b._score - a._score).slice(0, 12);
}

// Vykreslí jednu položku výsledku (lokálny VANDRO bod alebo globálne
// OSM/Nominatim miesto) rovnakým markupom, aký appka používala doteraz —
// len teraz z jedného spoločného miesta namiesto 3 kópií toho istého kódu.
function _renderSearchResultItem(item, pickerFnName, extraOnclickTail = '') {
  const dist = `<span class="res-dist">${fmtDist(item._dist)}</span>`;
  if (item._isLocal) {
    const ic = getIconForKategoria(item.kategoria || '', item.podkategoria || '');
    const subLabel = item.podkategoria ? `${item.kategoria || ''} › ${item.podkategoria}` : (item.kategoria || '');
    return `<div class="res-item local" onclick="window.${pickerFnName}(${_stashPick(item)})">
      <span class="res-item-icon">${ic}</span>
      <div class="res-item-content"><strong>${escapeHtml(item.nazov)}</strong><small>${escapeHtml(subLabel)}</small></div>${dist}
    </div>`;
  }
  const g = item;
  return `<div class="res-item global" onclick="window._pickGlobalFromCache(${_stashPick(g)})${extraOnclickTail}">
    <span class="res-item-icon"><i class="fa-solid fa-location-dot"></i></span>
    <div class="res-item-content"><strong>${escapeHtml(g.name || (g.display_name || '').split(',')[0])}</strong><small>${escapeHtml(g.display_name || '')}</small></div>${dist}
  </div>`;
}

function closeAllSearch(){
  document.querySelectorAll('.search-results').forEach(e=>e.classList.add('hidden'));
  ['search-input','search-input-desktop'].forEach(id=>{const e=$(id);if(e)e.value='';});
}


window._pick=p=>{
  clearSearchOutline();
  // Zoom na nájdené miesto ak je mimo viditeľnej oblasti alebo zoom je malý
  const lat=+p.lat,lng=+p.lng;
  const bounds=map.getBounds();
  const curZoom=map.getZoom();
  if(!bounds.contains([lng,lat])||curZoom<13){
    map.flyTo({center:[lng,lat],zoom:Math.max(curZoom,14),speed:1.5});
  }
  // Bod je zvýraznený priamo v showPlaceDetail (oranžová ikona) — netreba modrý dočasný pin
  showPlaceDetail(_resolvePlaceForOpen(p));
  closeAllSearch();
};
window._pickGlobal=async (lat,lon,dn,name,osmType,osmId)=>{
  const n=name||(dn||'').split(',')[0];
  const bounds=map.getBounds();
  if(!bounds.contains([+lon,+lat])) map.flyTo({center:[+lon,+lat],zoom:Math.max(map.getZoom(),12),speed:1.4});

  // Okamžite zobraz základný panel (bez markera)
  const baseP={lat,lng:lon,nazov:n,kategoria:'Nalezené místo',osm_type:null};
  showPlaceDetail(baseP);
  closeAllSearch();

  // Paralelne: obrys + Nominatim details
  const detailPromise = (osmId && osmType) ? (async()=>{
    try {
      const osmTypeFull = osmType==='N'?'node':osmType==='W'?'way':'relation';
      const r = await fetch(`https://nominatim.openstreetmap.org/lookup?osm_ids=${osmType}${osmId}&format=json&addressdetails=1&extratags=1&namedetails=1`,{headers:{'Accept-Language':'cs,sk'}});
      const data = await r.json();
      if (!data?.[0]) return;
      const d = data[0];
      const ext = d.extratags || {};
      const addr = d.address || {};
      const p = {
        lat, lng:lon,
        nazov: d.namedetails?.['name:cs'] || d.namedetails?.name || n,
        kategoria: d.class || 'Místo',
        podkategoria: d.type || '',
        web: ext.website || ext.url || '',
        phone: ext.phone || '',
        opening_hours: ext.opening_hours || '',
        wheelchair: ext.wheelchair || '',
        description: ext.description || '',
        wikidata: ext.wikidata || '',
        wikipedia: ext.wikipedia || '',
        addr_street: addr.road || '',
        addr_housenumber: addr.house_number || '',
        addr_city: addr.city || addr.town || addr.village || '',
        osm_type: null,
      };
      // Aktualizuj panel ak je stále otvorený
      showPlaceDetail(p);
    } catch {}
  })() : Promise.resolve();

  if (osmId && osmType) {
    showSearchOutline(osmId, osmType).then(hasOutline => {
      if (hasOutline) removeTempPin();
    });
  }
  await detailPromise;
};
// Wrapper cez _pickCache — vyhýba sa vkladaniu neošetreného textu (názvy
// miest z OSM) priamo do inline onclick atribútu.
window._pickGlobalFromCache = idx => {
  const g = window._pickCache[idx];
  if (!g) { console.warn('_pickGlobalFromCache: chybajúca položka pre index', idx); return; }
  window._pickGlobal(g.lat, g.lon, g.display_name || '', g.name || '', g.osm_type ? g.osm_type[0].toUpperCase() : 'N', g.osm_id || '');
};

// ── O APLIKACI PANEL ─────────────────────────────────────────
// ── NÁHODNÝ TIP NA VÝLET ─────────────────────────────────────
function openRandomTripPanel() {
  const isMobile = window.innerWidth <= 768;
  const hasGps = !!userLocation;
  let _currentPick = null; // aktuálne navrhnuté miesto (closure, bez JSON v HTML)

  function _renderRandomPanel(radius, refMode) {
    const ref = refMode === 'gps' && userLocation
      ? userLocation
      : { lat: map.getCenter().lat, lng: map.getCenter().lng };

    const candidates = allPlaces.filter(p => {
      const d = haversineKm(ref.lat, ref.lng, +p.lat, +p.lng);
      return d <= radius;
    });

    const pick = candidates.length
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : null;
    _currentPick = pick;

    const radiusOptions = [10, 25, 50, 100, 200].map(r =>
      `<button class="rand-radius-btn${radius === r ? ' active' : ''}" data-r="${r}">${r} km</button>`
    ).join('');

    const refBtnGps = `<button class="rand-ref-btn${refMode==='gps'?' active':''}" ${!hasGps?'disabled title="GPS poloha není dostupná"':''} data-ref="gps"><i class="fa-solid fa-location-crosshairs"></i> GPS</button>`;
    const refBtnMap = `<button class="rand-ref-btn${refMode==='map'?' active':''}" data-ref="map"><i class="fa-solid fa-map"></i> Střed mapy</button>`;

    const resultHtml = pick ? `
      <div class="rand-result" id="rand-result-card">
        ${pick.foto_main ? `<img src="${pick.foto_main}" class="rand-thumb" alt="">` : `<div class="rand-thumb-placeholder">${getIconForKategoria(pick.kategoria||'',pick.podkategoria||'')||vmIconSvg('pin')}</div>`}
        <div class="rand-result-body">
          <div class="rand-result-cat">${pick.podkategoria || pick.kategoria || ''}</div>
          <div class="rand-result-name">${pick.nazov || 'Místo'}</div>
          <div class="rand-result-dist"><i class="fa-solid fa-location-dot"></i> ${fmtDist(haversineKm(ref.lat, ref.lng, +pick.lat, +pick.lng))} od ${refMode==='gps'?'vaší polohy':'středu mapy'}</div>
        </div>
        <i class="fa-solid fa-chevron-right rand-result-arrow"></i>
      </div>
      <p style="font-size:11px;color:#aaa;text-align:center;margin-top:4px">${candidates.length} míst v okruhu ${radius} km</p>
    ` : `<p class="rand-empty"><i class="fa-solid fa-circle-xmark"></i> V okruhu ${radius} km nejsou žádná VANDRO místa.<br>Zkuste zvětšit okruh nebo posunout mapu.</p>`;

    return `
      <div class="rand-controls">
        <div class="rand-ref-bar">${refBtnGps}${refBtnMap}</div>
        <div class="rand-label">Okruh:</div>
        <div class="rand-radius-bar">${radiusOptions}</div>
      </div>
      ${resultHtml}
      <button class="rand-again-btn" id="rand-again-btn">
        <i class="fa-solid fa-shuffle"></i> Další tip
      </button>`;
  }

  let _randRadius = 25;
  let _randRef = hasGps ? 'gps' : 'map';

  function _attachRandListeners() {
    document.querySelectorAll('.rand-radius-btn').forEach(btn => {
      btn.addEventListener('click', () => { _randRadius = +btn.dataset.r; _showRand(); });
    });
    document.querySelectorAll('.rand-ref-btn').forEach(btn => {
      btn.addEventListener('click', () => { _randRef = btn.dataset.ref; _showRand(); });
    });
    const again = document.getElementById('rand-again-btn');
    if (again) again.addEventListener('click', () => _showRand());
    const card = document.getElementById('rand-result-card');
    if (card) card.addEventListener('click', () => { if (_currentPick) _randOpenDetail(_currentPick); });
  }

  function _showRand() {
    const html = _renderRandomPanel(_randRadius, _randRef);
    const body = isMobile
      ? document.querySelector('#mobile-content')
      : document.querySelector('#rand-panel-body');
    if (body) { body.innerHTML = html; setTimeout(_attachRandListeners, 0); }
  }

  function _randOpenDetail(p) {
    const lat = +p.lat, lng = +p.lng;

    // Priblíž na bod
    map.flyTo({ center: [lng, lat], zoom: 14, speed: 1.3 });

    // Zvýraznenie bodu na mape
    setPlaceHighlight({ lat, lng }, p._icon_id || 'custom-pin');

    const iconConf = getIconForKategoria(p.kategoria||'', p.podkategoria||'');
    const iconHTML = iconConf ? `<span class="place-icon-emoji">${iconConf}</span>` : '';
    const galeria = Array.isArray(p.galeria) ? p.galeria
      : (typeof p.galeria==='string' ? p.galeria.split(',').map(s=>s.trim()).filter(Boolean) : []);
    const rows = buildInfoRows({
      addrStr: p.addr_street ? [p.addr_street,p.addr_housenumber].filter(Boolean).join(' ')+(p.addr_city?', '+p.addr_city:'') : '',
      opening_hours:p.opening_hours, phone:p.phone, web:p.web, email:p.email,
      operator:p.operator, vstup:p.vstup, description:p.description,
      wikidata:p.wikidata, ele:p.ele,
    });
    const backBtn = `<button class="btn-nearby-back" id="rand-back-btn"><i class="fa-solid fa-arrow-left"></i> Zpět na tip</button>`;
    const detailHtml = `
      ${_mainPhotoImgHtml(p.foto_main, 'panel-img-main')}
      <div class="panel-inner">
        ${backBtn}
        <div class="panel-title-row">${iconHTML}<h2 class="panel-title">${escapeHtml(p.nazov||'Místo')}</h2></div>
        <div class="panel-categories">
          <span class="tag-kat">${escapeHtml(p.kategoria||'Info')}</span>
          ${p.podkategoria?`<span class="tag-subkat">${escapeHtml(p.podkategoria)}</span>`:''}
        </div>
        <ul class="panel-info-list">${rows}</ul>
          ${_renderDescriptionHtml(p.popis)}
        ${_renderGalleryHtml(galeria)}
        <div class="panel-footer">
          <div class="gps-row"><span>${lat.toFixed(5)}, ${lng.toFixed(5)}</span><button onclick="copyGps(${lat},${lng})" class="btn-copy">Kopírovat GPS</button></div>
          <button onclick="startRoutingToPlace(${lat},${lng},'${_jsAttrSafe(p.nazov||'')}')" class="btn-route-plan"><i class="fas fa-route"></i> Naplánovat trasu</button>
          <button onclick="sharePoint()" class="btn-share"><i class="fas fa-share-alt"></i> Sdílet</button>
        </div>
      </div>`;

    const randTitle = `<i class="fa-solid fa-shuffle" style="color:var(--primary);margin-right:8px"></i>Náhodný tip na výlet`;
    if (isMobile) {
      openMobileSheet(randTitle, _mainPhotoThumbSrc(p.foto_main), detailHtml, true);
    } else {
      openSidebar(`<div class="sidebar-header"><h3>${randTitle}</h3><div class="sidebar-header-actions">${_vandroBackArrowHtml()}<button class="btn-close" onclick="closeDesktopPanels()"><i class="fa-solid fa-xmark"></i></button></div></div><div class="panel-content">${detailHtml}</div>`);
    }
    if (typeof GLightbox !== 'undefined') setTimeout(() => GLightbox({ selector: '.glightbox' }), 100);
    setTimeout(()=>_initClampedText(),0);
    saveHistory(p);
    _trackPlaceView(p);
    const back = document.getElementById('rand-back-btn');
    if (back) back.addEventListener('click', _randBackToList);
  }

  function _randBackToList() {
    setPlaceHighlight(null);
    const titleStr = `<i class="fa-solid fa-shuffle" style="color:var(--primary);margin-right:8px"></i>Náhodný tip na výlet`;
    const initHtml = `<div id="rand-panel-body">${_renderRandomPanel(_randRadius, _randRef)}</div>`;
    if (isMobile) {
      openMobileSheet(titleStr, null, initHtml, true);
    } else {
      openSidebar(`<div class="sidebar-header"><h3>${titleStr}</h3><div class="sidebar-header-actions">${_vandroBackArrowHtml()}<button class="btn-close" onclick="closeDesktopPanels()"><i class="fa-solid fa-xmark"></i></button></div></div><div class="panel-content">${initHtml}</div>`);
    }
    setTimeout(_attachRandListeners, 0);
  }

  const titleStr = `<i class="fa-solid fa-shuffle" style="color:var(--primary);margin-right:8px"></i>Náhodný tip na výlet`;
  const initHtml = `<div id="rand-panel-body">${_renderRandomPanel(_randRadius, _randRef)}</div>`;

  if (isMobile) {
    openMobileSheet(titleStr, null, initHtml, true);
  } else {
    openSidebar(`<div class="sidebar-header"><h3>${titleStr}</h3><div class="sidebar-header-actions">${_vandroBackArrowHtml()}<button class="btn-close" onclick="closeDesktopPanels()"><i class="fa-solid fa-xmark"></i></button></div></div><div class="panel-content">${initHtml}</div>`);
  }
  setTimeout(_attachRandListeners, 0);
}

// ── POČASÍ ────────────────────────────────────────────────────
const WMO_ICONS = {
  0:{ic:'fa-sun',label:'Jasno'},1:{ic:'fa-sun',label:'Skoro jasno'},2:{ic:'fa-cloud-sun',label:'Polojasno'},
  3:{ic:'fa-cloud',label:'Zataženo'},45:{ic:'fa-smog',label:'Mlha'},48:{ic:'fa-smog',label:'Mrznoucí mlha'},
  51:{ic:'fa-cloud-rain',label:'Slabé mrholení'},53:{ic:'fa-cloud-rain',label:'Mrholení'},55:{ic:'fa-cloud-rain',label:'Silné mrholení'},
  61:{ic:'fa-cloud-rain',label:'Slabý déšť'},63:{ic:'fa-cloud-rain',label:'Déšť'},65:{ic:'fa-cloud-showers-heavy',label:'Silný déšť'},
  71:{ic:'fa-snowflake',label:'Slabé sněžení'},73:{ic:'fa-snowflake',label:'Sněžení'},75:{ic:'fa-snowflake',label:'Silné sněžení'},
  80:{ic:'fa-cloud-showers-heavy',label:'Přeháňky'},81:{ic:'fa-cloud-showers-heavy',label:'Silné přeháňky'},82:{ic:'fa-cloud-showers-heavy',label:'Prudké přeháňky'},
  95:{ic:'fa-bolt',label:'Bouřka'},96:{ic:'fa-bolt',label:'Bouřka s kroupami'},99:{ic:'fa-bolt',label:'Silná bouřka'},
};
function _wmoInfo(code){ return WMO_ICONS[code] || {ic:'fa-cloud',label:'Neznámo'}; }

// ── Rozšířené počasí: radarová vrstva na mapě (RainViewer, 100% zdarma, bez klíče) ──
window._weatherModeActive = false;   // panel počasí je otevřený
window._weatherPoint = null; // {lat,lng} vybrané pravým klikem / podržením prstu; null = střed mapy
let _weatherRadarOn = false;    // uživatelem zapnutá/vypnutá radarová vrstva (přepínač v panelu)
let _rainviewerFrames = null;   // surová odpoveď z RainViewer API
let _weatherFrames = [];        // časová os snímkov radaru (zoradené: minulosť → predpoveď)
let _weatherNowIdx = 0;         // index snímku označeného ako "Nyní" (hranica minulosť/předpověď)
let _weatherFrameIdx = 0;       // index aktuálne zobrazeného snímku
let _weatherPointMarker = null;
let _weatherAutoRefreshTimer = null; // periodicky sťahuje nové snímky (RainViewer publikuje cca každých 10 min)
let _weatherAnimTimer = null;        // prehrávanie animácie (posuvník sa hýbe sám)
const WEATHER_REFRESH_MS = 10 * 60 * 1000; // 10 minut — RainViewer aktualizuje radar v tomto intervalu
// RainViewer od 1.1.2026 omezil bezplatný přístup na nízký zoom. WEATHER_RADAR_MAXZOOM je
// zoom dlaždic, které se reálně žádají (bezpečně pod hranicí, kde ještě existují);
// WEATHER_RADAR_MAX_MAP_ZOOM je strop, na který se zamkne přiblížení SAMOTNÉ MAPY, dokud
// je radar zapnutý — o trochu vyšší, aby poslední dlaždice nebyla zbytečně moc roztažená.
const WEATHER_RADAR_MAXZOOM = 6;
const WEATHER_RADAR_MAX_MAP_ZOOM = 6.5;
const MAP_DEFAULT_MAX_ZOOM = 20; // stejná hodnota jako při inicializaci mapy (maxZoom:20)

async function _getRainviewerFrames(force) {
  if (_rainviewerFrames && !force) return _rainviewerFrames;
  const r = await fetch('https://api.rainviewer.com/public/weather-maps.json');
  if (!r.ok) throw new Error('RainViewer HTTP ' + r.status);
  _rainviewerFrames = await r.json();
  return _rainviewerFrames;
}

function _rainviewerTileUrl(host, frame) {
  return `${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`; // 2 = univerzální barevná škála pro srážky
}

function _removeMapIdSafe(id) {
  if (!map) return;
  if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(id)) map.removeSource(id);
}

// Znovu postaví časovou osu radarových snímků a vykreslí ju na mapu.
// resetToNow=true nastaví posuvník na "Nyní"; jinak se index snímku
// (pokud je v rozsahu) zachová — používá se při auto-refresh dat.
async function setWeatherMapLayer(resetToNow) {
  _stopWeatherAnimation();
  if (!map) return;
  if (!map.isStyleLoaded()) { map.once('idle', () => setWeatherMapLayer(resetToNow)); return; }
  try {
    const frames = await _getRainviewerFrames();
    const past = frames.radar?.past || [];
    const nowcast = frames.radar?.nowcast || [];
    _weatherFrames = [...past, ...nowcast];
    _weatherNowIdx = Math.max(0, past.length - 1);
    if (!_weatherFrames.length) return;
    _weatherFrameIdx = resetToNow ? _weatherNowIdx : Math.min(_weatherFrameIdx, _weatherFrames.length - 1);
    _applyWeatherFrame();
  } catch (e) { console.warn('weather radar:', e); }
}

// Vykreslí aktuálne zvolený radarový snímok (_weatherFrameIdx) na mapu bez
// zbytočného premigávania — pokiaľ vrstva už existuje, len jej vymeníme URL.
function _applyWeatherFrame() {
  if (!map || !_weatherFrames.length) return;
  const frame = _weatherFrames[_weatherFrameIdx];
  if (!frame || !_rainviewerFrames) return;
  const tileUrl = _rainviewerTileUrl(_rainviewerFrames.host, frame);
  const id = 'weather-radar-layer';
  const src = map.getSource(id);
  if (src && src.setTiles) {
    src.setTiles([tileUrl]);
  } else {
    _removeMapIdSafe(id);
    map.addSource(id, { type: 'raster', tiles: [tileUrl], tileSize: 256, maxzoom: WEATHER_RADAR_MAXZOOM, attribution: 'RainViewer.com' });
    map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': 0.75 } });
  }
  _updateWeatherSliderUI();
}

function _weatherFrameLabel(idx) {
  const frame = _weatherFrames[idx];
  if (!frame) return '';
  const t = new Date(frame.time * 1000).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  if (idx === _weatherNowIdx) return `Nyní (${t})`;
  return idx > _weatherNowIdx ? `Předpověď ${t}` : t;
}

function _updateWeatherSliderUI() {
  const wrap = document.getElementById('wts-range');
  const label = document.getElementById('wts-time');
  if (!wrap || !label) return;
  wrap.max = String(Math.max(0, _weatherFrames.length - 1));
  wrap.value = String(_weatherFrameIdx);
  wrap.disabled = _weatherFrames.length < 2;
  label.textContent = _weatherFrames.length ? _weatherFrameLabel(_weatherFrameIdx) : '';
}

window._weatherSliderInput = (idx) => {
  _stopWeatherAnimation();
  _weatherFrameIdx = Math.max(0, Math.min(+idx, _weatherFrames.length - 1));
  _applyWeatherFrame();
};

function _stopWeatherAnimation() {
  if (_weatherAnimTimer) { clearInterval(_weatherAnimTimer); _weatherAnimTimer = null; }
  const btn = document.getElementById('wts-play');
  if (btn) btn.innerHTML = '<i class="fa-solid fa-play"></i>';
}

window._toggleWeatherAnimation = () => {
  if (_weatherAnimTimer) { _stopWeatherAnimation(); return; }
  if (_weatherFrames.length < 2) return;
  const btn = document.getElementById('wts-play');
  if (btn) btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
  _weatherAnimTimer = setInterval(() => {
    _weatherFrameIdx = (_weatherFrameIdx + 1) % _weatherFrames.length;
    _applyWeatherFrame();
  }, 600);
};

// Periodicky doťahuje nové snímky, dokud je panel počasí otevřený —
// RainViewer publikuje nová data v cca 10minutových intervalech.
function _startWeatherAutoRefresh() {
  _stopWeatherAutoRefresh();
  _weatherAutoRefreshTimer = setInterval(async () => {
    try {
      const wasAtNow = _weatherFrameIdx === _weatherNowIdx;
      await _getRainviewerFrames(true);
      await setWeatherMapLayer(wasAtNow);
    }
    catch (e) { console.warn('weather auto-refresh:', e); }
  }, WEATHER_REFRESH_MS);
}
function _stopWeatherAutoRefresh() {
  if (_weatherAutoRefreshTimer) { clearInterval(_weatherAutoRefreshTimer); _weatherAutoRefreshTimer = null; }
}

const WEATHER_HIDDEN_LAYER_IDS = ['places-layer', 'places-bm-halo', 'places-hl-layer'];
function _hideVandroPlacesForWeather() {
  if (!map) return;
  WEATHER_HIDDEN_LAYER_IDS.forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none'); });
}
function _showVandroPlacesAfterWeather() {
  if (!map) return;
  WEATHER_HIDDEN_LAYER_IDS.forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible'); });
}

// Zapne radar: zblednutie mapy, skrytie vandro míst, zámek zoomu na WEATHER_RADAR_MAX_MAP_ZOOM
// (RainViewer nad touto úrovní pro bezplatné uživatele dlaždice negeneruje) a samotná vrstva.
async function _turnOnWeatherRadar() {
  if (_weatherRadarOn) return;
  _weatherRadarOn = true;
  const ov = $('weather-dim-overlay'); if (ov) ov.classList.add('active');
  _hideVandroPlacesForWeather();
  if (map && map.setMaxZoom) map.setMaxZoom(WEATHER_RADAR_MAX_MAP_ZOOM);
  await setWeatherMapLayer(true);
  _startWeatherAutoRefresh();
  _updateWeatherRadarToggleUI();
}

// Vypne radar a vrátí mapu úplně do normálu (žádné zblednutí, plný zoom, vandro místa zpět).
function _turnOffWeatherRadar() {
  _weatherRadarOn = false;
  _stopWeatherAutoRefresh();
  _stopWeatherAnimation();
  const ov = $('weather-dim-overlay'); if (ov) ov.classList.remove('active');
  _showVandroPlacesAfterWeather();
  if (map && map.setMaxZoom) map.setMaxZoom(MAP_DEFAULT_MAX_ZOOM);
  _removeMapIdSafe('weather-radar-layer');
  _weatherFrames = [];
  _updateWeatherRadarToggleUI();
}

window._toggleWeatherRadar = () => { _weatherRadarOn ? _turnOffWeatherRadar() : _turnOnWeatherRadar(); };

function _updateWeatherRadarToggleUI() {
  const sw = document.getElementById('weather-radar-toggle');
  if (sw) sw.checked = _weatherRadarOn;
  const sliderWrap = document.getElementById('weather-time-slider-wrap');
  if (sliderWrap) sliderWrap.style.display = (_weatherRadarOn && _weatherFrames.length > 1) ? '' : 'none';
  _updateWeatherSliderUI();
}

function _deactivateWeatherMode() {
  if (!window._weatherModeActive) return;
  window._weatherModeActive = false;
  _turnOffWeatherRadar();
  if (_weatherPointMarker) { try { _weatherPointMarker.remove(); } catch {} _weatherPointMarker = null; }
}

function _flashWeatherPointMarker(lngLat) {
  if (_weatherPointMarker) { try { _weatherPointMarker.remove(); } catch {} }
  const el = document.createElement('div');
  el.className = 'weather-point-marker';
  _weatherPointMarker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(lngLat).addTo(map);
}

// Pozn.: pravý klik / podržanie prstu pre zmenu bodu počasí je teraz súčasťou
// existujúceho contextmenu/long-press handleru pri inicializácii mapy (viď
// map.on('contextmenu', ...) a canvas touchstart vyššie), aby sa nebili s
// bežným zobrazením info o mieste na mape.

async function openWeatherPanel() {
  const isMobile = window.innerWidth <= 768;
  const pt = window._weatherPoint || { lat: map.getCenter().lat, lng: map.getCenter().lng };
  const titleStr = `<i class="fa-solid fa-cloud-sun" style="color:var(--primary);margin-right:8px"></i>Počasí`;

  if (!navigator.onLine) {
    const offlineHtml = `<div class="offline-feature-notice"><i class="fa-solid fa-wifi-slash"></i><p>Počasí vyžaduje připojení k internetu.</p></div>`;
    if (isMobile) openMobileSheet(titleStr, null, offlineHtml, true);
    else openSidebar(`<div class="sidebar-header"><h3>${titleStr}</h3><div class="sidebar-header-actions">${_vandroBackArrowHtml()}<button class="btn-close" onclick="closeDesktopPanels()"><i class="fa-solid fa-xmark"></i></button></div></div><div class="panel-content">${offlineHtml}</div>`);
    return;
  }

  const loadingHtml = `<div class="weather-loading"><i class="fa-solid fa-spinner fa-spin"></i> Načítám počasí…</div>`;

  if (isMobile) openMobileSheet(titleStr, null, loadingHtml, true);
  else openSidebar(`<div class="sidebar-header"><h3>${titleStr}</h3><div class="sidebar-header-actions">${_vandroBackArrowHtml()}<button class="btn-close" onclick="closeDesktopPanels()"><i class="fa-solid fa-xmark"></i></button></div></div><div class="panel-content" id="weather-body">${loadingHtml}</div>`);

  // Panel počasí je otevřený — umožní to pravému kliku/podržení přepnout bod.
  // Radar (zblednutí mapy, skrytí míst, zámek zoomu) se NEZAPÍNÁ automaticky —
  // řídí ho výhradně přepínač v panelu, aby mapa zůstala normální, dokud si to
  // uživatel sám nezapne.
  window._weatherModeActive = true;
  if (window._weatherPoint) _flashWeatherPointMarker([window._weatherPoint.lng, window._weatherPoint.lat]);

  try {
    // Reverse geocode + počasie paralelne
    const [geoResp, wxResp] = await Promise.all([
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pt.lat}&lon=${pt.lng}&format=json&zoom=10&accept-language=cs`, {headers:{'Accept-Language':'cs,sk'}}),
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pt.lat}&longitude=${pt.lng}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,apparent_temperature&hourly=temperature_2m,weather_code,precipitation_probability,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset,uv_index_max&timezone=auto&forecast_days=5`)
    ]);
    const geo = await geoResp.json();
    const d = await wxResp.json();

    // Názov lokality z reverse geocode
    const locName = geo?.address?.village || geo?.address?.town || geo?.address?.city || geo?.address?.municipality || geo?.address?.county || `${pt.lat.toFixed(2)}, ${pt.lng.toFixed(2)}`;

    const cur = d.current;
    const curInfo = _wmoInfo(cur.weather_code);
    const sunriseStr = d.daily?.sunrise?.[0] ? new Date(d.daily.sunrise[0]).toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit'}) : null;
    const sunsetStr = d.daily?.sunset?.[0] ? new Date(d.daily.sunset[0]).toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit'}) : null;
    const uvMax = d.daily?.uv_index_max?.[0];

    // Hodinová predpoveď — nasledujúcich 12 hodín od teraz
    const hourly = d.hourly;
    const nowHour = cur.time; // ISO string napr. "2026-07-02T14:00"
    // Nájdeme index aktuálnej hodiny - cur.time môže byť "2026-07-02T14:00" ale hourly.time môže mať sekundy
    let nowIdx = hourly.time.findIndex(t => t.startsWith(nowHour.slice(0, 13)));
    if (nowIdx < 0) nowIdx = 0; // fallback na začiatok ak sa nenájde
    const hourlyHtml = hourly.time.slice(nowIdx, nowIdx + 13).map((t, i) => {
      const idx = nowIdx + i;
      const h = new Date(t).getHours();
      const info = _wmoInfo(hourly.weather_code[idx]);
      const precip = hourly.precipitation_probability[idx];
      return `<div class="weather-hour">
        <div class="weather-hour-time">${i === 0 ? 'Nyní' : h + ':00'}</div>
        <i class="fa-solid ${info.ic} weather-hour-icon"></i>
        <div class="weather-hour-temp">${Math.round(hourly.temperature_2m[idx])}°</div>
        <div class="weather-hour-precip">${precip > 20 ? `<i class="fa-solid fa-droplet"></i>${precip}%` : ''}</div>
      </div>`;
    }).join('');

    // 5-denná predpoveď
    const dailyHtml = d.daily.time.map((date, i) => {
      const dt = new Date(date);
      const dayName = ['Ne','Po','Út','St','Čt','Pá','So'][dt.getDay()];
      const info = _wmoInfo(d.daily.weather_code[i]);
      return `<div class="weather-day">
        <div class="weather-day-name">${i === 0 ? 'Dnes' : dayName}</div>
        <i class="fa-solid ${info.ic} weather-day-icon"></i>
        <div class="weather-day-temp"><strong>${Math.round(d.daily.temperature_2m_max[i])}°</strong> <span>${Math.round(d.daily.temperature_2m_min[i])}°</span></div>
        <div class="weather-day-precip">${d.daily.precipitation_sum[i] > 0 ? `<i class="fa-solid fa-droplet"></i>${d.daily.precipitation_sum[i].toFixed(1)}mm` : ''}</div>
      </div>`;
    }).join('');

    const layerSwitchHtml = `
      <div class="weather-radar-toggle-row">
        <div class="weather-radar-toggle-label"><i class="fa-solid fa-cloud-showers-heavy"></i> Srážkový radar</div>
        <label class="wr-switch">
          <input type="checkbox" id="weather-radar-toggle" ${_weatherRadarOn ? 'checked' : ''} onchange="window._toggleWeatherRadar()">
          <span class="wr-switch-slider"></span>
        </label>
      </div>
      <div class="weather-time-slider" id="weather-time-slider-wrap" style="display:${_weatherRadarOn && _weatherFrames.length > 1 ? '' : 'none'}">
        <button id="wts-play" class="wts-play-btn" title="Přehrát animaci" onclick="window._toggleWeatherAnimation()"><i class="fa-solid fa-play"></i></button>
        <input type="range" id="wts-range" min="0" max="${Math.max(0,_weatherFrames.length-1)}" value="${_weatherFrameIdx}" oninput="window._weatherSliderInput(this.value)">
        <span id="wts-time" class="wts-time">${_weatherFrames.length ? _weatherFrameLabel(_weatherFrameIdx) : ''}</span>
      </div>
      <p class="weather-pick-hint"><i class="fa-solid fa-hand-pointer"></i> ${isMobile ? 'Podržte prst na mapě' : 'Klikněte pravým tlačítkem na mapu'}, abyste změnili místo pro počasí.</p>`;

    const sunCardHtml = (sunriseStr || sunsetStr) ? `
      <div class="weather-sun-card">
        ${sunriseStr ? `<div class="wsc-item"><i class="fa-solid fa-sun"></i><div class="wsc-text"><span class="wsc-label">Východ slunce</span><span class="wsc-val">${sunriseStr}</span></div></div>` : ''}
        ${sunriseStr && sunsetStr ? `<div class="wsc-sep"></div>` : ''}
        ${sunsetStr ? `<div class="wsc-item"><i class="fa-solid fa-moon"></i><div class="wsc-text"><span class="wsc-label">Západ slunce</span><span class="wsc-val">${sunsetStr}</span></div></div>` : ''}
        ${uvMax != null ? `<div class="wsc-sep"></div><div class="wsc-item"><i class="fa-solid fa-sun-plant-wilt"></i><div class="wsc-text"><span class="wsc-label">UV index</span><span class="wsc-val">${Math.round(uvMax)}</span></div></div>` : ''}
      </div>` : '';

    const html = `
      ${layerSwitchHtml}
      <div class="weather-loc-name"><i class="fa-solid fa-location-dot"></i> ${locName}</div>
      <div class="weather-current">
        <i class="fa-solid ${curInfo.ic} weather-current-icon"></i>
        <div class="weather-current-temp">${Math.round(cur.temperature_2m)}°C</div>
        <div class="weather-current-label">${curInfo.label}</div>
        <div class="weather-current-feels">Pocitově ${Math.round(cur.apparent_temperature)}°C</div>
        <div class="weather-current-extra">
          <span><i class="fa-solid fa-wind"></i> ${Math.round(cur.wind_speed_10m)} km/h</span>
          <span><i class="fa-solid fa-droplet"></i> ${cur.relative_humidity_2m}%</span>
        </div>
      </div>
      ${sunCardHtml}
      <div class="weather-section-title">Hodinová předpověď</div>
      <div class="weather-hourly">${hourlyHtml}</div>
      <div class="weather-section-title">5 dní</div>
      <div class="weather-forecast">${dailyHtml}</div>
      <p class="weather-source"><a href="https://open-meteo.com" target="_blank">Data: Open-Meteo.com</a> (CC BY 4.0) · <a href="https://www.rainviewer.com" target="_blank">Radar: RainViewer.com</a></p>`;

    const setContent = html => {
      if (isMobile) { const c=document.querySelector('#mobile-content'); if(c) c.innerHTML=html; }
      else { const b=document.querySelector('#weather-body'); if(b) b.innerHTML=html; }
    };
    setContent(html);
  } catch (e) {
    const errHtml = `<p style="text-align:center;color:#aaa;padding:30px 16px"><i class="fa-solid fa-triangle-exclamation"></i> Počasí se nepodařilo načíst.</p>`;
    if (isMobile) { const c=document.querySelector('#mobile-content'); if(c) c.innerHTML=errHtml; }
    else { const b=document.querySelector('#weather-body'); if(b) b.innerHTML=errHtml; }
  }
}

// ── STATISTIKY MÍST ───────────────────────────────────────────

// Geografické bounding boxy krajín
const GEO_COUNTRIES = [
  { name:'Česko',               flag:'CZ', lat:[48.55,51.06], lng:[12.09,18.87] },
  { name:'Slovensko',           flag:'SK', lat:[47.73,49.62], lng:[16.83,22.57] },
  { name:'Polsko',              flag:'PL', lat:[49.00,54.90], lng:[14.12,24.15] },
  { name:'Maďarsko',            flag:'HU', lat:[45.74,48.58], lng:[16.11,22.90] },
  { name:'Rakousko',            flag:'AT', lat:[46.37,49.02], lng:[9.53, 17.16] },
  { name:'Německo',             flag:'DE', lat:[47.27,55.06], lng:[5.87, 15.04] },
  { name:'Chorvatsko',          flag:'HR', lat:[42.39,46.55], lng:[13.49,19.45] },
  { name:'Slovinsko',           flag:'SI', lat:[45.42,46.88], lng:[13.38,16.61] },
  { name:'Rumunsko',            flag:'RO', lat:[43.62,48.27], lng:[20.26,29.74] },
  { name:'Srbsko',              flag:'RS', lat:[42.23,46.19], lng:[18.83,23.01] },
  { name:'Itálie',              flag:'IT', lat:[35.49,47.09], lng:[6.63, 18.52] },
  { name:'Švýcarsko',           flag:'CH', lat:[45.82,47.81], lng:[5.96, 10.49] },
  { name:'Ukrajina',            flag:'UA', lat:[44.39,52.38], lng:[22.14,40.23] },
  { name:'Bosna a Hercegovina', flag:'BA', lat:[42.56,45.28], lng:[15.72,19.62] },
  { name:'Černá Hora',          flag:'ME', lat:[41.85,43.55], lng:[18.44,20.36] },
  { name:'Bulharsko',           flag:'BG', lat:[41.24,44.22], lng:[22.36,28.61] },
  { name:'Řecko',               flag:'GR', lat:[34.80,41.75], lng:[19.37,28.27] },
  { name:'Albánie',             flag:'AL', lat:[39.62,42.67], lng:[19.27,21.07] },
  { name:'Severní Makedonie',   flag:'MK', lat:[40.85,42.37], lng:[20.45,23.03] },
  { name:'Španělsko',           flag:'ES', lat:[27.64,43.79], lng:[-18.17,4.33] },
  { name:'Francie',             flag:'FR', lat:[41.34,51.09], lng:[-5.14, 9.56] },
  { name:'Belgie',              flag:'BE', lat:[49.50,51.51], lng:[2.54,  6.41] },
  { name:'Nizozemsko',          flag:'NL', lat:[50.75,53.57], lng:[3.36,  7.23] },
  { name:'Dánsko',              flag:'DK', lat:[54.56,57.75], lng:[8.08, 15.20] },
  { name:'Norsko',              flag:'NO', lat:[57.96,71.19], lng:[4.64, 31.08] },
  { name:'Švédsko',             flag:'SE', lat:[55.34,69.06], lng:[10.96,24.16] },
  { name:'Finsko',              flag:'FI', lat:[59.81,70.10], lng:[20.00,31.59] },
  { name:'Velká Británie',      flag:'GB', lat:[49.87,60.86], lng:[-8.65, 1.78] },
  { name:'Irsko',               flag:'IE', lat:[51.45,55.38], lng:[-10.48,-6.00] },
  { name:'Portugalsko',         flag:'PT', lat:[36.97,42.15], lng:[-9.50, -6.19] },
  { name:'Lichtenštejnsko',     flag:'LI', lat:[47.05,47.27], lng:[9.47, 9.64]  },
  { name:'Lucembursko',         flag:'LU', lat:[49.44,50.18], lng:[5.73, 6.53]  },
  { name:'Litva',               flag:'LT', lat:[53.90,56.45], lng:[20.93,26.84] },
  { name:'Lotyšsko',            flag:'LV', lat:[55.67,58.09], lng:[20.97,28.24] },
  { name:'Estonsko',            flag:'EE', lat:[57.51,59.68], lng:[21.76,28.21] },
  { name:'Bělorusko',           flag:'BY', lat:[51.26,56.17], lng:[23.18,32.77] },
  { name:'Moldavsko',           flag:'MD', lat:[45.47,48.49], lng:[26.62,30.16] },
  { name:'Kypr',                flag:'CY', lat:[34.56,35.71], lng:[32.27,34.60] },
  { name:'Malta',               flag:'MT', lat:[35.80,36.08], lng:[14.18,14.58] },
  { name:'Andorra',             flag:'AD', lat:[42.43,42.66], lng:[1.41, 1.79]  },
  { name:'Monako',              flag:'MC', lat:[43.72,43.75], lng:[7.40, 7.44]  },
  { name:'San Marino',          flag:'SM', lat:[43.89,43.99], lng:[12.40,12.52] },
  { name:'Vatikán',             flag:'VA', lat:[41.90,41.91], lng:[12.44,12.46] },
  { name:'Island',              flag:'IS', lat:[63.30,66.60], lng:[-24.55,-13.49] },
  { name:'Kosovo',              flag:'XK', lat:[41.86,43.27], lng:[20.02,21.80] },
  { name:'Rusko',               flag:'RU', lat:[41.19,81.86], lng:[19.64,180]   },
  { name:'Turecko',             flag:'TR', lat:[35.81,42.11], lng:[25.66,44.83] },
];

function _detectCountry(p) {
  // Skutočný stĺpec "krajina" z tabuľky má prioritu — doteraz sa vôbec
  // nepoužíval, appka vždy len hádala krajinu podľa GPS súradníc, čo pri
  // prekrývajúcich sa hraničných oblastiach dávalo nepresné počty.
  if (p.krajina && p.krajina.trim()) return p.krajina.trim();
  if (p.addr_country) return p.addr_country.trim();
  if (p.country) return p.country.trim();
  const lat = +p.lat, lng = +p.lng;
  for (const c of GEO_COUNTRIES) {
    if (lat >= c.lat[0] && lat <= c.lat[1] && lng >= c.lng[0] && lng <= c.lng[1]) return c.name;
  }
  return 'Ostatní';
}

function _countryFlag(isoCode) {
  if (!isoCode || isoCode.length !== 2) return `<span class="stats-flag-text"><i class="fa-solid fa-earth-europe"></i></span>`;
  // Vlajka sa počíta priamo z ISO kódu (regional indicator symboly) —
  // funguje pre AKÝKOĽVEK 2-písmenový kód, netreba udržiavať pevný zoznam.
  const codePoints = [...isoCode.toUpperCase()].map(c => 0x1F1E6 + (c.charCodeAt(0) - 65));
  const twCode = codePoints.map(cp => cp.toString(16)).join('-');
  return `<img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/${twCode}.svg" class="stats-flag-img" alt="${isoCode}" onerror="this.style.display='none'">`;
}

function openStatsPanel() {
  const isMobile = window.innerWidth <= 768;
  const titleStr = `<i class="fa-solid fa-chart-simple" style="color:var(--primary);margin-right:8px"></i>Statistiky míst`;

  if (!allPlaces.length) {
    const empty = `<p style="text-align:center;color:#aaa;padding:30px">Data se ještě načítají…</p>`;
    if (isMobile) openMobileSheet(titleStr, null, empty, true);
    else openSidebar(`<div class="sidebar-header"><h3>${titleStr}</h3><div class="sidebar-header-actions">${_vandroBackArrowHtml()}<button class="btn-close" onclick="closeDesktopPanels()"><i class="fa-solid fa-xmark"></i></button></div></div><div class="panel-content">${empty}</div>`);
    return;
  }

  const total = allPlaces.length;

  // Rozdelenie podľa krajiny
  const byCountry = {};
  allPlaces.forEach(p => {
    const c = _detectCountry(p);
    if (!byCountry[c]) byCountry[c] = [];
    byCountry[c].push(p);
  });

  function _catStats(places) {
    const cats = {};
    places.forEach(p => { const k = p.podkategoria || p.kategoria || 'Ostatní'; cats[k] = (cats[k]||0)+1; });
    return Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  }

  function _barsHtml(entries, tot) {
    return entries.slice(0,10).map(([label, count]) => {
      const pct = Math.round((count / tot) * 100);
      return `<div class="stats-bar-row">
        <div class="stats-bar-label" title="${label}">${label}</div>
        <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${Math.max(pct,2)}%"></div></div>
        <div class="stats-bar-count">${count}</div>
      </div>`;
    }).join('');
  }

  const countriesSorted = Object.entries(byCountry).sort((a,b)=>b[1].length-a[1].length);
  const countryMeta = Object.fromEntries(GEO_COUNTRIES.map(c=>[c.name.trim().toLowerCase(),c.flag]));

  const countryHtml = countriesSorted.map(([country, places], idx) => {
    const isoCode = countryMeta[(country||'').trim().toLowerCase()] || '';
    const flagHtml = isoCode ? _countryFlag(isoCode) : `<span class="stats-flag-text"><i class="fa-solid fa-earth-europe"></i></span>`;
    const catEntries = _catStats(places);

    const detailHtml = `
      <div class="stats-country-detail">
        <div class="stats-sub-section">
          <div class="stats-sub-title">Kategorie</div>
          <div class="vm-stats-bars">${_barsHtml(catEntries, places.length)}</div>
        </div>
      </div>`;

    return `<div class="stats-country-block">
      <button class="stats-country-btn" onclick="window._statsToggle('sc-${idx}')">
        <span class="stats-country-flag-wrap">${flagHtml}</span>
        <span class="stats-country-name">${country}</span>
        <span class="stats-country-count">${places.length} míst</span>
        <i class="fa-solid fa-chevron-down stats-country-chevron" id="sc-chev-${idx}"></i>
      </button>
      <div class="stats-country-content" id="sc-${idx}" style="display:none">
        ${detailHtml}
      </div>
    </div>`;
  }).join('');

  window._statsToggle = id => {
    const el = document.getElementById(id);
    if (!el) return;
    const idx = id.replace('sc-','');
    const chev = document.getElementById(`sc-chev-${idx}`);
    const open = el.style.display === 'none';
    el.style.display = open ? 'block' : 'none';
    if (chev) chev.style.transform = open ? 'rotate(180deg)' : '';
  };

  const html = `
    <div class="stats-summary-grid">
      <div class="stats-summary-card">
        <div class="stats-summary-num">${total}</div>
        <div class="stats-summary-label">Míst celkem</div>
      </div>
      <div class="stats-summary-card">
        <div class="stats-summary-num">${countriesSorted.length}</div>
        <div class="stats-summary-label">Zemí</div>
      </div>
      <div class="stats-summary-card">
        <div class="stats-summary-num">${Object.keys(_catStats(allPlaces)).length}</div>
        <div class="stats-summary-label">Kategorií</div>
      </div>
    </div>
    <div class="stats-section-title">Podle zemí</div>
    <div class="stats-countries">${countryHtml}</div>
    <p style="font-size:11px;color:#aaa;text-align:center;margin-top:12px">Rozdělení podle zemí a krajů je orientační (dle zeměpisné polohy).</p>`;

  if (isMobile) openMobileSheet(titleStr, null, html, true);
  else openSidebar(`<div class="sidebar-header"><h3>${titleStr}</h3><div class="sidebar-header-actions">${_vandroBackArrowHtml()}<button class="btn-close" onclick="closeDesktopPanels()"><i class="fa-solid fa-xmark"></i></button></div></div><div class="panel-content">${html}</div>`);
}

// ── KONTAKTNÍ FORMULÁŘ ────────────────────────────────────────
// EmailJS: public key + service/template ID (free tier, 200 emailů/měsíc)
// Kontaktní formulář posílá zprávy jednoduše přes "mailto:" odkaz — otevře
// e-mailového klienta uživatele s předvyplněným předmětem a textem. Žádná
// registrace u třetí strany (dřív EmailJS) není potřeba.
const _CONTACT_EMAIL = 'vandrocz.contact@gmail.com';

function openContactPanel() {
  const isMobile = window.innerWidth <= 768;
  const titleStr = `<i class="fa-solid fa-envelope" style="color:var(--primary);margin-right:8px"></i>Kontakt`;

  const formHtml = `
    <div class="contact-form" id="contact-form-wrap">
      <p class="contact-intro">Máte dotaz, tip na místo nebo chcete nahlásit chybu? Napište nám — otevře se vám e-mailový klient s předvyplněnou zprávou.</p>
      <div class="contact-field">
        <label>Váš e-mail <span style="color:#aaa;font-weight:400">(volitelné — pro odpověď)</span></label>
        <input type="email" id="cf-email" placeholder="vas@email.cz">
      </div>
      <div class="contact-field">
        <label>Předmět *</label>
        <select id="cf-subject">
          <option value="Obecný dotaz">Obecný dotaz</option>
          <option value="Návrh na nové místo">Návrh na nové místo</option>
          <option value="Oprava chyby u místa">Oprava chyby u místa</option>
          <option value="Technický problém">Technický problém</option>
          <option value="Spolupráce">Spolupráce</option>
          <option value="Jiné">Jiné</option>
        </select>
      </div>
      <div class="contact-field" id="cf-place-row">
        <label>Název místa <span style="color:#aaa;font-weight:400">(volitelné — pokud se zpráva týká konkrétního místa)</span></label>
        <input type="text" id="cf-place" placeholder="např. Červený Kameň">
      </div>
      <div class="contact-field">
        <label>Zpráva *</label>
        <textarea id="cf-message" rows="5" placeholder="Napište svou zprávu…"></textarea>
      </div>
      <button class="contact-submit-btn" id="cf-submit">
        <i class="fa-solid fa-paper-plane"></i> Otevřít e-mail
      </button>
      <p class="contact-gdpr">Zprávu odešlete přímo ze svého e-mailového klienta — nic neukládáme.</p>
    </div>`;

  if (isMobile) openMobileSheet(titleStr, null, formHtml, true);
  else openSidebar(`<div class="sidebar-header"><h3>${titleStr}</h3><div class="sidebar-header-actions">${_vandroBackArrowHtml()}<button class="btn-close" onclick="closeDesktopPanels()"><i class="fa-solid fa-xmark"></i></button></div></div><div class="panel-content">${formHtml}</div>`);

  setTimeout(() => {
    const btn = document.getElementById('cf-submit');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const email   = document.getElementById('cf-email')?.value.trim();
      const subject = document.getElementById('cf-subject')?.value;
      const place   = document.getElementById('cf-place')?.value.trim();
      const message = document.getElementById('cf-message')?.value.trim();

      if (!message) { alert('Napište prosím zprávu.'); return; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        alert('Zadejte platnou e-mailovou adresu, nebo pole nechte prázdné.'); return;
      }

      const bodyLines = [
        message,
        '',
        place ? `Místo: ${place}` : '',
        email ? `Kontakt na mě: ${email}` : '',
      ].filter(Boolean);
      const mailtoUrl = `mailto:${_CONTACT_EMAIL}?subject=${encodeURIComponent('[vandro.cz] ' + subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
      window.location.href = mailtoUrl;

      const wrap = document.getElementById('contact-form-wrap');
      if (wrap && !document.getElementById('cf-mailto-note')) {
        const note = document.createElement('p');
        note.id = 'cf-mailto-note';
        note.className = 'contact-gdpr';
        note.style.cssText = 'color:var(--primary);font-weight:600;margin-top:10px';
        note.innerHTML = `<i class="fa-solid fa-circle-info"></i> Otevřel se e-mailový klient s předvyplněnou zprávou — stačí ji odeslat. Pokud se nic neotevřelo, napište nám přímo na <strong>${_CONTACT_EMAIL}</strong>.`;
        wrap.appendChild(note);
      }
    });
  }, 0);
}

function openAboutPanel() {
  const socialRow = `
    <div class="about-social-row">
      <a href="https://www.facebook.com/Spoznajslovenskoeu-104011161769470" target="_blank" class="about-social-btn about-social-fb">
        <i class="fa-brands fa-facebook-f"></i> Facebook
      </a>
      <a href="https://www.instagram.com/vandro_cz?r=nametag" target="_blank" class="about-social-btn about-social-ig">
        <i class="fa-brands fa-instagram"></i> Instagram
      </a>
    </div>`;

  const html = `<div class="sidebar-header">
    <a href="/" class="about-logo-link">
      <img src="https://cdn.vandro.cz/Untitled18_20260523111243.png" alt="Vandro" class="about-logo-img about-logo-img-full">
    </a>
    <button class="btn-close" onclick="closeDesktopPanels()"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="panel-content">
    <button class="about-link-panel-btn" id="btn-open-vandro-desktop">
      <i class="fa-solid fa-map-location-dot"></i> Naše VANDRO místa
    </button>
    <button class="about-link-panel-btn" onclick="closeAllPanels();window._vandroPanelReturn=true;openBookmarksPanel()">
      <i class="fa-solid fa-bookmark"></i> Moje seznamy míst
    </button>
    <button class="about-link-panel-btn" onclick="closeAllPanels();window._vandroPanelReturn=true;openRandomTripPanel()">
      <i class="fa-solid fa-shuffle"></i> Náhodný tip na výlet
    </button>
    <button class="about-link-panel-btn" onclick="closeAllPanels();window._vandroPanelReturn=true;openWeatherPanel()">
      <i class="fa-solid fa-cloud-sun"></i> Počasí na mapě
    </button>
    <button class="about-link-panel-btn" onclick="closeAllPanels();window._vandroPanelReturn=true;openStatsPanel()">
      <i class="fa-solid fa-chart-simple"></i> Statistiky míst
    </button>
    <button class="about-link-panel-btn" onclick="closeAllPanels();window._vandroPanelReturn=true;openOfflinePanel()">
      <i class="fa-solid fa-cloud-arrow-down"></i> Offline mapy
    </button>
    <button class="about-link-panel-btn" onclick="closeAllPanels();window._vandroPanelReturn=true;openDrawingPanel()">
      <i class="fa-solid fa-file-arrow-up"></i> Vlastní body a trasy
    </button>
    <button class="about-link-panel-btn" onclick="window._exportMapToPdf()">
      <i class="fa-solid fa-file-pdf"></i> Uložit aktuální pohled do PDF
    </button>
    <button class="about-link-panel-btn" id="btn-open-legend-desktop">
      <i class="fa-solid fa-map"></i> Legenda mapy
    </button>
    <button class="about-link-panel-btn" onclick="closeAllPanels();window._vandroPanelReturn=true;openContactPanel()">
      <i class="fa-solid fa-envelope"></i> Kontaktujte nás
    </button>
    <a href="/ochrana-osobnich-udaju.html" target="_blank" class="about-link">
      <i class="fa-solid fa-shield-halved"></i> Zásady ochrany osobních údajů
    </a>
    <a href="/obchodni-podminky.html" target="_blank" class="about-link">
      <i class="fa-solid fa-file-lines"></i> Podmínky užívání
    </a>
    <button class="about-link" style="width:100%;text-align:left;border:none;background:none;cursor:pointer;font:inherit" onclick="window._reopenCookieConsent()">
      <i class="fa-solid fa-cookie-bite"></i> Nastavení cookies
    </button>
    ${socialRow}
    <div class="about-attribution">
      <p class="about-attr-title"><i class="fa-solid fa-database"></i> Zdroje dat a licencí</p>
      <ul class="about-attr-list">
        <li><a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap přispěvatelé</a> — mapová data (ODbL)</li>
        <li><a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> — vektorové podkladové mapy (ODbL)</li>
        <li><a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> — turistický a zimní styl</li>
        <li><a href="https://maplibre.org" target="_blank">MapLibre GL JS</a> — renderovací engine (BSD-3)</li>
        <li><a href="https://github.com/onthegomap/maplibre-contour" target="_blank">maplibre-contour</a> — vrstevnice (MIT)</li>
        <li><a href="https://registry.opendata.aws/terrain-tiles/" target="_blank">AWS Terrain Tiles</a> — výškový model DEM (CC0 / public domain)</li>
        <li><a href="https://nominatim.org" target="_blank">Nominatim / OpenStreetMap</a> — geokódování vyhledávání (ODbL)</li>
        <li><a href="https://openrouteservice.org" target="_blank">OpenRouteService</a> — trasy (ODbL + CC-BY 4.0)</li>
        <li><a href="https://stadiamaps.com" target="_blank">Stadia Maps / OSRM</a> — trasy (primárný zdroj)</li>
        <li><a href="https://open-meteo.com" target="_blank">Open-Meteo</a> — předpověď počasí (CC BY 4.0)</li>
        <li><a href="https://www.rainviewer.com" target="_blank">RainViewer</a> — srážkový radar</li>
      </ul>
    </div>
    <div class="vandro-copyright">© 2025 vandro.cz — Všechna práva vyhrazena</div>
  </div>`;

  const mobileContent = `<button class="about-link-panel-btn" id="btn-open-vandro-mobile">
    <i class="fa-solid fa-map-location-dot"></i> Naše VANDRO místa
  </button>
  <button class="about-link-panel-btn" onclick="closeMobilePanels();window._vandroPanelReturn=true;openBookmarksPanel()">
    <i class="fa-solid fa-bookmark"></i> Moje seznamy míst
  </button>
  <button class="about-link-panel-btn" onclick="closeMobilePanels();window._vandroPanelReturn=true;openRandomTripPanel()">
    <i class="fa-solid fa-shuffle"></i> Náhodný tip na výlet
  </button>
  <button class="about-link-panel-btn" onclick="closeMobilePanels();window._vandroPanelReturn=true;openWeatherPanel()">
    <i class="fa-solid fa-cloud-sun"></i> Počasí na mapě
  </button>
  <button class="about-link-panel-btn" onclick="closeMobilePanels();window._vandroPanelReturn=true;openStatsPanel()">
    <i class="fa-solid fa-chart-simple"></i> Statistiky míst
  </button>
  <button class="about-link-panel-btn" onclick="closeMobilePanels();window._vandroPanelReturn=true;openOfflinePanel()">
    <i class="fa-solid fa-cloud-arrow-down"></i> Offline mapy
  </button>
  <button class="about-link-panel-btn" onclick="closeMobilePanels();window._vandroPanelReturn=true;openDrawingPanel()">
    <i class="fa-solid fa-file-arrow-up"></i> Vlastní body a trasy
  </button>
  <button class="about-link-panel-btn" onclick="window._exportMapToPdf()">
    <i class="fa-solid fa-file-pdf"></i> Uložit aktuální pohled do PDF
  </button>
  <button class="about-link-panel-btn" id="btn-open-legend-mobile">
    <i class="fa-solid fa-map"></i> Legenda mapy
  </button>
  <button class="about-link-panel-btn" onclick="closeMobilePanels();window._vandroPanelReturn=true;openContactPanel()">
    <i class="fa-solid fa-envelope"></i> Kontaktujte nás
  </button>
  <a href="/ochrana-osobnich-udaju.html" target="_blank" class="about-link">
    <i class="fa-solid fa-shield-halved"></i> Zásady ochrany osobních údajů
  </a>
  <a href="/obchodni-podminky.html" target="_blank" class="about-link">
    <i class="fa-solid fa-file-lines"></i> Podmínky užívání
  </a>
  <button class="about-link" style="width:100%;text-align:left;border:none;background:none;cursor:pointer;font:inherit" onclick="window._reopenCookieConsent()">
    <i class="fa-solid fa-cookie-bite"></i> Nastavení cookies
  </button>
  ${socialRow}
  <div class="about-attribution">
    <p class="about-attr-title"><i class="fa-solid fa-database"></i> Zdroje dat a licencí</p>
    <ul class="about-attr-list">
      <li><a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap přispěvatelé</a> — mapová data (ODbL)</li>
      <li><a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> — vektorové podkladové mapy (ODbL)</li>
      <li><a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> — turistický a zimní styl</li>
      <li><a href="https://maplibre.org" target="_blank">MapLibre GL JS</a> — renderovací engine (BSD-3)</li>
      <li><a href="https://github.com/onthegomap/maplibre-contour" target="_blank">maplibre-contour</a> — vrstevnice (MIT)</li>
      <li><a href="https://registry.opendata.aws/terrain-tiles/" target="_blank">AWS Terrain Tiles</a> — výškový model DEM (CC0)</li>
      <li><a href="https://nominatim.org" target="_blank">Nominatim / OpenStreetMap</a> — geokódování (ODbL)</li>
      <li><a href="https://openrouteservice.org" target="_blank">OpenRouteService</a> — trasy (ODbL + CC-BY 4.0)</li>
      <li><a href="https://stadiamaps.com" target="_blank">Stadia Maps / OSRM</a> — trasy (primárný zdroj)</li>
      <li><a href="https://open-meteo.com" target="_blank">Open-Meteo</a> — předpověď počasí (CC BY 4.0)</li>
      <li><a href="https://www.rainviewer.com" target="_blank">RainViewer</a> — srážkový radar</li>
    </ul>
  </div>
  <div class="vandro-copyright">© 2025 vandro.cz — Všechna práva vyhrazena</div>`;

  if (window.innerWidth > 768) {
    openSidebar(html);
    setTimeout(() => {
      const btn = $('btn-open-vandro-desktop');
      if (btn) btn.addEventListener('click', () => { window._vandroPanelReturn = true; openVandroPanel(); });
      const btnL = $('btn-open-legend-desktop');
      if (btnL) btnL.addEventListener('click', () => { window._vandroPanelReturn = true; openLegendPanel(); });
    }, 0);
  } else {
    closeMobilePanels();
    openMobileSheet(
      `<a href="/" class="about-logo-link"><img src="https://cdn.vandro.cz/Untitled18_20260523111243.png" class="about-logo-img about-logo-img-full" alt="Vandro"></a>`,
      null,
      mobileContent,
      true
    );
    setTimeout(() => {
      const btn = $('btn-open-vandro-mobile');
      if (btn) btn.addEventListener('click', () => { window._vandroPanelReturn = true; openVandroPanelMobile(); });
      const btnL = $('btn-open-legend-mobile');
      if (btnL) btnL.addEventListener('click', () => { window._vandroPanelReturn = true; openLegendPanelMobile(); });
    }, 0);
  }
}

// ── LEGENDA ───────────────────────────────────────────────────
function buildLegendHTML() {
  // OSM skupiny
  const osmGroups = [
    { label: 'Stravování', keys: ['restaurant','cafe','fast_food','pub','ice_cream'] },
    { label: 'Ubytování', keys: ['hotel','hostel','camp_site','apartment'] },
    { label: 'Kultura & Historie', keys: ['castle','ruins','museum','gallery','viewpoint','monument','archaeological','fort'] },
    { label: 'Příroda & Outdoor', keys: ['peak','waterfall','cave','spring','beach','zoo','picnic_site','park','playground','sports_centre'] },
    { label: 'Doprava', keys: ['fuel','parking','station','bus_stop','charging','car_rental','bike_rental'] },
    { label: 'Zdraví & Služby', keys: ['pharmacy','hospital','dentist','atm','bank','post_office','police','toilets','drinking_water'] },
    { label: 'Obchody', keys: ['supermarket','bakery','drogerie','clothes','electronics','sports_shop','mall'] },
  ];

    // Popis POI závisí od aktívnej mapy: na satelite Overpass, inde natívne OFM vrstvy
  const poiNote = currentBaseLayer === 'satelit'
    ? 'Body načítávané dynamicky z OpenStreetMap (Overpass API)'
    : 'Zajímavé body';
  let html = '<div class="legend-section-title">Satelitní mapa - body</div>'
    + '<div class="legend-poi-note">' + poiNote + '</div>';
  osmGroups.forEach(g => {
    const items = g.keys.map(k => {
      const t = OSM_TYPES[k]; if (!t) return '';
      return `<div class="legend-item">
        <span class="legend-icon" style="border-color:${t.color}">${_categoryIconHtml(t.icon, k)}</span>
        <span class="legend-label">${t.label}</span>
      </div>`;
    }).filter(Boolean).join('');
    if (!items) return;
    html += `<div class="legend-group"><div class="legend-group-title">${g.label}</div><div class="legend-grid">${items}</div></div>`;
  });

  // Trasy
  html += `<div class="legend-group"><div class="legend-group-title">Trasy</div>
    <div class="legend-item"><span class="legend-route-line" style="background:#3498db"></span><span class="legend-label">Turistická trasa <small style="color:#999">(barva dle značení)</small></span></div>
    <div class="legend-item"><span class="legend-route-line dashed" style="--legend-line-color:#8e44ad"></span><span class="legend-label">Cyklotrasa <small style="color:#999">(čárkovaně, barva dle značení)</small></span></div>
  </div>`;

  // Vrstevnice — len na turistickej mape (topo), kde sa skutočne zobrazujú
  if (currentBaseLayer === 'topo') {
    html += `<div class="legend-group"><div class="legend-group-title">Terén</div>
      <div class="legend-item"><span class="legend-route-line" style="background:#999;height:1px"></span><span class="legend-label">Vrstevnica (hlavná, po 100 m)</span></div>
      <div class="legend-item"><span class="legend-route-line" style="background:#aaa;height:1px"></span><span class="legend-label">Vrstevnica (vedlejší, po 20 m)</span></div>
    </div>`;
  }

  // VANDRO vlastné body — presné podkategórie zo sheets
  html += '<div class="legend-section-title" style="margin-top:18px">VANDRO místa</div>';
  const vandroItems = [
    'historické a kulturní památky',
    'hrady a zámky',
    'skanzeny a lidová architektura',
    'skalné útvary',
    'jezera a vodní nádrže',
    'vodopády',
    'důlní díla a hornictví',
    'jeskyně a propasti',
    'naučné stezky',
    'kúpaliská a vodné parky',
    'lázně',
    'koupaliště',
    'rozhledny a vyhlídky',
    'muzea a galerie',
    'botanické zahrady a parky',
    'zoologické zahrady a parky',
    'turistické atrakce',
    'jiné atrakce',
  ];
  const vandroGrid = vandroItems.map(k => {
    const emoji = PODKATEGORIA_ICONS[k]; if (!emoji) return '';
    const label = k.charAt(0).toUpperCase() + k.slice(1);
    return `<div class="legend-item">
      <span class="legend-icon legend-icon-vandro">${_categoryIconHtml(emoji, k)}</span>
      <span class="legend-label">${label}</span>
    </div>`;
  }).filter(Boolean).join('');
  html += `<div class="legend-group"><div class="legend-grid">${vandroGrid}</div></div>`;

  // Podkladové mapy
  html += `<div class="legend-section-title" style="margin-top:18px">Podkladové mapy</div>
  <div class="legend-group">
    <div class="legend-basemap-item">
      <span class="legend-basemap-thumb legend-basemap-liberty"><i class="fa-solid fa-map"></i></span>
      <div><div class="legend-basemap-name">Základní</div><div class="legend-basemap-desc">Vektorová mapa OpenFreeMap — cesty, budovy, popisky</div></div>
    </div>
    <div class="legend-basemap-item">
      <span class="legend-basemap-thumb legend-basemap-topo"><i class="fa-solid fa-mountain"></i></span>
      <div><div class="legend-basemap-name">Turistická</div><div class="legend-basemap-desc">Vrstevnice, turistické a cyklo trasy, výšky terénu</div></div>
    </div>
    <div class="legend-basemap-item">
      <span class="legend-basemap-thumb legend-basemap-zima"><i class="fa-solid fa-snowflake"></i></span>
      <div><div class="legend-basemap-name">Zimní</div><div class="legend-basemap-desc">Lyžařské sjezdovky, běžecké trasy, vleky</div></div>
    </div>
    <div class="legend-basemap-item">
      <span class="legend-basemap-thumb legend-basemap-satelit"><i class="fa-solid fa-satellite"></i></span>
      <div><div class="legend-basemap-name">Satelit</div><div class="legend-basemap-desc">Letecké snímky s popisky míst</div></div>
    </div>
  </div>`;

  return html;
}

function openLegendPanel() {
  const html = `<div class="sidebar-header">
    <h3><i class="fa-solid fa-list" style="color:var(--primary);margin-right:8px"></i>Legenda mapy</h3>
    <div class="sidebar-header-actions">${_vandroBackArrowHtml()}<button class="btn-close" onclick="closeDesktopPanels()"><i class="fa-solid fa-xmark"></i></button></div>
  </div>
  <div class="panel-content">${buildLegendHTML()}</div>`;
  openSidebar(html);
}

function openLegendPanelMobile() {
  closeMobilePanels();
  openMobileSheet(
    '<i class="fa-solid fa-list" style="color:var(--primary);margin-right:8px"></i>Legenda mapy',
    null,
    buildLegendHTML(),
    true
  );
}

// ── VANDRO MÍSTA PANEL ────────────────────────────────────────
function openVandroPanel() {
  // Zavrieme about sidebar (desktop)
  $('desktop-sidebar').classList.add('panel-hidden');
  topBar().classList.remove('sidebar-open');
  // Otvoríme VANDRO panel
  const panel = $('vandro-panel');
  if (panel) {
    panel.classList.remove('panel-hidden');
    topBar().classList.add('sidebar-open');
  }
  const backBtn = $('vandro-panel-back');
  if (backBtn) backBtn.classList.toggle('hidden', !window._vandroPanelReturn);
}

function closeVandroPanel() {
  const panel = $('vandro-panel');
  if (panel) panel.classList.add('panel-hidden');
  topBar().classList.remove('sidebar-open');
  window._vandroPanelReturn = false;
}

function openVandroPanelMobile() {
  closeMobilePanels();
  openMobileSheet(
    'Naše VANDRO místa',
    'https://spoznajslovensko.eu/wp-content/uploads/2026/06/GridArt_20260507_233430886-scaled.jpg',
    `<p class="vandro-desc" style="padding:0 4px">Výběr zajímavostí, které jsme potkali při našich toulkách. Někde jsme strávili hodiny, kolem jiných jsme jen projeli a stihli udělat fotku, protože nás něčím hned upoutaly. Najdete tu mix všeho, co nám na cestách přišlo zajímavé, inspirativní nebo prostě fajn na krátké zastavení.</p>`,
    true
  );
}

// ── ZOZNAM MIEST V OKOLÍ ─────────────────────────────────────

let _nearbySortMode = 'auto'; // 'gps' | 'map' | 'auto'

function _buildNearbyListHTML(places, sortMode) {
  const hasGps = !!userLocation;
  // auto: GPS ak dostupná, inak stred mapy
  const useGps = sortMode === 'gps' || (sortMode === 'auto' && hasGps);
  const ref = useGps && userLocation
    ? userLocation
    : { lat: map.getCenter().lat, lng: map.getCenter().lng };

  const sorted = places
    .map(p => ({ ...p, _dist: haversineKm(ref.lat, ref.lng, +p.lat, +p.lng) }))
    .sort((a, b) => a._dist - b._dist);

  if (!sorted.length) {
    return `<div style="padding:32px 16px;text-align:center;color:#aaa;font-size:14px">
      <div style="font-size:32px;margin-bottom:12px"><i class="fa-solid fa-map"></i></div>
      <p>V aktuální oblasti nejsou žádná VANDRO místa.<br>Přiblište mapu nebo ji posuňte jinam.</p>
    </div>`;
  }

  // Prepínač zoradenia
  const gpsDisabled = !hasGps ? 'disabled title="GPS poloha není dostupná"' : '';
  const btnGps = `<button class="nearby-sort-btn${useGps ? ' active' : ''}" ${gpsDisabled} onclick="window._nearbySetSort('gps')"><i class="fa-solid fa-location-crosshairs"></i> GPS</button>`;
  const btnMap = `<button class="nearby-sort-btn${!useGps ? ' active' : ''}" onclick="window._nearbySetSort('map')"><i class="fa-solid fa-map"></i> Střed mapy</button>`;
  const sortBar = `<div class="nearby-sort-bar">${btnGps}${btnMap}</div>`;

  const items = sorted.map((p, idx) => {
    const icon = getIconForKategoria(p.kategoria || '', p.podkategoria || '') || vmIconSvg('pin');
    const thumb = p.foto_main
      ? `<img src="${p.foto_main}" class="nearby-thumb" alt="" loading="lazy">`
      : `<div class="nearby-thumb nearby-thumb-placeholder">${icon}</div>`;
    const sub = p.podkategoria
      ? `${p.kategoria || ''} › ${p.podkategoria}`
      : (p.kategoria || '');
    const vstup = p.vstup ? `<span class="nearby-vstup">${p.vstup}</span>` : '';
    const dist = `<span class="nearby-dist">${fmtDist(p._dist)}</span>`;
    return `<div class="nearby-item" data-nearby-idx="${idx}" onclick="window._nearbyOpenPlace(${idx})">
      ${thumb}
      <div class="nearby-item-body">
        <div class="nearby-item-top">
          <strong class="nearby-name">${p.nazov || 'Místo'}</strong>
          ${dist}
        </div>
        <div class="nearby-item-meta">
          <span class="nearby-sub">${icon} ${sub}</span>
          ${vstup}
        </div>
      </div>
    </div>`;
  }).join('');

  window._nearbySortedPlaces = sorted;
  window._nearbyVisiblePlaces = places;

  return `${sortBar}<div class="nearby-list">${items}</div>`;
}

function openNearbyPanel() {
  const bounds = map.getBounds();
  const visible = [..._vandroVisiblePlaces(), ...((typeof vmBizPlacesAll === 'function') ? vmBizPlacesAll() : [])].filter(p => {
    const lat = +p.lat, lng = +p.lng;
    return lat >= bounds.getSouth() && lat <= bounds.getNorth()
        && lng >= bounds.getWest()  && lng <= bounds.getEast();
  });

  const isMobile = window.innerWidth <= 768;
  const count = visible.length;
  const titleStr = `<i class="fa-solid fa-map-location-dot" style="color:var(--primary);margin-right:8px"></i>Místa v okolí${count ? ` <span style="font-size:13px;font-weight:400;color:#888">(${count})</span>` : ''}`;
  const content = _buildNearbyListHTML(visible, _nearbySortMode);

  // Prepínač zoradenia — prekreslí len obsah zoznamu bez zatvárania panela
  window._nearbySetSort = (mode) => {
    _nearbySortMode = mode;
    const listWrap = document.querySelector('.nearby-list')?.parentElement;
    if (listWrap) {
      listWrap.innerHTML = _buildNearbyListHTML(window._nearbyVisiblePlaces || visible, mode);
      // Znovu napoj hover listenery
      if (!isMobile) _attachNearbyHover();
    }
  };

  // Handler pre otvorenie detailu s návratom do zoznamu
  window._nearbyOpenPlace = (idx) => {
    const p = window._nearbySortedPlaces[idx];
    if (!p) return;

    // Scroll pozícia pred otvorením detailu
    const scrollEl = isMobile
      ? document.querySelector('#mobile-content')
      : document.querySelector('.panel-content');
    _nearbyListScrollTop = scrollEl ? scrollEl.scrollTop : 0;

    _nearbyDetailActive = true;

    // Zvýraznenie vybraného bodu v mape (oranžová ikona)
    setPlaceHighlight({ lat: +p.lat, lng: +p.lng }, p._icon_id || 'custom-pin');

    saveHistory(p);
    _trackPlaceView(p);
    const lat = parseFloat(p.lat), lng = parseFloat(p.lng);
    const galeria = Array.isArray(p.galeria) ? p.galeria : (typeof p.galeria === 'string' ? p.galeria.split(',').map(s => s.trim()).filter(Boolean) : []);
    const iconEmoji = getIconForKategoria(p.kategoria || '', p.podkategoria || '');
    const titleDetail = (iconEmoji ? iconEmoji + ' ' : '') + (p.nazov || p.name || 'Místo');
    const rows = buildInfoRows({
      addrStr: p.addr_street ? [p.addr_street, p.addr_housenumber].filter(Boolean).join(' ') + (p.addr_city ? ', ' + p.addr_city : '') : '',
      opening_hours: p.opening_hours, phone: p.phone, web: p.web, email: p.email,
      operator: p.operator, brand: p.brand, cuisine: p.cuisine, wheelchair: p.wheelchair,
      fee: p.fee, access: p.access, ele: p.ele, capacity: p.capacity, religion: p.religion,
      description: p.description, start_date: p.start_date, wikidata: p.wikidata, vstup: p.vstup, extraHtml: p._vm_rowsHtml,
    });

    const backBtn = `<button class="btn-nearby-back" onclick="window._nearbyBackToList()"><i class="fa-solid fa-arrow-left"></i> Zpět na seznam</button>`;

    const html = `
      ${_mainPhotoImgHtml(p.foto_main, 'panel-img-main')}
      <div class="panel-inner">
        ${backBtn}
        <div class="panel-title-row">
          ${iconEmoji ? `<span class="place-icon-emoji">${iconEmoji}</span>` : ''}
          <h2 class="panel-title">${escapeHtml(p.nazov || p.name || 'Místo')}</h2>
        </div>
        <div class="panel-categories">
          <span class="tag-kat">${escapeHtml(p.kategoria || p.label || 'Info')}</span>
          ${p.podkategoria ? `<span class="tag-subkat">${escapeHtml(p.podkategoria)}</span>` : ''}
        </div>
        <ul class="panel-info-list">${rows}</ul>
          ${_renderDescriptionHtml(p.popis)}
        ${_renderGalleryHtml(galeria)}
        <div class="panel-footer">
          <div class="gps-row"><span>${lat.toFixed(5)}, ${lng.toFixed(5)}</span><button onclick="copyGps(${lat},${lng})" class="btn-copy">Kopírovat GPS</button></div>
          <button onclick="startRoutingToPlace(${lat},${lng},'${_jsAttrSafe(p.nazov || p.name || 'Místo')}')" class="btn-route-plan"><i class="fas fa-route"></i> Naplánovat trasu</button>
          <button onclick="sharePoint()" class="btn-share"><i class="fas fa-share-alt"></i> Sdílet</button>
          ${typeof vmPlaceActionsHtml === 'function' ? vmPlaceActionsHtml(p) : ''}
        </div>
      </div>`;

    // Mobile: expanded (nie preview); desktop: sidebar
    if (isMobile) {
      openMobileSheet(titleDetail, _mainPhotoThumbSrc(p.foto_main), html, true);
    } else {
      openSidebar(`<div class="sidebar-header"><h3>${titleDetail}</h3><button class="btn-close" onclick="window._nearbyBackToList()"><i class="fa-solid fa-xmark"></i></button></div><div class="panel-content">${html}</div>`);
    }

    if (typeof GLightbox !== 'undefined') setTimeout(() => GLightbox({ selector: '.glightbox' }), 100);
    setTimeout(()=>_initClampedText(),0);
    _enrichPlaceMedia(lat, lng, p);
  };

  // Návrat do zoznamu — zruší highlight a obnoví scroll
  window._nearbyBackToList = () => {
    _nearbyDetailActive = false;
    setPlaceHighlight(null);
    openNearbyPanel();
    setTimeout(() => {
      const scrollEl = isMobile
        ? document.querySelector('#mobile-content')
        : document.querySelector('.panel-content');
      if (scrollEl) scrollEl.scrollTop = _nearbyListScrollTop;
    }, 50);
  };

  if (isMobile) {
    openMobileSheet(titleStr, null, content, true);
  } else {
    openSidebar(`<div class="sidebar-header"><h3>${titleStr}</h3><button class="btn-close" onclick="closeDesktopPanels()"><i class="fa-solid fa-xmark"></i></button></div><div class="panel-content">${content}</div>`);
  }

  // Hover zvýraznenie na desktope
  if (!isMobile) {
    setTimeout(() => _attachNearbyHover(), 0);
  }
}

function _attachNearbyHover() {
  document.querySelectorAll('.nearby-item').forEach(el => {
    const idx = +el.dataset.nearbyIdx;
    el.addEventListener('mouseenter', () => {
      const p = window._nearbySortedPlaces?.[idx];
      if (p && !_nearbyDetailActive) setPlaceHighlight({ lat: +p.lat, lng: +p.lng }, p._icon_id || 'custom-pin');
    });
    el.addEventListener('mouseleave', () => {
      if (!_nearbyDetailActive) setPlaceHighlight(null);
    });
  });
}

let _nearbyPanelOpen = false;
window._nearbyOpenPlace = () => {};
window._nearbyBackToList = () => {};

// Auto-refresh zoznamu pri pohybe mapy — len ak je panel otvorený a nezobrazuje detail
function _nearbyAutoRefresh() {
  if (_nearbyDetailActive) return;
  const sidebar = $('desktop-sidebar');
  const isMobile = window.innerWidth <= 768;
  const sheet = $('mobile-bottom-sheet');
  // Detekuj či je nearby panel aktuálne otvorený
  const desktopOpen = sidebar && !sidebar.classList.contains('panel-hidden')
    && document.querySelector('.nearby-list');
  const mobileOpen = sheet && !sheet.classList.contains('sheet-hidden')
    && document.querySelector('.nearby-list');
  if (desktopOpen || mobileOpen) openNearbyPanel();
}



// ── DESKTOP BUTTONS ───────────────────────────────────────────
function initDesktopButtons() {
  $('btn-north').addEventListener('click',()=>map.easeTo({bearing:0,pitch:0,duration:400}));
  $('btn-about').addEventListener('click', openAboutPanel);
  const btnNearby = $('btn-nearby-desktop');
  if (btnNearby) btnNearby.addEventListener('click', openNearbyPanel);
  // VANDRO panel close (desktop)
  const vpc = $('vandro-panel-close');
  if (vpc) vpc.addEventListener('click', closeVandroPanel);
  const vpb = $('vandro-panel-back');
  if (vpb) vpb.addEventListener('click', () => window._vandroPanelGoBack());
  $('btn-search-desktop').addEventListener('click',()=>{
    closeAllPanels();

    function getDeskCatIcon(cat) {
      return getIconForKategoria(cat, cat) || vmIconSvg('pin');
    }

    openSidebar(`<div class="sidebar-header">
      <h3><i class="fa-solid fa-magnifying-glass" style="color:var(--primary);margin-right:8px"></i>Vyhledávání</h3>
      <button class="btn-close" onclick="closeDesktopPanels()"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div style="position:relative;margin:14px 16px 0">
      <div class="desk-search-input-wrap">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="text" id="search-input-desktop" class="mso-input" placeholder="Místo, adresa, kategorie…" autocomplete="off">
        <button id="search-clear-desk" style="display:none;background:none;border:none;color:#aaa;cursor:pointer;padding:0 4px"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div id="search-hist-dropdown" class="search-hist-dropdown" style="display:none"></div>
    </div>
    <div class="panel-content" id="search-body-desktop" style="padding-top:8px"></div>`);

    const inp=$('search-input-desktop');
    const body=$('search-body-desktop');
    const histDrop=$('search-hist-dropdown');
    const clearBtn=$('search-clear-desk');

    // Skutočná logika "otvor bod z vyhľadávania/histórie" — definovaná ako
    // obyčajná lokálna funkcia HNEĎ na začiatku, nie cez window._deskPickPlace,
    // aby jej použitie v žiadnom prípade nezáviselo na poradí priradenia
    // globálnej premennej ani na tom, či sa medzitým panel prekreslil.
    function pickPlace(p) {
      clearSearchOutline();
      histDrop.style.display='none';
      const lat=+p.lat,lng=+p.lng;
      if(!map.getBounds().contains([lng,lat])||map.getZoom()<13)
        map.flyTo({center:[lng,lat],zoom:Math.max(map.getZoom(),14),speed:1.5});
      showPlaceDetail(_resolvePlaceForOpen(p));
    }
    // Zachovaný aj ako window._deskPickPlace — používa ho _deskPickPlaceFromCache
    // (cache-based klik pre globálne/lokálne výsledky vyhľadávania).
    window._deskPickPlace = pickPlace;

    function _showHistDropdown() {
      const h=getHistory();
      histDrop.innerHTML='';
      if (!h.length) { histDrop.style.display='none'; return; }
      h.forEach(p => {
        const ic=getIconForKategoria(p.kategoria||'',p.podkategoria||'');
        const item=document.createElement('div');
        item.className='search-hist-item';
        item.innerHTML=`<span class="res-item-icon" style="font-size:15px">${ic||vmIconSvg('pin')}</span>
          <div class="res-item-content"><strong></strong></div>`;
        item.querySelector('strong').textContent = p.nazov || 'Místo';
        // Priamy listener s uzáverom nad konkrétnym objektom p — žiadny
        // globálny index/cache, žiadna závislosť na tom, či inline
        // onclick reťazec ešte odkazuje na platné dáta.
        item.addEventListener('click', () => {
          pickPlace(p);
        });
        histDrop.appendChild(item);
      });
      histDrop.style.display='block';
    }

    function _hideHistDropdown() { histDrop.style.display='none'; }

    // Predtým sa dropdown skrýval cez 'blur' s časovačom 150 ms — keďže
    // blur nastane hneď pri mousedown na položku (skôr než sa stihne
    // vyhodnotiť 'click'), pri pomalšom renderi mohol dropdown zmiznúť
    // ešte PRED dokončením kliku, takže sa naň nedalo kliknúť. Namiesto
    // toho teraz sledujeme kliknutie mimo inputu/dropdownu — položka sa
    // tak nikdy neschová skôr, než sa jej vlastný onclick stihne vykonať.
    document.removeEventListener('mousedown', window._deskHistOutsideHandler || (()=>{}));
    window._deskHistOutsideHandler = (e) => {
      if (histDrop.style.display === 'none') return;
      if (e.target === inp || histDrop.contains(e.target)) return;
      _hideHistDropdown();
    };
    document.addEventListener('mousedown', window._deskHistOutsideHandler);

    function renderDeskDefault() {
      const currentCats=[...new Set(allPlaces.map(p=>p.podkategoria||p.kategoria).filter(Boolean))].sort().slice(0,16);
      const isFilterActive=currentCategory&&currentCategory!=='all';
      const catHtml=currentCats.length?`
        <div class="mso-section-title">VANDRO MÍSTA</div>
        <div class="mso-categories">
          <div class="mso-cat-grid">
            <button class="mso-cat-btn${!isFilterActive?' active':''}" data-cat="all">
              <span class="mso-cat-icon"><i class="fa-solid fa-map"></i></span>
              <span class="mso-cat-label">Všechna místa</span>
            </button>
            ${currentCats.map(c=>`
              <button class="mso-cat-btn${currentCategory===c?' active':''}" data-cat="${c}">
                <span class="mso-cat-icon">${getDeskCatIcon(c)}</span>
                <span class="mso-cat-label">${c}</span>
              </button>`).join('')}
          </div>
          ${isFilterActive?`<p style="font-size:11px;color:var(--primary);padding:6px 2px;font-weight:600">Aktivní filtr: ${currentCategory}</p>`:''}
        </div>`:'';

      body.innerHTML=`
        <p style="font-size:12px;color:#aaa;padding:4px 2px 8px">Tip: Pro hledání podle kategorie ji napište přímo do pole.</p>
        ${catHtml}`;

      body.querySelectorAll('.mso-cat-btn').forEach(btn=>{
        btn.addEventListener('click',()=>{
          let cat=btn.dataset.cat;
          currentCategory=(cat!=='all'&&currentCategory===cat)?'all':cat;
          renderPlacesLayer(_vandroVisiblePlaces());
          closeAllPanels();
        });
      });
    }

    renderDeskDefault();
    inp.addEventListener('focus',()=>{ if(!inp.value.trim()) _showHistDropdown(); });
    clearBtn.addEventListener('click',()=>{ inp.value=''; clearBtn.style.display='none'; renderDeskDefault(); inp.focus(); });

    // Focus až po registrácii listenerov + zobraz históriu hneď
    inp.focus();
    _showHistDropdown();

    let _deskTimer=null;
    inp.addEventListener('input',e=>{
      clearTimeout(_deskTimer);
      histDrop.style.display='none';
      const val=e.target.value.toLowerCase().trim();
      clearBtn.style.display = val ? 'block' : 'none';
      if(!val||val.length<2){renderDeskDefault();return;}
      _deskTimer=setTimeout(async()=>{
        const ctr=userLocation||{lat:map.getCenter().lat,lng:map.getCenter().lng};
        const results = await buildUnifiedSearchResults(val, ctr);
        const html = results.map(item => _renderSearchResultItem(item, '_deskPickPlaceFromCache')).join('');
        const offlineNote = navigator.onLine ? '' : `<p class="search-offline-note"><i class="fa-solid fa-wifi-slash"></i> Offline — hledá se jen ve vlastních místech</p>`;
        body.innerHTML = offlineNote + (html
          ?`<div class="mso-results">${html}</div>`
          :`<p style="text-align:center;color:#aaa;padding:30px 16px;font-size:13px">Žádné výsledky pro „${val}"</p>`);
      },280);
    });
  });
  $('btn-route-desktop').addEventListener('click',showRoutePlanner);
  $('btn-basemap').addEventListener('click',()=>{
    closeAllPanels();
    openSidebar(`<div class="sidebar-header"><h3>Podklady mapy</h3><button class="btn-close" onclick="closeDesktopPanels()"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="panel-content">
        <button class="basemap-btn basemap-switch-btn${currentBaseLayer==='liberty'?' active':''}" data-layer="liberty"><i class="fa-solid fa-map"></i> Základní</button>
        <button class="basemap-btn basemap-switch-btn${currentBaseLayer==='topo'?' active':''}" data-layer="topo"><i class="fa-solid fa-mountain"></i> Turistická</button>
        <button class="basemap-btn basemap-switch-btn${currentBaseLayer==='zima'?' active':''}" data-layer="zima"><i class="fa-solid fa-snowflake"></i> Zimní</button>
        <button class="basemap-btn basemap-switch-btn${currentBaseLayer==='satelit'?' active':''}" data-layer="satelit"><i class="fa-solid fa-satellite"></i> Satelit</button>
      </div>`);
    document.querySelectorAll('.basemap-btn').forEach(btn=>btn.addEventListener('click',e=>{
      if (!navigator.onLine && e.currentTarget.dataset.layer !== 'liberty') return;
      document.querySelectorAll('.basemap-btn').forEach(b=>b.classList.remove('active'));
      e.currentTarget.classList.add('active');changeBasemap(e.currentTarget.dataset.layer);
    }));
    _updateBasemapOfflineState();
  });
  $('btn-locate-desktop').addEventListener('click',()=>{
    navigator.geolocation.getCurrentPosition(pos=>{
      const ll=[pos.coords.longitude,pos.coords.latitude];
      userLocation={lat:pos.coords.latitude,lng:pos.coords.longitude};
      map.flyTo({center:ll,zoom:15,speed:1.4});
      userLocation={lat:pos.coords.latitude,lng:pos.coords.longitude};
      placeGpsMarker(ll);
      if (window._startGpsWatch) window._startGpsWatch();
    },()=>alert('GPS poloha není dostupná'));
    closeAllPanels();
  });
  $('btn-zoom-in').addEventListener('click',()=>map.zoomIn());
  $('btn-zoom-out').addEventListener('click',()=>map.zoomOut());
}

function openMobileSearchOverlay() {
  function getCatIcon(cat) {
    return getIconForKategoria(cat, cat) || vmIconSvg('pin');
  }

  let ov = $('mobile-search-overlay');
  const isNewOverlay = !ov;
  if (isNewOverlay) {
    ov = document.createElement('div');
    ov.id = 'mobile-search-overlay';
    ov.className = 'hidden';
    ov.innerHTML = `
      <div class="mso-header">
        <button class="mso-back-btn" id="mso-back-btn"><i class="fa-solid fa-arrow-left"></i></button>
        <div class="mso-input-wrap">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" id="mso-input" placeholder="Hledat místo, adresu…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        </div>
      </div>
      <div class="mso-body" id="mso-body"></div>`;
    vmRoot().appendChild(ov);

    $('mso-back-btn').addEventListener('click', closeMobileSearchOverlay);

    const msoInp = $('mso-input');
    const msoBody = $('mso-body');

    function renderMsoDefault() {
      const h = getHistory();
      const histHtml = h.length ? `
        <div class="mso-section-title">Naposledy hledáno</div>
        <div class="mso-results">${h.map((p,i)=>{
          const ic=getIconForKategoria(p.kategoria||'',p.podkategoria||'');
          const dist=userLocation?`<span class="res-dist">${fmtDist(haversineKm(userLocation.lat,userLocation.lng,+p.lat,+p.lng))}</span>`:'';
          const subLbl=p.podkategoria?`${p.kategoria} › ${p.podkategoria}`:(p.kategoria||'');
          return `<div class="res-item local mso-hist-item" data-histidx="${i}">
            <span class="res-item-icon">${ic||vmIconSvg('pin')}</span>
            <div class="res-item-content"><strong>${p.nazov}</strong><small>${subLbl}</small></div>${dist}
          </div>`;
        }).join('')}</div>` : '';

      const currentCats = [...new Set(allPlaces.map(p=>p.podkategoria||p.kategoria).filter(Boolean))].sort().slice(0,16);
      
      // Zistíme, či je reálne nejaký filter aktívny
      const isFilterActive = currentCategory && currentCategory !== 'all';

      const catHtml = currentCats.length ? `
        <div class="mso-section-title">VANDRO MÍSTA</div>
        <div class="mso-categories">
          <div class="mso-cat-grid">
            <!-- Fixné tlačidlo pre zobrazenie všetkých bodov -->
            <button class="mso-cat-btn${!isFilterActive ? ' active' : ''}" data-cat="all">
              <span class="mso-cat-icon"><i class="fa-solid fa-map"></i></span>
              <span class="mso-cat-label">Všechna místa</span>
            </button>
            ${currentCats.map(c=>`
              <button class="mso-cat-btn${currentCategory===c?' active':''}" data-cat="${c}">
                <span class="mso-cat-icon">${getCatIcon(c)}</span>
                <span class="mso-cat-label">${c}</span>
              </button>`).join('')}
          </div>
          ${isFilterActive ? `<p style="font-size:11px;color:var(--primary);padding:6px 2px;font-weight:600">Aktivní filtr: ${currentCategory}</p>` : ''}
        </div>` : '';

      msoBody.innerHTML = `
        <p style="font-size:12px;color:#aaa;padding:10px 16px 4px">Tip: Pokud nenajdete kategorii, zkuste ji napsat přímo do vyhledávacího pole.</p>
        ${histHtml}${catHtml}`;

      msoBody.querySelectorAll('.mso-hist-item').forEach(el => {
        const idx = +el.dataset.histidx;
        el.addEventListener('click', () => {
          if (window._msoPickHistory) window._msoPickHistory(h[idx]);
        });
      });

      msoBody.querySelectorAll('.mso-cat-btn').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          let cat = btn.dataset.cat;
          
          // TOGGLE LOGIKA
          if (cat !== 'all' && currentCategory === cat) {
            currentCategory = 'all';
          } else {
            currentCategory = cat;
          }
          
          // FILTROVANIE BODOV
          renderPlacesLayer(_vandroVisiblePlaces());
          
          closeMobileSearchOverlay();
        });
      });
    }
    window._msoPickHistory = p => {
      clearSearchOutline();
      const lat=+p.lat,lng=+p.lng;
      if(!map.getBounds().contains([lng,lat])||map.getZoom()<13){
        map.flyTo({center:[lng,lat],zoom:Math.max(map.getZoom(),14),speed:1.5});
      }
      closeMobileSearchOverlay();
      showPlaceDetail(_resolvePlaceForOpen(p));
    };

    let _msoTimer = null;
    msoInp.addEventListener('input', e => {
      clearTimeout(_msoTimer);
      const val = e.target.value.toLowerCase().trim();
      if (!val || val.length < 2) { renderMsoDefault(); return; }
      _msoTimer = setTimeout(async () => {
        const ctr = userLocation || { lat: map.getCenter().lat, lng: map.getCenter().lng };
        const results = await buildUnifiedSearchResults(val, ctr);
        const html = results.map(item => _renderSearchResultItem(item, '_msoPickHistoryFromCache', ';closeMobileSearchOverlay()')).join('');
        const offlineNote = navigator.onLine ? '' : `<p class="search-offline-note"><i class="fa-solid fa-wifi-slash"></i> Offline — hledá se jen ve vlastních místech</p>`;
        msoBody.innerHTML = offlineNote + (html
          ? `<div class="mso-results">${html}</div>`
          : `<p style="text-align:center;color:#aaa;padding:30px 16px;font-size:13px">Žádné výsledky pro „${val}"</p>`);
      }, 280);
    });

    // Uložíme si referencie na element, aby sa dali znova zavolať pri
    // KAŽDOM ďalšom otvorení vyhľadávania (nielen pri prvom vytvorení DOM).
    ov._renderDefault = renderMsoDefault;
    ov._msoInput = msoInp;

    renderMsoDefault();
  }

  closeMobilePanels();
  const bs = $('mobile-bottom-sheet');
  if (bs) { bs.classList.remove('sheet-preview-only','sheet-expanded'); bs.classList.add('sheet-hidden'); }
  const rs2 = $('mobile-route-sheet');
  if (rs2) { rs2.classList.remove('sheet-preview-only','sheet-expanded'); rs2.classList.add('sheet-hidden'); }

  // Pri KAŽDOM otvorení (nielen prvom) vyčistíme staré vyhľadávané
  // slovo a znova vykreslíme aktuálnu históriu/kategórie — predtým sa
  // toto volalo len raz pri prvom vytvorení overlay, takže druhé a ďalšie
  // otvorenie ukazovalo zastaraný obsah.
  if (!isNewOverlay) {
    if (ov._msoInput) ov._msoInput.value = '';
    if (typeof ov._renderDefault === 'function') ov._renderDefault();
  }

  ov.classList.remove('hidden');
  setTimeout(()=>{ const inp=$('mso-input'); if(inp) inp.focus(); }, 80);
}

function closeMobileSearchOverlay() {
  const ov = $('mobile-search-overlay');
  if (ov) ov.classList.add('hidden');
  const msi = $('search-input');
  if (msi) msi.blur();
}
window.closeMobileSearchOverlay = closeMobileSearchOverlay;
// ── MOBILE BUTTONS ────────────────────────────────────────────
function initMobileButtons() {
  $('btn-north-mobile').addEventListener('click',()=>map.easeTo({bearing:0,pitch:0,duration:400}));
  $('btn-about-mobile').addEventListener('click',()=>{ closeMobilePanels(); openAboutPanel(); });
  const btnNearbyMob = $('btn-nearby-mobile');
  if (btnNearbyMob) btnNearbyMob.addEventListener('click', () => { closeMobilePanels(); openNearbyPanel(); });

  // VANDRO panel — zatvoriť tlačidlom aj backdroptom
  const vpmc = $('vandro-panel-mobile-close');
  if (vpmc) vpmc.addEventListener('click', () => {
    $('vandro-panel-mobile').classList.add('hidden');
    $('panel-backdrop').classList.remove('active');
  });
  $('panel-backdrop').addEventListener('click', () => {
    $('vandro-panel-mobile')?.classList.add('hidden');
    $('panel-backdrop').classList.remove('active');
  });
  $('btn-locate-mobile').addEventListener('click',()=>{
    navigator.geolocation.getCurrentPosition(pos=>{
      const ll=[pos.coords.longitude,pos.coords.latitude];
      userLocation={lat:pos.coords.latitude,lng:pos.coords.longitude};
      map.flyTo({center:ll,zoom:15});
      userLocation={lat:pos.coords.latitude,lng:pos.coords.longitude};
      placeGpsMarker(ll);
      if (window._startGpsWatch) window._startGpsWatch();
    });closeMobilePanels();
  });
  $('btn-zoom-in-mobile').addEventListener('click',()=>map.zoomIn());
  $('btn-zoom-out-mobile').addEventListener('click',()=>map.zoomOut());
  $('btn-route-mobile').addEventListener('click',()=>{
    // Zatvoríme detail miesta (bottom sheet) aj ostatné mobile panely
    const placeSheet = $('mobile-bottom-sheet');
    if (placeSheet) {
      placeSheet.classList.remove('sheet-preview-only','sheet-expanded');
      placeSheet.classList.add('sheet-hidden');
    }
    closeMobilePanels();
    const so = $('mobile-search-overlay');
    if (so) so.classList.add('hidden');
    openMobileRouteSheet();
  });
  $('btn-basemap-mobile').addEventListener('click',()=>{
  const placeSheet=$('mobile-bottom-sheet');
  if(placeSheet){placeSheet.classList.remove('sheet-preview-only','sheet-expanded');placeSheet.classList.add('sheet-hidden');}
  const rs=$('mobile-route-sheet');
  if(rs){rs.classList.remove('sheet-preview-only','sheet-expanded');rs.classList.add('sheet-hidden');}
  closeMobilePanels();
  $('basemap-panel-mobile').classList.remove('hidden');
  _updateBasemapOfflineState();
  });
  document.querySelectorAll('#basemap-panel-mobile .basemap-option').forEach(btn=>{
    btn.classList.add('basemap-switch-btn');
    btn.addEventListener('click',e=>{
      if (!navigator.onLine && e.currentTarget.dataset.layer !== 'liberty') return;
      document.querySelectorAll('#basemap-panel-mobile .basemap-option').forEach(b=>b.classList.remove('active'));
      e.currentTarget.classList.add('active');changeBasemap(e.currentTarget.dataset.layer);closeMobilePanels();
    });
  });
  const msi=$('search-input');

  // Mobilná horná lišta so search-input slúži už LEN ako spúšťač
  // full-screen vyhľadávacieho overlay (#mobile-search-overlay). Predtým tu
  // bežal aj starý paralelný systém (doSearchMobile → výsledky do bottom
  // sheetu), ktorý sa reálne nikdy nezobrazoval (overlay ho prekrýval a
  // hneď po focuse mu aj tak preberal focus), len zbytočne bežal na pozadí
  // a mohol spôsobovať konflikty — preto bol odstránený.
  msi.addEventListener('focus',()=>{
    openMobileSearchOverlay();
  });

  $('sheet-close-btn').addEventListener('click',()=>{
    _deactivateWeatherMode();
    if (window._panelReturnCtx) { window._panelGoBack(); return; }
    window._vandroPanelReturn = false;
    const s=$('mobile-bottom-sheet');
    s.classList.remove('sheet-preview-only','sheet-expanded');s.classList.add('sheet-hidden');
    clearSearchOutline();
  });
  const sheetBackBtn = $('sheet-back-btn');
  if (sheetBackBtn) sheetBackBtn.addEventListener('click', () => window._vandroPanelGoBack());

  // Expand sheet pri kliknutí na handle/preview
  const expand=()=>{const s=$('mobile-bottom-sheet');if(s.classList.contains('sheet-preview-only'))s.classList.replace('sheet-preview-only','sheet-expanded');};
  document.querySelector('.sheet-drag-handle')?.addEventListener('click',expand);
  $('mobile-preview').addEventListener('click',expand);

  // ── Drag / swipe na mobile bottom sheet ──────────────────────
  // Reálny drag s vizuálnou spätnou väzbou + snap na konci
  const sheet=$('mobile-bottom-sheet');
  let dragStartY=0, dragStartTranslate=0, dragCurrentY=0;
  let sheetDragIntent=null; // null | 'drag' | 'scroll' | 'ignore'
  let sheetVH=window.innerHeight; // 80vh výška sheetu
  window.addEventListener('resize',()=>{sheetVH=window.innerHeight;});

  function getBaseTranslate(){
    // Vráti aktuálny translateY podľa triedy
    if(sheet.classList.contains('sheet-hidden')) return sheetVH;
    if(sheet.classList.contains('sheet-preview-only')) return sheetVH*0.8 - 132;
    if(sheet.classList.contains('sheet-expanded')) return 0;
    return sheetVH;
  }

  function applyTranslate(y){
    const min=-20, max=sheetVH; // trochu nad expanded, ale nie príliš
    const clamped=Math.max(min,Math.min(max,y));
    sheet.style.transition='none';
    sheet.style.transform=`translateY(${clamped}px)`;
  }

  function snapSheet(finalY){
    sheet.style.transition='';
    sheet.style.transform='';
    const expanded=0;
    const preview=sheetVH*0.8 - 132;
    const hidden=sheetVH;
    // Snap na najbližšiu pozíciu
    const dExp=Math.abs(finalY-expanded);
    const dPrev=Math.abs(finalY-preview);
    const dHide=Math.abs(finalY-hidden);
    const minD=Math.min(dExp,dPrev,dHide);
    if(minD===dExp){
      sheet.classList.remove('sheet-hidden','sheet-preview-only'); sheet.classList.add('sheet-expanded');
    } else if(minD===dPrev){
      sheet.classList.remove('sheet-hidden','sheet-expanded'); sheet.classList.add('sheet-preview-only');
    } else {
      sheet.classList.remove('sheet-preview-only','sheet-expanded'); sheet.classList.add('sheet-hidden');
      clearSearchOutline();
    }
  }

  sheet.addEventListener('touchstart',e=>{
    sheetDragIntent=null;
    dragStartY=e.touches[0].clientY;
    dragStartTranslate=getBaseTranslate();
    dragCurrentY=dragStartY;
  },{passive:true});

  sheet.addEventListener('touchmove',e=>{
    const touch=e.touches[0];
    const dy=touch.clientY - dragStartY;
    const dx=Math.abs(touch.clientX - (e.touches[0].clientX||0));
    dragCurrentY=touch.clientY;
    const content=$('mobile-content');
    const isExpanded=sheet.classList.contains('sheet-expanded');

    // Urči zámer raz
    if(sheetDragIntent===null && Math.abs(dy)>6){
      const adx=Math.abs(touch.clientX - dragStartY + dragStartY); // reset dx approx
      if(isExpanded && content && content.contains(e.target)){
        if(dy<0){ sheetDragIntent='scroll'; return; }
        if(dy>0 && content.scrollTop>0){ sheetDragIntent='scroll'; return; }
        sheetDragIntent='drag';
      } else {
        sheetDragIntent='drag';
      }
    }
    if(sheetDragIntent!=='drag') return;

    applyTranslate(dragStartTranslate + dy);
  },{passive:true});

  sheet.addEventListener('touchend',e=>{
    if(sheetDragIntent==='drag'){
      const totalDy=dragCurrentY - dragStartY;
      // Velocity-based snap: veľký pohyb = snap ďalej
      const finalY=dragStartTranslate + totalDy;
      snapSheet(finalY);
    }
    sheetDragIntent=null;
  },{passive:true});

  document.addEventListener('click',e=>{
    if(!document.querySelector('.mobile-panel:not(.hidden)')) return;
    const mc=document.querySelector('.mobile-controls');
    if(mc&&!mc.contains(e.target)) closeMobilePanels();
  });
  $('panel-backdrop').addEventListener('click',closeAllPanels);
  const bmBackdrop = $('bm-modal-backdrop');
  if (bmBackdrop) bmBackdrop.addEventListener('click', (e) => {
    if (e.target === bmBackdrop) window._bmCloseModal();
  });
  map.on('rotate',updateCompass);
}

// ============================================================
//  ROUTING ENGINE — Stadia Maps (OSRM) → OpenRouteService fallback
// ============================================================

const ROUTING_API = {
  // OSRM public demo — správne profily pre každý typ dopravy
  osrm: {
    // KĽÚČOVÁ OPRAVA TU: Zmenené na správne OSRM názvy 'foot' a 'bicycle'
    profiles: { car: 'driving', foot: 'foot', bike: 'bicycle' },
    url(profile, coords) {
      const c = coords.map(p=>`${p.lng},${p.lat}`).join(';');
      // overview=full → celá geometria; annotations=false → rýchlejšia odpoveď
      return `https://router.project-osrm.org/route/v1/${this.profiles[profile]}/${c}?overview=full&geometries=geojson&steps=false&annotations=false`;
    },
    extract(json, profile) {
      const route = json.routes?.[0];
      if (!route) return null;
      // OSRM vracia čas podľa profilu, ale pre istotu overíme či nie je nereálne rýchly
      const rawDuration = route.duration;
      const estDuration = estimateDuration(route.distance, profile);
      // Ak OSRM vráti čas kratší ako 60% odhadu pre chodca/bicykel → použijeme odhad
      const durationS = (profile !== 'car' && rawDuration < estDuration * 0.6)
        ? estDuration
        : rawDuration;
      return {
        geometry: route.geometry,
        distanceM: route.distance,
        durationS,
        legs: route.legs,
      };
    }
  },
  // OpenRouteService fallback — vracia aj prevýšenie
  ors: {
    key: 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImE3ODEyYmVhZTgyNDQ3ZjNhYmE1YWUxMmRmMjEyYmY0IiwiaCI6Im11cm11cjY0In0=',
    profiles: { car: 'driving-car', foot: 'foot-hiking', bike: 'cycling-regular' },
    url(profile, coords) {
      const c = coords.map(p=>[p.lng,p.lat]);
      return {
        url: `https://api.openrouteservice.org/v2/directions/${this.profiles[profile]}/geojson`,
        body: JSON.stringify({ coordinates: c, elevation: true }),
        headers: {
          'Authorization': this.key,
          'Content-Type': 'application/json',
          'Accept': 'application/json, application/geo+json',
        }
      };
    },
    extract(json, profile) {
      const feat = json.features?.[0];
      if (!feat) return null;
      const props = feat.properties?.summary || {};
      const segments = feat.properties?.segments || [];
      let ascent = 0, descent = 0;
      segments.forEach(seg => {
        if (seg.ascent) ascent += seg.ascent;
        if (seg.descent) descent += seg.descent;
      });
      const distanceM = props.distance;
      // Ak ORS nevráti čas, vypočítame ho podľa profilu
      const durationS = props.duration || estimateDuration(distanceM, profile);
      return {
        geometry: feat.geometry,
        distanceM,
        durationS,
        ascent: ascent || null,
        descent: descent || null,
      };
    }
  }
};

// ── Prevýšenie z Open-Elevation (pre OSRM ktorý ho nevracia) ──
async function fetchElevation(geojsonCoords) {
  try {
    // Vezmeme max 100 vzorkovacích bodov (každý n-tý) aby sme nepresahovali limit API
    const step = Math.max(1, Math.floor(geojsonCoords.length / 100));
    const samples = geojsonCoords.filter((_, i) => i % step === 0);
    const locations = samples.map(c => ({ latitude: c[1], longitude: c[0] }));
    const res = await fetch('https://api.open-elevation.com/api/v1/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return { ascent: null, descent: null };
    const data = await res.json();
    const elevations = (data.results || []).map(r => r.elevation);
    let ascent = 0, descent = 0;
    for (let i = 1; i < elevations.length; i++) {
      const diff = elevations[i] - elevations[i - 1];
      if (diff > 0) ascent += diff;
      else descent += Math.abs(diff);
    }
    return {
      ascent: Math.round(ascent),
      descent: Math.round(descent)
    };
  } catch {
    return { ascent: null, descent: null };
  }
}

// Stav planera — prevzaté z pôvodných globálnych premenných
// routeWaypoints, routeLineId, isCreatingRoute sú definované vyššie v kóde

let routePickerMode = false;   // keď je aktívny marker-picker na mape
let routePickerMarker = null;  // draggable marker na výber bodu
let routePickerForIdx = null;  // index waypointu ktorý editujeme (null = nový)
let routeCalculating = false;
let routeGeoLine = null;       // posledná vypočítaná geometria trasy
let routeCurrentType = 'foot'; // aktívny profil

// ── Rýchlosti podľa módu [km/h] — používa sa ako fallback ak API nevracia čas ──
const MODE_SPEEDS = {
  car:  65,   // priemerná rýchlosť auta na cestnej sieti
  foot:  4.5, // chodec vrátane stúpania a klesania
  bike: 14,   // cyklista na zmiešanom teréne (cesty + lesné cesty)
};

// ── Pomocné formátovanie ──────────────────────────────────────
function fmtDuration(s) {
  if (!s) return '';
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
  if (h>0) return `${h} h ${m} min`;
  return `${m} min`;
}

// Vypočíta odhadovaný čas z vzdialenosti a profilu (záloha)
function estimateDuration(distanceM, profile) {
  const speedKmh = MODE_SPEEDS[profile] || MODE_SPEEDS.foot;
  return Math.round((distanceM / 1000) / speedKmh * 3600);
}

// ── Geocoding cez Nominatim (pre vyhľadávanie v planeri) ──────
async function geocodeRouteQuery(q) {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1`,
    { headers:{'Accept-Language':'cs,sk'} }
  );
  if(!r.ok) return [];
  return await r.json();
}

// ── Výpočet trasy s fallbackom ────────────────────────────────
// Stratégia:
//   auto        → OSRM primárny (rýchly, optimalizovaný pre cestné siete)
//                 → ORS fallback
//   pešo/bicykel → ORS primárny (foot-hiking / cycling-regular podporuje
//                  turistické chodníky, lesné cesty, poľné cesty, cyklotrasy)
//                 → OSRM fallback (cestná sieť, aspoň niečo ak ORS zlyhá)
async function calculateRoute(profile, waypoints) {
  if (waypoints.length < 2) return null;

  const osrmFirst = (profile === 'car');

  // Pomocná funkcia pre OSRM volanie
  const tryOsrm = async () => {
    const url = ROUTING_API.osrm.url(profile, waypoints);
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const json = await res.json();
    const data = ROUTING_API.osrm.extract(json, profile);
    if (!data) throw new Error('OSRM: žiadne dáta');
    // Prevýšenie OSRM nevracia — doplníme asynchrónne
    if (data.geometry?.coordinates?.length > 1) {
      fetchElevation(data.geometry.coordinates).then(({ ascent, descent }) => {
        updateRouteStats(data.distanceM, data.durationS, ascent, descent);
      });
    }
    return data;
  };

  // Pomocná funkcia pre ORS volanie
  const tryOrs = async () => {
    const req = ROUTING_API.ors.url(profile, waypoints);
    const res = await fetch(req.url, {
      method: 'POST', headers: req.headers, body: req.body,
      signal: AbortSignal.timeout(14000)
    });
    if (!res.ok) throw new Error(`ORS HTTP ${res.status}`);
    const json = await res.json();
    // ORS vracia chyby aj s HTTP 200 v niektorých prípadoch
    if (json.error) throw new Error(`ORS error: ${json.error.message||json.error}`);
    const data = ROUTING_API.ors.extract(json, profile);
    if (!data) throw new Error('ORS: žiadne dáta');
    return data;
  };

  if (osrmFirst) {
    // Auto: OSRM → ORS
    try { return await tryOsrm(); } catch(e) { console.warn('OSRM zlyhalo:', e.message); }
    try { return await tryOrs(); } catch(e) { console.warn('ORS fallback zlyhalo:', e.message); }
  } else {
    // Pešo / Bicykel: ORS → OSRM (ORS pozná turistické chodníky a cyklotrasy)
    try { return await tryOrs(); } catch(e) { console.warn('ORS zlyhalo:', e.message); }
    try { return await tryOsrm(); } catch(e) { console.warn('OSRM fallback zlyhalo:', e.message); }
  }

  return null;
}

// ── Vykreslenie trasy na mapu ─────────────────────────────────
function renderRouteLine(geometry) {
  clearRouteLayers();
  routeLineId++;
  const lineId = `route-line-${routeLineId}`;
  const haloId = `route-halo-${routeLineId}`;
  const ptsId  = `route-pts-${routeLineId}`;

  // Tieň (halo)
  map.addSource(haloId, { type:'geojson', data:{ type:'Feature', geometry, properties:{} } });
  map.addLayer({ id:haloId, type:'line', source:haloId,
    layout:{'line-join':'round','line-cap':'round'},
    paint:{'line-color':'#fff','line-width':9,'line-opacity':0.6}
  });
  // Hlavná čiara
  map.addSource(lineId, { type:'geojson', data:{ type:'Feature', geometry, properties:{} } });
  map.addLayer({ id:lineId, type:'line', source:lineId,
    layout:{'line-join':'round','line-cap':'round'},
    paint:{'line-color':'#2b8a3e','line-width':5,'line-opacity':0.95}
  }, haloId);

  // Waypoint body (začiatok zelený, koniec červený, ostatné modré)
  map.addSource(ptsId, { type:'geojson', data:{
    type:'FeatureCollection',
    features: routeWaypoints.map((p,i)=>({
      type:'Feature',
      geometry:{type:'Point',coordinates:[p.lng,p.lat]},
      properties:{ idx:i, total:routeWaypoints.length,
        label: String(i+1) }
    }))
  }});
  map.addLayer({ id:ptsId, type:'circle', source:ptsId,
    paint:{
      'circle-radius': 11,
      'circle-color': ['case',
        ['==',['get','idx'],0], '#2b8a3e',
        ['==',['get','idx'],['to-number',['-',['get','total'],1]]], '#e74c3c',
        '#3498db'
      ],
      'circle-stroke-width': 3,
      'circle-stroke-color': 'white'
    }
  });
  // Popisky bodov
  map.addLayer({ id:`${ptsId}-lbl`, type:'symbol', source:ptsId,
    layout:{
      'text-field':['get','label'],
      'text-font':['literal',['Noto Sans Bold']],
      'text-size':11,
    },
    paint:{'text-color':'white','text-halo-color':'transparent','text-halo-width':0}
  });
}

function clearRouteLayers() {
  const ids = [
    `route-line-${routeLineId}`, `route-halo-${routeLineId}`,
    `route-pts-${routeLineId}`,  `route-pts-${routeLineId}-lbl`
  ];
  ids.forEach(id=>{ try{if(map.getLayer(id))map.removeLayer(id);}catch{} });
  ids.forEach(id=>{ try{if(map.getSource(id))map.removeSource(id);}catch{} });
  // Tiež vyčistíme standalone waypoint vrstvu (zobrazená pred výpočtom trasy)
  try{if(map.getLayer('route-waypoints-preview'))map.removeLayer('route-waypoints-preview');}catch{}
  try{if(map.getLayer('route-waypoints-preview-lbl'))map.removeLayer('route-waypoints-preview-lbl');}catch{}
  try{if(map.getSource('route-waypoints-preview'))map.removeSource('route-waypoints-preview');}catch{}
}

// Vykreslí len body trasy (bez čiary) — okamžite po pridaní bodu
function renderWaypointDots() {
  try{if(map.getLayer('route-waypoints-preview'))map.removeLayer('route-waypoints-preview');}catch{}
  try{if(map.getLayer('route-waypoints-preview-lbl'))map.removeLayer('route-waypoints-preview-lbl');}catch{}
  try{if(map.getSource('route-waypoints-preview'))map.removeSource('route-waypoints-preview');}catch{}
  if (!routeWaypoints.length) return;
  const features = routeWaypoints.map((p,i)=>({
    type:'Feature',
    geometry:{type:'Point',coordinates:[p.lng,p.lat]},
    properties:{ idx:i, total:routeWaypoints.length, label:String(i+1) }
  }));
  map.addSource('route-waypoints-preview',{type:'geojson',data:{type:'FeatureCollection',features}});
  map.addLayer({ id:'route-waypoints-preview', type:'circle', source:'route-waypoints-preview',
    paint:{
      'circle-radius': 11,
      'circle-color': ['case',
        ['==',['get','idx'],0], '#2b8a3e',
        ['==',['get','idx'],['to-number',['-',['get','total'],1]]], '#e74c3c',
        '#3498db'
      ],
      'circle-stroke-width': 3,
      'circle-stroke-color': 'white'
    }
  });
  map.addLayer({ id:'route-waypoints-preview-lbl', type:'symbol', source:'route-waypoints-preview',
    layout:{
      'text-field':['get','label'],
      'text-font':['literal',['Noto Sans Bold']],
      'text-size':11,
    },
    paint:{'text-color':'white','text-halo-color':'transparent','text-halo-width':0}
  });
}

// ── Aktualizácia UI zoznamu waypointov ────────────────────────
function updateRouteUI() {
  // Desktop
  const wpPanel = $('route-waypoints-panel');
  const infoPanel = $('route-info-panel');
  // Mobile
  const wpMob = $('route-waypoints-mobile');
  const infoMob = $('route-info-mobile');

  const buildWpHtml = () => routeWaypoints.length === 0
    ? '<div class="route-empty-hint"><i class="fa-solid fa-location-dot"></i> Přidejte alespoň dva body pro výpočet trasy</div>'
    : routeWaypoints.map((p,i)=>`
        <div class="route-waypoint-item" draggable="true"
             ondragstart="routeDragStart(event,${i})"
             ondragover="event.preventDefault()"
             ondrop="routeDrop(event,${i})">
          <span class="rw-handle">⠿</span>
          <span class="rw-dot" style="background:${i===0?'#2b8a3e':i===routeWaypoints.length-1?'#e74c3c':'#3498db'}"></span>
          <span class="rw-name">${p.name || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`}</span>
          <div class="rw-btns">
            <button class="rw-btn-edit" onclick="startPickerForWaypoint(${i})" title="Posunout bod"><i class="fa-solid fa-pen"></i></button>
            <button class="rw-btn-del" onclick="removeWaypoint(${i})" title="Odebrat"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>`).join('');

  if (wpPanel) wpPanel.innerHTML = buildWpHtml();
  if (wpMob)   wpMob.innerHTML   = buildWpHtml();

  // Aktualizujeme aj mobile route sheet
  _updateRouteSheet();

  // Info o trase
  const buildInfoHtml = () => {
    if (routeCalculating) return '<div class="route-calculating"><i class="fa-solid fa-hourglass-half"></i> Počítám trasu…</div>';
    if (!routeGeoLine || routeWaypoints.length < 2) {
      return routeWaypoints.length === 1
        ? '<div class="route-empty-hint"><i class="fa-solid fa-plus"></i> Přidejte cílový bod</div>'
        : '';
    }
    return ''; // vyplní sa po výpočte cez updateRouteStats()
  };
  if (infoPanel) infoPanel.innerHTML = buildInfoHtml();
  if (infoMob)   infoMob.innerHTML   = buildInfoHtml();
}

function updateRouteStats(distM, durS, ascent, descent) {
  let html = '';
  if (distM) {
    html = `<div class="route-stats">
      <span><i class="fa-solid fa-ruler-horizontal"></i> ${fmtDist(distM/1000)}</span>
      <span><i class="fa-solid fa-stopwatch"></i> ${fmtDuration(durS)}</span>
      ${ascent ? `<span><i class="fa-solid fa-arrow-up"></i> ${Math.round(ascent)} m</span>` : ''}
      ${descent ? `<span><i class="fa-solid fa-arrow-down"></i> ${Math.round(descent)} m</span>` : ''}
    </div>`;
  }
  const els = [$('route-info-panel'), $('route-info-mobile'), $('route-info-sheet')];
  els.forEach(el => { if(el) el.innerHTML = html; });

  // Aktualizujeme aj kompaktné štatistiky v hlavičke route sheet
  const statsEl = $('route-sheet-stats');
  if (statsEl && distM) {
    statsEl.innerHTML = `<span><i class="fa-solid fa-ruler-horizontal"></i> ${fmtDist(distM/1000)}</span><span><i class="fa-solid fa-stopwatch"></i> ${fmtDuration(durS)}</span>${ascent?`<span><i class="fa-solid fa-arrow-up"></i> ${Math.round(ascent)} m</span>`:''}`;
  }
}

// Chybová hláška v UI (nie alert)
function showRouteError(msg) {
  const html = `<div class="route-error">${msg}</div>`;
  [$('route-info-panel'), $('route-info-mobile')].forEach(el=>{if(el) el.innerHTML=html;});
}

// ── Drag & drop preusporiadanie bodov ────────────────────────
let _dragSrcIdx = null;
window.routeDragStart = (e, i) => { _dragSrcIdx = i; };
window.routeDrop = (e, i) => {
  if (_dragSrcIdx === null || _dragSrcIdx === i) return;
  const item = routeWaypoints.splice(_dragSrcIdx, 1)[0];
  routeWaypoints.splice(i, 0, item);
  _dragSrcIdx = null;
  updateRouteUI();
  triggerRouteCalc();
};

// ── Hlavný výpočet (debounced) ────────────────────────────────
let _routeCalcTimer = null;
function triggerRouteCalc() {
  clearTimeout(_routeCalcTimer);
  if (routeWaypoints.length < 2) {
    clearRouteLayers();
    routeGeoLine = null;
    updateRouteUI();
    return;
  }
  updateRouteUI();
  _routeCalcTimer = setTimeout(async () => {
    routeCalculating = true;
    updateRouteUI();
    const profile = routeCurrentType;
    const result = await calculateRoute(profile, routeWaypoints);
    routeCalculating = false;
    if (!result) {
      showRouteError('Omlouváme se, plánování tras je dočasně nedostupné. Zkuste to prosím za chvíli.');
      return;
    }
    routeGeoLine = result.geometry;
    renderRouteLine(result.geometry);
    updateRouteStats(result.distanceM, result.durationS, result.ascent, result.descent);
  }, 350);
}

// ── Pridanie bodu ─────────────────────────────────────────────
function addWaypoint(lat, lng, name) {
  routeWaypoints.push({ lat:+lat, lng:+lng, name: name || null });
  renderWaypointDots(); // okamžite zobraz bod na mape
  updateRouteUI();
  triggerRouteCalc();
}

window.addWaypointFromSearch = (lat, lng, name) => {
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    // Na mobile otvoríme route sheet ak nie je otvorený
    const rs = $('mobile-route-sheet');
    if (!rs || rs.classList.contains('sheet-hidden')) {
      openMobileRouteSheet();
    }
  } else {
    // Na desktope: ak sidebar nie je otvorený s planerom, otvoríme ho
    const sidebar = $('desktop-sidebar');
    const isRouteOpen = sidebar && !sidebar.classList.contains('panel-hidden') &&
      $('desktop-sidebar-inner')?.querySelector('.rt-type-row');
    if (!isRouteOpen) {
      showRoutePlanner();
      // showRoutePlanner zavolá updateRouteUI — bod pridáme až po renderovaní
      setTimeout(() => {
        addWaypoint(+lat, +lng, name);
      }, 50);
      // Zavrieme výsledky vyhľadávania
      document.querySelectorAll('[id^="route-search"]').forEach(el=>{
        if(el.tagName==='INPUT') el.value='';
        else el.classList.add('hidden');
      });
      return;
    }
  }
  addWaypoint(+lat, +lng, name);
  // Zavrieme výsledky vyhľadávania
  document.querySelectorAll('[id^="route-search"]').forEach(el=>{
    if(el.tagName==='INPUT') el.value='';
    else el.classList.add('hidden');
  });
};

window.removeWaypoint = i => {
  routeWaypoints.splice(i, 1);
  renderWaypointDots();
  updateRouteUI();
  triggerRouteCalc();
};

// ── Marker-picker — výber bodu presunom markeru ───────────────
// Desktop: draggable marker kdekoľvek na mape
// Mobile:  marker je pevne v strede, mapa sa posúva
function startPickerForWaypoint(idx) {
  routePickerForIdx = idx;
  activateRoutePicker();
}

function activateRoutePicker(isNew) {
  routePickerMode = true;
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    // Mobile: zobrazíme crosshair overlay, potvrdenie tlačidlom
    showMobilePickerOverlay();
  } else {
    // Desktop: draggable marker s potvrdením tlačidlom — presúvať koľkokrát chce
    const center = map.getCenter();
    const el = document.createElement('div');
    el.className = 'route-picker-marker';
    el.innerHTML = `<div class="rpm-inner"></div><div class="rpm-label">Přetáhněte</div>`;
    if (routePickerMarker) routePickerMarker.remove();
    routePickerMarker = new maplibregl.Marker({ element:el, draggable:true, anchor:'bottom' })
      .setLngLat([center.lng, center.lat])
      .addTo(map);
    // Dragging — aktualizujeme label, ale NEpotvrdzujeme automaticky
    routePickerMarker.on('drag', () => {
      const lbl = el.querySelector('.rpm-label');
      if (lbl) lbl.textContent = 'Potvrdit';
    });
    // Zobrazíme desktop picker bar (potvrdiť / zrušiť)
    showDesktopPickerBar();
  }
}

function showDesktopPickerBar() {
  let bar = document.getElementById('desktop-picker-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'desktop-picker-bar';
    bar.innerHTML = `
      <span><i class="fa-solid fa-location-dot"></i> Přetáhněte bod na požadované místo</span>
      <button id="dpb-confirm"><i class="fa-solid fa-check"></i> Potvrdit</button>
      <button id="dpb-cancel"><i class="fa-solid fa-xmark"></i></button>`;
    vmRoot().appendChild(bar);
    document.getElementById('dpb-confirm').onclick = () => {
      if (!routePickerMarker) return;
      const ll = routePickerMarker.getLngLat();
      confirmPickerPosition(ll.lat, ll.lng);
    };
    document.getElementById('dpb-cancel').onclick = cancelPicker;
  }
  bar.classList.remove('hidden');
}

function showMobilePickerOverlay() {
  // Skryje mobilnú search lištu aj route sheet počas výberu bodu
  const mobileSearchBar = document.querySelector('.top-ui-bar-mobile');
  if (mobileSearchBar) mobileSearchBar.style.display = 'none';
  // Minimalizujeme route sheet aby neprekážal pri výbere bodu
  const rs = $('mobile-route-sheet');
  if (rs && !rs.classList.contains('sheet-hidden')) {
    rs.dataset.prePickerState = rs.classList.contains('sheet-expanded') ? 'expanded' : 'preview';
    rs.classList.remove('sheet-expanded','sheet-preview-only');
    rs.classList.add('sheet-hidden');
  }
  // Minimalizujeme aj place sheet
  const ps = $('mobile-bottom-sheet');
  if (ps && !ps.classList.contains('sheet-hidden')) {
    ps.classList.remove('sheet-preview-only','sheet-expanded');
    ps.classList.add('sheet-hidden');
  }

  let ov = $('route-picker-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'route-picker-overlay';
    ov.innerHTML = `
      <div class="rpo-crosshair"><div></div><div></div></div>
      <div class="rpo-dot"></div>
      <div class="rpo-bar">
        <span>Přesuňte mapu na požadované místo</span>
        <button id="rpo-confirm"><i class="fa-solid fa-check"></i> Potvrdit</button>
        <button id="rpo-cancel"><i class="fa-solid fa-xmark"></i></button>
      </div>`;
    vmRoot().appendChild(ov);
    const restoreAfterPick = () => {
      if (mobileSearchBar) mobileSearchBar.style.display = '';
      // Obnovíme route sheet do pôvodného stavu
      const rs = $('mobile-route-sheet');
      if (rs) {
        const prev = rs.dataset.prePickerState;
        rs.classList.remove('sheet-hidden','sheet-expanded','sheet-preview-only');
        rs.classList.add(prev === 'expanded' ? 'sheet-expanded' : 'sheet-preview-only');
        delete rs.dataset.prePickerState;
      }
    };
    $('rpo-confirm').onclick = () => {
      const c = map.getCenter();
      confirmPickerPosition(c.lat, c.lng);
      restoreAfterPick();
    };
    $('rpo-cancel').onclick = () => {
      cancelPicker();
      restoreAfterPick();
    };
  } else {
    // Ak overlay existuje, aktualizujeme handlery aby referencovali aktuálny mobileSearchBar
    const confirmBtn = $('rpo-confirm');
    const cancelBtn = $('rpo-cancel');
    const restoreAfterPick2 = () => {
      if (mobileSearchBar) mobileSearchBar.style.display = '';
      const rs = $('mobile-route-sheet');
      if (rs) {
        const prev = rs.dataset.prePickerState;
        rs.classList.remove('sheet-hidden','sheet-expanded','sheet-preview-only');
        rs.classList.add(prev === 'expanded' ? 'sheet-expanded' : 'sheet-preview-only');
        delete rs.dataset.prePickerState;
      }
    };
    if (confirmBtn) confirmBtn.onclick = () => {
      const c = map.getCenter();
      confirmPickerPosition(c.lat, c.lng);
      restoreAfterPick2();
    };
    if (cancelBtn) cancelBtn.onclick = () => {
      cancelPicker();
      restoreAfterPick2();
    };
  }
  ov.classList.remove('hidden');
}

function confirmPickerPosition(lat, lng) {
  cancelPicker(false);
  // Reverse geocode pre pekný názov
  fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16`,
    {headers:{'Accept-Language':'cs,sk'}})
    .then(r=>r.json())
    .then(d=>{
      const name = d.display_name
        ? d.display_name.split(',').slice(0,2).join(', ')
        : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      setPickedPoint(lat, lng, name);
    })
    .catch(()=>setPickedPoint(lat, lng, null));
}

function setPickedPoint(lat, lng, name) {
  if (routePickerForIdx !== null && routePickerForIdx < routeWaypoints.length) {
    routeWaypoints[routePickerForIdx] = { lat:+lat, lng:+lng, name };
  } else {
    routeWaypoints.push({ lat:+lat, lng:+lng, name });
  }
  routePickerForIdx = null;
  renderWaypointDots(); // okamžite zobraz aktualizované body
  updateRouteUI();
  triggerRouteCalc();
}

function cancelPicker(resetIdx=true) {
  routePickerMode = false;
  if(resetIdx) routePickerForIdx = null;
  if (routePickerMarker) { routePickerMarker.remove(); routePickerMarker = null; }
  const ov = $('route-picker-overlay');
  if (ov) ov.classList.add('hidden');
  const dpb = document.getElementById('desktop-picker-bar');
  if (dpb) dpb.classList.add('hidden');
}

// ── GPS ako počiatočný bod ────────────────────────────────────
function addGpsAsWaypoint() {
  if (!userLocation) {
    navigator.geolocation.getCurrentPosition(pos=>{
      userLocation={lat:pos.coords.latitude,lng:pos.coords.longitude};
      addWaypoint(pos.coords.latitude, pos.coords.longitude, 'Moje poloha');
      placeGpsMarker([pos.coords.longitude, pos.coords.latitude]);
    }, ()=>showRouteError('GPS poloha není dostupná'));
    return;
  }
  addWaypoint(userLocation.lat, userLocation.lng, 'Moje poloha');
}

// ── Vyhľadávanie v planeri (Nominatim + vlastné miesta) ───────
let _routeSearchTimer = null;
async function handleRouteSearch(val, resEl) {
  clearTimeout(_routeSearchTimer);
  if (val.length < 2) { resEl.classList.add('hidden'); return; }
  _routeSearchTimer = setTimeout(async () => {
    // Najprv vlastné miesta
    const local = allPlaces.filter(p=>
      (p.nazov||'').toLowerCase().includes(val) ||
      (p.kategoria||'').toLowerCase().includes(val)
    ).slice(0,4).concat((typeof vmBizSearch === 'function') ? vmBizSearch(val).slice(0,3) : []);
    // Potom Nominatim
    let nom = [];
    try {
      const ctr = userLocation || { lat: map.getCenter().lat, lng: map.getCenter().lng };
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=5&addressdetails=1&lat=${ctr.lat}&lon=${ctr.lng}`,
        { headers:{'Accept-Language':'cs,sk'} }
      );
      if (r.ok) nom = await r.json();
    } catch {}

    const items = [
      ...local.map(p=>({
        lat:+p.lat, lng:+p.lng,
        name:p.nazov||'Místo',
        sub:(p.podkategoria||p.kategoria||''),
        icon: getIconForKategoria(p.kategoria||'',p.podkategoria||'') || vmIconSvg('pin'),
      })),
      ...nom.slice(0,5).map(n=>({
        lat:+n.lat, lng:+n.lon,
        name: n.display_name.split(',').slice(0,2).join(', '),
        sub: n.display_name.split(',').slice(2,4).join(', '),
        icon:'<i class="fa-solid fa-magnifying-glass"></i>',
      }))
    ].slice(0,8);

    if (!items.length) { resEl.classList.add('hidden'); return; }
    resEl.innerHTML = items.map((it,idx)=>
      `<div class="route-search-item" data-rsi-idx="${idx}">
        <span class="rsi-icon">${it.icon}</span>
        <span><strong>${it.name}</strong><small>${it.sub}</small></span>
      </div>`
    ).join('');
    // Priamy event listener — funguje spoľahlivo aj na mobile (touch + click)
    resEl.querySelectorAll('.route-search-item').forEach((el, idx) => {
      const it = items[idx];
      const handler = (e) => {
        e.preventDefault(); e.stopPropagation();
        resEl.classList.add('hidden');
        addWaypointFromSearch(it.lat, it.lng, it.name);
      };
      el.addEventListener('mousedown', handler);
      el.addEventListener('touchend', handler, { passive: false });
    });
    resEl.classList.remove('hidden');
  }, 280);
}

// ── Zdieľanie trasy cez URL hash ──────────────────────────────
function shareRoute() {
  if (!routeWaypoints.length) {
    alert('Nejprve přidejte alespoň jeden bod trasy.');
    return;
  }
  const data = {
    t: routeCurrentType,
    w: routeWaypoints.map(p=>({ la:+p.lat.toFixed(5), ln:+p.lng.toFixed(5), n:p.name||'' }))
  };
  const hash = '#route=' + encodeURIComponent(window.btoa(unescape(encodeURIComponent(JSON.stringify(data)))));
  const url = location.origin + location.pathname + hash;

  // Vizuálna spätná väzba — aktualizuje všetky share tlačidlá naraz
  const showFeedback = () => {
    const ids = ['btn-share-route', 'btn-share-route-mob', 'btn-share-route-sheet'];
    ids.forEach(id => {
      const btn = $(id);
      if (!btn) return;
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Zkopírováno!';
      setTimeout(() => { btn.innerHTML = orig; }, 2500);
    });
  };

  // In-page fallback dialog — zobrazí odkaz priamo v aplikácii
  const showInPageDialog = () => {
    let dlg = document.getElementById('share-route-dialog');
    if (!dlg) {
      dlg = document.createElement('div');
      dlg.id = 'share-route-dialog';
      dlg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:14px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.22);z-index:9999;max-width:92vw;width:360px;';
      dlg.innerHTML = `
        <div style="font-weight:700;font-size:15px;margin-bottom:10px"><i class="fa-solid fa-link"></i> Odkaz na trasu</div>
        <input id="share-url-input" type="text" readonly style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:13px;color:#333;background:#f9f9f9;box-sizing:border-box">
        <div style="display:flex;gap:8px;margin-top:12px">
          <button id="share-copy-btn" style="flex:1;background:#2b8a3e;color:#fff;border:none;padding:10px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer">Kopírovat</button>
          <button id="share-close-btn" style="flex:0 0 auto;background:#eee;border:none;padding:10px 14px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer"><i class="fa-solid fa-xmark"></i></button>
        </div>`;
      vmRoot().appendChild(dlg);
      document.getElementById('share-close-btn').onclick = () => dlg.style.display = 'none';
      document.getElementById('share-copy-btn').onclick = () => {
        const inp = document.getElementById('share-url-input');
        inp.select(); inp.setSelectionRange(0, 99999);
        try { document.execCommand('copy'); } catch {}
        document.getElementById('share-copy-btn').textContent = 'Zkopírováno!';
        setTimeout(() => { document.getElementById('share-copy-btn').textContent = 'Kopírovat'; }, 2000);
      };
    }
    document.getElementById('share-url-input').value = url;
    dlg.style.display = 'block';
    setTimeout(() => {
      const inp = document.getElementById('share-url-input');
      if (inp) { inp.focus(); inp.select(); }
    }, 50);
  };

  // Primárne kopírujeme do schránky; pri zlyhaní zobrazíme in-page dialog
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url)
      .then(() => showFeedback())
      .catch(() => {
        if (_fallbackCopyToClipboard(url)) { showFeedback(); }
        else showInPageDialog();
      });
  } else {
    if (_fallbackCopyToClipboard(url)) { showFeedback(); }
    else showInPageDialog();
  }
}

// Kopírovanie cez skrytý textarea — funguje aj na HTTP a v starých prehliadačoch
function _fallbackCopyToClipboard(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
    vmRoot().appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch(e) {
    return false;
  }
}

// Načítanie trasy z URL hash
function loadRouteFromHash() {
  try {
    const m = location.hash.match(/#route=(.+)/);
    if (!m) return;
    const data = JSON.parse(decodeURIComponent(escape(window.atob(decodeURIComponent(m[1])))));
    routeCurrentType = data.t || 'foot';
    routeWaypoints = data.w.map(p=>({ lat:p.la, lng:p.ln, name:p.n||null }));
    setTimeout(()=>{
      updateRouteUI();
      triggerRouteCalc();
      // Prispôsobíme mapu
      if(routeWaypoints.length>0) {
        const lngs = routeWaypoints.map(p=>p.lng);
        const lats = routeWaypoints.map(p=>p.lat);
        map.fitBounds([
          [Math.min(...lngs)-0.05, Math.min(...lats)-0.05],
          [Math.max(...lngs)+0.05, Math.max(...lats)+0.05]
        ],{padding:60,maxZoom:14});
      }
    }, 1200);
  } catch(e) { console.warn('Chyba pri načítaní trasy z URL:', e); }
}

// ── Fit bounds na trasu ───────────────────────────────────────
function fitRouteOnMap() {
  if (!routeWaypoints.length) return;
  const lngs = routeWaypoints.map(p=>p.lng);
  const lats = routeWaypoints.map(p=>p.lat);
  map.fitBounds([
    [Math.min(...lngs)-0.01, Math.min(...lats)-0.01],
    [Math.max(...lngs)+0.01, Math.max(...lats)+0.01]
  ], {padding:80, maxZoom:15, duration:600});
}

// ── Vymazanie trasy ───────────────────────────────────────────
function clearRoute() {
  routeWaypoints = [];
  isCreatingRoute = false;
  routeGeoLine = null;
  cancelPicker();
  clearRouteLayers();
  updateRouteUI();
  _updateRouteSheet();
  updateRouteStats(null, null);
  // Vyčistíme aj štatistiky v route sheet hlavičke
  const statsEl = $('route-sheet-stats');
  if (statsEl) statsEl.innerHTML = '';
}

// ── Zobrazenie planera (Desktop sidebar) ──────────────────────
function showRoutePlanner() {
  closeAllPanels();

  const typeOptions = (sel) => ['car','foot','bike'].map(v=>{
    const labels = {car:'<i class="fa-solid fa-car"></i> Auto', foot:'<i class="fa-solid fa-person-walking"></i> Pěšky', bike:'<i class="fa-solid fa-person-biking"></i> Kolo'};
    return `<button class="rt-type-btn${routeCurrentType===v?' active':''}" data-type="${v}">${labels[v]}</button>`;
  }).join('');

  openSidebar(`
    <div class="sidebar-header">
      <h3><i class="fa-solid fa-map"></i> Plán trasy</h3>
      <button class="btn-close" onclick="closeDesktopPanels()"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="panel-content">

      <div class="route-section">
        <h4>Způsob dopravy</h4>
        <div class="rt-type-row" id="rt-type-row">${typeOptions()}</div>
      </div>

      <div class="route-section">
        <h4>Přidat bod</h4>
        <div class="rt-add-row">
          <button class="rt-add-btn" onclick="addGpsAsWaypoint()" title="Moje poloha">
            <i class="fa-solid fa-location-crosshairs"></i> GPS
          </button>
          <button class="rt-add-btn" onclick="startPickerForWaypoint(null);activateRoutePicker(true)" title="Kliknout na mapu">
            <i class="fa-solid fa-map-pin"></i> Na mapě
          </button>
        </div>
        <div style="position:relative;margin-top:8px">
          <input type="text" id="route-search-input" class="route-search-input"
                 placeholder="Hledat místo, adresu…" autocomplete="off">
          <div id="route-search-results" class="route-search-results hidden"></div>
        </div>
      </div>

      <div class="route-section">
        <h4>Body trasy</h4>
        <div id="route-waypoints-panel" class="route-waypoints-list"></div>
        <div id="route-info-panel" class="route-info"></div>
      </div>

      <div class="route-buttons">
        <button class="route-btn route-btn-start" onclick="fitRouteOnMap()">
          <i class="fa-solid fa-expand"></i> Zobrazit trasu
        </button>
        <button class="route-btn route-btn-clear" onclick="clearRoute()">
          <i class="fa-solid fa-trash"></i> Smazat
        </button>
      </div>
      <button id="btn-share-route" class="btn-route-plan" style="margin-top:8px" onclick="shareRoute()">
        <i class="fa-solid fa-share-nodes"></i> Sdílet trasu
      </button>

    </div>`);

  // Typ dopravy
  document.querySelectorAll('.rt-type-btn').forEach(btn=>btn.addEventListener('click',e=>{
    routeCurrentType = e.currentTarget.dataset.type;
    document.querySelectorAll('.rt-type-btn').forEach(b=>b.classList.remove('active'));
    e.currentTarget.classList.add('active');
    if(routeWaypoints.length>=2) triggerRouteCalc();
  }));

  // Vyhľadávanie — blur sa oneskorí aby onclick na položke prebehol skôr
  const inp = $('route-search-input'), res = $('route-search-results');
  inp.addEventListener('input', e=>handleRouteSearch(e.target.value.toLowerCase().trim(), res));
  // mousedown na výsledku zavolá addWaypointFromSearch PRED blur → žiaden race condition
  res.addEventListener('mousedown', e=>e.preventDefault());
  inp.addEventListener('blur', ()=>setTimeout(()=>res.classList.add('hidden'), 350));

  updateRouteUI();
  // Klik na mapu = pridaj bod (ak nie je picker aktívny)
  _enableMapClickForRoute();
}

// ── Klik na mapu pridáva bod trasy (ak je planer otvorený) ───
let _routeMapClickActive = false;
function _enableMapClickForRoute() {
  if (_routeMapClickActive) return;
  _routeMapClickActive = true;
}
// handleMapClick volá addWaypoint ak isCreatingRoute → ponechávame pôvodnú logiku
// Ale tiež pridávame klik ak je planer viditeľný a bol stlačený "Na mapě"
window.activateRoutePicker = activateRoutePicker; // export pre inline onclick

// ── Mobile Route Sheet (bottom sheet pre plánovanietrasy) ─────
function openMobileRouteSheet() {
  // Vytvoríme route sheet ak ešte neexistuje
  let rs = $('mobile-route-sheet');
  if (!rs) {
    rs = document.createElement('div');
    rs.id = 'mobile-route-sheet';
    rs.className = 'mobile-route-sheet sheet-hidden';
    rs.innerHTML = `
      <div class="sheet-drag-handle"><span></span></div>
      <button class="sheet-close-btn" id="route-sheet-close-btn"><i class="fa-solid fa-xmark"></i></button>
      <div class="route-sheet-header">
        <h3><i class="fa-solid fa-map"></i> Plán trasy</h3>
        <div id="route-sheet-stats" class="route-sheet-stats"></div>
      </div>
      <div class="route-sheet-body">
        <div class="rt-type-row" id="rt-type-row-sheet">
          ${['car','foot','bike'].map(v=>{
            const labels={car:'<i class="fa-solid fa-car"></i> Auto',foot:'<i class="fa-solid fa-person-walking"></i> Pěšky',bike:'<i class="fa-solid fa-person-biking"></i> Kolo'};
            return `<button class="rt-type-btn${routeCurrentType===v?' active':''}" data-type="${v}">${labels[v]}</button>`;
          }).join('')}
        </div>
        <div class="rt-add-row" style="margin:10px 0 6px">
          <button class="rt-add-btn" onclick="addGpsAsWaypoint()" style="font-size:13px">
            <i class="fa-solid fa-location-crosshairs"></i> GPS
          </button>
          <button class="rt-add-btn" onclick="startPickerForWaypoint(null);activateRoutePicker(true)" style="font-size:13px">
            <i class="fa-solid fa-map-pin"></i> Na mapě
          </button>
        </div>
        <div style="position:relative">
          <input type="text" id="route-search-sheet" class="route-search-input" placeholder="Hledat bod…" autocomplete="off">
          <div id="route-search-results-sheet" class="route-search-results hidden"></div>
        </div>
        <div id="route-waypoints-sheet" style="margin-top:8px;max-height:130px;overflow-y:auto;"></div>
        <div id="route-info-sheet" style="margin-top:6px;font-size:12px;color:#666;"></div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="route-btn route-btn-start" style="flex:1" onclick="fitRouteOnMap()"><i class="fa-solid fa-expand"></i> Zobrazit</button>
          <button class="route-btn route-btn-clear" style="flex:0 0 auto" onclick="clearRoute()"><i class="fa-solid fa-trash"></i></button>
        </div>
        <button id="btn-share-route-sheet" class="btn-route-plan" style="margin-top:8px;width:100%" onclick="shareRoute()">
          <i class="fa-solid fa-share-nodes"></i> Sdílet trasu
        </button>
      </div>`;
    vmRoot().appendChild(rs);

    // Zatvorenie
    rs.querySelector('#route-sheet-close-btn').addEventListener('click', () => {
      rs.classList.remove('sheet-preview-only','sheet-expanded');
      rs.classList.add('sheet-hidden');
    });

    // Typ dopravy
    rs.querySelectorAll('.rt-type-btn').forEach(btn=>btn.addEventListener('click',e=>{
      routeCurrentType = e.currentTarget.dataset.type;
      rs.querySelectorAll('.rt-type-btn').forEach(b=>b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      // Sync aj desktop
      document.querySelectorAll('#rt-type-row .rt-type-btn').forEach(b=>{
        b.classList.toggle('active', b.dataset.type===routeCurrentType);
      });
      if(routeWaypoints.length>=2) triggerRouteCalc();
    }));

    // Vyhľadávanie v route sheet
    const inp = rs.querySelector('#route-search-sheet');
    const res = rs.querySelector('#route-search-results-sheet');
    inp.addEventListener('input', e=>handleRouteSearch(e.target.value.toLowerCase().trim(), res));
    // mousedown zabraňuje strateniu focusu pred kliknutím na výsledok (desktop)
    res.addEventListener('mousedown', e=>e.preventDefault());
    // Na mobile: touchstart s preventDefault blokuje click — NESMIE byť tu
    // Namiesto toho používame dlhší timeout na blur
    inp.addEventListener('blur', ()=>setTimeout(()=>res.classList.add('hidden'), 350));

    // Drag / swipe na route sheet
    _initSheetDrag(rs);
  }

  // Aktualizujeme typ dopravy
  rs.querySelectorAll('.rt-type-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.type===routeCurrentType);
  });

  // Zobrazíme sheet — rovno rozbalený ako plnohodnotný panel
  rs.classList.remove('sheet-hidden','sheet-preview-only');
  rs.classList.add('sheet-expanded');

  // Synchronizujeme obsah
  _updateRouteSheet();
}

// Aktualizácia obsahu route sheet
function _updateRouteSheet() {
  const rs = $('mobile-route-sheet');
  if (!rs || rs.classList.contains('sheet-hidden')) return;

  const wpEl = rs.querySelector('#route-waypoints-sheet');
  const infoEl = rs.querySelector('#route-info-sheet');

  if (wpEl) {
    wpEl.innerHTML = routeWaypoints.length === 0
      ? '<div class="route-empty-hint"><i class="fa-solid fa-location-dot"></i> Přidejte body trasy</div>'
      : routeWaypoints.map((p,i)=>`
          <div class="route-waypoint-item" draggable="true"
               ondragstart="routeDragStart(event,${i})"
               ondragover="event.preventDefault()"
               ondrop="routeDrop(event,${i})">
            <span class="rw-handle">⠿</span>
            <span class="rw-dot" style="background:${i===0?'#2b8a3e':i===routeWaypoints.length-1?'#e74c3c':'#3498db'}"></span>
            <span class="rw-name">${p.name || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`}</span>
            <div class="rw-btns">
              <button class="rw-btn-edit" onclick="startPickerForWaypoint(${i})" title="Posunout"><i class="fa-solid fa-pen"></i></button>
              <button class="rw-btn-del" onclick="removeWaypoint(${i})" title="Odebrat"><i class="fa-solid fa-xmark"></i></button>
            </div>
          </div>`).join('');
  }

  if (infoEl) {
    if (routeCalculating) infoEl.innerHTML = '<div class="route-calculating"><i class="fa-solid fa-hourglass-half"></i> Počítám trasu…</div>';
    else if (!routeGeoLine && routeWaypoints.length === 1) infoEl.innerHTML = '<div class="route-empty-hint"><i class="fa-solid fa-plus"></i> Přidejte cílový bod</div>';
    else infoEl.innerHTML = '';
  }
}

// Inicializácia drag/swipe pre ľubovoľný sheet element
function _initSheetDrag(sheet) {
  let dragStartY=0, dragStartTranslate=0, dragCurrentY=0;
  let dragIntent=null;
  const vh=()=>window.innerHeight;

  const PEEK_H = 110; // must match CSS: calc(100% - 110px)
  const getBase=()=>{
    if(sheet.classList.contains('sheet-hidden')) return vh();
    if(sheet.classList.contains('sheet-preview-only')) return vh() - PEEK_H;
    if(sheet.classList.contains('sheet-expanded')) return 0;
    return vh();
  };
  const applyT=(y)=>{
    const c=Math.max(-20,Math.min(vh(),y));
    sheet.style.transition='none'; sheet.style.transform=`translateY(${c}px)`;
  };
  const snap=(finalY)=>{
    sheet.style.transition=''; sheet.style.transform='';
    const exp=0,prev=vh()-PEEK_H,hid=vh();
    const dE=Math.abs(finalY-exp),dP=Math.abs(finalY-prev),dH=Math.abs(finalY-hid);
    const m=Math.min(dE,dP,dH);
    if(m===dE){sheet.classList.remove('sheet-hidden','sheet-preview-only');sheet.classList.add('sheet-expanded');}
    else if(m===dP){sheet.classList.remove('sheet-hidden','sheet-expanded');sheet.classList.add('sheet-preview-only');}
    else{sheet.classList.remove('sheet-preview-only','sheet-expanded');sheet.classList.add('sheet-hidden');}
  };

  sheet.addEventListener('touchstart',e=>{
    dragIntent=null;dragStartY=e.touches[0].clientY;
    dragStartTranslate=getBase();dragCurrentY=dragStartY;
  },{passive:true});
  sheet.addEventListener('touchmove',e=>{
    const dy=e.touches[0].clientY-dragStartY;
    dragCurrentY=e.touches[0].clientY;
    if(dragIntent===null&&Math.abs(dy)>6){
      const body=sheet.querySelector('.route-sheet-body');
      const expanded=sheet.classList.contains('sheet-expanded');
      if(expanded&&body&&body.contains(e.target)){
        if(dy<0){dragIntent='scroll';return;}
        if(dy>0&&body.scrollTop>0){dragIntent='scroll';return;}
      }
      dragIntent='drag';
    }
    if(dragIntent!=='drag') return;
    applyT(dragStartTranslate+dy);
  },{passive:true});
  sheet.addEventListener('touchend',()=>{
    if(dragIntent==='drag') snap(dragStartTranslate+(dragCurrentY-dragStartY));
    dragIntent=null;
  },{passive:true});
}

// ── Mobile Route Panel sync (legacy — zachovaný pre spätnú kompatibilitu) ─
function syncMobileRoutePanel() {
  // Typ dopravy
  const sel = $('route-type-mobile');
  if(sel) sel.value = routeCurrentType;
  // Sync vyhľadávania
  const inp = $('route-search-mobile'), res = $('route-search-results-mobile');
  if(inp) {
    inp.oninput = e=>handleRouteSearch(e.target.value.toLowerCase().trim(), res);
    // mousedown pred blur — zabraňuje race condition pri výbere položky
    if(res) res.onmousedown = e=>e.preventDefault();
    inp.onblur = ()=>{ if(res) res.classList.add('hidden'); };
    // Touchend tiež skrývame s oneskorením pre iOS
    inp.addEventListener('touchend', ()=>setTimeout(()=>{ if(res) res.classList.add('hidden'); }, 300), {once:false});
  }
  if(sel) sel.onchange = e=>{
    routeCurrentType = e.target.value;
    if(routeWaypoints.length>=2) triggerRouteCalc();
  };
  updateRouteUI();
}

window.openRoutePanel = showRoutePlanner;
window.startRoutingToPlace = (lat, lng, name) => {
  try { name = decodeURIComponent(name); } catch {}
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    // Zatvoríme detail miesta a otvoríme route sheet
    const placeSheet = $('mobile-bottom-sheet');
    if (placeSheet) { placeSheet.classList.remove('sheet-preview-only','sheet-expanded'); placeSheet.classList.add('sheet-hidden'); }
    routeWaypoints = [{ lat:+lat, lng:+lng, name }];
    openMobileRouteSheet();
    setTimeout(()=>{ renderWaypointDots(); _updateRouteSheet(); triggerRouteCalc(); }, 80);
  } else {
    showRoutePlanner();
    routeWaypoints = [{ lat:+lat, lng:+lng, name }];
    setTimeout(()=>{ renderWaypointDots(); updateRouteUI(); triggerRouteCalc(); }, 80);
  }
};
window.startPickerForWaypoint = startPickerForWaypoint;
window.fitRouteOnMap = fitRouteOnMap;
window.shareRoute = shareRoute;
window.addGpsAsWaypoint = addGpsAsWaypoint;

// ── GOOGLE ANALYTICS — řízeno sdíleným souhlasem hlavního webu ──
// Hlavní web (assets/app.js) drží souhlas v cookie/localStorage "naskraj_cookies"
// (analytics: true/false). Mapa už nemá vlastní banner — jen se podle něj řídí.
const GA_MEASUREMENT_ID = 'G-T6B90K0TH7';
function _loadAnalytics() {
  if (document.getElementById('ga-script')) return;
  const sc = document.createElement('script');
  sc.id = 'ga-script';
  sc.async = true;
  sc.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(sc);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID);
}
window._reopenCookieConsent = () => {
  if (typeof openCookieSettings === 'function') openCookieSettings();
};
function _initCookieConsent() {
  try {
    const c = (typeof getCookieConsentShared === 'function') ? getCookieConsentShared() : null;
    if (c && c.analytics) _loadAnalytics();
  } catch (e) {}
}

// ── EXPORT AKTUÁLNÍHO POHLEDU DO PDF ────────────────────────────
// Používá canvas mapy (preserveDrawingBuffer:true) + jsPDF. Podle licence
// ODbL (OpenStreetMap data) a podmínek OpenFreeMap je export/tisk pro
// osobní/nekomerční použití v pořádku, POKUD zůstane viditelná atribuce —
// proto je natrvalo součástí vygenerovaného PDF.
function _approxMapScale() {
  const zoom = map.getZoom();
  const lat = map.getCenter().lat;
  const metersPerPixel = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
  const scaleDenominator = Math.round(metersPerPixel / 0.00028); // 0.28 mm/px dle OGC konvence
  return scaleDenominator;
}
window._exportMapToPdf = async () => {
  if (typeof window.jspdf === 'undefined') { alert('Knihovna pro export PDF se nenačetla. Zkontrolujte připojení a zkuste to znovu.'); return; }
  // Dočasně zapnout preserveDrawingBuffer pro capture
  try { map.getCanvas().getContext('webgl2', { preserveDrawingBuffer: true }); } catch {}
  try {
    const canvas = map.getCanvas();
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const isLandscape = canvas.width >= canvas.height;
    const pdf = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const titleH = 12;
    const footerH = 10;
    const availW = pageW - margin * 2;
    const availH = pageH - margin * 2 - titleH - footerH;
    const imgRatio = canvas.width / canvas.height;
    let drawW = availW, drawH = availW / imgRatio;
    if (drawH > availH) { drawH = availH; drawW = availH * imgRatio; }
    const x = (pageW - drawW) / 2;
    const y = margin + titleH;

    pdf.setFontSize(14);
    pdf.setFont(undefined, 'bold');
    pdf.text('Vandro — mapa', margin, margin + 6);
    pdf.setFont(undefined, 'normal');
    pdf.setFontSize(9);
    const dateStr = new Date().toLocaleDateString('cs-CZ');
    const ctr = map.getCenter();
    pdf.text(`${dateStr} · ${ctr.lat.toFixed(4)}, ${ctr.lng.toFixed(4)} · přibližné měřítko 1:${_approxMapScale().toLocaleString('cs-CZ')}`, margin, margin + 11);

    pdf.addImage(imgData, 'PNG', x, y, drawW, drawH);
    pdf.setDrawColor(200);
    pdf.rect(x, y, drawW, drawH);

    pdf.setFontSize(7.5);
    pdf.setTextColor(120);
    pdf.text('© OpenStreetMap přispěvatelé (ODbL) · Mapová data: OpenFreeMap · vandro.cz — jen pro osobní použití, nekopírujte pro komerční účely.', margin, pageH - margin + 2);

    pdf.save(`vandro-mapa-${new Date().toISOString().slice(0,10)}.pdf`);
  } catch (e) {
    console.error('Export do PDF selhal:', e);
    alert('Export do PDF se nepovedl. Zkuste to prosím znovu.');
  }
};

// ── VLASTNÍ BODY A TRASY ZE SOUBORU ──────────────────────────────
// Uložené v localStorage tohoto prohlížeče — zůstávají, dokud je uživatel
// sám neodstraní (tlačítkem u položky, nebo "Vymazat vše"). Nejde o
// synchronizaci mezi zařízeními ani cloud úložiště, jen tento prohlížeč.
const TEMP_LAYER_KEY = 'vandro_custom_layer';
function _tempLayerLoad() {
  try { return JSON.parse(localStorage.getItem(TEMP_LAYER_KEY) || '[]'); } catch { return []; }
}
function _tempLayerPersist() {
  try { localStorage.setItem(TEMP_LAYER_KEY, JSON.stringify(_tempLayerItems)); } catch (e) { console.warn('Uložení vlastní vrstvy selhalo:', e); }
}
let _tempLayerItems = _tempLayerLoad();

// Body vykresľujeme ako natívne maplibregl.Marker DOM elementy — tie sa
// zobrazujú úplne nezávisle od poradia GL vrstiev (nie sú súčasťou WebGL
// vykresľovania mapy vôbec, sú to obyčajné HTML elementy nad canvasom),
// takže ich nemôže prekryť žiadna iná vrstva. Trasy zostávajú ako
// jednoduchá GeoJSON vrstva (len pre LineString, žiadny filter).
let _tempMarkers = [];
function _refreshTempLayer() {
  _tempMarkers.forEach(m => { try { m.remove(); } catch {} });
  _tempMarkers = [];

  const lineFeatures = [];
  _tempLayerItems.forEach(it => {
    if (it.type === 'point') {
      const el = document.createElement('div');
      el.className = 'temp-marker-dot';
      el.style.background = it.color;
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(it.coords[0])
        .setPopup(new maplibregl.Popup({ offset: 14, maxWidth: '260px' }).setHTML(`<div class="temp-marker-popup">${escapeHtml(it.label)}</div>`))
        .addTo(map);
      _tempMarkers.push(marker);
    } else {
      lineFeatures.push({
        type: 'Feature',
        properties: { id: it.id, label: it.label, color: it.color },
        geometry: { type: 'LineString', coordinates: it.coords },
      });
    }
  });

  const lineData = { type: 'FeatureCollection', features: lineFeatures };
  if (map.getSource('temp-layer-lines-src')) {
    map.getSource('temp-layer-lines-src').setData(lineData);
  } else {
    map.addSource('temp-layer-lines-src', { type: 'geojson', data: lineData });
    map.addLayer({ id: 'temp-layer-lines', type: 'line', source: 'temp-layer-lines-src',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-width': 4, 'line-color': ['get', 'color'], 'line-opacity': 0.85 } });
    map.on('click', 'temp-layer-lines', (e) => {
      const label = e.features?.[0]?.properties?.label || 'Vlastní trasa';
      new maplibregl.Popup({ closeButton: true, closeOnClick: true })
        .setLngLat(e.lngLat).setHTML(`<div class="temp-marker-popup">${escapeHtml(label)}</div>`).addTo(map);
    });
    map.on('mouseenter', 'temp-layer-lines', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'temp-layer-lines', () => { map.getCanvas().style.cursor = ''; });
  }
}
function _tempFitToItems() {
  if (!_tempLayerItems.length) return;
  const bounds = new maplibregl.LngLatBounds();
  _tempLayerItems.forEach(it => it.coords.forEach(c => bounds.extend(c)));
  map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
}

// ── Parsery súborov (GPX/KML cez vstavaný DOMParser, žiadna externá závislosť) ──
function _parseGPX(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Neplatný GPX soubor.');
  const features = [];
  doc.querySelectorAll('wpt').forEach(wpt => {
    const lat = parseFloat(wpt.getAttribute('lat')), lon = parseFloat(wpt.getAttribute('lon'));
    if (isNaN(lat) || isNaN(lon)) return;
    const name = wpt.querySelector('name')?.textContent?.trim() || 'Bod';
    features.push({ label: name, geometry: { type: 'Point', coordinates: [lon, lat] } });
  });
  doc.querySelectorAll('trk').forEach(trk => {
    const name = trk.querySelector('name')?.textContent?.trim() || 'Trasa';
    trk.querySelectorAll('trkseg').forEach(seg => {
      const coords = Array.from(seg.querySelectorAll('trkpt')).map(pt => [parseFloat(pt.getAttribute('lon')), parseFloat(pt.getAttribute('lat'))]).filter(c => !isNaN(c[0]) && !isNaN(c[1]));
      if (coords.length >= 2) features.push({ label: name, geometry: { type: 'LineString', coordinates: coords } });
    });
  });
  doc.querySelectorAll('rte').forEach(rte => {
    const name = rte.querySelector('name')?.textContent?.trim() || 'Trasa';
    const coords = Array.from(rte.querySelectorAll('rtept')).map(pt => [parseFloat(pt.getAttribute('lon')), parseFloat(pt.getAttribute('lat'))]).filter(c => !isNaN(c[0]) && !isNaN(c[1]));
    if (coords.length >= 2) features.push({ label: name, geometry: { type: 'LineString', coordinates: coords } });
  });
  return features;
}
function _parseKML(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Neplatný KML soubor.');
  const features = [];
  doc.querySelectorAll('Placemark').forEach(pm => {
    const name = pm.querySelector('name')?.textContent?.trim() || 'Bod';
    const pointCoords = pm.querySelector('Point > coordinates')?.textContent?.trim();
    if (pointCoords) {
      const [lon, lat] = pointCoords.split(',').map(Number);
      if (!isNaN(lat) && !isNaN(lon)) features.push({ label: name, geometry: { type: 'Point', coordinates: [lon, lat] } });
    }
    const lineCoords = pm.querySelector('LineString > coordinates')?.textContent?.trim();
    if (lineCoords) {
      const coords = lineCoords.split(/\s+/).map(pair => pair.split(',').slice(0, 2).map(Number)).filter(c => !isNaN(c[0]) && !isNaN(c[1]));
      if (coords.length >= 2) features.push({ label: name, geometry: { type: 'LineString', coordinates: coords } });
    }
  });
  return features;
}
function _parseGeoJSONFile(text) {
  const data = JSON.parse(text);
  const raw = data.type === 'FeatureCollection' ? (data.features || []) : data.type === 'Feature' ? [data] : [];
  return raw
    .filter(f => f.geometry && (f.geometry.type === 'Point' || f.geometry.type === 'LineString'))
    .map(f => ({ label: f.properties?.name || f.properties?.label || (f.geometry.type === 'Point' ? 'Bod' : 'Trasa'), geometry: f.geometry }));
}

window._tempHandleFileUpload = async (inputEl) => {
  const file = inputEl.files[0];
  if (!file) return;
  const nameLower = file.name.toLowerCase();
  let features = [];
  try {
    const text = await file.text();
    if (nameLower.endsWith('.gpx')) features = _parseGPX(text);
    else if (nameLower.endsWith('.kml')) features = _parseKML(text);
    else if (nameLower.endsWith('.geojson') || nameLower.endsWith('.json')) features = _parseGeoJSONFile(text);
    else { alert('Nepodporovaný typ souboru. Podporujeme GPX, KML a GeoJSON.'); return; }
  } catch (e) {
    console.error('Import souboru selhal:', e);
    alert('Soubor se nepodařilo přečíst — zkontrolujte, že jde o platný GPX/KML/GeoJSON.');
    inputEl.value = '';
    return;
  }
  if (!features.length) { alert('V souboru se nenašly žádné podporované body ani trasy.'); inputEl.value = ''; return; }
  features.forEach((f, i) => {
    _tempLayerItems.push({
      id: 'tmp_' + Date.now() + '_' + i,
      type: f.geometry.type === 'Point' ? 'point' : 'track',
      coords: f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates,
      label: f.label,
      color: f.geometry.type === 'Point' ? '#e53935' : '#2b8a3e',
    });
  });
  _refreshTempLayer();
  _tempLayerPersist();
  _tempFitToItems();
  inputEl.value = '';
  openDrawingPanel();
};

window._tempFlyToItem = (id) => {
  const it = _tempLayerItems.find(x => x.id === id);
  if (!it) return;
  if (it.type === 'point') {
    map.flyTo({ center: it.coords[0], zoom: Math.max(map.getZoom(), 14), speed: 1.4 });
  } else {
    const bounds = new maplibregl.LngLatBounds();
    it.coords.forEach(c => bounds.extend(c));
    map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
  }
  closeAllPanels(); closeMobilePanels();
};
window._tempRemoveItem = (id) => {
  _tempLayerItems = _tempLayerItems.filter(it => it.id !== id);
  _refreshTempLayer();
  _tempLayerPersist();
  openDrawingPanel();
};
window._tempClearAll = () => {
  if (!confirm('Smazat všechny nahrané body a trasy z mapy?')) return;
  _tempLayerItems = [];
  _refreshTempLayer();
  _tempLayerPersist();
  openDrawingPanel();
};

function _renderDrawPanel() {
  const rows = _tempLayerItems.map(it => `
    <div class="temp-item-row" onclick="window._tempFlyToItem('${it.id}')" style="cursor:pointer">
      <span class="temp-item-swatch" style="background:${it.color}"></span>
      <span class="temp-item-label">${escapeHtml(it.label)} <small>(${it.type === 'point' ? 'bod' : 'trasa'})</small></span>
      <button class="offline-btn offline-btn-delete" onclick="event.stopPropagation();window._tempRemoveItem('${it.id}')"><i class="fa-solid fa-trash"></i></button>
    </div>`).join('');
  return `<p class="offline-intro">Nahrajte soubor GPX, KML nebo GeoJSON s vlastními body/trasami. Zůstanou uložené v tomto prohlížeči, dokud je sami neodstraníte (tlačítkem u položky nebo „Vymazat vše") — nejde o cloudové úložiště ani sdílení mezi zařízeními.</p>
    <label class="offline-btn offline-btn-download" style="justify-content:center;cursor:pointer;width:100%">
      <i class="fa-solid fa-file-arrow-up"></i> Nahrát soubor (GPX/KML/GeoJSON)
      <input type="file" accept=".gpx,.kml,.geojson,.json" style="display:none" onchange="window._tempHandleFileUpload(this)">
    </label>
    ${rows || '<p style="color:#aaa;font-size:13px;text-align:center;padding:20px 0">Zatím nic nenahráno.</p>'}
    ${_tempLayerItems.length ? `<button class="offline-btn offline-btn-delete" style="width:100%;justify-content:center;margin-top:10px" onclick="window._tempClearAll()"><i class="fa-solid fa-trash"></i> Vymazat vše</button>` : ''}`;
}
function openDrawingPanel() {
  const isMobile = window.innerWidth <= 768;
  const titleStr = `<i class="fa-solid fa-file-arrow-up" style="color:var(--primary);margin-right:8px"></i>Vlastní body a trasy`;
  const content = _renderDrawPanel();
  if (isMobile) openMobileSheet(titleStr, null, content, true);
  else openSidebar(`<div class="sidebar-header"><h3>${titleStr}</h3><div class="sidebar-header-actions">${_vandroBackArrowHtml()}<button class="btn-close" onclick="closeDesktopPanels()"><i class="fa-solid fa-xmark"></i></button></div></div><div class="panel-content">${content}</div>`);
}

// ── OFFLINE MAPY ────────────────────────────────────────────────
// Používateľ si vyberie jedno z preddefinovaných území (národné parky a
// pod.) a appka pre neho predstiahne mapové dlaždice (vektorové z
// OpenFreeMap), fonty a sprite do Cache Storage. Service worker (sw.js)
// potom tieto zdroje servíruje cache-first, takže fungujú aj bez signálu.
// Vlastné VANDRO body sa cachujú samostatne (viď loadGoogleSheetData) cez
// localStorage, takže sú dostupné offline vždy, nielen v stiahnutom území.
//
// POZNÁMKA: hranice krajov nižšie sú orientačné odhady (obdĺžnikové bounding
// boxy, nie presné hranice) — over si ich prosím a uprav podľa potreby.
// zoomMax=13 je zámerne nižší než pri malom území, aby stiahnutie celého
// kraja zostalo v rozumnej veľkosti (rádovo desiatky-nižšie stovky MB
// namiesto niekoľkých GB pri vyššom zoome).
const OFFLINE_REGIONS = [
  // ── Slovensko — kraje ──
  { id: 'sk-ba', name: 'Bratislavský kraj',    bounds: [16.83, 47.99, 17.58, 48.50], zoomMax: 13 },
  { id: 'sk-tt', name: 'Trnavský kraj',         bounds: [17.05, 47.98, 18.35, 48.90], zoomMax: 13 },
  { id: 'sk-tn', name: 'Trenčiansky kraj',      bounds: [17.55, 48.55, 18.90, 49.35], zoomMax: 13 },
  { id: 'sk-nr', name: 'Nitriansky kraj',       bounds: [17.50, 47.75, 18.90, 48.65], zoomMax: 13 },
  { id: 'sk-za', name: 'Žilinský kraj',         bounds: [18.35, 48.90, 19.75, 49.60], zoomMax: 13 },
  { id: 'sk-bb', name: 'Banskobystrický kraj',  bounds: [18.60, 47.98, 20.30, 49.00], zoomMax: 13 },
  { id: 'sk-po', name: 'Prešovský kraj',        bounds: [20.20, 48.70, 22.55, 49.65], zoomMax: 13 },
  { id: 'sk-ke', name: 'Košický kraj',          bounds: [20.35, 48.30, 22.55, 49.10], zoomMax: 13 },
  // ── Česko — kraje ──
  { id: 'cz-pha', name: 'Hlavní město Praha',   bounds: [14.22, 49.94, 14.71, 50.18], zoomMax: 13 },
  { id: 'cz-stc', name: 'Středočeský kraj',     bounds: [13.75, 49.40, 15.85, 50.60], zoomMax: 13 },
  { id: 'cz-jhc', name: 'Jihočeský kraj',       bounds: [13.60, 48.55, 15.45, 49.55], zoomMax: 13 },
  { id: 'cz-plz', name: 'Plzeňský kraj',        bounds: [12.45, 49.10, 13.85, 50.10], zoomMax: 13 },
  { id: 'cz-kvk', name: 'Karlovarský kraj',     bounds: [12.10, 49.90, 13.35, 50.50], zoomMax: 13 },
  { id: 'cz-ulk', name: 'Ústecký kraj',         bounds: [13.10, 50.20, 14.75, 50.95], zoomMax: 13 },
  { id: 'cz-lbk', name: 'Liberecký kraj',       bounds: [14.45, 50.55, 15.45, 50.95], zoomMax: 13 },
  { id: 'cz-hkk', name: 'Královéhradecký kraj', bounds: [15.30, 50.05, 16.60, 50.70], zoomMax: 13 },
  { id: 'cz-pak', name: 'Pardubický kraj',      bounds: [15.55, 49.55, 16.90, 50.15], zoomMax: 13 },
  { id: 'cz-vys', name: 'Kraj Vysočina',        bounds: [14.95, 49.05, 16.10, 49.80], zoomMax: 13 },
  { id: 'cz-jhm', name: 'Jihomoravský kraj',    bounds: [16.10, 48.60, 17.20, 49.55], zoomMax: 13 },
  { id: 'cz-olk', name: 'Olomoucký kraj',       bounds: [16.60, 49.35, 17.85, 50.20], zoomMax: 13 },
  { id: 'cz-zlk', name: 'Zlínský kraj',         bounds: [17.30, 48.90, 18.35, 49.55], zoomMax: 13 },
  { id: 'cz-msk', name: 'Moravskoslezský kraj', bounds: [17.35, 49.45, 18.85, 50.10], zoomMax: 13 },
];
const OFFLINE_ZMIN = 8; // nižší zoom (celkový prehľad) je spoločný pre všetky oblasti

// Zvyšok sveta — používateľ si stiahne aktuálny výřez mapy namiesto výberu
// z preddefinovaného zoznamu. Aby si nikto omylom nestiahol polovicu
// kontinentu, je tu tvrdý strop na počet dlaždíc (~ rádovo do 150-200 MB).
const CUSTOM_AREA_MAX_TILES = 4000;
const CUSTOM_AREA_ZOOM_MAX = 14;

function _offlineRegionsStore() {
  try { return JSON.parse(localStorage.getItem('vandro_offline_regions') || '{}'); }
  catch { return {}; }
}
function _saveOfflineRegionsStore(d) {
  try { localStorage.setItem('vandro_offline_regions', JSON.stringify(d)); } catch {}
}

function _lngLatToTileXY(lng, lat, z) {
  const n = Math.pow(2, z);
  const x = Math.floor((lng + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}
function _tilesForBounds(bounds, zMin, zMax) {
  const [w, s, e, n] = bounds;
  const tiles = [];
  for (let z = zMin; z <= zMax; z++) {
    const min = _lngLatToTileXY(w, n, z);
    const max = _lngLatToTileXY(e, s, z);
    for (let x = min.x; x <= max.x; x++) for (let y = min.y; y <= max.y; y++) tiles.push({ z, x, y });
  }
  return tiles;
}
// Zistí SKUTOČNÚ šablónu URL dlaždíc z aktuálne načítaného štýlu mapy
// (namiesto natvrdo zapísanej adresy) — MapLibre si ju sám vyžiada z
// TileJSON (`https://tiles.openfreemap.org/planet`) a sprístupní ju cez
// zdroj po načítaní štýlu.
function _getVectorTileTemplate() {
  try {
    const style = map.getStyle();
    for (const key in (style.sources || {})) {
      if (style.sources[key].type !== 'vector') continue;
      const live = map.getSource(key);
      if (live && live.tiles && live.tiles.length) return live.tiles[0];
    }
  } catch {}
  return null;
}
const OFFLINE_FONTSTACKS = ['Noto Sans Regular', 'Noto Sans Bold', 'Noto Sans Italic'];
const OFFLINE_FONT_RANGES = ['0-255', '256-511']; // pokrýva aj českú/slovenskú diakritiku
async function _cacheGlyphsAndSprite(cache) {
  const urls = [];
  OFFLINE_FONTSTACKS.forEach(fs => OFFLINE_FONT_RANGES.forEach(r => {
    urls.push(`https://tiles.openfreemap.org/fonts/${encodeURIComponent(fs)}/${r}.pbf`);
  }));
  const spriteBase = 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm';
  ['.json', '.png', '@2x.json', '@2x.png'].forEach(suf => urls.push(spriteBase + suf));
  await Promise.all(urls.map(async u => {
    try { if (!(await cache.match(u))) { const r = await fetch(u); if (r.ok) await cache.put(u, r.clone()); } } catch {}
  }));
}

// Stiahne a uloží všetky dlaždice pre dané územie. onProgress(done,total)
// sa volá priebežne pre progress bar.
let _offlineDownloadAbort = null;
async function downloadOfflineRegion(region, onProgress) {
  const tpl = _getVectorTileTemplate();
  if (!tpl) throw new Error('Nepodařilo se zjistit adresu dlaždic — zkuste to znovu, až se mapa plně načte.');
  const tiles = _tilesForBounds(region.bounds, OFFLINE_ZMIN, region.zoomMax);
  const cache = await caches.open('vandro-tiles-v1');
  let done = 0, failed = 0;
  const aborter = { cancelled: false };
  _offlineDownloadAbort = aborter;
  const queue = tiles.slice();
  const CONCURRENCY = 6;
  async function worker() {
    while (queue.length && !aborter.cancelled) {
      const t = queue.shift();
      const url = tpl.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y);
      try {
        if (!(await cache.match(url))) {
          const resp = await fetch(url);
          if (resp && resp.ok) await cache.put(url, resp.clone());
          else failed++;
        }
      } catch { failed++; }
      done++;
      if (onProgress) onProgress(done, tiles.length);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (aborter.cancelled) return { cancelled: true };
  await _cacheGlyphsAndSprite(cache);
  const store = _offlineRegionsStore();
  store[region.id] = { downloadedAt: Date.now(), tileCount: tiles.length, failed, name: region.name, bounds: region.bounds, zoomMax: region.zoomMax };
  _saveOfflineRegionsStore(store);
  return { cancelled: false, tileCount: tiles.length, failed };
}

// Vymaže dlaždice patriace danému územiu. Keďže viacero území môže zdieľať
// tie isté dlaždice (prekryv hraníc), pred zmazaním konkrétnej dlaždice
// overíme, či ju nepotrebuje iné STÁLE stiahnuté územie.
async function deleteOfflineRegion(regionId) {
  const store = _offlineRegionsStore();
  const savedEntry = store[regionId];
  const predefined = OFFLINE_REGIONS.find(r => r.id === regionId);
  const region = predefined || (savedEntry ? { bounds: savedEntry.bounds, zoomMax: savedEntry.zoomMax } : null);
  if (!region) return;
  delete store[regionId];
  const stillNeeded = new Set();
  // Zisti, ktoré dlaždice ešte potrebuje NIEKTORÉ INÉ stále stiahnuté územie
  // (predvolené kraje aj vlastné oblasti), nech ich pri prekryve nezmažeme.
  Object.keys(store).forEach(id => {
    const entry = store[id];
    const bounds = entry.bounds || OFFLINE_REGIONS.find(r => r.id === id)?.bounds;
    const zoomMax = entry.zoomMax || OFFLINE_REGIONS.find(r => r.id === id)?.zoomMax;
    if (bounds && zoomMax) _tilesForBounds(bounds, OFFLINE_ZMIN, zoomMax).forEach(t => stillNeeded.add(`${t.z}/${t.x}/${t.y}`));
  });
  const tpl = _getVectorTileTemplate();
  const cache = await caches.open('vandro-tiles-v1');
  if (tpl) {
    const toDelete = _tilesForBounds(region.bounds, OFFLINE_ZMIN, region.zoomMax)
      .filter(t => !stillNeeded.has(`${t.z}/${t.x}/${t.y}`));
    await Promise.all(toDelete.map(t => cache.delete(tpl.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y))));
  }
  _saveOfflineRegionsStore(store);
}

function _renderOfflinePanel() {
  const store = _offlineRegionsStore();
  const rows = OFFLINE_REGIONS.map(r => {
    const saved = store[r.id];
    const sizeApprox = saved ? `${saved.tileCount} dlaždic` : '';
    return `<div class="offline-region-row" data-region="${r.id}">
      <div class="offline-region-info">
        <div class="offline-region-name">${r.name}</div>
        <div class="offline-region-status">${saved ? `<i class="fa-solid fa-circle-check" style="color:#2b8a3e"></i> Staženo — ${sizeApprox}` : 'Není staženo'}</div>
      </div>
      <div class="offline-region-actions">
        ${saved
          ? `<button class="offline-btn offline-btn-delete" onclick="window._offlineDeleteRegion('${r.id}')"><i class="fa-solid fa-trash"></i></button>`
          : `<button class="offline-btn offline-btn-download" onclick="window._offlineStartDownload('${r.id}')"><i class="fa-solid fa-download"></i> Stáhnout</button>`}
      </div>
      <div class="offline-region-progress hidden" id="offline-progress-${r.id}">
        <div class="offline-progress-bar"><div class="offline-progress-fill" style="width:0%"></div></div>
        <span class="offline-progress-label">0 %</span>
      </div>
    </div>`;
  }).join('');

  // Vlastné (mimo SK/ČR) oblasti — uložené priamo v store s vlastnými
  // súradnicami/menom, nepotrebujú záznam v OFFLINE_REGIONS.
  const customIds = Object.keys(store).filter(id => id.startsWith('custom_'));
  const customRows = customIds.map(id => {
    const saved = store[id];
    return `<div class="offline-region-row" data-region="${id}">
      <div class="offline-region-info">
        <div class="offline-region-name">${saved.name || 'Vlastní oblast'}</div>
        <div class="offline-region-status"><i class="fa-solid fa-circle-check" style="color:#2b8a3e"></i> Staženo — ${saved.tileCount} dlaždic</div>
      </div>
      <div class="offline-region-actions">
        <button class="offline-btn offline-btn-delete" onclick="window._offlineDeleteRegion('${id}')"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');

  return `<p class="offline-intro">Stáhněte si mapu vybrané oblasti pro použití bez internetu. Fungovat pak budou: základní mapa, vlastní VANDRO místa a záložky. Vyhledávání adres, plánování trasy, počasí a další online funkce vyžadují připojení, i s staženou mapou.</p>
    <p class="section-title">Slovensko a Česko — kraje</p>
    ${rows}
    <p class="section-title">Zbytek světa</p>
    <div class="offline-region-row" data-region="__custom__">
      <div class="offline-region-info">
        <div class="offline-region-name">Aktuální výřez mapy</div>
        <div class="offline-region-status">Přibližte/oddalte a posuňte mapu na oblast, kterou chcete stáhnout (max. ${CUSTOM_AREA_MAX_TILES} dlaždic)</div>
      </div>
      <div class="offline-region-actions">
        <button class="offline-btn offline-btn-download" onclick="window._offlineStartCustomDownload()"><i class="fa-solid fa-download"></i> Stáhnout výřez</button>
      </div>
      <div class="offline-region-progress hidden" id="offline-progress-__custom__">
        <div class="offline-progress-bar"><div class="offline-progress-fill" style="width:0%"></div></div>
        <span class="offline-progress-label">0 %</span>
      </div>
    </div>
    ${customRows}`;
}

window._offlineStartDownload = async (regionId) => {
  const region = OFFLINE_REGIONS.find(r => r.id === regionId);
  if (!region) return;
  await _offlineRunDownload(region);
};

window._offlineStartCustomDownload = async () => {
  const b = map.getBounds();
  const bounds = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  const tileCountEstimate = _tilesForBounds(bounds, OFFLINE_ZMIN, CUSTOM_AREA_ZOOM_MAX).length;
  if (tileCountEstimate > CUSTOM_AREA_MAX_TILES) {
    alert(`Vybraný výřez je moc velký (${tileCountEstimate} dlaždic, limit je ${CUSTOM_AREA_MAX_TILES}). Přibližte mapu (vyšší zoom = menší oblast) a zkuste to znovu.`);
    return;
  }
  const region = { id: 'custom_' + Date.now(), name: `Vlastní oblast (${b.getCenter().lat.toFixed(2)}, ${b.getCenter().lng.toFixed(2)})`, bounds, zoomMax: CUSTOM_AREA_ZOOM_MAX };
  await _offlineRunDownload(region, '__custom__');
};

async function _offlineRunDownload(region, rowKey) {
  const regionId = rowKey || region.id;
  const row = document.querySelector(`.offline-region-row[data-region="${regionId}"]`);
  const progressWrap = document.getElementById(`offline-progress-${regionId}`);
  const btnWrap = row?.querySelector('.offline-region-actions');
  if (btnWrap) btnWrap.innerHTML = `<button class="offline-btn offline-btn-cancel" onclick="window._offlineCancelDownload()"><i class="fa-solid fa-xmark"></i> Zrušit</button>`;
  if (progressWrap) progressWrap.classList.remove('hidden');
  try {
    const result = await downloadOfflineRegion(region, (done, total) => {
      if (!progressWrap) return;
      const pct = Math.round((done / total) * 100);
      const fill = progressWrap.querySelector('.offline-progress-fill');
      const label = progressWrap.querySelector('.offline-progress-label');
      if (fill) fill.style.width = pct + '%';
      if (label) label.textContent = `${pct} % (${done}/${total})`;
    });
    openOfflinePanel();
    return result;
  } catch (e) {
    alert('Stažení se nepovedlo: ' + (e?.message || e));
    console.error('downloadOfflineRegion:', e);
    openOfflinePanel();
  }
}

window._offlineCancelDownload = () => {
  if (_offlineDownloadAbort) _offlineDownloadAbort.cancelled = true;
  openOfflinePanel();
};
window._offlineDeleteRegion = async (regionId) => {
  if (!confirm('Smazat staženou mapu tohoto území?')) return;
  await deleteOfflineRegion(regionId);
  openOfflinePanel();
};

function openOfflinePanel() {
  const isMobile = window.innerWidth <= 768;
  const titleStr = `<i class="fa-solid fa-cloud-arrow-down" style="color:var(--primary);margin-right:8px"></i>Offline mapy`;
  const content = _renderOfflinePanel();
  if (isMobile) openMobileSheet(titleStr, null, content, true);
  else openSidebar(`<div class="sidebar-header"><h3>${titleStr}</h3><div class="sidebar-header-actions">${_vandroBackArrowHtml()}<button class="btn-close" onclick="closeDesktopPanels()"><i class="fa-solid fa-xmark"></i></button></div></div><div class="panel-content">${content}</div>`);
}

// ── Detekcia offline stavu ──────────────────────────────────────
// Skryje/zablokuje ovládacie prvky, ktoré bez pripojenia stejně nefungujú
// (vyhľadávanie adries, trasa, počasí), a zobrazí banner s upozornením.
const _OFFLINE_DISABLE_IDS = ['btn-route-desktop', 'btn-route-mobile'];
function _setOfflineDisabled(disabled) {
  _OFFLINE_DISABLE_IDS.forEach(id => {
    const el = $(id);
    if (!el) return;
    el.classList.toggle('is-offline-disabled', disabled);
    el.title = disabled ? 'Vyžaduje připojení k internetu' : '';
  });
}
// Offline funguje spoľahlivo len základná (liberty) mapa — turistická,
// zimní a satelitná varianta potrebujú ďalšie zdroje (vrstevnice,
// OpenSnowMap, ESRI satelit), ktoré appka needow necachuje.
function _updateBasemapOfflineState() {
  const offline = !navigator.onLine;
  document.querySelectorAll('.basemap-switch-btn').forEach(btn => {
    const isLiberty = btn.dataset.layer === 'liberty';
    btn.classList.toggle('is-offline-disabled', offline && !isLiberty);
    btn.title = (offline && !isLiberty) ? 'Vyžaduje připojení k internetu' : '';
  });
}
function _forceOfflineBasemapSwitch() {
  if (navigator.onLine) return;
  if (currentBaseLayer !== 'liberty') changeBasemap('liberty');
}
// Keď sa appka vráti online, dlaždice sa niekedy nenačítajú znova samy —
// vynútime si čerstvé znovunačítanie aktuálneho štýlu mapy.
function _forceReloadBasemap() {
  try {
    showLoader();
    const styleRef = STYLES[currentBaseLayer];
    const styleArg = typeof styleRef === 'string' ? `${styleRef}?v=${Date.now()}` : styleRef;
    map.setStyle(styleArg);
  } catch (e) { console.warn('_forceReloadBasemap zlyhalo:', e); }
}
let _wasOffline = !navigator.onLine;

// ── Obnovenie po návrate z pozadia ──────────────────────────────
// Mobilné prehliadače/PWA po pár minútach na pozadí stránku "uspia" —
// WebGL kontext mapy sa môže stratiť alebo rozbehnuté sieťové požiadavky
// na dlaždice zamrznú, a po návrate zostane mapa prázdna/neúplná. Keď sa
// stránka opäť stane viditeľnou po dlhšej dobe na pozadí, vynútime si
// resize + čerstvé znovunačítanie štýlu (rovnaký mechanizmus ako pri
// návrate online vyššie).
let _hiddenSince = null;
const VISIBILITY_RELOAD_THRESHOLD_MS = 60 * 1000; // 60 sekúnd na pozadí
function _initVisibilityRecovery() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      _hiddenSince = Date.now();
      return;
    }
    const hiddenForMs = _hiddenSince ? Date.now() - _hiddenSince : 0;
    _hiddenSince = null;
    if (!map) return;
    try { map.resize(); } catch {}
    if (hiddenForMs > VISIBILITY_RELOAD_THRESHOLD_MS) {
      _forceReloadBasemap();
    }
  });
  // Ak WebGL kontext appka fyzicky stratí (niektoré mobilné prehliadače
  // to robia agresívnejšie pri nedostatku pamäte), skús to isté.
  map.getCanvas().addEventListener('webglcontextlost', (e) => {
    console.warn('WebGL kontext mapy sa stratil — pokus o obnovenie.');
  });
  map.getCanvas().addEventListener('webglcontextrestored', () => {
    _forceReloadBasemap();
  });
}

function _updateOfflineUI() {
  const offline = !navigator.onLine;
  vmRoot().classList.toggle('is-offline', offline);
  _setOfflineDisabled(offline);
  _updateBasemapOfflineState();
  if (offline) {
    _forceOfflineBasemapSwitch();
  } else if (_wasOffline) {
    // Prechod offline → online — dlaždice sa niekedy nenačítajú samy, vynútime reload.
    _forceReloadBasemap();
  }
  _wasOffline = offline;
  let banner = document.getElementById('offline-banner');
  if (offline && !banner) {
    banner = document.createElement('div');
    banner.id = 'offline-banner';
    banner.className = 'offline-banner';
    banner.innerHTML = `<i class="fa-solid fa-wifi-slash"></i> Jste offline — dostupné jsou jen stažené mapy, vlastní místa a záložky.`;
    vmRoot().appendChild(banner);
  } else if (!offline && banner) {
    banner.remove();
  }
}
function _initOfflineFeature() {
  window.addEventListener('online', _updateOfflineUI);
  window.addEventListener('offline', _updateOfflineUI);
  _updateOfflineUI();
}

// ── ŠTART ─────────────────────────────────────────────────────
// Spouští assets/map.js poté, co vloží šablonu do #vmap-root a načte knihovny.
window.vmapInit = function () {
  // Každý krok běží samostatně — chyba v jednom (např. offline funkce) nesmí zastavit zbytek mapy
  const steps = [
    ['initMap', initMap], ['initDesktopButtons', initDesktopButtons], ['initMobileButtons', initMobileButtons],
    ['_initOfflineFeature', _initOfflineFeature], ['_initCookieConsent', _initCookieConsent],
    ['_initVisibilityRecovery', _initVisibilityRecovery],
    ['loadRouteFromHash', () => { if (location.hash.includes('#route=')) loadRouteFromHash(); }],
    ['vmLayersInit', () => { if (typeof vmLayersInit === 'function') vmLayersInit(); }],
    ['vmBmSync', () => { if (typeof window.vmBmSync === 'function') window.vmBmSync(true); }],
  ];
  steps.forEach(([name, fn]) => {
    try { fn(); }
    catch (e) {
      console.error('[vmap] krok "' + name + '" selhal:', e);
      (window.__vmapErrors = window.__vmapErrors || []).push(name + ': ' + (e && e.message));
    }
  });
};
