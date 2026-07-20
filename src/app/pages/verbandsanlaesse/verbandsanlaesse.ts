import {
  Component,
  DestroyRef,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';

import { RouterLink } from '@angular/router';

import { EventTimeline } from './event-timeline/event-timeline';
import {
  MONTHS_DE,
  VLT_EVENTS,
  VltEvent,
  currentYear,
  eventYear,
  parseDate,
} from './events';

type View = 'timeline' | 'list';

/** Ein Anlass, aufbereitet fuer eine Zeile der Listenansicht. */
interface ListRow {
  id: number;
  day: string;
  mon: string;
  yy: string;
  tag: VltEvent['tag'];
  t: string;
  d: string;
}

/** Ab dieser Breite ist zu wenig Platz fuer den Zeitstrahl. */
const NARROW = '(max-width: 900px)';

@Component({
  selector: 'app-verbandsanlaesse',
  imports: [EventTimeline, RouterLink],
  templateUrl: './verbandsanlaesse.html',
  styleUrl: './verbandsanlaesse.css',
})
export class Verbandsanlaesse {
  readonly views: ReadonlyArray<{ key: View; label: string }> = [
    { key: 'timeline', label: 'Zeitstrahl' },
    { key: 'list', label: 'Liste' },
  ];

  /** Vom Benutzer gewaehlte Ansicht (nur auf breiten Viewports umschaltbar). */
  readonly view = signal<View>('timeline');

  private readonly narrow = signal(false);

  /** Auf schmalen Viewports gibt es nur die Liste – der Zeitstrahl braucht Breite. */
  readonly effectiveView = computed<View>(() =>
    this.narrow() ? 'list' : this.view(),
  );

  /** Alle Jahrgaenge mit Terminen, aufsteigend. */
  private readonly allYears = computed(() =>
    [...new Set(VLT_EVENTS.map(eventYear))].sort((a, b) => a - b),
  );

  /**
   * Vorbelegung: das laufende Jahr, aber nie spaeter als der juengste
   * vorhandene Jahrgang. Liegen alle gepflegten Termine zurueck – etwa weil
   * die Daten laenger nicht nachgefuehrt wurden – bliebe die Seite sonst leer.
   */
  private readonly defaultFrom = computed(() => {
    const all = this.allYears();
    return all.length ? Math.min(currentYear(), all[all.length - 1]) : currentYear();
  });

  /**
   * Fruehester angezeigter Jahrgang. Gilt fuer beide Ansichten, damit ein
   * Wechsel zwischen Zeitstrahl und Liste denselben Zeitraum zeigt.
   */
  private readonly fromYear = linkedSignal(() => this.defaultFrom());

  readonly visibleEvents = computed(() =>
    VLT_EVENTS.filter((ev) => eventYear(ev) >= this.fromYear()),
  );

  /**
   * Naechster aelterer Jahrgang mit Terminen. Leere Jahre werden uebersprungen,
   * sonst waere der Klick wirkungslos.
   */
  readonly earlierYear = computed<number | null>(() => {
    const earlier = this.allYears().filter((y) => y < this.fromYear());
    return earlier.length ? earlier[earlier.length - 1] : null;
  });

  /** Es sind vergangene Jahrgaenge eingeblendet, die man wieder ausblenden kann. */
  readonly showsPast = computed(() => this.fromYear() < this.defaultFrom());

  showEarlier(): void {
    const y = this.earlierYear();
    if (y !== null) this.fromYear.set(y);
  }

  showUpcomingOnly(): void {
    this.fromYear.set(this.defaultFrom());
  }

  readonly rows = computed<ListRow[]>(() =>
    [...this.visibleEvents()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((ev) => {
        const d = parseDate(ev.date);
        return {
          id: ev.id,
          day: String(d.getDate()).padStart(2, '0'),
          mon: MONTHS_DE[d.getMonth()],
          yy: String(d.getFullYear()).slice(2),
          tag: ev.tag,
          t: ev.t,
          d: ev.d,
        };
      }),
  );

  constructor() {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mq = window.matchMedia(NARROW);
    this.narrow.set(mq.matches);

    const onChange = (e: MediaQueryListEvent) => this.narrow.set(e.matches);
    mq.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', onChange));
  }
}
