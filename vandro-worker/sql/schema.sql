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
  handle TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'user',        -- 'user' | 'organization' | 'hotelier' | 'admin'
  credit_balance INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',     -- 'active' | 'suspended' | 'deleted'
  bio TEXT,
  avatar_url TEXT,
  cover_url TEXT,
  location TEXT,
  website TEXT,
  phone TEXT,
  geo_lat REAL,
  geo_lng REAL,
  geo_city TEXT,
  terms_accepted_at TEXT,
  terms_version TEXT,
  age_confirmed INTEGER NOT NULL DEFAULT 0,
  email_verified INTEGER NOT NULL DEFAULT 0,
  auth_provider TEXT DEFAULT 'password',    -- 'password' | 'google'
  google_id TEXT UNIQUE,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  recovery_codes_json TEXT,
  settings_json TEXT,
  public_checkins INTEGER NOT NULL DEFAULT 1,
  onboarding_done INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  last_login_ip TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_handle ON users(handle);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

-- ============================================================
-- ORGANIZÁCIE
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  region TEXT NOT NULL,
  district TEXT NOT NULL,
  city TEXT,
  address TEXT,
  description TEXT,
  logo_url TEXT,
  cover_url TEXT,
  website TEXT,
  phone TEXT,
  opening_hours TEXT,
  admission TEXT,
  geo_lat REAL,
  geo_lng REAL,
  is_verified INTEGER NOT NULL DEFAULT 0,
  verification_status TEXT DEFAULT 'unverified',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- UBYTOVANIE
-- ============================================================
CREATE TABLE IF NOT EXISTS accommodation (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  region TEXT NOT NULL,
  district TEXT NOT NULL,
  city TEXT,
  address TEXT,
  description TEXT,
  image_url TEXT,
  cover_url TEXT,
  external_link TEXT,
  website TEXT,
  phone TEXT,
  opening_hours TEXT,
  price_level TEXT,
  capacity INTEGER,
  geo_lat REAL,
  geo_lng REAL,
  is_verified INTEGER NOT NULL DEFAULT 0,
  verification_status TEXT DEFAULT 'unverified',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- RESTAURÁCIE
-- ============================================================
CREATE TABLE IF NOT EXISTS restaurants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  cuisine_type TEXT,
  region TEXT NOT NULL,
  district TEXT NOT NULL,
  city TEXT,
  address TEXT,
  description TEXT,
  image_url TEXT,
  cover_url TEXT,
  external_link TEXT,
  website TEXT,
  phone TEXT,
  opening_hours TEXT,
  price_level TEXT,
  geo_lat REAL,
  geo_lng REAL,
  is_verified INTEGER NOT NULL DEFAULT 0,
  verification_status TEXT DEFAULT 'unverified',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- ZBIERKY
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  target_amount INTEGER NOT NULL,
  current_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  activated_at TEXT,
  completed_at TEXT
);

-- ============================================================
-- PRÍSPEVKY
-- ============================================================
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  target_feed TEXT NOT NULL,
  business_id TEXT NOT NULL,
  text_content TEXT,
  content_html TEXT,
  image_url TEXT,
  geo_lat REAL,
  geo_lng REAL,
  geo_place TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  report_count INTEGER NOT NULL DEFAULT 0,
  hidden_by_reports INTEGER NOT NULL DEFAULT 0,
  mentions_json TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS post_media (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  image_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS post_hashtags (
  post_id TEXT NOT NULL REFERENCES posts(id),
  hashtag TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, hashtag)
);

CREATE INDEX IF NOT EXISTS idx_post_hashtags_tag ON post_hashtags(hashtag, created_at);

