-- Migration 008: Events als eigene Tabelle
--
-- Migration 006 hat Events als Beitraege mit type = 'event' in posts gelegt.
-- Beitraege und Events sind aber zwei verschiedene Dinge: ein Beitrag ist
-- ein Artikel mit Veroeffentlichungsdatum und Autor, ein Event ein Anlass
-- mit Datum, Ort, Preisen und Anmeldung. Ab hier hat jedes seine eigenen
-- Tabellen; sie teilen nur Bilder (media) und Kategorien (categories).
--
--   events                    Kopfdaten eines Anlasses
--   event_categories          weitere Kategorien neben der Hauptkategorie
--   event_sections            Bausteine des Inhalts (wie post_sections)
--   event_section_images      Bilder in Bausteinen
--   event_section_documents   Dateien in Dokument-Bausteinen
--
-- Die Angaben eines Anlasses sind dieselben wie frueher bei guidle, ohne den
-- Plan (keine Karte mehr als Pflicht; der Weg fuehrt ueber die Adresse):
--
--   kicker            Untertitel ueber dem Titel, z. B. "Workshop / Weiterbildung"
--   event_date        Tag des Anlasses
--   event_start       Beginn. Leer heisst: ganztags oder noch offen.
--   event_end         Ende, optional
--   location          Name des Orts, z. B. "Kantonsschule Zug"
--   street            Strasse und Nummer
--   city              PLZ und Ort, z. B. "6300 Zug"
--   prices            Preisstufen als JSON: [{"label": "Mitglieder", "value": "gratis"}, …]
--   registration_url  Ziel des Anmeldeknopfs: Formular, Website oder mailto:
--   audience          Zielgruppe, durch Komma getrennt
--   admission         Zutrittskonditionen in einem Satz
--   members_only      Nur fuer Mitglieder
--
-- Ablauf: Tabellen anlegen, die Events aus posts mit denselben Nummern
-- hinueberkopieren (samt Bausteinen, Bildern, Dokumenten und Kategorien),
-- dann aus posts loeschen und dort die Spalten aus 006 wieder entfernen.
-- Die Zeit stand in 006 als freier Text ("17.30 – 21.00 Uhr"); die erste
-- und zweite Uhrzeit darin werden zu Beginn und Ende.
--
-- Am besten vorher eine Sicherung der Datenbank ziehen (phpMyAdmin,
-- Reiter Exportieren). Die Migration laeuft in einem Stueck durch; bricht
-- sie mittendrin ab, stehen die Events eventuell schon in beiden Tabellen.
--
-- Rechte des API-Benutzers:
--
--   GRANT SELECT, INSERT, UPDATE, DELETE ON `events`                  TO 'db_user'@'localhost';
--   GRANT SELECT, INSERT, UPDATE, DELETE ON `event_categories`        TO 'db_user'@'localhost';
--   GRANT SELECT, INSERT, UPDATE, DELETE ON `event_sections`          TO 'db_user'@'localhost';
--   GRANT SELECT, INSERT, UPDATE, DELETE ON `event_section_images`    TO 'db_user'@'localhost';
--   GRANT SELECT, INSERT, UPDATE, DELETE ON `event_section_documents` TO 'db_user'@'localhost';

-- ── Tabellen ────────────────────────────────────────────────

CREATE TABLE `events`
(
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- Teil der URL: /events/generalversammlung-2026
  `slug`             VARCHAR(200) NOT NULL,
  `title`            VARCHAR(255) NOT NULL,
  `kicker`           VARCHAR(120) DEFAULT NULL,
  -- Kurzbeschreibung fuer die Uebersicht und als Einleitung.
  `excerpt`          TEXT NOT NULL,
  `event_date`       DATE NOT NULL,
  `event_start`      TIME DEFAULT NULL,
  `event_end`        TIME DEFAULT NULL,
  `location`         VARCHAR(160) NOT NULL,
  `street`           VARCHAR(160) DEFAULT NULL,
  `city`             VARCHAR(120) DEFAULT NULL,
  `prices`           JSON DEFAULT NULL,
  `registration_url` VARCHAR(500) DEFAULT NULL,
  `audience`         VARCHAR(255) DEFAULT NULL,
  `admission`        VARCHAR(500) DEFAULT NULL,
  `members_only`     TINYINT(1) NOT NULL DEFAULT 0,
  `cover_id`         INT UNSIGNED DEFAULT NULL,
  -- Hauptkategorie; weitere ueber event_categories.
  `category_id`      INT UNSIGNED DEFAULT NULL,
  `status`           ENUM('draft','published') NOT NULL DEFAULT 'draft',
  `created_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_events_slug` (`slug`),
  -- Deckt die Uebersicht ab: veroeffentlichte Events nach Datum.
  KEY `ix_events_status_date` (`status`, `event_date`),
  CONSTRAINT `fk_events_cover` FOREIGN KEY (`cover_id`)
    REFERENCES `media` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_events_category` FOREIGN KEY (`category_id`)
    REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `event_categories` (
  `event_id`    INT UNSIGNED NOT NULL,
  `category_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`event_id`, `category_id`),
  KEY `ix_ec_category` (`category_id`),
  CONSTRAINT `fk_ec_event` FOREIGN KEY (`event_id`)
    REFERENCES `events` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ec_category` FOREIGN KEY (`category_id`)
    REFERENCES `categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dieselben Arten wie post_sections. 'map' bleibt erlaubt, damit eine Karte
