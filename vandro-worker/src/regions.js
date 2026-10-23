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

// Kategorie podniků (jediný zdroj pravdy na serveru). Klient je načítá z /api/meta/types.
export const ORGANIZATION_TYPES = [
  { value: 'adrenalinove_a_zazitkove_parky', label: 'Adrenalinové parky' },
  { value: 'alpinia_a_horske_botanicke_zahrady', label: 'Alpínia a horské zahrady' },
  { value: 'aquaparky_a_termalne_kupaliska', label: 'Aquaparky a koupaliště' },
  { value: 'arboreta_a_botanicke_zahrady', label: 'Arboreta a botanické zahrady' },
  { value: 'archeologicke_naleziska_a_skanzeny', label: 'Archeologická naleziště' },
  { value: 'asociacie_a_profesijne_zdruzenia_v_cestovnom_ruchu', label: 'Asociace a sdružení' },
  { value: 'bane_a_podzemne_expozicie_pristupne_verejnosti', label: 'Doly a podzemí' },
  { value: 'bungee_jumping_a_vyhliadkove_lety', label: 'Bungee a vyhlídkové lety' },
  { value: 'cestovne_agentury', label: 'Cestovní agentury' },
  { value: 'cestovne_kancelarie', label: 'Cestovní kanceláře' },
  { value: 'cyklo_pozicovne_a_servisy_bicyklov_elektrobicyklov', label: 'Půjčovny a servisy kol' },
  { value: 'detske_indoorove_herne_a_zabavne_centra', label: 'Dětské herny' },
  { value: 'drevene_kostoliky_a_sakralne_pamiatky', label: 'Kostelíky a sakrální památky' },
  { value: 'escaperooms', label: 'Escape roomy' },
  { value: 'galerie_a_umelecke_siene', label: 'Galerie' },
  { value: 'golfove_rezorty_a_ihriska', label: 'Golfová hřiště' },
  { value: 'hrady_zamky_a_kastiele', label: 'Hrady, zámky a zámečky' },
  { value: 'hvezdarne_a_planetaria', label: 'Hvězdárny a planetária' },
  { value: 'jaskyne_pristupne_verejnosti', label: 'Jeskyně' },
  { value: 'kina_amfiteatre_a_letne_kina', label: 'Kina a amfiteátry' },
  { value: 'kupele_a_liecebne_ustavy', label: 'Lázně' },
  { value: 'kurzy_varenia_a_degustacne_zazitky', label: 'Kurzy vaření a degustace' },
  { value: 'lanovky_a_vleky', label: 'Lanovky a vleky' },
  { value: 'letoviska_a_rekreacne_oblasti', label: 'Letoviska a rekreační oblasti' },
  { value: 'lodna_doprava_a_vyhliadkove_plavby', label: 'Lodní doprava a plavby' },
  { value: 'muzea', label: 'Muzea' },
  { value: 'muzea_pod_holym_nebom', label: 'Skanzeny' },
  { value: 'narodne_parky_a_chranene_krajinne_oblasti', label: 'Národní parky a CHKO' },
  { value: 'naucne_chodniky_a_turisticke_trasy', label: 'Naučné stezky a trasy' },
  { value: 'oblastne_organizacie_cestovneho_ruchu', label: 'Organizace cestovního ruchu' },
  { value: 'pamiatky_unesco', label: 'Památky UNESCO' },
  { value: 'pamatne_domy_a_rodne_domy_osobnosti', label: 'Pamětní domy' },
  { value: 'pozicovne_lodi_kajakov_a_raftov', label: 'Půjčovny lodí a kajaků' },
  { value: 'pozicovne_sportovych_potrieb', label: 'Půjčovny sportovních potřeb' },
  { value: 'pozicovne_stvorkoliek_a_sneznych_skutrov', label: 'Půjčovny čtyřkolek a skútrů' },
  { value: 'prirodne_rezervacie_vodopady_a_rokliny', label: 'Přírodní rezervace a vodopády' },
  { value: 'rance_a_jazdecke_kluby', label: 'Ranče a jezdecké kluby' },
  { value: 'rozhladne_a_vyhliadkove_veze', label: 'Rozhledny' },
  { value: 'sprievodcovske_sluzby_a_certifikovani_sprievodcovia', label: 'Průvodci' },
  { value: 'squashove_tenisove_a_bedmintonove_kurty', label: 'Sportovní kurty' },
  { value: 'turisticke_informacne_centra', label: 'Informační centra' },
  { value: 'turisticke_vlaciky_a_historicke_zeleznice', label: 'Vláčky a historické železnice' },
  { value: 'vinne_cesty_a_pivne_cesty', label: 'Vinné a pivní stezky' },
  { value: 'wellness_centra_saunove_svety_a_mestske_plavarne', label: 'Wellness a bazény' },
  { value: 'zabavne_parky_a_lunaparky', label: 'Zábavní parky' },
  { value: 'zamocke_parky_a_historicke_zahrady', label: 'Zámecké parky a zahrady' },
  { value: 'zoo_zoologicke_zahrady_a_zvernice', label: 'ZOO a obory' },
  { value: 'jine', label: 'Jiné' },
];

