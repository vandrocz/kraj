// Kraje a okresy ČR + číselníky druhov podnikov.
// Zdieľané medzi Workerom (validácia) a front-endom (filtre) — udržuj v oboch kópiách rovnaké.

export const REGIONS = {
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

export const ORGANIZATION_TYPES = [
  { value: 'hrad', label: 'Hrad' },
  { value: 'zamek', label: 'Zámek' },
  { value: 'muzeum', label: 'Muzeum' },
  { value: 'lyzarske_stredisko', label: 'Lyžařské středisko' },
  { value: 'galerie', label: 'Galerie' },
  { value: 'zoo', label: 'ZOO' },
  { value: 'prirodni_pamatka', label: 'Přírodní památka' },
];

export const ACCOMMODATION_TYPES = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'penzion', label: 'Penzion' },
  { value: 'kemp', label: 'Kemp' },
];

export const RESTAURANT_TYPES = [
  { value: 'restaurace', label: 'Restaurace' },
  { value: 'kavarna', label: 'Kavárna' },
  { value: 'hospoda', label: 'Hospoda' },
  { value: 'pivovar', label: 'Pivovar' },
];

export const CUISINE_TYPES = [
  { value: 'ceska', label: 'Česká' },
  { value: 'italska', label: 'Italská' },
  { value: 'asijska', label: 'Asijská' },
  { value: 'vegan', label: 'Veganská' },
  { value: 'jina', label: 'Jiná' },
];
