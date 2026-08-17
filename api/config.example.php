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
 * Wichtig: lege bei cyon einen eigenen Datenbankbenutzer an, der nur das
 * Recht SELECT hat. Die API liest ausschliesslich. Wird sie je kompromittiert,
 * kann ueber diesen Zugang nichts geaendert oder geloescht werden.
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
