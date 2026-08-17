/**
 * Bilder fuers Web aufbereiten
 * ============================
 *
 * Die Bilder aus WordPress sind Kameraoriginale – bis 5 MB pro Datei. Dieses
 * Skript verkleinert sie auf eine sinnvolle Anzeigebreite und wandelt sie
 * nach WebP. Aus rund 240 MB werden so typischerweise 20–35 MB.
 *
 * Aufruf:
 *   node tools/optimize-media.mjs             umwandeln
 *   node tools/optimize-media.mjs --probe     nur rechnen, nichts aendern
 *   node tools/optimize-media.mjs --breite 2000   andere Hoechstbreite
 *
 * Was passiert:
 *   public/medien/2019/03/IMG_6262.jpg   →  public/medien/2019/03/IMG_6262.webp
 *   Das Original wandert nach media-original/2019/03/IMG_6262.jpg
 *
 * Die Originale werden nicht geloescht, sondern nur aus dem Build-Ordner
 * herausgenommen: media-original/ liegt ausserhalb von public/ und wird
 * daher weder gebaut noch hochgeladen. Wer spaeter groessere Fassungen
 * braucht, hat sie noch.
 *
 * Danach:
 *   db/out/fix-medien-webp.sql in phpMyAdmin einspielen – es zieht die
 *   Pfade, Masse und MIME-Typen in der Tabelle media nach.
 *
 * Wiederholbar: bereits umgewandelte Dateien werden uebersprungen. Nach
 * einem erneuten Lauf von migrate-wp.mjs --medien einfach nochmal starten.
 */

import { readdir, mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import sharp from 'sharp';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const MEDIA = join(ROOT, 'public', 'medien');
const ORIGINALS = join(ROOT, 'media-original');
const OUT_SQL = join(ROOT, 'db', 'out', 'fix-medien-webp.sql');

const args = process.argv.slice(2);
const PROBE = args.includes('--probe');
const MAX_WIDTH = Number(args[args.indexOf('--breite') + 1]) || 1600;
const QUALITY = 80;

/** Formate, die umgewandelt werden. Alles andere bleibt unangetastet. */
const CONVERTIBLE = new Set(['.jpg', '.jpeg', '.png']);

/** Alle Dateien unterhalb eines Ordners, rekursiv. */
async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1) + ' MB';

/** Maskiert einen Wert fuer MySQL. */
const sql = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

async function main() {
  console.log(PROBE ? 'Probelauf – es wird nichts geändert.\n' : 'Bilder werden umgewandelt.\n');
  console.log(`Höchstbreite: ${MAX_WIDTH} px, Qualität: ${QUALITY}\n`);

  let before = 0;
  let after = 0;
  let converted = 0;
  let skipped = 0;
  let failed = 0;
  const updates = [];

  for await (const file of walk(MEDIA)) {
    const ext = extname(file).toLowerCase();
    if (!CONVERTIBLE.has(ext)) {
      skipped++;
      continue;
    }

    const relOld = relative(MEDIA, file).replace(/\\/g, '/');
    const relNew = relOld.replace(/\.[^.]+$/, '.webp');
    const target = join(MEDIA, relNew);

    const sourceSize = (await stat(file)).size;
    before += sourceSize;

    try {
      const image = sharp(file);
      const meta = await image.metadata();

      // Nur verkleinern, nie vergroessern: withoutEnlargement laesst
      // kleine Bilder in Ruhe, statt sie unscharf aufzublasen.
      const pipeline = image
        .rotate() // richtet nach EXIF aus, bevor die Ausrichtung verlorengeht
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: QUALITY });

      if (PROBE) {
        const buf = await pipeline.toBuffer();
        after += buf.length;
        converted++;
        continue;
      }

      const { size, width, height } = await pipeline.toFile(target);
      after += size;
      converted++;

      // Original aus public/ herausnehmen, damit es nicht mitgebaut wird.
      const keep = join(ORIGINALS, relOld);
      await mkdir(dirname(keep), { recursive: true });
      await rename(file, keep);

      updates.push({ from: relOld, to: relNew, width, height });

      if (converted % 25 === 0) console.log(`  ${converted} umgewandelt …`);
    } catch (err) {
      console.log(`  ! ${relOld}: ${err.message}`);
      failed++;
    }
  }

  console.log('');
  console.log(`Umgewandelt: ${converted}`);
  if (skipped) console.log(`Übersprungen (kein JPG/PNG): ${skipped}`);
  if (failed) console.log(`Fehlgeschlagen: ${failed}`);
  console.log(`Vorher:  ${mb(before)}`);
  console.log(`Nachher: ${mb(after)}`);
  if (before > 0) {
    console.log(`Ersparnis: ${(100 - (after / before) * 100).toFixed(1)} %`);
  }

  if (PROBE) {
    console.log('\nProbelauf – ohne --probe werden die Dateien tatsächlich umgewandelt.');
    return;
  }

  if (updates.length === 0) {
    console.log('\nNichts zu tun.');
    return;
  }

  // ── SQL fuer die Datenbank ──────────────────────────────────
  const out = [];
  out.push('-- Erzeugt von tools/optimize-media.mjs am ' + new Date().toISOString());
  out.push('--');
  out.push('-- Zieht die Tabelle media auf die umgewandelten Dateien nach:');
  out.push('-- neuer Pfad, neuer MIME-Typ, neue Masse. Ohne diese Korrektur');
  out.push('-- zeigt die API weiter auf die .jpg-Dateien, die es nicht mehr gibt.');
  out.push('--');
  out.push('-- Gefahrlos wiederholbar: beim zweiten Lauf trifft die');
  out.push('-- WHERE-Bedingung auf nichts mehr zu.');
  out.push('');
  out.push('START TRANSACTION;');
  for (const u of updates) {
    out.push(
      `UPDATE media SET path = ${sql(u.to)}, mime = 'image/webp', ` +
      `width = ${u.width}, height = ${u.height} WHERE path = ${sql(u.from)};`,
    );
  }
  out.push('COMMIT;');
  out.push('');
  out.push('-- Kontrolle: sollte 0 ergeben.');
  out.push("SELECT COUNT(*) AS noch_alte_pfade FROM media WHERE path LIKE '%.jpg' OR path LIKE '%.png';");

  await mkdir(dirname(OUT_SQL), { recursive: true });
  await writeFile(OUT_SQL, out.join('\n'), 'utf8');

  console.log(`\nOriginale gesichert in: media-original/`);
  console.log(`SQL geschrieben:        db/out/fix-medien-webp.sql`);
  console.log('\nNächste Schritte:');
  console.log('  1. db/out/fix-medien-webp.sql in phpMyAdmin einspielen');
  console.log('  2. npm run build');
  console.log('  3. Inhalt von dist/vlt-website/ hochladen');
}

main().catch((err) => {
  console.error('\nAbgebrochen:', err.message);
  process.exitCode = 1;
});
