<?php
/**
 * Lese-API der vlt-Website.
 *
 * Ein einziger Einstiegspunkt: die .htaccess im selben Ordner leitet jede
 * Anfrage unterhalb von /api/ hierher, der Router unten verteilt sie auf die
 * passende Funktion.
 *
 * Grundsaetze:
 *   * Lesen geht nur mit GET. Geschrieben wird einzig unter /api/auth/:
 *     Anmeldung und Abmeldung pflegen die Tabelle user_tokens. Alles andere
 *     bleibt lesend, der Datenbankbenutzer braucht darueber hinaus keine
 *     Schreibrechte.
 *   * Alle Werte aus der URL laufen ueber Prepared Statements. Nie wird ein
 *     Parameter in SQL hineinkopiert.
 *   * Fehler werden protokolliert, aber nie im Klartext ausgeliefert. Eine
 *     Fehlermeldung mit Tabellennamen darin ist eine Einladung.
 *
 * Antwortformat: immer JSON, immer utf8mb4.
 */

declare(strict_types=1);

// ── Grundeinstellungen ──────────────────────────────────────
$config = require __DIR__ . '/config.php';

// Fehler landen im Log, nicht in der Antwort.
ini_set('display_errors', '0');
error_reporting(E_ALL);

// Kommazahlen so ausgeben, wie sie gemeint sind. Ohne diese Zeile macht
// json_encode aus round(0.5628, 4) die Zahl 0.56279999999999996695… –
// technisch dasselbe, aber unnoetiger Ballast in jeder Antwort.
ini_set('serialize_precision', '-1');

header('Content-Type: application/json; charset=utf-8');
// Suchmaschinen sollen die Rohdaten nicht indexieren – die Seite selbst ja.
header('X-Robots-Tag: noindex');
header('X-Content-Type-Options: nosniff');

