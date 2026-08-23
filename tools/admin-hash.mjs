/**
 * Admin-Zugang anlegen
 * ====================
 *
 * Erzeugt aus einer E-Mail-Adresse und einem Passwort die SQL-Zeile fuer die
 * Tabelle users. Ausgefuehrt wird sie danach von Hand in phpMyAdmin.
 *
 * Aufruf:
 *   npm run admin:hash -- vorstand@verband-technologie.ch
 *
 * Nach der E-Mail-Adresse fragt das Script nach dem Passwort. Die Adresse
 * steht bewusst auf der Kommandozeile, das Passwort bewusst nicht: so landet
 * es nicht in der Shell-Historie. Angezeigt wird es beim Tippen ebenfalls
 * nicht, und gespeichert wird es nirgends – ausgegeben wird nur der Hash.
 * Aus dem laesst sich das Passwort nicht zurueckrechnen, er darf also
 * gefahrlos in phpMyAdmin eingefuegt werden.
 *
 * Warum ueber die Datenbank und nicht ueber ein Web-Formular: die api/.htaccess
 * leitet jede Anfrage unterhalb von /api/ an index.php weiter. Ein eigenes
 * Setup-Script waere von dort aus gar nicht erreichbar, und die .htaccess soll
 * unangetastet bleiben.
 */

import bcrypt from 'bcryptjs';

// Hoehere Kosten heissen langsamer zu raten, aber auch langsamer beim
// Anmelden; 12 ist der uebliche Kompromiss.
const KOSTEN = 12;

// Tastendruecke, die keine Zeichen sind.
const ENTER = ['\r', '\n'];
const STRG_D = String.fromCharCode(4);
const STRG_C = String.fromCharCode(3);
const RUECKTASTE = [String.fromCharCode(127), String.fromCharCode(8)];

/** Bricht mit einer Meldung ab. */
function abbruch(meldung) {
  console.error(`Abbruch: ${meldung}`);
  process.exit(1);
}

/**
 * Liest eine Zeile, ohne sie anzuzeigen.
 *
 * readline wird hier bewusst nicht verwendet: es zeigt jede Eingabe an, und
 * das abzuschalten geht nur ueber Interna, die von Node-Version zu
 * Node-Version verschwinden – in Node 24 gibt es sie nicht mehr. Im Terminal
 * liest das Script darum direkt Zeichen fuer Zeichen. Kommt die Eingabe aus
 * einer Pipe, gibt es nichts zu verbergen und es wird schlicht bis zum
 * Zeilenumbruch gelesen.
 */
function fragePasswort(text) {
  const stdin = process.stdin;
  process.stdout.write(text);
  stdin.setEncoding('utf8');

  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      let puffer = '';
      const beiDaten = (stueck) => {
        puffer += stueck;
        const umbruch = puffer.indexOf('\n');
        if (umbruch >= 0) {
          stdin.off('data', beiDaten);
          stdin.pause();
          resolve(puffer.slice(0, umbruch).replace(/\r$/, ''));
        }
      };
      stdin.on('data', beiDaten);
      stdin.on('end', () => resolve(puffer.replace(/\r?\n$/, '')));
    });
  }

  return new Promise((resolve) => {
    // Rohmodus: das Terminal gibt jeden Tastendruck sofort weiter und zeigt
    // ihn nicht mehr selbst an. Damit bleibt das Passwort unsichtbar.
    stdin.setRawMode(true);
    stdin.resume();

    let eingabe = '';

    const beenden = (wert) => {
      stdin.off('data', beiDaten);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
      resolve(wert);
    };

    const beiDaten = (stueck) => {
      for (const zeichen of stueck) {
        if (ENTER.includes(zeichen) || zeichen === STRG_D) {
          beenden(eingabe);
          return;
        }
        if (zeichen === STRG_C) {
          // Abbrechen wie ueberall sonst auch.
          stdin.setRawMode(false);
          process.stdout.write('\n');
          process.exit(130);
        }
        if (RUECKTASTE.includes(zeichen)) {
          eingabe = eingabe.slice(0, -1);
          continue;
        }
        // Steuerzeichen – Pfeiltasten und Aehnliches – nicht uebernehmen.
        if (zeichen >= ' ') {
          eingabe += zeichen;
        }
      }
    };

    stdin.on('data', beiDaten);
  });
}

const email = (process.argv[2] ?? '').trim();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  abbruch('Bitte eine E-Mail-Adresse angeben: npm run admin:hash -- name@example.ch');
}

const passwort = await fragePasswort(`Passwort fuer ${email} (wird nicht angezeigt): `);

if (passwort.length < 8) {
  abbruch('Das Passwort braucht mindestens 8 Zeichen.');
}

const hash = bcrypt.hashSync(passwort, KOSTEN);

// Das Feld email hat einen UNIQUE-Index. Bei einer schon vorhandenen Adresse
// wird darum das Passwort ersetzt, statt dass die Abfrage scheitert – so dient
// dieselbe Zeile auch zum Zuruecksetzen eines vergessenen Passworts.
console.log(`In phpMyAdmin auf der Datenbank ausfuehren:

INSERT INTO users (email, password_hash)
VALUES ('${email.replace(/'/g, "''")}', '${hash}')
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash);
`);
