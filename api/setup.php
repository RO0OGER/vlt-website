<?php
/**
 * Einmaliges Setup-Script: Legt den ersten Admin-Benutzer an.
 *
 * SICHERHEIT:
 *   - Dieses Script funktioniert nur, solange noch KEIN Benutzer existiert.
 *   - Sobald ein Benutzer angelegt wurde, liefert es 404.
 *   - Das Script SOFORT nach erfolgreicher Einrichtung vom Server loeschen!
 *
 * Aufruf: https://deine-domain.ch/api/setup.php
 */
declare(strict_types=1);

$config = require __DIR__ . '/config.php';
ini_set('display_errors', '0');
error_reporting(E_ALL);

try {
    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s',
        $config['host'], $config['database'], $config['charset']);
    $db = new PDO($dsn, $config['user'], $config['password'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
} catch (Throwable) {
    http_response_code(503);
    exit('Datenbankverbindung fehlgeschlagen.');
}

// Sicherheitssperre: Sobald ein Benutzer existiert, ist dieses Script wirkungslos.
try {
    $count = (int) $db->query('SELECT COUNT(*) FROM users')->fetchColumn();
} catch (Throwable) {
    http_response_code(500);
    exit('Tabelle "users" nicht gefunden. Bitte zuerst Migration 002_users.sql ausfuehren.');
}

if ($count > 0) {
    http_response_code(404);
    exit('Nicht gefunden.');
}

$error   = '';
$success = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email   = trim((string) ($_POST['email']    ?? ''));
    $password  = (string) ($_POST['password']  ?? '');
    $confirm = (string) ($_POST['confirm']   ?? '');

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $error = 'Ungültige E-Mail-Adresse.';
    } elseif (strlen($password) < 8) {
        $error = 'Passwort muss mindestens 8 Zeichen lang sein.';
    } elseif ($password !== $confirm) {
        $error = 'Passwörter stimmen nicht überein.';
    } else {
        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
        $stmt = $db->prepare('INSERT INTO users (email, password_hash) VALUES (:email, :hash)');
        $stmt->execute([':email' => $email, ':hash' => $hash]);
        $success = true;
    }
}
?>
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Admin Setup – VLT</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, sans-serif;
      background: #2f2f7f;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      padding: 40px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    }
    .logo { font-size: 13px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #6b6b66; margin: 0 0 24px; }
    h1 { margin: 0 0 6px; font-size: 24px; font-weight: 700; color: #262626; }
    .warn {
      background: #fff8e1;
      border: 1px solid #f2aa2a;
      border-radius: 8px;
      padding: 12px 14px;
      font-size: 13px;
      color: #7a5200;
      margin: 20px 0 24px;
      line-height: 1.5;
    }
    label { display: block; font-size: 14px; font-weight: 500; color: #262626; margin-bottom: 6px; }
    input[type=email], input[type=password] {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #dcdcd6;
      border-radius: 8px;
      font-size: 15px;
      color: #262626;
      margin-bottom: 16px;
      transition: border-color 0.15s;
    }
    input:focus { outline: none; border-color: #2f2f7f; }
    button {
      width: 100%;
      background: #2f2f7f;
      color: #fff;
      border: 0;
      border-radius: 8px;
      padding: 12px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 4px;
      transition: background 0.15s;
    }
    button:hover { background: #262676; }
    .error { color: #c0392b; font-size: 14px; margin-bottom: 14px; font-weight: 500; }
    .success {
      background: #e8f5e9;
      border: 1px solid #4caf50;
      border-radius: 10px;
      padding: 20px;
      line-height: 1.6;
    }
    .success strong { display: block; font-size: 16px; margin-bottom: 10px; color: #1b5e20; }
    code { background: #f1f1f1; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  </style>
</head>
<body>
<div class="card">
  <p class="logo">VLT Admin</p>
  <?php if ($success): ?>
    <div class="success">
      <strong>Admin-Benutzer erfolgreich angelegt.</strong>
      Bitte losche die Datei <code>api/setup.php</code> jetzt sofort vom Server.
      Danach ist der Login unter <code>/admin/login</code> erreichbar.
    </div>
  <?php else: ?>
    <h1>Ersteinrichtung</h1>
    <div class="warn">
      Dieses Script nur einmal ausfuehren, dann sofort loeschen.<br>
      Das Passwort wird als sicherer bcrypt-Hash gespeichert.
    </div>
    <?php if ($error !== ''): ?>
      <div class="error"><?= htmlspecialchars($error) ?></div>
    <?php endif; ?>
    <form method="POST" autocomplete="off">
      <label for="email">E-Mail</label>
      <input type="email" id="email" name="email" required
             value="<?= htmlspecialchars((string) ($_POST['email'] ?? '')) ?>">
      <label for="password">Passwort</label>
      <input type="password" id="password" name="password" required minlength="8">
      <label for="confirm">Passwort bestätigen</label>
      <input type="password" id="confirm" name="confirm" required>
      <button type="submit">Admin-Benutzer anlegen</button>
    </form>
  <?php endif; ?>
</div>
</body>
</html>