/** Gibt Daten als JSON aus und beendet die Anfrage. */
function send(array $data, int $status = 200, int $cacheSeconds = 300): void
{
    http_response_code($status);
    if ($status === 200 && $cacheSeconds > 0) {
        header('Cache-Control: public, max-age=' . $cacheSeconds);
    } else {
        header('Cache-Control: no-store');
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Beendet die Anfrage mit einer Fehlermeldung ohne interne Details. */
function fail(int $status, string $message): void
{
    send(['error' => $message], $status, 0);
}

// ── Datenbankverbindung ─────────────────────────────────────
try {
    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=%s',
        $config['host'],
        $config['database'],
        $config['charset']
    );
    $db = new PDO($dsn, $config['user'], $config['password'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        // Echte Prepared Statements statt der Emulation: die Werte gehen
        // getrennt vom SQL an den Server und koennen ihn nicht veraendern.
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
} catch (Throwable $e) {
    error_log('[api] Verbindungsfehler: ' . $e->getMessage());
    fail(503, 'Datenbank nicht erreichbar.');
}

// ── Hilfsfunktionen ─────────────────────────────────────────

/**
 * Baut aus einer media-Zeile das Bildobjekt, das das Frontend erwartet.
 * Fehlt das Bild, kommt null zurueck – die Komponenten zeigen dann ihre
 * Platzhalterflaeche.
 */
function mediaObject(?array $row, string $base): ?array
{
    if ($row === null || ($row['path'] ?? null) === null) {
        return null;
    }
    $ratio = null;
    if (!empty($row['width']) && !empty($row['height'])) {
        $ratio = round((float) $row['height'] / (float) $row['width'], 4);
    }
    return [
        'src'   => $base . ltrim((string) $row['path'], '/'),
        'alt'   => (string) $row['alt'],
        'ratio' => $ratio,
    ];
}

/** Liest einen Ganzzahl-Parameter mit Unter- und Obergrenze. */
function intParam(string $name, int $default, int $min, int $max): int
{
    $raw = $_GET[$name] ?? null;
    if ($raw === null || !is_string($raw) || !ctype_digit($raw)) {
        return $default;
    }
    return max($min, min($max, (int) $raw));
}

/**
 * Prueft einen Slug aus der URL. Erlaubt sind Kleinbuchstaben, Ziffern und
 * Bindestriche – alles andere kann kein gueltiger Slug sein und wird
 * abgewiesen, bevor es die Datenbank sieht.
 */
function validSlug(string $slug): bool
{
    return $slug !== '' && strlen($slug) <= 200 && preg_match('/^[a-z0-9-]+$/', $slug) === 1;
}

// ── Endpunkte ───────────────────────────────────────────────

/** GET /api/categories – alle Kategorien mit Anzahl veroeffentlichter Beitraege. */
function listCategories(PDO $db): void
{
    // Ein Beitrag kann mehreren Kategorien angehoeren: einer Hauptkategorie
    // (posts.category_id) und weiteren ueber post_categories. Beide zaehlen,
    // sonst zeigt die Filterleiste zu kleine Zahlen.
    $rows = $db->query(
        'SELECT c.id, c.slug, c.name,
                (SELECT COUNT(DISTINCT p.id)
                   FROM posts p
                   LEFT JOIN post_categories pc ON pc.post_id = p.id
                  WHERE p.status = "published"
                    AND (p.category_id = c.id OR pc.category_id = c.id)
                ) AS post_count
           FROM categories c
          ORDER BY c.sort, c.name'
    )->fetchAll();

    $data = [];
    foreach ($rows as $row) {
        $data[] = [
            'id'        => (int) $row['id'],
            'slug'      => $row['slug'],
            'name'      => $row['name'],
            'postCount' => (int) $row['post_count'],
        ];
    }
    send(['data' => $data]);
}

/** GET /api/posts – Uebersicht, seitenweise, optional nach Kategorie gefiltert. */
function listPosts(PDO $db, string $base): void
{
    $page    = intParam('page', 1, 1, 1000);
    // Bis 100: die Beitragsuebersicht laedt alle Beitraege auf einmal und
    // filtert im Browser, damit Suche und Kategorien ohne Wartezeit reagieren.
    $perPage = intParam('per_page', 12, 1, 100);
    $offset  = ($page - 1) * $perPage;

    $category = $_GET['category'] ?? null;
    $filter   = '';
    $params   = [];
    if (is_string($category) && $category !== '') {
        if (!validSlug($category)) {
            fail(400, 'Ungültige Kategorie.');
        }
        $filter                = ' AND c.slug = :category';
        $params[':category']   = $category;
    }

    // Gesamtzahl zuerst – das Frontend braucht sie fuer die Blaetterleiste.
    $countSql = 'SELECT COUNT(*) FROM posts p
                   LEFT JOIN categories c ON c.id = p.category_id
                  WHERE p.status = "published"' . $filter;
    $stmt = $db->prepare($countSql);
    $stmt->execute($params);
    $total = (int) $stmt->fetchColumn();

    $sql = 'SELECT p.id, p.slug, p.title, p.excerpt, p.published_at, p.read_minutes,
                   c.name AS category, c.slug AS category_slug,
                   m.path, m.alt, m.width, m.height
              FROM posts p
              LEFT JOIN categories c ON c.id = p.category_id
              LEFT JOIN media m      ON m.id = p.cover_id
             WHERE p.status = "published"' . $filter . '
             ORDER BY p.published_at DESC, p.id DESC
             LIMIT :limit OFFSET :offset';

    $stmt = $db->prepare($sql);
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value);
    }
    // LIMIT und OFFSET muessen als Zahl gebunden werden, sonst setzt PDO
    // Anfuehrungszeichen und MySQL lehnt die Abfrage ab.
    $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();

    $data = [];
    foreach ($stmt->fetchAll() as $row) {
        $data[] = [
            'id'           => (int) $row['id'],
            'slug'         => $row['slug'],
            'title'        => $row['title'],
            'excerpt'      => $row['excerpt'],
            'date'         => $row['published_at'],
            'category'     => $row['category'],
            'categorySlug' => $row['category_slug'],
            'readMinutes'  => $row['read_minutes'] === null ? null : (int) $row['read_minutes'],
            'cover'        => mediaObject($row, $base),
        ];
    }

    send([
        'data' => $data,
        'meta' => [
            'page'    => $page,
            'perPage' => $perPage,
            'total'   => $total,
            'pages'   => (int) ceil($total / $perPage),
        ],
    ]);
}

/** GET /api/posts/{slug} – ein Beitrag mit Abschnitten und Bildern. */
function showPost(PDO $db, string $slug, string $base): void
{
    $stmt = $db->prepare(
        'SELECT p.id, p.slug, p.title, p.excerpt, p.published_at, p.author, p.read_minutes,
                c.name AS category, c.slug AS category_slug,
                m.path, m.alt, m.width, m.height
           FROM posts p
           LEFT JOIN categories c ON c.id = p.category_id
           LEFT JOIN media m      ON m.id = p.cover_id
          WHERE p.slug = :slug AND p.status = "published"
          LIMIT 1'
    );
    $stmt->execute([':slug' => $slug]);
    $post = $stmt->fetch();
    if ($post === false) {
        fail(404, 'Beitrag nicht gefunden.');
    }
    $postId = (int) $post['id'];

    // Weitere Kategorien neben der Hauptkategorie.
    $stmt = $db->prepare(
        'SELECT c.name FROM post_categories pc
           JOIN categories c ON c.id = pc.category_id
          WHERE pc.post_id = :id
          ORDER BY c.sort, c.name'
    );
    $stmt->execute([':id' => $postId]);
    $categories = $stmt->fetchAll(PDO::FETCH_COLUMN);

    // Abschnitte und ihre Bilder in zwei Abfragen statt einer pro Abschnitt.
    $stmt = $db->prepare(
        'SELECT id, text FROM post_sections WHERE post_id = :id ORDER BY position, id'
    );
    $stmt->execute([':id' => $postId]);
    $sections = $stmt->fetchAll();

    $images = [];
    if ($sections !== []) {
        $ids          = array_column($sections, 'id');
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt         = $db->prepare(
            'SELECT ssi.section_id, m.path, m.alt, m.width, m.height
               FROM post_section_images ssi
               JOIN media m ON m.id = ssi.media_id
              WHERE ssi.section_id IN (' . $placeholders . ')
              ORDER BY ssi.position'
        );
        $stmt->execute($ids);
        foreach ($stmt->fetchAll() as $row) {
            $images[(int) $row['section_id']][] = mediaObject($row, $base);
        }
    }

    $sectionData = [];
    foreach ($sections as $section) {
        $sectionData[] = [
            'text'   => $section['text'],
            'images' => $images[(int) $section['id']] ?? [],
        ];
    }

    send([
        'data' => [
            'id'           => $postId,
            'slug'         => $post['slug'],
            'title'        => $post['title'],
            'excerpt'      => $post['excerpt'],
            'date'         => $post['published_at'],
            'author'       => $post['author'],
            'category'     => $post['category'],
            'categorySlug' => $post['category_slug'],
            'categories'   => $categories,
            'readMinutes'  => $post['read_minutes'] === null ? null : (int) $post['read_minutes'],
            'cover'        => mediaObject($post, $base),
            'sections'     => $sectionData,
        ],
    ]);
}

/** GET /api/pages/{slug} – eine statische Seite samt verlinkter Dokumente. */
function showPage(PDO $db, string $slug, string $base): void
{
    $stmt = $db->prepare(
        'SELECT id, slug, title, body_html, updated_at
           FROM pages WHERE slug = :slug AND status = "published" LIMIT 1'
    );
    $stmt->execute([':slug' => $slug]);
    $page = $stmt->fetch();
    if ($page === false) {
        fail(404, 'Seite nicht gefunden.');
    }

    $stmt = $db->prepare(
        'SELECT pd.label, m.path, m.mime, m.bytes
           FROM page_documents pd
           JOIN media m ON m.id = pd.media_id
          WHERE pd.page_id = :id
          ORDER BY pd.position, pd.id'
    );
    $stmt->execute([':id' => (int) $page['id']]);

    $documents = [];
    foreach ($stmt->fetchAll() as $row) {
        $documents[] = [
            'label' => $row['label'],
            'href'  => $base . ltrim((string) $row['path'], '/'),
            'mime'  => $row['mime'],
            'bytes' => $row['bytes'] === null ? null : (int) $row['bytes'],
        ];
    }

    send([
        'data' => [
            'slug'      => $page['slug'],
            'title'     => $page['title'],
            'body'      => $page['body_html'],
            'updatedAt' => $page['updated_at'],
            'documents' => $documents,
        ],
    ]);
}

/** GET /api/albums – Uebersicht der Bildergalerien. */
function listAlbums(PDO $db, string $base): void
{
    $rows = $db->query(
        'SELECT a.id, a.slug, a.title, a.excerpt, a.event_date, a.location,
                c.name AS category,
                m.path, m.alt, m.width, m.height,
                (SELECT COUNT(*) FROM album_images ai WHERE ai.album_id = a.id) AS image_count
           FROM albums a
           LEFT JOIN categories c ON c.id = a.category_id
           LEFT JOIN media m      ON m.id = a.cover_id
          WHERE a.status = "published"
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
            'category'   => $row['category'],
            'imageCount' => (int) $row['image_count'],
            'cover'      => mediaObject($row, $base),
        ];
    }
    send(['data' => $data]);
}

