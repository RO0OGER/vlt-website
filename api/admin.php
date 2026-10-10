<?php
/**
 * Schreib-API des CMS (/api/admin/...).
 *
 * index.php bleibt lesend: alles, was die oeffentliche Seite braucht, kommt
 * mit GET und ohne Anmeldung. Diese Datei ist die Gegenseite davon – jeder
 * Aufruf hier verlangt ein gueltiges Token aus /api/auth/login.
 *
 * Grundsaetze, dieselben wie nebenan:
 *   * Jeder Wert aus Body oder URL laeuft ueber Prepared Statements.
 *   * Eingaben werden geprueft, bevor sie die Datenbank sehen: Laengen,
 *     Wertebereiche, erlaubte Werte. Was nicht passt, wird mit 422
 *     abgewiesen – mit einer Meldung, die dem Redaktor hilft, aber nichts
 *     ueber den Tabellenaufbau verraet.
 *   * Beitrag und Abschnitte werden in einer Transaktion geschrieben. Ein
 *     halb gespeicherter Beitrag waere schlimmer als ein Fehler.
 *
 * Aufbau eines Beitrags: Kopfdaten (Titel, Auszug, Datum …) und darunter
 * eine Folge von Bloecken. Ein Block ist eine Zeile in post_sections mit
 * Art (kind), Text und – je nach Art – null bis zwei Bildern, einer
 * Adresse, einer Tabelle, einer Liste von Dokumenten oder einem Standort.
 * Was zu welcher Art gehoert, steht in BLOCK_KINDS gleich hier unten.
 *
 * Events haben seit Migration 008 eigene Tabellen (events, event_sections …)
 * und laufen ueber /api/admin/events. Ihr Inhalt besteht aus denselben
 * Bausteinen, darum dieselben Funktionen – welche Tabellen sie beschreiben,
 * steht in CONTENT_TABLES (index.php). Dazu kommen die Angaben eines
 * Anlasses: Datum, Beginn und Ende, Ort mit Adresse, Preise, Anmeldung,
 * Zielgruppe und Zutritt.
 *
 * Dazu kommt unter /api/admin/home das Titelbild der Startseite
 * (Migration 007).
 */

declare(strict_types=1);

// ── Bloecke ─────────────────────────────────────────────────

/**
 * Arten, die der Editor kennt: wie viele Bilder eine Art traegt und was sie
 * neben Text und Bildern sonst noch mitbringt.
 *
 * Die Beigabe (payload) entscheidet, welche Spalten eines Abschnitts
 * gefuellt werden:
 *   'none'      nur Text und Bilder – wie bisher
 *   'url'       post_sections.url: das Ziel des Link-Bausteins
 *   'table'     post_sections.data: Zeilen und Spalten als JSON
 *   'documents' post_section_documents: Dateien zum Herunterladen
 *   'location'  post_sections.data: Breite, Laenge und Zoom als JSON
 *
 * Kommt eine Art dazu, ist hier, in den ENUM-Spalten post_sections.kind
 * (Migrationen 003, 005 und 006) und event_sections.kind (Migration 008)
 * und in src/app/shared/blocks.ts etwas zu tun.
 */
const BLOCK_KINDS = [
    'text'     => ['images' => 0, 'payload' => 'none'],
    'heading'  => ['images' => 0, 'payload' => 'none'],
    'quote'    => ['images' => 0, 'payload' => 'none'],
    'image'    => ['images' => 1, 'payload' => 'none'],
    'gallery'  => ['images' => 2, 'payload' => 'none'],
    'table'    => ['images' => 0, 'payload' => 'table'],
    'document' => ['images' => 0, 'payload' => 'documents'],
    'link'     => ['images' => 0, 'payload' => 'url'],
    'map'      => ['images' => 0, 'payload' => 'location'],
];

/**
 * Beitraege und Events und die Adresse, unter der sie im CMS angesprochen
 * werden. Der Router setzt den Typ aus der Adresse; aus dem Body wird er nie
 * gelesen.
 */
const POST_TYPES = [
    'posts'  => 'post',
    'events' => 'event',
];

// Die Tabellen je Typ (CONTENT_TABLES) stehen in index.php: die Lese-API
// braucht sie genauso.

/** Zoomstufen der Karte: weiter weg zeigt keinen Ort mehr, naeher gibt es nicht. */
const MAP_ZOOM_MIN = 3;
const MAP_ZOOM_MAX = 19;

/**
 * Grenzen der Preisliste eines Events. Mehr als eine Handvoll Stufen liest
 * niemand; wer eine ganze Tarifordnung hat, legt sie als Dokument bei.
 */
const EVENT_MAX_PRICES = 8;
const EVENT_PRICE_TEXT_MAX = 80;

/** Laengste erlaubte Textmenge in einem Block. */
const BLOCK_TEXT_MAX = 20000;

/** Laengste erlaubte Adresse in einem Link-Baustein; so breit ist die Spalte. */
const BLOCK_URL_MAX = 500;

/**
 * Grenzen des Tabellen-Bausteins.
 *
 * Nicht zum Schutz der Datenbank – die Spalte traegt viel mehr. Eine
 * Tabelle, die breiter ist als rund zehn Spalten, ist auf dem Telefon
 * ohnehin nicht mehr lesbar, und eine mit hundert Zeilen gehoert als Datei
 * zum Herunterladen in einen Dokument-Baustein.
 */
const TABLE_MAX_ROWS = 60;
const TABLE_MAX_COLUMNS = 10;
const TABLE_CELL_MAX = 500;

/** Dateien je Dokument-Baustein und Laenge ihrer Beschriftung. */
const BLOCK_MAX_DOCUMENTS = 20;
const DOCUMENT_LABEL_MAX = 200;

/** Groesste erlaubte Bilddatei beim Hochladen. */
const UPLOAD_MAX_BYTES = 8388608;

/**
 * Groesste erlaubte Dokumentdatei.
 *
 * Grosszuegiger als bei Bildern: ein eingescannter Jahresbericht sprengt
 * acht Megabyte muehelos, und verkleinern laesst sich ein PDF nicht so
 * nebenbei wie ein Foto.
 */
const UPLOAD_DOC_MAX_BYTES = 20971520;

/** Dateiendung je erlaubtem Bildtyp. Was hier fehlt, wird nicht angenommen. */
const UPLOAD_TYPES = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
    'image/gif'  => 'gif',
];

/**
 * Erlaubte Dokumenttypen, nach Dateiendung.
 *
 * Bei Bildern genuegt der aus dem Inhalt bestimmte Typ. Bei Office-Dateien
 * nicht: die drei neueren Formate (docx, xlsx, pptx) sind ZIP-Archive und
 * kommen aus finfo je nach Magic-Datenbank als das Format selbst oder nur
 * als application/zip zurueck; die drei aelteren sind OLE-Container und
 * melden sich als application/vnd.ms-office oder application/CDFV2. Eine
 * Pruefung allein auf den erkannten Typ wuerde also gueltige Dateien
 * abweisen.
 *
 * Darum entscheidet die Endung, welcher Typ gespeichert wird ('mime'), und
 * finfo bestaetigt nur, dass die Datei von dieser Bauart ist ('detected').
 * Eine in .docx umbenannte .exe faellt damit weiterhin auf. Der Dateiname
 * auf der Platte wird aus der Endung hier gebaut – eine .php kann so nie
 * entstehen, auch wenn jemand sie als solche hochzuladen versucht.
 */
const UPLOAD_DOC_TYPES = [
    'pdf'  => [
        'mime'     => 'application/pdf',
        'detected' => ['application/pdf'],
    ],
    'docx' => [
        'mime'     => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'detected' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip'],
    ],
    'doc'  => [
        'mime'     => 'application/msword',
        'detected' => ['application/msword', 'application/vnd.ms-office', 'application/CDFV2', 'application/x-ole-storage'],
    ],
    'xlsx' => [
        'mime'     => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'detected' => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip'],
    ],
    'xls'  => [
        'mime'     => 'application/vnd.ms-excel',
        'detected' => ['application/vnd.ms-excel', 'application/vnd.ms-office', 'application/CDFV2', 'application/x-ole-storage'],
    ],
    'pptx' => [
        'mime'     => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'detected' => ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip'],
    ],
    'ppt'  => [
        'mime'     => 'application/vnd.ms-powerpoint',
        'detected' => ['application/vnd.ms-powerpoint', 'application/vnd.ms-office', 'application/CDFV2', 'application/x-ole-storage'],
    ],
];

// ── Hilfen ──────────────────────────────────────────────────

/**
 * Zugang, der nicht geloescht werden darf.
 *
 * Irgendjemand muss immer hineinkommen. Ohne diese Sperre koennte sich die
 * Redaktion selbst aussperren – und dann hilft nur noch phpMyAdmin.
 * Ueberschreibbar in config.php, falls die Adresse einmal wechselt.
 */
const SUPER_ADMIN_EMAIL = 'info@verband-ika.ch';

/** Zeichenvorrat und Laenge des Startpassworts. */
const STARTPASSWORT_LAENGE = 16;

/**
 * Bewusst ohne 0/O und 1/l/I: das Startpasswort wird abgetippt oder
 * vorgelesen. Ein Passwort, bei dem man raten muss, ob da eine Eins oder ein
 * kleines L steht, kostet mehr Zeit, als die zwei zusaetzlichen Zeichen an
 * Sicherheit bringen.
 */
const STARTPASSWORT_ZEICHEN = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Beendet die Anfrage, wenn kein gueltiges Token mitkam. */
function requireUser(PDO $db): array
{
    $user = currentUser($db);
    if ($user === null) {
        fail(401, 'Nicht angemeldet.');
    }

    /*
     * Solange das verteilte Startpasswort gilt, ist hier Schluss – der
     * Zugang kann sich anmelden, aber sonst nichts.
     *
     * Diese Sperre muss auf dem Server stehen, nicht nur im Frontend: sonst
     * genuegte ein Direktaufruf der Schnittstelle, um sie zu umgehen, und der
     * erzwungene Wechsel waere eine Bitte statt einer Regel. Geaendert wird
     * unter /api/auth/password – das liegt ausserhalb dieses Bereichs und
     * bleibt darum erreichbar.
     */
    if ((bool) ($user['must_change_password'] ?? 0)) {
        fail(403, 'Bitte ändern Sie zuerst Ihr Passwort.');
    }

    return $user;
}

/** Die geschuetzte Adresse aus der Konfiguration, klein geschrieben. */
function superAdminEmail(array $config): string
{
    $email = (string) ($config['super_admin'] ?? SUPER_ADMIN_EMAIL);
    return mb_strtolower(trim($email), 'UTF-8');
}

/**
 * Wuerfelt ein Startpasswort.
 *
 * random_int und nicht rand(): nur ersteres ist kryptografisch sicher. Mit
 * rand() waere das Passwort aus dem Zeitpunkt der Erzeugung errechenbar.
 */
function generateStartPassword(): string
{
    $zeichen = STARTPASSWORT_ZEICHEN;
    $letzter = strlen($zeichen) - 1;

    $passwort = '';
    for ($i = 0; $i < STARTPASSWORT_LAENGE; $i++) {
        $passwort .= $zeichen[random_int(0, $letzter)];
    }
    return $passwort;
}

/** Meldet einen Eingabefehler. 422: verstanden, aber inhaltlich unbrauchbar. */
function invalid(string $message): void
{
    fail(422, $message);
}

