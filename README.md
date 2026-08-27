# Vandro — webová appka

React + Vite základ appky Vandro. Zatiaľ beží na ukážkových (mock) dátach v `src/data/mockData.js` — žiadny backend, žiadne API volania.

## Spustenie

```bash
npm install
npm run dev
```

Build pre produkciu:

```bash
npm run build
```

## Čo je hotové

- **Bočný panel (sidebar)** — otvára sa tlačidlom vľavo hore, obsah sa mení podľa toho, či si v režime organizácie alebo užívateľa (`src/components/Sidebar.jsx`).
- **Spodná navigácia** — 3 kruhové tlačidlá (Organizácie / Zbierky / Profil), prepínajú stránky (`src/components/BottomNav.jsx`).
- **Feed zbierok** — aktuálna zbierka je vždy navrchu (zoradené podľa dátumu), karty v štýle Instagramu/TikToku s lajkmi, zdieľaním a uložením (`src/pages/CollectionsFeedPage.jsx`).
- **Feed organizácií** — príspevky od organizácií vrátane komentárov priamo v karte, označenie „Partner" pre platený obsah (`src/pages/OrganizationsFeedPage.jsx`).
- **Profil užívateľa** — kredit, dobíjanie kreditu, štatistiky príspevkov, zdieľanie profilu na sociálne siete, nastavenia účtu (`src/pages/ProfilePage.jsx`).
- **Lightbox** — fotky v pomere 3:4, klik na fotku ju rozkvitne do fullscreen náhľadu (`src/components/Lightbox.jsx`).

## Farebný systém

Design tokeny sú v `src/index.css` (`:root`), hlavná farba je moderná zelená `#2FBF71`. Zmena palety = úprava premenných na jednom mieste.

## Čo príde ďalej (návrhy)

- Skutočné prihlásenie a účty organizácií s rozšírenými funkciami (vlastné štatistiky dosahu, platené propagácie).
- Reálne API napojenie namiesto `mockData.js`.
- Detail zbierky (viac fotiek, mapa trasy, zoznam zastávok).
- Vyhľadávanie a filtrovanie zbierok podľa lokality/dĺžky trasy.
- Notifikácie (lajky, komentáre, nové zbierky od sledovaných ľudí).
