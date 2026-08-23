# Datenbank und API einrichten

Die neue Website liest ihre Inhalte über eine eigene Lese-API unter
`/api/` aus einer eigenen MySQL-Datenbank. WordPress wird dafür nicht
mehr gebraucht.

```
verband-technologie.ch/
├── index.html          ← Angular-SPA
├── medien/             ← Bilder und PDFs
├── .htaccess           ← SPA-Routing, /api/ ausgenommen
└── api/
    ├── .htaccess       ← leitet alles an index.php
    ├── index.php       ← die API
    └── config.php      ← Zugangsdaten (nur auf dem Server)
```

## 1. Schema einspielen

In phpMyAdmin die **neue** Datenbank links auswählen, Reiter
*Importieren*, `schema.sql` hochladen. Danach müssen 13 Tabellen
dastehen.

Zum Prüfen der API kannst du zusätzlich `seed-smoke.sql` einspielen –
das legt je einen Testbeitrag, eine Testseite und ein Testalbum an.
Wie du die wieder löschst, steht oben in der Datei.

## 2. Datenbankbenutzer nur zum Lesen anlegen

Die API ändert nie einen Inhalt. Geschrieben wird einzig beim An-
und Abmelden, und nur in die Tabelle `user_tokens` (Abschnitt 5).
Deshalb bekommt sie einen eigenen Benutzer, der darüber hinaus nur
lesen darf. Wird die API je über eine Lücke angegriffen, kann über
diesen Zugang trotzdem kein Beitrag verändert oder gelöscht werden.

Im cyon-Panel einen zweiten Datenbankbenutzer anlegen und ihm Zugriff
auf die neue Datenbank geben. Falls cyon dabei nur Vollzugriff anbietet,
lässt sich das Recht per SQL einschränken – sofern das Hosting `GRANT`
erlaubt:

```sql
GRANT SELECT ON verbandi_vlt.* TO 'verbandi_vlt_ro'@'localhost';
```

Geht das nicht, ist das ein bewusst in Kauf genommenes Restrisiko.
Dann wenigstens **einen eigenen Benutzer nur für die API** verwenden –
niemals denselben, mit dem du in phpMyAdmin arbeitest.

## 3. API hochladen

Den Ordner `api/` per FTP ins Web-Wurzelverzeichnis legen. Dort dann:

```
cp config.example.php config.php
```

und in `config.php` Datenbankname, Benutzer und Passwort eintragen.

`config.php` steht in `.gitignore` und darf nie ins Repository –
Zugangsdaten bekommt man aus einer Git-Historie nur mit grossem Aufwand
wieder heraus.

## 4. Prüfen

Im Browser aufrufen:

| Adresse | Erwartung |
|---|---|
| `/api/` | Liste der Endpunkte |
| `/api/categories` | die angelegten Kategorien |
| `/api/posts` | `data` mit Beiträgen, `meta` mit Seitenzahlen |
| `/api/posts/test-erster-beitrag` | ein Beitrag mit zwei Abschnitten |
| `/api/posts/gibtsnicht` | HTTP 404 mit `{"error":"Beitrag nicht gefunden."}` |

Kommt bei `/api/posts` stattdessen die Startseite der SPA zurück, fehlt
in der `.htaccess` im Wurzelverzeichnis die Zeile
`RewriteRule ^api(/|$) - [L]`.

## 5. Admin-Zugang einrichten

Der geschützte Bereich unter `/admin` meldet sich über
`/api/auth/login` an. Dafür braucht es die beiden Tabellen aus
`api/migrations/002_users.sql` – in phpMyAdmin einspielen wie das
Schema.

Der API-Benutzer darf zusätzlich in `user_tokens` schreiben, sonst
lässt sich kein Anmelde-Token ablegen:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE
  ON verbandi_vlt.user_tokens TO 'verbandi_vlt_ro'@'localhost';
```

`SELECT` auf `users` deckt der Grant aus Abschnitt 2 bereits ab.

Den Benutzer selbst legst du direkt in der Datenbank an. Das
Passwort wird nie im Klartext gespeichert, sondern als bcrypt-Hash.
Den erzeugt:

```
npm run admin:hash -- vorstand@verband-technologie.ch
```

Das Script fragt nach dem Passwort – sichtbar wird es dabei nicht –
und gibt eine `INSERT`-Zeile aus, die du in phpMyAdmin ausführst.
Dieselbe Zeile setzt später auch ein vergessenes Passwort zurück.

Danach anmelden. Solange im Wurzelverzeichnis noch das alte
WordPress liegt, gibt es `/admin/login` nur lokal: `npm start`
starten und `http://localhost:4200/admin/login` aufrufen – der
Proxy aus Abschnitt 6 leitet `/api` an den Server weiter. Kommt
dabei ein `{"error":"Nur GET wird unterstützt."}` zurück, liegt
auf dem Server noch die alte `api/index.php`.

Ein Setup-Script im Browser gibt es bewusst nicht: die `api/.htaccess`
schickt alles unterhalb von `/api/` an `index.php`, ein solches Script
wäre dort gar nicht erreichbar.

## 6. Entwickeln

`ng serve` kann kein PHP. `proxy.conf.json` leitet deshalb alle Aufrufe
von `/api` an den Server weiter – die lokale Entwicklung arbeitet also
gegen die echte API. Beim Lesen ist das ungefährlich. Wer sich dabei
anmeldet, meldet sich allerdings an der echten Seite an – das Token
in der echten Datenbank landet.

## Zum Schema

Bewusste Unterschiede zum WordPress-Schema:

- **Echte Fremdschlüssel.** WordPress definiert keine; die Integrität
  hängt dort allein am Anwendungscode.
- **Keine EAV-Tabellen.** Jedes Feld hat eine eigene Spalte mit
  passendem Typ – kein `postmeta`, kein serialisiertes PHP.
- **Durchgehend `utf8mb4`.** WordPress mischt `utf8mb3` und `utf8mb4`,
  was beim JOIN über Tabellengrenzen Kollationsfehler gibt.
- **Keine Caches, Logs oder Transients.** Die grösste Einzelzeile der
  alten Datenbank war ein 1.36 MB grosses Jetpack-Log.
- **`legacy_wp_id`** auf `posts` und `pages`: hält die Verbindung zur
  alten WordPress-ID, damit ein zweiter Migrationslauf nichts doppelt
  anlegt und Weiterleitungen zuordenbar bleiben.