/** Liest ein Textfeld, schneidet Leerraum weg und prueft die Laenge. */
function textField(array $body, string $key, int $max, bool $required = false): string
{
    $raw = $body[$key] ?? '';
    if (!is_string($raw)) {
        invalid('Das Feld "' . $key . '" muss Text sein.');
    }
    // Steuerzeichen ausser Zeilenumbruch und Tabulator haben in Inhalten
    // nichts verloren und koennen die Ausgabe durcheinanderbringen.
    $value = trim((string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $raw));

    if ($required && $value === '') {
        invalid('Das Feld "' . $key . '" darf nicht leer sein.');
    }
    // mb_strlen zaehlt Zeichen, nicht Bytes – sonst waere ein Text mit
    // Umlauten frueher "zu lang" als einer ohne.
    if (mb_strlen($value) > $max) {
        invalid('Das Feld "' . $key . '" ist zu lang (höchstens ' . $max . ' Zeichen).');
    }
    return $value;
}

/** Liest eine optionale Nummer (null oder positive Ganzzahl). */
function idField(array $body, string $key): ?int
{
    $raw = $body[$key] ?? null;
    if ($raw === null || $raw === '') {
        return null;
    }
    if (is_int($raw) && $raw > 0) {
        return $raw;
    }
    if (is_string($raw) && ctype_digit($raw) && (int) $raw > 0) {
        return (int) $raw;
    }
    invalid('Das Feld "' . $key . '" ist keine gültige Nummer.');

    // invalid() beendet die Anfrage. Die Zeile steht nur da, damit die
    // Signatur vollstaendig ist und kein Werkzeug einen fehlenden
    // Rueckgabewert anmahnt.
    return null;
}

/** Prueft ein Datum in der Form JJJJ-MM-TT und dass es den Tag wirklich gibt. */
function dateField(array $body, string $key): string
{
    $raw = $body[$key] ?? '';
    if (!is_string($raw) || preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw) !== 1) {
        invalid('Das Datum muss im Format JJJJ-MM-TT stehen.');
    }
    /** @var string $raw – nach der Pruefung oben steht das fest. */
    [$year, $month, $day] = array_map('intval', explode('-', $raw));
    if (!checkdate($month, $day, $year)) {
        invalid('Dieses Datum gibt es nicht.');
    }
    return $raw;
}

/**
 * Macht aus einem Titel einen Slug: Kleinbuchstaben, Ziffern, Bindestriche.
 * Umlaute werden ausgeschrieben, damit aus "Grüezi" nicht "grezi" wird.
 */
function slugify(string $text): string
{
    $map  = ['ä' => 'ae', 'ö' => 'oe', 'ü' => 'ue', 'Ä' => 'ae', 'Ö' => 'oe', 'Ü' => 'ue', 'ß' => 'ss'];
    $text = strtr($text, $map);
    $text = mb_strtolower($text, 'UTF-8');
    // Was nach der Umschrift noch kein a-z0-9 ist, wird zum Trenner.
    $text = (string) preg_replace('/[^a-z0-9]+/u', '-', $text);
    return trim($text, '-');
}

/**
 * Sorgt dafuer, dass der Slug einmalig ist. Ist er vergeben, wird -2, -3 …
 * angehaengt. $ignoreId ist der Beitrag, der gerade gespeichert wird – sein
 * eigener Slug darf natuerlich bleiben.
 *
 * $table ist posts oder events (aus CONTENT_TABLES, nie aus der Anfrage):
 * beide haben ihre eigenen Adressen, /beitraege/… und /events/….
 */
function uniqueSlug(PDO $db, string $base, ?int $ignoreId, string $table = 'posts'): string
{
    $base = substr($base, 0, 190);
    if ($base === '') {
        $base = $table === 'events' ? 'event' : 'beitrag';
    }
    $stmt = $db->prepare('SELECT 1 FROM `' . $table . '` WHERE slug = :slug AND id <> :id LIMIT 1');

    $slug = $base;
    for ($n = 2; $n < 200; $n++) {
        $stmt->execute([':slug' => $slug, ':id' => $ignoreId ?? 0]);
        if ($stmt->fetchColumn() === false) {
            return $slug;
        }
        $slug = $base . '-' . $n;
    }
    invalid('Für diesen Titel lässt sich keine freie Adresse finden.');

    return $base;
}

/**
 * Prueft, dass die genannte Zeile existiert. Sonst schluege beim Speichern
 * der Fremdschluessel zu – mit einer Fehlermeldung, die niemandem hilft.
 */
function requireRow(PDO $db, string $table, ?int $id, string $label): ?int
{
    if ($id === null) {
        return null;
    }
    // $table kommt ausschliesslich aus festen Zeichenketten im Code, nie aus
    // einer Anfrage – sonst waere diese Zeile eine Luecke.
    $stmt = $db->prepare('SELECT 1 FROM `' . $table . '` WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    if ($stmt->fetchColumn() === false) {
        invalid($label . ' gibt es nicht.');
    }
    return $id;
}

/**
 * Prueft die Adresse eines Link-Bausteins.
 *
 * Drei Formen sind erlaubt: die eigene Seite ("/beitraege/rueckblick"), eine
 * fremde Seite ueber http:// oder https://, und mailto:. Alles andere wird
 * abgewiesen – "javascript:" oder "data:" in einem href fuehrt beim
 * Anklicken Code aus, und das darf kein Redaktor versehentlich einbauen
 * koennen.
 *
 * Wer bloss "www.verband-ika.ch" tippt, bekommt das https:// ergaenzt. Ohne
 * das waere die Adresse relativ und zeigte ins Leere – ein Fehler, den man
 * erst nach dem Veroeffentlichen merkt.
 */
function urlField(mixed $raw, int $nr): string
{
    // Nicht als string deklariert: bei strict_types wuerde ein mitgeschickter
    // Wert falschen Typs einen TypeError und damit 500 ergeben. textField
    // weist ihn mit 422 und einer Meldung ab, so wie jedes andere Feld auch.
    $url = textField(['url' => $raw], 'url', BLOCK_URL_MAX);
    if ($url === '') {
        invalid('Baustein ' . $nr . ' ist ein Link und braucht darum eine Adresse.');
    }
    return safeUrl($url, 'von Baustein ' . $nr);
}

/**
 * Die Regel aus urlField fuer jede Adresse, die als href auf der Seite
 * landet – auch fuer den Anmeldeknopf eines Events. $where ergaenzt die
 * Fehlermeldung ("von Baustein 3", "der Anmeldung").
 */
function safeUrl(string $url, string $where): string
{
    // Steht ein Schema da, muss es ein unbedenkliches sein.
    if (preg_match('#^[a-z][a-z0-9+.\-]*:#i', $url) === 1) {
        if (preg_match('#^(https?://|mailto:)#i', $url) !== 1) {
            invalid(
                'Die Adresse ' . $where . ' ist nicht erlaubt. Verwenden Sie '
                . 'http://, https://, mailto: oder eine Adresse der eigenen Seite wie "/beitraege".'
            );
        }
        return $url;
    }

    // Eigene Seite.
    if (str_starts_with($url, '/')) {
        return $url;
    }

    return 'https://' . $url;
}

/**
 * Prueft die Tabelle eines Tabellen-Bausteins und bringt sie auf eine
 * rechteckige Form.
 *
 * Rechteckig heisst: alle Zeilen sind so breit wie die breiteste. Der Editor
 * haelt das schon ein, aber darauf verlassen kann sich die API nicht – und
 * eine Zeile mit zwei Zellen in einer dreispaltigen Tabelle wuerde die
 * Darstellung verschieben.
 *
 * @return array{head: bool, rows: array<int, array<int, string>>}
 */
function tableField(array $entry, int $nr): array
{
    $raw = $entry['table'] ?? null;
    if (!is_array($raw)) {
        invalid('Baustein ' . $nr . ' ist eine Tabelle, bringt aber keine mit.');
    }

    $rawRows = $raw['rows'] ?? [];
    if (!is_array($rawRows) || $rawRows === []) {
        invalid('Die Tabelle in Baustein ' . $nr . ' hat keine Zeilen.');
    }
    if (count($rawRows) > TABLE_MAX_ROWS) {
        invalid('Die Tabelle in Baustein ' . $nr . ' hat mehr als ' . TABLE_MAX_ROWS . ' Zeilen.');
    }

    $rows  = [];
    $width = 0;
    foreach (array_values($rawRows) as $rawRow) {
        if (!is_array($rawRow)) {
            invalid('Die Tabelle in Baustein ' . $nr . ' ist unbrauchbar.');
        }
        if (count($rawRow) > TABLE_MAX_COLUMNS) {
            invalid('Die Tabelle in Baustein ' . $nr . ' hat mehr als ' . TABLE_MAX_COLUMNS . ' Spalten.');
        }

        $row = [];
        foreach (array_values($rawRow) as $cell) {
            $row[] = textField(['c' => $cell], 'c', TABLE_CELL_MAX);
        }
        $width = max($width, count($row));
        $rows[] = $row;
    }

    if ($width === 0) {
        invalid('Die Tabelle in Baustein ' . $nr . ' hat keine Spalten.');
    }

    foreach ($rows as $index => $row) {
        $rows[$index] = array_pad($row, $width, '');
    }

    return ['head' => !empty($raw['head']), 'rows' => $rows];
}

/**
 * Liest die Dateiliste eines Dokument-Bausteins.
 *
 * Jeder Eintrag ist eine Datei aus dem Bestand und die Beschriftung, unter
 * der sie im Beitrag steht. Fehlt die Beschriftung, tritt der Dateiname an
 * ihre Stelle: ein Download ohne Linktext waere im Beitrag unsichtbar.
 *
 * Anders als bei den Bildern fliegen Dubletten nicht raus –
 * post_section_documents hat einen eigenen Schluessel, dieselbe Datei darf
 * also zweimal auftauchen.
 *
 * @return array<int, array{mediaId: int, label: string}>
 */
