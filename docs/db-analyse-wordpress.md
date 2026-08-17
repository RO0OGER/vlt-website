# Analyse der WordPress-Datenbank `verbandi_wpika`

Bericht über die Struktur des Datenbank-Dumps unter `src/app/db-file/verbandi_wpika.sql`.
Stand der Analyse: 17. August 2026.

---

## 1. Woher der Dump kommt

| | |
|---|---|
| Datei | `src/app/db-file/verbandi_wpika.sql` |
| Grösse | 7'368'273 Bytes (≈ 7.0 MiB), 880 Zeilen |
| Werkzeug | `mysqldump` 10.19 (MariaDB) |
| Server | MariaDB 10.6.25 auf Linux (cll-lve-log → typische Shared-Hosting-Umgebung, passt zu cyon) |
| Datenbank | `verbandi_wpika` |
| Erstellt am | 2026-08-17, 18:44:46 |
| Enthält | Struktur **und** Daten, keine Views, keine Stored Procedures, keine Trigger |

Es ist ein vollständiger Abzug der **produktiven WordPress-Installation** hinter
`https://verband-technologie.ch` – also der Website, die durch die neue Angular-SPA
abgelöst wird.

Die wenigen Zeilen bei 7 MB erklären sich durch «extended inserts»: `mysqldump` packt
alle Zeilen einer Tabelle in eine einzige, sehr lange `INSERT`-Anweisung. Die grösste
Zeile im File ist über 3 MB lang.

---

## 2. Was für ein System dahintersteckt

| Merkmal | Wert |
|---|---|
| CMS | WordPress 7.0.4 (`db_version` 61833) |
| Tabellen-Präfix | `wpd7_` (nicht das Standard-`wp_` – erschwert automatisierte Angriffe geringfügig) |
| Site-Titel | «Verband Lehrende Technologie» |
| Untertitel | «Technologie im kaufmännischen Umfeld» |
| Sprache | `de_DE` |
| Theme | `flash` (Eltern) + `verbandika` (Child-Theme) |
| Startseite | feste Seite #337 «Home» (`show_on_front = page`) |
| Permalinks | `/%postname%/` |
| Registrierung offen? | Nein (`users_can_register = 0`), Standardrolle `subscriber` |

**Aktive Plugins (13):**

| Plugin | Wozu | Spuren in der DB |
|---|---|---|
| `ultimate-member` | Mitgliederbereich, Login, Profile | `wpd7_um_metadata`, viele `usermeta`-Keys, 4 Seiten-Vorlagen |
| `contact-form-7` | Formulare | 5 Formulare als Posts |
| `tablepress` | Tabellen | 3 Tabellen als Posts |
| `jetpack` | Statistik, Sharing, Sitemaps | `wpd7_jetpack_sync_queue`, `jetpack_log` (1.4 MB!) |
| `loginizer` | Brute-Force-Schutz | `wpd7_loginizer_logs` |
| `siteorigin-panels` + `so-widgets-bundle` | Page Builder | `panels_data` in `postmeta` |
| `flash-toolkit` | Theme-Erweiterung | `flash_page_layout`, `flash_transparency` |
| `photonic` | Galerien (Google Photos, Flickr) | Shortcodes im Seiteninhalt |
| `advanced-database-cleaner` | DB-Aufräumen | – |
| `loco-translate` | Übersetzungen | – |
| `mimetypes-link-icons` | Datei-Icons | Cache in `options` |
| `recent-posts-widget-with-thumbnails` | Widget | – |

---

## 3. Tabellenlandschaft: 25 Tabellen in vier Gruppen

### 3.1 WordPress-Kern (12 Tabellen)

Das klassische WordPress-Schema. Wichtig zu verstehen: WordPress speichert **fast alles**
in `posts` und hängt beliebige Zusatzfelder über `postmeta` an (ein sogenanntes
EAV-Muster – Entity/Attribute/Value). Es gibt also keine Tabelle «Seiten» und keine
Tabelle «Beiträge», sondern nur `wpd7_posts` mit einer Spalte `post_type`.

