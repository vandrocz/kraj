# Zmeny, tretie kolo

Súbory majú rovnakú štruktúru ako repozitár. Skopírujte ich na pôvodné miesta a prepíšte.

## Nasadenie
1. Nahrajte všetky súbory do repozitára.
2. Workflow "Build place pages" sa spustí po pushi a znova vygeneruje stránky `misto/...` (alebo ho spustite ručne cez Actions, Run workflow).
3. Po nasadení raz obnovte stránku cez Ctrl+F5 (nový service worker v6).

## Čo je opravené
- Správy. Spodná navigácia a cookie lišta už neprekrývajú pole na písanie, rozpísaný text sa nestráca, správa sa zobrazí okamžite a fokus ostáva v poli (messages.js, app.js, styles.css).
- Lightbox na mobile. Panel má pevné výšky 45 %, 75 % a 100 % bez prázdneho miesta, obsah sa posúva a ikona zavretia je viditeľná aj v plnej obrazovke (styles.css).
- Mapa na stránke miesta. Štýl sa načítava z /assets/map-style.json (predtým z neexistujúcej adresy), značka je rovnaká ako na hlavnej mape (build-place-pages.mjs).
- Navigačná lišta ako v hlavnej aplikácii je na stránkach miest aj na zozname miest (build-place-pages.mjs, mista/index.html).
- Texty cookie lišty zodpovedajú skutočnosti (Google Analytics len so súhlasom) (i18n.js).

## Čo nebolo vyskúšané
Test bežal v Chromiu s mockovaným API. Neoverené zostáva reálne API, tlačidlo "Napísať správu" na profile podniku a vzhľad mapy s reálnymi dlaždicami.