function documentsField(PDO $db, array $entry, int $nr): array
{
    $raw = $entry['documents'] ?? [];
    if (!is_array($raw)) {
        invalid('Die Dokumente von Baustein ' . $nr . ' sind unbrauchbar.');
    }
    if (count($raw) > BLOCK_MAX_DOCUMENTS) {
        invalid('Baustein ' . $nr . ' darf höchstens ' . BLOCK_MAX_DOCUMENTS . ' Dokumente enthalten.');
    }

    $documents = [];
    foreach (array_values($raw) as $item) {
        if (!is_array($item)) {
            invalid('Die Dokumente von Baustein ' . $nr . ' sind unbrauchbar.');
        }

        $mediaId = idField($item, 'mediaId');
        if ($mediaId === null) {
            invalid('Ein Dokument in Baustein ' . $nr . ' hat keine Datei.');
        }

        // Nicht nur, ob die Datei existiert, sondern auch ihren Pfad: er
        // dient als Beschriftung, wenn keine gepflegt ist.
        $stmt = $db->prepare('SELECT path FROM media WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $mediaId]);
        $path = $stmt->fetchColumn();
        if ($path === false) {
            invalid('Ein gewähltes Dokument gibt es nicht.');
        }

        $label = textField($item, 'label', DOCUMENT_LABEL_MAX);
        if ($label === '') {
            $label = basename((string) $path);
        }

        $documents[] = ['mediaId' => $mediaId, 'label' => $label];
    }
    return $documents;
}

/**
 * Liest den Standort eines Karten-Bausteins.
 *
 * Breite und Laenge als Zahlen in ihrem Wertebereich, die Zoomstufe als
 * Ganzzahl. Gerundet auf sechs Stellen – das ist rund ein Dezimeter und
 * damit genauer, als jemand auf einer Karte zeigen kann.
 *
 * Die Breite endet bei ±85 Grad: weiter reicht die Kartenprojektion nicht,
 * ein Punkt dort liesse sich nicht anzeigen.
 *
 * @return array{lat: float, lng: float, zoom: int}
 */
function locationField(array $entry, int $nr): array
{
    $raw = $entry['location'] ?? null;
    if (!is_array($raw)) {
        invalid('Baustein ' . $nr . ' ist eine Karte, hat aber noch keinen Standort.');
    }

    $lat  = $raw['lat'] ?? null;
    $lng  = $raw['lng'] ?? null;
    $zoom = $raw['zoom'] ?? 16;

    if (!(is_int($lat) || is_float($lat)) || !(is_int($lng) || is_float($lng))) {
        invalid('Der Standort in Baustein ' . $nr . ' ist unbrauchbar.');
    }
    if ($lat < -85 || $lat > 85 || $lng < -180 || $lng > 180) {
        invalid('Der Standort in Baustein ' . $nr . ' liegt ausserhalb der Karte.');
    }
    if (!is_int($zoom) || $zoom < MAP_ZOOM_MIN || $zoom > MAP_ZOOM_MAX) {
        invalid('Die Zoomstufe in Baustein ' . $nr . ' ist unbrauchbar.');
    }

    return [
        'lat'  => round((float) $lat, 6),
        'lng'  => round((float) $lng, 6),
        'zoom' => $zoom,
    ];
}

/**
 * Liest die Blockliste aus dem Body und bringt sie in eine Form, auf die man
 * sich beim Schreiben verlassen kann.
 */
function blocksField(PDO $db, array $body): array
{
    $raw = $body['blocks'] ?? [];
    if (!is_array($raw)) {
        invalid('Die Bausteine müssen als Liste kommen.');
    }
    if (count($raw) > 200) {
        invalid('Ein Beitrag darf höchstens 200 Bausteine haben.');
    }

    $blocks = [];
    foreach (array_values($raw) as $index => $entry) {
        $nr = $index + 1;
        if (!is_array($entry)) {
            invalid('Baustein ' . $nr . ' ist unbrauchbar.');
        }

        $kind = $entry['kind'] ?? '';
        if (!is_string($kind) || !array_key_exists($kind, BLOCK_KINDS)) {
            invalid('Baustein ' . $nr . ' hat eine unbekannte Art.');
        }

        $text = textField($entry, 'text', BLOCK_TEXT_MAX);

        // Bildnummern: nur so viele, wie die Art vorsieht. Dubletten fliegen
        // raus, weil post_section_images ein Bild je Abschnitt nur einmal
        // fuehren kann (der Schluessel ist section_id + media_id).
        $imageIds  = [];
        $maxImages = BLOCK_KINDS[$kind]['images'];
        if ($maxImages > 0) {
            $ids = $entry['imageIds'] ?? [];
            if (!is_array($ids)) {
                invalid('Die Bilder von Baustein ' . $nr . ' sind unbrauchbar.');
            }
            foreach (array_slice(array_values($ids), 0, $maxImages) as $value) {
                $mediaId = idField(['id' => $value], 'id');
                if ($mediaId !== null && !in_array($mediaId, $imageIds, true)) {
                    $imageIds[] = requireRow($db, 'media', $mediaId, 'Ein gewähltes Bild');
                }
            }
        }

        /*
         * Die Beigabe der Art: Adresse, Tabelle oder Dateiliste. Jede Art hat
         * hoechstens eine, und was nicht zur Art gehoert, wird nicht gelesen –
         * so kann ein mitgeschicktes Feld nie in einem Baustein landen, der
         * es nachher nicht anzeigt.
         */
        $url       = null;
        $table     = null;
        $documents = [];
        $location  = null;

        switch (BLOCK_KINDS[$kind]['payload']) {
            case 'url':
                $url = urlField($entry['url'] ?? '', $nr);
                break;
            case 'table':
                $table = tableField($entry, $nr);
                break;
            case 'documents':
                $documents = documentsField($db, $entry, $nr);
                if ($documents === []) {
                    invalid('Baustein ' . $nr . ' ist für Dokumente gedacht, enthält aber keine.');
                }
                break;
            case 'location':
                $location = locationField($entry, $nr);
                break;
        }

        /*
         * Ein Block ohne jeden Inhalt waere im Beitrag eine Luecke. Was als
         * Inhalt zaehlt, haengt von der Art ab: beim Link ist es die Adresse
         * (der Titel darf fehlen, dann steht die Adresse selbst da), bei der
         * Tabelle eine gefuellte Zelle. Die Dateiliste ist oben schon
         * geprueft, und bei den uebrigen Arten gilt wie bisher Text oder Bild.
         */
        $leer = match (BLOCK_KINDS[$kind]['payload']) {
            'url'       => false,
            'table'     => $table !== null && !tableHasContent($table),
            'documents' => false,
            'location'  => false,
            default     => $text === '' && $imageIds === [],
        };
        if ($leer) {
            invalid('Baustein ' . $nr . ' ist leer.');
        }

        $blocks[] = [
            'kind'      => $kind,
            'text'      => $text,
            'imageIds'  => $imageIds,
            'url'       => $url,
            'table'     => $table,
            'documents' => $documents,
            'location'  => $location,
        ];
    }
    return $blocks;
}

/**
 * Liest eine Uhrzeit (HH:MM). Leer ist erlaubt und wird zu null – ein
 * Anlass ohne Beginn dauert den ganzen Tag oder steht noch nicht fest.
 */
function timeField(array $body, string $key, string $label): ?string
{
    $raw = $body[$key] ?? '';
    if ($raw === '') {
        return null;
    }
    if (!is_string($raw) || preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $raw) !== 1) {
        invalid($label . ' muss als Uhrzeit wie 17:30 stehen.');
    }
    /** @var string $raw */
    return $raw;
}

/**
 * Liest die Preisstufen eines Events: je eine Bezeichnung und ein Betrag,
 * beides als Text ("Mitglieder" – "gratis"). Ganz leere Zeilen fallen weg,
 * halb leere werden abgewiesen – ein Preis ohne Bezeichnung sagt nichts.
 *
 * @return array<int, array{label: string, value: string}>
 */
function pricesField(array $body): array
{
    $raw = $body['prices'] ?? [];
    if (!is_array($raw)) {
        invalid('Die Preise müssen als Liste kommen.');
    }

    $prices = [];
    foreach (array_values($raw) as $index => $entry) {
        if (!is_array($entry)) {
            invalid('Preis ' . ($index + 1) . ' ist unbrauchbar.');
        }
        $label = textField($entry, 'label', EVENT_PRICE_TEXT_MAX);
        $value = textField($entry, 'value', EVENT_PRICE_TEXT_MAX);
        if ($label === '' && $value === '') {
            continue;
        }
        if ($label === '' || $value === '') {
            invalid('Preis ' . ($index + 1) . ' braucht eine Bezeichnung und einen Betrag.');
        }
        $prices[] = ['label' => $label, 'value' => $value];
    }
    if (count($prices) > EVENT_MAX_PRICES) {
        invalid('Ein Event darf höchstens ' . EVENT_MAX_PRICES . ' Preisstufen haben.');
    }
    return $prices;
}

/**
 * Baut die geprueften Kopfdaten eines Beitrags oder Events aus dem Body.
 *
 * Beide haben Titel, Anriss, Titelbild, Kategorien und Status. Dazu kommt
 * beim Beitrag Datum und Autor, beim Event alles, was einen Anlass
 * ausmacht – Datum und Ort sind dort Pflicht.
 *
 * Die Schluessel des Ergebnisses sind genau die Spalten aus
 * CONTENT_TABLES[$type]['columns'] plus slug.
 */
function contentFields(PDO $db, array $body, ?int $id, string $type): array
{
    $title  = textField($body, 'title', 255, true);
    $status = $body['status'] ?? 'draft';
    if ($status !== 'draft' && $status !== 'published') {
        invalid('Der Status muss "draft" oder "published" sein.');
    }

    /*
     * Die Adresse entsteht immer aus dem Titel – von Hand setzen laesst sie
     * sich nicht. Das haelt Titel und Adresse beieinander und nimmt der
     * Redaktion eine Entscheidung ab, die sie nie treffen wollte.
     *
     * uniqueSlug haengt -2, -3 … an, wenn der Name schon vergeben ist, und
     * laesst dem Eintrag dabei seine eigene Adresse (deshalb $id). Beim
     * erneuten Speichern kommt darum wieder dasselbe heraus.
     */
    $common = [
        'slug'        => uniqueSlug($db, slugify($title), $id, CONTENT_TABLES[$type]['main']),
        'title'       => $title,
        'excerpt'     => textField($body, 'excerpt', 2000),
        'cover_id'    => requireRow($db, 'media', idField($body, 'coverId'), 'Das gewählte Titelbild'),
        'category_id' => requireRow($db, 'categories', idField($body, 'categoryId'), 'Die gewählte Kategorie'),
        'status'      => $status,
    ];

    return $common + ($type === 'event' ? eventFields($body) : postOnlyFields($body));
}

/** Was nur ein Beitrag hat: Datum, Autor, Lesedauer. */
function postOnlyFields(array $body): array
{
    $readRaw     = $body['readMinutes'] ?? null;
    $readMinutes = null;
    if ($readRaw !== null && $readRaw !== '') {
        $minutes = idField(['v' => $readRaw], 'v');
        if ($minutes === null || $minutes > 255) {
            invalid('Die Lesedauer muss zwischen 1 und 255 Minuten liegen.');
        }
        $readMinutes = $minutes;
    }

    $author = textField($body, 'author', 120);

    return [
        'published_at' => dateField($body, 'date'),
        'author'       => $author === '' ? null : $author,
        'read_minutes' => $readMinutes,
    ];
}

/**
 * Was nur ein Event hat (Migration 008): die Angaben eines Anlasses, wie er
 * frueher bei guidle stand – ohne den Plan.
 */
function eventFields(array $body): array
{
    $start = timeField($body, 'eventStart', 'Der Beginn');
    $end   = timeField($body, 'eventEnd', 'Das Ende');
    if ($end !== null && $start === null) {
        invalid('Ein Ende ohne Beginn ergibt keinen Sinn. Tragen Sie zuerst den Beginn ein.');
    }
    // Gleich lange Zeichenketten im Format HH:MM vergleichen sich wie Zeiten.
    if ($start !== null && $end !== null && $end <= $start) {
        invalid('Das Ende muss nach dem Beginn liegen.');
    }

    $registration = textField($body, 'registrationUrl', BLOCK_URL_MAX);
    $prices       = pricesField($body);
    // Optionale Texte: leer wird zu null, damit die Spalten nicht mit
    // leeren Zeichenketten und NULL zwei Arten von "nichts" fuehren.
    $optional = static fn (string $value): ?string => $value === '' ? null : $value;

    return [
        'kicker'           => $optional(textField($body, 'kicker', 120)),
        'event_date'       => dateField($body, 'eventDate'),
        'event_start'      => $start,
        'event_end'        => $end,
        'location'         => textField($body, 'location', 160, true),
        'street'           => $optional(textField($body, 'street', 160)),
        'city'             => $optional(textField($body, 'city', 120)),
        'prices'           => $prices === [] ? null : json_encode($prices, JSON_UNESCAPED_UNICODE),
        'registration_url' => $registration === '' ? null : safeUrl($registration, 'der Anmeldung'),
        'audience'         => $optional(textField($body, 'audience', 255)),
        'admission'        => $optional(textField($body, 'admission', 500)),
        'members_only'     => ($body['membersOnly'] ?? false) === true ? 1 : 0,
    ];
}

