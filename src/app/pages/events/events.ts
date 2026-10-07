import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ContentApi } from '../../shared/content-api';
import { todayIso } from '../../shared/dates';
import { EventCard, toEventCard } from '../../shared/post-view';

/**
 * Uebersicht der Events.
 *
 * Ersetzt die eingebettete Liste von guidle.com: die Events werden im
 * eigenen CMS gepflegt, mit denselben Bausteinen wie die Beitraege, und hier
 * im Design der Seite gezeigt.
 *
 * Oben die kommenden, das naechste zuerst – das ist, was man hier sucht.
 * Darunter die vergangenen, das juengste zuerst, als Rueckblick. Getrennt
 * wird mit dem heutigen Datum des Besuchers, nicht dem des Servers: ein
 * Event bleibt bis zum Ende seines Tages ein kommendes.
 */
@Component({
  selector: 'app-events',
  imports: [RouterLink],
  templateUrl: './events.html',
  styleUrl: './events.css',
})
export class Events {
  private readonly api = inject(ContentApi);

  readonly events = signal<EventCard[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);

  /** Wie viele vergangene Events zu sehen sind, bevor man aufklappt. */
  private readonly pastLimit = 6;
  readonly showAllPast = signal(false);

  constructor() {
    this.api.events().subscribe({
      next: (events) => {
        this.events.set(events.map(toEventCard));
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Heute und spaeter, das naechste zuerst – so kommt es von der API. */
  readonly upcoming = computed(() => {
    const today = todayIso();
    return this.events().filter((event) => event.date >= today);
  });

  /** Vorbei, das juengste zuerst. */
  readonly past = computed(() => {
    const today = todayIso();
    return this.events()
      .filter((event) => event.date < today)
      .reverse();
  });

  readonly visiblePast = computed(() =>
    this.showAllPast() ? this.past() : this.past().slice(0, this.pastLimit),
  );

  readonly hiddenPast = computed(() => this.past().length - this.visiblePast().length);
}
