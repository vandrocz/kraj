// ============================================================
// Regióny ČR + SR (kraje → okresy)
// ============================================================

const CZ_FALLBACK_REGIONS = {
  'Hlavní město Praha': ['Praha'],
  'Středočeský kraj': ['Benešov', 'Beroun', 'Kladno', 'Kolín', 'Kutná Hora', 'Mělník', 'Mladá Boleslav', 'Nymburk', 'Praha-východ', 'Praha-západ', 'Příbram', 'Rakovník'],
  'Jihočeský kraj': ['České Budějovice', 'Český Krumlov', 'Jindřichův Hradec', 'Písek', 'Prachatice', 'Strakonice', 'Tábor'],
  'Plzeňský kraj': ['Domažlice', 'Klatovy', 'Plzeň-město', 'Plzeň-jih', 'Plzeň-sever', 'Rokycany', 'Tachov'],
  'Karlovarský kraj': ['Cheb', 'Karlovy Vary', 'Sokolov'],
  'Ústecký kraj': ['Děčín', 'Chomutov', 'Litoměřice', 'Louny', 'Most', 'Teplice', 'Ústí nad Labem'],
  'Liberecký kraj': ['Česká Lípa', 'Jablonec nad Nisou', 'Liberec', 'Semily'],
  'Královéhradecký kraj': ['Hradec Králové', 'Jičín', 'Náchod', 'Rychnov nad Kněžnou', 'Trutnov'],
  'Pardubický kraj': ['Chrudim', 'Pardubice', 'Svitavy', 'Ústí nad Orlicí'],
  'Kraj Vysočina': ['Havlíčkův Brod', 'Jihlava', 'Pelhřimov', 'Třebíč', 'Žďár nad Sázavou'],
  'Jihomoravský kraj': ['Blansko', 'Brno-město', 'Brno-venkov', 'Břeclav', 'Hodonín', 'Vyškov', 'Znojmo'],
  'Olomoucký kraj': ['Jeseník', 'Olomouc', 'Prostějov', 'Přerov', 'Šumperk'],
  'Zlínský kraj': ['Kroměříž', 'Uherské Hradiště', 'Vsetín', 'Zlín'],
  'Moravskoslezský kraj': ['Bruntál', 'Frýdek-Místek', 'Karviná', 'Nový Jičín', 'Opava', 'Ostrava-město'],
};

const SK_FALLBACK_REGIONS = {
  'Bratislavský kraj': ['Bratislava I', 'Bratislava II', 'Bratislava III', 'Bratislava IV', 'Bratislava V', 'Malacky', 'Pezinok', 'Senec'],
  'Trnavský kraj': ['Dunajská Streda', 'Galanta', 'Hlohovec', 'Piešťany', 'Senica', 'Skalica', 'Trnava'],
  'Trenčiansky kraj': ['Bánovce nad Bebravou', 'Ilava', 'Myjava', 'Nové Mesto nad Váhom', 'Partizánske', 'Považská Bystrica', 'Prievidza', 'Púchov', 'Trenčín'],
  'Nitriansky kraj': ['Komárno', 'Levice', 'Nitra', 'Nové Zámky', 'Šaľa', 'Topoľčany', 'Zlaté Moravce'],
  'Žilinský kraj': ['Bytča', 'Čadca', 'Dolný Kubín', 'Kysucké Nové Mesto', 'Liptovský Mikuláš', 'Martin', 'Námestovo', 'Ružomberok', 'Turčianske Teplice', 'Tvrdošín', 'Žilina'],
  'Banskobystrický kraj': ['Banská Bystrica', 'Banská Štiavnica', 'Brezno', 'Detva', 'Krupina', 'Lučenec', 'Poltár', 'Revúca', 'Rimavská Sobota', 'Veľký Krtíš', 'Zvolen', 'Žarnovica', 'Žiar nad Hronom'],
  'Prešovský kraj': ['Bardejov', 'Humenné', 'Kežmarok', 'Levoča', 'Medzilaborce', 'Poprad', 'Prešov', 'Sabinov', 'Snina', 'Stará Ľubovňa', 'Stropkov', 'Svidník', 'Vranov nad Topľou'],
  'Košický kraj': ['Gelnica', 'Košice I', 'Košice II', 'Košice III', 'Košice IV', 'Košice-okolie', 'Michalovce', 'Rožňava', 'Sobrance', 'Spišská Nová Ves', 'Trebišov'],
};

const CZ_REGION_SET = new Set(Object.keys(CZ_FALLBACK_REGIONS));
const SK_REGION_SET = new Set(Object.keys(SK_FALLBACK_REGIONS));

// Deterministicky zisti krajinu z kraja
function getCountryForRegion(region) {
  if (!region) return null;
  if (SK_REGION_SET.has(region)) return 'sk';
  if (CZ_REGION_SET.has(region)) return 'cz';
  return null;
}

const FALLBACK_REGIONS = { ...CZ_FALLBACK_REGIONS, ...SK_FALLBACK_REGIONS };

