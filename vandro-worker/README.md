# Vandro API — Cloudflare Worker (Hono  )

Backend pre appku Vandro. Beží na Cloudflare Workers, používa D1 (SQL databáza), R2 (fotky) a KV (rýchly systém lajkov).

## 1. Nastavenie D1 databázy

```bash
npx wrangler d1 execute naskraj-db --remote --file=./sql/schema.sql
```

Toto vytvorí tabuľky `users`, `projects`, `posts`, `comments`, `daily_distributions` a rovno vloží testovací obsah (3 organizácie, 3 zbierky, 3 príspevky, 2 komentáre).

> Testoví užívatelia majú `password_hash = 'demo'`, čo **nie je platný PBKDF2 hash** — prihlásenie cez `/api/auth/login` s nimi teda nebude fungovať, kým si cez `/api/auth/register` nevytvoríš reálny účet. Testovací obsah slúži len na to, aby feed a zbierky mali dáta na zobrazenie.

## 2. Tajomstvá (secrets)

Nikdy ich nedávaj do `wrangler.toml` v čistom texte:

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put CRON_SECRET
npx wrangler secret put ONESIGNAL_API_KEY
```

- `JWT_SECRET` — ľubovoľný dlhý náhodný reťazec (napr. `openssl rand -base64 32`).
- `CRON_SECRET` — tajný kľúč na manuálne spustenie `/api/admin/run-distribution-now` (testovanie cronu bez čakania do rána).
- `ONESIGNAL_API_KEY` — REST API kľúč z OneSignal dashboardu. Ak ho nenastavíš, push notifikácie sa len vypíšu do logu a nič sa neodošle (appka nespadne).

## 3. Verejné premenné

V `wrangler.toml` uprav podľa reálnych domén:

- `ALLOWED_ORIGIN` — presná adresa tvojho front-endu (napr. `https://kraj.vandro.cz`), aby CORS pustil len jeho.
- `R2_PUBLIC_BASE` — verejná URL adresa, na ktorej sú prístupné súbory z R2 bucketu `naskraj-media` (nastav si buď R2 custom domain, alebo Cloudflare Public Development URL v Dashboard -> R2 -> naskraj-media -> Settings).
- `ONESIGNAL_APP_ID` — ID tvojej OneSignal aplikácie.

## 4. Nasadenie

```bash
npm install
npx wrangler deploy
```

Následne v Cloudflare Dashboard -> Workers & Pages -> vandro-api -> Settings -> Triggers pridaj custom domain `api.[nazov].vandro.cz`.

## 5. Otestovanie cronu bez čakania do 8:00

```bash
curl -X POST https://api.[nazov].vandro.cz/api/admin/run-distribution-now \
  -H "X-Cron-Secret: TVOJ_CRON_SECRET"
```

## Prehľad API routes

| Metóda | Cesta | Auth | Popis |
|---|---|---|---|
| POST | `/api/auth/register` | — | Registrácia (email, password, displayName) |
| POST | `/api/auth/login` | — | Prihlásenie, vráti JWT |
| GET | `/api/user/wallet` | JWT | Aktuálny kredit |
| POST | `/api/projects/:id/like` | JWT | Lajk projektu (KV, bez duplicít) |
| GET | `/api/projects/:id/likes` | — | Počet lajkov projektu |
| GET | `/api/feed` | — | Feed príspevkov s fotkami, progresom zbierky, počtom lajkov/komentárov |
| GET | `/api/feed/:id/comments` | — | Komentáre pod príspevkom |
| POST | `/api/feed/:id/comment` | JWT | Pridanie komentára |
| POST | `/api/admin/posts` | JWT + org | Nahratie príspevku s fotkou (multipart/form-data: `file`, `text`, `project_id`) |
| POST | `/api/admin/run-distribution-now` | `X-Cron-Secret` header | Manuálne spustenie denného prerozdelenia |

## Ako funguje denné prerozdelenie (cron o 8:00)

1. Každému aktívnemu užívateľovi s kreditom > 0 sa odpočíta 1 Kč.
2. Vypočíta sa celková vyzbieraná suma (počet strhnutých korún).
3. Čakajúce projekty (`status = 'waiting'`) sa zoradia podľa počtu lajkov v KV.
4. Postupne sa kompletne dofinancujú top projekty (každý s hodinovým odstupom v pláne), kým stačia peniaze na celý projekt.
5. Zvyšná suma (ktorá nestačí na celý ďalší projekt) sa pripíše poslednému rozpracovanému projektu (`status = 'in_progress'`).
6. Odošle sa push notifikácia cez OneSignal s textom, ktorému projektu dnešná koruna pomohla.
7. Zápis behu sa uloží do `daily_distributions` — ak cron spustíš dvakrát v ten istý deň, druhýkrát sa nič nestrhne (idempotencia).

## Čo si premysli/doplň ďalej

- Momentálne hocikto s JWT tokenom môže lajkovať; ak chceš povoliť lajky aj bez prihlásenia, uprav `requireAuth` na `/api/projects/:id/like`.
- Rola `organization` sa nastavuje ručne v D1 (`UPDATE users SET role = 'organization', is_approved_org = 1 WHERE id = ...`) — schvaľovací flow v adminovi zatiaľ nie je súčasťou tohto kódu.
- Časové pásmo cronu je UTC; `0 8 * * *` zodpovedá 9:00/10:00 SEČ/SELČ podľa ročného obdobia — uprav podľa potreby.
