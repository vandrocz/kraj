-- Migrácia: pridá stĺpec na zaznamenanie súhlasu s obchodními podmínkami při registraci.
-- Spusti v D1 konzole PO existujúcej schéme (neruší žiadne dáta, len pridáva stĺpec):
--
-- npx wrangler d1 execute naskraj-db --remote --file=./sql/migration_terms.sql

ALTER TABLE users ADD COLUMN terms_accepted_at TEXT;
