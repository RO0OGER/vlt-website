<?php
/**
 * Vorlage fuer die Zugangsdaten der API.
 *
 * Kopiere diese Datei auf dem Server nach config.php und trage die Werte
 * ein, die cyon dir beim Anlegen der Datenbank angezeigt hat.
 *
 *   cp config.example.php config.php
 *
 * config.php steht in .gitignore und darf NIE ins Repository. Zugangsdaten
 * in einem Git-Repo bekommt man aus der Historie nur mit grossem Aufwand
 * wieder heraus.
 *
 * Wichtig: lege bei cyon einen eigenen Datenbankbenutzer an, der nur so viel
 * darf, wie die Seite braucht. Die oeffentlichen Endpunkte lesen bloss,
 * geschrieben wird beim An- und Abmelden:
 *
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON users       TO 'db_user'@'localhost';
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON user_tokens TO 'db_user'@'localhost';
 *
 * users braucht seit der Benutzerverwaltung mehr als SELECT: Zugaenge werden
 * im CMS angelegt (INSERT), Passwoerter geaendert (UPDATE) und Zugaenge
 * entfernt (DELETE).
 *
 * Dazu kommt das CMS unter /api/admin/. Es pflegt Beitraege und braucht
 * darum auf diesen Tabellen Schreibrechte:
 *
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON posts               TO 'db_user'@'localhost';
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON post_sections       TO 'db_user'@'localhost';
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON post_section_images TO 'db_user'@'localhost';
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON post_categories     TO 'db_user'@'localhost';
 *   GRANT SELECT, INSERT,         DELETE ON categories          TO 'db_user'@'localhost';
 *   GRANT SELECT, INSERT, DELETE         ON media               TO 'db_user'@'localhost';
 *
 * categories ohne UPDATE: Kategorien werden angelegt und (solange sie
 * niemand verwendet) geloescht, aber nicht umbenannt.
 *
 * media braucht DELETE, damit sich Bilder im CMS aus dem Bestand entfernen
 * lassen. Die API laesst das nur zu, wenn das Bild nirgends mehr verwendet
 * wird – und das muss sie auch pruefen: alle Fremdschluessel auf media
 * stehen auf CASCADE oder SET NULL, die Datenbank wuerde ein benutztes Bild
 * also ohne Murren mitsamt seinen Verweisen entfernen.
 *
 * Alle uebrigen Tabellen bleiben fuer diesen Zugang schreibgeschuetzt.
 */

return [
    'host'     => 'localhost',
    'database' => 'DATENBANKNAME',
    'user'     => 'BENUTZERNAME',
    'password' => 'PASSWORT',
    'charset'  => 'utf8mb4',

    // Basisadresse der Medien, wie sie im Browser erreichbar sind.
    // Die Tabelle media speichert nur den relativen Pfad.
    'media_base' => '/medien/',

    // Derselbe Ordner, aber auf der Platte: hierhin legt das CMS die Bilder,
    // die im Editor hochgeladen werden. media_base und media_dir muessen auf
    // dasselbe Verzeichnis zeigen, sonst zeigt die Seite tote Bilder.
    // Der Webserver braucht Schreibrecht darauf.
    'media_dir' => __DIR__ . '/../medien',

    // Der Zugang, der sich im CMS nicht loeschen laesst. Irgendjemand muss
    // immer hineinkommen – ohne diese Sperre kann sich die Redaktion selbst
    // aussperren, und dann hilft nur noch phpMyAdmin.
    'super_admin' => 'info@verband-ika.ch',

    // true schaltet ausfuehrliche Fehlermeldungen ein – nur lokal nutzen,
    // auf dem Server immer false lassen.
    'debug' => false,
];
