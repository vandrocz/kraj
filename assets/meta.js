const FALLBACK_REGIONS = {
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

const FALLBACK_TYPES = {
  organization: [
    { value: 'hrad', label: 'Hrad' },
    { value: 'zamek', label: 'Zámek' },
    { value: 'muzeum', label: 'Muzeum' },
    { value: 'lyzarske_stredisko', label: 'Lyžařské středisko' },
    { value: 'galerie', label: 'Galerie' },
    { value: 'zoo', label: 'ZOO' },
    { value: 'prirodni_pamatka', label: 'Přírodní památka' },
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
  ],
  restaurant: [
    { value: 'restaurace', label: 'Restaurace' },
    { value: 'kavarna', label: 'Kavárna' },
    { value: 'hospoda', label: 'Hospoda' },
    { value: 'pivovar', label: 'Pivovar' },
  ],
  cuisine: [
    { value: 'ceska', label: 'Česká' },
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
// OBCE — načítanie z API (cache v KV na 7 dní)
// ============================================================
const _citiesCache = {};
async function loadCitiesForDistrict(district) {
  if (!district) return [];
  if (_citiesCache[district]) return _citiesCache[district];
  try {
    const data = await apiGet(`/api/geo/cities?district=${encodeURIComponent(district)}`);
    _citiesCache[district] = data.cities || [];
    return _citiesCache[district];
  } catch (err) {
    console.warn('Obce sa nepodarilo načítať:', err.message);
    _citiesCache[district] = [];
    return [];
  }
}
