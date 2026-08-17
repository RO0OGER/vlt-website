/**
 * Deploy nach cyon
 * ================
 *
 * Laedt den Inhalt von dist/vlt-website/ auf den Server. Verwendet WinSCP,
 * das auf diesem Rechner ohnehin installiert ist.
 *
 * Aufruf:
 *   npm run deploy            hochladen
 *   npm run deploy -- --probe zeigt nur, was uebertragen wuerde
 *
 * Einrichtung einmalig:
 *   1. WinSCP oeffnen, Verbindung zu cyon einrichten und testen.
 *   2. Sitzung speichern (mit Passwort) – der Name kommt in die Konfiguration.
 *   3. deploy.config.example.json nach deploy.config.json kopieren und
 *      Sitzungsnamen sowie Zielpfad eintragen.
 *
 * Warum die Zugangsdaten nicht hier stehen: sie liegen in der gespeicherten
 * WinSCP-Sitzung. Damit gibt es keine Datei im Projekt, die ein Passwort
 * enthaelt und versehentlich committet werden koennte.
 *
 * Wichtig: es wird NICHT gespiegelt, sondern nur hochgeladen. Auf dem Server
 * vorhandene Dateien, die es lokal nicht gibt, bleiben stehen – sonst wuerde
 * der Ordner api/ mit der config.php beim ersten Deploy verschwinden.
 */

import { spawn } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PROBE = process.argv.includes('--probe');

/** Uebliche Installationsorte von WinSCP. */
const WINSCP_CANDIDATES = [
  'C:\\Program Files (x86)\\WinSCP\\WinSCP.com',
  'C:\\Program Files\\WinSCP\\WinSCP.com',
];

async function findWinscp() {
  for (const path of WINSCP_CANDIDATES) {
    try {
      await access(path);
      return path;
    } catch {
      // naechsten Ort versuchen
    }
  }
  throw new Error(
    'WinSCP.com nicht gefunden. Erwartet unter:\n  ' + WINSCP_CANDIDATES.join('\n  '),
  );
}

async function loadConfig() {
  const path = join(ROOT, 'deploy.config.json');
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        'deploy.config.json fehlt.\n' +
        'Lege sie an:  copy deploy.config.example.json deploy.config.json',
      );
    }
    throw new Error(`deploy.config.json ist kein gültiges JSON: ${err.message}`);
  }
}

async function main() {
  const winscp = await findWinscp();
  const config = await loadConfig();

  for (const key of ['session', 'remotePath', 'localPath']) {
    if (!config[key]) throw new Error(`In deploy.config.json fehlt: ${key}`);
  }

  const local = join(ROOT, config.localPath);
  try {
    await access(join(local, 'index.html'));
  } catch {
    throw new Error(`In ${config.localPath} liegt keine index.html. Erst "npm run build" ausführen.`);
  }

  /*
   * synchronize remote überträgt nur, was sich geändert hat (-criteria=time).
   * Bewusst OHNE -delete: der Server behält Dateien, die lokal fehlen.
   * -transfer=binary, damit Bilder nicht durch Zeilenumbruch-Umwandlung
   * beschädigt werden.
   */
  const sync = [
    'synchronize remote',
    PROBE ? '-preview' : '',
    '-criteria=time',
    '-transfer=binary',
    `"${local}"`,
    `"${config.remotePath}"`,
  ]
    .filter(Boolean)
    .join(' ');

  const commands = [
    `open "${config.session}"`,
    sync,
    'exit',
  ];

  console.log(`WinSCP:   ${winscp}`);
  console.log(`Sitzung:  ${config.session}`);
  console.log(`Von:      ${config.localPath}`);
  console.log(`Nach:     ${config.remotePath}`);
  console.log(PROBE ? '\nProbelauf – es wird nichts übertragen.\n' : '\nÜbertragung startet …\n');

  const args = ['/loglevel=0', '/command', ...commands];
  const child = spawn(winscp, args, { stdio: 'inherit' });

  child.on('close', (code) => {
    if (code === 0) {
      console.log('\nFertig.');
      if (!PROBE) {
        console.log('Prüfen: https://verband-technologie.ch/ und /api/posts');
        console.log('Liegt .htaccess oben? Sonst gibt /beitraege beim Neuladen 404.');
      }
    } else {
      console.error(`\nWinSCP endete mit Code ${code}.`);
      process.exitCode = code ?? 1;
    }
  });
}

main().catch((err) => {
  console.error('\n' + err.message);
  process.exitCode = 1;
});
