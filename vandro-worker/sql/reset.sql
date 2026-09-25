-- Vyčistenie D1 databázy pred znovu-spustením schema.sql
-- Spusti TOTO PRVÉ, ak dostávaš chyby ako "no such column" pri CREATE INDEX —
-- znamená to, že v databáze už existujú tabuľky zo staršej verzie projektu.
--
-- POZOR: toto nezvratne zmaže všetky dáta v týchto tabuľkách. Keďže ide zatiaľ
-- len o testovací obsah, je to v poriadku.

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS daily_distributions;
DROP TABLE IF EXISTS contributions;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS accommodation;
DROP TABLE IF EXISTS restaurants;
DROP TABLE IF EXISTS organizations;
DROP TABLE IF EXISTS users;

PRAGMA foreign_keys = ON;
