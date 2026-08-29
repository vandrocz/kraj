-- Vandro D1 schema
-- Spusti tieto príkazy v Cloudflare D1 konzole (Dashboard -> D1 -> naskraj-db -> Console)
-- alebo cez: wrangler d1 execute naskraj-db --remote --file=./sql/schema.sql

PRAGMA foreign_keys = ON;

-- Užívatelia (bežní ľudia aj organizácie, rozlíšené stĺpcom role)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',          -- 'user' | 'organization' | 'admin'
  credit_balance INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',       -- 'active' | 'suspended'
  is_approved_org INTEGER NOT NULL DEFAULT 0,  -- 1 = schválená organizácia, smie postovať
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Zbierky / projekty, o ktoré sa uchádza denné prerozdelenie kreditu
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  target_amount INTEGER NOT NULL,
  current_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting',      -- 'waiting' | 'funded' | 'in_progress' | 'completed'
  funded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Príspevky organizácií vo feede (naviazané na projekt, môžu byť aj samostatné)
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  text_content TEXT,
  image_url TEXT,
  sponsored INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Komentáre pod príspevkami
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  comment_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Denný log strhávania kreditu a prerozdelenia (audit trail pre cron)
CREATE TABLE IF NOT EXISTS daily_distributions (
  id TEXT PRIMARY KEY,
  run_date TEXT NOT NULL,               -- YYYY-MM-DD
  total_collected INTEGER NOT NULL,
  users_charged INTEGER NOT NULL,
  distribution_json TEXT,               -- JSON so zoznamom project_id -> suma
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_project ON posts(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ---- Testovací obsah (voliteľné, môžeš spustiť rovno s CREATE TABLE) ----

INSERT OR IGNORE INTO users (id, email, password_hash, password_salt, display_name, role, credit_balance, is_approved_org)
VALUES
  ('org-ceske-svycarsko', 'info@ceskesvycarsko.cz', 'demo', 'demo', 'Národní park České Švýcarsko', 'organization', 0, 1),
  ('org-krkonose', 'info@krnap.cz', 'demo', 'demo', 'Krkonošský národní park', 'organization', 0, 1),
  ('org-moravsky-kras', 'info@moravskykras.cz', 'demo', 'demo', 'CHKO Moravský kras', 'organization', 0, 1),
  ('user-tomas', 'tomas@example.com', 'demo', 'demo', 'Tomáš Krejčí', 'user', 245, 0);

INSERT OR IGNORE INTO projects (id, owner_id, title, description, cover_image_url, target_amount, current_amount, status)
VALUES
  ('proj-kutna-hora', 'org-ceske-svycarsko', 'Poklady Kutnohorska', 'Chrám sv. Barbory, kostnice a vyhliadky nad riekou Vrchlicí. Zbierka financuje obnovu značenia.', 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&h=600&fit=crop', 45000, 31200, 'in_progress'),
  ('proj-labe', 'org-krkonose', 'Podél Labe z Poděbrad', 'Cyklo-pěší trasa, výťažok na opravu lavičiek.', 'https://images.unsplash.com/photo-1500534623283-312aade485b7?w=800&h=600&fit=crop', 18000, 18000, 'funded'),
  ('proj-rozhledny', 'org-moravsky-kras', 'Kolínské rozhledny', 'Tři rozhledny s výhledem na meandry Labe.', 'https://images.unsplash.com/photo-1476231682828-37e571bc172f?w=800&h=600&fit=crop', 60000, 22400, 'waiting');

INSERT OR IGNORE INTO posts (id, project_id, author_id, text_content, image_url, sponsored)
VALUES
  ('post-1', 'proj-kutna-hora', 'org-ceske-svycarsko', 'Pravčická brána právě teď v ranní mlze. Otevřeno denně od 8:00.', 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=800&h=600&fit=crop', 1),
  ('post-2', NULL, 'org-krkonose', 'Sněžka se probouzí do podzimu. Chodník na vrchol je aktuálně bez omezení.', 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop', 0),
  ('post-3', 'proj-rozhledny', 'org-moravsky-kras', 'Macocha z nové vyhlídkové plošiny — otevíráme tento pátek!', 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=800&h=600&fit=crop', 1);

INSERT OR IGNORE INTO comments (id, post_id, user_id, comment_text)
VALUES
  ('c-1', 'post-1', 'user-tomas', 'Byla jsem tam minulý týden, nádhera!'),
  ('c-2', 'post-2', 'user-tomas', 'Skvělá zpráva, jdeme tento víkend!');
