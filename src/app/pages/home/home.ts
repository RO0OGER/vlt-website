import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ContentApi } from '../../shared/content-api';
import { PostCard, toPostCard } from '../../shared/post-view';

interface Sponsor {
  name: string;
  mark: string;
}

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

  constructor() {
    this.api.posts({ perPage: 6 }).subscribe({
      next: (res) => {
        this.posts.set(res.items.map(toPostCard));
        this.loading.set(false);
      },
      // Faellt die API aus, bleibt der Abschnitt leer statt die ganze
      // Startseite zu blockieren.
      error: () => this.loading.set(false),
    });
  }

  /** Der neuste Beitrag, gross dargestellt. */
  readonly featured = computed<PostCard | null>(() => this.posts()[0] ?? null);

  /** Alle weiteren – sie fuellen das Raster darunter. */
  readonly rest = computed<PostCard[]>(() => this.posts().slice(1));

  readonly sponsors: Sponsor[] = [
    { name: 'ECDL Schweiz', mark: 'ECDL' },
    { name: 'Klett Verlag', mark: 'Klett' },
    { name: 'Cornelsen', mark: 'C.' },
    { name: 'Helbling', mark: 'helbling' },
    { name: 'SAB', mark: 'SAB' },
    { name: 'hep verlag', mark: 'hep' },
    { name: 'Compendio', mark: 'Compendio' },
    { name: 'KV Bildungsgruppe', mark: 'KV' },
  ];
}