/** GET /api/albums/{slug} – ein Album mit allen Bildern. */
function showAlbum(PDO $db, string $slug, string $base): void
{
    $stmt = $db->prepare(
        'SELECT a.id, a.slug, a.title, a.excerpt, a.event_date, a.location,
                c.name AS category
           FROM albums a
           LEFT JOIN categories c ON c.id = a.category_id
          WHERE a.slug = :slug AND a.status = "published"
          LIMIT 1'
    );
    $stmt->execute([':slug' => $slug]);
    $album = $stmt->fetch();
    if ($album === false) {
        fail(404, 'Album nicht gefunden.');
    }

    $stmt = $db->prepare(
        'SELECT m.path, m.alt, m.width, m.height
           FROM album_images ai
           JOIN media m ON m.id = ai.media_id
          WHERE ai.album_id = :id
          ORDER BY ai.position'
    );
    $stmt->execute([':id' => (int) $album['id']]);

    $images = [];
    foreach ($stmt->fetchAll() as $row) {
        $images[] = mediaObject($row, $base);
    }

    send([
        'data' => [
            'id'       => (int) $album['id'],
            'slug'     => $album['slug'],
            'title'    => $album['title'],
            'excerpt'  => $album['excerpt'],
            'date'     => $album['event_date'],
            'location' => $album['location'],
            'category' => $album['category'],
            'images'   => $images,
        ],
    ]);
}

