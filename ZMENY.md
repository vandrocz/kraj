# Zmeny, piate kolo (kontrola pred testovacou prevádzkou)

Súbory majú rovnakú štruktúru ako repozitár. Skopírujte ich na pôvodné miesta a prepíšte.

## Nasadenie
1. Nahrajte súbory do repozitára a nasaďte worker (zmenené sú `index.js`, `cron.js`, `regions.js`, `badges.js`, `seed.js`, nový `sanitize.js`, `routes/auth.js`, `routes/profile.js`).
2. Voliteľne spustite v D1 konzole `vandro-worker/sql/migration_categories.sql`. Presunie staré kategórie podnikov do nových. Staré hodnoty zostávajú platné aj bez toho.
3. Po nasadení raz obnovte stránku cez Ctrl+F5 (service worker v8, súbory v12).

## Kategórie
- Zoznamy z vášho zadania sú v registrácii, pri pridaní podniku, vo filtroch a v prekladoch (čeština, slovenčina, angličtina). Organizácie 48, ubytovanie 21, gastro 25 kategórií plus "Iné".
- Kategórie sú v jednom zdroji (`regions.js`), klient ich načíta z `/api/meta/types`. Server hodnotu pri registrácii a pridaní podniku teraz kontroluje, predtým prijímal čokoľvek.
- V zozname ste mali "Horská hotely" a "Horská chaty", opravil som na "Horské hotely" a "Horské chaty".
- Kategórie miest na mape a v stránkach `misto/...` pochádzajú z Google Sheets a tieto zoznamy sa ich netýkajú.

## Nastavenia
Sekcia Účet je navrchu. Súkromie je spojené s Dáta a súkromie (GDPR) do jednej sekcie.

## Zabezpečenie
- Opravené uložené XSS. Meno používateľa sa vkladalo do hlavičky profilu bez escapovania. Hlavička teraz vždy escapuje názov.
- Pole web v profile a podniku prijímalo aj adresy typu `javascript:`. Server teraz povoľuje len http(s), klient odkazy filtruje a pridané sú limity dĺžky a kontrola telefónu.
- Server pri každom prihlásenom požiadavku overuje stav a rolu účtu (zo 4. kola) a pribudli limity požiadaviek na zápisy do profilu, zoznamov miest a push.
- Skript Google na prihlásenie sa načíta až pri zobrazení prihlásenia, nie pri každej návšteve webu.
- Retenčná úloha v cron (04:00) maže históriu prihlásení staršiu ako 12 mesiacov, overovacie dokumenty 90 dní po rozhodnutí a prešlé tokeny. Presne to uvádzajú zásady ochrany údajov.

## Zákonné náležitosti
- Minimálny vek je 16 rokov v zásadách, podmienkach, registrácii aj na serveri. Prevádzkovateľ je na Slovensku, kde je vek digitálneho súhlasu 16 rokov.
- Stránka `imprint.html` bola kópiou hlavnej aplikácie bez údajov. Je nahradená skutočnou stránkou s prevádzkovateľom, adresou, e-mailom a kontaktným bodom podľa DSA (údaje sú tie, ktoré už uvádzajú obchodné podmienky).
- Zo zásad som odstránil poznámku "vzorový text" a upravil text o uchovávaní. Po zmazaní účtu sa údaje teraz odstránia okamžite, v zálohách databázy môžu zostať najviac 30 dní.

## Čo musíte posúdiť alebo doplniť sami
- Ak platformu prevádzkujete ako podnikateľ (živnosť, s. r. o.), doplňte do tiráže a zásad obchodné meno, IČO a zápis v registri. Teraz je uvedená fyzická osoba bez IČO.
- Kontaktný bod podľa DSA by mal uvádzať aj jazyky komunikácie. Neviem, v akých jazykoch odpovedáte, preto som ich neuviedol.
- CSP v `_headers` stále povoľuje `unsafe-inline` a `unsafe-eval` v skriptoch. Je to slabšia ochrana proti XSS a zmena by znamenala prepísať inline skripty.
- Právnu správnosť zásad a podmienok som neposudzoval ako právnik. Doporučujem krátku kontrolu právnikom pred ostrým spustením.
- `vandro-worker/sql/schema.sql` nezodpovedá produkčnej databáze (chýba napríklad stĺpec `country_code` v `users`). Neovplyvňuje to beh, ale schému treba pri budúcej obnove databázy doplniť.

## Čo nebolo vyskúšané
Testy bežali v Chromiu s mockovaným API a proti SQLite databáze. Neoverený je reálny Cloudflare, e-maily, Google prihlásenie, push a skutočné telefóny.
