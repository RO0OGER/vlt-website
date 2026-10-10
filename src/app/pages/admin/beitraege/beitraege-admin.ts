import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AdminApi, AdminPostRow, PostType, apiErrorText } from '../../../shared/admin-api';
import { formatDateLong, todayIso } from '../../../shared/dates';

/** Filter der Statusleiste. */
type StatusFilter = 'all' | 'published' | 'draft';

/** Worte und Adressen, die sich zwischen Beitraegen und Events unterscheiden. */
const WORDING: Record<
  PostType,
  { one: string; list: string; fresh: string; sub: string; admin: string; site: string }
> = {
  post: {
    one: 'Beitrag',
    list: 'Beiträge',
    fresh: 'Neuer Beitrag',
    sub: 'Erstellen, bearbeiten und veröffentlichen.',
    admin: '/admin/beitraege',
    site: '/beitraege',
  },
  event: {
    one: 'Event',
    list: 'Events',
    fresh: 'Neues Event',
    sub: 'Verbandsanlässe mit Datum, Ort, Preisen und Anmeldung.',
    admin: '/admin/events',
    site: '/events',
  },
};

/**
 * Beitragsuebersicht im CMS.
 *
 * Zeigt anders als die oeffentliche Liste auch die Entwuerfe – das ist der
 * eigentliche Zweck: sehen, was noch nicht draussen ist. Gefiltert und
 * gesucht wird im Browser, die Liste kommt in einem Stueck. Bei der
 * Groessenordnung dieses Verbands (einige Dutzend Beitraege) ist das
 * schneller als eine Anfrage je Tastendruck.
 *
 * Dieselbe Liste dient den Events (Route-Daten `type: 'event'`): gleiche
 * Tabelle, gleiche Arbeit, nur andere Worte und dazu Datum und Ort.
 */
@Component({
  selector: 'app-admin-beitraege',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './beitraege-admin.html',
  styleUrl: './beitraege-admin.css',
})
export class BeitraegeAdmin {
  private readonly api = inject(AdminApi);
  private readonly route = inject(ActivatedRoute);

  readonly kind: PostType = this.route.snapshot.data['type'] === 'event' ? 'event' : 'post';
  readonly isEvent = this.kind === 'event';
  readonly words = WORDING[this.kind];

  /** Fuer "vorbei" an Events, deren Datum hinter heute liegt. */
  readonly today = todayIso();

  readonly posts = signal<AdminPostRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  /** Beitrag, dessen Loeschung gerade bestaetigt werden soll. */
  readonly confirming = signal<AdminPostRow | null>(null);
  readonly deleting = signal(false);

  search = '';
  private readonly term = signal('');
  readonly status = signal<StatusFilter>('all');

  readonly counts = computed(() => {
    const all = this.posts();
    return {
      all: all.length,
      published: all.filter((post) => post.status === 'published').length,
      draft: all.filter((post) => post.status === 'draft').length,
    };
  });

  readonly visible = computed(() => {
    const term = this.term().trim().toLowerCase();
    const status = this.status();

    return this.posts().filter((post) => {
      if (status !== 'all' && post.status !== status) return false;
      if (term === '') return true;
      return (
        post.title.toLowerCase().includes(term) ||
        post.slug.toLowerCase().includes(term) ||
        (post.category ?? '').toLowerCase().includes(term) ||
        (post.location ?? '').toLowerCase().includes(term)
      );
    });
  });

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  constructor() {
    this.load();

    /*
     * Die Rueckfrage fokussieren, sobald sie erscheint. Ohne das bliebe die
     * Tastatur auf der Liste dahinter – man koennte weiterblaettern, waehrend
     * vorne eine Loeschfrage steht, und Escape kaeme nirgends an.
     */
    effect(() => this.panel()?.nativeElement.focus());
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.api.posts(this.kind).subscribe({
      next: (posts) => {
        this.posts.set(posts);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiErrorText(err, `Die ${this.words.list} liessen sich nicht laden.`));
        this.loading.set(false);
      },
    });
  }

  onSearch(value: string): void {
    this.term.set(value);
  }

  setStatus(status: StatusFilter): void {
    this.status.set(status);
  }

  /**
   * Loeschen ist endgueltig und laesst sich nicht rueckgaengig machen,
   * deshalb die Zwischenfrage. Ein window.confirm taete es auch, wuerde
   * aber nicht sagen, welcher Beitrag gemeint ist.
   */
  askDelete(post: AdminPostRow): void {
    this.confirming.set(post);
  }

  cancelDelete(): void {
    this.confirming.set(null);
  }

  /** Escape bricht die Rueckfrage ab – wie bei jedem Dialog. */
  onConfirmKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !this.deleting()) {
      this.cancelDelete();
    }
  }

  confirmDelete(): void {
    const post = this.confirming();
    if (!post || this.deleting()) return;

    this.deleting.set(true);
    this.api.remove(post.id, this.kind).subscribe({
      next: () => {
        this.posts.update((list) => list.filter((row) => row.id !== post.id));
        this.deleting.set(false);
        this.confirming.set(null);
      },
      error: (err) => {
        this.deleting.set(false);
        this.confirming.set(null);
        this.error.set(apiErrorText(err, `${this.words.one} liess sich nicht löschen.`));
      },
    });
  }

  dateLabel(date: string): string {
    return formatDateLong(date);
  }
}
