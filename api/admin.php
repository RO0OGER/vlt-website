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
 * Art (kind), Text und null bis zwei Bildern.
 */

declare(strict_types=1);

// ── Bloecke ─────────────────────────────────────────────────

/** Arten, die der Editor kennt, mit der Zahl der erlaubten Bilder. */
const BLOCK_KINDS = [
    'text'    => 0,
    'heading' => 0,
    'quote'   => 0,
    'image'   => 1,
    'gallery' => 2,
];

/** Laengste erlaubte Textmenge in einem Block. */
const BLOCK_TEXT_MAX = 20000;

/** Groesste erlaubte Bilddatei beim Hochladen. */
const UPLOAD_MAX_BYTES = 8388608;

/** Dateiendung je erlaubtem Bildtyp. Was hier fehlt, wird nicht angenommen. */
const UPLOAD_TYPES = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
    'image/gif'  => 'gif',
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
 */
function uniqueSlug(PDO $db, string $base, ?int $ignoreId): string
{
    $base = substr($base, 0, 190);
    if ($base === '') {
        $base = 'beitrag';
    }
    $stmt = $db->prepare('SELECT 1 FROM posts WHERE slug = :slug AND id <> :id LIMIT 1');

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
        $maxImages = BLOCK_KINDS[$kind];
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

        // Ein Block ohne Text und ohne Bild waere im Beitrag eine Luecke.
        if ($text === '' && $imageIds === []) {
            invalid('Baustein ' . $nr . ' ist leer.');
        }

        $blocks[] = ['kind' => $kind, 'text' => $text, 'imageIds' => $imageIds];
    }
    return $blocks;
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

/** Baut die geprueften Kopfdaten eines Beitrags aus dem Body. */
function postFields(PDO $db, array $body, ?int $postId): array
{
    $title  = textField($body, 'title', 255, true);
    $status = $body['status'] ?? 'draft';
    if ($status !== 'draft' && $status !== 'published') {
        invalid('Der Status muss "draft" oder "published" sein.');
    }

    $readRaw     = $body['readMinutes'] ?? null;
    $readMinutes = null;
    if ($readRaw !== null && $readRaw !== '') {
        $minutes = idField(['v' => $readRaw], 'v');
        if ($minutes === null || $minutes > 255) {
            invalid('Die Lesedauer muss zwischen 1 und 255 Minuten liegen.');
        }
        $readMinutes = $minutes;
    }

    /*
     * Die Adresse entsteht immer aus dem Titel – von Hand setzen laesst sie
     * sich nicht. Das haelt Titel und Adresse beieinander und nimmt der
     * Redaktion eine Entscheidung ab, die sie nie treffen wollte.
     *
     * uniqueSlug haengt -2, -3 … an, wenn der Name schon vergeben ist, und
     * laesst dem Beitrag dabei seine eigene Adresse (deshalb $postId). Beim
     * erneuten Speichern kommt darum wieder dasselbe heraus.
     */
    $slug = uniqueSlug($db, slugify($title), $postId);

    $author = textField($body, 'author', 120);

    return [
        'slug'         => $slug,
        'title'        => $title,
        'excerpt'      => textField($body, 'excerpt', 2000),
        'published_at' => dateField($body, 'date'),
        'author'       => $author === '' ? null : $author,
        'read_minutes' => $readMinutes,
        'cover_id'     => requireRow($db, 'media', idField($body, 'coverId'), 'Das gewählte Titelbild'),
        'category_id'  => requireRow($db, 'categories', idField($body, 'categoryId'), 'Die gewählte Kategorie'),
        'status'       => $status,
    ];
}

/**
 * Schreibt Bloecke und Kategorien eines Beitrags neu.
 *
 * Bewusst "alles loeschen, alles neu": die Bloecke haben ueber das Formular
 * hinweg keine stabile Identitaet – der Redaktor schiebt sie um, loescht und
 * fuegt ein. Ein Abgleich Zeile fuer Zeile waere aufwendiger und
 * fehleranfaelliger als das Neuschreiben einer Handvoll Zeilen.
 */
