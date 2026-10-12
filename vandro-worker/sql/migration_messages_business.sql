-- Kontext podniku u soukromých zpráv (komu a o jakém podniku se konverzace vede).
-- Spusťte v D1 konzoli JEDNOU. Pokud sloupec už existuje, D1 vrátí "duplicate column name", což je v pořádku.
ALTER TABLE dm_threads ADD COLUMN business_kind TEXT;
ALTER TABLE dm_threads ADD COLUMN business_id TEXT;
ALTER TABLE dm_threads ADD COLUMN business_name TEXT;
