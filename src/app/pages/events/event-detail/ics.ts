import { EventInfo } from '../../../shared/post-view';

/**
 * Baut einen Kalendereintrag im iCalendar-Format (RFC 5545).
 *
 * Der Eintrag entsteht im Browser, es braucht kein Backend. Zeiten sind
 * "floating": ohne Zeitzone notiert und damit in der lokalen Zeit des
 * Kalenders zu lesen – fuer einen Anlass in der Schweiz vor Schweizer
 * Publikum das erwartete Verhalten und einfacher als eine VTIMEZONE-Angabe.
 */

/** Stunden, die angenommen werden, wenn kein Ende gepflegt ist. */
const DEFAULT_DURATION_H = 2;

/** Was der Eintrag ausser den Angaben des Events braucht. */
export interface IcsSource {
  slug: string;
  title: string;
  excerpt: string;
  /** Adresse der Detailseite – steht im Eintrag, damit man zurueckfindet. */
  url: string;
  event: EventInfo;
}

/**
 * Maskiert Sonderzeichen. Ohne das zerlegt ein Komma oder Semikolon im Titel
 * den Eintrag, weil das Format sie als Trennzeichen liest.
 */
function esc(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** "2026-06-12" + "13:30" -> "20260612T133000" */
function stamp(date: string, time: string): string {
  const [h, m] = time.split(':');
  return `${date.replace(/-/g, '')}T${h.padStart(2, '0')}${m.padStart(2, '0')}00`;
}

/** Zeitpunkt der Erstellung in UTC, wie es das Format fuer DTSTAMP verlangt. */
function utcStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Rechnet eine Endzeit aus, wenn keine gepflegt ist. Bleibt am selben Tag. */
function fallbackEnd(start: string): string {
  const [h, m] = start.split(':').map(Number);
  const end = Math.min(h + DEFAULT_DURATION_H, 23);
  return `${String(end).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Der Tag nach einem ISO-Datum, ebenfalls als JJJJMMTT. */
function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Faltet zu lange Zeilen. Das Format erlaubt 75 Zeichen je Zeile; laengere
 * werden umgebrochen und mit einem Leerzeichen fortgesetzt.
 */
function fold(line: string): string {
  if (line.length <= 75) return line;

  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) parts.push(' ' + rest);
  return parts.join('\r\n');
}

export function buildIcs(source: IcsSource, now: Date = new Date()): string {
  const ev = source.event;

  // Ohne Beginn ein Ganztageseintrag: das Ende ist dort der Folgetag.
  const when = ev.start
    ? [`DTSTART:${stamp(ev.date, ev.start)}`, `DTEND:${stamp(ev.date, ev.end || fallbackEnd(ev.start))}`]
    : [`DTSTART;VALUE=DATE:${ev.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${nextDay(ev.date)}`];

  const description = [source.excerpt, source.url].filter((part) => part !== '').join('\n\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//vlt//Verbandsanlaesse//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:anlass-${source.slug}@verband-technologie.ch`,
    `DTSTAMP:${utcStamp(now)}`,
    ...when,
    `SUMMARY:${esc(source.title)}`,
    `DESCRIPTION:${esc(description)}`,
    `LOCATION:${esc(ev.address)}`,
    `URL:${source.url}`,
    // Erinnerung einen Tag vorher – darum geht es beim Eintrag.
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(source.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  // Das Format schreibt CRLF als Zeilenende vor.
  return lines.map(fold).join('\r\n') + '\r\n';
}