function writeRelations(PDO $db, int $postId, array $blocks, array $categoryIds): void
{
    $stmt = $db->prepare('DELETE FROM post_sections WHERE post_id = :id');
    $stmt->execute([':id' => $postId]);
    // post_section_images haengt per ON DELETE CASCADE daran und geht mit.

    $insertSection = $db->prepare(
        'INSERT INTO post_sections (post_id, position, kind, text)
         VALUES (:post, :position, :kind, :text)'
    );
    $insertImage = $db->prepare(
        'INSERT INTO post_section_images (section_id, media_id, position)
         VALUES (:section, :media, :position)'
    );

    foreach ($blocks as $position => $block) {
        $insertSection->execute([
            ':post'     => $postId,
            ':position' => $position,
            ':kind'     => $block['kind'],
            ':text'     => $block['text'],
        ]);
        $sectionId = (int) $db->lastInsertId();

        foreach ($block['imageIds'] as $imagePosition => $mediaId) {
            $insertImage->execute([
                ':section'  => $sectionId,
                ':media'    => $mediaId,
                ':position' => $imagePosition,
            ]);
        }
    }

    $stmt = $db->prepare('DELETE FROM post_categories WHERE post_id = :id');
    $stmt->execute([':id' => $postId]);

    $insertCategory = $db->prepare(
        'INSERT INTO post_categories (post_id, category_id) VALUES (:post, :category)'
    );
    foreach ($categoryIds as $categoryId) {
        $insertCategory->execute([':post' => $postId, ':category' => $categoryId]);
    }
}

// ── Endpunkte: Beitraege ────────────────────────────────────

/**
 * GET /api/admin/posts – alle Beitraege, auch Entwuerfe.
 *
 * Anders als die oeffentliche Liste ohne Blaettern: die Redaktion will die
 * ganze Liste sehen und im Browser suchen und filtern.
 */
