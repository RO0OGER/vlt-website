-- ============================================================
--  vlt-Website – Datenbankschema
-- ============================================================
--
--  Ersetzt das WordPress-Schema (wpd7_*) durch klar benannte
--  Tabellen mit echten Fremdschluesseln. Die Struktur folgt den
--  Interfaces, die das Angular-Frontend heute schon verwendet
--  (BlogPost, PostSection, GalleryAlbum, BoardMember), damit die
--  API liefern kann, was die Komponenten ohnehin erwarten.
--
--  Unterschiede zu WordPress, bewusst gesetzt:
--    * Keine EAV-Tabellen. Jedes Feld hat eine eigene Spalte mit
--      passendem Datentyp – kein postmeta, kein serialisiertes PHP.
--    * Echte FOREIGN KEYs. WordPress hat keine; die Integritaet
--      haengt dort allein am Anwendungscode.
--    * Durchgehend utf8mb4. WordPress mischt utf8mb3 und utf8mb4,
--      was beim JOIN ueber Tabellengrenzen Kollationsfehler gibt.
--    * Keine Caches, keine Logs, keine Transients in der DB.
--
--  Einspielen: in phpMyAdmin die neue Datenbank auswaehlen,
--  Reiter "Importieren", diese Datei hochladen.
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ── Medien ──────────────────────────────────────────────────
-- Eine Zeile je Datei. Die Datei selbst liegt im Dateisystem
-- unter public/, hier stehen nur Pfad und Metadaten – wie in
-- WordPress auch, nur ohne den postmeta-Umweg.

DROP TABLE IF EXISTS `media`;
CREATE TABLE `media` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- Pfad relativ zum Webroot, z. B. "medien/2024/vernetzungsanlass-01.webp"
  `path`       VARCHAR(255) NOT NULL,
  -- Pflicht, damit die Seite zugaenglich bleibt (Screenreader).
  `alt`        VARCHAR(255) NOT NULL DEFAULT '',
  `mime`       VARCHAR(100) NOT NULL,
  -- Bei Bildern gesetzt; die API rechnet daraus das Seitenverhaeltnis
  -- (ratio = height/width), das die Masonry-Galerie braucht.
  `width`      SMALLINT UNSIGNED DEFAULT NULL,
  `height`     SMALLINT UNSIGNED DEFAULT NULL,
  `bytes`      INT UNSIGNED DEFAULT NULL,
  -- Herkunft aus der alten Seite, damit man Bilder spaeter zuordnen kann.
  `legacy_url` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_media_path` (`path`),
  KEY `ix_media_mime` (`mime`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Kategorien ──────────────────────────────────────────────
-- Gemeinsam fuer Beitraege und Galerien. Die Filterleiste im
-- Frontend leitet sich daraus ab, statt fest im Template zu stehen.

DROP TABLE IF EXISTS `categories`;
CREATE TABLE `categories` (
  `id`   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug` VARCHAR(100) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  -- Reihenfolge in der Filterleiste; gleiche Werte werden alphabetisch sortiert.
  `sort` SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_categories_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Beitraege ───────────────────────────────────────────────

DROP TABLE IF EXISTS `posts`;
CREATE TABLE `posts` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- Teil der URL: /beitraege/rueckblick-pensionierten-treffen
  `slug`          VARCHAR(200) NOT NULL,
  `title`         VARCHAR(255) NOT NULL,
  -- Anrisstext fuer die Karte in der Uebersicht.
  `excerpt`       TEXT NOT NULL,
  `published_at`  DATE NOT NULL,
  `author`        VARCHAR(120) DEFAULT NULL,
  -- Geschaetzte Lesedauer in Minuten. Das Frontend formatiert "6 min".
  `read_minutes`  TINYINT UNSIGNED DEFAULT NULL,
  `cover_id`      INT UNSIGNED DEFAULT NULL,
  -- Hauptkategorie: steuert die Karte. Weitere ueber post_categories.
  `category_id`   INT UNSIGNED DEFAULT NULL,
  `status`        ENUM('draft','published') NOT NULL DEFAULT 'draft',
  -- Alte WordPress-ID, damit Weiterleitungen und ein zweiter
  -- Migrationslauf die Zuordnung nicht verlieren.
  `legacy_wp_id`  INT UNSIGNED DEFAULT NULL,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_posts_slug` (`slug`),
  UNIQUE KEY `uq_posts_legacy` (`legacy_wp_id`),
  -- Deckt die Uebersichtsabfrage ab: veroeffentlichte Beitraege, neuste zuerst.
  KEY `ix_posts_status_date` (`status`, `published_at`),
  CONSTRAINT `fk_posts_cover` FOREIGN KEY (`cover_id`)
    REFERENCES `media` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_posts_category` FOREIGN KEY (`category_id`)
    REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Weitere Kategorien neben der Hauptkategorie (n:m).
