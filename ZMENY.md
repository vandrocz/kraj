# Zmeny, druhé kolo

Súbory majú rovnakú štruktúru ako repozitár. Skopírujte ich na pôvodné miesta a prepíšte.

## Poradie nasadenia

1. V Cloudflare D1 konzole spustite obsah súboru `vandro-worker/sql/migration_messages_business.sql` (tri príkazy ALTER TABLE). Ak D1 napíše "duplicate column name", stĺpec už existuje a je to v poriadku.
2. Nasaďte worker (zmenený `src/index.js`, nový `src/erase.js`, zmenené `src/routes/*`).
3. Nahrajte zvyšné súbory do repozitára. Súbor `_redirects` je nový a zabezpečuje, že `/mapa`, `/akce` a ďalšie adresy otvoria aplikáciu.
4. Po nasadení raz obnovte stránku cez Ctrl+F5 (nový service worker, verzia v5).
5. Po pushi prebehne workflow, ktorý znova vygeneruje stránky `misto/...` s opravenou hlavičkou.

## Čo je opravené

- Limit fotiek v príspevku je 6 (server `posts.js`, klient `account.js`, texty v `i18n.js`).
- Správy podnikom. Do `index.html` pribudol chýbajúci `messages.js`, na serveri endpoint `/api/messages/start-business`, ikona Zprávy s odznakom v hlavičkách a oprava zoznamu konverzácií. Pravidlá teraz vynucuje server.
- Mazanie adminom. Nový `erase.js` maže príspevky, komentáre aj s odpoveďami, fotky v R2, správy, podniky a osobné údaje. Pribudol endpoint `DELETE /api/admin/reject/:kind/:id`, ktorý tlačidlo zamietnutia podniku volalo, ale neexistoval.
- Adresy. Každá sekcia má vlastnú cestu a poloha mapy sa dopisuje do adresy len na `/mapa`.
- Lightbox na mobile má pevné výšky panelu a celý sa dá posúvať.
- Karta príspevku má počet lístkov ako odznak vedľa ikony, bez zobrazení, a meno komentujúceho je v jednom riadku s textom.
- Hlavička zoznamu miest a generátor stránok majú tlačidlá a odkaz Mapa vedie na `/mapa`.

## Zabezpečenie a zákony

- Server pri každom prihlásenom požiadavku overuje stav a rolu účtu v databáze. Predtým platil token 7 dní aj pre zmazaný alebo pozastavený účet a pre admina s odobratou rolou.
- Zmazanie účtu naozaj maže osobné údaje, nielen meno (GDPR čl. 17).
- Export údajov obsahuje aj zoznamy miest, správy, sledovania, recenzie, check-iny a históriu prihlásení (GDPR čl. 15 a 20).
- Zásady ochrany údajov uvádzali, že analytika sa nepoužíva, hoci sa po súhlase načítava Google Analytics. Text je opravený a doplnené sú mapové služby tretích strán, ktorým sa pri zobrazení mapy prenáša IP adresa.
- Obchodné podmienky opisovali správy medzi používateľmi, čo už neplatí. Text je opravený.

## Čo musíte doplniť alebo rozhodnúť sami

- Stránka `imprint.html` je takmer prázdna a zásady ochrany údajov končia poznámkou "vzorový text". Chýba názov alebo meno prevádzkovateľa, adresa a IČO. Tieto údaje som si nemohol vymyslieť.
- Minimálny vek je v textoch 15 rokov. Na Slovensku je vek digitálneho súhlasu 16 rokov. Zvážte, či nemá byť hranica 16 (zmena v zásadách, podmienkach, registrácii a na serveri).
- CSP v `_headers` stále povoľuje `unsafe-inline` a `unsafe-eval` v skriptoch. Je to slabšia ochrana proti XSS, ale zmena by vyžadovala prepísať inline skripty.
- Heslá používajú PBKDF2 so 100 000 iteráciami. To je maximum, ktoré Cloudflare Workers povoľuje.
- Skripty `groups.js`, `collections.js` a `services.js` sa stále nenačítavajú v `index.html`.

## Čo nebolo vyskúšané

Vyskúšal som mazanie a pravidlá správ na skutočnej SQLite databáze so zapnutými cudzími kľúčmi a syntax všetkých skriptov. Nespustil som web v prehliadači, takže vzhľad lightboxu na mobile, presmerovanie `/mapa` v Cloudflare a nahrávanie 6 fotiek treba po nasadení vyskúšať.
