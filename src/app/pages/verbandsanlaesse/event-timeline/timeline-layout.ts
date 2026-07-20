import { VltEvent, parseDate } from '../events';

/**
 * Positionen werden in "Monaten" gerechnet: 0 = 1. Januar, 12 = 31. Dezember.
 * Das ist unabhaengig von der Pixelbreite – erst beim Rendern wird daraus eine
 * Prozentangabe. So passt sich die Achse jeder Fensterbreite an, ohne zu scrollen.
 */
export const MONTHS_PER_YEAR = 12;

/**
 * Mindestabstand zweier Beschriftungen in Monaten. Liegen Termine enger
 * beieinander, werden sie gruppiert statt uebereinander gezeichnet.
 */
export const MIN_GAP = 0.62;

type Side = 'up' | 'down';

/** Ein Anlass inklusive seiner errechneten Position auf der Achse. */
export interface PositionedEvent extends VltEvent {
  x: number;
}

/** Ein einzelner Termin auf der Achse. */
export interface PlacedSingle {
  type: 'single';
  x: number;
  side: Side;
  ev: PositionedEvent;
}

/** Mehrere dicht beieinander liegende Termine, zu einem Punkt zusammengefasst. */
export interface PlacedCluster {
  type: 'cluster';
  x: number;
  side: Side;
  items: PositionedEvent[];
}

export type Placed = PlacedSingle | PlacedCluster;

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Position eines Datums auf der Jahresachse: Monat plus anteiliger Tag,
 * damit z. B. der 15. Maerz in der Mitte des Maerz-Segments sitzt.
 */
export function naturalX(date: string): number {
  const d = parseDate(date);
  const dim = daysInMonth(d.getFullYear(), d.getMonth());
  return d.getMonth() + (d.getDate() - 1) / dim;
}

/**
 * Verteilt die Termine eines Jahres kollisionsfrei auf der Achse.
 *
 * Termine, die naeher als MIN_GAP beieinander liegen, werden gruppiert:
 * ab drei entsteht ein Cluster-Punkt, bei zweien werden sie auseinandergezogen
 * und ober-/unterhalb der Linie gesetzt. Einzelne Termine wechseln abwechselnd
 * die Seite, damit sich die Beschriftungen nicht stapeln.
 */
export function layoutYear(events: VltEvent[]): Placed[] {
  const withX: PositionedEvent[] = events
    .map((ev) => ({ ...ev, x: naturalX(ev.date) }))
    .sort((a, b) => a.x - b.x);

  // Benachbarte Termine zu Gruppen zusammenfassen.
  const groups: PositionedEvent[][] = [];
  for (const ev of withX) {
    const g = groups[groups.length - 1];
    if (g && ev.x - g[g.length - 1].x < MIN_GAP) g.push(ev);
    else groups.push([ev]);
  }

  let side: Side = 'up';
  const flip = () => (side = side === 'up' ? 'down' : 'up');
  const placed: Placed[] = [];
  let cursorX = -Infinity;

  for (const g of groups) {
    const avgX = g.reduce((s, e) => s + e.x, 0) / g.length;
    // Nie naeher als MIN_GAP an die zuletzt gesetzte Gruppe heranruecken.
    const minX = cursorX === -Infinity ? avgX : Math.max(avgX, cursorX + MIN_GAP);

    if (g.length >= 3) {
      placed.push({ type: 'cluster', x: minX, side, items: g });
      flip();
      cursorX = minX;
    } else if (g.length === 2) {
      placed.push({ type: 'single', x: minX - MIN_GAP / 2, side: 'up', ev: g[0] });
      placed.push({ type: 'single', x: minX + MIN_GAP / 2, side: 'down', ev: g[1] });
      side = 'up';
      cursorX = minX + MIN_GAP / 2;
    } else {
      placed.push({ type: 'single', x: minX, side, ev: g[0] });
      flip();
      cursorX = minX;
    }
  }

  return placed;
}
