-- Náš kraj / Vandro — kompletná D1 schéma
-- Spusti: npx wrangler d1 execute naskraj-db --remote --file=./sql/schema.sql

PRAGMA foreign_keys = ON;

-- ============================================================
-- UŽÍVATELIA
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',        -- 'user' | 'organization' | 'hotelier' | 'admin'
  credit_balance INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',     -- 'active' | 'suspended'
  terms_accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- PODNIKY / SUBJEKTY (tri druhy, každý viazaný na jedného usera)
-- ============================================================

-- Organizácie: hrady, zámky, múzeá, ZOO, prírodné pamiatky, lyžiarske strediská...
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,               -- 'hrad' | 'zamek' | 'muzeum' | 'lyzarske_stredisko' | 'galerie' | 'zoo' | 'prirodni_pamatka'
  region TEXT NOT NULL,             -- kraj ČR
  district TEXT NOT NULL,           -- okres ČR
  description TEXT,
  logo_url TEXT,
  is_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Reštaurácie / kaviarne / hospody / pivovary (sekcia Gastro)
CREATE TABLE IF NOT EXISTS restaurants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,                -- 'restaurace' | 'kavarna' | 'hospoda' | 'pivovar'
  cuisine_type TEXT,                 -- 'ceska' | 'italska' | 'asijska' | 'vegan' | ...
  region TEXT NOT NULL,
  district TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  external_link TEXT,
  is_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ubytovanie: hotely, penzióny, kempy (sekcia Ubytování)
CREATE TABLE IF NOT EXISTS accommodation (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,                -- 'hotel' | 'penzion' | 'kemp'
  region TEXT NOT NULL,
  district TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  external_link TEXT,
  capacity INTEGER,
  is_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- ZBIERKY (crowdfunding projekty organizácií)
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  target_amount INTEGER NOT NULL,
  current_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting',   -- 'waiting' | 'active' | 'completed'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  activated_at TEXT,     -- kedy sa projekt dostal na vrch feedu (začiatok 30 min ochrannej lehoty)
  completed_at TEXT      -- kedy dosiahol 100 % (začiatok 30 min "Úspěch" zobrazenia)
);

