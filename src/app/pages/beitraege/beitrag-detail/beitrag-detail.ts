import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, map, of, switchMap, tap } from 'rxjs';

import { ContentApi } from '../../../shared/content-api';
import { MapView } from '../../../shared/map/map-view';
import { PostView, SectionView, ViewImage, textSection, toPostView } from '../../../shared/post-view';

/**
 * Detailseite eines Beitrags – und eines Events.
 *
 * Beide bestehen aus denselben Bausteinen und sehen gleich aus. Ein Event
 * zeigt statt Autor und Veroeffentlichungsdatum seine eigenen Angaben:
 * wann und wo. Welches von beiden, steht in den Daten der Route.
 */
@Component({
  selector: 'app-beitrag-detail',
  imports: [RouterLink, NgTemplateOutlet, MapView],
  templateUrl: './beitrag-detail.html',
  styleUrl: './beitrag-detail.css',
})
export class BeitragDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ContentApi);
  private readonly title = inject(Title);

  readonly isEvent = this.route.snapshot.data['type'] === 'event';
  /** Ruecksprung und Brotkrume. */
  readonly listLink = this.isEvent ? '/events' : '/beitraege';
  readonly listName = this.isEvent ? 'Events' : 'Beiträge';
  readonly one = this.isEvent ? 'Event' : 'Beitrag';

  readonly post = signal<PostView | null>(null);
  readonly loading = signal(true);

  constructor() {
    /*
     * Auf Adresswechsel hoeren statt nur einmal zu lesen: wer von einem
     * Beitrag zum naechsten springt, bleibt auf derselben Komponente – ohne
     * switchMap bliebe der alte Inhalt stehen. switchMap bricht ausserdem
     * eine noch laufende Anfrage ab, wenn schon die naechste ansteht.
     */
    this.route.paramMap
      .pipe(
        map((params) => params.get('slug')),
        tap(() => {
          this.loading.set(true);
          this.post.set(null);
        }),
        // Ein Fehler (auch 404) wird zu null – die Vorlage zeigt dann
        // "nicht gefunden". Ohne catchError wuerde der Datenstrom enden
        // und ein spaeterer Wechsel des Beitrags nichts mehr laden.
        switchMap((slug) => {
          if (!slug) return of(null);
          const request = this.isEvent ? this.api.event(slug) : this.api.post(slug);
          return request.pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(),
      )
      .subscribe((data) => {
        const view = data ? toPostView(data) : null;
        this.post.set(view);
        // Titel erst hier setzen: beim Routing steht er noch nicht fest.
        if (view) this.title.setTitle(`${view.title} – Verband`);
        this.loading.set(false);
      });
  }

  /** Alle Kategorien fuer die Kopfzeile: die Hauptkategorie zuerst. */
  readonly categories = computed<string[]>(() => this.post()?.categories ?? []);

  readonly dateLabel = computed(() => this.post()?.dateLabel ?? '');

  /**
   * Ist der Beitrag noch nicht ausgeschrieben, steht wenigstens der
   * Anrisstext da – eine Detailseite ohne Inhalt waere eine Sackgasse.
   */
  readonly sections = computed<SectionView[]>(() => {
    const p = this.post();
    if (!p) return [];
    return p.sections.length ? p.sections : [textSection(p.excerpt)];
  });

  /** Initialen fuer das Autorenzeichen, z. B. "Sandra Meier" → "SM". */
  initials(author: string): string {
    return author
      .split(' ')
      .map((w) => w[0] ?? '')
      .join('')
      .slice(0, 2);
  }

  /** Das Layout kennt eine und zwei Bilder – mehr zeigt die Seite nicht. */
  images(section: { images: ViewImage[] }): ViewImage[] {
    return section.images.slice(0, 2);
  }
}
