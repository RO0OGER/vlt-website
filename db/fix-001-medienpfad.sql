-- ============================================================
--  Korrektur 001: doppeltes "medien/" im Medienpfad
-- ============================================================
--
--  Der erste Migrationslauf hat den Ordner mit in media.path
--  geschrieben ("medien/2026/08/Bild1.jpg"). Die API stellt aber
--  media_base aus der config.php davor, also kam
--
--      /medien/medien/2026/08/Bild1.jpg
--
--  heraus – und damit ein 404. Wo die Dateien liegen, gehoert in
--  die Konfiguration, nicht in die Datenbank.
--
--  Diese Korrektur schneidet das Praefix bei bereits importierten
--  Zeilen ab. Sie ist gefahrlos wiederholbar: beim zweiten Lauf
--  trifft die WHERE-Bedingung auf nichts mehr zu.
--
--  Neuere Laeufe von tools/migrate-wp.mjs schreiben den Pfad
--  bereits richtig.
-- ============================================================

UPDATE media
   SET path = SUBSTRING(path, 8)
 WHERE path LIKE 'medien/%';

-- Zum Nachsehen: sollte jetzt "2026/08/Bild1.jpg" liefern, ohne Ordner davor.
SELECT id, path FROM media ORDER BY id LIMIT 5;
