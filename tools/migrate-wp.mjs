/**
 * Migration: WordPress → eigene Datenbank
 * =======================================
 *
 * Holt Beitraege, Kategorien, Seiten und Medien-Metadaten ueber die
 * REST-API der alten Seite, raeumt die Inhalte auf und schreibt daraus
 * SQL-Anweisungen fuer das neue Schema (db/schema.sql).
 *
 * Aufruf:
 *   node tools/migrate-wp.mjs                 nur SQL erzeugen
 *   node tools/migrate-wp.mjs --medien        zusaetzlich die verwendeten
 *                                             Bilder herunterladen
 *   node tools/migrate-wp.mjs --alle-medien   alle 592 Dateien holen
 *   node tools/migrate-wp.mjs --seiten        auch die Textseiten migrieren
 *
 * Ergebnis in db/out/:
 *   migration.sql      zum Einspielen in phpMyAdmin
 *   bericht.md         was uebernommen wurde und was Handarbeit braucht
 *
 * Das Skript ist wiederholbar: jeder Beitrag wird vor dem Einfuegen anhand
 * seiner legacy_wp_id geloescht. Dank ON DELETE CASCADE verschwinden dabei
 * auch seine Abschnitte und Bildzuordnungen, es entstehen keine Dubletten.
 *
 * Bewusst nicht migriert: Verfasserangaben. Dafuer muesste /wp/v2/users
 * abgefragt werden, und dort haengen die Mitgliederkonten dran. Das Feld
 * posts.author bleibt leer und kann von Hand gepflegt werden.
 */

import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const WP = 'https://verband-technologie.ch';
const OUT_DIR = new URL('../db/out/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const MEDIA_DIR = new URL('../public/medien/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const args = new Set(process.argv.slice(2));
const DOWNLOAD_USED = args.has('--medien') || args.has('--alle-medien');
const DOWNLOAD_ALL = args.has('--alle-medien');
const WITH_PAGES = args.has('--seiten');

/**
 * Textseiten, die uebernommen werden. Seiten mit eigenem Layout (Ausbildung,
 * Vorstand, Teilnehmerkosten …) bleiben Angular-Komponenten und stehen hier
 * bewusst nicht drin.
 */
const PAGE_SLUGS = [
  'impressum',
  'rechtliche-hinweise',
  'newsletter',
  'newsletter_aktuell',
  'jahresberichte',
  'jahresbericht-2017',
  'jahresbericht-2018',
  'beitrittserklaerung',
  'beitrittserklaerung-kollektivmitglied',
  'austrittserklaerung',
  'adressmutation-mitglied',
  'fachvorstand-adress-mutation',
];

// ── Abrufen ─────────────────────────────────────────────────

/**
 * Holt JSON von der WordPress-API.
 *
 * Das Plugin mimetypes-link-icons schiebt <style>-Bloecke vor die Antwort,
 * die dann kein gueltiges JSON mehr ist. Deshalb wird vor dem Parsen alles
 * bis zum ersten [ oder { abgeschnitten.
 */
async function wpFetch(path) {
  return (await wpFetchWithHeaders(path)).data;
}

/** Wie wpFetch, gibt aber auch die Kopfzeilen zurueck (fuer die Seitenzahl). */
async function wpFetchWithHeaders(path) {
  const res = await fetch(`${WP}/wp-json/wp/v2/${path}`);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  const text = await res.text();
  return { data: JSON.parse(stripHtmlPrefix(text, path)), headers: res.headers };
}

/**
 * Entfernt HTML, das vor der eigentlichen Antwort steht.
 *
 * Nicht nach der ersten eckigen Klammer suchen: die Style-Bloecke enthalten
 * selbst welche (a[data-mtli~="…"]). Stattdessen werden fuehrende Tags
 * einzeln abgetragen, solange die Antwort mit "<" beginnt.
 */
function stripHtmlPrefix(text, path) {
  let s = text.trimStart();
  const before = s.length;
  while (s.startsWith('<')) {
    const block = /^<(style|script)\b[^>]*>[\s\S]*?<\/\1>\s*/i.exec(s);
    if (block) { s = s.slice(block[0].length); continue; }
    const tag = /^<[^>]*>\s*/.exec(s);
    if (tag) { s = s.slice(tag[0].length); continue; }
    break;
  }
  if (!s.startsWith('[') && !s.startsWith('{')) {
    throw new Error(`${path} → keine JSON-Daten in der Antwort`);
  }
  const removed = before - s.length;
  if (removed > 0) log(`  Hinweis: ${removed} Bytes HTML-Vorspann entfernt (${path})`);
  return s;
}

/**
 * Holt eine seitenweise Sammlung vollstaendig.
 *
 * Die Seitenzahl kommt aus dem Kopf X-WP-TotalPages, nicht aus der Groesse
 * der letzten Antwort: WordPress liefert zwischendurch kurze Seiten, obwohl
 * noch Daten folgen. Wer darauf abbricht, verliert stillschweigend Zeilen.
 */
async function wpFetchAll(resource, perPage = 100) {
  const out = [];
  const first = await wpFetchWithHeaders(`${resource}?per_page=${perPage}&page=1`);
  out.push(...first.data);

  const totalPages = Number(first.headers.get('x-wp-totalpages') ?? 1) || 1;
  const total = Number(first.headers.get('x-wp-total') ?? out.length) || out.length;

  for (let page = 2; page <= totalPages; page++) {
    const batch = await wpFetch(`${resource}?per_page=${perPage}&page=${page}`);
    if (batch.length === 0) break;
    out.push(...batch);
  }

  if (out.length !== total) {
    log(`  ! ${resource}: ${out.length} von ${total} Einträgen erhalten`);
  }
  return out;
}

// ── HTML aufraeumen ─────────────────────────────────────────

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü',
  szlig: 'ß', eacute: 'é', egrave: 'è', agrave: 'à', ndash: '–', mdash: '—',
  hellip: '…', laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”',
  sbquo: '‚', lsquo: '‘', rsquo: '’', bull: '•', deg: '°', euro: '€',
  shy: '', zwj: '', middot: '·',
};