function adminListPosts(PDO $db, string $base): void
{
    $rows = $db->query(
        'SELECT p.id, p.slug, p.title, p.excerpt, p.published_at, p.status, p.updated_at,
                c.id AS category_id, c.name AS category,
                m.path, m.alt, m.width, m.height,
                (SELECT COUNT(*) FROM post_sections s WHERE s.post_id = p.id) AS block_count
           FROM posts p
           LEFT JOIN categories c ON c.id = p.category_id
           LEFT JOIN media m      ON m.id = p.cover_id
          ORDER BY p.published_at DESC, p.id DESC'
    )->fetchAll();

    $data = [];
    foreach ($rows as $row) {
        $data[] = [
            'id'         => (int) $row['id'],
            'slug'       => $row['slug'],
            'title'      => $row['title'],
            'excerpt'    => $row['excerpt'],
            'date'       => $row['published_at'],
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

/** GET /api/admin/posts/{id} – ein Beitrag samt Bloecken, auch als Entwurf. */
function adminShowPost(PDO $db, int $id, string $base): void
{
    $stmt = $db->prepare(
        'SELECT p.id, p.slug, p.title, p.excerpt, p.published_at, p.author, p.read_minutes,
                p.status, p.category_id, p.cover_id, p.updated_at,
                m.path, m.alt, m.mime, m.width, m.height, m.bytes
           FROM posts p
           LEFT JOIN media m ON m.id = p.cover_id
          WHERE p.id = :id
          LIMIT 1'
    );
    $stmt->execute([':id' => $id]);
    $post = $stmt->fetch();
    if ($post === false) {
        fail(404, 'Beitrag nicht gefunden.');
    }

    $stmt = $db->prepare('SELECT category_id FROM post_categories WHERE post_id = :id');
    $stmt->execute([':id' => $id]);
    $categoryIds = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));

    $stmt = $db->prepare(
        'SELECT id, kind, text FROM post_sections WHERE post_id = :id ORDER BY position, id'
    );
    $stmt->execute([':id' => $id]);
    $sections = $stmt->fetchAll();

    // Die Bilder aller Abschnitte in einer Abfrage statt einer je Abschnitt.
    $images = [];
    if ($sections !== []) {
        $ids          = array_column($sections, 'id');
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt         = $db->prepare(
            'SELECT ssi.section_id, m.id, m.path, m.alt, m.mime, m.width, m.height, m.bytes
               FROM post_section_images ssi
               JOIN media m ON m.id = ssi.media_id
              WHERE ssi.section_id IN (' . $placeholders . ')
              ORDER BY ssi.position'
        );
        $stmt->execute($ids);
        foreach ($stmt->fetchAll() as $row) {
            $images[(int) $row['section_id']][] = mediaEntry($row, $base);
        }
    }

    $blocks = [];
    foreach ($sections as $section) {
        $blocks[] = [
            'kind'   => $section['kind'],
            'text'   => $section['text'],
            'images' => $images[(int) $section['id']] ?? [],
        ];
    }

    send([
        'data' => [
            'id'          => (int) $post['id'],
            'slug'        => $post['slug'],
            'title'       => $post['title'],
            'excerpt'     => $post['excerpt'],
            'date'        => $post['published_at'],
            'author'      => $post['author'],
            'readMinutes' => $post['read_minutes'] === null ? null : (int) $post['read_minutes'],
            'status'      => $post['status'],
            'categoryId'  => $post['category_id'] === null ? null : (int) $post['category_id'],
            'categoryIds' => $categoryIds,
            'coverId'     => $post['cover_id'] === null ? null : (int) $post['cover_id'],
            // Als vollstaendiger Medieneintrag, nicht nur als Bildquelle:
            // der Editor haelt das Titelbild in derselben Form wie jedes
            // Bild aus der Auswahl und muss nichts zusammensetzen.
            'cover'       => $post['cover_id'] === null
                ? null
                : mediaEntry(['id' => (int) $post['cover_id']] + $post, $base),
            'updatedAt'   => $post['updated_at'],
            'blocks'      => $blocks,
        ],
    ], 200, 0);
}

/** POST /api/admin/posts – neuer Beitrag. */
function adminCreatePost(PDO $db): void
{
    $body        = jsonBody();
    $fields      = postFields($db, $body, null);
    $blocks      = blocksField($db, $body);
    $categoryIds = categoryIdsField($db, $body);

    try {
        $db->beginTransaction();

        $stmt = $db->prepare(
            'INSERT INTO posts (slug, title, excerpt, published_at, author, read_minutes,
                                cover_id, category_id, status)
             VALUES (:slug, :title, :excerpt, :published_at, :author, :read_minutes,
                     :cover_id, :category_id, :status)'
        );
        $stmt->execute([
            ':slug'         => $fields['slug'],
            ':title'        => $fields['title'],
            ':excerpt'      => $fields['excerpt'],
            ':published_at' => $fields['published_at'],
            ':author'       => $fields['author'],
            ':read_minutes' => $fields['read_minutes'],
            ':cover_id'     => $fields['cover_id'],
            ':category_id'  => $fields['category_id'],
            ':status'       => $fields['status'],
        ]);
        $postId = (int) $db->lastInsertId();

        writeRelations($db, $postId, $blocks, $categoryIds);
        $db->commit();
    } catch (Throwable $e) {
        // Ohne Ruecknahme bliebe ein Beitrag ohne seine Bloecke stehen.
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }

    send(['data' => ['id' => $postId, 'slug' => $fields['slug']]], 201, 0);
}

