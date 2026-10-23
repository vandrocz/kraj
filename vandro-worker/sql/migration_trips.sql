-- Cestovatelský feed na profilu (výlety): max. 3 fotky, datum, krátký popis, poloha.
-- Zobrazuje se jen na profilu autora, v žádném jiném feedu.
CREATE TABLE IF NOT EXISTS trip_posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  caption TEXT,
  trip_date TEXT NOT NULL,
  place_name TEXT,
  lat REAL,
  lng REAL,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trip_posts_user ON trip_posts(user_id, trip_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS trip_post_media (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trip_posts(id),
  image_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_trip_post_media_trip ON trip_post_media(trip_id);