/** Wandelt HTML-Entities in echte Zeichen. */
function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => (name in ENTITIES ? ENTITIES[name] : m));
}

/**
 * Macht aus einem HTML-Fragment reinen Text.
 *
 * Das Detailtemplate gibt den Abschnittstext ueber {{ }} aus, also
 * interpoliert und nicht als HTML. Alles, was Auszeichnung waere, muss hier
 * verschwinden – auch Links. Die werden vorher eingesammelt und landen im
 * Bericht, damit sie nicht unbemerkt verloren gehen.
 */
function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/?(strong|b|em|i|span|a|u|sub|sup|mark)\b[^>]*>/gi, '')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sammelt alle Links eines Beitrags, damit sie im Bericht auftauchen. */
function collectLinks(html) {
  const links = [];
  for (const m of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = htmlToText(m[2]);
    if (label || m[1]) links.push({ href: decodeEntities(m[1]), label });
  }
  return links;
}

// ── Bildadressen ────────────────────────────────────────────

/**
 * Fuehrt eine Bildadresse auf die Originaldatei zurueck.
 *
 * Jetpack liefert alle Bilder ueber seinen CDN aus:
 *   https://i0.wp.com/verband-technologie.ch/wp-content/uploads/…?resize=300%2C200
 * Daraus wird wieder
 *   https://verband-technologie.ch/wp-content/uploads/…
 * Ausserdem wird die Groessenangabe im Dateinamen (-300x200) entfernt, damit
 * das Original statt einer verkleinerten Fassung geholt wird.
 */
function normalizeImageUrl(src) {
  let url = decodeEntities(src);
  const cdn = /^https?:\/\/i[0-9]\.wp\.com\/(.+)$/.exec(url);
  if (cdn) url = 'https://' + cdn[1];
  url = url.split('?')[0];
  url = url.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, '$1');
  return url;
}

/**
 * Aus der Upload-Adresse wird der Pfad fuer die Spalte media.path:
 * 2024/11/bild.jpg
 *
 * Bewusst OHNE fuehrendes "medien/": wo die Dateien liegen, steht in der
 * config.php der API (media_base). Stuende der Ordner auch in der Datenbank,
 * muesste man beim Verschieben beide Stellen anfassen – und beim Zusammen-
 * setzen kaeme /medien/medien/… heraus.
 */
function localMediaPath(url) {
  const m = /\/wp-content\/uploads\/(.+)$/.exec(url);
  return m ? m[1] : url.split('/').pop();
}

// ── SQL-Erzeugung ───────────────────────────────────────────

/** Maskiert einen Wert fuer MySQL. Niemals Werte ohne diese Funktion einsetzen. */
function sql(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  if (typeof value === 'number') return String(value);
  return quote(String(value));
}

