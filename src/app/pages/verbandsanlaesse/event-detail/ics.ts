import { EventDetail } from '../events';

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

/** Rechnet eine Endzeit aus, wenn keine gepflegt ist. */
function fallbackEnd(start: string): string {
  const [h, m] = start.split(':').map(Number);
  const end = (h + DEFAULT_DURATION_H) % 24;
  return `${String(end).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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

export function buildIcs(ev: EventDetail, now: Date = new Date()): string {
  const location = `${ev.location.name}, ${ev.location.street}, ${ev.location.zip} ${ev.location.city}`;
  const description = ev.body?.length ? ev.body.join('\n\n') : ev.d;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//vlt//Verbandsanlaesse//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:anlass-${ev.id}@vlt.ch`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${stamp(ev.date, ev.start)}`,
    `DTEND:${stamp(ev.date, ev.end ?? fallbackEnd(ev.start))}`,
    `SUMMARY:${esc(ev.t)}`,
    `DESCRIPTION:${esc(description)}`,
    `LOCATION:${esc(location)}`,
    // Erinnerung einen Tag vorher – darum geht es beim Eintrag.
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(ev.t)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  // Das Format schreibt CRLF als Zeilenende vor.
  return lines.map(fold).join('\r\n') + '\r\n';
}
