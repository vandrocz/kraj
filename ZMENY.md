# Zmeny, šieste kolo

Súbory majú rovnakú štruktúru ako repozitár. Skopírujte ich na pôvodné miesta a prepíšte.

## Nasadenie (poradie je dôležité)
1. V Cloudflare D1 konzole spustite `vandro-worker/sql/migration_trips.sql` (nové tabuľky `trip_posts` a `trip_post_media`).
2. Voliteľne spustite `vandro-worker/sql/migration_categories.sql` (presunie staré kategórie do nových, staré hodnoty fungujú aj bez toho).
3. Nasaďte worker (nový `routes/trips.js`, zmenené `index.js`, `erase.js`, `regions.js`, `routes/auth.js`, `routes/auth-google.js`, `routes/profile.js`).
4. Nahrajte zvyšné súbory. Workflow "Build place pages" sa po pushi spustí a znova vygeneruje stránky `misto/...`. Kým nebeží, majú staré stránky miest inline skripty a pri novej CSP sa im nenačíta mapka.
5. Po nasadení raz obnovte stránku cez Ctrl+F5 (service worker v10, súbory v13).

## Čo je nové
- Kategórie: skrátené názvy bez zátvoriek, vyradená kategória Letecká doprava a charterové lety (staré záznamy sa presunú do "Iné"). Najdlhší názov má 31 znakov.
- FAQ je v nastaveniach v novej sekcii Pomoc.
- Uložené miesta na mape sú rozdelené podľa typu (Vandro miesta, Gastro, Ubytovanie, Organizácie) s filtrom. "Chcem navštíviť" je prepojené s mapou, zobrazuje sa tam a na mape sa otvára tlačidlom v zozname.
- Prihlásenie platí 30 dní a obnovuje sa pri používaní. Vypršané prihlásenie sa teraz oznámi a používateľ sa odhlási, namiesto tichých chýb.
- Offline feedy: každý feed aj akcie ukladajú posledných 30 príspevkov, ukážu sa hneď po otvorení a fungujú bez pripojenia s upozornením. Obrázky z R2 cachuje service worker. Po odhlásení sa uložené feedy zmažú.
- Cestovateľský feed na profile ("Výlety"): max. 3 fotky, dátum, krátky popis (300 znakov), poloha cez vyhľadávač alebo výber na mape, zobrazuje sa len na profile autora, nikde inde. Sledujúci dostanú upozornenie a push. Výlety sa vymažú pri zmazaní účtu a sú v exporte údajov.
- CSP: zo `script-src` je odstránené `unsafe-inline` aj `unsafe-eval`. Inline skripty sú v súboroch `boot.js`, `place-page.js`, `places-list.js`. Inline obsluhu udalostí v kóde mapy (110 miest) preberá `csp-handlers.js`, ktorý nespúšťa ľubovoľný kód, len jednoduché volania funkcií. Aplikácia, mapa so všetkými knižnicami, export PDF aj stránky miest bežali v teste bez jediného porušenia CSP.
- Zoznam miest už neposiela IP adresu návštevníka službe ipapi.co. Krajina sa odhadne lokálne z časovej zóny a jazyka.
- Texty (registrácia, onboarding, prázdne stavy, úvodná stránka) sú uvoľnenejšie a menej úradné.
- Plynulejší scroll bočnej lišty na mape na počítači (preventívne opravy, pozri nižšie).

## Čo nebolo vyskúšané
- Scroll bočnej lišty som v testovacom prostredí bez grafickej karty nedokázal odmerať. Odstránil som typické príčiny (rozostrenie pozadia nad mapou, nekonečné animácie počas scrollu, izolácia vrstiev), ale či to stačí, ukáže až skutočný počítač.
- Prihlásenie do mapy: v kóde mapy samostatné prihlásenie neexistuje. Pravdepodobná príčina je vypršaný token po 7 dňoch, preto je prihlásenie teraz 30 dní s obnovou a jasnou správou pri vypršaní. Reálne správanie treba overiť u vás.
- Offline cache obrázkov cez service worker funguje v prehliadači. V natívnej aplikácii (Google Play, App Store) závisí od obalu aplikácie. Uložené príspevky (texty) fungujú všade, lebo sa ukladajú do úložiska aplikácie.
- Reálne API a Cloudflare, e-maily, push a skutočné telefóny. Testy bežali v Chromiu s mockovaným API a proti SQLite.

## CSP, čo zostáva
`style-src` stále povoľuje `unsafe-inline`, lebo aplikácia používa inline štýly vo veľkom rozsahu. Skripty (hlavná ochrana proti XSS) sú už striktné. Ak niekedy pribudne nový inline skript alebo `onclick` v stránke mimo mapy, CSP ho zablokuje.

## Poznámky k vývoju
- V priebehu práce sa prostredie obnovilo a prišiel som o priebežnú kópiu. Všetko som zopakoval a znova otestoval, preto sú testy v tomto zipe čerstvé.