/**
 * Wie sql(), liefert aber nie NULL.
 *
 * Fuer Spalten mit NOT NULL: ein Abschnitt, der nur aus Bildern besteht, hat
 * keinen Text – die Spalte will trotzdem eine leere Zeichenkette sehen, sonst
 * bricht der Import mit "Column cannot be null" ab.
 */
function sqlStr(value) {
  return quote(value === null || value === undefined ? '' : String(value));
}

function quote(s) {
  return (
    "'" +
    s
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '')
      .replace(/\x00/g, '') +
    "'"
  );
}

/** Unterabfrage statt fester ID – so bleibt das SQL unabhaengig von AUTO_INCREMENT. */
const mediaId = (path) => (path ? `(SELECT id FROM media WHERE path = ${sql(path)})` : 'NULL');
const categoryId = (slug) => (slug ? `(SELECT id FROM categories WHERE slug = ${sql(slug)})` : 'NULL');
const postId = (slug) => `(SELECT id FROM posts WHERE slug = ${sql(slug)})`;

// ── Aufbereitung eines Beitrags ─────────────────────────────

/**
 * Zerlegt den Beitragsinhalt in Abschnitte.
 *
 * Regel: Absaetze sammeln sich zu einem Abschnitt. Sobald Bilder kommen,
 * haengen sie an den offenen Abschnitt (hoechstens zwei, mehr zeigt das
 * Layout nicht) und der Abschnitt wird geschlossen. So entsteht der
 * Wechsel aus Text und Bildreihe, auf den beitrag-detail ausgelegt ist.
 */
function buildSections(html) {
  const sections = [];
  let text = [];
  let images = [];

  const flush = () => {
    const joined = text.join(' ').trim();
    if (joined || images.length) sections.push({ text: joined, images: images.slice(0, 2) });
    text = [];
    images = [];
  };

  // Blockweise durchgehen: Absaetze, Ueberschriften, Listen, Bilder.
  const blocks = html.split(/(?=<(?:p|h[1-6]|ul|ol|figure|div|img)\b)/i);

  for (const block of blocks) {
    const imgs = [...block.matchAll(/<img\b[^>]*?src="([^"]+)"[^>]*>/gi)];
    if (imgs.length) {
      for (const img of imgs) {
        const alt = /alt="([^"]*)"/i.exec(img[0])?.[1] ?? '';
        images.push({ url: normalizeImageUrl(img[1]), alt: decodeEntities(alt) });
      }
      // Text, der im selben Block noch steht, gehoert zum Abschnitt davor.
      const rest = htmlToText(block.replace(/<img\b[^>]*>/gi, ''));
      if (rest) text.push(rest);
      if (images.length >= 2) flush();
      continue;
    }
    const t = htmlToText(block);
    if (!t) continue;
    text.push(t);
    // Ein Abschnitt je Absatz haelt die Textspalte lesbar.
    if (text.length >= 1 && /<\/p>/i.test(block)) flush();
  }
  flush();

  return sections.filter((s) => s.text || s.images.length);
}

/** Schaetzt die Lesedauer: 200 Woerter je Minute, mindestens 1. */
function readMinutes(text) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Aus dem Titel einen Slug bauen, falls WordPress keinen brauchbaren liefert. */
function slugify(s) {
  return decodeEntities(s)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 190);
}

// ── Medien herunterladen ────────────────────────────────────

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

/**
 * Laedt eine Datei herunter, sofern sie noch nicht liegt.
 * Schlaegt das Original fehl, wird die Adresse aus dem Beitrag versucht –
 * manche Bilder gibt es nur in der verkleinerten Fassung.
 */
async function download(url, target, fallbackUrl) {
  if (await exists(target)) return 'vorhanden';
  for (const candidate of [url, fallbackUrl].filter(Boolean)) {
    const res = await fetch(candidate);
    if (!res.ok) continue;

    /*
     * HTTP 200 heisst nicht, dass auch ein Bild kommt. Fehlt eine Datei,
     * liefern manche Server eine HTML-Seite mit Status 200 aus – die landete
     * dann als .png auf der Platte und flog erst beim Umwandeln auf.
     */
    const type = res.headers.get('content-type') ?? '';
    if (!/^(image|application\/pdf)/i.test(type)) continue;

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await res.arrayBuffer()));
    return candidate === url ? 'geladen' : 'geladen (verkleinert)';
  }
  return 'FEHLT';
}

// ── Hauptlauf ───────────────────────────────────────────────

