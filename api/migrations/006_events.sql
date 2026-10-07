-- Migration 006: Events und Karten-Baustein
--
-- Die Verbandsanlaesse kamen bisher als iframe von guidle.com. Sie werden
-- jetzt im eigenen CMS gepflegt – mit denselben Bausteinen wie die
-- Beitraege. Darum keine eigene Tabelle: ein Event ist ein Beitrag mit
-- type = 'event' und drei zusaetzlichen Angaben.
--
--   type        'post' (bisheriges Verhalten, daher der Standardwert) oder
--               'event'
--   event_date  Tag des Events. Pflicht fuer Events, bei Beitraegen leer.
--   event_time  Zeit als freier Text, z. B. "17.30 – 21.00 Uhr". Optional.
--   location    Ort in einer Zeile, z. B. "Kantonsschule Zug". Pflicht fuer
--               Events, bei Beitraegen leer.
--
-- Dazu kommt die Bausteinart 'map': eine Karte mit Standort. Breite, Laenge
-- und Zoomstufe stehen als JSON in post_sections.data, die Adresse im Text.
-- Fuer Events ist sie Pflicht – das prueft die API.
--
-- Bestehende Zeilen bleiben Beitraege. Neue Tabellen gibt es keine, die
-- Rechte des Datenbankbenutzers aus Migration 003/005 genuegen.

ALTER TABLE `posts`
  ADD COLUMN `type`       ENUM('post','event') NOT NULL DEFAULT 'post' AFTER `id`,
  ADD COLUMN `event_date` DATE         DEFAULT NULL AFTER `published_at`,
  ADD COLUMN `event_time` VARCHAR(60)  DEFAULT NULL AFTER `event_date`,
  ADD COLUMN `location`   VARCHAR(160) DEFAULT NULL AFTER `event_time`,
  -- Deckt die Eventuebersicht ab: veroeffentlichte Events nach Datum.
  ADD KEY `ix_posts_type_event` (`type`, `status`, `event_date`);

ALTER TABLE `post_sections`
  MODIFY COLUMN `kind`
      ENUM('text','heading','quote','image','gallery','table','document','link','map')
      NOT NULL DEFAULT 'text';
