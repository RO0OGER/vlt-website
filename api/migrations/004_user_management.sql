-- Migration 004: Benutzerverwaltung im CMS
--
-- Bisher wurde ein Admin-Zugang von Hand angelegt: npm run admin:hash, den
-- Hash in phpMyAdmin einfuegen. Das geht jetzt im CMS. Wer einen Zugang
-- anlegt, bekommt ein zufaelliges Startpasswort angezeigt und gibt es dem
-- neuen Admin weiter. Beim ersten Anmelden muss dieser es aendern.
--
-- Dafuer braucht users eine Spalte, die sich merkt, dass das Passwort noch
-- das verteilte ist. Standardwert 0: bestehende Zugaenge haben ihr Passwort
-- selbst gesetzt und werden nicht zur Aenderung gezwungen.
--
-- Zusaetzliche Berechtigungen fuer den Datenbankbenutzer:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON `users` TO 'db_user'@'localhost';
--
-- (Bisher stand dort nur SELECT. Ohne die Erweiterung lassen sich weder
--  Zugaenge anlegen noch Passwoerter aendern.)

ALTER TABLE `users`
  ADD COLUMN `must_change_password` TINYINT(1) NOT NULL DEFAULT 0
      AFTER `password_hash`;

-- Sicherheitshalber: der bestehende Zugang behaelt sein Passwort.
UPDATE `users` SET `must_change_password` = 0;