const logLines = [];
function log(msg) {
  console.log(msg);
  logLines.push(msg);
}

async function main() {
  log('WordPress-Migration');
  log('===================\n');

  log('Kategorien holen …');
  const wpCategories = await wpFetchAll('categories');
  const catBySlug = new Map();
  const catById = new Map();
  for (const c of wpCategories) {
    const entry = { slug: c.slug, name: decodeEntities(c.name), count: c.count };
    catBySlug.set(c.slug, entry);
    catById.set(c.id, entry);
  }
  log(`  ${wpCategories.length} Kategorien`);

  log('Medien-Metadaten holen …');
  const wpMedia = await wpFetchAll('media');
  // Nach normalisierter Adresse indizieren, damit Breite/Hoehe auffindbar sind.
  const mediaByUrl = new Map();
  for (const m of wpMedia) {
    const url = normalizeImageUrl(m.source_url);
    mediaByUrl.set(url, {
      url,
      alt: decodeEntities(m.alt_text || ''),
      mime: m.mime_type,
      width: m.media_details?.width ?? null,
      height: m.media_details?.height ?? null,
      bytes: m.media_details?.filesize ?? null,
      legacy: m.source_url,
    });
  }
  log(`  ${wpMedia.length} Dateien in der Mediathek`);

  log('Beitraege holen …');
  const wpPosts = await wpFetchAll('posts');
  log(`  ${wpPosts.length} Beitraege\n`);

  // ── Aufbereiten ───────────────────────────────────────────
  const usedMedia = new Map();
  const posts = [];
  const droppedLinks = [];

  const useMedia = (url, alt) => {
    if (!url) return null;
    const path = localMediaPath(url);
    if (!usedMedia.has(path)) {
      const meta = mediaByUrl.get(url) ?? {};
      usedMedia.set(path, {
        path,
        url,
        alt: alt || meta.alt || '',
        mime: meta.mime ?? guessMime(url),
        width: meta.width ?? null,
        height: meta.height ?? null,
        bytes: meta.bytes ?? null,
        legacy: meta.legacy ?? url,
      });
    } else if (alt && !usedMedia.get(path).alt) {
      usedMedia.get(path).alt = alt;
    }
    return path;
  };

  for (const p of wpPosts) {
    const html = p.content?.rendered ?? '';
    const title = decodeEntities(p.title?.rendered ?? '').trim();
    const slug = p.slug && /^[a-z0-9-]+$/.test(p.slug) ? p.slug : slugify(title);

    const links = collectLinks(html);
    if (links.length) droppedLinks.push({ slug, title, links });

    const sections = buildSections(html);
    for (const s of sections) for (const img of s.images) useMedia(img.url, img.alt);

    // Titelbild: aus featured_media, sonst das erste Bild im Text.
    let coverPath = null;
    if (p.featured_media) {
      const fm = wpMedia.find((m) => m.id === p.featured_media);
      if (fm) coverPath = useMedia(normalizeImageUrl(fm.source_url), decodeEntities(fm.alt_text || title));
    }
    if (!coverPath) {
      const first = sections.flatMap((s) => s.images)[0];
      if (first) coverPath = localMediaPath(first.url);
    }

    const cat = catById.get(p.categories?.[0]) ?? null;
    const plain = sections.map((s) => s.text).join(' ');

    posts.push({
      legacyId: p.id,
      slug,
      title,
      // WordPress haengt an automatisch gekuerzte Anrisse ein "[…]" an –
      // das ist Werkzeugspur, kein Inhalt.
      excerpt: htmlToText(p.excerpt?.rendered ?? '')
        .replace(/\s*\[\s*…\s*\]\s*$/, ' …')
        .slice(0, 600),
      date: (p.date ?? '').slice(0, 10),
      readMinutes: readMinutes(plain),
      coverPath,
      categorySlug: cat?.slug ?? null,
      extraCategories: (p.categories ?? []).slice(1).map((id) => catById.get(id)?.slug).filter(Boolean),
      sections,
      status: p.status === 'publish' ? 'published' : 'draft',
    });
  }

  // ── Seiten ────────────────────────────────────────────────
  const pages = [];
  if (WITH_PAGES) {
    log('Seiten holen …');
    const wpPages = await wpFetchAll('pages');
    for (const slug of PAGE_SLUGS) {
      const page = wpPages.find((x) => x.slug === slug);
      if (!page) { log(`  ! Seite /${slug}/ nicht gefunden`); continue; }
      const html = page.content?.rendered ?? '';
      pages.push({
        legacyId: page.id,
        slug: slug.replace(/_/g, '-'),
        title: decodeEntities(page.title?.rendered ?? ''),
        // Seiten behalten ihr HTML: sie werden spaeter mit einem Sanitizer
        // ausgegeben, nicht interpoliert. Nur die alten Domains werden
        // umgeschrieben, damit keine Links auf WordPress zeigen.
        body: html
          .replace(/https?:\/\/(www\.)?verband-ika\.ch/g, '')
          .replace(/https?:\/\/(www\.)?verband-technologie\.ch/g, '')
          .replace(/\/wp-content\/uploads\//g, '/medien/'),
        status: page.status === 'publish' ? 'published' : 'draft',
      });
      for (const m of html.matchAll(/<img\b[^>]*?src="([^"]+)"/gi)) {
        useMedia(normalizeImageUrl(m[1]), '');
      }
    }
    log(`  ${pages.length} Seiten uebernommen`);
  }

  // ── Medien herunterladen ──────────────────────────────────
  let downloadReport = [];
  if (DOWNLOAD_USED) {
    const list = DOWNLOAD_ALL
      ? [...mediaByUrl.values()].map((m) => ({ ...m, path: localMediaPath(m.url) }))
      : [...usedMedia.values()];
    log(`\n${list.length} Dateien herunterladen …`);
    let done = 0;
    for (const item of list) {
      const target = join(MEDIA_DIR, item.path);
      const status = await download(item.url, target, item.legacy);
      downloadReport.push({ path: item.path, status });
      if (status === 'FEHLT') log(`  ! ${item.path}`);
      if (++done % 25 === 0) log(`  ${done}/${list.length}`);
      if (DOWNLOAD_ALL) useMedia(item.url, item.alt);
    }
    log(`  fertig: ${downloadReport.filter((d) => d.status !== 'FEHLT').length}/${list.length}`);
  }

  // ── SQL schreiben ─────────────────────────────────────────
  const out = [];
  out.push('-- Erzeugt von tools/migrate-wp.mjs am ' + new Date().toISOString());
  out.push('-- Wiederholbar: bestehende Zeilen werden anhand der legacy_wp_id ersetzt.');
  out.push('SET NAMES utf8mb4;');
  out.push('START TRANSACTION;');
  out.push('');

  out.push('-- ── Kategorien ──────────────────────────────────');
  let sort = 10;
  for (const c of catBySlug.values()) {
    out.push(
      `INSERT INTO categories (slug, name, sort) VALUES (${sqlStr(c.slug)}, ${sqlStr(c.name)}, ${sort}) ` +
      `ON DUPLICATE KEY UPDATE name = VALUES(name);`,
    );
    sort += 10;
  }

  out.push('');
  out.push('-- ── Medien ──────────────────────────────────────');
  for (const m of usedMedia.values()) {
    out.push(
      `INSERT INTO media (path, alt, mime, width, height, bytes, legacy_url) VALUES (` +
      `${sqlStr(m.path)}, ${sqlStr(m.alt)}, ${sqlStr(m.mime)}, ${sql(m.width)}, ${sql(m.height)}, ` +
      `${sql(m.bytes)}, ${sql(m.legacy)}) ` +
      `ON DUPLICATE KEY UPDATE alt = VALUES(alt), width = VALUES(width), height = VALUES(height);`,
    );
  }

  out.push('');
  out.push('-- ── Beitraege ───────────────────────────────────');
  for (const p of posts) {
    out.push(`-- ${p.date}  ${p.title}`);
    out.push(`DELETE FROM posts WHERE legacy_wp_id = ${p.legacyId};`);
    out.push(
      `INSERT INTO posts (slug, title, excerpt, published_at, read_minutes, cover_id, category_id, status, legacy_wp_id) VALUES (` +
      `${sqlStr(p.slug)}, ${sqlStr(p.title)}, ${sqlStr(p.excerpt)}, ${sql(p.date)}, ${p.readMinutes}, ` +
      `${mediaId(p.coverPath)}, ${categoryId(p.categorySlug)}, ${sqlStr(p.status)}, ${p.legacyId});`,
    );
    for (const slug of p.extraCategories) {
      out.push(
        `INSERT IGNORE INTO post_categories (post_id, category_id) VALUES (${postId(p.slug)}, ${categoryId(slug)});`,
      );
    }
    p.sections.forEach((s, i) => {
      out.push(
        `INSERT INTO post_sections (post_id, position, text) VALUES (${postId(p.slug)}, ${i}, ${sqlStr(s.text)});`,
      );
      s.images.forEach((img, j) => {
        const path = localMediaPath(img.url);
        out.push(
          `INSERT IGNORE INTO post_section_images (section_id, media_id, position) VALUES (` +
          `(SELECT id FROM post_sections WHERE post_id = ${postId(p.slug)} AND position = ${i}), ` +
          `${mediaId(path)}, ${j});`,
        );
      });
    });
    out.push('');
  }

  if (pages.length) {
    out.push('-- ── Seiten ──────────────────────────────────────');
    for (const p of pages) {
      out.push(`DELETE FROM pages WHERE legacy_wp_id = ${p.legacyId};`);
      out.push(
        `INSERT INTO pages (slug, title, body_html, status, legacy_wp_id) VALUES (` +
        `${sqlStr(p.slug)}, ${sqlStr(p.title)}, ${sqlStr(p.body)}, ${sqlStr(p.status)}, ${p.legacyId});`,
      );
    }
    out.push('');
  }

  out.push('COMMIT;');

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, 'migration.sql'), out.join('\n'), 'utf8');

  // ── Bericht ───────────────────────────────────────────────
  const report = [];
  report.push('# Migrationsbericht');
  report.push('');
  report.push(`Erzeugt am ${new Date().toLocaleString('de-CH')}`);
  report.push('');
  report.push('## Übernommen');
  report.push('');
  report.push(`- ${posts.length} Beiträge (${posts.filter((p) => p.status === 'published').length} veröffentlicht)`);
  report.push(`- ${posts.reduce((n, p) => n + p.sections.length, 0)} Abschnitte`);
  report.push(`- ${catBySlug.size} Kategorien`);
  report.push(`- ${usedMedia.size} referenzierte Mediendateien`);
  report.push(`- ${pages.length} Textseiten`);
  report.push(`- ${posts.filter((p) => !p.coverPath).length} Beiträge ohne Titelbild`);
  const linkCount = droppedLinks.reduce((n, e) => n + e.links.length, 0);
  report.push(`- ${linkCount} Links im Fliesstext – gehen verloren, siehe unten`);
  report.push('');

  const noRatio = [...usedMedia.values()].filter((m) => !m.width || !m.height);
  if (noRatio.length) {
    report.push('## Bilder ohne Massangaben');
    report.push('');
    report.push('Ohne Breite und Höhe kann die Galerie den Platz nicht freihalten.');
    report.push('');
    for (const m of noRatio) report.push(`- \`${m.path}\``);
    report.push('');
  }

  if (downloadReport.some((d) => d.status === 'FEHLT')) {
    report.push('## Nicht ladbare Dateien');
    report.push('');
    for (const d of downloadReport.filter((x) => x.status === 'FEHLT')) report.push(`- \`${d.path}\``);
    report.push('');
  }

  report.push('## Links, die im Fliesstext verloren gehen');
  report.push('');
  report.push('Die Detailseite gibt den Abschnittstext interpoliert aus, nicht als HTML.');
  report.push('Verlinkungen können dort deshalb nicht überleben. Hier stehen sie,');
  report.push('damit die wichtigen von Hand nachgetragen werden können.');
  report.push('');
  for (const entry of droppedLinks) {
    report.push(`### ${entry.title}`);
    report.push('');
    report.push(`Beitrag: \`/beitraege/${entry.slug}\``);
    report.push('');
    for (const l of entry.links) {
      report.push(`- ${l.label || '(ohne Text)'} → \`${l.href}\``);
    }
    report.push('');
  }

  await writeFile(join(OUT_DIR, 'bericht.md'), report.join('\n'), 'utf8');

  log('');
  log(`SQL:     db/out/migration.sql (${out.length} Zeilen)`);
  log(`Bericht: db/out/bericht.md`);
  if (!DOWNLOAD_USED) {
    log('');
    log(`Hinweis: ${usedMedia.size} Bilder werden referenziert, aber nicht geladen.`);
    log('         Mit --medien holt das Skript sie nach public/medien/.');
  }
}

/** Notbehelf, wenn die Mediathek keinen MIME-Typ kennt. */
function guessMime(url) {
  const ext = (url.split('.').pop() ?? '').toLowerCase();
  return {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf',
  }[ext] ?? 'application/octet-stream';
}

main().catch((err) => {
  console.error('\nAbgebrochen:', err.message);
  process.exitCode = 1;
});
