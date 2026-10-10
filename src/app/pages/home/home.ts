import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ApiImage, ContentApi } from '../../shared/content-api';
import { todayIso } from '../../shared/dates';
import { EventCard, PostCard, toEventCard, toPostCard } from '../../shared/post-view';
import { PUBLISHERS } from '../../shared/publishers';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  private readonly api = inject(ContentApi);

  /**
   * Die sechs neusten Beitraege. Sie kommen aus derselben Quelle wie die
   * Uebersicht unter /beitraege – gepflegt wird nur noch in der Datenbank.
   */
  readonly posts = signal<PostCard[]>([]);
  readonly loading = signal(true);

  /** Das Titelbild aus dem CMS. Null: die Platzhalterflaeche bleibt. */
  readonly heroImage = signal<ApiImage | null>(null);

  constructor() {
    this.api.home().subscribe({
      next: (home) => this.heroImage.set(home.heroImage),
      // Ohne Bild bleibt die Flaeche – kein Grund fuer eine Meldung.
      error: () => this.heroImage.set(null),
    });

    this.api.posts({ perPage: 6 }).subscribe({
      next: (res) => {
        this.posts.set(res.items.map(toPostCard));
        this.loading.set(false);
      },
      // Faellt die API aus, bleibt der Abschnitt leer statt die ganze
      // Startseite zu blockieren.
      error: () => this.loading.set(false),
    });

    this.api.events().subscribe({
      next: (events) => {
        const today = todayIso();
        this.events.set(
          events
            .map(toEventCard)
            .filter((event) => event.date >= today)
            .slice(0, 3),
        );
        this.eventsLoaded.set(true);
      },
      // Wie bei den Beitraegen: faellt die API aus, bleibt der Abschnitt
      // weg, statt eine Fehlermeldung auf die Startseite zu setzen.
      error: () => this.eventsLoaded.set(false),
    });
  }

  /**
   * Die naechsten drei Events. Die API liefert alle, das frueheste zuerst;
   * vergangene fallen hier weg – auf der Startseite zaehlt, was kommt.
   */
  readonly events = signal<EventCard[]>([]);
  /** Erst nach der Antwort zeigen – sonst blitzt "kein Event" kurz auf. */
  readonly eventsLoaded = signal(false);

  /** Der neuste Beitrag, gross dargestellt. */
  readonly featured = computed<PostCard | null>(() => this.posts()[0] ?? null);

  /** Alle weiteren – sie fuellen das Raster darunter. */
  readonly rest = computed<PostCard[]>(() => this.posts().slice(1));

  /**
   * Die Verlage aus der Kooperationsseite. Vorher standen hier Platzhalter
   * mit erfundenen Namen – gezeigt werden jetzt die echten Partner.
   */
  readonly publishers = PUBLISHERS;
}
