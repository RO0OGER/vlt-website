import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, map, of, switchMap, tap } from 'rxjs';

import { ContentApi } from '../../../shared/content-api';
import { todayIso } from '../../../shared/dates';
import { PostSections } from '../../../shared/post-sections/post-sections';
import { PostView, SectionView, toPostView } from '../../../shared/post-view';
import { buildIcs } from './ics';

/**
 * Detailseite eines Verbandsanlasses.
 *
 * Aufgebaut wie frueher bei guidle, aber im Design der Seite: links, was
 * der Anlass ist (Bausteine aus dem CMS, Anmeldung, Einordnung), rechts die
 * Eckdaten zum Nachschlagen – Datum mit Kalendereintrag, Preise und Ort mit
 * Route. Auf dem Telefon stehen die Eckdaten zuerst, weil man dort meist
 * nachsieht, wann und wo.
 *
 * Einen Plan (Kartenausschnitt) gibt es bewusst nicht mehr. Wer hinfahren
 * will, bekommt die Adresse und "Route planen" – das oeffnet die Navigation
 * des Telefons, was ein Kartenausschnitt nicht kann.
 */
@Component({
  selector: 'app-event-detail',
  imports: [RouterLink, PostSections],
  templateUrl: './event-detail.html',
  styleUrl: './event-detail.css',
})
export class EventDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ContentApi);
  private readonly title = inject(Title);
  private readonly document = inject(DOCUMENT);

  readonly post = signal<PostView | null>(null);
  readonly loading = signal(true);

  constructor() {
    // Wie bei den Beitraegen: auf Adresswechsel hoeren, damit der Sprung
    // von einem Anlass zum naechsten den Inhalt wirklich tauscht.
    this.route.paramMap
      .pipe(
        map((params) => params.get('slug')),
        tap(() => {
          this.loading.set(true);
          this.post.set(null);
        }),
        switchMap((slug) => (slug ? this.api.event(slug).pipe(catchError(() => of(null))) : of(null))),
        takeUntilDestroyed(),
      )
      .subscribe((data) => {
        const view = data ? toPostView(data) : null;
        this.post.set(view?.event ? view : null);
        if (view) this.title.setTitle(`${view.title} – Verbandsanlässe`);
        this.loading.set(false);
      });
  }

  /** Vorbei? Dann keine Anmeldung und kein Kalendereintrag mehr. */
  readonly isPast = computed(() => {
    const ev = this.post()?.event;
    return ev ? ev.date < todayIso() : false;
  });

  /**
   * Die Bausteine aus dem CMS. Anders als beim Beitrag ohne Ersatz durch
   * den Anrisstext: der steht hier ohnehin als Einleitung darueber.
   */
  readonly sections = computed<SectionView[]>(() => this.post()?.sections ?? []);

  /** Gibt es etwas zur Einordnung? Sonst bleibt der Abschnitt weg. */
  readonly hasFacts = computed(() => {
    const p = this.post();
    const ev = p?.event;
    return !!ev && (p.categories.length > 0 || ev.audience.length > 0 || ev.admission !== '');
  });

  /** Laedt den Anlass als .ics-Datei – jedes Kalenderprogramm liest das. */
  addToCalendar(): void {
    const p = this.post();
    if (!p?.event) return;

    const ics = buildIcs({
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      url: `${this.document.location.origin}/events/${p.slug}`,
      event: p.event,
    });

    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const link = this.document.createElement('a');
    link.href = url;
    link.download = `${p.slug}.ics`;
    link.click();
    // Erst nach dem Klick freigeben, sonst bricht der Download ab.
    setTimeout(() => URL.revokeObjectURL(url));
  }
}