-- ============================================================
-- KOMENTÁRE
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  parent_id TEXT REFERENCES comments(id),
  comment_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- NAHLÁSENIA
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  reporter_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS moderation_flags (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  post_id TEXT REFERENCES posts(id),
  comment_id TEXT REFERENCES comments(id),
  reason TEXT,
  severity INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- FOLLOWS / BLOCKS / BOOKMARKS / WISHLIST
-- ============================================================
CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (follower_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_target ON follows(target_type, target_id);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id),
  blocked_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS bookmarks (
  user_id TEXT NOT NULL REFERENCES users(id),
  post_id TEXT NOT NULL REFERENCES posts(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS wishlist (
  user_id TEXT NOT NULL REFERENCES users(id),
  business_id TEXT NOT NULL,
  business_kind TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, business_id, business_kind)
);

-- ============================================================
-- CHECK-INS + ODZNAKY
-- ============================================================
CREATE TABLE IF NOT EXISTS checkins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  business_id TEXT NOT NULL,
  business_kind TEXT NOT NULL,
  note TEXT,
  image_url TEXT,
  geo_lat REAL,
  geo_lng REAL,
  visited_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins(user_id, visited_at);
CREATE INDEX IF NOT EXISTS idx_checkins_business ON checkins(business_id, business_kind);

CREATE TABLE IF NOT EXISTS user_badges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  badge_key TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0,
  progress INTEGER NOT NULL DEFAULT 0,
  earned_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, badge_key)
);

-- ============================================================
-- RECENZIE
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  business_id TEXT NOT NULL,
  business_kind TEXT NOT NULL,
  rating INTEGER NOT NULL,
  title TEXT,
  text TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, business_id, business_kind)
);

CREATE INDEX IF NOT EXISTS idx_reviews_business ON reviews(business_id, business_kind, status);

-- ============================================================
-- NOTIFIKÁCIE
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id),
  entity_type TEXT,
  entity_id TEXT,
  text TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

