/**
 * Gemeinsame Datumsbausteine.
 *
 * Die ausgeschriebenen Monatsnamen brauchen mehrere Bereiche (Beitraege,
 * Galerie). Sie liegen deshalb hier und nicht bei einem einzelnen Bereich –
 * so haengt keine Seite an den Daten einer anderen.
 */

/**
 * Formatiert ein ISO-Datum (YYYY-MM-DD) ausgeschrieben: "8. Mai 2026".
 *
 * Die API liefert Daten immer als ISO-Zeichenkette. Ausgeschrieben wird
 * erst hier, damit im Template kein Datum zusammengebaut wird.
 */
export function formatDateLong(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()}. ${MONTHS_DE_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Wie formatDateLong, mit Wochentag davor: "Mittwoch, 4. November 2026".
 *
 * Fuer Events. Wer sich einen Termin eintraegt, fragt als Erstes, auf
 * welchen Tag er faellt.
 */
export function formatDateWithWeekday(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return `${WEEKDAYS_DE[d.getDay()]}, ${formatDateLong(iso)}`;
}

/**
 * Beginn und Ende eines Events, wie man sie hier schreibt:
 * "17.30 – 21.00 Uhr", nur "17.30 Uhr" ohne Ende, und leer ohne Beginn
 * (ganztags oder noch offen). Die API liefert "HH:MM".
 */
export function formatTimeRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start) return '';
  const clock = (time: string) => time.replace(':', '.');
  return end ? `${clock(start)} – ${clock(end)} Uhr` : `${clock(start)} Uhr`;
}

/** Heutiges Datum als JJJJ-MM-TT, nach der Uhr des Besuchers. */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Wochentage, mit Sonntag beginnend – so zaehlt Date.getDay(). */
const WEEKDAYS_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

/** Abgekuerzte Monate fuer das Datumsblatt der Eventkarten. */
export const MONTHS_DE_SHORT = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];

/** Ausgeschriebene Monate fuer Datumsangaben in der Oberflaeche. */
export const MONTHS_DE_LONG = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];