/** Steht in irgendeiner Zelle der Tabelle etwas? */
function tableHasContent(array $table): bool
{
    foreach ($table['rows'] as $row) {
        foreach ($row as $cell) {
            if ($cell !== '') {
                return true;
            }
        }
    }
    return false;
}

/** Liest die Kategorienummern fuer die Mehrfachzuordnung. */
function categoryIdsField(PDO $db, array $body): array
{
    $raw = $body['categoryIds'] ?? [];
    if (!is_array($raw)) {
        invalid('Die Kategorien müssen als Liste kommen.');
    }
    $ids = [];
    foreach (array_slice(array_values($raw), 0, 20) as $value) {
        $id = idField(['id' => $value], 'id');
        if ($id !== null && !in_array($id, $ids, true)) {
            $ids[] = requireRow($db, 'categories', $id, 'Eine gewählte Kategorie');
        }
    }
    return $ids;
}

/**
 * Schreibt Bloecke und Kategorien eines Beitrags oder Events neu – in die
 * Tabellen seines Typs.
 *
 * Bewusst "alles loeschen, alles neu": die Bloecke haben ueber das Formular
 * hinweg keine stabile Identitaet – der Redaktor schiebt sie um, loescht und
 * fuegt ein. Ein Abgleich Zeile fuer Zeile waere aufwendiger und
 * fehleranfaelliger als das Neuschreiben einer Handvoll Zeilen.
 */
function writeRelations(PDO $db, string $type, int $id, array $blocks, array $categoryIds): void
{
    // Tabellen- und Spaltennamen aus CONTENT_TABLES – feste Zeichenketten.
    $t     = CONTENT_TABLES[$type];
    $owner = $t['owner'];

    $stmt = $db->prepare('DELETE FROM ' . $t['sections'] . ' WHERE ' . $owner . ' = :id');
    $stmt->execute([':id' => $id]);
    // Bilder und Dokumente der Abschnitte haengen per ON DELETE CASCADE
    // daran und gehen mit.

    $insertSection = $db->prepare(
        'INSERT INTO ' . $t['sections'] . ' (' . $owner . ', position, kind, text, url, data)
         VALUES (:owner, :position, :kind, :text, :url, :data)'
    );
    $insertImage = $db->prepare(
        'INSERT INTO ' . $t['images'] . ' (section_id, media_id, position)
         VALUES (:section, :media, :position)'
    );
    $insertDocument = $db->prepare(
        'INSERT INTO ' . $t['documents'] . ' (section_id, media_id, label, position)
         VALUES (:section, :media, :label, :position)'
    );

    foreach ($blocks as $position => $block) {
        $insertSection->execute([
            ':owner'    => $id,
            ':position' => $position,
            ':kind'     => $block['kind'],
            ':text'     => $block['text'],
            ':url'      => $block['url'],
            // JSON_UNESCAPED_UNICODE: sonst stehen Umlaute als ä in der
            // Spalte – gueltig, aber in phpMyAdmin nicht mehr lesbar.
            // Tabelle und Standort teilen sich die Spalte; eine Art traegt
            // hoechstens eines von beiden.
            ':data'     => match (true) {
                $block['table'] !== null    => json_encode($block['table'], JSON_UNESCAPED_UNICODE),
                $block['location'] !== null => json_encode($block['location']),
                default                     => null,
            },
        ]);
        $sectionId = (int) $db->lastInsertId();

        foreach ($block['imageIds'] as $imagePosition => $mediaId) {
            $insertImage->execute([
                ':section'  => $sectionId,
                ':media'    => $mediaId,
                ':position' => $imagePosition,
            ]);
        }

        foreach ($block['documents'] as $documentPosition => $document) {
            $insertDocument->execute([
                ':section'  => $sectionId,
                ':media'    => $document['mediaId'],
                ':label'    => $document['label'],
                ':position' => $documentPosition,
            ]);
        }
    }

    $stmt = $db->prepare('DELETE FROM ' . $t['categories'] . ' WHERE ' . $owner . ' = :id');
    $stmt->execute([':id' => $id]);

    $insertCategory = $db->prepare(
        'INSERT INTO ' . $t['categories'] . ' (' . $owner . ', category_id) VALUES (:owner, :category)'
    );
    foreach ($categoryIds as $categoryId) {
        $insertCategory->execute([':owner' => $id, ':category' => $categoryId]);
    }
}

// ── Endpunkte: Beitraege und Events ─────────────────────────

/** Meldung, wenn ein Eintrag fehlt – mit dem Wort, das der Redaktor kennt. */
function notFoundText(string $type): string
{
    return $type === 'event' ? 'Event nicht gefunden.' : 'Beitrag nicht gefunden.';
}

/**
 * GET /api/admin/posts und /api/admin/events – alle Eintraege, auch
 * Entwuerfe.
 *
 * Anders als die oeffentliche Liste ohne Blaettern: die Redaktion will die
 * ganze Liste sehen und im Browser suchen und filtern. Events stehen nach
 * ihrem Datum, das spaeteste zuoberst – die kommenden sind die, an denen
 * gerade gearbeitet wird.
 */
function adminListPosts(PDO $db, string $base, string $type): void
{
    $isEvent = $type === 'event';
    $t       = CONTENT_TABLES[$type];

    // Spalten und Sortierung je Typ aus festen Zeichenketten, nie aus der Anfrage.
    $extra = $isEvent
        ? 'p.event_date, p.event_start, p.event_end, p.location'
        : 'p.published_at';
    $order = $isEvent ? 'p.event_date DESC, p.id DESC' : 'p.published_at DESC, p.id DESC';

    $rows = $db->query(
        'SELECT p.id, p.slug, p.title, p.excerpt, p.status, p.updated_at, ' . $extra . ',
                c.id AS category_id, c.name AS category,
                m.path, m.alt, m.width, m.height,
                (SELECT COUNT(*) FROM ' . $t['sections'] . ' s WHERE s.' . $t['owner'] . ' = p.id) AS block_count
           FROM ' . $t['main'] . ' p
           LEFT JOIN categories c ON c.id = p.category_id
           LEFT JOIN media m      ON m.id = p.cover_id
          ORDER BY ' . $order
    )->fetchAll();

    $data = [];
    foreach ($rows as $row) {
        $data[] = [
            'id'         => (int) $row['id'],
            'slug'       => $row['slug'],
            'title'      => $row['title'],
            'excerpt'    => $row['excerpt'],
            'date'       => $row['published_at'] ?? null,
            'eventDate'  => $row['event_date'] ?? null,
            'eventStart' => clockTime($row['event_start'] ?? null),
            'eventEnd'   => clockTime($row['event_end'] ?? null),
            'location'   => $row['location'] ?? null,
            'status'     => $row['status'],
            'updatedAt'  => $row['updated_at'],
            'categoryId' => $row['category_id'] === null ? null : (int) $row['category_id'],
            'category'   => $row['category'],
            'blockCount' => (int) $row['block_count'],
            'cover'      => mediaObject($row, $base),
        ];
    }
    send(['data' => $data], 200, 0);
}

/**
 * GET /api/admin/posts/{id} – ein Beitrag samt Bloecken, auch als Entwurf.
 * GET /api/admin/events/{id} – ein Event samt Bloecken.
 */
function adminShowPost(PDO $db, int $id, string $base, string $type): void
{
    $t = CONTENT_TABLES[$type];

    $stmt = $db->prepare(
        'SELECT p.*, m.path, m.alt, m.mime, m.width, m.height, m.bytes
           FROM ' . $t['main'] . ' p
           LEFT JOIN media m ON m.id = p.cover_id
          WHERE p.id = :id
          LIMIT 1'
    );
    $stmt->execute([':id' => $id]);
    $post = $stmt->fetch();
    if ($post === false) {
        fail(404, notFoundText($type));
    }

    $stmt = $db->prepare('SELECT category_id FROM ' . $t['categories'] . ' WHERE ' . $t['owner'] . ' = :id');
    $stmt->execute([':id' => $id]);
    $categoryIds = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));

    $stmt = $db->prepare(
        'SELECT id, kind, text, url, data FROM ' . $t['sections'] . '
          WHERE ' . $t['owner'] . ' = :id ORDER BY position, id'
    );
    $stmt->execute([':id' => $id]);
    $sections = $stmt->fetchAll();

    // Die Bilder und Dokumente aller Abschnitte in je einer Abfrage statt in
    // zwei je Abschnitt.
    $images    = [];
    $documents = [];
    if ($sections !== []) {
        $ids          = array_column($sections, 'id');
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt         = $db->prepare(
            'SELECT ssi.section_id, m.id, m.path, m.alt, m.mime, m.width, m.height, m.bytes
               FROM ' . $t['images'] . ' ssi
               JOIN media m ON m.id = ssi.media_id
              WHERE ssi.section_id IN (' . $placeholders . ')
              ORDER BY ssi.position'
        );
        $stmt->execute($ids);
        foreach ($stmt->fetchAll() as $row) {
            $images[(int) $row['section_id']][] = mediaEntry($row, $base);
        }

        $stmt = $db->prepare(
            'SELECT sd.section_id, sd.label, m.id, m.path, m.alt, m.mime, m.width, m.height, m.bytes
               FROM ' . $t['documents'] . ' sd
               JOIN media m ON m.id = sd.media_id
              WHERE sd.section_id IN (' . $placeholders . ')
              ORDER BY sd.position, sd.id'
        );
        $stmt->execute($ids);
        foreach ($stmt->fetchAll() as $row) {
            // Die Beschriftung gehoert zum Baustein, die Datei zum Bestand.
            // Darum beides getrennt: dieselbe Datei kann anderswo unter
            // einer anderen Beschriftung stehen.
            $documents[(int) $row['section_id']][] = [
                'label' => (string) $row['label'],
                'file'  => mediaEntry($row, $base),
            ];
        }
    }

    $blocks = [];
    foreach ($sections as $section) {
        $sectionId = (int) $section['id'];
        $blocks[] = [
            'kind'      => $section['kind'],
            'text'      => $section['text'],
            'images'    => $images[$sectionId] ?? [],
            'url'       => $section['url'],
            // Tabelle und Standort teilen sich die Spalte data. Welches von
            // beiden drinsteht, sagt die Art.
            'table'     => $section['kind'] === 'table' ? tableObject($section['data']) : null,
            'documents' => $documents[$sectionId] ?? [],
            'location'  => $section['kind'] === 'map' ? locationObject($section['data']) : null,
        ];
    }

    $data = [
        'id'          => (int) $post['id'],
        'slug'        => $post['slug'],
        'title'       => $post['title'],
        'excerpt'     => $post['excerpt'],
        'status'      => $post['status'],
        'categoryId'  => $post['category_id'] === null ? null : (int) $post['category_id'],
        'categoryIds' => $categoryIds,
        'coverId'     => $post['cover_id'] === null ? null : (int) $post['cover_id'],
        // Als vollstaendiger Medieneintrag, nicht nur als Bildquelle: der
        // Editor haelt das Titelbild in derselben Form wie jedes Bild aus
        // der Auswahl und muss nichts zusammensetzen.
        'cover'       => $post['cover_id'] === null
            ? null
            : mediaEntry(['id' => (int) $post['cover_id']] + $post, $base),
        'updatedAt'   => $post['updated_at'],
        'blocks'      => $blocks,
    ];

    $data += $type === 'event'
        ? ['eventDate' => $post['event_date']] + eventObject($post)
        : [
            'date'        => $post['published_at'],
            'author'      => $post['author'],
            'readMinutes' => $post['read_minutes'] === null ? null : (int) $post['read_minutes'],
        ];

    send(['data' => $data], 200, 0);
}