export const ACCOMMODATION_TYPES = [
  { value: 'apartmanove_domy', label: 'Apartmánové domy' },
  { value: 'apartmany_v_sukromi', label: 'Soukromé apartmány' },
  { value: 'autokempy_a_kempy', label: 'Kempy' },
  { value: 'boutique_hotely', label: 'Boutique hotely' },
  { value: 'botely', label: 'Botely' },
  { value: 'drevenice_zrubove_domy_a_chalety', label: 'Roubenky a sruby' },
  { value: 'glamping', label: 'Glamping' },
  { value: 'horske_hotely', label: 'Horské hotely' },
  { value: 'horske_chaty_a_turisticke_utulne', label: 'Horské chaty' },
  { value: 'hostely', label: 'Hostely' },
  { value: 'hotely', label: 'Hotely' },
  { value: 'kongresove_a_biznis_hotely', label: 'Kongresové hotely' },
  { value: 'motely', label: 'Motely' },
  { value: 'penziony', label: 'Penziony' },
  { value: 'rekreacne_strediska_a_chatove_osady', label: 'Rekreační střediska' },
  { value: 'rodinne_penziony', label: 'Rodinné penziony' },
  { value: 'sukromne_chaty_a_chalupy_na_prenajom', label: 'Chaty a chalupy' },
  { value: 'skoly_v_prirode_a_mladeznicke_ubytovne', label: 'Školy v přírodě' },
  { value: 'turisticke_ubytovne', label: 'Turistické ubytovny' },
  { value: 'ubytovanie_na_sukromi', label: 'Pokoje v soukromí' },
  { value: 'wellness_a_spa_hotely', label: 'Wellness a spa hotely' },
  { value: 'jine', label: 'Jiné' },
];

export const RESTAURANT_TYPES = [
  { value: 'bageterie_a_sendvicove_bary', label: 'Bagetérie a sendviče' },
  { value: 'bistra', label: 'Bistra' },
  { value: 'brasserie', label: 'Brasserie' },
  { value: 'cukrarne', label: 'Cukrárny' },
  { value: 'cajovne', label: 'Čajovny' },
  { value: 'diskoteky_a_nocne_kluby', label: 'Kluby a diskotéky' },
  { value: 'etnicke_a_narodne_restauracie', label: 'Etnické restaurace' },
  { value: 'fast_foody', label: 'Fast food' },
  { value: 'fine_dining_restauracie', label: 'Fine dining' },
  { value: 'food_trucky', label: 'Food trucky' },
  { value: 'hostince_a_zajazdove_krcmy', label: 'Hostince a hospody' },
  { value: 'hotelove_restauracie', label: 'Hotelové restaurace' },
  { value: 'jedalne_a_samoobsluzne_prevadzky', label: 'Jídelny a samoobsluhy' },
  { value: 'kafeterie_a_ranajkarne', label: 'Snídárny' },
  { value: 'kaviarne', label: 'Kavárny' },
  { value: 'koktailove_bary', label: 'Koktejlové bary' },
  { value: 'koliby_salase_a_slovenske_restauracie', label: 'Koliby a salaše' },
  { value: 'pivarne_a_puby', label: 'Pivnice a puby' },
  { value: 'pizzerie', label: 'Pizzerie' },
  { value: 'pivovary_s_vlastnou_restauraciou', label: 'Pivovary' },
  { value: 'restauracie', label: 'Restaurace' },
  { value: 'snack_bary_a_bufety', label: 'Snack bary a bufety' },
  { value: 'steakhousy', label: 'Steakhousy' },
  { value: 'sushi_bary', label: 'Sushi bary' },
  { value: 'vinarne_vinoteky_a_degustacne_pivnice', label: 'Vinárny a vinotéky' },
  { value: 'jine', label: 'Jiné' },
];

// Starší hodnoty uložené v databázi před rozšířením kategorií (zůstávají platné a zobrazují se správně)
export const LEGACY_TYPES = {
  organization: ['letecka_doprava_a_charterove_lety', 'hrad', 'zamek', 'muzeum', 'lyzarske_stredisko', 'galerie', 'zoo', 'prirodni_pamatka', 'rozhledna', 'zricenina', 'kostel', 'technicka_pamatka'],
  accommodation: ['hotel', 'penzion', 'chata', 'chalupa', 'kemp', 'apartman', 'glamping', 'hostel', 'ubytovna'],
  restaurant: ['restaurace', 'kavarna', 'hospoda', 'pivovar', 'bistro', 'cukrarna', 'vinarna', 'food_truck'],
};

// Kontrola typu podniku při registraci a přidání podniku (kind = organization | accommodation | restaurant)
export function isValidBusinessType(kind, value) {
  const lists = { organization: ORGANIZATION_TYPES, accommodation: ACCOMMODATION_TYPES, restaurant: RESTAURANT_TYPES };
  const list = lists[kind];
  if (!list || typeof value !== 'string') return false;
  return list.some((t) => t.value === value) || (LEGACY_TYPES[kind] || []).includes(value);
}

export const CUISINE_TYPES = [
  { value: 'ceska', label: 'Česká' },
  { value: 'slovenska', label: 'Slovenská' },
  { value: 'italska', label: 'Italská' },
  { value: 'asijska', label: 'Asijská' },
  { value: 'vegan', label: 'Veganská' },
  { value: 'jina', label: 'Jiná' },
];
