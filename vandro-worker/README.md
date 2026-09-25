# Náš kraj / Vandro API — Cloudflare Worker (Hono  )

Kompletný backend pre turisticko-komunitný ekosystém: zbierkový feed s automatickou rotáciou,
sociálna sieť organizácií (hrady, zámky, múzeá, ZOO...) a sociálne siete pre ubytovanie a gastro.

## 1. Nastavenie D1 databázy

```bash
npx wrangler d1 execute naskraj-db --remote --file=./sql/schema.sql
```

Vytvorí všetky tabuľky a vloží testovací obsah (3 organizácie, 2 ubytovania, 2 reštaurácie, 3 zbierky, 5 príspevkov).

> Testovací užívatelia (`u-admin`, `u-org-1`, ...) majú `password_hash = 'demo'`, čo nie je platný hash —
> neprihlásiš sa nimi. Postup na vytvorenie funkčného admin účtu je v kroku 5 nižšie.

## 2. Tajomstvá

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put CRON_SECRET
npx wrangler secret put ONESIGNAL_API_KEY
```

Pre lokálny vývoj (`wrangler dev`) použi namiesto toho súbor `.dev.vars` (už je v tomto balíku
s testovacími hodnotami — pred nasadením do produkcie si nastav vlastné cez `wrangler secret put`).

## 3. Verejné premenné (`wrangler.toml` -> `[vars]`)

- `ALLOWED_ORIGIN` — zoznam povolených domén front-endu oddelený čiarkou (napr. `https://app.vandro.cz,https://kraj.vandro.cz`).
- `R2_PUBLIC_BASE` — verejná URL na súbory v R2 bucketu `naskraj-media` (nastav R2 custom domain alebo Public Development URL).
- `ONESIGNAL_APP_ID` — ID OneSignal aplikácie (voliteľné — bez neho sa push len vynechá).

## 4. Nasadenie

```bash
npm install
npx wrangler deploy
```

Aktuálna dev adresa: `https://naskraj-api.vandrocz-contact.workers.dev`
Produkčný plán: nastaviť custom domain `api.[nazov].vandro.cz` v Dashboard -> Workers & Pages -> naskraj-api -> Settings -> Triggers.

## 5. Vytvorenie reálneho admin účtu

Registrácia cez `/api/auth/register` vytvára len role `user`, `organization` alebo `hotelier` (bezpečnostne
zámerne — nikto zvonku si nemá vedieť sám priradiť `admin`). Postup:

```bash
# 1. Zaregistruj si bežný účet
curl -X POST https://naskraj-api.vandrocz-contact.workers.dev/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@vandro.cz","password":"TvojeSilneHeslo123","displayName":"Správce"}'

# 2. Povýš mu rolu v D1 na admina
npx wrangler d1 execute naskraj-db --remote \
  --command "UPDATE users SET role = 'admin' WHERE email = 'admin@vandro.cz'"

# 3. Prihlás sa cez /api/auth/login — token teraz nesie role: 'admin'
```

## 6. Otestovanie cronu bez čakania do rána

```bash
curl -X POST https://naskraj-api.vandrocz-contact.workers.dev/api/admin/run-distribution-now \
  -H "X-Cron-Secret: TVOJ_CRON_SECRET"
```

## Prehľad API routes

### Auth & peňaženka
| Metóda | Cesta | Auth | Popis |
|---|---|---|---|
| POST | `/api/auth/register` | — | `{email,password,displayName,role}`. Pre `role:'organization'` navyše `orgName,orgType,region,district,description`. Pre `role:'hotelier'` navyše `businessName,businessKind('accommodation'|'gastro'),businessType,cuisineType?,region,district,description,capacity?` |
| POST | `/api/auth/login` | — | Vráti `token`, `user`, `businesses[]` |
| POST | `/api/auth/logout` | — | No-op (JWT je stateless), front-end si zmaže token sám |
| GET | `/api/user/wallet` | JWT | Kredit + zoznam `contributions` (projekty, ktorým užívateľ pomohol) |
| POST | `/api/user/wallet/topup` | JWT | `{amount}` — fiktívne dobitie |

### Zbierkový feed
| Metóda | Cesta | Auth | Popis |
|---|---|---|---|
| GET | `/api/feed/collections` | — | `{ active, waiting[] }` — aktívna/dokončená zbierka + top 10 čakajúcich podľa lajkov |
| POST | `/api/feed/collections/:id/like` | JWT | Lajk (len pre `status:'waiting'` projekty) |