/** POST /api/admin/posts und /api/admin/events – neuer Eintrag. */
function adminCreatePost(PDO $db, string $type): void
{
    $body        = jsonBody();
    $fields      = contentFields($db, $body, null, $type);
    $blocks      = blocksField($db, $body);
    $categoryIds = categoryIdsField($db, $body);

    // Spaltennamen aus CONTENT_TABLES, also aus dem Code, nie aus der Anfrage.
    $columns = array_merge(['slug'], CONTENT_TABLES[$type]['columns']);
    $params  = [];
    foreach ($columns as $column) {
        $params[':' . $column] = $fields[$column];
    }

    try {
        $db->beginTransaction();

        $stmt = $db->prepare(
            'INSERT INTO ' . CONTENT_TABLES[$type]['main'] . ' (' . implode(', ', $columns) . ')
             VALUES (:' . implode(', :', $columns) . ')'
        );
        $stmt->execute($params);
        $id = (int) $db->lastInsertId();

        writeRelations($db, $type, $id, $blocks, $categoryIds);
        $db->commit();
    } catch (Throwable $e) {
        // Ohne Ruecknahme bliebe ein Eintrag ohne seine Bloecke stehen.
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }

    send(['data' => ['id' => $id, 'slug' => $fields['slug']]], 201, 0);
}

/** PUT /api/admin/posts/{id} und /api/admin/events/{id} – Eintrag speichern. */
function adminUpdatePost(PDO $db, int $id, string $type): void
{
    $table = CONTENT_TABLES[$type]['main'];

    $stmt = $db->prepare('SELECT id FROM ' . $table . ' WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    if ($stmt->fetchColumn() === false) {
        fail(404, notFoundText($type));
    }

    $body        = jsonBody();
    $fields      = contentFields($db, $body, $id, $type);
    $blocks      = blocksField($db, $body);
    $categoryIds = categoryIdsField($db, $body);

    $columns     = array_merge(['slug'], CONTENT_TABLES[$type]['columns']);
    $assignments = [];
    $params      = [':id' => $id];
    foreach ($columns as $column) {
        $assignments[]          = $column . ' = :' . $column;
        $params[':' . $column] = $fields[$column];
    }

    try {
        $db->beginTransaction();

        $stmt = $db->prepare(
            'UPDATE ' . $table . ' SET ' . implode(', ', $assignments) . ' WHERE id = :id'
        );
        $stmt->execute($params);

        writeRelations($db, $type, $id, $blocks, $categoryIds);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }

    send(['data' => ['id' => $id, 'slug' => $fields['slug']]], 200, 0);
}

/**
 * DELETE /api/admin/posts/{id} und /api/admin/events/{id} – Eintrag
 * entfernen.
 *
 * Abschnitte, Bildzuordnungen und Kategorien gehen ueber ON DELETE CASCADE
 * mit. Die Bilder selbst bleiben in media: sie koennen anderswo verwendet
 * sein, und eine geloeschte Datei bekommt man nicht zurueck.
 */
function adminDeletePost(PDO $db, int $id, string $type): void
{
    $stmt = $db->prepare('DELETE FROM ' . CONTENT_TABLES[$type]['main'] . ' WHERE id = :id');
    $stmt->execute([':id' => $id]);

    if ($stmt->rowCount() === 0) {
        fail(404, notFoundText($type));
    }
    send(['data' => ['deleted' => true]], 200, 0);
}

// ── Endpunkte: Bildergalerien ───────────────────────────────

/** Wie uniqueSlug(), nur fuer die Tabelle albums. */
function uniqueAlbumSlug(PDO $db, string $base, ?int $ignoreId): string
{
    $base = substr($base, 0, 190);
    if ($base === '') {
        $base = 'album';
    }
    $stmt = $db->prepare('SELECT 1 FROM albums WHERE slug = :slug AND id <> :id LIMIT 1');

    $slug = $base;
    for ($n = 2; $n < 200; $n++) {
        $stmt->execute([':slug' => $slug, ':id' => $ignoreId ?? 0]);
        if ($stmt->fetchColumn() === false) {
            return $slug;
        }
        $slug = $base . '-' . $n;
    }
    invalid('Für diesen Titel lässt sich keine freie Adresse finden.');

    return $base;
}

/**
 * Liest die Bildliste eines Albums aus dem Body.
 *
 * Dubletten fliegen raus: album_images fuehrt ein Bild je Album nur einmal
 * (der Schluessel ist album_id + media_id). Zweimal dasselbe Bild waere
 * beim Speichern ein Fehler statt zweier Kacheln.
 */
function albumImagesField(PDO $db, array $body): array
{
    $raw = $body['imageIds'] ?? [];
    if (!is_array($raw)) {
        invalid('Die Bilder müssen als Liste kommen.');
    }
    if (count($raw) > 300) {
        invalid('Ein Album darf höchstens 300 Bilder haben.');
    }

    $ids = [];
    foreach (array_values($raw) as $value) {
        $mediaId = idField(['id' => $value], 'id');
        if ($mediaId !== null && !in_array($mediaId, $ids, true)) {
            $ids[] = requireRow($db, 'media', $mediaId, 'Ein gewähltes Bild');
        }
    }
    return $ids;
}

/** Baut die geprueften Kopfdaten eines Albums. */
function albumFields(PDO $db, array $body, ?int $albumId, array $imageIds): array
{
    $title  = textField($body, 'title', 255, true);
    $status = $body['status'] ?? 'draft';
    if ($status !== 'draft' && $status !== 'published') {
        invalid('Der Status muss "draft" oder "published" sein.');
    }

    $location = textField($body, 'location', 160);
    $cover    = requireRow($db, 'media', idField($body, 'coverId'), 'Das gewählte Titelbild');

    /*
     * Ohne gewaehltes Titelbild nimmt das Album sein erstes Bild. Eine Karte
     * in der Galerie ohne Bild sieht nach einem Fehler aus, und "das erste
     * Bild" ist das, was man ohnehin erwartet.
     */
    if ($cover === null && $imageIds !== []) {
        $cover = $imageIds[0];
    }

    return [
        'slug'        => uniqueAlbumSlug($db, slugify($title), $albumId),
        'title'       => $title,
        'excerpt'     => textField($body, 'excerpt', 2000),
        'event_date'  => dateField($body, 'date'),
        'location'    => $location === '' ? null : $location,
        'category_id' => requireRow($db, 'categories', idField($body, 'categoryId'), 'Die gewählte Kategorie'),
        'cover_id'    => $cover,
        'status'      => $status,
    ];
}

/** Schreibt die Bildliste eines Albums neu – wie bei den Beitragsbloecken. */
function writeAlbumImages(PDO $db, int $albumId, array $imageIds): void
{
    $stmt = $db->prepare('DELETE FROM album_images WHERE album_id = :id');
    $stmt->execute([':id' => $albumId]);

    $insert = $db->prepare(
        'INSERT INTO album_images (album_id, media_id, position)
         VALUES (:album, :media, :position)'
    );
    foreach ($imageIds as $position => $mediaId) {
        $insert->execute([':album' => $albumId, ':media' => $mediaId, ':position' => $position]);
    }
}

/** GET /api/admin/albums – alle Alben, auch Entwuerfe. */
function adminListAlbums(PDO $db, string $base): void
{
    $rows = $db->query(
        'SELECT a.id, a.slug, a.title, a.excerpt, a.event_date, a.location, a.status,
                c.name AS category,
                m.path, m.alt, m.width, m.height,
                (SELECT COUNT(*) FROM album_images ai WHERE ai.album_id = a.id) AS image_count
           FROM albums a
           LEFT JOIN categories c ON c.id = a.category_id
           LEFT JOIN media m      ON m.id = a.cover_id
          ORDER BY a.event_date DESC, a.id DESC'
    )->fetchAll();

    $data = [];
    foreach ($rows as $row) {
        $data[] = [
            'id'         => (int) $row['id'],
            'slug'       => $row['slug'],
            'title'      => $row['title'],
            'excerpt'    => $row['excerpt'],
            'date'       => $row['event_date'],
            'location'   => $row['location'],
            'status'     => $row['status'],
            'category'   => $row['category'],
            'imageCount' => (int) $row['image_count'],
            'cover'      => mediaObject($row, $base),
        ];
    }
    send(['data' => $data], 200, 0);
}

/** GET /api/admin/albums/{id} – ein Album samt Bildern. */
function adminShowAlbum(PDO $db, int $id, string $base): void
{
    $stmt = $db->prepare(
        'SELECT a.id, a.slug, a.title, a.excerpt, a.event_date, a.location,
                a.category_id, a.cover_id, a.status,
                m.path, m.alt, m.mime, m.width, m.height, m.bytes
           FROM albums a
           LEFT JOIN media m ON m.id = a.cover_id
          WHERE a.id = :id
          LIMIT 1'
    );
    $stmt->execute([':id' => $id]);
    $album = $stmt->fetch();
    if ($album === false) {
        fail(404, 'Album nicht gefunden.');
    }

    $stmt = $db->prepare(
        'SELECT m.id, m.path, m.alt, m.mime, m.width, m.height, m.bytes
           FROM album_images ai
           JOIN media m ON m.id = ai.media_id
          WHERE ai.album_id = :id
          ORDER BY ai.position'
    );
    $stmt->execute([':id' => $id]);

    $images = [];
    foreach ($stmt->fetchAll() as $row) {
        $images[] = mediaEntry($row, $base);
    }

    send([
        'data' => [
            'id'         => (int) $album['id'],
            'slug'       => $album['slug'],
            'title'      => $album['title'],
            'excerpt'    => $album['excerpt'],
            'date'       => $album['event_date'],
            'location'   => $album['location'],
            'categoryId' => $album['category_id'] === null ? null : (int) $album['category_id'],
            'coverId'    => $album['cover_id'] === null ? null : (int) $album['cover_id'],
            'cover'      => $album['cover_id'] === null
                ? null
                : mediaEntry(['id' => (int) $album['cover_id']] + $album, $base),
            'status'     => $album['status'],
            'images'     => $images,
        ],
    ], 200, 0);
}

/** POST /api/admin/albums – neues Album. */
function adminCreateAlbum(PDO $db): void
{
    $body     = jsonBody();
    $imageIds = albumImagesField($db, $body);
    $fields   = albumFields($db, $body, null, $imageIds);

    try {
        $db->beginTransaction();

        $stmt = $db->prepare(
            'INSERT INTO albums (slug, title, excerpt, event_date, location,
                                 category_id, cover_id, status)
             VALUES (:slug, :title, :excerpt, :event_date, :location,
                     :category_id, :cover_id, :status)'
        );
        $stmt->execute([
            ':slug'        => $fields['slug'],
            ':title'       => $fields['title'],
            ':excerpt'     => $fields['excerpt'],
            ':event_date'  => $fields['event_date'],
            ':location'    => $fields['location'],
            ':category_id' => $fields['category_id'],
            ':cover_id'    => $fields['cover_id'],
            ':status'      => $fields['status'],
        ]);
        $albumId = (int) $db->lastInsertId();

        writeAlbumImages($db, $albumId, $imageIds);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }

    send(['data' => ['id' => $albumId, 'slug' => $fields['slug']]], 201, 0);
}