/** GET /api/board – der Vorstand in gepflegter Reihenfolge. */
function listBoard(PDO $db, string $base): void
{
    $rows = $db->query(
        'SELECT b.id, b.name, b.role, b.ika_function, b.school_name, b.school_url, b.email,
                m.path, m.alt, m.width, m.height
           FROM board_members b
           LEFT JOIN media m ON m.id = b.photo_id
          WHERE b.active = 1
          ORDER BY b.sort, b.name'
    )->fetchAll();

    $data = [];
    foreach ($rows as $row) {
        $data[] = [
            'id'          => (int) $row['id'],
            'name'        => $row['name'],
            'role'        => $row['role'],
            'ikaFunction' => $row['ika_function'],
            'school'      => ['name' => $row['school_name'], 'url' => $row['school_url']],
            'email'       => $row['email'],
            'photo'       => mediaObject($row, $base),
        ];
    }
    send(['data' => $data]);
}

/** GET /api/links – die Linksammlung, nach Rubriken gruppiert. */
function listLinks(PDO $db): void
{
    $rows = $db->query(
        'SELECT g.id AS group_id, g.name AS group_name,
                l.id, l.title, l.url, l.description
           FROM link_groups g
           LEFT JOIN links l ON l.group_id = g.id
          ORDER BY g.sort, g.name, l.sort, l.id'
    )->fetchAll();

    $groups = [];
    foreach ($rows as $row) {
        $gid = (int) $row['group_id'];
        if (!isset($groups[$gid])) {
            $groups[$gid] = ['name' => $row['group_name'], 'links' => []];
        }
        if ($row['id'] !== null) {
            $groups[$gid]['links'][] = [
                'title'       => $row['title'],
                'url'         => $row['url'],
                'description' => $row['description'],
            ];
        }
    }
    send(['data' => array_values($groups)]);
}

// ── Anmeldung ───────────────────────────────────────────────

/**
 * Liest den JSON-Rumpf einer Anfrage. Fehlt er oder ist er kaputt, kommt ein
 * leeres Array zurueck – die einzelnen Felder werden danach ohnehin geprueft.
 */
function jsonBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/**
 * Holt das Anmelde-Token aus der Anfrage.
 *
 * Gesucht wird zuerst X-Auth-Token. Der Grund: laeuft PHP als CGI, behaelt
 * Apache den Authorization-Header fuer sich und reicht ihn nicht an PHP
 * weiter. Ein eigener Header kommt dagegen immer an – ohne dass an der
 * .htaccess etwas geaendert werden muss. Authorization wird trotzdem noch
 * gelesen, falls das Hosting ihn eines Tages doch durchreicht.
 */
function bearerToken(): ?string
{
    $quellen = [
        $_SERVER['HTTP_X_AUTH_TOKEN'] ?? null,
        $_SERVER['HTTP_AUTHORIZATION'] ?? null,
        $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null,
    ];

    foreach ($quellen as $wert) {
        if (!is_string($wert)) {
            continue;
        }
        // Ein vorangestelltes "Bearer " ist erlaubt, aber nicht noetig.
        $token = strtolower(trim((string) preg_replace('/^Bearer\s+/i', '', trim($wert))));

        // Die Form des Tokens steht fest (64 Hex-Zeichen aus bin2hex). Was
        // nicht passt, geht gar nicht erst an die Datenbank.
        if (preg_match('/^[0-9a-f]{64}$/', $token) === 1) {
            return $token;
        }
    }

    return null;
}

/** Liefert den angemeldeten Benutzer zum mitgeschickten Token oder null. */
function currentUser(PDO $db): ?array
{
    $token = bearerToken();
    if ($token === null) {
        return null;
    }

    // NOW() statt einer Zeit aus PHP: so entscheidet nur eine Uhr darueber,
    // wann ein Token ablaeuft.
    $stmt = $db->prepare(
        'SELECT u.id, u.email
           FROM user_tokens t
           JOIN users u ON u.id = t.user_id
          WHERE t.token = :token AND t.expires_at > NOW()
          LIMIT 1'
    );
    $stmt->execute([':token' => $token]);
    $row = $stmt->fetch();

    return $row === false ? null : $row;
}

/** POST /api/auth/login – prueft die Zugangsdaten und gibt ein Token aus. */
function login(PDO $db): void
{
    $body        = jsonBody();
    $emailRaw    = $body['email'] ?? null;
    $passwordRaw = $body['password'] ?? null;

    $email    = is_string($emailRaw) ? trim($emailRaw) : '';
    $password = is_string($passwordRaw) ? $passwordRaw : '';

    if ($email === '' || $password === '') {
        fail(400, 'E-Mail und Passwort sind nötig.');
    }

    $stmt = $db->prepare('SELECT id, password_hash FROM users WHERE email = :email LIMIT 1');
    $stmt->execute([':email' => $email]);
    $user = $stmt->fetch();

    // Auch ohne Treffer wird ein Hash geprueft. Sonst antwortet die API auf
    // unbekannte Adressen messbar schneller und verraet so, welche existieren.
    $hash = $user === false
        ? '$2y$12$usesomesillystringfor10123456789012345678901234567890'
        : (string) $user['password_hash'];
    $ok = password_verify($password, $hash);

    if ($user === false || !$ok) {
        // Eine gemeinsame Meldung fuer beide Faelle: welcher der beiden Werte
        // falsch war, geht niemanden etwas an.
        fail(401, 'E-Mail oder Passwort ist falsch.');
    }

    $token   = bin2hex(random_bytes(32));
    $expires = (string) $db->query('SELECT DATE_ADD(NOW(), INTERVAL 8 HOUR)')->fetchColumn();

    // Abgelaufene Tokens raeumen wir bei dieser Gelegenheit gleich mit weg.
    $db->exec('DELETE FROM user_tokens WHERE expires_at < NOW()');

    // Pro Benutzer bleibt genau ein Token gueltig, wie in Migration 002 notiert.
    $stmt = $db->prepare('DELETE FROM user_tokens WHERE user_id = :uid');
    $stmt->execute([':uid' => $user['id']]);

    $stmt = $db->prepare(
        'INSERT INTO user_tokens (user_id, token, expires_at)
         VALUES (:uid, :token, :expires)'
    );
    $stmt->execute([
        ':uid'     => $user['id'],
        ':token'   => $token,
        ':expires' => $expires,
    ]);

    send(['data' => ['token' => $token, 'expiresAt' => $expires]], 200, 0);
}

