-- Migration 003: Bloecke in Beitragsabschnitten
--
-- Bis hierher war ein Abschnitt (post_sections) immer Fliesstext mit null
-- bis zwei Bildern. Der Block-Editor im CMS kennt mehr Bausteine, deshalb
-- bekommt jeder Abschnitt eine Art.
--
--   text     Fliesstext (bisheriges Verhalten, daher der Standardwert)
--   heading  Zwischentitel
--   quote    Hervorgehobenes Zitat
--   image    Ein Bild, Text ist die Bildlegende
--   gallery  Zwei Bilder nebeneinander, Text ist die Bildlegende
--
-- Die Spalte hat einen Standardwert und ist damit rueckwaertskompatibel:
-- bestehende Zeilen bleiben Fliesstext, die Lese-API liefert weiterhin
-- dieselben Abschnitte wie zuvor.
--
-- Berechtigungen fuer den Datenbankbenutzer des CMS:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON `posts`               TO 'db_user'@'localhost';
--   GRANT SELECT, INSERT, UPDATE, DELETE ON `post_sections`       TO 'db_user'@'localhost';
--   GRANT SELECT, INSERT, UPDATE, DELETE ON `post_section_images` TO 'db_user'@'localhost';
--   GRANT SELECT, INSERT, UPDATE, DELETE ON `post_categories`     TO 'db_user'@'localhost';
--   GRANT SELECT, INSERT                 ON `media`               TO 'db_user'@'localhost';

ALTER TABLE `post_sections`
  ADD COLUMN `kind` ENUM('text','heading','quote','image','gallery')
      NOT NULL DEFAULT 'text' AFTER `position`;
