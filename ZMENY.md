# Zmeny, štvrté kolo

Súbory majú rovnakú štruktúru ako repozitár. Skopírujte ich na pôvodné miesta a prepíšte.

## Nasadenie
1. Nahrajte súbory do repozitára. Zmenený je aj worker (`vandro-worker/src/routes/messages.js`), nasaďte ho. Žiadna migrácia databázy nie je potrebná.
2. Workflow "Build place pages" znova vygeneruje stránky `misto/...` s opravenými odkazmi (spustí sa po pushi alebo ručne cez Actions).
3. Po nasadení raz obnovte stránku cez Ctrl+F5 (nový service worker v7, súbory v11).

## Čo je opravené
- Lišta na stránkach miest. Odkazy majú tvar `/?tab=ubytovani` a podobne, takže otvoria správnu sekciu bez ohľadu na to, ako server prepisuje adresy. Aplikácia ich potom zmení na pekné adresy.
- Mapa v aplikácii má na mobile vysúvaciu navigáciu. Tlačidlo dole ju vysunie nad mapu, mapu nezmenšuje a po výbere sekcie alebo klepnutí mimo sa zavrie.
- Lightbox na mobile je prepracovaný v štýle Facebooku. Fotka je na celej obrazovke, dole je kompaktná lišta príspevku a komentáre sa vysunú ťahom nahor alebo klepnutím na ikonu komentárov. Ťahom nadol sa panel schová, ťahom fotky nadol sa lightbox zavrie, ťahom do strán sa mení fotka. Gestá sú na `#lightbox` (event delegation), takže sa nestratia pri prekreslení.
- Správy. Okno konverzácie sleduje skutočne viditeľnú plochu (lišty prehliadača, klávesnica), takže pole na písanie nie je schované nízko. Pribudlo menu so zablokovaním a odblokovaním používateľa a nahlásením. Pri blokácii sa namiesto poľa zobrazí oznam a tlačidlo Odblokovať. Server pri zablokovaní odoslanie odmietne.
- Meno v hlavičke konverzácie sa teraz escapuje (predtým by sa vložilo ako HTML).
- Zavretie okna (napríklad potvrdenia blokácie) nad otvorenou konverzáciou už konverzáciu nezavrie.

## Čo nebolo vyskúšané
Testy bežali v Chromiu s mockovaným API a dotykovými udalosťami. Neoverené je skutočné správanie na iPhone Safari a Android Chrome (klávesnica, lišty prehliadača), reálne API a nasadený Cloudflare. Príčinu, prečo lišta na stránkach miest otvárala len mapu, som nemohol overiť na nasadenom webe. Pravdepodobne Cloudflare pri prepise na /index.html presmeruje na /, takže aplikácia otvorila naposledy použitú záložku. Nový tvar odkazov sa na tom nezakladá.
