import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import {
  MONTHS_DE_LONG,
  WEEKDAYS_DE,
  findEvent,
  parseDate,
} from '../events';
import { buildIcs } from './ics';

/** Mehr Hauptfotos zeigt das Karussell nicht, auch wenn das CMS mehr liefert. */
const MAX_PHOTOS = 10;

@Component({
  selector: 'app-event-detail',
  imports: [RouterLink],
  templateUrl: './event-detail.html',
  styleUrl: './event-detail.css',
})
export class EventDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);

  private readonly id = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id'))),
    { initialValue: null },
  );

  readonly event = computed(() => findEvent(this.id()));

  // ── Karussell ───────────────────────────────────────────────────

  readonly photos = computed(() => this.event()?.photos?.slice(0, MAX_PHOTOS) ?? []);

  private readonly rawIndex = signal(0);

  /**
   * Der Index wird begrenzt statt blind uebernommen: wechselt der Anlass,
   * koennte er sonst auf ein Bild zeigen, das es nicht mehr gibt.
   */
  readonly index = computed(() => {
    const count = this.photos().length;
    if (!count) return 0;
    return Math.min(this.rawIndex(), count - 1);
  });

  go(i: number): void {
    const count = this.photos().length;
    if (!count) return;
    // Umlaufend, damit man am Ende nicht haengen bleibt.
    this.rawIndex.set((i + count) % count);
  }

  next(): void {
    this.go(this.index() + 1);
  }

  prev(): void {
    this.go(this.index() - 1);
  }

  // ── Datum und Zeit ──────────────────────────────────────────────

  /** "Freitag, 12. Juni 2026" */
  readonly fullDate = computed(() => {
    const ev = this.event();
    if (!ev) return '';

    const d = parseDate(ev.date);
    return `${WEEKDAYS_DE[d.getDay()]}, ${d.getDate()}. ${MONTHS_DE_LONG[d.getMonth()]} ${d.getFullYear()}`;
  });

  /** "13:30 – 17:00 Uhr" bzw. "ab 13:30 Uhr", wenn kein Ende gepflegt ist. */
  readonly timeRange = computed(() => {
    const ev = this.event();
    if (!ev) return '';
    return ev.end ? `${ev.start} – ${ev.end} Uhr` : `ab ${ev.start} Uhr`;
  });

  // ── Kalendereintrag ─────────────────────────────────────────────

  /**
   * Laedt den Termin als .ics herunter. Das uebernimmt jedes Kalenderprogramm
   * und braucht weder Backend noch Zugriff auf einen fremden Kalenderdienst.
   */
  addToCalendar(): void {
    const ev = this.event();
    if (!ev) return;

    const blob = new Blob([buildIcs(ev)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    // Webcode statt ID: im Download-Ordner ist "VLT-260612.ics" wiedererkennbar.
    link.download = `${ev.webcode}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ── Karte ───────────────────────────────────────────────────────

  /**
   * Kartenausschnitt von OpenStreetMap – kein Schluessel und kein Konto noetig.
   *
   * bypassSecurityTrustResourceUrl ist hier vertretbar: der Host ist fest
   * verdrahtet und in die Adresse fliessen ausschliesslich Zahlen, die vorher
   * geprueft werden. Aus dem CMS kann also kein fremdes Ziel eingeschleust
   * werden. Kaeme die Adresse selbst aus dem CMS, waere das nicht zulaessig.
   */
  readonly mapUrl = computed<SafeResourceUrl | null>(() => {
    const loc = this.event()?.location;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return null;

    const pad = 0.004;
    const bbox = [loc.lon - pad, loc.lat - pad, loc.lon + pad, loc.lat + pad].join(',');
    const url =
      `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}` +
      `&layer=mapnik&marker=${loc.lat},${loc.lon}`;

    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  /** Adresse des Orts in einer Zeile – auch fuer den Kartenlink. */
  readonly mapLink = computed(() => {
    const loc = this.event()?.location;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return null;
    return `https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lon}#map=17/${loc.lat}/${loc.lon}`;
  });
}