| Tabelle | Rolle |
|---|---|
| `wpd7_posts` | Alle Inhalte: Seiten, Beiträge, Medien, Menüeinträge, Formulare, Revisionen |
| `wpd7_postmeta` | Beliebige Zusatzfelder zu jedem Inhalt (Schlüssel/Wert) |
| `wpd7_terms` | Begriffe: Kategorien, Schlagwörter, Menünamen |
| `wpd7_term_taxonomy` | Ordnet jeden Begriff einer Taxonomie zu (`category`, `post_tag`, `nav_menu`) |
| `wpd7_term_relationships` | n:m-Verknüpfung Inhalt ↔ Begriff |
| `wpd7_termmeta` | Zusatzfelder zu Begriffen (leer) |
| `wpd7_users` | Benutzerkonten |
| `wpd7_usermeta` | Zusatzfelder zu Benutzern, u. a. die Rolle |
| `wpd7_options` | Globale Einstellungen, Plugin-Konfiguration, Caches |
| `wpd7_comments` / `wpd7_commentmeta` | Kommentare (beide leer) |
| `wpd7_links` | Blogroll aus WP-Urzeiten (leer) |

### 3.2 Ultimate Member (Mitgliederbereich)

| Tabelle | Rolle |
|---|---|
| `wpd7_um_metadata` | Eigener Meta-Speicher des Plugins – **leer**, die Daten liegen alle in `usermeta` |

### 3.3 Events Manager (6 Tabellen) – verwaist

`wpd7_em_events`, `wpd7_em_locations`, `wpd7_em_bookings`, `wpd7_em_tickets`,
`wpd7_em_tickets_bookings`, `wpd7_em_meta`

Das Plugin ist **nicht mehr aktiv**, die Tabellen sind aber stehen geblieben. Inhalt:
**genau ein einziger Event** («Webinar Word-Formatvorlagen» vom 17.11.2021), keine
Location, keine Buchung, kein Ticket. Der Versuch, Veranstaltungen sauber zu verwalten,
wurde offensichtlich 2021 gestartet und wieder aufgegeben – dazu passen die fünf
verwaisten Seiten `veranstaltungen`, `veranstaltungsorte`, `kategorien`,
`schlagwoerter`, `meine-buchungen`, die alle nur einen Shortcode enthalten.

### 3.4 Infrastruktur der Plugins (6 Tabellen)

| Tabelle | Rolle |
|---|---|
| `wpd7_actionscheduler_actions` / `_claims` / `_groups` / `_logs` | Hintergrund-Jobs, hier von Ultimate Member genutzt |
| `wpd7_jetpack_sync_queue` | Warteschlange für die Jetpack-Synchronisation (leer) |
| `wpd7_loginizer_logs` | Fehlgeschlagene Login-Versuche je IP (MyISAM, 2 Zeilen) |

---

## 4. Datenvolumen

Insgesamt **16'385 Zeilen**. 11 der 25 Tabellen sind komplett leer.

| Zeilen | Netto-Daten | Tabelle |
|---:|---:|---|
| 1'131 | 3.07 MB | `wpd7_options` |
| 830 | 1.32 MB | `wpd7_posts` |
| 2'875 | 1.14 MB | `wpd7_postmeta` |
| 1'436 | 0.67 MB | `wpd7_actionscheduler_actions` |
| 5'337 | 0.41 MB | `wpd7_usermeta` |
| 4'302 | 0.34 MB | `wpd7_actionscheduler_logs` |
| 234 | 0.04 MB | `wpd7_users` |
| 195 | < 0.01 MB | `wpd7_term_relationships` |
| 19 | < 0.01 MB | `wpd7_term_taxonomy` |
| 19 | < 0.01 MB | `wpd7_terms` |
| 3 | < 0.01 MB | `wpd7_actionscheduler_groups` |
| 2 | < 0.01 MB | `wpd7_loginizer_logs` |
| 1 | < 0.01 MB | `wpd7_em_events` |
| 1 | < 0.01 MB | `wpd7_actionscheduler_claims` |

**Auffällig:** die eigentlichen Inhalte machen nur einen Bruchteil aus. Die grösste
Einzelzeile der ganzen Datenbank ist die Option `jetpack_log` mit **1.36 MB** – reiner
Protokollmüll. Dahinter: `_site_transient_kirki_googlefonts_cache` (250 KB),
`loginizer_login_attempt_stats` (245 KB), `um_cache_userdata_76` (124 KB). Rund
**zwei Drittel von `wpd7_options` sind Caches und Logs**, keine Konfiguration.

Ein zweiter Hinweis auf viel Betrieb im Leerlauf sind die AUTO_INCREMENT-Zähler im
Vergleich zu den tatsächlichen Zeilen:

