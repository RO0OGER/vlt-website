import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChildren,
} from '@angular/core';

import { RouterLink } from '@angular/router';

import { MONTHS_DE, VLT_EVENTS, VltEvent, eventYear, parseDate } from '../events';
import { MONTHS_PER_YEAR, Placed, PlacedSingle, layoutYear } from './timeline-layout';

/** Breite der Detailkarte in px – muss zu .tl-card im CSS passen. */
const CARD_W = 210;
/** Breite der Beschriftung in px – muss zu .tl-label im CSS passen. */
const LABEL_W = 140;
/** Mindestabstand zum Rand der Achse. */
const EDGE_PAD = 4;

/**
 * Nachlauf, bevor die Karte schliesst. Deckt den Weg der Maus von der
 * Beschriftung ueber den Punkt bis auf die Karte ab (~60px).
 */
const CLOSE_DELAY = 200;

interface YearRow {
  year: number;
  placed: Placed[];
}

@Component({
  selector: 'app-event-timeline',
  imports: [RouterLink],
  templateUrl: './event-timeline.html',
  styleUrl: './event-timeline.css',
})
export class EventTimeline {
  readonly events = input<VltEvent[]>(VLT_EVENTS);

  private readonly tracks = viewChildren<ElementRef<HTMLElement>>('track');

  /**
   * Gemessene Breite einer Jahresspur. Wird nur gebraucht, um die Karte an den
   * Achsenraendern nach innen zu schieben – die Punkte selbst sitzen in Prozent.
   */
  private readonly trackW = signal(0);

  /**
   * Punkt unter Maus oder Tastaturfokus – es ist hoechstens eine Karte offen.
   *
   * Ein Klick haelt die Karte nicht mehr fest, sondern fuehrt zur Detailseite.
   * Per Touch tippt man also direkt auf den Anlass, statt einen Tooltip
   * aufzuklappen – dort steht ohnehin alles.
   */
  private readonly active = signal<Placed | null>(null);

  private closeTimer: ReturnType<typeof setTimeout> | undefined;

  readonly months = MONTHS_DE;

  /**
   * Eine Zeile je Jahrgang, aufsteigend. Welche Jahrgaenge hereinkommen,
   * entscheidet die Seite – dieselbe Auswahl speist auch die Listenansicht.
   */
  readonly years = computed<YearRow[]>(() => {
    const byYear = new Map<number, VltEvent[]>();
    for (const ev of this.events()) {
      const y = eventYear(ev);
      const list = byYear.get(y);
      if (list) list.push(ev);
      else byYear.set(y, [ev]);
    }

    return [...byYear.entries()]
      .sort(([a], [b]) => a - b)
      .map(([year, evs]) => ({ year, placed: layoutYear(evs) }));
  });

  constructor() {
    afterNextRender(() => this.measure());
    inject(DestroyRef).onDestroy(() => clearTimeout(this.closeTimer));
  }

  @HostListener('window:resize')
  measure(): void {
    const el = this.tracks()[0]?.nativeElement;
    if (el) this.trackW.set(el.clientWidth);
  }

  // ── Position ────────────────────────────────────────────────────

  /** Monatsposition [0..12] als Prozentwert auf der Achse. */
  pct(x: number): number {
    return (x / MONTHS_PER_YEAR) * 100;
  }

  /**
   * Karte und Beschriftung haengen mittig am Punkt. Bei Terminen ganz am
   * Jahresanfang oder -ende wuerden sie aus der Achse ragen – in die Jahreszahl
   * hinein bzw. ueber den Seitenrand hinaus. Deshalb werden sie so weit noetig
   * nach innen geschoben.
   */
  private shift(x: number, width: number): number {
    const w = this.trackW();
    if (!w) return 0;

    const px = (x / MONTHS_PER_YEAR) * w;
    const half = width / 2 + EDGE_PAD;
    const clamped = Math.min(Math.max(px, half), Math.max(half, w - half));
    return clamped - px;
  }

  cardTransform(p: Placed): string {
    const scale = this.isOpen(p) ? 1 : 0.96;
    return `translateX(calc(-50% + ${this.shift(p.x, CARD_W)}px)) scale(${scale})`;
  }

  labelTransform(p: Placed): string {
    return `translateX(calc(-50% + ${this.shift(p.x, LABEL_W)}px))`;
  }

  // ── Offen / geschlossen ─────────────────────────────────────────

  isOpen(p: Placed): boolean {
    return this.active() === p;
  }

  onEnter(p: Placed): void {
    clearTimeout(this.closeTimer);
    this.active.set(p);
  }

  /**
   * Zwischen Beschriftung, Punkt und Karte liegen Luecken. Ohne die kurze
   * Verzoegerung wuerde die Karte zugehen, sobald die Maus eine davon quert.
   */
  onLeave(): void {
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => this.active.set(null), CLOSE_DELAY);
  }

  // ── Darstellung ─────────────────────────────────────────────────

  day(date: string): number {
    return parseDate(date).getDate();
  }

  month(date: string): string {
    return MONTHS_DE[parseDate(date).getMonth()];
  }

  year(date: string): string {
    return date.slice(0, 4);
  }

  /** Kurzdatum "3.11." fuer die Terminliste einer Cluster-Karte. */
  shortDate(date: string): string {
    const d = parseDate(date);
    return `${d.getDate()}.${d.getMonth() + 1}.`;
  }

  /**
   * Vorlesetext eines einzelnen Termins. Seine Karte ist fuer Screenreader
   * ausgeblendet, ihr Inhalt steckt hier – sonst wuerden alle Karten der Achse
   * dauerhaft mitgelesen, obwohl sie nur beim Hovern sichtbar sind.
   *
   * Cluster brauchen das nicht: dort ist jeder Termin ein eigener Link in der
   * Karte und damit ohnehin vorlesbar.
   */
  pointLabel(p: PlacedSingle): string {
    const { date, t, d, tag } = p.ev;
    return `${this.day(date)}. ${this.month(date)} ${this.year(date)}, ${t}. ${tag}. ${d}`;
  }
}
