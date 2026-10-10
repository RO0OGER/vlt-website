-- Migration 007: Titelbild der Startseite
--
-- Das grosse Bild neben dem Titel der Startseite war bisher eine
-- Platzhalterflaeche. Es wird jetzt im CMS unter "Startseite" gewaehlt und
-- laesst sich dort jederzeit austauschen.
--
-- Eine eigene kleine Tabelle statt einer Spalte irgendwo: die Seite hat
-- feste Bildplaetze (slot), heute einen, und jeder zeigt auf ein Bild aus
-- media. Kommt spaeter ein weiterer Platz dazu, ist das eine Zeile mehr und
-- keine neue Migration.
--
-- ON DELETE SET NULL wie bei den Titelbildern der Beitraege: die API laesst
-- ein verwendetes Bild ohnehin nicht loeschen (mediaUsage in admin.php), und
-- falls es doch jemand in phpMyAdmin tut, faellt die Startseite auf die
-- Platzhalterflaeche zurueck statt zu brechen.
--
-- Rechte des API-Benutzers:
--
--   GRANT SELECT, INSERT, UPDATE ON `site_images` TO 'db_user'@'localhost';
--
-- INSERT, weil die API mit INSERT … ON DUPLICATE KEY UPDATE schreibt: fehlt
-- die Zeile unten einmal, legt sie sie selbst wieder an.

CREATE TABLE `site_images` (
  `slot`       VARCHAR(40)  NOT NULL,
  `media_id`   INT UNSIGNED DEFAULT NULL,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`slot`),
  KEY `ix_site_images_media` (`media_id`),

  CONSTRAINT `fk_site_images_media` FOREIGN KEY (`media_id`)
    REFERENCES `media` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `site_images` (`slot`, `media_id`) VALUES ('home_hero', NULL);