const FALLBACK_TYPES = {
  organization: [
    { value: 'hrad', label: 'Hrad' },
    { value: 'zamek', label: 'Zámek' },
    { value: 'muzeum', label: 'Muzeum' },
    { value: 'lyzarske_stredisko', label: 'Lyžařské středisko' },
    { value: 'galerie', label: 'Galerie' },
    { value: 'zoo', label: 'ZOO' },
    { value: 'prirodni_pamatka', label: 'Přírodní památka' },
    { value: 'rozhledna', label: 'Rozhledna' },
    { value: 'zricenina', label: 'Zřícenina' },
    { value: 'kostel', label: 'Kostel / klášter' },
    { value: 'technicka_pamatka', label: 'Technická památka' },
    { value: 'jine', label: 'Jiné' },
  ],
  accommodation: [
    { value: 'hotel', label: 'Hotel' },
    { value: 'penzion', label: 'Penzion' },
    { value: 'chata', label: 'Chata' },
    { value: 'chalupa', label: 'Chalupa' },
    { value: 'kemp', label: 'Kemp' },
    { value: 'apartman', label: 'Apartmán' },
    { value: 'glamping', label: 'Glamping' },
    { value: 'hostel', label: 'Hostel' },
    { value: 'ubytovna', label: 'Ubytovna' },
    { value: 'jine', label: 'Jiné' },
  ],
  restaurant: [
    { value: 'restaurace', label: 'Restaurace' },
    { value: 'kavarna', label: 'Kavárna' },
    { value: 'hospoda', label: 'Hospoda' },
    { value: 'pivovar', label: 'Pivovar' },
    { value: 'bistro', label: 'Bistro' },
    { value: 'cukrarna', label: 'Cukrárna' },
    { value: 'vinarna', label: 'Vinárna' },
    { value: 'food_truck', label: 'Food truck' },
    { value: 'jine', label: 'Jiné' },
  ],
  cuisine: [
    { value: 'ceska', label: 'Česká' },
    { value: 'slovenska', label: 'Slovenská' },
    { value: 'italska', label: 'Italská' },
    { value: 'asijska', label: 'Asijská' },
    { value: 'vegan', label: 'Veganská' },
    { value: 'jina', label: 'Jiná' },
  ],
};

let REGIONS = FALLBACK_REGIONS;
let TYPES = FALLBACK_TYPES;

async function loadMetaFromApi() {
  try {
    const [regionsRes, typesRes] = await Promise.all([
      apiGet('/api/meta/regions'),
      apiGet('/api/meta/types'),
    ]);
    if (regionsRes && regionsRes.regions) REGIONS = regionsRes.regions;
    if (typesRes) TYPES = typesRes;
  } catch (err) {
    console.warn('Číselníky sa nepodarilo natiahnuť z API, používam lokálny fallback:', err.message);
  }
}

// ============================================================
// Pomocné funkcie pre prácu s regiónmi
// ============================================================

function normalizeStr(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Nájde najbližší match kraja v REGIONS (diakritika-nezávislý).
 * @param {string} region - názov z geocodéru (napr. "Bratislavský kraj", "Bratislava Region")
 */
function matchRegion(region) {
  if (!region) return null;
  const norm = normalizeStr(region);
  // Presná zhoda
  for (const r of Object.keys(REGIONS)) {
    if (normalizeStr(r) === norm) return r;
  }
  // Čiastočná zhoda
  for (const r of Object.keys(REGIONS)) {
    const rNorm = normalizeStr(r);
    if (rNorm.includes(norm) || norm.includes(rNorm)) return r;
  }
  return null;
}

/**
 * Nájde najbližší match okresu v danom kraji.
 */
function matchDistrict(region, district) {
  if (!region || !district) return null;
  const list = REGIONS[region] || [];
  const norm = normalizeStr(district);
  for (const d of list) {
    if (normalizeStr(d) === norm) return d;
  }
  for (const d of list) {
    const dNorm = normalizeStr(d);
    if (dNorm.includes(norm) || norm.includes(dNorm)) return d;
  }
  return null;
}

// ============================================================
// OBCE — s cache, retry a fallbackom
// ============================================================
const _citiesCache = {};

async function loadCitiesForDistrict(district) {
  if (!district) return [];
  if (_citiesCache[district] && _citiesCache[district].length > 0) return _citiesCache[district];

  try {
    const lsKey = `cities_v2_${district}`;
    const cached = localStorage.getItem(lsKey);
    if (cached) {
      const arr = JSON.parse(cached);
      if (Array.isArray(arr) && arr.length > 0) {
        _citiesCache[district] = arr;
        return arr;
      }
    }
  } catch {}

  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = await apiGet(`/api/geo/cities?district=${encodeURIComponent(district)}`);
      if (data && Array.isArray(data.cities) && data.cities.length > 0) {
        _citiesCache[district] = data.cities;
        try { localStorage.setItem(`cities_v2_${district}`, JSON.stringify(data.cities)); } catch {}
        return data.cities;
      }
      break;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }

  if (lastErr) console.warn('Obce sa nepodarilo načítať:', lastErr.message);

  const fb = [district];
  _citiesCache[district] = fb;
  return fb;
}
