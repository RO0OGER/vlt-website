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
 * Wichtig: lege bei cyon einen eigenen Datenbankbenutzer an, der auf den
 * Inhaltstabellen nur SELECT darf. Geschrieben wird einzig beim An- und
 * Abmelden, dafuer braucht es zusaetzlich:
 *
 *   GRANT SELECT                         ON users       TO 'db_user'@'localhost';
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON user_tokens TO 'db_user'@'localhost';
 *
 * Wird die API je kompromittiert, laesst sich ueber diesen Zugang trotzdem
 * kein Inhalt aendern oder loeschen.
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

    // true schaltet ausfuehrliche Fehlermeldungen ein – nur lokal nutzen,
    // auf dem Server immer false lassen.
    'debug' => false,
];
