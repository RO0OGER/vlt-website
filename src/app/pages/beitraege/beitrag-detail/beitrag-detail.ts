import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { PostSection, findPost, formatPostDate } from '../posts';

@Component({
  selector: 'app-beitrag-detail',
  imports: [RouterLink],
  templateUrl: './beitrag-detail.html',
  styleUrl: './beitrag-detail.css',
})
export class BeitragDetailPage {
  private readonly route = inject(ActivatedRoute);

  private readonly id = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id'))),
    { initialValue: null },
  );

  readonly post = computed(() => findPost(this.id()));

  /** Alle Kategorien fuer die Kopfzeile: die der Galerie zuerst. */
  readonly categories = computed<string[]>(() => {
    const p = this.post();
    return p ? [p.cat, ...(p.categories ?? [])] : [];
  });

  readonly dateLabel = computed(() => {
    const p = this.post();
    return p ? formatPostDate(p.date) : '';
  });

  /**
   * Ist der Beitrag noch nicht ausgeschrieben, steht wenigstens der
   * Anrisstext da – eine Detailseite ohne Inhalt waere eine Sackgasse.
   */
  readonly sections = computed<PostSection[]>(() => {
    const p = this.post();
    if (!p) return [];
    return p.sections?.length ? p.sections : [{ text: p.excerpt }];
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
  images(section: PostSection): PostSection['images'] {
    return (section.images ?? []).slice(0, 2);
  }
}
