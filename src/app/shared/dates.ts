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