| Tabelle | nächste ID | Zeilen |
|---|---:|---:|
| `wpd7_options` | 4'560'566 | 1'131 |
| `wpd7_actionscheduler_claims` | 195'865 | 1 |
| `wpd7_actionscheduler_logs` | 62'542 | 4'302 |
| `wpd7_actionscheduler_actions` | 24'577 | 1'436 |

Über die Jahre wurden also Millionen von Zeilen geschrieben und wieder gelöscht –
normal für WordPress-Transients und Cronjobs, aber ein guter Grund, das in der neuen
Lösung nicht nachzubauen.

---

## 5. Die Inhalte im Detail

### 5.1 `wpd7_posts` nach Typ (830 Zeilen)

| `post_type` | Anzahl | Was es ist |
|---|---:|---|
| `attachment` | 592 | Medien (Bilder, PDFs) – nur die Metadaten, die Dateien selbst liegen im Dateisystem |
| `post` | 65 | Beiträge/News |
| `page` | 61 | Statische Seiten |
| `nav_menu_item` | 49 | Einzelne Menüeinträge |
| `revision` | 38 | Alte Fassungen von Seiten |
| `wpcf7_contact_form` | 5 | Contact-Form-7-Formulare |
| `tablepress_table` | 3 | TablePress-Tabellen |
| `um_form` / `um_directory` | 4 | Ultimate-Member-Formulare und Mitgliederverzeichnis |
| `jp_sitemap*` | 9 | Jetpack-Sitemaps (Papierkorb) |
| `custom_css`, `wp_global_styles` | 3 | Theme-Anpassungen |
| `event` | 1 | Der eine Events-Manager-Anlass |

Status: 630 `inherit` (Medien und Revisionen), **184 `publish`**, 6 `trash`, 5 `draft`,
4 `private`, 1 `auto-draft`.

### 5.2 Medien (592 Anhänge)

| Typ | Anzahl |
|---|---:|
| `image/jpeg` | 389 |
| `application/pdf` | **153** |
| `image/png` | 50 |

Die 153 PDFs sind der wichtigste Punkt: Jahresberichte, Programme, Merkblätter,
Anmeldeformulare. Sie liegen **nicht** in der Datenbank, sondern unter
`wp-content/uploads/…`. Der Dump enthält nur die Pfade (`_wp_attached_file`).
Für eine Migration braucht es also zusätzlich einen Abzug des Upload-Verzeichnisses.

### 5.3 Seiten (61)

Der Seitenbaum ist dreistufig und deckt sich weitgehend mit der Navigation der neuen
Angular-Seite. Die Elternseiten sind: `#17 Verband`, `#403 Engagements`,
`#405 Im Beruf`, `#1097 Verband organisiert`, `#718 Mitgliederbereich`, `#12 Kontakt`.

Fünf Seiten sind Mitgliederbereich-Inhalte («Geschützter Mitgliederbereich: …»):
IKA-Cockpit, Kadervernetzungen, Mediametro, Mitgliederversammlungen, IKA Workshoptage,
dazu «Geschützter Bereich: Best Practice».

Sieben Seiten sind reine Ultimate-Member-Hülsen mit je einem Shortcode (`login`,
`logout`, `register`, `account`, `members`, `user`, `password-reset`) – Inhalt zwischen
0 und 29 Zeichen.

Karteileichen: `_baustelle` (privat, 30 KB alter Inhalt), `intern-inern` (leer),
`kurse-extern` (leer), `pensionierte` (leer), `bildergalerie_single` (88 Zeichen),
sowie die fünf Events-Manager-Seiten.

### 5.4 Beiträge (64 + 1 Entwurf)