-- ============================================================
-- PRÍSPEVKY (spoločná tabuľka pre všetky 3 sociálne siete)
-- ============================================================
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  target_feed TEXT NOT NULL,        -- 'organization' | 'accommodation' | 'gastro'
  business_id TEXT NOT NULL,        -- id z organizations / accommodation / restaurants (podľa target_feed)
  text_content TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'published',  -- 'published' | 'removed'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- KOMENTÁRE
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  comment_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- NAHLÁSENIA PRÍSPEVKOV (pre admin sekciu "Nahlásené příspěvky")
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  reporter_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- PRÍSPEVKY DARCOV (audit, aby si užívateľ vedel pozrieť "projekty, ktorým pomohol")
-- Zapisuje sa automaticky pri dennom prerozdelení kreditu.
-- ============================================================
CREATE TABLE IF NOT EXISTS contributions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  amount INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- AUDIT DENNÉHO PREROZDELENIA (idempotencia cronu)
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_distributions (
  id TEXT PRIMARY KEY,
  run_date TEXT NOT NULL,
  total_collected INTEGER NOT NULL,
  users_charged INTEGER NOT NULL,
  funded_project_id TEXT,
  overflow_project_id TEXT,
  overflow_amount INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orgs_region ON organizations(region, district);
CREATE INDEX IF NOT EXISTS idx_orgs_type ON organizations(type);
CREATE INDEX IF NOT EXISTS idx_rest_region ON restaurants(region, district);
CREATE INDEX IF NOT EXISTS idx_rest_type ON restaurants(type);
CREATE INDEX IF NOT EXISTS idx_acc_region ON accommodation(region, district);
CREATE INDEX IF NOT EXISTS idx_acc_type ON accommodation(type);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_posts_feed ON posts(target_feed, business_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_contributions_user ON contributions(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_resolved ON reports(resolved);

-- ============================================================
-- TESTOVACÍ OBSAH
-- ============================================================

-- Heslá všetkých testovacích účtov nižšie sú neplatné PBKDF2 hashe ('demo') —
-- slúžia len na to, aby feedy mali dáta. Pre reálne prihlásenie použi /api/auth/register.

INSERT OR IGNORE INTO users (id, email, password_hash, password_salt, display_name, role, credit_balance) VALUES
  ('u-admin', 'admin@vandro.cz', 'demo', 'demo', 'Správce Vandro', 'admin', 0),
  ('u-org-1', 'info@hrad-krivoklat.cz', 'demo', 'demo', 'Hrad Křivoklát', 'organization', 0),
  ('u-org-2', 'info@zoo-praha.cz', 'demo', 'demo', 'Zoo Praha', 'organization', 0),
  ('u-org-3', 'info@muzeum-brno.cz', 'demo', 'demo', 'Technické muzeum Brno', 'organization', 0),
  ('u-hotel-1', 'info@hotel-sneznik.cz', 'demo', 'demo', 'Hotel Sněžník', 'hotelier', 0),
  ('u-hotel-2', 'info@penzion-vysocina.cz', 'demo', 'demo', 'Penzion Vysočina', 'hotelier', 0),
  ('u-rest-1', 'info@restaurace-upotoka.cz', 'demo', 'demo', 'Restaurace U Potoka', 'hotelier', 0),
  ('u-rest-2', 'info@pivovar-kutna.cz', 'demo', 'demo', 'Pivovar Kutná Hora', 'hotelier', 0),
  ('u-tomas', 'tomas@example.com', 'demo', 'demo', 'Tomáš Krejčí', 'user', 245);

INSERT OR IGNORE INTO organizations (id, user_id, name, type, region, district, description, logo_url, is_verified) VALUES
  ('org-krivoklat', 'u-org-1', 'Hrad Křivoklát', 'hrad', 'Středočeský kraj', 'Rakovník', 'Jeden z nejstarších českých hradů, obklopený lesy CHKO Křivoklátsko.', 'https://i.pravatar.cc/150?img=5', 1),
  ('org-zoo-praha', 'u-org-2', 'Zoo Praha', 'zoo', 'Hlavní město Praha', 'Praha', 'Jedna z nejlépe hodnocených zoologických zahrad na světě.', 'https://i.pravatar.cc/150?img=60', 1),
  ('org-muzeum-brno', 'u-org-3', 'Technické muzeum Brno', 'muzeum', 'Jihomoravský kraj', 'Brno-město', 'Interaktivní expozice techniky a průmyslové historie.', 'https://i.pravatar.cc/150?img=68', 0);

INSERT OR IGNORE INTO accommodation (id, user_id, name, type, region, district, description, image_url, external_link, capacity, is_verified) VALUES
  ('acc-snez', 'u-hotel-1', 'Hotel Sněžník', 'hotel', 'Královéhradecký kraj', 'Trutnov', 'Rodinný hotel s výhledem na Krkonoše, ideální výchozí bod na túry.', 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&h=600&fit=crop', 'https://hotel-sneznik.cz', 42, 1),
  ('acc-vysocina', 'u-hotel-2', 'Penzion Vysočina', 'penzion', 'Kraj Vysočina', 'Žďár nad Sázavou', 'Klidné ubytování na kraji lesa, kolo a lyže půjčovna přímo na místě.', 'https://images.unsplash.com/photo-1521401830884-6c03c1c87ebb?w=800&h=600&fit=crop', 'https://penzion-vysocina.cz', 18, 0);

INSERT OR IGNORE INTO restaurants (id, user_id, name, type, cuisine_type, region, district, description, image_url, external_link, is_verified) VALUES
  ('rest-upotoka', 'u-rest-1', 'Restaurace U Potoka', 'restaurace', 'ceska', 'Jihočeský kraj', 'Český Krumlov', 'Tradiční česká kuchyně v srdci starého města.', 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop', 'https://upotoka.cz', 1),
  ('rest-pivovar', 'u-rest-2', 'Pivovar Kutná Hora', 'pivovar', 'ceska', 'Středočeský kraj', 'Kutná Hora', 'Minipivovar s vlastní várkou a poctivými pochutinami.', 'https://images.unsplash.com/photo-1436076863939-06870fe779c2?w=800&h=600&fit=crop', 'https://pivovar-kutna.cz', 0);

INSERT OR IGNORE INTO projects (id, organization_id, title, description, cover_image_url, target_amount, current_amount, status, activated_at) VALUES
  ('proj-krivoklat-strecha', 'org-krivoklat', 'Oprava střechy purkrabství', 'Sbírka na opravu poškozené střechy purkrabství po zimních mrazech.', 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&h=600&fit=crop', 45000, 31200, 'active', datetime('now', '-45 minutes')),
  ('proj-zoo-vylety', 'org-zoo-praha', 'Nové výběhy pro lachtany', 'Rozšíření a modernizace výběhu pro lachtany a tuleně.', 'https://images.unsplash.com/photo-1547721064-da6cfb341d50?w=800&h=600&fit=crop', 120000, 54000, 'waiting', NULL),
  ('proj-muzeum-expo', 'org-muzeum-brno', 'Nová interaktivní expozice', 'Vybudování nové expozice o historii parní techniky.', 'https://images.unsplash.com/photo-1461360228754-6e81c478b882?w=800&h=600&fit=crop', 80000, 12000, 'waiting', NULL);

INSERT OR IGNORE INTO posts (id, user_id, target_feed, business_id, text_content, image_url, status) VALUES
  ('post-org-1', 'u-org-1', 'organization', 'org-krivoklat', 'Podzimní prohlídky hradu jsou v plném proudu, poslední vstup je v 16:00.', 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&h=600&fit=crop', 'published'),
  ('post-org-2', 'u-org-2', 'organization', 'org-zoo-praha', 'Vítáme nové mládě žirafy Rothschildovy! Můžete ho vidět od tohoto víkendu.', 'https://images.unsplash.com/photo-1547721064-da6cfb341d50?w=800&h=600&fit=crop', 'published'),
  ('post-acc-1', 'u-hotel-1', 'accommodation', 'acc-snez', 'Podzimní balíček: 3 noci s polopenzí a vstupem do wellness za zvýhodněnou cenu.', 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&h=600&fit=crop', 'published'),
  ('post-gastro-1', 'u-rest-1', 'gastro', 'rest-upotoka', 'Dnešní polední menu: svíčková na smetaně nebo houbové rizoto. Rezervace doporučena.', 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop', 'published'),
  ('post-gastro-2', 'u-rest-2', 'gastro', 'rest-pivovar', 'Nová várka polotmavého ležáku je čepovaná od tohoto pátku!', 'https://images.unsplash.com/photo-1436076863939-06870fe779c2?w=800&h=600&fit=crop', 'published');

INSERT OR IGNORE INTO comments (id, post_id, user_id, comment_text) VALUES
  ('cm-1', 'post-org-2', 'u-tomas', 'To je nádherná zpráva, musíme se jet podívat!'),
  ('cm-2', 'post-gastro-1', 'u-tomas', 'Svíčková tam byla minule skvělá.');