### Sociálne feedy (spoločný tvar odpovede)
| Metóda | Cesta | Auth | Query filtre |
|---|---|---|---|
| GET | `/api/feed/organization` | — | `search, region, district, type` |
| GET | `/api/feed/accommodation` | — | `search, region, district, type` |
| GET | `/api/feed/gastro` | — | `search, region, district, type, cuisine` |
| GET | `/api/feed/:id/comments` | — | Komentáre pod konkrétnym príspevkom |
| POST | `/api/feed/:id/comment` | JWT | `{text}` |
| POST | `/api/feed/:id/report` | JWT | `{reason}` — nahlásenie príspevku |

### Číselníky
| Metóda | Cesta | Popis |
|---|---|---|
| GET | `/api/meta/regions` | Kraje ČR + ich okresy |
| GET | `/api/meta/types` | Typy organizácií/ubytovania/reštaurácií/kuchýň |

### Príspevky (organizácie a podniky)
| Metóda | Cesta | Auth | Popis |
|---|---|---|---|
| POST | `/api/posts` | JWT (role `organization`/`hotelier`) | `multipart/form-data`: `file, text, target_feed, business_id`. Zverejní sa okamžite (`status:'published'`) |

### Admin
| Metóda | Cesta | Auth | Popis |
|---|---|---|---|
| GET | `/api/admin/pending` | JWT (role `admin`) | Neschválené organizácie/ubytovania/reštaurácie |
| POST | `/api/admin/verify/:kind/:id` | JWT (role `admin`) | `kind` = `organizations`\|`accommodation`\|`restaurants` — udelí Verified odznak |
| POST | `/api/admin/projects` | JWT (role `admin`) | Vytvorenie novej zbierky (`organization_id,title,description,cover_image_url,target_amount`) |
| GET | `/api/admin/reports` | JWT (role `admin`) | Nevyriešené nahlásenia |
| POST | `/api/admin/reports/:id/resolve` | JWT (role `admin`) | Označí nahlásenie ako vyriešené |
| DELETE | `/api/admin/posts/:id` | JWT (role `admin`) | Zmaže (skryje) príspevok |
| POST | `/api/admin/run-distribution-now` | `X-Cron-Secret` header | Manuálne spustenie denného prerozdelenia |

## Ako funguje rotácia zbierok (30-minútová logika)

Implementované v `src/cron.js` → `ensureActiveProjectRotation()`, volané:
- pri **každom** `GET /api/feed/collections` (takže front-end vidí vždy aktuálny stav),
- **každú minútu** cez cron trigger `*/1 * * * *` (pre rotáciu aj keď nikto práve nenačítava feed).

Stavy projektu (`projects.status`): `waiting` → `active` → `completed` → (po 30 min rotácia na ďalší `active`).

1. Ak nie je žiadny `active`/`completed` projekt, automaticky sa povýši najlajkovanejší `waiting` projekt (`activated_at = now`).
2. Kým `now - activated_at < 30 min`, projekt je vo fáze `preparing` ("Příprava") — cron mu **nepripisuje peniaze**.
3. Po 30 minútach prechádza do fázy `running` — smie prijímať peniaze z denného prerozdelenia.
4. Keď `current_amount >= target_amount`, prepne sa na `completed` (`completed_at = now`), zobrazuje "Splněno / Úspěch".
5. Po ďalších 30 minútach od `completed_at` sa automaticky nahradí ďalším najlajkovanejším `waiting` projektom.

## Ako funguje denné prerozdelenie (cron `0 8 * * *`)

1. Každému aktívnemu užívateľovi s kreditom > 0 sa odpočíta 1 Kč.
2. Ak je aktuálny `active` projekt mimo ochrannej lehoty, prisype sa mu vyzbieraná suma (max do `target_amount`).
3. Prebytok (keď suma presiahne, čo projekt ešte potreboval) sa pripíše najlajkovanejšiemu `waiting` projektu (bez zmeny jeho statusu).
4. Do `contributions` sa zapíše, ktorému projektu dnešná koruna každého darcu pomohla (pre "projekty, ktorým som pomohol" v peňaženke).
5. Odošle sa push notifikácia cez OneSignal.
6. Beh sa zaznamená do `daily_distributions` — druhé spustenie v ten istý deň sa preskočí (idempotencia).

## Čo si premysli ďalej

- Nahlasovanie a admin moderovanie je funkčné, ale front-end admin panel treba napojiť (routy sú hotové).
- Cron `*/1 * * * *` sa v lokálnom `wrangler dev` nespúšťa automaticky — testuj cez `curl http://localhost:8787/cdn-cgi/local/scheduled` alebo endpoint `/api/admin/run-distribution-now`.
- Ak budeš mať veľa organizácií, zváž pridanie plnotextového FTS5 indexu na `organizations.name` namiesto `LIKE '%...%'`.