Zeitraum **Oktober 2016 bis August 2026**, im Schnitt gut 6 Beiträge pro Jahr.
Längster Beitrag: «Einführung BiVo2023 in HKBE gelungen» (14'595 Zeichen).
Zwei Beiträge sind `private`, einer ein leerer `draft`.

Kategorien (12 Begriffe, `wpd7_terms` / `wpd7_term_taxonomy`):

| Kategorie | Beiträge |
|---|---:|
| Allgemein | 40 |
| Verband | 24 |
| Kurse | 14 |
| Vorträge | 10 |
| Kadervernetzung | 8 |
| best practise | 7 |
| digitalerWandel | 6 |
| Reise | 5 |
| Termine | 4 |
| Pensionierte | 3 |
| Stellen | 2 |
| ungeordnet | 0 |

Datenqualität: der Begriff **«Verband» existiert doppelt** (`term_id` 14 und 15, beide
mit Slug `verband`) – ein Beitrag ist sogar beiden zugeordnet. «best practise» ist ein
Schreibfehler («practice»). `post_tag` wird praktisch nicht genutzt (1 Taxonomie-Eintrag).

### 5.5 Navigation

Fünf Menüs mit zusammen 49 Einträgen: das Hauptmenü (33 Einträge), «Important Links» (4),
«Social» (1), «Profildaten» (5) und «Memberbereich» (6). Die letzten beiden gehören zu
Ultimate Member.

### 5.6 Formulare und Tabellen

| Contact Form 7 | TablePress |
|---|---|
| Kontaktformular | Programm Kadervernetzung 2017 |
| Beitrittserklärung | Kostenstruktur für Veranstaltungen |
| Beitrittserklärung_Einzel | Vorstand |
| Beitrittserklärung_Kollektiv | |
| Austrittserklaerung | |

Diese Formulare versenden E-Mails über den Server. In einer reinen Angular-SPA auf
statischem Hosting gibt es dafür keine Entsprechung – hier braucht es später ein
Backend oder einen Formulardienst.

---

## 6. Mitglieder und Rollen

| | |
|---|---|
| Benutzerkonten | **234** |
| Rollen | 225 `contributor`, 6 `administrator`, 1 `editor`, 1 `author` |
| Grosse Anlegewelle | September 2018: 177 Konten auf einmal (Import der Mitgliederliste) |
| Passwort-Hashes | 221× altes phpass (`$P$…`), 13× modernes bcrypt (`$wp$2y$…`) |
| Ultimate-Member-Spuren | `_um_last_login` bei 114 Konten, `session_tokens` bei 99 |

Die Rolle `contributor` wird hier zweckentfremdet: sie markiert schlicht «ist Mitglied»
und schaltet über Ultimate Member die geschützten Seiten frei. **78 Inhalte** tragen das
Feld `um_content_restriction`, bei **44** davon ist tatsächlich eine eigene Zugriffsregel
gesetzt.

Nur 13 der 234 Passwörter wurden seit der Umstellung auf WordPress 7 neu gesetzt. Die
übrigen 221 liegen als phpass-Hash vor – ein Verfahren von 2008, das nach heutigen
Massstäben zu schnell zu berechnen ist.

---

## 7. Technische Auffälligkeiten

**Gemischte Zeichensätze.** Die alten Kerntabellen laufen auf `utf8mb3` /
`utf8mb3_general_ci`, die neueren Plugin-Tabellen (Action Scheduler, Jetpack,
Ultimate Member) auf `utf8mb4` / `utf8mb4_unicode_520_ci`. `utf8mb3` kann keine Emoji
und keine Zeichen ausserhalb der Basic Multilingual Plane speichern. Wer die Daten
weiterverwendet, sollte alles auf `utf8mb4` vereinheitlichen – sonst drohen beim JOIN
über Tabellengrenzen hinweg Kollations-Fehler.

**Eine MyISAM-Tabelle.** `wpd7_loginizer_logs` ist als einzige MyISAM statt InnoDB –
keine Transaktionen, keine Crash-Sicherheit. Für ein Log verkraftbar, aber ein Fremdkörper.

**Keine echten Fremdschlüssel.** WordPress definiert keine `FOREIGN KEY`-Constraints,
sondern nur Indizes auf den Verknüpfungsspalten. Die referentielle Integrität hängt
vollständig am Anwendungscode. Beim Auslesen für die Migration heisst das: es kann
verwaiste `postmeta`-Zeilen ohne zugehörigen Post geben, und man sollte prüfen statt
vertrauen.

**Der Dump ist nicht direkt einspielbar, ohne Nachdenken.** Er beginnt mit
`DROP TABLE IF EXISTS` für jede Tabelle. Auf einer produktiven Datenbank ausgeführt,
löscht er also erst und schreibt dann neu.

---

## 8. Was das für die Angular-Migration bedeutet

### 8.1 Migrationswürdiger Inhalt

Von 16'385 Zeilen ist nur ein kleiner Teil echter Inhalt:

| Was | Umfang | Wo im Dump |
|---|---|---|
| Beiträge | 64 | `posts` (`post_type='post'`) + `term_relationships` für Kategorien |
| Seitentexte | ~50 relevante | `posts` (`post_type='page'`) |
| Medien | 592 Dateien, davon 153 PDF | `postmeta._wp_attached_file` – Dateien separat sichern! |
| Mitgliederdaten | 234 Konten | `users` + `usermeta` – nur mit Backend sinnvoll |
| Kategorien | 12 | `terms` |

Alles andere – Revisionen, Menüeinträge, Sitemaps, Action-Scheduler-Protokolle, Caches,
Jetpack-Logs – kann ersatzlos entfallen.

### 8.2 Abgleich mit dem heutigen Stand der SPA

Bereits umgesetzt (WP-Seite → Angular-Route):

| WordPress | Angular |
|---|---|
| `home` (#337) | `/` |
| `about` «Verband» (#17) | `/ueber-uns` |
| `blog` «Aktuell» (#336) | `/beitraege` |
| `vorstand` (#399) | `/vorstand` |
| `bildergalerien` (#749) | `/galerie` |
| `contact` (#12) | `/kontakt` |
| `siz-ecdl` (#2030) | `/ecdl-kooperation` |
| `kooperation-mit-verlagen` (#783) | `/verlag-kooperation` |
| `sab` (#1124) | `/sab` |
| `bivo-2022` (#785) | `/bivo-2022` |
| `qv-pruefungen` (#787) | `/qv-pruefungen` |
| `lehrplan-21` (#789) | `/lehrplan-21` |
| `corporate-wording` (#791) | `/corporate-wording` |
| `ausbildung` (#409) | `/ausbildung` |
| `links` (#413) | `/links` |
| `kostenstruktur` (#706) | `/teilnehmerkosten` |
| `stellen` (#752) | `/stellen` |

Noch offen – und deckungsgleich mit den Platzhaltern ohne Link in `header.ts`:

- `impressum` (#442) und `rechtliche-hinweise` (#444) – rechtlich Pflicht, fehlen bisher
- `newsletter` (#866) «Newsletter Anmeldung» und `newsletter_aktuell` (#401)
- `beitrittserklaerung` (#490), `-kollektivmitglied` (#1686), `austrittserklaerung` (#1073)
- `adressmutation-mitglied` (#985), `fachvorstand-adress-mutation` (#918)
- `mitgliederbereich` (#718) mit sechs geschützten Unterseiten und `mitgliederbereich-zugang` (#1644)
- `pensionierte` (#3294, in WordPress leer)
- `weiterbildung` (#411) «externe Weiterbildung/Kurse»
- Jahresberichte 2016 / 2017 / 2018 (#492, #1570, #2213)

Bewusst nicht übernommen: `verbandsanlaesse` (#415) und `anlaesse-ika-verband` (#709) –
der Anlässe-Bereich wurde aus der SPA entfernt.

### 8.3 Stolpersteine beim Auslesen der Texte

- **Page Builder.** Acht Seiten tragen `panels_data` (SiteOrigin). Ihr `post_content` ist
  kein sauberes HTML, sondern vom Builder erzeugtes Markup; die Struktur steckt im
  serialisierten PHP-Array des Meta-Felds.
- **Shortcodes.** Viele Seiten enthalten `[contact-form-7 …]`, `[table id=…]`,
  `[ultimatemember …]`, `[photonic …]`. Beim Kopieren des Textes müssen die von Hand
  ersetzt werden.
- **Serialisiertes PHP.** `postmeta`, `usermeta` und `options` enthalten
  PHP-`serialize()`-Strings (`a:3:{s:5:"…";…}`). Wer sie in JavaScript auswerten will,
  braucht einen Unserializer – JSON ist es nicht.
- **Alte Absolut-URLs.** Alle internen Links und Bildpfade zeigen auf
  `https://verband-technologie.ch/…`. Beim Übernehmen der Texte müssen sie auf die neuen
  Routen umgeschrieben werden.
- **Weiterleitungen.** Die alte Struktur `/%postname%/` ist flach. Wo sich Slugs ändern
  (`kostenstruktur` → `teilnehmerkosten`, `siz-ecdl` → `ecdl-kooperation`,
  `about` → `ueber-uns`), gehören `301`-Regeln in die `.htaccess`, damit Google-Treffer
  und Lesezeichen nicht ins Leere laufen.

---

## 9. Wichtig: der Dump enthält Personendaten

Die Datei ist **kein harmloses Schema-Beispiel**. Sie enthält:

- 234 Namen mit E-Mail-Adressen (überwiegend private Adressen: bluewin.ch, gmx.ch,
  hotmail.com, dazu Schuladressen wie bwdbern.ch, kvlu.ch, wksbern.ch)
- 234 Passwort-Hashes, davon 221 im veralteten phpass-Format
- Session-Tokens, Passwort-Reset-Hashes und Login-Zeitpunkte
- IP-Adressen in `wpd7_loginizer_logs`

Damit fällt die Datei unter das Datenschutzgesetz. Konkret heisst das:

1. **Der Ordner `src/app/db-file/` ist aktuell nicht in `.gitignore`.** Er ist noch nicht
   committet (Git zeigt ihn als `??`), aber ein `git add .` würde die Mitgliederdaten
   dauerhaft in die Repository-Historie schreiben – und aus einer Git-Historie bekommt
   man sie nur mit erheblichem Aufwand wieder heraus.
2. Der Dump gehört **nicht** unter `src/`. Alles dort landet im Build-Prozess und könnte
   im Extremfall mit ausgeliefert werden.
3. Empfehlung: Datei aus dem Projektordner heraus an einen geschützten Ort verschieben
   und `*.sql` sowie `db-file/` in `.gitignore` aufnehmen. Für die Migrationsarbeit
   genügt ein anonymisierter Auszug ohne `wpd7_users` und `wpd7_usermeta`.

---

## 10. Anhang: alle Tabellen auf einen Blick

| Tabelle | Engine | Charset | Zeilen | Zweck |
|---|---|---|---:|---|
| `wpd7_actionscheduler_actions` | InnoDB | utf8mb4 | 1'436 | geplante Hintergrund-Jobs |
| `wpd7_actionscheduler_claims` | InnoDB | utf8mb4 | 1 | Sperren für laufende Jobs |
| `wpd7_actionscheduler_groups` | InnoDB | utf8mb4 | 3 | Job-Gruppen (`ultimate-member` u. a.) |
| `wpd7_actionscheduler_logs` | InnoDB | utf8mb4 | 4'302 | Job-Protokoll |
| `wpd7_commentmeta` | InnoDB | utf8mb3 | 0 | Zusatzfelder zu Kommentaren |
| `wpd7_comments` | InnoDB | utf8mb3 | 0 | Kommentare |
| `wpd7_em_bookings` | InnoDB | utf8mb3 | 0 | Event-Buchungen |
| `wpd7_em_events` | InnoDB | utf8mb3 | 1 | Veranstaltungen |
| `wpd7_em_locations` | InnoDB | utf8mb3 | 0 | Veranstaltungsorte inkl. Geokoordinaten |
| `wpd7_em_meta` | InnoDB | utf8mb3 | 0 | Zusatzfelder für Events |
| `wpd7_em_tickets` | InnoDB | utf8mb3 | 0 | Ticketarten und Preise |
| `wpd7_em_tickets_bookings` | InnoDB | utf8mb3 | 0 | n:m Ticket ↔ Buchung |
| `wpd7_jetpack_sync_queue` | InnoDB | utf8mb4 | 0 | Sync-Warteschlange |
| `wpd7_links` | InnoDB | utf8mb3 | 0 | Blogroll (Alt-Last) |
| `wpd7_loginizer_logs` | **MyISAM** | utf8mb3 | 2 | fehlgeschlagene Logins je IP |
| `wpd7_options` | InnoDB | utf8mb3 | 1'131 | Einstellungen, Caches, Logs |
| `wpd7_postmeta` | InnoDB | utf8mb3 | 2'875 | Zusatzfelder zu Inhalten |
| `wpd7_posts` | InnoDB | utf8mb3 | 830 | alle Inhalte |
| `wpd7_term_relationships` | InnoDB | utf8mb3 | 195 | Inhalt ↔ Begriff |
| `wpd7_term_taxonomy` | InnoDB | utf8mb3 | 19 | Begriff ↔ Taxonomie |
| `wpd7_termmeta` | InnoDB | utf8mb3 | 0 | Zusatzfelder zu Begriffen |
| `wpd7_terms` | InnoDB | utf8mb3 | 19 | Kategorien, Schlagwörter, Menünamen |
| `wpd7_um_metadata` | InnoDB | utf8mb4 | 0 | Ultimate-Member-Meta |
| `wpd7_usermeta` | InnoDB | utf8mb3 | 5'337 | Zusatzfelder zu Benutzern |
| `wpd7_users` | InnoDB | utf8mb3 | 234 | Benutzerkonten |