/** GET /api/auth/me – bestaetigt, dass das Token noch gilt. */
function showMe(PDO $db): void
{
    $user = currentUser($db);
    if ($user === null) {
        fail(401, 'Nicht angemeldet.');
    }
    send(['data' => ['email' => $user['email']]], 200, 0);
}

/** POST /api/auth/logout – macht das Token ungueltig. */
function logout(PDO $db): void
{
    $token = bearerToken();
    if ($token !== null) {
        $stmt = $db->prepare('DELETE FROM user_tokens WHERE token = :token');
        $stmt->execute([':token' => $token]);
    }
    // Auch ohne gueltiges Token ist das Ergebnis dasselbe: der Client ist
    // abgemeldet. Ein Fehler waere hier nur laestig.
    send(['data' => ['loggedOut' => true]], 200, 0);
}

/** Beendet die Anfrage, wenn der Pfad diese Methode nicht kennt. */
function methodNotAllowed(string $allowed): void
{
    header('Allow: ' . $allowed);
    fail(405, 'Methode nicht erlaubt.');
}

/** Verteilt die Pfade unterhalb von /api/auth/. */
function handleAuth(PDO $db, string $method, ?string $action): void
{
    switch ($action) {
        case 'login':
            $method === 'POST' ? login($db) : methodNotAllowed('POST');
            break;
        case 'logout':
            $method === 'POST' ? logout($db) : methodNotAllowed('POST');
            break;
        case 'me':
            $method === 'GET' ? showMe($db) : methodNotAllowed('GET');
            break;
        default:
            fail(404, 'Nicht gefunden.');
    }
}

// ── Router ──────────────────────────────────────────────────

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Gelesen wird mit GET, angemeldet mit POST. Mehr Methoden gibt es nicht.
if ($method !== 'GET' && $method !== 'POST') {
    header('Allow: GET, POST');
    fail(405, 'Nur GET und POST werden unterstützt.');
}

// Pfad hinter /api/ ermitteln, Query-String abschneiden.
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$path = preg_replace('#^.*/api/?#', '', $path) ?? '';
$parts = array_values(array_filter(explode('/', trim($path, '/')), 'strlen'));

$base = $config['media_base'];

try {
    $resource = $parts[0] ?? '';
    $item     = $parts[1] ?? null;

    // Ein Slug in der URL wird geprueft, bevor irgendeine Abfrage laeuft.
    if ($item !== null && !validSlug($item)) {
        fail(404, 'Nicht gefunden.');
    }
    if (count($parts) > 2) {
        fail(404, 'Nicht gefunden.');
    }

    // Ausserhalb der Anmeldung bleibt es beim reinen Lesen.
    if ($resource !== 'auth' && $method !== 'GET') {
        methodNotAllowed('GET');
    }

    switch ($resource) {
        case 'auth':
            handleAuth($db, $method, $item);
            break;
        case 'posts':
            $item === null ? listPosts($db, $base) : showPost($db, $item, $base);
            break;
        case 'categories':
            listCategories($db);
            break;
        case 'pages':
            if ($item === null) {
                fail(404, 'Nicht gefunden.');
            }
            showPage($db, $item, $base);
            break;
        case 'albums':
            $item === null ? listAlbums($db, $base) : showAlbum($db, $item, $base);
            break;
        case 'board':
            listBoard($db, $base);
            break;
        case 'links':
            listLinks($db);
            break;
        case '':
            // Kleine Selbstauskunft, damit man beim Aufruf von /api/ sieht,
            // dass die Schnittstelle laeuft.
            send([
                'data' => [
                    'name'      => 'vlt-Website API',
                    'endpoints' => [
                        '/api/posts', '/api/posts/{slug}', '/api/categories',
                        '/api/pages/{slug}', '/api/albums', '/api/albums/{slug}',
                        '/api/board', '/api/links',
                    ],
                ],
            ]);
            break;
        default:
            fail(404, 'Nicht gefunden.');
    }
} catch (Throwable $e) {
    // Der genaue Fehler geht ins Server-Log, der Client bekommt nur, dass
    // etwas schiefging – ohne Tabellennamen, Pfade oder SQL.
    error_log('[api] ' . $e->getMessage());
    fail(500, 'Interner Fehler.');
}