/** PUT /api/admin/posts/{id} – bestehenden Beitrag speichern. */
function adminUpdatePost(PDO $db, int $id): void
{
    $stmt = $db->prepare('SELECT id FROM posts WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    if ($stmt->fetchColumn() === false) {
        fail(404, 'Beitrag nicht gefunden.');
    }

    $body        = jsonBody();
    $fields      = postFields($db, $body, $id);
    $blocks      = blocksField($db, $body);
    $categoryIds = categoryIdsField($db, $body);

    try {
        $db->beginTransaction();

        $stmt = $db->prepare(
            'UPDATE posts
                SET slug = :slug, title = :title, excerpt = :excerpt,
                    published_at = :published_at, author = :author,
                    read_minutes = :read_minutes, cover_id = :cover_id,
                    category_id = :category_id, status = :status
              WHERE id = :id'
        );
        $stmt->execute([
            ':slug'         => $fields['slug'],
            ':title'        => $fields['title'],
            ':excerpt'      => $fields['excerpt'],
            ':published_at' => $fields['published_at'],
            ':author'       => $fields['author'],
            ':read_minutes' => $fields['read_minutes'],
            ':cover_id'     => $fields['cover_id'],
            ':category_id'  => $fields['category_id'],
            ':status'       => $fields['status'],
            ':id'           => $id,
        ]);

        writeRelations($db, $id, $blocks, $categoryIds);
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
 * DELETE /api/admin/posts/{id} – Beitrag entfernen.
 *
 * Abschnitte, Bildzuordnungen und Kategorien gehen ueber ON DELETE CASCADE
 * mit. Die Bilder selbst bleiben in media: sie koennen anderswo verwendet
 * sein, und eine geloeschte Datei bekommt man nicht zurueck.
 */
function adminDeletePost(PDO $db, int $id): void
{
    $stmt = $db->prepare('DELETE FROM posts WHERE id = :id');
    $stmt->execute([':id' => $id]);

    if ($stmt->rowCount() === 0) {
        fail(404, 'Beitrag nicht gefunden.');
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
                (SELECT COUNT(*) FROM albums a WHERE a.category_id = c.id) AS album_count
           FROM categories c
          ORDER BY c.sort, c.name'
    )->fetchAll();

    $data = [];
    foreach ($rows as $row) {
        $posts  = (int) $row['post_count'];
        $albums = (int) $row['album_count'];

        $data[] = [
            'id'         => (int) $row['id'],
            'slug'       => $row['slug'],
            'name'       => $row['name'],
            'sort'       => (int) $row['sort'],
            'postCount'  => $posts,
            'albumCount' => $albums,
            // Fasst beides zusammen: nur eine unbenutzte Kategorie darf weg.
            'inUse'      => $posts > 0 || $albums > 0,
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
                    (SELECT COUNT(*) FROM albums a WHERE a.category_id = :id_album) AS album_count'
        );
        // Drei Platzhalter fuer denselben Wert: bei echten Prepared Statements
        // darf ein benannter Platzhalter nur einmal vorkommen.
        $stmt->execute([':id' => $id, ':id_extra' => $id, ':id_album' => $id]);
        $usage = $stmt->fetch();

        $posts  = (int) $usage['post_count'];
        $albums = (int) $usage['album_count'];

        if ($posts > 0 || $albums > 0) {
            $db->rollBack();

            $teile = [];
            if ($posts > 0) {
                $teile[] = $posts === 1 ? '1 Beitrag' : $posts . ' Beiträgen';
            }
            if ($albums > 0) {
                $teile[] = $albums === 1 ? '1 Album' : $albums . ' Alben';
            }

            send([
                'error'  => 'Diese Kategorie wird von ' . implode(' und ', $teile)
                            . ' verwendet und kann darum nicht gelöscht werden.',
                'usedBy' => ['Beiträge: ' . $posts, 'Alben: ' . $albums],
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

/** GET /api/admin/media – der Bildbestand fuer die Bildauswahl. */
function adminListMedia(PDO $db, string $base): void
{
    $limit = intParam('limit', 200, 1, 500);

    // Nur Bilder: Dokumente (PDF) gehoeren zu Seiten, nicht in Bildbloecke.
    $stmt = $db->prepare(
        "SELECT id, path, alt, mime, width, height, bytes
           FROM media
          WHERE mime LIKE 'image/%'
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
 * Sucht alle Stellen, an denen ein Bild verwendet wird.
 *
 * Das ist keine Bequemlichkeit, sondern die einzige Sicherung, die es gibt:
 * alle Fremdschluessel auf media stehen auf ON DELETE CASCADE oder SET NULL.
 * Ein DELETE auf media wuerde also anstandslos durchgehen und das Bild
 * unterwegs aus Beitraegen, Alben und Vorstandsfotos entfernen, ohne dass
 * jemand etwas merkt. Die Datenbank haelt hier niemanden auf – diese
 * Funktion muss es tun.
 *
 * Geprueft wird nicht nur auf Beitraege: ein Bild, das am Vorstand oder an
 * einem Album haengt, ist genauso in Gebrauch.
 *
 * @return string[] Klartext je Fundstelle, leer wenn das Bild frei ist.
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
 * DELETE /api/admin/media/{id} – ein Bild aus dem Bestand entfernen.
 *
 * Nur, wenn es nirgends mehr verwendet wird. Wird es noch gebraucht, kommt
 * 409 zurueck samt Liste der Fundstellen – so muss niemand raten, wo das
 * Bild noch haengt.
 *
 * Pruefung und Loeschung laufen in einer Transaktion. Sonst koennte jemand
 * das Bild genau zwischen beiden Schritten in einen Beitrag setzen, und es
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
            fail(404, 'Bild nicht gefunden.');
        }

        $usage = mediaUsage($db, $id);
        if ($usage !== []) {
            $db->rollBack();
            send([
                'error'  => 'Dieses Bild wird noch verwendet und kann darum nicht gelöscht werden.',
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
            error_log('[api] Bilddatei nicht löschbar: ' . $realFile);
        }
    }

    send(['data' => ['deleted' => true]], 200, 0);
}

/**
 * POST /api/admin/media – ein Bild hochladen.
 *
 * Die Datei landet unter medien/uploads/<Jahr>/ und bekommt einen Namen aus
 * Titel und Zufall. Der Zufallsteil ist kein Schmuck: ohne ihn wuerden zwei
 * Bilder gleichen Namens einander ueberschreiben, und man koennte durch
 * Raten pruefen, welche Dateien es gibt.
 */
function adminUploadMedia(PDO $db, array $config, string $base): void
{
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
        // Suche nach einem Fehler, den das Bild gar nicht hat.
        invalid(
            in_array($uploadError, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)
                ? 'Das Bild ist grösser, als der Server annimmt. Bitte verkleinern Sie es.'
                : 'Es kam keine gültige Datei an.'
        );
    }
    if (!is_uploaded_file((string) $file['tmp_name'])) {
        invalid('Es kam keine gültige Datei an.');
    }
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

    $alt  = textField($_POST, 'alt', 255);
    $stem = slugify((string) ($_POST['name'] ?? ''));
    if ($stem === '') {
        $stem = slugify((string) ($file['name'] ?? ''));
    }
    $stem = substr($stem, 0, 60);
    if ($stem === '') {
        $stem = 'bild';
    }

    $year     = date('Y');
    $relative = 'uploads/' . $year . '/' . $stem . '-' . bin2hex(random_bytes(4)) . '.' . UPLOAD_TYPES[$mime];

    // Zielordner: aus der Konfiguration, sonst neben der API. media_base ist
    // die Web-Adresse, media_dir der Ort auf der Platte – beide muessen auf
    // denselben Ordner zeigen.
    $root      = rtrim((string) ($config['media_dir'] ?? __DIR__ . '/../medien'), '/\\');
    $directory = $root . '/uploads/' . $year;
    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
        error_log('[api] Medienordner nicht anlegbar: ' . $directory);
        fail(500, 'Der Ablageort für Bilder steht nicht bereit.');
    }

    $target = $root . '/' . $relative;
    if (!move_uploaded_file((string) $file['tmp_name'], $target)) {
        error_log('[api] Upload nicht speicherbar: ' . $target);
        fail(500, 'Das Bild konnte nicht gespeichert werden.');
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
            if ($id === null) {
                match ($method) {
                    'GET'   => adminListPosts($db, $base),
                    'POST'  => adminCreatePost($db),
                    default => methodNotAllowed('GET, POST'),
                };
            } else {
                match ($method) {
                    'GET'    => adminShowPost($db, $id, $base),
                    'PUT'    => adminUpdatePost($db, $id),
                    'DELETE' => adminDeletePost($db, $id),
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
