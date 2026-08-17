import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ContentApi } from '../../shared/content-api';
import { PostCard, toPostCard } from '../../shared/post-view';

/** Beschriftung des Knopfes, der alle Kategorien zeigt. */
const ALL_CATEGORIES = 'Alle';

@Component({
  selector: 'app-beitraege',
  imports: [RouterLink],
  templateUrl: './beitraege.html',
  styleUrl: './beitraege.css',
})
export class Beitraege {
  private readonly api = inject(ContentApi);

  readonly allCategories = ALL_CATEGORIES;

  readonly posts = signal<PostCard[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);

  readonly query = signal('');
  readonly category = signal(ALL_CATEGORIES);

  constructor() {
    /*
     * Alle Beitraege auf einmal holen und im Browser filtern. Bei rund
     * 60 Beitraegen ist das eine Anfrage statt einer je Tastendruck, und
     * Suche wie Kategoriewechsel reagieren ohne Wartezeit.
     */
    this.api.posts({ perPage: 100 }).subscribe({
      next: (res) => {
        this.posts.set(res.items.map(toPostCard));
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Kategorien aus den geladenen Beitraegen, nicht fest im Template. */
  readonly categories = computed(() => [
    ALL_CATEGORIES,
    ...[...new Set(this.posts().map((p) => p.cat))].sort((a, b) => a.localeCompare(b, 'de')),
  ]);

  readonly filtered = computed<PostCard[]>(() => {
    const q = this.query().trim().toLowerCase();
    const cat = this.category();
    return this.posts().filter(
      (p) =>
        (cat === ALL_CATEGORIES || p.cat === cat) &&
        (q === '' ||
          p.title.toLowerCase().includes(q) ||
          p.excerpt.toLowerCase().includes(q)),
    );
  });

  /** "1 Beitrag" statt "1 Beiträge". */
  readonly countLabel = computed(() => {
    const n = this.filtered().length;
    return `${n} ${n === 1 ? 'Beitrag' : 'Beiträge'} gefunden`;
  });

  onSearch(value: string): void {
    this.query.set(value);
  }
}