/** PUT /api/admin/albums/{id} – bestehendes Album speichern. */
function adminUpdateAlbum(PDO $db, int $id): void
{
    $stmt = $db->prepare('SELECT id FROM albums WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    if ($stmt->fetchColumn() === false) {
        fail(404, 'Album nicht gefunden.');
    }

    $body     = jsonBody();
    $imageIds = albumImagesField($db, $body);
    $fields   = albumFields($db, $body, $id, $imageIds);

    try {
        $db->beginTransaction();

        $stmt = $db->prepare(
            'UPDATE albums
                SET slug = :slug, title = :title, excerpt = :excerpt,
                    event_date = :event_date, location = :location,
                    category_id = :category_id, cover_id = :cover_id, status = :status
              WHERE id = :id'
        );
        $stmt->execute([
            ':slug'        => $fields['slug'],
            ':title'       => $fields['title'],
            ':excerpt'     => $fields['excerpt'],
            ':event_date'  => $fields['event_date'],
            ':location'    => $fields['location'],
            ':category_id' => $fields['category_id'],
            ':cover_id'    => $fields['cover_id'],
            ':status'      => $fields['status'],
            ':id'          => $id,
        ]);

        writeAlbumImages($db, $id, $imageIds);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }

    send(['data' => ['id' => $id, 'slug' => $fields['slug']]], 200, 0);
}

/**
 * DELETE /api/admin/albums/{id} – Album entfernen.
 *
 * album_images haengt per ON DELETE CASCADE daran und geht mit. Die Bilder
 * selbst bleiben im Bestand: sie koennen anderswo verwendet sein.
 */
function adminDeleteAlbum(PDO $db, int $id): void
{
    $stmt = $db->prepare('DELETE FROM albums WHERE id = :id');
    $stmt->execute([':id' => $id]);

    if ($stmt->rowCount() === 0) {
        fail(404, 'Album nicht gefunden.');
    }
    send(['data' => ['deleted' => true]], 200, 0);
}

// ── Endpunkte: Kategorien und Medien ────────────────────────

/**
 * GET /api/admin/categories – alle Kategorien.
 *
 * Mit Verwendungszahlen: die Kategorienverwaltung zeigt sie an, und ohne sie
 * waere nicht zu sehen, welche Kategorie sich noch loeschen laesst. Die
 * Auswahlfelder im Beitragseditor lesen aus derselben Antwort nur id, slug
 * und name – zusaetzliche Felder stoeren dort nicht.
 *
 * Gezaehlt wird ueber beide Wege: Hauptkategorie (posts.category_id) und
 * Zuordnung (post_categories). Ein Beitrag, der auf beiden Wegen daran
 * haengt, zaehlt einmal – daher COUNT(DISTINCT ...).
 */
function adminListCategories(PDO $db): void
{
    $rows = $db->query(
        'SELECT c.id, c.slug, c.name, c.sort,
                (SELECT COUNT(DISTINCT p.id)
                   FROM posts p
                   LEFT JOIN post_categories pc ON pc.post_id = p.id
                  WHERE p.category_id = c.id OR pc.category_id = c.id
                ) AS post_count,
                (SELECT COUNT(DISTINCT e.id)
                   FROM events e
                   LEFT JOIN event_categories ec ON ec.event_id = e.id
                  WHERE e.category_id = c.id OR ec.category_id = c.id
                ) AS event_count,
                (SELECT COUNT(*) FROM albums a WHERE a.category_id = c.id) AS album_count
           FROM categories c
          ORDER BY c.sort, c.name'
    )->fetchAll();

    $data = [];
    foreach ($rows as $row) {
        $posts  = (int) $row['post_count'];
        $events = (int) $row['event_count'];
        $albums = (int) $row['album_count'];

        $data[] = [
            'id'         => (int) $row['id'],
            'slug'       => $row['slug'],
            'name'       => $row['name'],
            'sort'       => (int) $row['sort'],
            'postCount'  => $posts,
            'eventCount' => $events,
            'albumCount' => $albums,
            // Fasst alles zusammen: nur eine unbenutzte Kategorie darf weg.
            'inUse'      => $posts > 0 || $events > 0 || $albums > 0,
        ];
    }
    send(['data' => $data], 200, 0);
}

/**
 * Sorgt fuer einen einmaligen Kategorie-Slug.
 *
 * Eigene Funktion statt uniqueSlug(): die prueft gegen posts. Zwei Tabellen
 * mit demselben Code zu bedienen hiesse, den Tabellennamen hineinzureichen –
 * und damit eine Stelle zu schaffen, an der ein Tabellenname aus einer
 * Variablen ins SQL wandert. Zwei kurze Funktionen sind das kleinere Uebel.
 */
function uniqueCategorySlug(PDO $db, string $base): string
{
    $base = substr($base, 0, 90);
    if ($base === '') {
        $base = 'kategorie';
    }
    $stmt = $db->prepare('SELECT 1 FROM categories WHERE slug = :slug LIMIT 1');

    $slug = $base;
    for ($n = 2; $n < 100; $n++) {
        $stmt->execute([':slug' => $slug]);
        if ($stmt->fetchColumn() === false) {
            return $slug;
        }
        $slug = $base . '-' . $n;
    }
    invalid('Für diesen Namen lässt sich keine freie Adresse finden.');

    return $base;
}

/**
 * POST /api/admin/categories – eine Kategorie anlegen.
 *
 * Der Slug entsteht aus dem Namen, wie die Adresse eines Beitrags aus dem
 * Titel. Von Hand setzen laesst er sich nicht.
 */
function adminCreateCategory(PDO $db): void
{
    $body = jsonBody();
    $name = textField($body, 'name', 100, true);

    // Auf gleichen Namen pruefen, nicht nur auf gleichen Slug: "Kurse" und
    // "kurse" ergaeben denselben Slug, aber die Meldung "Adresse vergeben"
    // hilft niemandem weiter.
    $stmt = $db->prepare('SELECT name FROM categories WHERE name = :name LIMIT 1');
    $stmt->execute([':name' => $name]);
    if ($stmt->fetchColumn() !== false) {
        invalid('Diese Kategorie gibt es schon.');
    }

    $slug = uniqueCategorySlug($db, slugify($name));

    // sort bleibt 0: die Filterleiste sortiert bei gleichem Wert alphabetisch.
    // Eine eigene Reihenfolge pflegt man selten und dann besser in einem Zug.
    $stmt = $db->prepare('INSERT INTO categories (slug, name, sort) VALUES (:slug, :name, 0)');
    $stmt->execute([':slug' => $slug, ':name' => $name]);

    send(['data' => [
        'id'   => (int) $db->lastInsertId(),
        'slug' => $slug,
        'name' => $name,
    ]], 201, 0);
}

/**
 * DELETE /api/admin/categories/{id} – eine unbenutzte Kategorie entfernen.
 *
 * Nur unbenutzt, und das muss die Anwendung pruefen: fk_posts_category und
 * fk_albums_category stehen auf ON DELETE SET NULL, fk_pc_category auf
 * CASCADE. Die Datenbank wuerde das Loeschen also durchwinken und dabei die
 * Kategorie still aus jedem Beitrag entfernen, der sie traegt.
 *
 * Gedacht ist das fuer den Vertipper von eben, nicht fuer das Aufraeumen
 * gewachsener Rubriken – dafuer muesste man die Beitraege erst umhaengen.
 */
function adminDeleteCategory(PDO $db, int $id): void
{
    $db->beginTransaction();
    try {
        $stmt = $db->prepare('SELECT name FROM categories WHERE id = :id FOR UPDATE');
        $stmt->execute([':id' => $id]);
        if ($stmt->fetchColumn() === false) {
            $db->rollBack();
            fail(404, 'Kategorie nicht gefunden.');
        }

        $stmt = $db->prepare(
            'SELECT (SELECT COUNT(DISTINCT p.id)
                       FROM posts p
                       LEFT JOIN post_categories pc ON pc.post_id = p.id
                      WHERE p.category_id = :id OR pc.category_id = :id_extra) AS post_count,
                    (SELECT COUNT(DISTINCT e.id)
                       FROM events e
                       LEFT JOIN event_categories ec ON ec.event_id = e.id
                      WHERE e.category_id = :id_event OR ec.category_id = :id_event_extra) AS event_count,
                    (SELECT COUNT(*) FROM albums a WHERE a.category_id = :id_album) AS album_count'
        );
        // Ein Platzhalter je Stelle fuer denselben Wert: bei echten Prepared
        // Statements darf ein benannter Platzhalter nur einmal vorkommen.
        $stmt->execute([
            ':id'             => $id,
            ':id_extra'       => $id,
            ':id_event'       => $id,
            ':id_event_extra' => $id,
            ':id_album'       => $id,
        ]);
        $usage = $stmt->fetch();

        $posts  = (int) $usage['post_count'];
        $events = (int) $usage['event_count'];
        $albums = (int) $usage['album_count'];

        if ($posts > 0 || $events > 0 || $albums > 0) {
            $db->rollBack();

            $teile = [];
            if ($posts > 0) {
                $teile[] = $posts === 1 ? '1 Beitrag' : $posts . ' Beiträgen';
            }
            if ($events > 0) {
                $teile[] = $events === 1 ? '1 Event' : $events . ' Events';
            }
            if ($albums > 0) {
                $teile[] = $albums === 1 ? '1 Album' : $albums . ' Alben';
            }

            send([
                'error'  => 'Diese Kategorie wird von ' . implode(' und ', $teile)
                            . ' verwendet und kann darum nicht gelöscht werden.',
                'usedBy' => ['Beiträge: ' . $posts, 'Events: ' . $events, 'Alben: ' . $albums],
            ], 409, 0);
        }

        $stmt = $db->prepare('DELETE FROM categories WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }

    send(['data' => ['deleted' => true]], 200, 0);
}

/** Baut aus einer media-Zeile den Eintrag, den die Bildauswahl anzeigt. */
function mediaEntry(array $row, string $base): array
{
    $image       = mediaObject($row, $base) ?? ['src' => '', 'alt' => '', 'ratio' => null];
    $image['id'] = (int) $row['id'];

    return $image + [
        'path'   => (string) $row['path'],
        'mime'   => (string) ($row['mime'] ?? ''),
        'width'  => isset($row['width']) && $row['width'] !== null ? (int) $row['width'] : null,
        'height' => isset($row['height']) && $row['height'] !== null ? (int) $row['height'] : null,
        'bytes'  => isset($row['bytes']) && $row['bytes'] !== null ? (int) $row['bytes'] : null,
    ];
}

/**
 * GET /api/admin/media – der Bestand fuer die Dateiauswahl.
 *
 * ?kind=document liefert die Dokumente, alles andere die Bilder. Getrennt,
 * weil die Auswahl im Editor getrennt ist: in einen Bildbaustein gehoert
 * kein PDF, und in eine Download-Liste kein Foto. Wer beides in einem Topf
 * zeigt, laesst den Redaktor suchen.
 *
 * Die Trennung laeuft ueber den Typ und nicht ueber eine Liste erlaubter
 * Typen: so tauchen auch die PDFs aus der WordPress-Migration auf, deren
 * Typ damals anders geschrieben wurde.
 */
function adminListMedia(PDO $db, string $base): void
{
    $limit    = intParam('limit', 200, 1, 500);
    $operator = ($_GET['kind'] ?? '') === 'document' ? 'NOT LIKE' : 'LIKE';

    $stmt = $db->prepare(
        "SELECT id, path, alt, mime, width, height, bytes
           FROM media
          WHERE mime " . $operator . " 'image/%'
          ORDER BY created_at DESC, id DESC
          LIMIT :limit"
    );
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();

    $data = [];
    foreach ($stmt->fetchAll() as $row) {
        $data[] = mediaEntry($row, $base);
    }
    send(['data' => $data], 200, 0);
}

/**
 * Sucht alle Stellen, an denen eine Datei verwendet wird.
 *
 * Das ist keine Bequemlichkeit, sondern die einzige Sicherung, die es gibt:
 * alle Fremdschluessel auf media stehen auf ON DELETE CASCADE oder SET NULL.
 * Ein DELETE auf media wuerde also anstandslos durchgehen und die Datei
 * unterwegs aus Beitraegen, Alben und Vorstandsfotos entfernen, ohne dass
 * jemand etwas merkt. Die Datenbank haelt hier niemanden auf – diese
 * Funktion muss es tun.
 *
 * Geprueft wird nicht nur auf Beitraege: ein Bild, das am Vorstand oder an
 * einem Album haengt, ist genauso in Gebrauch – und ein PDF, das als
 * Download in einem Beitrag oder auf einer Seite steht, ebenfalls.
 *
 * @return string[] Klartext je Fundstelle, leer wenn die Datei frei ist.
 */
function mediaUsage(PDO $db, int $id): array
{
    // Jede Zeile: Beschreibung => Abfrage, die die betroffenen Namen liefert.
    $quellen = [
        'Beitrag (Titelbild)' => 'SELECT title FROM posts WHERE cover_id = :id',
        'Beitrag (Baustein)'  => 'SELECT DISTINCT p.title
                                    FROM post_section_images ssi
                                    JOIN post_sections s ON s.id = ssi.section_id
                                    JOIN posts p         ON p.id = s.post_id
                                   WHERE ssi.media_id = :id',
        'Beitrag (Dokument)'  => 'SELECT DISTINCT p.title
                                    FROM post_section_documents sd
                                    JOIN post_sections s ON s.id = sd.section_id
                                    JOIN posts p         ON p.id = s.post_id
                                   WHERE sd.media_id = :id',
        'Event (Titelbild)'   => 'SELECT title FROM events WHERE cover_id = :id',
        'Event (Baustein)'    => 'SELECT DISTINCT e.title
                                    FROM event_section_images esi
                                    JOIN event_sections s ON s.id = esi.section_id
                                    JOIN events e         ON e.id = s.event_id
                                   WHERE esi.media_id = :id',
        'Event (Dokument)'    => 'SELECT DISTINCT e.title
                                    FROM event_section_documents ed
                                    JOIN event_sections s ON s.id = ed.section_id
                                    JOIN events e         ON e.id = s.event_id
                                   WHERE ed.media_id = :id',
        'Album (Titelbild)'   => 'SELECT title FROM albums WHERE cover_id = :id',
        'Album (Bild)'        => 'SELECT DISTINCT a.title
                                    FROM album_images ai
                                    JOIN albums a ON a.id = ai.album_id
                                   WHERE ai.media_id = :id',
        'Vorstand'            => 'SELECT name FROM board_members WHERE photo_id = :id',
        'Seite (Dokument)'    => 'SELECT DISTINCT pg.title
                                    FROM page_documents pd
                                    JOIN pages pg ON pg.id = pd.page_id
                                   WHERE pd.media_id = :id',
        'Startseite'          => 'SELECT "Titelbild" FROM site_images WHERE media_id = :id',
    ];

    $usage = [];
    foreach ($quellen as $label => $sql) {
        $stmt = $db->prepare($sql);
        $stmt->execute([':id' => $id]);
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $name) {
            $usage[] = $label . ': «' . $name . '»';
        }
    }
    return $usage;
}

