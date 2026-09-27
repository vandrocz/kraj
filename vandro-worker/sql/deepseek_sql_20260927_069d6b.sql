-- Migrácia: galéria "O nás" pre podniky (max 6 fotiek s popismi)

CREATE TABLE IF NOT EXISTS business_gallery (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  business_kind TEXT NOT NULL,    -- 'organizations' | 'accommodation' | 'restaurants'
  image_url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gallery_business ON business_gallery(business_kind, business_id, sort_order);