DROP TABLE IF EXISTS `post_categories`;
CREATE TABLE `post_categories` (
  `post_id`     INT UNSIGNED NOT NULL,
  `category_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`post_id`, `category_id`),
  KEY `ix_pc_category` (`category_id`),
  CONSTRAINT `fk_pc_post` FOREIGN KEY (`post_id`)
    REFERENCES `posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pc_category` FOREIGN KEY (`category_id`)
    REFERENCES `categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Abschnitte der Detailseite: Text mit null bis zwei Bildern.
-- Getrennt gespeichert statt als ein HTML-Blob, damit das Layout
-- die Bilder selbst setzen kann und der Text sauber bleibt.
DROP TABLE IF EXISTS `post_sections`;
CREATE TABLE `post_sections` (
  `id`       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `post_id`  INT UNSIGNED NOT NULL,
  `position` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `text`     MEDIUMTEXT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_sections_post` (`post_id`, `position`),
  CONSTRAINT `fk_sections_post` FOREIGN KEY (`post_id`)
    REFERENCES `posts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `post_section_images`;
CREATE TABLE `post_section_images` (
  `section_id` INT UNSIGNED NOT NULL,
  `media_id`   INT UNSIGNED NOT NULL,
  `position`   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`section_id`, `media_id`),
  KEY `ix_ssi_media` (`media_id`),
  CONSTRAINT `fk_ssi_section` FOREIGN KEY (`section_id`)
    REFERENCES `post_sections` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ssi_media` FOREIGN KEY (`media_id`)
    REFERENCES `media` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Statische Seiten ────────────────────────────────────────
-- Impressum, Jahresberichte, Newsletter-Archiv und alles, was
-- Fliesstext ist. Seiten mit eigener Logik (Vorstand, Links,
-- Galerie) bleiben Angular-Komponenten und stehen nicht hier.

DROP TABLE IF EXISTS `pages`;
CREATE TABLE `pages` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug`         VARCHAR(200) NOT NULL,
  `title`        VARCHAR(255) NOT NULL,
  -- Bereinigtes HTML: ohne Shortcodes, ohne Page-Builder-Markup,
  -- interne Links bereits auf die neuen Routen umgeschrieben.
  `body_html`    MEDIUMTEXT NOT NULL,
  `parent_id`    INT UNSIGNED DEFAULT NULL,
  `sort`         SMALLINT NOT NULL DEFAULT 0,
  `status`       ENUM('draft','published') NOT NULL DEFAULT 'draft',
  `legacy_wp_id` INT UNSIGNED DEFAULT NULL,
  `updated_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pages_slug` (`slug`),
  UNIQUE KEY `uq_pages_legacy` (`legacy_wp_id`),
  KEY `ix_pages_parent` (`parent_id`),
  CONSTRAINT `fk_pages_parent` FOREIGN KEY (`parent_id`)
    REFERENCES `pages` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verlinkte Dokumente einer Seite: Jahresberichte, Statuten, Merkblaetter.
DROP TABLE IF EXISTS `page_documents`;
CREATE TABLE `page_documents` (
  `id`       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `page_id`  INT UNSIGNED NOT NULL,
  `media_id` INT UNSIGNED NOT NULL,
  `label`    VARCHAR(200) NOT NULL,
  `position` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `ix_pd_page` (`page_id`, `position`),
  KEY `ix_pd_media` (`media_id`),
  CONSTRAINT `fk_pd_page` FOREIGN KEY (`page_id`)
    REFERENCES `pages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pd_media` FOREIGN KEY (`media_id`)
    REFERENCES `media` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Bildergalerien ──────────────────────────────────────────
-- In WordPress lagen die Bilder bei Google Photos und die Seite
-- war seit 2019 deaktiviert. Hier liegen sie im eigenen Bestand.

DROP TABLE IF EXISTS `albums`;
CREATE TABLE `albums` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug`        VARCHAR(200) NOT NULL,
  `title`       VARCHAR(255) NOT NULL,
  `excerpt`     TEXT NOT NULL,
  -- Datum des Anlasses, nicht des Uploads – danach wird sortiert.
  `event_date`  DATE NOT NULL,
  `location`    VARCHAR(160) DEFAULT NULL,
  `category_id` INT UNSIGNED DEFAULT NULL,
  `cover_id`    INT UNSIGNED DEFAULT NULL,
  `status`      ENUM('draft','published') NOT NULL DEFAULT 'draft',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_albums_slug` (`slug`),
  KEY `ix_albums_status_date` (`status`, `event_date`),
  CONSTRAINT `fk_albums_category` FOREIGN KEY (`category_id`)
    REFERENCES `categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_albums_cover` FOREIGN KEY (`cover_id`)
    REFERENCES `media` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `album_images`;
CREATE TABLE `album_images` (
  `album_id` INT UNSIGNED NOT NULL,
  `media_id` INT UNSIGNED NOT NULL,
  `position` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`album_id`, `media_id`),
  KEY `ix_ai_media` (`media_id`),
  CONSTRAINT `fk_ai_album` FOREIGN KEY (`album_id`)
    REFERENCES `albums` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_media` FOREIGN KEY (`media_id`)
    REFERENCES `media` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Vorstand ────────────────────────────────────────────────
-- Lag in WordPress als TablePress-Tabelle vor, im Frontend heute
-- fest in vorstand.ts.

DROP TABLE IF EXISTS `board_members`;
CREATE TABLE `board_members` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`         VARCHAR(120) NOT NULL,
  -- Rolle im Verband, z. B. "Co-Präsidium, Kasse". Leer, wenn keine gepflegt ist.
  `role`         VARCHAR(160) DEFAULT NULL,
  -- Funktion in der IKA, z. B. "IKA-Fachvorstand".
  `ika_function` VARCHAR(160) NOT NULL DEFAULT '',
  `school_name`  VARCHAR(200) NOT NULL DEFAULT '',
  `school_url`   VARCHAR(255) DEFAULT NULL,
  `email`        VARCHAR(190) DEFAULT NULL,
  `photo_id`     INT UNSIGNED DEFAULT NULL,
  `sort`         SMALLINT NOT NULL DEFAULT 0,
  `active`       TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `ix_board_sort` (`active`, `sort`),
  CONSTRAINT `fk_board_photo` FOREIGN KEY (`photo_id`)
    REFERENCES `media` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Linksammlung ────────────────────────────────────────────
-- Heute fest in links.ts, gruppiert nach Rubrik.

DROP TABLE IF EXISTS `link_groups`;
CREATE TABLE `link_groups` (
  `id`   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(160) NOT NULL,
  `sort` SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `links`;
CREATE TABLE `links` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id`    INT UNSIGNED NOT NULL,
  `title`       VARCHAR(255) NOT NULL,
  -- NULL bedeutet: Eintrag ohne Ziel. Das Frontend zeigt ihn dann
  -- als Platzhalter statt als toten Link.
  `url`         VARCHAR(500) DEFAULT NULL,
  `description` VARCHAR(500) DEFAULT NULL,
  `sort`        SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `ix_links_group` (`group_id`, `sort`),
  CONSTRAINT `fk_links_group` FOREIGN KEY (`group_id`)
    REFERENCES `link_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Weiterleitungen ─────────────────────────────────────────
-- Alte WordPress-URLs auf neue Routen. Damit Google-Treffer und
-- Lesezeichen nach der Umstellung nicht ins Leere laufen.

DROP TABLE IF EXISTS `redirects`;
CREATE TABLE `redirects` (
  `id`        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `from_path` VARCHAR(255) NOT NULL,
  `to_path`   VARCHAR(255) NOT NULL,
  `status`    SMALLINT UNSIGNED NOT NULL DEFAULT 301,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_redirects_from` (`from_path`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
