-- Přemapování starých kategorií na rozšířený seznam kategorií.
-- Spuštění je volitelné: staré hodnoty zůstávají platné a zobrazují se správně.
-- Doporučeno spustit jednou v D1 konzoli, aby se podniky řadily do nových kategorií.
UPDATE organizations SET type = CASE type
    WHEN 'hrad' THEN 'hrady_zamky_a_kastiele'
    WHEN 'zamek' THEN 'hrady_zamky_a_kastiele'
    WHEN 'zricenina' THEN 'hrady_zamky_a_kastiele'
    WHEN 'muzeum' THEN 'muzea'
    WHEN 'technicka_pamatka' THEN 'muzea'
    WHEN 'lyzarske_stredisko' THEN 'lanovky_a_vleky'
    WHEN 'galerie' THEN 'galerie_a_umelecke_siene'
    WHEN 'zoo' THEN 'zoo_zoologicke_zahrady_a_zvernice'
    WHEN 'prirodni_pamatka' THEN 'prirodne_rezervacie_vodopady_a_rokliny'
    WHEN 'rozhledna' THEN 'rozhladne_a_vyhliadkove_veze'
    WHEN 'kostel' THEN 'drevene_kostoliky_a_sakralne_pamiatky'
  ELSE type END
WHERE type IN ('hrad', 'zamek', 'zricenina', 'muzeum', 'technicka_pamatka', 'lyzarske_stredisko', 'galerie', 'zoo', 'prirodni_pamatka', 'rozhledna', 'kostel');

UPDATE accommodation SET type = CASE type
    WHEN 'hotel' THEN 'hotely'
    WHEN 'penzion' THEN 'penziony'
    WHEN 'chata' THEN 'sukromne_chaty_a_chalupy_na_prenajom'
    WHEN 'chalupa' THEN 'sukromne_chaty_a_chalupy_na_prenajom'
    WHEN 'kemp' THEN 'autokempy_a_kempy'
    WHEN 'apartman' THEN 'apartmanove_domy'
    WHEN 'glamping' THEN 'glamping'
    WHEN 'hostel' THEN 'hostely'
    WHEN 'ubytovna' THEN 'turisticke_ubytovne'
  ELSE type END
WHERE type IN ('hotel', 'penzion', 'chata', 'chalupa', 'kemp', 'apartman', 'glamping', 'hostel', 'ubytovna');

UPDATE restaurants SET type = CASE type
    WHEN 'restaurace' THEN 'restauracie'
    WHEN 'kavarna' THEN 'kaviarne'
    WHEN 'hospoda' THEN 'hostince_a_zajazdove_krcmy'
    WHEN 'pivovar' THEN 'pivovary_s_vlastnou_restauraciou'
    WHEN 'bistro' THEN 'bistra'
    WHEN 'cukrarna' THEN 'cukrarne'
    WHEN 'vinarna' THEN 'vinarne_vinoteky_a_degustacne_pivnice'
    WHEN 'food_truck' THEN 'food_trucky'
  ELSE type END
WHERE type IN ('restaurace', 'kavarna', 'hospoda', 'pivovar', 'bistro', 'cukrarna', 'vinarna', 'food_truck');

-- Vyřazená kategorie (Letecká doprava a charterové lety) → Jiné
UPDATE organizations SET type = 'jine' WHERE type = 'letecka_doprava_a_charterove_lety';
