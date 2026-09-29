// Kraje a okresy ČR + SR + číselníky druhov podnikov.
// Zdieľané medzi Workerom (validácia) a front-endom (filtre).

export const CZ_REGIONS = {
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

export const SK_REGIONS = {
  'Bratislavský kraj': ['Bratislava I', 'Bratislava II', 'Bratislava III', 'Bratislava IV', 'Bratislava V', 'Malacky', 'Pezinok', 'Senec'],
  'Trnavský kraj': ['Dunajská Streda', 'Galanta', 'Hlohovec', 'Piešťany', 'Senica', 'Skalica', 'Trnava'],
  'Trenčiansky kraj': ['Bánovce nad Bebravou', 'Ilava', 'Myjava', 'Nové Mesto nad Váhom', 'Partizánske', 'Považská Bystrica', 'Prievidza', 'Púchov', 'Trenčín'],
  'Nitriansky kraj': ['Komárno', 'Levice', 'Nitra', 'Nové Zámky', 'Šaľa', 'Topoľčany', 'Zlaté Moravce'],
  'Žilinský kraj': ['Bytča', 'Čadca', 'Dolný Kubín', 'Kysucké Nové Mesto', 'Liptovský Mikuláš', 'Martin', 'Námestovo', 'Ružomberok', 'Turčianske Teplice', 'Tvrdošín', 'Žilina'],
  'Banskobystrický kraj': ['Banská Bystrica', 'Banská Štiavnica', 'Brezno', 'Detva', 'Krupina', 'Lučenec', 'Poltár', 'Revúca', 'Rimavská Sobota', 'Veľký Krtíš', 'Zvolen', 'Žarnovica', 'Žiar nad Hronom'],
  'Prešovský kraj': ['Bardejov', 'Humenné', 'Kežmarok', 'Levoča', 'Medzilaborce', 'Poprad', 'Prešov', 'Sabinov', 'Snina', 'Stará Ľubovňa', 'Stropkov', 'Svidník', 'Vranov nad Topľou'],
  'Košický kraj': ['Gelnica', 'Košice I', 'Košice II', 'Košice III', 'Košice IV', 'Košice-okolie', 'Michalovce', 'Rožňava', 'Sobrance', 'Spišská Nová Ves', 'Trebišov'],
};

// Spojená mapa (front-end očakáva jednu mapu kraj → okresy)
export const REGIONS = { ...CZ_REGIONS, ...SK_REGIONS };

// Rýchle zistenie krajiny z kraja
export const COUNTRY_BY_REGION = (() => {
  const m = {};
  for (const k of Object.keys(CZ_REGIONS)) m[k] = 'cz';
  for (const k of Object.keys(SK_REGIONS)) m[k] = 'sk';
  return m;
})();

export function getCountryForRegion(region) {
  return COUNTRY_BY_REGION[region] || null;
}

export const ORGANIZATION_TYPES = [
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
];

export const ACCOMMODATION_TYPES = [
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
];

export const RESTAURANT_TYPES = [
  { value: 'restaurace', label: 'Restaurace' },
  { value: 'kavarna', label: 'Kavárna' },
  { value: 'hospoda', label: 'Hospoda' },
  { value: 'pivovar', label: 'Pivovar' },
  { value: 'bistro', label: 'Bistro' },
  { value: 'cukrarna', label: 'Cukrárna' },
  { value: 'vinarna', label: 'Vinárna' },
  { value: 'food_truck', label: 'Food truck' },
  { value: 'jine', label: 'Jiné' },
];

export const CUISINE_TYPES = [
  { value: 'ceska', label: 'Česká' },
  { value: 'slovenska', label: 'Slovenská' },
  { value: 'italska', label: 'Italská' },
  { value: 'asijska', label: 'Asijská' },
  { value: 'vegan', label: 'Veganská' },
  { value: 'jina', label: 'Jiná' },
];
