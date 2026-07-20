import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  ALL_CATEGORIES,
  BlogPost,
  formatPostDate,
  postCategories,
  sortedPosts,
} from './posts';

/** Ein Beitrag, aufbereitet fuer eine Karte der Galerie. */
interface PostCard extends BlogPost {
  /** Ausgeschriebenes Datum – die Karte formatiert selbst nichts. */
  dateLabel: string;
}

@Component({
  selector: 'app-beitraege',
  imports: [RouterLink],
  templateUrl: './beitraege.html',
  styleUrl: './beitraege.css',
})
export class Beitraege {
  readonly allCategories = ALL_CATEGORIES;

  /** Neuste zuerst – die Reihenfolge aendert sich beim Filtern nicht. */
  private readonly posts: PostCard[] = sortedPosts().map((p) => ({
    ...p,
    dateLabel: formatPostDate(p.date),
  }));

  readonly categories = postCategories(this.posts);

  readonly query = signal('');
  readonly category = signal(ALL_CATEGORIES);

  readonly filtered = computed<PostCard[]>(() => {
    const q = this.query().trim().toLowerCase();
    const cat = this.category();
    return this.posts.filter(
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