-- aus einem Event von vor dieser Migration mitkommt; neu anbieten tut der
-- Editor sie nicht mehr.
CREATE TABLE `event_sections` (
  `id`       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_id` INT UNSIGNED NOT NULL,
  `position` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `kind`     ENUM('text','heading','quote','image','gallery','table','document','link','map')
             NOT NULL DEFAULT 'text',
  `text`     MEDIUMTEXT NOT NULL,
  `url`      VARCHAR(500) DEFAULT NULL,
  `data`     JSON DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_es_event` (`event_id`, `position`),
  CONSTRAINT `fk_es_event` FOREIGN KEY (`event_id`)
    REFERENCES `events` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `event_section_images` (
  `section_id` INT UNSIGNED NOT NULL,
  `media_id`   INT UNSIGNED NOT NULL,
  `position`   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`section_id`, `media_id`),
  KEY `ix_esi_media` (`media_id`),
  CONSTRAINT `fk_esi_section` FOREIGN KEY (`section_id`)
    REFERENCES `event_sections` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_esi_media` FOREIGN KEY (`media_id`)
    REFERENCES `media` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `event_section_documents` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `section_id` INT UNSIGNED NOT NULL,
  `media_id`   INT UNSIGNED NOT NULL,
  `label`      VARCHAR(200) NOT NULL,
  `position`   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `ix_esd_section` (`section_id`, `position`),
  KEY `ix_esd_media` (`media_id`),
  CONSTRAINT `fk_esd_section` FOREIGN KEY (`section_id`)
    REFERENCES `event_sections` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_esd_media` FOREIGN KEY (`media_id`)
    REFERENCES `media` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Bestehende Events aus posts uebernehmen ────────────────
-- Mit denselben Nummern: die neuen Tabellen sind leer, so bleiben alle
-- Zuordnungen (Abschnitt → Bild, Abschnitt → Dokument) ohne Umrechnung
-- gueltig.

INSERT INTO `events`
       (`id`, `slug`, `title`, `excerpt`, `event_date`, `location`,
        `cover_id`, `category_id`, `status`, `created_at`, `updated_at`)
SELECT `id`, `slug`, `title`, `excerpt`, `event_date`, COALESCE(`location`, ''),
       `cover_id`, `category_id`, `status`, `created_at`, `updated_at`
  FROM `posts`
 WHERE `type` = 'event' AND `event_date` IS NOT NULL;

-- Erste Uhrzeit im Text: "17.30" oder "17:30".
UPDATE `events` e
  JOIN `posts` p ON p.`id` = e.`id`
   SET e.`event_start` = CAST(REPLACE(REGEXP_SUBSTR(p.`event_time`, '[0-9]{1,2}[.:][0-5][0-9]'), '.', ':') AS TIME)
 WHERE p.`event_time` REGEXP '[0-9]{1,2}[.:][0-5][0-9]';

-- Zweite Uhrzeit: dieselbe Suche im Rest hinter der ersten.
UPDATE `events` e
  JOIN `posts` p ON p.`id` = e.`id`
   SET e.`event_end` = CAST(REPLACE(REGEXP_SUBSTR(
         SUBSTRING(p.`event_time`,
                   LOCATE(REGEXP_SUBSTR(p.`event_time`, '[0-9]{1,2}[.:][0-5][0-9]'), p.`event_time`)
                   + CHAR_LENGTH(REGEXP_SUBSTR(p.`event_time`, '[0-9]{1,2}[.:][0-5][0-9]'))),
         '[0-9]{1,2}[.:][0-5][0-9]'), '.', ':') AS TIME)
 WHERE p.`event_time` REGEXP '[0-9]{1,2}[.:][0-5][0-9].*[0-9]{1,2}[.:][0-5][0-9]';

INSERT INTO `event_categories` (`event_id`, `category_id`)
SELECT pc.`post_id`, pc.`category_id`
  FROM `post_categories` pc
  JOIN `events` e ON e.`id` = pc.`post_id`;

INSERT INTO `event_sections` (`id`, `event_id`, `position`, `kind`, `text`, `url`, `data`)
SELECT s.`id`, s.`post_id`, s.`position`, s.`kind`, s.`text`, s.`url`, s.`data`
  FROM `post_sections` s
  JOIN `events` e ON e.`id` = s.`post_id`;

INSERT INTO `event_section_images` (`section_id`, `media_id`, `position`)
SELECT i.`section_id`, i.`media_id`, i.`position`
  FROM `post_section_images` i
  JOIN `event_sections` es ON es.`id` = i.`section_id`;

INSERT INTO `event_section_documents` (`section_id`, `media_id`, `label`, `position`)
SELECT d.`section_id`, d.`media_id`, d.`label`, d.`position`
  FROM `post_section_documents` d
  JOIN `event_sections` es ON es.`id` = d.`section_id`;

-- ── posts wieder nur fuer Beitraege ────────────────────────
-- Abschnitte, Bilder, Dokumente und Kategorien gehen per ON DELETE CASCADE
-- mit; ihre Kopien stehen oben schon in den Event-Tabellen.

DELETE FROM `posts` WHERE `type` = 'event';

ALTER TABLE `posts`
  DROP KEY `ix_posts_type_event`,
  DROP COLUMN `type`,
  DROP COLUMN `event_date`,
  DROP COLUMN `event_time`,
  DROP COLUMN `location`;