/**
 * DELETE /api/admin/media/{id} – eine Datei aus dem Bestand entfernen.
 *
 * Nur, wenn sie nirgends mehr verwendet wird. Wird sie noch gebraucht, kommt
 * 409 zurueck samt Liste der Fundstellen – so muss niemand raten, wo die
 * Datei noch haengt.
 *
 * Pruefung und Loeschung laufen in einer Transaktion. Sonst koennte jemand
 * die Datei genau zwischen beiden Schritten in einen Beitrag setzen, und sie
 * verschwaende ihm gleich wieder unter den Haenden.
 */
function adminDeleteMedia(PDO $db, array $config, int $id): void
{
    $db->beginTransaction();
    try {
        // FOR UPDATE sperrt die Zeile bis zum Ende der Transaktion.
        $stmt = $db->prepare('SELECT path FROM media WHERE id = :id FOR UPDATE');
        $stmt->execute([':id' => $id]);
        $path = $stmt->fetchColumn();

        if ($path === false) {
            $db->rollBack();
            fail(404, 'Datei nicht gefunden.');
        }

        $usage = mediaUsage($db, $id);
        if ($usage !== []) {
            $db->rollBack();
            send([
                'error'  => 'Diese Datei wird noch verwendet und kann darum nicht gelöscht werden.',
                'usedBy' => $usage,
            ], 409, 0);
        }

        $stmt = $db->prepare('DELETE FROM media WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }

    /*
     * Erst jetzt die Datei. Zuerst der Eintrag, dann die Datei – andersherum
     * bliebe bei einem Fehler ein Eintrag stehen, der auf nichts zeigt, und
     * die Seite zeigte ein totes Bild. Umgekehrt bleibt hoechstens eine
     * Datei liegen, die niemand mehr sieht.
     */
    $root     = rtrim((string) ($config['media_dir'] ?? __DIR__ . '/../medien'), '/\\');
    $realRoot = realpath($root);
    $realFile = realpath($root . '/' . (string) $path);

    // Der Pfad kommt zwar aus der eigenen Datenbank, wird aber trotzdem
    // geprueft: eine Zeile mit "../../index.php" im Pfad wuerde sonst beim
    // Loeschen genau das treffen. realpath loest ".." auf, der Vergleich
    // danach stellt sicher, dass die Datei wirklich im Medienordner liegt.
    if (
        $realRoot !== false
        && $realFile !== false
        && is_file($realFile)
        && str_starts_with($realFile, $realRoot . DIRECTORY_SEPARATOR)
    ) {
        if (!@unlink($realFile)) {
            error_log('[api] Datei nicht löschbar: ' . $realFile);
        }
    }

    send(['data' => ['deleted' => true]], 200, 0);
}

/**
 * Prueft eine hochgeladene Bilddatei und meldet Typ, Endung und Masse.
 *
 * @return array{mime: string, ext: string, width: int|null, height: int|null}
 */
function checkUploadedImage(array $file): array
{
    if ((int) $file['size'] > UPLOAD_MAX_BYTES) {
        invalid('Das Bild ist zu gross (höchstens 8 MB).');
    }

    // Der Typ wird aus dem Inhalt bestimmt, nicht aus dem mitgeschickten
    // Content-Type: den setzt der Browser, und ein Angreifer setzt ihn frei.
    $info = new finfo(FILEINFO_MIME_TYPE);
    $mime = (string) $info->file((string) $file['tmp_name']);
    if (!isset(UPLOAD_TYPES[$mime])) {
        invalid('Nur JPEG, PNG, WebP und GIF werden angenommen.');
    }

    // getimagesize liest die Masse und bestaetigt nebenbei, dass die Datei
    // wirklich ein Bild ist und nicht nur so anfaengt.
    $size = @getimagesize((string) $file['tmp_name']);
    if ($size === false) {
        invalid('Diese Datei ist kein lesbares Bild.');
    }
    [$width, $height] = $size;

    return ['mime' => $mime, 'ext' => UPLOAD_TYPES[$mime], 'width' => $width, 'height' => $height];
}

/**
 * Prueft eine hochgeladene Dokumentdatei und meldet Typ und Endung.
 *
 * Die Endung entscheidet, welcher Typ gespeichert wird; der erkannte Typ
 * bestaetigt nur die Bauart. Warum nicht umgekehrt wie bei Bildern, steht
 * bei UPLOAD_DOC_TYPES.
 *
 * @return array{mime: string, ext: string, width: null, height: null}
 */
function checkUploadedDocument(array $file): array
{
    if ((int) $file['size'] > UPLOAD_DOC_MAX_BYTES) {
        invalid('Das Dokument ist zu gross (höchstens 20 MB).');
    }

    $ext = strtolower((string) pathinfo((string) ($file['name'] ?? ''), PATHINFO_EXTENSION));
    if (!isset(UPLOAD_DOC_TYPES[$ext])) {
        invalid('Nur PDF, Word, Excel und PowerPoint werden angenommen.');
    }

    $info     = new finfo(FILEINFO_MIME_TYPE);
    $detected = (string) $info->file((string) $file['tmp_name']);
    if (!in_array($detected, UPLOAD_DOC_TYPES[$ext]['detected'], true)) {
        // Endung und Inhalt passen nicht zusammen. Meist ist das eine falsch
        // benannte Datei, und genau das soll die Meldung sagen – nicht, dass
        // der Typ nicht erlaubt waere.
        invalid('Der Inhalt dieser Datei passt nicht zur Endung ".' . $ext . '".');
    }

    return ['mime' => UPLOAD_DOC_TYPES[$ext]['mime'], 'ext' => $ext, 'width' => null, 'height' => null];
}

/**
 * POST /api/admin/media – ein Bild oder ein Dokument hochladen.
 *
 * Welches von beiden, sagt das Feld `kind` ("image" oder "document"). Die
 * Auswahl im Editor weiss es, denn sie ist fuer das eine oder das andere
 * offen – und so bekommt der Redaktor eine Fehlermeldung, die zu dem passt,
 * was er tun wollte, statt einer Liste aller denkbaren Typen.
 *
 * Die Datei landet unter medien/uploads/<Jahr>/ und bekommt einen Namen aus
 * Titel und Zufall. Der Zufallsteil ist kein Schmuck: ohne ihn wuerden zwei
 * Dateien gleichen Namens einander ueberschreiben, und man koennte durch
 * Raten pruefen, welche Dateien es gibt.
 */
function adminUploadMedia(PDO $db, array $config, string $base): void
{
    $isDocument = ($_POST['kind'] ?? 'image') === 'document';

    $file = $_FILES['file'] ?? null;
    if (!is_array($file)) {
        /*
         * Ganz leeres $_FILES heisst meist: die Anfrage war groesser als
         * post_max_size. PHP verwirft sie dann vollstaendig, noch bevor
         * dieses Skript laeuft – es gibt keinen Fehlercode, den man lesen
         * koennte. Darum hier die Vermutung als Hinweis.
         */
        invalid('Es kam keine Datei an. Vermutlich war sie grösser, als der Server annimmt.');
    }

    $uploadError = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($uploadError !== UPLOAD_ERR_OK) {
        // Die Groessenfehler bekommen eine eigene Meldung: "ungültige Datei"
        // waere dort schlicht falsch und schickt den Redaktor auf die
        // Suche nach einem Fehler, den die Datei gar nicht hat.
        invalid(
            in_array($uploadError, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)
                ? 'Die Datei ist grösser, als der Server annimmt.'
                : 'Es kam keine gültige Datei an.'
        );
    }
    if (!is_uploaded_file((string) $file['tmp_name'])) {
        invalid('Es kam keine gültige Datei an.');
    }

    $checked = $isDocument ? checkUploadedDocument($file) : checkUploadedImage($file);
    $mime    = $checked['mime'];
    $width   = $checked['width'];
    $height  = $checked['height'];

    // Bei Bildern der Bildtext fuer Screenreader, bei Dokumenten die
    // Bezeichnung, die in der Auswahl steht und als Linktext vorgeschlagen
    // wird. Dieselbe Spalte: beides beschreibt die Datei in einem Satz.
    $alt  = textField($_POST, 'alt', 255);
    $stem = slugify((string) ($_POST['name'] ?? ''));
    if ($stem === '') {
        $stem = slugify((string) ($file['name'] ?? ''));
    }
    $stem = substr($stem, 0, 60);
    if ($stem === '') {
        $stem = $isDocument ? 'dokument' : 'bild';
    }

    /*
     * Die Endung kommt aus der Liste der erlaubten Typen, nie aus dem
     * Dateinamen. Eine hochgeladene "rechnung.php" kann so nie als .php auf
     * der Platte landen – und der Medienordner wird von Apache ausgeliefert,
     * dort wuerde sie ausgefuehrt.
     */
    $year     = date('Y');
    $relative = 'uploads/' . $year . '/' . $stem . '-' . bin2hex(random_bytes(4)) . '.' . $checked['ext'];

    // Zielordner: aus der Konfiguration, sonst neben der API. media_base ist
    // die Web-Adresse, media_dir der Ort auf der Platte – beide muessen auf
    // denselben Ordner zeigen.
    $root      = rtrim((string) ($config['media_dir'] ?? __DIR__ . '/../medien'), '/\\');
    $directory = $root . '/uploads/' . $year;
    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
        error_log('[api] Medienordner nicht anlegbar: ' . $directory);
        fail(500, 'Der Ablageort für Dateien steht nicht bereit.');
    }

    $target = $root . '/' . $relative;
    if (!move_uploaded_file((string) $file['tmp_name'], $target)) {
        error_log('[api] Upload nicht speicherbar: ' . $target);
        fail(500, 'Die Datei konnte nicht gespeichert werden.');
    }
    // Ausfuehrbar muss eine hochgeladene Datei nie sein.
    @chmod($target, 0644);

    $stmt = $db->prepare(
        'INSERT INTO media (path, alt, mime, width, height, bytes)
         VALUES (:path, :alt, :mime, :width, :height, :bytes)'
    );
    $stmt->execute([
        ':path'   => $relative,
        ':alt'    => $alt,
        ':mime'   => $mime,
        ':width'  => $width,
        ':height' => $height,
        ':bytes'  => (int) $file['size'],
    ]);

    send(['data' => mediaEntry([
        'id'     => (int) $db->lastInsertId(),
        'path'   => $relative,
        'alt'    => $alt,
        'mime'   => $mime,
        'width'  => $width,
        'height' => $height,
        'bytes'  => (int) $file['size'],
    ], $base)], 201, 0);
}

// ── Endpunkte: Startseite ───────────────────────────────────

/** GET /api/admin/home – das gewaehlte Titelbild der Startseite. */
function adminShowHome(PDO $db, string $base): void
{
    $stmt = $db->prepare(
        'SELECT m.id, m.path, m.alt, m.mime, m.width, m.height, m.bytes
           FROM site_images si
           JOIN media m ON m.id = si.media_id
          WHERE si.slot = :slot
          LIMIT 1'
    );
    $stmt->execute([':slot' => HOME_HERO_SLOT]);
    $row = $stmt->fetch();

    send(['data' => ['heroImage' => $row === false ? null : mediaEntry($row, $base)]], 200, 0);
}

/**
 * PUT /api/admin/home – Titelbild der Startseite setzen oder entfernen.
 *
 * heroImageId null nimmt das Bild weg; die Startseite zeigt dann wieder die
 * Platzhalterflaeche. INSERT … ON DUPLICATE KEY UPDATE statt UPDATE: fehlt
 * die Zeile aus Migration 007, entsteht sie hier neu, statt dass das
 * Speichern still ins Leere laeuft.
 */
function adminUpdateHome(PDO $db, string $base): void
{
    $body    = jsonBody();
    $mediaId = requireRow($db, 'media', idField($body, 'heroImageId'), 'Das gewählte Bild');

    if ($mediaId !== null) {
        $stmt = $db->prepare('SELECT mime FROM media WHERE id = :id');
        $stmt->execute([':id' => $mediaId]);
        if (!str_starts_with((string) $stmt->fetchColumn(), 'image/')) {
            invalid('Als Titelbild eignet sich nur ein Bild, kein Dokument.');
        }
    }

    $stmt = $db->prepare(
        'INSERT INTO site_images (slot, media_id) VALUES (:slot, :media)
         ON DUPLICATE KEY UPDATE media_id = VALUES(media_id)'
    );
    $stmt->execute([':slot' => HOME_HERO_SLOT, ':media' => $mediaId]);

    adminShowHome($db, $base);
}

// ── Endpunkte: Zugaenge ─────────────────────────────────────

/** GET /api/admin/users – alle Zugaenge. */
function adminListUsers(PDO $db, array $config, array $actor): void
{
    $rows = $db->query(
        'SELECT id, email, must_change_password, created_at FROM users ORDER BY email'
    )->fetchAll();

    $super = superAdminEmail($config);

    $data = [];
    foreach ($rows as $row) {
        $id = (int) $row['id'];
        $data[] = [
            'id'                 => $id,
            'email'              => $row['email'],
            'createdAt'          => $row['created_at'],
            // true, solange noch das verteilte Startpasswort gilt.
            'mustChangePassword' => (bool) $row['must_change_password'],
            // Der geschuetzte Zugang. Das Frontend blendet den Loeschknopf
            // aus; abgewiesen wird trotzdem erst hier.
            'protected'          => mb_strtolower((string) $row['email'], 'UTF-8') === $super,
            // Der gerade angemeldete Zugang – niemand loescht sich selbst.
            'self'               => $id === (int) $actor['id'],
        ];
    }
    send(['data' => $data], 200, 0);
}

/**
 * POST /api/admin/users – neuen Zugang anlegen.
 *
 * Das Startpasswort wird gewuerfelt und genau einmal zurueckgegeben: gespeichert
 * wird nur sein Hash, zurueckrechnen laesst er sich nicht. Wer das Fenster
 * schliesst, ohne es weiterzugeben, legt den Zugang neu an.
 */
function adminCreateUser(PDO $db): void
{
    $body  = jsonBody();
    $email = mb_strtolower(textField($body, 'email', 190, true), 'UTF-8');

    if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        invalid('Das ist keine gültige E-Mail-Adresse.');
    }

    $stmt = $db->prepare('SELECT 1 FROM users WHERE email = :email LIMIT 1');
    $stmt->execute([':email' => $email]);
    if ($stmt->fetchColumn() !== false) {
        invalid('Für diese Adresse gibt es schon einen Zugang.');
    }

    $passwort = generateStartPassword();

    $stmt = $db->prepare(
        'INSERT INTO users (email, password_hash, must_change_password)
         VALUES (:email, :hash, 1)'
    );
    $stmt->execute([
        ':email' => $email,
        ':hash'  => password_hash($passwort, PASSWORD_BCRYPT, ['cost' => PASSWORT_KOSTEN]),
    ]);

    send(['data' => [
        'id'       => (int) $db->lastInsertId(),
        'email'    => $email,
        // Das einzige Mal, dass dieses Passwort im Klartext die API verlaesst.
        'password' => $passwort,
    ]], 201, 0);
}