-- ============================================================
-- MENTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS mentions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- VERIFICATION REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS verification_requests (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  business_kind TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  doc_url TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

-- ============================================================
-- BUSINESS GALLERY
-- ============================================================
CREATE TABLE IF NOT EXISTS business_gallery (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  business_kind TEXT NOT NULL,
  image_url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gallery_business ON business_gallery(business_id, business_kind);

-- ============================================================
-- AUTH — verifikácia emailu, reset hesla, 2FA, login logs
-- ============================================================
CREATE TABLE IF NOT EXISTS email_verifications (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS twofa_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS login_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  email TEXT,
  ip TEXT,
  user_agent TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  method TEXT DEFAULT 'password',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- STORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  business_id TEXT,
  image_url TEXT NOT NULL,
  caption TEXT,
  media_type TEXT NOT NULL DEFAULT 'photo',
  media_urls_json TEXT,
  reply_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at);
CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id);

CREATE TABLE IF NOT EXISTS story_views (
  story_id TEXT NOT NULL REFERENCES stories(id),
  viewer_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (story_id, viewer_id)
);

CREATE TABLE IF NOT EXISTS story_replies (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- PUSH
-- ============================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- SKUPINY
-- ============================================================
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  is_private INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES groups(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_posts (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- DM (priame správy)
-- ============================================================
CREATE TABLE IF NOT EXISTS dm_threads (
  id TEXT PRIMARY KEY,
  user_a TEXT NOT NULL REFERENCES users(id),
  user_b TEXT NOT NULL REFERENCES users(id),
  last_message_at TEXT,
  last_message_preview TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_a, user_b)
);

CREATE TABLE IF NOT EXISTS dm_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES dm_threads(id),
  sender_id TEXT NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  image_url TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dm_messages_thread ON dm_messages(thread_id, created_at);

-- ============================================================
-- EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  business_id TEXT NOT NULL,
  business_kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  content_html TEXT,
  cover_image_url TEXT,
  gallery_json TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT,
  location_name TEXT,
  city TEXT,
  region TEXT,
  geo_lat REAL,
  geo_lng REAL,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_at);
CREATE INDEX IF NOT EXISTS idx_events_business ON events(business_id, business_kind);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  admin_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  reason TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- INDEXY
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orgs_region ON organizations(region, district);
CREATE INDEX IF NOT EXISTS idx_orgs_type ON organizations(type);
CREATE INDEX IF NOT EXISTS idx_rest_region ON restaurants(region, district);
CREATE INDEX IF NOT EXISTS idx_rest_type ON restaurants(type);
CREATE INDEX IF NOT EXISTS idx_acc_region ON accommodation(region, district);
CREATE INDEX IF NOT EXISTS idx_acc_type ON accommodation(type);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_posts_feed ON posts(target_feed, business_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_contributions_user ON contributions(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_resolved ON reports(resolved);

-- ============================================================
-- CONTRIBUTIONS / DAILY DISTRIBUTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS contributions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  amount INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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

-- ============================================================
-- TESTOVACÍ OBSAH
-- ============================================================
INSERT OR IGNORE INTO users (id, email, password_hash, password_salt, display_name, role, credit_balance, email_verified) VALUES
  ('u-admin', 'admin@vandro.cz', 'demo', 'demo', 'Správce Vandro', 'admin', 0, 1),
  ('u-org-1', 'info@hrad-krivoklat.cz', 'demo', 'demo', 'Hrad Křivoklát', 'organization', 0, 1),
  ('u-org-2', 'info@zoo-praha.cz', 'demo', 'demo', 'Zoo Praha', 'organization', 0, 1),
  ('u-org-3', 'info@muzeum-brno.cz', 'demo', 'demo', 'Technické muzeum Brno', 'organization', 0, 1),
  ('u-hotel-1', 'info@hotel-sneznik.cz', 'demo', 'demo', 'Hotel Sněžník', 'hotelier', 0, 1),
  ('u-hotel-2', 'info@penzion-vysocina.cz', 'demo', 'demo', 'Penzion Vysočina', 'hotelier', 0, 1),
  ('u-rest-1', 'info@restaurace-upotoka.cz', 'demo', 'demo', 'Restaurace U Potoka', 'hotelier', 0, 1),
  ('u-rest-2', 'info@pivovar-kutna.cz', 'demo', 'demo', 'Pivovar Kutná Hora', 'hotelier', 0, 1),
  ('u-tomas', 'tomas@example.com', 'demo', 'demo', 'Tomáš Krejčí', 'user', 245, 1);

INSERT OR IGNORE INTO organizations (id, user_id, name, type, region, district, city, description, logo_url, is_verified, verification_status) VALUES
  ('org-krivoklat', 'u-org-1', 'Hrad Křivoklát', 'hrad', 'Středočeský kraj', 'Rakovník', 'Křivoklát', 'Jeden z nejstarších českých hradů, obklopený lesy CHKO Křivoklátsko.', 'https://i.pravatar.cc/150?img=5', 1, 'verified'),
  ('org-zoo-praha', 'u-org-2', 'Zoo Praha', 'zoo', 'Hlavní město Praha', 'Praha', 'Praha', 'Jedna z nejlépe hodnocených zoologických zahrad na světě.', 'https://i.pravatar.cc/150?img=60', 1, 'verified'),
  ('org-muzeum-brno', 'u-org-3', 'Technické muzeum Brno', 'muzeum', 'Jihomoravský kraj', 'Brno-město', 'Brno', 'Interaktivní expozice techniky a průmyslové historie.', 'https://i.pravatar.cc/150?img=68', 0, 'unverified');

INSERT OR IGNORE INTO accommodation (id, user_id, name, type, region, district, city, description, image_url, external_link, capacity, is_verified, verification_status) VALUES
  ('acc-snez', 'u-hotel-1', 'Hotel Sněžník', 'hotel', 'Královéhradecký kraj', 'Trutnov', 'Pec pod Sněžkou', 'Rodinný hotel s výhledem na Krkonoše, ideální výchozí bod na túry.', 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&h=600&fit=crop', 'https://hotel-sneznik.cz', 42, 1, 'verified'),
  ('acc-vysocina', 'u-hotel-2', 'Penzion Vysočina', 'penzion', 'Kraj Vysočina', 'Žďár nad Sázavou', 'Žďár nad Sázavou', 'Klidné ubytování na kraji lesa, kolo a lyže půjčovna přímo na místě.', 'https://images.unsplash.com/photo-1521401830884-6c03c1c87ebb?w=800&h=600&fit=crop', 'https://penzion-vysocina.cz', 18, 0, 'unverified');

INSERT OR IGNORE INTO restaurants (id, user_id, name, type, cuisine_type, region, district, city, description, image_url, external_link, is_verified, verification_status) VALUES
  ('rest-upotoka', 'u-rest-1', 'Restaurace U Potoka', 'restaurace', 'ceska', 'Jihočeský kraj', 'Český Krumlov', 'Český Krumlov', 'Tradiční česká kuchyně v srdci starého města.', 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop', 'https://upotoka.cz', 1, 'verified'),
  ('rest-pivovar', 'u-rest-2', 'Pivovar Kutná Hora', 'pivovar', 'ceska', 'Středočeský kraj', 'Kutná Hora', 'Kutná Hora', 'Minipivovar s vlastní várkou a poctivými pochutinami.', 'https://images.unsplash.com/photo-1436076863939-06870fe779c2?w=800&h=600&fit=crop', 'https://pivovar-kutna.cz', 0, 'unverified');

INSERT OR IGNORE INTO projects (id, organization_id, title, description, cover_image_url, target_amount, current_amount, status, activated_at) VALUES
  ('proj-krivoklat-strecha', 'org-krivoklat', 'Oprava střechy purkrabství', 'Sbírka na opravu poškozené střechy purkrabství po zimních mrazech.', 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&h=600&fit=crop', 45000, 31200, 'active', datetime('now', '-45 minutes')),
  ('proj-zoo-vylety', 'org-zoo-praha', 'Nové výběhy pro lachtany', 'Rozšíření a modernizace výběhu pro lachtany a tuleně.', 'https://images.unsplash.com/photo-1547721064-da6cfb341d50?w=800&h=600&fit=crop', 120000, 54000, 'waiting', NULL),
  ('proj-muzeum-expo', 'org-muzeum-brno', 'Nová interaktivní expozice', 'Vybudování nové expozice o historii parní techniky.', 'https://images.unsplash.com/photo-1461360228754-6e81c478b882?w=800&h=600&fit=crop', 80000, 12000, 'waiting', NULL);

INSERT OR IGNORE INTO posts (id, user_id, target_feed, business_id, text_content, content_html, image_url, status) VALUES
  ('post-org-1', 'u-org-1', 'organization', 'org-krivoklat', 'Podzimní prohlídky hradu jsou v plném proudu, poslední vstup je v 16:00.', '<p>Podzimní prohlídky hradu jsou v plném proudu, poslední vstup je v 16:00.</p>', 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&h=600&fit=crop', 'published'),
  ('post-org-2', 'u-org-2', 'organization', 'org-zoo-praha', 'Vítáme nové mládě žirafy Rothschildovy! Můžete ho vidět od tohoto víkendu.', '<p>Vítáme nové mládě žirafy Rothschildovy! Můžete ho vidět od tohoto víkendu.</p>', 'https://images.unsplash.com/photo-1547721064-da6cfb341d50?w=800&h=600&fit=crop', 'published'),
  ('post-acc-1', 'u-hotel-1', 'accommodation', 'acc-snez', 'Podzimní balíček: 3 noci s polopenzí a vstupem do wellness za zvýhodněnou cenu.', '<p>Podzimní balíček: 3 noci s polopenzí a vstupem do wellness za zvýhodněnou cenu.</p>', 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&h=600&fit=crop', 'published'),
  ('post-gastro-1', 'u-rest-1', 'gastro', 'rest-upotoka', 'Dnešní polední menu: svíčková na smetaně nebo houbové rizoto. Rezervace doporučena.', '<p>Dnešní polední menu: svíčková na smetaně nebo houbové rizoto. Rezervace doporučena.</p>', 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop', 'published'),
  ('post-gastro-2', 'u-rest-2', 'gastro', 'rest-pivovar', 'Nová várka polotmavého ležáku je čepovaná od tohoto pátku!', '<p>Nová várka polotmavého ležáku je čepovaná od tohoto pátku!</p>', 'https://images.unsplash.com/photo-1436076863939-06870fe779c2?w=800&h=600&fit=crop', 'published');

INSERT OR IGNORE INTO post_media (id, post_id, image_url, sort_order)
  SELECT 'pm-' || id, id, image_url, 0 FROM posts WHERE image_url IS NOT NULL;

INSERT OR IGNORE INTO comments (id, post_id, user_id, comment_text) VALUES
  ('cm-1', 'post-org-2', 'u-tomas', 'To je nádherná zpráva, musíme se jet podívat!'),
  ('cm-2', 'post-gastro-1', 'u-tomas', 'Svíčková tam byla minule skvělá.');
