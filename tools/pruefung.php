<?php
/**
 * Diagnose fuer die API – zum voruebergehenden Hochladen.
 *
 * Ablegen als  public_html/pruefung.php  (nicht in api/, dort leitet die
 * .htaccess alles auf index.php um). Aufrufen:
 *
 *     https://verband-technologie.ch/pruefung.php
 *
 * NACH DER FEHLERSUCHE WIEDER LOESCHEN. Die Datei verraet zwar kein
 * Passwort, aber sie zeigt Pfade und Servereinstellungen.
 */

header('Content-Type: text/plain; charset=utf-8');

$api = __DIR__ . '/api';

echo "PHP-Version:        " . PHP_VERSION . "\n";
echo "PDO MySQL geladen:  " . (extension_loaded('pdo_mysql') ? 'ja' : 'NEIN – das waere das Problem') . "\n";
echo "\n";

echo "--- Dateien in api/ ---\n";
foreach (['index.php', 'config.php', '.htaccess'] as $name) {
    $path = $api . '/' . $name;
    printf("%-14s %s\n", $name, is_file($path) ? filesize($path) . ' Bytes' : 'FEHLT');
}
echo "\n";

echo "--- Laesst sich index.php parsen? ---\n";
$index = $api . '/index.php';
if (!is_file($index)) {
    echo "index.php fehlt.\n";
} else {
    // php -l im Kleinen: schaut nur, ob die Datei syntaktisch aufgeht.
    $code = file_get_contents($index);
    $check = @token_get_all($code, TOKEN_PARSE);
    echo $check === false ? "SYNTAXFEHLER – die Datei ist beschaedigt oder unvollstaendig.\n"
                          : "Syntax in Ordnung.\n";
    echo "Letzte Zeile:  " . trim(substr($code, -60)) . "\n";
}
echo "\n";

echo "--- Laesst sich config.php laden? ---\n";
$configPath = $api . '/config.php';
if (!is_file($configPath)) {
    echo "config.php FEHLT. Das erklaert den Fehler 500.\n";
    echo "Loesung: config.example.php nach config.php kopieren und ausfuellen.\n";
} else {
    $config = @include $configPath;
    if (!is_array($config)) {
        echo "config.php liefert kein Array zurueck – vermutlich ein Syntaxfehler.\n";
    } else {
        // Nur melden, ob die Schluessel da sind. Werte bleiben geheim.
        foreach (['host', 'database', 'user', 'password', 'charset', 'media_base'] as $key) {
            printf("%-12s %s\n", $key, isset($config[$key]) && $config[$key] !== '' ? 'gesetzt' : 'FEHLT');
        }

        echo "\n--- Datenbankverbindung ---\n";
        try {
            $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s',
                $config['host'], $config['database'], $config['charset']);
            $db = new PDO($dsn, $config['user'], $config['password'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            ]);
            echo "Verbindung steht.\n";
            foreach (['posts', 'categories', 'media'] as $table) {
                try {
                    $n = $db->query("SELECT COUNT(*) FROM `$table`")->fetchColumn();
                    printf("%-12s %s Zeilen\n", $table, $n);
                } catch (Throwable $e) {
                    printf("%-12s Fehler: %s\n", $table, $e->getMessage());
                }
            }
        } catch (Throwable $e) {
            echo "Verbindung fehlgeschlagen: " . $e->getMessage() . "\n";
        }
    }
}

echo "\n--- Letzter PHP-Fehler ---\n";
$last = error_get_last();
echo $last ? ($last['message'] . ' in ' . $last['file'] . ':' . $last['line']) : 'keiner';
echo "\n";