/**
 * DELETE /api/admin/users/{id} – Zugang entfernen.
 *
 * Zwei Zugaenge sind geschuetzt: der Super-Admin und der eigene. Ersterer,
 * damit immer jemand hineinkommt; letzterer, weil man sich sonst mitten in
 * der Arbeit selbst hinauswirft.
 *
 * Die offenen Sitzungen des Geloeschten enden mit: user_tokens haengt per
 * ON DELETE CASCADE an users.
 */
function adminDeleteUser(PDO $db, array $config, int $id, array $actor): void
{
    $stmt = $db->prepare('SELECT email FROM users WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    $email = $stmt->fetchColumn();

    if ($email === false) {
        fail(404, 'Zugang nicht gefunden.');
    }
    if (mb_strtolower((string) $email, 'UTF-8') === superAdminEmail($config)) {
        fail(403, 'Dieser Zugang ist geschützt und kann nicht gelöscht werden.');
    }
    if ($id === (int) $actor['id']) {
        fail(409, 'Den eigenen Zugang können Sie nicht löschen.');
    }

    $stmt = $db->prepare('DELETE FROM users WHERE id = :id');
    $stmt->execute([':id' => $id]);

    send(['data' => ['deleted' => true]], 200, 0);
}

// ── Router des Admin-Bereichs ───────────────────────────────

/**
 * Verteilt alles unterhalb von /api/admin/.
 *
 * $item ist der dritte Pfadteil: bei /api/admin/posts/12 also "12".
 */
function handleAdmin(PDO $db, array $config, string $method, string $resource, ?string $item): void
{
    // Vor jedem Blick in die Daten: wer ist das?
    $actor = requireUser($db);

    // Eine Nummer in der Adresse muss eine Nummer sein. Alles andere ist ein
    // Tippfehler oder ein Versuch – beides endet hier.
    $id = null;
    if ($item !== null) {
        if (!ctype_digit($item) || (int) $item < 1) {
            fail(404, 'Nicht gefunden.');
        }
        $id = (int) $item;
    }

    $base = $config['media_base'];

    switch ($resource) {
        case 'posts':
        case 'events':
            // Beitraege und Events teilen Tabelle und Funktionen; der Typ
            // kommt allein aus der Adresse.
            $type = POST_TYPES[$resource];
            if ($id === null) {
                match ($method) {
                    'GET'   => adminListPosts($db, $base, $type),
                    'POST'  => adminCreatePost($db, $type),
                    default => methodNotAllowed('GET, POST'),
                };
            } else {
                match ($method) {
                    'GET'    => adminShowPost($db, $id, $base, $type),
                    'PUT'    => adminUpdatePost($db, $id, $type),
                    'DELETE' => adminDeletePost($db, $id, $type),
                    default  => methodNotAllowed('GET, PUT, DELETE'),
                };
            }
            break;

        case 'albums':
            if ($id === null) {
                match ($method) {
                    'GET'   => adminListAlbums($db, $base),
                    'POST'  => adminCreateAlbum($db),
                    default => methodNotAllowed('GET, POST'),
                };
            } else {
                match ($method) {
                    'GET'    => adminShowAlbum($db, $id, $base),
                    'PUT'    => adminUpdateAlbum($db, $id),
                    'DELETE' => adminDeleteAlbum($db, $id),
                    default  => methodNotAllowed('GET, PUT, DELETE'),
                };
            }
            break;

        case 'categories':
            if ($id === null) {
                match ($method) {
                    'GET'   => adminListCategories($db),
                    'POST'  => adminCreateCategory($db),
                    default => methodNotAllowed('GET, POST'),
                };
            } else {
                $method === 'DELETE'
                    ? adminDeleteCategory($db, $id)
                    : methodNotAllowed('DELETE');
            }
            break;

        case 'users':
            if ($id === null) {
                match ($method) {
                    'GET'   => adminListUsers($db, $config, $actor),
                    'POST'  => adminCreateUser($db),
                    default => methodNotAllowed('GET, POST'),
                };
            } else {
                $method === 'DELETE'
                    ? adminDeleteUser($db, $config, $id, $actor)
                    : methodNotAllowed('DELETE');
            }
            break;

        case 'home':
            if ($id !== null) {
                fail(404, 'Nicht gefunden.');
            }
            match ($method) {
                'GET'   => adminShowHome($db, $base),
                'PUT'   => adminUpdateHome($db, $base),
                default => methodNotAllowed('GET, PUT'),
            };
            break;

        case 'media':
            if ($id === null) {
                match ($method) {
                    'GET'   => adminListMedia($db, $base),
                    'POST'  => adminUploadMedia($db, $config, $base),
                    default => methodNotAllowed('GET, POST'),
                };
            } else {
                $method === 'DELETE'
                    ? adminDeleteMedia($db, $config, $id)
                    : methodNotAllowed('DELETE');
            }
            break;

        default:
            fail(404, 'Nicht gefunden.');
    }
}
