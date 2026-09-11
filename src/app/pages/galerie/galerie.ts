import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';

import { AlbumCard, AlbumView, toAlbumCard, toAlbumView } from '../../shared/album-view';
import { ContentApi } from '../../shared/content-api';

/** Filterwert der Kategorie-Leiste, der alle Alben durchlaesst. */
const ALL_CATEGORIES = 'Alle';

/** Offener Zustand der Lightbox: welches Album, welches Bild. */
interface Lightbox {
  album: AlbumView;
  index: number;
}

@Component({
  selector: 'app-galerie',
  imports: [],
  templateUrl: './galerie.html',
  styleUrl: './galerie.css',
})
export class Galerie {
  private readonly api = inject(ContentApi);

  readonly allCategories = ALL_CATEGORIES;

  readonly albums = signal<AlbumCard[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);

  readonly category = signal(ALL_CATEGORIES);

  /** null = Lightbox geschlossen. */
  readonly lightbox = signal<Lightbox | null>(null);
  /** Album, dessen Bilder gerade geholt werden. */
  readonly opening = signal<number | null>(null);

  private readonly lbPanel = viewChild<ElementRef<HTMLElement>>('lbPanel');

  constructor() {
    // Die geoeffnete Lightbox bekommt den Fokus. Sonst blieben die Pfeiltasten
    // wirkungslos, bis jemand hineinklickt – und die Tastatur liefe weiter
    // durch die Seite dahinter.
    effect(() => this.lbPanel()?.nativeElement.focus());

    this.api.albums().subscribe({
      next: (albums) => {
        this.albums.set(albums.map(toAlbumCard));
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Kategorien aus den geladenen Alben, nicht fest im Template. */
  readonly categories = computed(() => [
    ALL_CATEGORIES,
    ...[...new Set(this.albums().map((a) => a.cat))].sort((a, b) => a.localeCompare(b, 'de')),
  ]);

  readonly filtered = computed<AlbumCard[]>(() => {
    const cat = this.category();
    return this.albums().filter((a) => cat === ALL_CATEGORIES || a.cat === cat);
  });

  /** "1 Album" statt "1 Alben". */
  readonly countLabel = computed(() => {
    const n = this.filtered().length;
    return `${n} ${n === 1 ? 'Album' : 'Alben'}`;
  });

  /** Das gerade in der Lightbox gezeigte Bild. */
  readonly currentImage = computed(() => {
    const lb = this.lightbox();
    return lb ? lb.album.images.at(lb.index) ?? null : null;
  });

  /**
   * Oeffnet ein Album und holt dafuer seine Bilder nach.
   *
   * Die Uebersicht kennt nur Titelbild und Anzahl. Alles auf einmal zu laden
   * hiesse, bei jedem Seitenaufruf saemtliche Aufnahmen aller Alben zu
   * holen – fuer etwas, das die meisten Besucher nie oeffnen.
   */
  open(album: AlbumCard): void {
    if (this.opening() !== null) return;
    this.opening.set(album.id);

    this.api.album(album.slug).subscribe({
      next: (detail) => {
        this.opening.set(null);
        const view = toAlbumView(album, detail);
        // Ein Album ohne Bilder hat nichts zu zeigen – dann bleibt die
        // Lightbox zu, statt eine leere Flaeche aufzuziehen.
        if (view.images.length) this.lightbox.set({ album: view, index: 0 });
      },
      error: () => this.opening.set(null),
    });
  }

  close(): void {
    this.lightbox.set(null);
  }

  /** Blaettert zyklisch – nach dem letzten Bild kommt wieder das erste. */
  step(delta: number): void {
    this.lightbox.update((lb) => {
      if (!lb) return lb;
      const n = lb.album.images.length;
      return { ...lb, index: (lb.index + delta + n) % n };
    });
  }

  /**
   * Schliesst nur, wenn der Klick die Hintergrundflaeche selbst getroffen
   * hat. Das ersetzt ein stopPropagation auf dem Bildbereich – ein Klick
   * aufs Bild blubbert zwar bis hierher, kommt aber nicht von hier.
   */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  /** Tastatursteuerung der offenen Lightbox. */
  onKeydown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'Escape':
        this.close();
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.step(1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.step(-1);
        break;
    }
  }
}
